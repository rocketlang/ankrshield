package com.ankr.shield;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.security.MessageDigest;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A10 — WhatsApp OTP Guard
 *
 * BroadcastReceiver for android.provider.Telephony.SMS_RECEIVED.
 * Intercepts incoming SMS, detects WhatsApp re-registration OTPs that arrive
 * while the user has NOT initiated a re-registration, and fires a CRITICAL alert.
 *
 * Attack chain defended:
 *   Attacker calls victim → tricks them into sharing the 6-digit SMS OTP
 *   → attacker re-registers WhatsApp on their device → takes over the account
 *
 * Detection logic:
 *   1. Sender matches known WhatsApp sender IDs (alpha "WhatsApp" or numeric shortcodes)
 *   2. Body matches WhatsApp OTP pattern (6 digits in standard WA copy)
 *   3. User has NOT been in a re-registration grace window (5 min) in the last 5 min
 *
 * Manifest requires: RECEIVE_SMS, READ_PHONE_STATE (for originating address)
 */
public class OtpGuardReceiver extends BroadcastReceiver {

    private static final String TAG = "OtpGuardReceiver";
    private static final String PREFS = "ankr_otp_guard";
    private static final String KEY_ENABLED = "otp_guard_enabled";
    private static final String KEY_GRACE_UNTIL = "grace_window_until_ms";

    /** Grace window after user deliberately initiates WA re-registration (5 minutes). */
    public static final long GRACE_WINDOW_MS = 5 * 60 * 1000L;

    // WhatsApp numeric sender patterns — US/UK/India verification shortcodes
    private static final Pattern WA_SENDER = Pattern.compile(
        "^(whatsapp|\\+1[\\s-]?\\d{3}[\\s-]?\\d{3}[\\s-]?\\d{4}|" +
        "\\+44[\\s-]?\\d{10}|\\+52[\\s-]?\\d{10}|\\+91[\\s-]?\\d{10}|" +
        "\\+55[\\s-]?\\d{10,11}|\\+62[\\s-]?\\d{9,11}|\\+49[\\s-]?\\d{10})$",
        Pattern.CASE_INSENSITIVE
    );

    // WhatsApp OTP body patterns (all known variants)
    private static final Pattern WA_OTP_BODY = Pattern.compile(
        "(\\d{6})\\s+is your WhatsApp(?:\\s+Business)?\\s+(?:verification\\s+)?code|" +
        "Your WhatsApp(?:\\s+Business)?\\s+(?:verification\\s+)?code(?:\\s+is)?:?\\s+(\\d{6})|" +
        "(?:Don't share this code with anyone|Do not share this code).*?(\\d{6})|" +
        "<#>\\s*(\\d{6})\\s",
        Pattern.CASE_INSENSITIVE
    );

    /** In-memory list of intercepted OTP events — read by OtpGuardModule. */
    public static final CopyOnWriteArrayList<OtpEvent> eventHistory = new CopyOnWriteArrayList<>();

    public static class OtpEvent {
        public final String senderHash;   // SHA-256 of sender — never store raw number
        public final String senderDisplay; // last 4 digits only, e.g. "****7821"
        public final String otpCode;       // the 6-digit code
        public final long ts;
        public final boolean wasInGrace;  // true = user was in re-registration flow (false alarm)

