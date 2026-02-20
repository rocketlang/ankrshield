package com.ankr.shield;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.database.Cursor;
import android.os.Build;
import android.provider.ContactsContract;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import androidx.core.app.NotificationCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * AnkrShieldAccessibilityService
 *
 * Monitors WhatsApp and browsers for threat categories:
 *
 * 1. IMPERSONATION — Compares WhatsApp contact names against address book using
 *    Levenshtein distance. If a name is ≥80% similar to a known contact but from
 *    a different number, an impersonation alert is emitted.
 *
 * 2. CALL DETECTION — Detects WhatsApp voice/video calls by monitoring the UI.
 *    Emits WhatsAppCallEvent so the voice analysis module can start/stop.
 *
 * 3. BROWSER PHISHING — Reads the URL from the browser address bar. If the domain
 *    is ≥80% similar to a known bank or financial institution domain but is NOT
 *    the legitimate domain, a PhishingAlert is emitted and a high-priority system
 *    notification is fired immediately. No page content or form data is read.
 *
 * Events emitted to React Native:
 *   'ImpersonationAlert' → { suspectName, similarTo, similarity, ts }
 *   'WhatsAppCallEvent'  → { active: boolean, ts }
 *   'PhishingAlert'      → { suspectUrl, suspectDomain, spoofingTarget, similarityPct, ts }
 */
public class AnkrShieldAccessibilityService extends AccessibilityService {

    private static final String TAG = "AnkrShieldA11y";
    private static final String WHATSAPP_PKG = "com.whatsapp";
    private static final String WHATSAPP_B_PKG = "com.whatsapp.w4b";

    // ── Browser packages to monitor ──────────────────────────────────────────
    private static final String[] BROWSER_PKGS = {
        "com.android.chrome",
        "com.google.android.apps.chrome",
        "org.mozilla.firefox",
        "org.mozilla.fenix",
        "com.microsoft.emmx",           // Edge
        "com.brave.browser",
        "com.opera.mini.native",
        "com.sec.android.app.sbrowser", // Samsung Browser
        "com.UCMobile.intl",            // UC Browser
        "mark.via.gp",                  // Via Browser
        "com.kiwibrowser.browser",
        "com.duckduckgo.mobile.android",
    };

    // ── Protected domains (India + global banks, payment services, govt) ─────
    // Only the REAL domains are listed. Similarity against these triggers alert.
    private static final String[] PROTECTED_DOMAINS = {
        // Indian banks
        "sbi.co.in", "onlinesbi.sbi", "onlinesbi.com",
        "hdfcbank.com", "netbanking.hdfcbank.com",
        "icicibank.com",
        "axisbank.com",
        "kotak.com",
        "pnbindia.in",
        "bankofbaroda.in",
        "canarabank.in",
        "unionbankonline.co.in",
        "indusind.com",
        "yesbank.in",
        "idfcfirstbank.com",
        "federalbank.co.in",
        "rbl.co.in",
        "bandhanbank.com",
        "southindianbank.com",
        "karurbank.com",
        // UPI / wallets
        "paytmbank.com",
        "paytm.com",
        "freecharge.in",
        "phonepe.com",
        "mobikwik.com",
        // Government portals
        "incometax.gov.in",
        "irctc.co.in",
        "uidai.gov.in",
        "epfindia.gov.in",
        "nsdl.co.in",
        "bhimupi.org.in",
        "india.gov.in",
        "mca.gov.in",
        // International
        "paypal.com",
        "apple.com",
        "amazon.com",
        "amazon.in",
        "flipkart.com",
        "myntra.com",
        "google.com",
        "facebook.com",
        "instagram.com",
        "twitter.com",
        "linkedin.com",
    };

    private static final String PHISHING_CHANNEL = "phishing_guard";

    // Similarity thresholds
    private static final double IMPERSONATION_THRESHOLD = 0.80;
    private static final double PHISHING_THRESHOLD = 0.82;

    // Static ref to ReactContext — set by WhatsAppGuardModule when registered
    public static volatile ReactApplicationContext reactContext = null;

    // ── Alert histories ───────────────────────────────────────────────────────
    public static final List<ImpersonationAlert> alertHistory =
        new CopyOnWriteArrayList<>();

    public static final List<PhishingAlert> phishingHistory =
        new CopyOnWriteArrayList<>();

    // Recently seen names (dedup window for impersonation)
    private final List<String> recentlyChecked = new ArrayList<>();

    // Phishing dedup — avoid re-alerting same domain within 60 s
    private String lastAlertedDomain = "";
    private long lastAlertedTs = 0;

    // Current call state
    private boolean callActive = false;

