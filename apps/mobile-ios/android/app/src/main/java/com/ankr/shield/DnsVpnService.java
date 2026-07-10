package com.ankr.shield;

import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.ConnectivityManager;
import android.net.VpnService;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.telephony.PhoneStateListener;
import android.telephony.TelephonyManager;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URL;
import java.nio.ByteBuffer;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * AnkrShield DNS VPN Service
 *
 * Creates a local loopback VPN that intercepts all DNS queries (UDP port 53).
 * Each DNS query is checked against the bundled tracker-db.sqlite:
 *   - Tracker domains → synthesised NXDOMAIN response (blocked locally)
 *   - Clean domains   → forwarded to upstream DoH resolver
 *
 * No network traffic other than DNS is routed through this VPN.
 * The tracker database is read-only, loaded from app assets at startup.
 *
 * Thread model:
 *   - Main thread: startService / stopService lifecycle
 *   - packetThread: reads raw IP packets from TUN fd, parses DNS, dispatches
 *   - resolverThread: forwards non-blocked queries to upstream, writes responses
 */
public class DnsVpnService extends VpnService {

    private static final String TAG = "DnsVpnService";

    // VPN interface address (our TUN's own IP — never the DNS destination)
    private static final String VPN_ADDRESS  = "10.111.111.1";
    // Virtual DNS server IP — DIFFERENT from VPN_ADDRESS so packets are not
    // consumed locally and actually appear in the TUN fd for us to read.
    private static final String VPN_DNS      = "10.111.111.2";
    private static final String VPN_ROUTE    = "10.111.111.2"; // route only the DNS server IP
    private static final int    VPN_PREFIX   = 32;

    // Upstream DNS-over-HTTPS resolvers (privacy-preserving, encrypted)
    private static final String DOH_PRIMARY  = "https://cloudflare-dns.com/dns-query";
    private static final String DOH_FALLBACK = "https://dns.google/dns-query";
    private static final int    DNS_PORT     = 53; // used to detect DNS packets from TUN fd

    // Direct listener for React Native event bridge (replaces broadcast)
    // app = requesting package name(s), "" when unattributable (Android <10,
    // kernel-owned flow, or uid lookup miss) — never guessed.
    public interface DnsEventListener {
        void onDnsEvent(String domain, String app, boolean blocked, String category, String vendor);
    }
    public static volatile DnsEventListener dnsEventListener;

    // Stats counters (read by DnsVpnModule.getStats())
    static final AtomicLong totalQueries  = new AtomicLong(0);
    static final AtomicLong blockedCount  = new AtomicLong(0);
    static final AtomicLong allowedCount  = new AtomicLong(0);
    static volatile String  lastBlockedDomain = "";
    static volatile boolean running = false;

    // Pause state — set by manual bypass or auto-detected phone call
    static volatile boolean paused       = false;
    static volatile long    pauseUntilMs = 0;  // 0 = indefinite (call-driven)


    // Split-tunnel bypass: package names in this set bypass DNS filtering (VPN excluded)
    static final Set<String> bypassPackages = Collections.synchronizedSet(new HashSet<>());
    // Passive mode: intercept + log but never block
    static volatile boolean passiveMode = false;

    private ParcelFileDescriptor vpnInterface;
    private Thread               packetThread;
    private SQLiteDatabase       trackerDb;
    private ConnectivityManager  connectivityManager;
    // uid → package name(s); lives for the service lifetime (uid reuse across
    // uninstall/reinstall is rare enough to accept until VPN restart)
    private final ConcurrentHashMap<Integer, String> uidAppCache = new ConcurrentHashMap<>();
    private final AtomicBoolean  shouldStop = new AtomicBoolean(false);

    private TelephonyManager  telephonyManager;
    private PhoneStateListener phoneStateListener;