        OtpEvent(String senderHash, String senderDisplay, String otpCode, boolean wasInGrace) {
            this.senderHash = senderHash;
            this.senderDisplay = senderDisplay;
            this.otpCode = otpCode;
            this.ts = System.currentTimeMillis();
            this.wasInGrace = wasInGrace;
        }
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!"android.provider.Telephony.SMS_RECEIVED".equals(intent.getAction())) return;

        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(KEY_ENABLED, true)) return; // user disabled guard

        Bundle bundle = intent.getExtras();
        if (bundle == null) return;

        Object[] pdus = (Object[]) bundle.get("pdus");
        if (pdus == null || pdus.length == 0) return;

        String format = bundle.getString("format");

        for (Object pdu : pdus) {
            SmsMessage sms = SmsMessage.createFromPdu((byte[]) pdu, format);
            if (sms == null) continue;

            String sender = sms.getDisplayOriginatingAddress();
            if (sender == null) continue;

            String body = sms.getDisplayMessageBody();
            if (body == null) continue;

            if (!isWhatsAppSender(sender)) continue;

            String otp = extractOtp(body);
            if (otp == null) continue;

            // We have a WhatsApp OTP SMS
            long graceUntil = prefs.getLong(KEY_GRACE_UNTIL, 0L);
            boolean inGrace = System.currentTimeMillis() < graceUntil;

            String senderHash = sha256(sender);
            String senderDisplay = maskSender(sender);

            OtpEvent event = new OtpEvent(senderHash, senderDisplay, otp, inGrace);
            if (eventHistory.size() >= 50) eventHistory.remove(0);
            eventHistory.add(event);

            if (!inGrace) {
                // CRITICAL — hijack attempt
                fireHijackAlert(ctx, senderDisplay, otp);
            }

            // Always emit to JS so the screen can update
            emitEvent(ctx, event);
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private boolean isWhatsAppSender(String sender) {
        return WA_SENDER.matcher(sender.trim()).matches();
    }

    private String extractOtp(String body) {
        Matcher m = WA_OTP_BODY.matcher(body);
        if (!m.find()) return null;
        for (int i = 1; i <= m.groupCount(); i++) {
            if (m.group(i) != null) return m.group(i).trim();
        }
        return null;
    }

    private String maskSender(String sender) {
        String digits = sender.replaceAll("[^0-9]", "");
        if (digits.length() < 4) return "****";
        return "****" + digits.substring(digits.length() - 4);
    }

    private String sha256(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(input.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return "unknown";
        }
    }

    private void fireHijackAlert(Context ctx, String senderDisplay, String otp) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        // Full-screen intent — opens MainActivity so user sees the in-app CRITICAL overlay
        Intent openApp = new Intent(ctx, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        openApp.putExtra("deeplink", "ankrshield://otp-guard");
        int flags = PendingIntent.FLAG_UPDATE_CURRENT |
            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent fullScreenIntent = PendingIntent.getActivity(ctx, 0, openApp, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx,
                NotificationChannels.CHANNEL_OTP_GUARD)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("WARNING: WhatsApp Hijack Attempt")
            .setContentText("Someone is trying to steal your WhatsApp! DO NOT share the 6-digit code.")
            .setStyle(new NotificationCompat.BigTextStyle()
                .bigText(
                    "An OTP from WhatsApp arrived from " + senderDisplay + " but you are not " +
                    "registering a new device. This is a hijack attempt.\n\n" +
                    "DO NOT share code " + otp + " with ANYONE — not even \"WhatsApp support\"."
                )
            )
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(false)
            .setOngoing(true)
            .setFullScreenIntent(fullScreenIntent, true)
            .setDefaults(Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE)
            .setContentIntent(fullScreenIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "I'm Safe — Dismiss",
                PendingIntent.getBroadcast(ctx, 1,
                    new Intent(ctx, OtpGuardDismissReceiver.class), flags))
            .addAction(android.R.drawable.ic_dialog_info, "Report to CERT-In",
                PendingIntent.getActivity(ctx, 2,
                    new Intent(Intent.ACTION_VIEW,
                        android.net.Uri.parse("https://cybercrime.gov.in")),
                    flags));

        nm.notify(NotificationChannels.NOTIF_ID_OTP_GUARD, builder.build());
        Log.w(TAG, "WhatsApp OTP hijack attempt detected from " + senderDisplay);
    }

    private void emitEvent(Context ctx, OtpEvent event) {
        try {
            if (OtpGuardModule.reactContext == null) return;
            if (!OtpGuardModule.reactContext.hasActiveCatalystInstance()) return;
            WritableMap m = Arguments.createMap();
            m.putString("senderDisplay", event.senderDisplay);
            m.putString("senderHash", event.senderHash);
            m.putString("otpCode", event.otpCode);
            m.putDouble("ts", event.ts);
            m.putBoolean("wasInGrace", event.wasInGrace);
            m.putBoolean("isHijackAttempt", !event.wasInGrace);
            OtpGuardModule.reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("OtpGuardEvent", m);
        } catch (Exception e) {
            Log.e(TAG, "Failed to emit OtpGuardEvent", e);
        }
    }
}
