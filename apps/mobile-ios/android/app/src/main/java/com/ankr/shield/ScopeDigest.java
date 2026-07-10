package com.ankr.shield;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import java.util.List;
import java.util.Map;

/**
 * ScopeDigest — the telling, as notifications (ASCT-T3.2).
 *
 * Weekly digest: calm, Safari-Privacy-Report tone. Counts from the ledger,
 * never adjectives. "Apps kept working normally" is the founding promise
 * and rides on every digest.
 *
 * Critical alert: stalkerware/APT-grade contact (risk_level >= 3) notifies
 * immediately in EVERY mode including passive witness — safety incidents
 * are the one thing that never waits for a weekly summary (ASCT-006).
 * Rate-limited to one alert per app per day.
 */
final class ScopeDigest {

    private static final String CHANNEL_SCOPE    = "ankrshield_scope_report";
    private static final String CHANNEL_CRITICAL = "ankrshield_scope_critical";
    private static final String STORE            = "ankrshield_digest";
    private static final String KEY_LAST_DIGEST  = "last_digest_ts";
    private static final String KEY_ALERT_PREFIX = "critical_alert_";
    private static final long   WEEK_MS          = 7L * 24 * 3600 * 1000;
    private static final long   DAY_MS           = 24L * 3600 * 1000;
    private static final int    NOTIF_DIGEST     = 0x5C09E;
    private static final int    CRITICAL_RISK    = 3;

    private ScopeDigest() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(STORE, Context.MODE_PRIVATE);
    }

    private static void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel digest = new NotificationChannel(
            CHANNEL_SCOPE, "Privacy Report", NotificationManager.IMPORTANCE_LOW);
        digest.setDescription("Weekly summary of tracking beyond app scope");
        nm.createNotificationChannel(digest);
        NotificationChannel critical = new NotificationChannel(
            CHANNEL_CRITICAL, "Critical privacy alerts", NotificationManager.IMPORTANCE_HIGH);
        critical.setDescription("Stalkerware or spyware-grade contact detected");
        nm.createNotificationChannel(critical);
    }

    private static PendingIntent openApp(Context ctx) {
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (launch == null) return null;
        launch.putExtra("navigate_to", "ScopeReport");
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(ctx, 0, launch, flags);
    }

    /** Called periodically by the VPN service. Posts at most one digest per week. */
    static void maybeWeeklyDigest(Context ctx, ScopeLedger ledger) {
        try {
            long last = prefs(ctx).getLong(KEY_LAST_DIGEST, 0);
            long now = System.currentTimeMillis();
            if (last == 0) {
                // First run: anchor the week, don't notify on install day
                prefs(ctx).edit().putLong(KEY_LAST_DIGEST, now).apply();
                return;
            }
            if (now - last < WEEK_MS) return;

            long beyond = 0, apps = 0, maxVendors = 0;
            List<Map<String, Object>> rows = ledger.summary();
            for (Map<String, Object> row : rows) {
                Object app = row.get("app");
                if (app == null || "".equals(app)) continue;
                long b = asLong(row.get("beyondScope"));
                if (b > 0) {
                    apps++;
                    beyond += b;
                    long v = asLong(row.get("vendorCount"));
                    if (v > maxVendors) maxVendors = v;
                }
            }
            prefs(ctx).edit().putLong(KEY_LAST_DIGEST, now).apply();
            if (beyond == 0) return; // nothing witnessed — no noise

            ensureChannels(ctx);
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            Notification.Builder nb = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? new Notification.Builder(ctx, CHANNEL_SCOPE)
                : new Notification.Builder(ctx);
            nb.setSmallIcon(android.R.drawable.ic_menu_info_details)
              .setContentTitle("Your weekly Privacy Report")
              .setContentText(beyond + " contacts beyond app scope by " + apps + " apps. "
                              + "Apps kept working normally.")
              .setStyle(new Notification.BigTextStyle().bigText(
                  beyond + " contacts beyond app scope by " + apps + " apps (up to "
                  + maxVendors + " named vendors in one app). Apps kept working normally "
                  + "the whole time. Tap to see who, with receipts."))
              .setAutoCancel(true);
            PendingIntent pi = openApp(ctx);
            if (pi != null) nb.setContentIntent(pi);
            nm.notify(NOTIF_DIGEST, nb.build());
        } catch (Exception ignored) {}
    }

    /** Immediate alert on stalkerware/APT-grade contact. Once per app per day. */
    static void maybeCriticalAlert(Context ctx, String app, String domain,
                                   String category, int riskLevel) {
        if (riskLevel < CRITICAL_RISK
                && !"stalkerware".equals(category) && !"apt".equals(category)) {
            return;
        }
        try {
            String key = KEY_ALERT_PREFIX + (app == null || app.isEmpty() ? "unattributed" : app);
            long lastAlert = prefs(ctx).getLong(key, 0);
            long now = System.currentTimeMillis();
            if (now - lastAlert < DAY_MS) return;
            prefs(ctx).edit().putLong(key, now).apply();

            ensureChannels(ctx);
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            String who = (app == null || app.isEmpty()) ? "An unattributed process" : app;
            Notification.Builder nb = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? new Notification.Builder(ctx, CHANNEL_CRITICAL)
                : new Notification.Builder(ctx);
            nb.setSmallIcon(android.R.drawable.stat_sys_warning)
              .setContentTitle("Critical: spyware-grade contact")
              .setContentText(who + " contacted " + domain + " (" + category + ")")
              .setStyle(new Notification.BigTextStyle().bigText(
                  who + " contacted " + domain + " — a " + category
                  + " endpoint from the on-device tracker database. "
                  + "Open AnkrShield for the receipts and a stalkerware scan."))
              .setAutoCancel(true);
            PendingIntent pi = openApp(ctx);
            if (pi != null) nb.setContentIntent(pi);

            // Containment action: single attributable package → one-tap network
            // quarantine (every DNS query from it → NXDOMAIN, survives restarts).
            if (app != null && !app.isEmpty() && !app.contains(",")) {
                Intent qIntent = new Intent(ctx, DnsVpnService.class)
                    .setAction("QUARANTINE")
                    .putExtra("pkg", app);
                int qFlags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    qFlags |= PendingIntent.FLAG_IMMUTABLE;
                }
                PendingIntent qpi = PendingIntent.getService(
                    ctx, app.hashCode(), qIntent, qFlags);
                nb.addAction(new Notification.Action.Builder(
                    null, "Quarantine app", qpi).build());
            }
            nm.notify(domain.hashCode(), nb.build());
        } catch (Exception ignored) {}
    }

    private static long asLong(Object o) {
        return (o instanceof Number) ? ((Number) o).longValue() : 0;
    }
}