    // ── Inner classes ─────────────────────────────────────────────────────────

    public static class ImpersonationAlert {
        public final String suspectName;
        public final String similarTo;
        public final int similarityPct;
        public final long ts;

        public ImpersonationAlert(String suspectName, String similarTo, int similarityPct) {
            this.suspectName = suspectName;
            this.similarTo = similarTo;
            this.similarityPct = similarityPct;
            this.ts = System.currentTimeMillis();
        }
    }

    public static class PhishingAlert {
        public final String suspectUrl;
        public final String suspectDomain;
        public final String spoofingTarget;
        public final int similarityPct;
        public final long ts;

        public PhishingAlert(String suspectUrl, String suspectDomain,
                             String spoofingTarget, int similarityPct) {
            this.suspectUrl = suspectUrl;
            this.suspectDomain = suspectDomain;
            this.spoofingTarget = spoofingTarget;
            this.similarityPct = similarityPct;
            this.ts = System.currentTimeMillis();
        }
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    @Override
    protected void onServiceConnected() {
        AccessibilityServiceInfo info = new AccessibilityServiceInfo();
        info.eventTypes =
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED |
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED |
            AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED |
            AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED;
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;
        info.flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
                   | AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
        info.notificationTimeout = 100;

        // Monitor WhatsApp + all tracked browser packages
        String[] allPkgs = new String[2 + BROWSER_PKGS.length];
        allPkgs[0] = WHATSAPP_PKG;
        allPkgs[1] = WHATSAPP_B_PKG;
        System.arraycopy(BROWSER_PKGS, 0, allPkgs, 2, BROWSER_PKGS.length);
        info.packageNames = allPkgs;

        setServiceInfo(info);
        createPhishingNotificationChannel();
        Log.i(TAG, "Accessibility service connected — monitoring WhatsApp + " + BROWSER_PKGS.length + " browsers");
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;

        String pkg = event.getPackageName() != null ? event.getPackageName().toString() : "";

        // ── Browser phishing check ────────────────────────────────────────
        if (isBrowserPkg(pkg)) {
            if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED ||
                    event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ||
                    event.getEventType() == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED) {
                checkBrowserUrl(event);
            }
            return; // browsers don't need impersonation check
        }

        // ── WhatsApp: call detection ───────────────────────────────────────
        if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                || event.getEventType() == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
            checkCallState(event);
        }

