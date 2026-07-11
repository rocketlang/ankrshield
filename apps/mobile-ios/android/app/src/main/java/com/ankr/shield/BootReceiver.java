package com.ankr.shield;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.VpnService;
import android.os.Build;
import android.util.Log;

/**
 * BootReceiver — restarts AnkrShield background services after a device reboot OR an
 * app update (ACTION_MY_PACKAGE_REPLACED). An update force-stops the app and kills the
 * VPN + services; without this the shield silently stays off until reopened. The DNS
 * shield is auto-resumed only if it was on (ShieldPrefs flag) AND VPN consent still
 * exists — we can't prompt for consent from a receiver, so we never try silently.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "BootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        boolean boot    = Intent.ACTION_BOOT_COMPLETED.equals(action);
        boolean updated = Intent.ACTION_MY_PACKAGE_REPLACED.equals(action);
        if (!boot && !updated) return;
        Log.i(TAG, (updated ? "App updated" : "Boot completed") + " — restoring AnkrShield");

        startService(context, WhatsAppGuardService.class);
        startService(context, RansomwareWatcherService.class);
        startService(context, ShieldNotificationService.class);

        resumeShieldIfWasOn(context);
    }

    /**
     * Restart the DNS shield if the user had it on — but only when VPN consent is
     * still granted (VpnService.prepare() == null). A receiver has no Activity, so it
     * can never show the consent dialog; if consent is missing we leave the shield off
     * (fail-safe) rather than crash. After an app update consent persists, so this is
     * the reliable path the founder asked for ("remember statuses between upgrades").
     */
    private void resumeShieldIfWasOn(Context context) {
        try {
            if (!ShieldPrefs.isShieldWasRunning(context)) return;
            if (VpnService.prepare(context) != null) {
                Log.i(TAG, "Shield was on but VPN consent is gone — not auto-starting");
                return;
            }
            Intent vpn = new Intent(context, DnsVpnService.class);
            context.startService(vpn); // VpnService: exempt from bg limits, no FGS type
            Log.i(TAG, "DNS shield auto-resumed");
        } catch (Exception e) {
            Log.w(TAG, "Could not auto-resume shield: " + e.getMessage());
        }
    }

    private void startService(Context context, Class<?> serviceClass) {
        try {
            Intent service = new Intent(context, serviceClass);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(service);
            } else {
                context.startService(service);
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not start " + serviceClass.getSimpleName() + ": " + e.getMessage());
        }
    }
}
