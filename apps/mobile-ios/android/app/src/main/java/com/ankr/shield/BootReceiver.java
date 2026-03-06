package com.ankr.shield;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * BootReceiver — restarts all AnkrShield background services after device reboot.
 *
 * Once the user grants permissions, protection persists across reboots
 * without them having to open AnkrShield again.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "BootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        Log.i(TAG, "Boot completed — starting AnkrShield services");

        startService(context, WhatsAppGuardService.class);
        startService(context, RansomwareWatcherService.class);
        startService(context, ShieldNotificationService.class);
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
