package com.ankr.shield;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.ContentResolver;
import android.database.Cursor;
import android.provider.ContactsContract;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

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
 * Monitors WhatsApp for two threat categories:
 *
 * 1. IMPERSONATION — When WhatsApp shows a contact name (in a notification or
 *    in the conversation list), this service checks the name against all
 *    contacts in the Android address book using Levenshtein distance.
 *    If a name is very similar (≥ 80%) but not identical to a known contact,
 *    and the underlying number is different, an impersonation alert is emitted.
 *
 *    Example: You have "Dad" saved. An unknown number messages you as "Dad!".
 *    The service fires an ImpersonationEvent.
 *
 * 2. CALL DETECTION — Detects when a WhatsApp voice/video call is active by
 *    monitoring WhatsApp window content for call-related UI elements.
 *    Emits WhatsAppCallEvent so the voice analysis module can start/stop.
 *
 * Nothing from message content is read or stored. Only displayed names
 * (visible in the UI) are compared against the local contacts list.
 * All processing is on-device — no network calls.
 *
 * Events emitted to React Native:
 *   'ImpersonationAlert' → { suspectName, similarTo, similarity, ts }
 *   'WhatsAppCallEvent'  → { active: boolean, ts }
 */
public class AnkrShieldAccessibilityService extends AccessibilityService {

    private static final String TAG = "AnkrShieldA11y";
    private static final String WHATSAPP_PKG = "com.whatsapp";
    private static final String WHATSAPP_B_PKG = "com.whatsapp.w4b";

    // Similarity threshold for impersonation detection (0.0–1.0)
    private static final double IMPERSONATION_THRESHOLD = 0.80;

    // Static ref to ReactContext — set by AccessibilityModule when registered
    public static volatile ReactApplicationContext reactContext = null;

    // Recent alerts — avoid duplicate notifications
    public static final List<ImpersonationAlert> alertHistory =
        new CopyOnWriteArrayList<>();

    // Recently seen names (dedup window)
    private final List<String> recentlyChecked = new ArrayList<>();

    // Current call state
    private boolean callActive = false;

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

    // ── Lifecycle ────────────────────────────────────────────────────────────

    @Override
    protected void onServiceConnected() {
        AccessibilityServiceInfo info = new AccessibilityServiceInfo();
        info.eventTypes =
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED |
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED |
            AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED;
        info.packageNames = new String[]{ WHATSAPP_PKG, WHATSAPP_B_PKG };
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;
        info.flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
                   | AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
        info.notificationTimeout = 100;
        setServiceInfo(info);
        Log.i(TAG, "Accessibility service connected");
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;

        // ── Call detection ────────────────────────────────────────────────
        if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                || event.getEventType() == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
            checkCallState(event);
        }

        // ── Impersonation detection ───────────────────────────────────────
        CharSequence pkg = event.getPackageName();
        if (WHATSAPP_PKG.contentEquals(pkg) || WHATSAPP_B_PKG.contentEquals(pkg)) {
            // Extract text from the event — this is displayed UI text only (not message content)
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

    /**
     * Detect WhatsApp call UI by looking for specific resource IDs and text patterns
     * that appear during WhatsApp voice/video calls.
     */
    private boolean isCallNodePresent(AccessibilityNodeInfo node) {
        if (node == null) return false;

        // Look for WhatsApp call screen indicators
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

        // Check content description for call-related terms
        CharSequence desc = node.getContentDescription();
        if (desc != null) {
            String d = desc.toString().toLowerCase();
            if (d.contains("end call") || d.contains("mute") || d.contains("speaker") ||
                d.contains("video call") || d.contains("voice call")) {
                return true;
            }
        }

        // Recurse into children
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
        // Skip if we just checked this name
        if (recentlyChecked.contains(displayedName)) return;
        recentlyChecked.add(displayedName);
        if (recentlyChecked.size() > 50) recentlyChecked.remove(0);

        // Skip very short names or numbers
        if (displayedName.length() < 2) return;
        if (displayedName.matches("^[+\\d\\s\\-()]+$")) return;

        // Skip if this name is already an exact match in contacts
        List<String> contactNames = getContactNames();
        for (String contact : contactNames) {
            if (contact.equalsIgnoreCase(displayedName)) return; // exact match — trusted
        }

        // Check similarity against all contacts
        for (String contact : contactNames) {
            double sim = similarity(displayedName.toLowerCase(), contact.toLowerCase());
            if (sim >= IMPERSONATION_THRESHOLD) {
                int pct = (int) Math.round(sim * 100);
                // Avoid duplicate alerts for same pair
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

    /**
     * Returns 0.0 (completely different) to 1.0 (identical).
     * Uses normalised Levenshtein distance.
     */
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
}
