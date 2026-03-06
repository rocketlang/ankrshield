package com.ankr.shield;

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.UserHandle;
import android.util.Log;

/**
 * AnkrShieldAdminReceiver — Device Admin Receiver for anti-theft features.
 *
 * Registered in AndroidManifest.xml with BIND_DEVICE_ADMIN permission.
 * Enables AntiTheftModule to call DevicePolicyManager.lockNow() and wipeData().
 *
 * User activates via: Settings → Security → Device admin apps → AnkrShield
 * Or via the in-app "Activate Device Admin" button (opens the system prompt).
 */
public class AnkrShieldAdminReceiver extends DeviceAdminReceiver {

    private static final String TAG = "AnkrShieldAdmin";

    @Override
    public void onEnabled(Context context, Intent intent) {
        Log.i(TAG, "Device Admin enabled");
    }

    @Override
    public CharSequence onDisableRequested(Context context, Intent intent) {
        return "Disabling Device Admin will remove anti-theft protection (lock and remote wipe).";
    }

    @Override
    public void onDisabled(Context context, Intent intent) {
        Log.i(TAG, "Device Admin disabled");
    }

    @Override
    public void onPasswordFailed(Context context, Intent intent, UserHandle user) {
        Log.w(TAG, "Password attempt failed");
    }

    @Override
    public void onPasswordSucceeded(Context context, Intent intent, UserHandle user) {
        Log.d(TAG, "Password attempt succeeded");
    }
}
