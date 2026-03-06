package com.ankr.shield;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

/**
 * Centralised notification channel registration.
 * Called once from MainApplication.onCreate() so all channels are guaranteed
 * to exist before any service starts — prevents silent notification failures
 * on Android 8+ (API 26+).
 */
public class NotificationChannels {

    public static final String CHANNEL_SHIELD_STATUS  = "xshield_protection";
    public static final String CHANNEL_WHATSAPP_GUARD = "whatsapp_guard";
    public static final String CHANNEL_RANSOMWARE     = "ransomware_watcher";
    public static final String CHANNEL_PHISHING       = "phishing_guard";
    // A10 — WhatsApp OTP hijack (CRITICAL, MAX + bypass DnD)
    public static final String CHANNEL_OTP_GUARD      = "ankrshield_otp_guard";
    // A11 — Linked devices
    public static final String CHANNEL_LINKED_DEVICES = "ankrshield_linked_devices";
    // A12 — SIM swap
    public static final String CHANNEL_SIM_SWAP       = "ankrshield_sim_swap";

    // Notification IDs
    public static final int NOTIF_ID_OTP_GUARD            = 7010;
    public static final int NOTIF_ID_LINKED_DEVICE        = 7011;
    public static final int NOTIF_ID_LINKED_DEVICE_REMIND = 7012;
    public static final int NOTIF_ID_SIM_SWAP             = 7013;

    /** Register all AnkrShield notification channels. Safe to call multiple times. */
    public static void register(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        // Persistent shield status — low priority, no sound
        nm.createNotificationChannel(make(
            CHANNEL_SHIELD_STATUS,
            "xShield Protection",
            "Shows xShield active protection status",
            NotificationManager.IMPORTANCE_LOW,
            false
        ));

        // WhatsApp Guard file threat alerts — high priority + sound
        nm.createNotificationChannel(make(
            CHANNEL_WHATSAPP_GUARD,
            "WhatsApp Guard",
            "Alerts when a dangerous file is detected in WhatsApp",
            NotificationManager.IMPORTANCE_HIGH,
            true
        ));

        // Ransomware detection alerts — high priority + sound
        nm.createNotificationChannel(make(
            CHANNEL_RANSOMWARE,
            "Ransomware Watcher",
            "Alerts when ransomware activity is detected on the device",
            NotificationManager.IMPORTANCE_HIGH,
            true
        ));

        // Safe Browsing phishing alerts — max priority
        NotificationChannel phishing = make(
            CHANNEL_PHISHING,
            "Phishing Alert",
            "Alerts when a phishing or fake website is detected in the browser",
            NotificationManager.IMPORTANCE_MAX,
            true
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            phishing.setBypassDnd(true);
        }
        nm.createNotificationChannel(phishing);

        // A10 — WhatsApp OTP hijack — CRITICAL, max priority, bypass DnD, vibrate + sound
        NotificationChannel otpGuard = make(
            CHANNEL_OTP_GUARD,
            "WhatsApp Hijack Alert",
            "CRITICAL: fires when a WhatsApp OTP arrives without user-initiated re-registration",
            NotificationManager.IMPORTANCE_MAX,
            true
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            otpGuard.setBypassDnd(true);
            otpGuard.enableVibration(true);
            otpGuard.setVibrationPattern(new long[]{0, 400, 200, 400, 200, 400});
        }
        nm.createNotificationChannel(otpGuard);

        // A11 — Linked devices alert — high priority
        nm.createNotificationChannel(make(
            CHANNEL_LINKED_DEVICES,
            "WhatsApp Linked Devices",
            "Alerts when a new device is linked to your WhatsApp account",
            NotificationManager.IMPORTANCE_HIGH,
            true
        ));

        // A12 — SIM swap alert — high priority
        nm.createNotificationChannel(make(
            CHANNEL_SIM_SWAP,
            "SIM Swap Alert",
            "Alerts when your SIM card is replaced or swapped",
            NotificationManager.IMPORTANCE_HIGH,
            true
        ));
    }

    private static NotificationChannel make(
            String id, String name, String desc, int importance, boolean badge) {
        NotificationChannel ch = new NotificationChannel(id, name, importance);
        ch.setDescription(desc);
        ch.setShowBadge(badge);
        return ch;
    }
}
