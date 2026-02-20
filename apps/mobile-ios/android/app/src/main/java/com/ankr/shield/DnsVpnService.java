package com.ankr.shield;

import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.VpnService;
import android.os.ParcelFileDescriptor;
import android.telephony.PhoneStateListener;
import android.telephony.TelephonyManager;
import android.util.Log;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.nio.ByteBuffer;
import java.util.concurrent.atomic.AtomicBoolean;
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

    // Upstream DNS — Cloudflare (plain UDP, not DoH, for simplicity in v1)
    private static final String UPSTREAM_DNS = "1.1.1.1";
    private static final int    DNS_PORT     = 53;

    // Direct listener for React Native event bridge (replaces broadcast)
    public interface DnsEventListener {
        void onDnsEvent(String domain, boolean blocked, String category, String vendor);
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

    private ParcelFileDescriptor vpnInterface;
    private Thread               packetThread;
    private SQLiteDatabase       trackerDb;
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

                // Auto-expire timed pauses (manual bypass window)
                if (paused && pauseUntilMs > 0 && System.currentTimeMillis() >= pauseUntilMs) {
                    paused = false;
                    pauseUntilMs = 0;
                    Log.i(TAG, "AnkrShield DNS bypass expired — protection resumed");
                }

                TrackerMatch match = paused ? null : lookupTracker(domain);

                if (match != null) {
                    // BLOCKED — synthesise NXDOMAIN response
                    blockedCount.incrementAndGet();
                    lastBlockedDomain = domain;
                    byte[] response = buildNxdomainResponse(buf, udpPayloadOffset, udpPayloadLen,
                                                            ipHeaderLen, len);
                    if (response != null) out.write(response);

                    broadcastDnsEvent(domain, true, match.category, match.vendor);
                    Log.d(TAG, "BLOCKED " + domain + " [" + match.category + "]");

                } else {
                    // ALLOWED — forward to upstream resolver
                    allowedCount.incrementAndGet();
                    byte[] dnsQuery = new byte[udpPayloadLen];
                    System.arraycopy(buf, udpPayloadOffset, dnsQuery, 0, udpPayloadLen);

                    byte[] upstreamResponse = forwardDns(dnsQuery);
                    if (upstreamResponse != null) {
                        byte[] response = wrapDnsResponse(upstreamResponse, buf, ipHeaderLen, len);
                        if (response != null) out.write(response);
                    }

                    broadcastDnsEvent(domain, false, "clean", "");
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
     * Forward a DNS query to the upstream resolver (Cloudflare 1.1.1.1:53).
     * Uses a plain UDP socket with a 2-second timeout.
     */
    private static byte[] forwardDns(byte[] query) {
        try {
            DatagramSocket socket = new DatagramSocket();
            socket.setSoTimeout(2000);
            protectSocket(socket); // Tell Android this socket is NOT routed through our VPN

            InetAddress upstream = InetAddress.getByName(UPSTREAM_DNS);
            DatagramPacket req = new DatagramPacket(query, query.length, upstream, DNS_PORT);
            socket.send(req);

            byte[] respBuf = new byte[4096];
            DatagramPacket resp = new DatagramPacket(respBuf, respBuf.length);
            socket.receive(resp);
            socket.close();

            byte[] result = new byte[resp.getLength()];
            System.arraycopy(respBuf, 0, result, 0, resp.getLength());
            return result;

        } catch (Exception e) {
            Log.w(TAG, "Upstream DNS error: " + e.getMessage());
            return null;
        }
    }

    // forwardDns is static; use instance trampoline to call VpnService.protect()
    private static DnsVpnService instance;
    private static void protectSocket(DatagramSocket socket) {
        if (instance != null) instance.protect(socket);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
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

    private void broadcastDnsEvent(String domain, boolean blocked, String category, String vendor) {
        DnsEventListener listener = dnsEventListener;
        if (listener != null) {
            listener.onDnsEvent(domain, blocked, category, vendor);
        }
    }
}