    // ─── Lifecycle ───────────────────────────────────────────────────────────

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if ("STOP".equals(action)) {
            stopVpn();
            return START_NOT_STICKY;
        }
        if ("PAUSE".equals(action)) {
            long minutes = intent.getLongExtra("minutes", 5);
            paused = true;
            pauseUntilMs = System.currentTimeMillis() + minutes * 60_000L;
            Log.i(TAG, "AnkrShield DNS paused for " + minutes + " min (intentional browsing)");
            return START_STICKY;
        }
        if ("RESUME".equals(action)) {
            paused = false;
            pauseUntilMs = 0;
            Log.i(TAG, "AnkrShield DNS resumed manually");
            return START_STICKY;
        }
        if ("REBUILD".equals(action)) {
            // Rebuild VPN interface to apply new bypass list
            if (vpnInterface != null) {
                try {
                    vpnInterface.close();
                } catch (Exception ignored) {}
                vpnInterface = null;
            }
            try {
                establishVpnInterface();
                Log.i(TAG, "AnkrShield VPN rebuilt with " + bypassPackages.size() + " bypass apps");
            } catch (Exception e) {
                Log.e(TAG, "VPN rebuild failed", e);
            }
            return START_STICKY;
        }
        startVpn();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        unregisterCallListener();
        stopVpn();
    }

    // ─── Start / Stop ────────────────────────────────────────────────────────

    private void startVpn() {
        if (running) return;

        try {
            openTrackerDb();
            establishVpnInterface();
            shouldStop.set(false);
            running = true;

            packetThread = new Thread(this::runPacketLoop, "ankr-dns-vpn");
            packetThread.setDaemon(true);
            packetThread.start();

            Log.i(TAG, "AnkrShield DNS VPN started");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start VPN: " + e.getMessage(), e);
            stopVpn();
        }
    }

    private void stopVpn() {
        running = false;
        shouldStop.set(true);

        if (packetThread != null) {
            packetThread.interrupt();
            packetThread = null;
        }

        try {
            if (vpnInterface != null) {
                vpnInterface.close();
                vpnInterface = null;
            }
        } catch (Exception e) {
            Log.w(TAG, "Error closing VPN interface: " + e.getMessage());
        }

        if (trackerDb != null) {
            trackerDb.close();
            trackerDb = null;
        }

        stopSelf();
        Log.i(TAG, "AnkrShield DNS VPN stopped");
    }

    // ─── VPN Interface ───────────────────────────────────────────────────────

    private void establishVpnInterface() throws Exception {
        Builder builder = new Builder();
        builder.setSession("AnkrShield DNS")
               .addAddress(VPN_ADDRESS, 24)   // /24 subnet covering both .1 and .2
               .addRoute(VPN_ROUTE, VPN_PREFIX) // only route the virtual DNS IP through TUN
               .addDnsServer(VPN_DNS)          // apps will send DNS to .2 → goes through TUN
               .setBlocking(true)
               .setMtu(1500)
               .addDisallowedApplication(getPackageName()); // Don't route our own traffic

        // Apply per-app bypass: excluded apps bypass DNS interception entirely
        for (String pkg : bypassPackages) {
            try { builder.addDisallowedApplication(pkg); } catch (Exception ignored) {}
        }

        vpnInterface = builder.establish();
        if (vpnInterface == null) {
            throw new IllegalStateException("VPN interface could not be established");
        }
    }

    // ─── Tracker database ────────────────────────────────────────────────────

    private void openTrackerDb() {
        // Copy tracker-db.sqlite from assets to the app's files dir on first run
        File dbFile = new File(getFilesDir(), "tracker-db.sqlite");

        try {
            // Always refresh from assets to pick up APK updates
            try (InputStream in = getAssets().open("tracker-db.sqlite");
                 FileOutputStream out = new FileOutputStream(dbFile)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not copy tracker-db from assets: " + e.getMessage());
        }

        if (dbFile.exists()) {
            trackerDb = SQLiteDatabase.openDatabase(
                dbFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
            Log.i(TAG, "tracker-db loaded: " + dbFile.length() + " bytes");
        } else {
            Log.w(TAG, "tracker-db.sqlite not found — all domains will be allowed");
        }
    }

    /**
     * Returns the category of the domain if it is a known tracker, or null if clean.
     * Checks the exact domain first, then each parent domain for subdomain matching.
     * E.g. "pixel.facebook.com" → checks "pixel.facebook.com", "facebook.com"
     */
    private TrackerMatch lookupTracker(String domain) {
        if (trackerDb == null || domain == null || domain.isEmpty()) return null;

        String lower = domain.toLowerCase();
        String[] parts = lower.split("\\.");

        // Check exact + parent domains (stop at 2-part TLD, e.g. "google.com")
        for (int i = 0; i < parts.length - 1; i++) {
            StringBuilder sb = new StringBuilder();
            for (int j = i; j < parts.length; j++) {
                if (j > i) sb.append('.');
                sb.append(parts[j]);
            }
            String candidate = sb.toString();

            try (Cursor c = trackerDb.rawQuery(
                    "SELECT category, vendor, risk_level FROM trackers WHERE domain = ? LIMIT 1",
                    new String[]{ candidate })) {
                if (c.moveToFirst()) {
                    return new TrackerMatch(
                        candidate,
                        c.getString(0),
                        c.isNull(1) ? "" : c.getString(1),
                        c.getInt(2)
                    );
                }
            } catch (Exception e) {
                Log.w(TAG, "DB lookup error: " + e.getMessage());
            }
        }
        return null;
    }

    static class TrackerMatch {
        final String domain, category, vendor;
        final int riskLevel;
        TrackerMatch(String d, String c, String v, int r) {
            domain = d; category = c; vendor = v; riskLevel = r;
        }
    }

    // ─── Per-app attribution (scope-transparency R1) ─────────────────────────

    /**
     * Resolve which app owns the UDP flow this DNS query arrived on.
     * Asks the kernel via ConnectivityManager.getConnectionOwnerUid (API 29+,
     * permitted to the active VPN app), then maps uid → package name(s).
     * The query's socket is still open awaiting our response, so the flow is
     * live in the kernel at the moment we ask.
     *
     * Returns "" when attribution is impossible — Android <10, kernel/root
     * flow, or uid with no packages. Shared UIDs list every member package
     * joined with "," (we name the honest set rather than pick one).
     */
    private String resolveAppForFlow(byte[] buf, int ipHeaderLen) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || connectivityManager == null) {
            return "";
        }
        try {
            InetAddress src = InetAddress.getByAddress(
                new byte[]{ buf[12], buf[13], buf[14], buf[15] });
            InetAddress dst = InetAddress.getByAddress(
                new byte[]{ buf[16], buf[17], buf[18], buf[19] });
            int srcPort = ((buf[ipHeaderLen]     & 0xFF) << 8) | (buf[ipHeaderLen + 1] & 0xFF);
            int dstPort = ((buf[ipHeaderLen + 2] & 0xFF) << 8) | (buf[ipHeaderLen + 3] & 0xFF);

            int uid = connectivityManager.getConnectionOwnerUid(
                17 /* IPPROTO_UDP */,
                new InetSocketAddress(src, srcPort),
                new InetSocketAddress(dst, dstPort));
            if (uid <= 0) return ""; // INVALID_UID (-1) or root — unattributable

            String cached = uidAppCache.get(uid);
            if (cached != null) return cached;

            String[] pkgs = getPackageManager().getPackagesForUid(uid);
            String app;
            if (pkgs == null || pkgs.length == 0) {
                app = "";
            } else {
                StringBuilder sb = new StringBuilder(pkgs[0]);
                for (int i = 1; i < pkgs.length; i++) sb.append(',').append(pkgs[i]);
                app = sb.toString();
            }
            uidAppCache.put(uid, app);
            return app;
        } catch (Exception e) {
            return ""; // SecurityException on exotic ROMs etc. — null, not a crash
        }
    }

    // ─── Packet loop ─────────────────────────────────────────────────────────

    private void runPacketLoop() {
        byte[] buf = new byte[32767];
        ByteBuffer packet = ByteBuffer.wrap(buf);

        try (FileInputStream  in  = new FileInputStream(vpnInterface.getFileDescriptor());
             FileOutputStream out = new FileOutputStream(vpnInterface.getFileDescriptor())) {

            while (!shouldStop.get()) {
                packet.clear();
                int len = in.read(buf);
                if (len <= 0) continue;

                packet.limit(len);

                // Parse IP version from the first nibble
                int version = (buf[0] >> 4) & 0xF;
                if (version != 4) {
                    // IPv6 — not handled in v1, pass through
                    out.write(buf, 0, len);
                    continue;
                }

                // IPv4 header: protocol is byte 9
                int protocol = buf[9] & 0xFF;
                if (protocol != 17) {
                    // Not UDP — pass through
                    out.write(buf, 0, len);
                    continue;
                }

                // IPv4 header length (IHL field, lower nibble of byte 0) * 4
                int ipHeaderLen = (buf[0] & 0x0F) * 4;
                if (len < ipHeaderLen + 8) {
                    out.write(buf, 0, len);
                    continue;
                }

                // UDP header: dst port is at ipHeaderLen + 2 (2 bytes, big-endian)
                int dstPort = ((buf[ipHeaderLen + 2] & 0xFF) << 8) | (buf[ipHeaderLen + 3] & 0xFF);
                if (dstPort != DNS_PORT) {
                    // Not DNS — pass through
                    out.write(buf, 0, len);
                    continue;
                }

                // UDP payload starts at ipHeaderLen + 8
                int udpPayloadOffset = ipHeaderLen + 8;
                int udpPayloadLen    = len - udpPayloadOffset;
                if (udpPayloadLen < 12) {
                    // DNS header is 12 bytes minimum
                    out.write(buf, 0, len);
                    continue;
                }

                // Extract the queried domain from the DNS message
                String domain = parseDnsQueryName(buf, udpPayloadOffset + 12, len);
                if (domain == null) {
                    out.write(buf, 0, len);
                    continue;
                }

                totalQueries.incrementAndGet();

                // Attribute the query to its owning app while the flow is live
                String app = resolveAppForFlow(buf, ipHeaderLen);

                // Auto-expire timed pauses (manual bypass window)
                if (paused && pauseUntilMs > 0 && System.currentTimeMillis() >= pauseUntilMs) {
                    paused = false;
                    pauseUntilMs = 0;
                    Log.i(TAG, "AnkrShield DNS bypass expired — protection resumed");
                }

                // In passive mode, detect but never block (advisory only)
                TrackerMatch match = paused ? null : lookupTracker(domain);
                if (passiveMode && match != null) {
                    // report as advisory, then pass through
                    broadcastDnsEvent(domain, app, false, match.category + ":advisory", match.vendor);
                    match = null;
                }

                if (match != null) {
                    // BLOCKED — synthesise NXDOMAIN response
                    blockedCount.incrementAndGet();
                    lastBlockedDomain = domain;
                    byte[] response = buildNxdomainResponse(buf, udpPayloadOffset, udpPayloadLen,
                                                            ipHeaderLen, len);
                    if (response != null) out.write(response);

                    broadcastDnsEvent(domain, app, true, match.category, match.vendor);
                    Log.d(TAG, "BLOCKED " + domain + " [" + match.category + "]"
                            + (app.isEmpty() ? "" : " app=" + app));

                } else {
                    // ALLOWED — forward to upstream resolver
                    allowedCount.incrementAndGet();
                    byte[] dnsQuery = new byte[udpPayloadLen];
                    System.arraycopy(buf, udpPayloadOffset, dnsQuery, 0, udpPayloadLen);

                    byte[] upstreamResponse = forwardDnsDoH(dnsQuery);
                    if (upstreamResponse != null) {
                        byte[] response = wrapDnsResponse(upstreamResponse, buf, ipHeaderLen, len);
                        if (response != null) out.write(response);
                    }

                    broadcastDnsEvent(domain, app, false, "clean", "");
                }
            }

        } catch (Exception e) {
            if (!shouldStop.get()) {
                Log.e(TAG, "Packet loop error: " + e.getMessage(), e);
            }
        }
    }

    // ─── DNS parsing helpers ─────────────────────────────────────────────────

    /**
     * Parse the domain name from a DNS question section.
     * DNS names are length-prefixed labels, terminated with a 0 byte.
     * E.g. \x06google\x03com\x00 → "google.com"
     */
    private static String parseDnsQueryName(byte[] buf, int offset, int len) {
        StringBuilder name = new StringBuilder();
        int pos = offset;
        int iterations = 0;

        while (pos < len && iterations++ < 128) {
            int labelLen = buf[pos] & 0xFF;
            if (labelLen == 0) break;

            // DNS compression pointer: top two bits set (0xC0)
            if ((labelLen & 0xC0) == 0xC0) return null; // Compressed — skip

            pos++;
            if (pos + labelLen > len) return null;

            if (name.length() > 0) name.append('.');
            try {
                name.append(new String(buf, pos, labelLen, "ASCII"));
            } catch (Exception e) {
                return null;
            }
            pos += labelLen;
        }

        return name.length() > 0 ? name.toString() : null;
    }

    /**
     * Build a minimal NXDOMAIN (rcode=3) DNS response for the given query packet.
     * Re-uses the transaction ID from the original query.
     * Returns a complete IP+UDP+DNS byte array ready to write to the TUN fd.
     */
    private static byte[] buildNxdomainResponse(byte[] origPacket, int dnsOffset, int dnsLen,
                                                 int ipHdrLen, int totalLen) {
        if (dnsLen < 12) return null;

        // Clone the original DNS question section
        byte[] response = new byte[dnsLen];
        System.arraycopy(origPacket, dnsOffset, response, 0, dnsLen);

        // Set QR=1 (response), keep OPCODE, set RA=1, RCODE=3 (NXDOMAIN)
        // Flags are at offset 2-3 of the DNS message
        response[2] = (byte) 0x81; // QR=1, OPCODE=0, AA=0, TC=0, RD=1
        response[3] = (byte) 0x83; // RA=1, Z=0, RCODE=3 (NXDOMAIN)
        // Zero out answer/authority/additional counts
        response[6] = 0; response[7] = 0;
        response[8] = 0; response[9] = 0;
        response[10] = 0; response[11] = 0;

        return wrapDnsInIpUdp(response, origPacket, ipHdrLen, totalLen);
    }

    /**
     * Forward a DNS query using DNS-over-HTTPS (DoH).
     * Tries Cloudflare first, falls back to Google if unavailable.
     * Our package is excluded from the VPN via addDisallowedApplication(), so
     * these HTTPS connections go directly to the internet — no protect() needed.
     */
    private static byte[] forwardDnsDoH(byte[] query) {
        byte[] result = dohPost(DOH_PRIMARY, query);
        if (result != null) return result;
        // Fallback to Google DoH
        result = dohPost(DOH_FALLBACK, query);
        if (result == null) Log.w(TAG, "Both DoH resolvers failed");
        return result;
    }

    private static byte[] dohPost(String endpoint, byte[] dnsWireQuery) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(endpoint).openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setDoInput(true);
            conn.setConnectTimeout(3000);
            conn.setReadTimeout(3000);
            conn.setRequestProperty("Content-Type", "application/dns-message");
            conn.setRequestProperty("Accept", "application/dns-message");
            conn.setRequestProperty("Content-Length", String.valueOf(dnsWireQuery.length));
            conn.setUseCaches(false);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(dnsWireQuery);
                os.flush();
            }

            int code = conn.getResponseCode();
            if (code != 200) {
                Log.w(TAG, "DoH " + endpoint + " returned HTTP " + code);
                return null;
            }

            try (InputStream is = conn.getInputStream()) {
                return readFully(is);
            }
        } catch (Exception e) {
            Log.w(TAG, "DoH error (" + endpoint + "): " + e.getMessage());
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static byte[] readFully(InputStream is) throws java.io.IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[4096];
        int n;
        while ((n = is.read(chunk)) != -1) buf.write(chunk, 0, n);
        return buf.toByteArray();
    }

    private static DnsVpnService instance;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        connectivityManager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        registerCallListener();
    }

    @SuppressWarnings("deprecation")
    private void registerCallListener() {
        try {
            telephonyManager = (TelephonyManager) getSystemService(TELEPHONY_SERVICE);
            if (telephonyManager == null) return;
            phoneStateListener = new PhoneStateListener() {
                @Override
                public void onCallStateChanged(int state, String phoneNumber) {
                    boolean callActive = (state == TelephonyManager.CALL_STATE_OFFHOOK
                                      || state == TelephonyManager.CALL_STATE_RINGING);
                    if (callActive && !paused) {
                        paused = true;
                        pauseUntilMs = 0; // 0 = call-driven (no expiry timer)
                        Log.i(TAG, "AnkrShield DNS paused — phone call active");
                    } else if (!callActive && paused && pauseUntilMs == 0) {
                        // Only auto-resume if the pause was triggered by a call,
                        // not by a manual timed bypass (those have pauseUntilMs > 0).
                        paused = false;
                        Log.i(TAG, "AnkrShield DNS resumed — phone call ended");
                    }
                }
            };
            telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE);
        } catch (Exception e) {
            Log.w(TAG, "Could not register call listener: " + e.getMessage());
        }
    }

    @SuppressWarnings("deprecation")
    private void unregisterCallListener() {
        try {
            if (telephonyManager != null && phoneStateListener != null) {
                telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_NONE);
            }
        } catch (Exception ignored) {}
    }

    /**
     * Wrap a DNS response byte array back into an IP+UDP packet
     * using the original query's src/dst addresses swapped.
     */
    private static byte[] wrapDnsResponse(byte[] dnsResp, byte[] origPacket,
                                           int ipHdrLen, int origLen) {
        return wrapDnsInIpUdp(dnsResp, origPacket, ipHdrLen, origLen);
    }

    /**
     * Build an IP+UDP packet carrying the given DNS payload.
     * The source/dest are swapped from the original query.
     */
    private static byte[] wrapDnsInIpUdp(byte[] dnsPayload, byte[] origPacket,
                                          int ipHdrLen, int origLen) {
        int totalLen = ipHdrLen + 8 + dnsPayload.length;
        byte[] out = new byte[totalLen];

        // Copy original IP header, then patch it
        System.arraycopy(origPacket, 0, out, 0, ipHdrLen);

        // Swap source and destination IPs (bytes 12-15 and 16-19)
        System.arraycopy(origPacket, 12, out, 16, 4); // orig src → new dst
        System.arraycopy(origPacket, 16, out, 12, 4); // orig dst → new src

        // Fix total length
        out[2] = (byte) ((totalLen >> 8) & 0xFF);
        out[3] = (byte) (totalLen & 0xFF);

        // Clear checksum (let kernel recalculate or set to 0)
        out[10] = 0; out[11] = 0;

        // UDP header
        int udpLen = 8 + dnsPayload.length;
        // Swap src/dst ports
        out[ipHdrLen]     = origPacket[ipHdrLen + 2]; // orig dst port → new src port
        out[ipHdrLen + 1] = origPacket[ipHdrLen + 3];
        out[ipHdrLen + 2] = origPacket[ipHdrLen];     // orig src port → new dst port
        out[ipHdrLen + 3] = origPacket[ipHdrLen + 1];
        // UDP length
        out[ipHdrLen + 4] = (byte) ((udpLen >> 8) & 0xFF);
        out[ipHdrLen + 5] = (byte) (udpLen & 0xFF);
        // UDP checksum — set to 0 (optional for IPv4)
        out[ipHdrLen + 6] = 0;
        out[ipHdrLen + 7] = 0;

        // DNS payload
        System.arraycopy(dnsPayload, 0, out, ipHdrLen + 8, dnsPayload.length);

        return out;
    }

    // ─── React Native event bridge ───────────────────────────────────────────

    private void broadcastDnsEvent(String domain, String app, boolean blocked,
                                    String category, String vendor) {
        DnsEventListener listener = dnsEventListener;
        if (listener != null) {
            listener.onDnsEvent(domain, app, blocked, category, vendor);
        }
    }
}
