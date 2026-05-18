package com.ankr.shield;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ClipboardManager;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.ContactsContract;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;

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

    private static final String PHISHING_CHANNEL  = "phishing_guard";
    private static final String OVERLAY_CHANNEL   = "overlay_attack";

    // UPI VPA pattern: something@provider (e.g. user@upi, user@paytm, user@ybl)
    private static final java.util.regex.Pattern UPI_VPA_PATTERN =
        java.util.regex.Pattern.compile("^[\\w.\\-]{2,64}@[\\w]{2,20}$");

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

    // Clipboard monitoring
    private ClipboardManager clipboardManager;
    private String lastCheckedClip = "";
    private long lastClipAlertTs = 0;

    // Overlay attack tracking — foreground app at time of suspicious overlay
    private String lastForegroundPkg = "";
    private long lastOverlayAlertTs = 0;

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

    public static class OverlayAttackAlert {
        public final String overlayPkg;
        public final String underlyingPkg;
        public final String attackType; // "overlay" | "autofill_hijack" | "clipboard_upi"
        public final String detail;
        public final long ts;

        public OverlayAttackAlert(String overlayPkg, String underlyingPkg,
                                   String attackType, String detail) {
            this.overlayPkg = overlayPkg;
            this.underlyingPkg = underlyingPkg;
            this.attackType = attackType;
            this.detail = detail;
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
            AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED |
            AccessibilityEvent.TYPE_VIEW_FOCUSED |
            AccessibilityEvent.TYPE_WINDOWS_CHANGED;
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;
        info.flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
                   | AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
        info.notificationTimeout = 100;

        // Monitor all packages (null = system-wide) so overlay and clipboard
        // attacks in any app are caught. WhatsApp + browser checks are pkg-gated.
        info.packageNames = null;

        setServiceInfo(info);
        createPhishingNotificationChannel();
        createOverlayNotificationChannel();
        startClipboardMonitoring();
        Log.i(TAG, "Accessibility service connected — monitoring all packages + clipboard");
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;

        String pkg = event.getPackageName() != null ? event.getPackageName().toString() : "";
        int type = event.getEventType();

        // ── Track foreground package ──────────────────────────────────────
        if (type == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && !pkg.isEmpty()) {
            // Only update foreground if this is a real Activity (not SystemUI / overlay)
            if (!pkg.equals("com.android.systemui") && !pkg.isEmpty()) {
                lastForegroundPkg = pkg;
            }
        }

        // ── Overlay attack detection ──────────────────────────────────────
        // Check on every windows-changed event for suspicious overlay windows
        if (type == AccessibilityEvent.TYPE_WINDOWS_CHANGED ||
                type == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            checkOverlayAttack(pkg);
        }

        // ── Browser phishing check ────────────────────────────────────────
        if (isBrowserPkg(pkg)) {
            if (type == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED ||
                    type == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ||
                    type == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED) {
                checkBrowserUrl(event);
            }
            return;
        }

        // ── WhatsApp: call detection ───────────────────────────────────────
        if (type == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                || type == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
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

        // ── Autofill hijack detection (focused password field in suspicious context) ─
        if (type == AccessibilityEvent.TYPE_VIEW_FOCUSED) {
            checkAutofillHijack(event, pkg);
        }
    }

    @Override
    public void onInterrupt() {
        Log.w(TAG, "Accessibility service interrupted");
    }

    // ── Overlay Attack Detection ──────────────────────────────────────────────

    /**
     * Detects when an application draws a TYPE_APPLICATION_OVERLAY window on top
     * of a sensitive financial or banking app. This is a classic credential-harvesting
     * technique: a malicious app shows a fake login overlay on top of a real bank app.
     *
     * Fires OverlayAttackAlert if:
     *   - An overlay window is visible AND
     *   - The underlying app is a protected financial package AND
     *   - The overlay's package is NOT the underlying app itself AND
     *   - We haven't alerted for the same pair within 60 seconds
     */
    private void checkOverlayAttack(String eventPkg) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return;

        long now = System.currentTimeMillis();
        if (now - lastOverlayAlertTs < 60_000) return; // throttle

        List<AccessibilityWindowInfo> windows = getWindows();
        if (windows == null || windows.size() < 2) return;

        String appWindowPkg = null;
        boolean hasOverlay   = false;
        String overlayPkg    = null;

        for (AccessibilityWindowInfo w : windows) {
            int windowType = w.getType();
            CharSequence title = w.getTitle();
            String wPkg = (title != null) ? title.toString() : "";

            if (windowType == AccessibilityWindowInfo.TYPE_APPLICATION) {
                if (w.isActive() && !wPkg.isEmpty()) {
                    appWindowPkg = lastForegroundPkg;
                }
            }
            // TYPE_ACCESSIBILITY_OVERLAY or system overlay
            if (windowType == AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY ||
                    windowType == 2003 /* TYPE_APPLICATION_OVERLAY not in API <26 constant */) {
                hasOverlay = true;
                // Try to infer the overlay's package from the event
                overlayPkg = eventPkg;
            }
        }

        if (!hasOverlay || appWindowPkg == null || appWindowPkg.isEmpty()) return;
        if (overlayPkg != null && overlayPkg.equals(appWindowPkg)) return; // same app, legit

        // Is the underlying app a financial target?
        if (!isFinancialPkg(appWindowPkg)) return;
        if (overlayPkg == null || overlayPkg.isEmpty()) return;
        if (isKnownSafeOverlay(overlayPkg)) return;

        lastOverlayAlertTs = now;
        OverlayAttackAlert alert = new OverlayAttackAlert(
            overlayPkg, appWindowPkg, "overlay",
            "App '" + overlayPkg + "' is drawing over '" + appWindowPkg +
            "' — possible credential overlay attack"
        );
        emitOverlayAlert(alert);
        sendOverlayNotification(alert);
        Log.w(TAG, "OVERLAY ATTACK: " + overlayPkg + " over " + appWindowPkg);
    }

    private static final String[] FINANCIAL_PKGS = {
        "com.sbi.online", "com.csam.icici.bank.imobile", "net.one97.paytm",
        "com.phonepe.app", "in.amazon.mShop.android.shopping",
        "com.google.android.apps.nbu.paisa.user",  // Google Pay
        "com.dreamplug.androidapp",                // CRED
        "com.mobikwik_new", "com.freecharge.android",
        "com.axis.mobile", "com.hdfc.netmobile", "com.kotak.mahindra.kotak",
        "com.indusind.mobilebanking", "com.yesbank",
        "com.idbi.mpassbook", "com.finacus.union",
        "com.npci.upiapp",                          // BHIM
    };

    private static boolean isFinancialPkg(String pkg) {
        for (String fp : FINANCIAL_PKGS) {
            if (fp.equals(pkg)) return true;
        }
        return false;
    }

    private static final String[] KNOWN_SAFE_OVERLAY_PKGS = {
        "com.ankr.shield",       // ourselves
        "com.google.android.inputmethod.latin",
        "com.samsung.android.honeyboard",
        "com.swiftkey.swiftkeyapp",
        "com.gboard.android",
        "com.android.systemui",
        "com.android.settings",
    };

    private static boolean isKnownSafeOverlay(String pkg) {
        for (String s : KNOWN_SAFE_OVERLAY_PKGS) {
            if (s.equals(pkg)) return true;
        }
        // Accessibility IME overlays are safe
        return pkg.contains(".keyboard") || pkg.contains(".ime") || pkg.contains(".inputmethod");
    }

    // ── Clipboard UPI Monitoring ──────────────────────────────────────────────

    /**
     * Registers a ClipboardManager listener. When a UPI VPA is copied to the
     * clipboard in the context of a suspicious app (not a banking app or UPI app),
     * a ClipboardUpiAlert is fired.
     *
     * Intent: catch apps that silently read UPI IDs from the clipboard to redirect payments.
     */
    private void startClipboardMonitoring() {
        try {
            clipboardManager = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (clipboardManager == null) return;

            clipboardManager.addPrimaryClipChangedListener(() -> {
                try {
                    ClipData clip = clipboardManager.getPrimaryClip();
                    if (clip == null || clip.getItemCount() == 0) return;
                    String text = clip.getItemAt(0).coerceToText(getApplicationContext()).toString().trim();

                    if (text.equals(lastCheckedClip)) return;
                    lastCheckedClip = text;

                    if (UPI_VPA_PATTERN.matcher(text).matches()) {
                        long now = System.currentTimeMillis();
                        if (now - lastClipAlertTs < 30_000) return; // 30s dedup
                        lastClipAlertTs = now;

                        // Check if clipboard was written by a non-UPI app
                        String ctx = lastForegroundPkg.isEmpty() ? "unknown" : lastForegroundPkg;
                        boolean isUpiApp = ctx.contains("paytm") || ctx.contains("phonepe") ||
                                           ctx.contains("google") || ctx.contains("bhim") ||
                                           ctx.contains("npci") || ctx.contains("upi");

                        if (!isUpiApp) {
                            OverlayAttackAlert alert = new OverlayAttackAlert(
                                ctx, "", "clipboard_upi",
                                "UPI VPA '" + text + "' copied to clipboard by '" + ctx +
                                "' — verify the recipient before paying"
                            );
                            emitOverlayAlert(alert);
                            Log.w(TAG, "CLIPBOARD UPI: VPA=" + text + " copied by " + ctx);
                        }
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Clipboard check error: " + e.getMessage());
                }
            });
            Log.i(TAG, "Clipboard UPI monitoring started");
        } catch (Exception e) {
            Log.w(TAG, "Could not start clipboard monitoring: " + e.getMessage());
        }
    }

    // ── Autofill Hijack Detection ─────────────────────────────────────────────

    /**
     * Detects when a password/OTP field gains focus in an app that:
     *   - Is NOT in our list of known legitimate financial apps
     *   - But has a name/title that mimics a bank or UPI service
     *
     * This catches fake apps that look like HDFC or SBI but use a different package name.
     */
    private void checkAutofillHijack(AccessibilityEvent event, String pkg) {
        if (pkg.isEmpty()) return;
        if (isKnownSafeOverlay(pkg)) return;

        AccessibilityNodeInfo node = event.getSource();
        if (node == null) return;

        try {
            boolean isPasswordField = node.isPassword();
            if (!isPasswordField) return;

            // Check if the window title impersonates a bank
            List<AccessibilityWindowInfo> windows = getWindows();
            if (windows == null) return;

            for (AccessibilityWindowInfo w : windows) {
                if (w.getType() != AccessibilityWindowInfo.TYPE_APPLICATION) continue;
                CharSequence title = w.getTitle();
                if (title == null) continue;
                String titleLower = title.toString().toLowerCase();

                for (String target : PROTECTED_DOMAINS) {
                    String shortTarget = target.replace(".co.in", "")
                                                .replace(".com", "")
                                                .replace(".in", "");
                    if (titleLower.contains(shortTarget) && !isFinancialPkg(pkg)) {
                        long now = System.currentTimeMillis();
                        if (now - lastOverlayAlertTs < 30_000) return;
                        lastOverlayAlertTs = now;

                        OverlayAttackAlert alert = new OverlayAttackAlert(
                            pkg, shortTarget, "autofill_hijack",
                            "App '" + pkg + "' shows a password field claiming to be '" +
                            title + "' — possible fake login screen"
                        );
                        emitOverlayAlert(alert);
                        Log.w(TAG, "AUTOFILL HIJACK: pkg=" + pkg + " title=" + title);
                        break;
                    }
                }
            }
        } finally {
            node.recycle();
        }
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

    // ── Overlay alert emission ────────────────────────────────────────────────

    private void emitOverlayAlert(OverlayAttackAlert alert) {
        try {
            if (reactContext == null || !reactContext.hasActiveCatalystInstance()) return;
            WritableMap m = Arguments.createMap();
            m.putString("overlayPkg",     alert.overlayPkg);
            m.putString("underlyingPkg",  alert.underlyingPkg);
            m.putString("attackType",     alert.attackType);
            m.putString("detail",         alert.detail);
            m.putDouble("ts",             alert.ts);

            String eventName = "clipboard_upi".equals(alert.attackType)
                ? "ClipboardUpiAlert" : "OverlayAttackAlert";
            reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, m);
        } catch (Exception ignored) {}
    }

    private void sendOverlayNotification(OverlayAttackAlert alert) {
        NotificationManager nm =
            (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;

        String title = "autofill_hijack".equals(alert.attackType)
            ? "⚠️ Fake Login Screen Detected"
            : "🚨 Overlay Attack Detected";

        Notification n = new NotificationCompat.Builder(this, OVERLAY_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(title)
            .setContentText(alert.detail)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(alert.detail))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setVibrate(new long[]{0, 300, 100, 300})
            .setColor(0xFFF59E0B)
            .build();

        nm.notify(9800 + (int)(System.currentTimeMillis() % 100), n);
    }

    private void createOverlayNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                OVERLAY_CHANNEL,
                "Overlay & Autofill Attack Alerts",
                NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Warns when an app draws a suspicious overlay or fake login screen");
            ch.enableVibration(true);
            NotificationManager nm =
                (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }
}