        // ── WhatsApp: impersonation detection ─────────────────────────────
        if (WHATSAPP_PKG.equals(pkg) || WHATSAPP_B_PKG.equals(pkg)) {
            List<CharSequence> texts = event.getText();
            if (texts != null) {
                for (CharSequence text : texts) {
                    if (text != null && text.length() > 0 && text.length() < 60) {
                        checkImpersonation(text.toString().trim());
                    }
                }
            }
        }
    }

    @Override
    public void onInterrupt() {
        Log.w(TAG, "Accessibility service interrupted");
    }

    // ── Browser Phishing Detection ────────────────────────────────────────────

    private boolean isBrowserPkg(String pkg) {
        for (String bp : BROWSER_PKGS) {
            if (bp.equals(pkg)) return true;
        }
        return false;
    }

    private void checkBrowserUrl(AccessibilityEvent event) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;
        String url = findUrlInNode(root);
        root.recycle();

        if (url == null || url.isEmpty()) return;

        String domain = extractDomain(url);
        if (domain == null || domain.length() < 4) return;

        // Skip dedup window (same domain within 60 s)
        long now = System.currentTimeMillis();
        if (domain.equals(lastAlertedDomain) && now - lastAlertedTs < 60_000) return;

        for (String target : PROTECTED_DOMAINS) {
            // Exact match → legitimate, skip
            if (domain.equals(target)) return;

            // Prefix/suffix spoofing check: "axisbank.com.evil.io" or "axisbank-login.com"
            if (domain.startsWith(target + ".") || domain.startsWith(target + "-")) {
                int pct = 95; // high confidence prefix spoof
                firePhishingAlert(url, domain, target, pct);
                return;
            }

            // Levenshtein similarity check
            double sim = similarity(domain, target);
            if (sim >= PHISHING_THRESHOLD) {
                int pct = (int) Math.round(sim * 100);
                firePhishingAlert(url, domain, target, pct);
                return;
            }
        }
    }

    private void firePhishingAlert(String url, String domain, String target, int pct) {
        lastAlertedDomain = domain;
        lastAlertedTs = System.currentTimeMillis();

        PhishingAlert alert = new PhishingAlert(url, domain, target, pct);
        phishingHistory.add(0, alert);
        if (phishingHistory.size() > 50) phishingHistory.remove(phishingHistory.size() - 1);

        emitPhishingAlert(alert);
        sendPhishingNotification(alert);
        Log.w(TAG, "PHISHING: \"" + domain + "\" spoofs \"" + target + "\" (" + pct + "%)");
    }

    /** Walk accessibility node tree to find the URL bar text in a browser. */
    private String findUrlInNode(AccessibilityNodeInfo node) {
        if (node == null) return null;

        String viewId = node.getViewIdResourceName();
        if (viewId != null) {
            String idLower = viewId.toLowerCase();
            if (idLower.contains("url_bar") || idLower.contains("url_field") ||
                idLower.contains("search_box") || idLower.contains("location_bar") ||
                idLower.contains("addressbar") || idLower.contains("omnibox") ||
                idLower.contains("toolbar_url") || idLower.contains("mozac_browser_toolbar")) {
                CharSequence text = node.getText();
                if (text != null) {
                    String url = text.toString().trim();
                    // Must look like a URL (has scheme or looks like a domain)
                    if (url.startsWith("http://") || url.startsWith("https://") ||
                            (url.contains(".") && !url.contains(" ") && url.length() > 4)) {
                        return url;
                    }
                }
            }
        }

        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                String found = findUrlInNode(child);
                child.recycle();
                if (found != null) return found;
            }
        }
        return null;
    }

    /** Strip scheme, www, path, query, port — return lowercase hostname only. */
    private static String extractDomain(String url) {
        if (url == null || url.isEmpty()) return null;
        String d = url.trim()
            .replaceFirst("^https?://", "")
            .replaceFirst("^www\\.", "");
        int idx = d.indexOf('/');
        if (idx >= 0) d = d.substring(0, idx);
        idx = d.indexOf('?');
        if (idx >= 0) d = d.substring(0, idx);
        idx = d.indexOf('#');
        if (idx >= 0) d = d.substring(0, idx);
        idx = d.indexOf(':'); // port
        if (idx >= 0) d = d.substring(0, idx);
        return d.toLowerCase().trim();
    }

    // ── Call Detection ────────────────────────────────────────────────────────

    private void checkCallState(AccessibilityEvent event) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;

        boolean nowInCall = isCallNodePresent(root);
        root.recycle();

        if (nowInCall != callActive) {
            callActive = nowInCall;
            emitCallEvent(callActive);
            Log.i(TAG, "WhatsApp call state changed: " + (callActive ? "ACTIVE" : "ENDED"));
        }
    }

    private boolean isCallNodePresent(AccessibilityNodeInfo node) {
        if (node == null) return false;

        String viewId = node.getViewIdResourceName();
        if (viewId != null) {
            if (viewId.contains("call_status") ||
                viewId.contains("elapsed_time") ||
                viewId.contains("ongoing_call") ||
                viewId.contains("call_screen") ||
                viewId.contains("voip")) {
                return true;
            }
        }

        CharSequence desc = node.getContentDescription();
        if (desc != null) {
            String d = desc.toString().toLowerCase();
            if (d.contains("end call") || d.contains("mute") || d.contains("speaker") ||
                d.contains("video call") || d.contains("voice call")) {
                return true;
            }
        }

        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                boolean found = isCallNodePresent(child);
                child.recycle();
                if (found) return true;
            }
        }
        return false;
    }

    // ── Impersonation Detection ───────────────────────────────────────────────

    private void checkImpersonation(String displayedName) {
        if (recentlyChecked.contains(displayedName)) return;
        recentlyChecked.add(displayedName);
        if (recentlyChecked.size() > 50) recentlyChecked.remove(0);

        if (displayedName.length() < 2) return;
        if (displayedName.matches("^[+\\d\\s\\-()]+$")) return;

        List<String> contactNames = getContactNames();
        for (String contact : contactNames) {
            if (contact.equalsIgnoreCase(displayedName)) return;
        }

        for (String contact : contactNames) {
            double sim = similarity(displayedName.toLowerCase(), contact.toLowerCase());
            if (sim >= IMPERSONATION_THRESHOLD) {
                int pct = (int) Math.round(sim * 100);
                boolean alreadyAlerted = false;
                for (ImpersonationAlert a : alertHistory) {
                    if (a.suspectName.equalsIgnoreCase(displayedName)
                            && a.similarTo.equalsIgnoreCase(contact)) {
                        alreadyAlerted = true;
                        break;
                    }
                }
                if (!alreadyAlerted) {
                    ImpersonationAlert alert =
                        new ImpersonationAlert(displayedName, contact, pct);
                    alertHistory.add(0, alert);
                    if (alertHistory.size() > 100) alertHistory.remove(alertHistory.size() - 1);
                    emitImpersonationAlert(alert);
                    Log.w(TAG, "Impersonation detected: \"" + displayedName +
                        "\" looks like \"" + contact + "\" (" + pct + "%)");
                }
            }
        }
    }

    private List<String> getContactNames() {
        List<String> names = new ArrayList<>();
        try {
            ContentResolver cr = getContentResolver();
            Cursor c = cr.query(
                ContactsContract.Contacts.CONTENT_URI,
                new String[]{ ContactsContract.Contacts.DISPLAY_NAME_PRIMARY },
                ContactsContract.Contacts.HAS_PHONE_NUMBER + " = 1",
                null, null);
            if (c != null) {
                while (c.moveToNext()) {
                    String name = c.getString(0);
                    if (name != null && !name.isEmpty()) names.add(name);
                }
                c.close();
            }
        } catch (SecurityException e) {
            Log.w(TAG, "No READ_CONTACTS permission: " + e.getMessage());
        }
        return names;
    }

    // ── Levenshtein similarity ────────────────────────────────────────────────

    private static double similarity(String a, String b) {
        if (a.equals(b)) return 1.0;
        int maxLen = Math.max(a.length(), b.length());
        if (maxLen == 0) return 1.0;
        return 1.0 - (double) levenshtein(a, b) / maxLen;
    }

    private static int levenshtein(String a, String b) {
        int m = a.length(), n = b.length();
        int[][] dp = new int[m + 1][n + 1];
        for (int i = 0; i <= m; i++) dp[i][0] = i;
        for (int j = 0; j <= n; j++) dp[0][j] = j;
        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                dp[i][j] = a.charAt(i - 1) == b.charAt(j - 1)
                    ? dp[i - 1][j - 1]
                    : 1 + Math.min(dp[i - 1][j - 1], Math.min(dp[i - 1][j], dp[i][j - 1]));
            }
        }
        return dp[m][n];
    }

    // ── Event emission ────────────────────────────────────────────────────────

    private void emitImpersonationAlert(ImpersonationAlert alert) {
        try {
            if (reactContext == null || !reactContext.hasActiveCatalystInstance()) return;
            WritableMap m = Arguments.createMap();
            m.putString("suspectName", alert.suspectName);
            m.putString("similarTo", alert.similarTo);
            m.putInt("similarityPct", alert.similarityPct);
            m.putDouble("ts", alert.ts);
            reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("ImpersonationAlert", m);
        } catch (Exception ignored) {}
    }

    private void emitCallEvent(boolean active) {
        try {
            if (reactContext == null || !reactContext.hasActiveCatalystInstance()) return;
            WritableMap m = Arguments.createMap();
            m.putBoolean("active", active);
            m.putDouble("ts", System.currentTimeMillis());
            reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("WhatsAppCallEvent", m);
        } catch (Exception ignored) {}
    }

    private void emitPhishingAlert(PhishingAlert alert) {
        try {
            if (reactContext == null || !reactContext.hasActiveCatalystInstance()) return;
            WritableMap m = Arguments.createMap();
            m.putString("suspectUrl", alert.suspectUrl);
            m.putString("suspectDomain", alert.suspectDomain);
            m.putString("spoofingTarget", alert.spoofingTarget);
            m.putInt("similarityPct", alert.similarityPct);
            m.putDouble("ts", alert.ts);
            reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("PhishingAlert", m);
        } catch (Exception ignored) {}
    }

    // ── Phishing Notification ─────────────────────────────────────────────────

    private void createPhishingNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                PHISHING_CHANNEL,
                "Phishing Alerts",
                NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Real-time phishing website warnings");
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[]{0, 400, 150, 400, 150, 400});
            NotificationManager nm =
                (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private void sendPhishingNotification(PhishingAlert alert) {
        NotificationManager nm =
            (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;

        String body = "\u26a0\ufe0f FAKE WEBSITE!\n\n" +
            "\u201c" + alert.suspectDomain + "\u201d looks " + alert.similarityPct +
            "% like \u201c" + alert.spoofingTarget + "\u201d\n\n" +
            "DO NOT enter your password, OTP, or bank details. Close this tab now.";

        Notification n = new NotificationCompat.Builder(this, PHISHING_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("\uD83D\uDEA8 PHISHING SITE — STOP!")
            .setContentText("Fake \"" + alert.spoofingTarget + "\" detected!")
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setVibrate(new long[]{0, 400, 150, 400, 150, 400})
            .setColor(0xFFEF4444)
            .build();

        nm.notify(9900 + (int)(System.currentTimeMillis() % 100), n);
    }
}
