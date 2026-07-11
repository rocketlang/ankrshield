package com.ankr.shield;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

/**
 * RansomwareActionReceiver — applies a ransomware-alert remedy tapped directly on the
 * notification, no app open needed (mirrors ThreatActionReceiver's "Delete Now").
 *
 * Founder law: an alert without a remedy is a loose assurance. The one honest, one-tap
 * remedy from the shade is "Ignore this folder" — it marks the alerting file's parent
 * directory benign so the false alarm (e.g. the .thumbnails thumbnailer) stops firing.
 */
public class RansomwareActionReceiver extends BroadcastReceiver {

    private static final String TAG = "RansomwareAction";
    public static final String ACTION_IGNORE_DIR = "com.ankr.shield.ACTION_RANSOM_IGNORE_DIR";
    public static final String EXTRA_DIR = "dir";
    public static final String EXTRA_NOTIF_ID = "notifId";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_IGNORE_DIR.equals(intent.getAction())) return;

        String dir = intent.getStringExtra(EXTRA_DIR);
        int notifId = intent.getIntExtra(EXTRA_NOTIF_ID, -1);

        if (dir != null && !dir.isEmpty()) {
            ShieldPrefs.setRansomIgnoreDir(context, dir, true);
            Log.i(TAG, "Ignoring ransomware alerts under " + dir);

            // Tell the RN feed a remedy was applied, so an open screen can reconcile.
            try {
                ReactApplicationContext ctx = RansomwareWatcherModule.reactContext;
                if (ctx != null && ctx.hasActiveCatalystInstance()) {
                    WritableMap m = Arguments.createMap();
                    m.putString("remedy", "ignore_dir");
                    m.putString("dir", dir);
                    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                       .emit("RansomwareRemedyApplied", m);
                }
            } catch (Exception ignored) {}
        }

        if (notifId != -1) {
            NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(notifId);
        }
    }
}
