package com.ankr.shield;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.File;

/**
 * ThreatActionReceiver — handles "Delete Now" tapped directly on a threat notification.
 *
 * The user never has to open AnkrShield. They can be inside WhatsApp (or any app),
 * see the system notification and instantly delete the malicious file.
 */
public class ThreatActionReceiver extends BroadcastReceiver {

    private static final String TAG = "ThreatAction";
    public static final String ACTION_DELETE = "com.ankr.shield.ACTION_DELETE_THREAT";
    public static final String EXTRA_FILE_PATH = "filePath";
    public static final String EXTRA_NOTIF_ID = "notifId";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_DELETE.equals(intent.getAction())) return;

        String path = intent.getStringExtra(EXTRA_FILE_PATH);
        int notifId = intent.getIntExtra(EXTRA_NOTIF_ID, -1);

        // Delete the file
        if (path != null) {
            File f = new File(path);
            if (f.exists()) {
                boolean deleted = WhatsAppGuardService.deleteThreatFile(f.getAbsolutePath());
                Log.i(TAG, "Delete " + path + " → " + (deleted ? "OK" : "FAILED"));

                // Record locally + report to global threat intel server
                WhatsAppGuardService.ScanEntry entry = findEntry(path);
                if (entry != null) {
                    ThreatReporter.record(context, entry,
                        deleted ? ThreatReporter.ACTION_DELETED : ThreatReporter.ACTION_KEPT);
                }

                // Emit result to RN JS if app is running (best-effort)
                try {
                    ReactApplicationContext ctx = WhatsAppGuardModule.reactContext;
                    if (ctx != null && ctx.hasActiveCatalystInstance()) {
                        WritableMap m = Arguments.createMap();
                        m.putString("filePath", path);
                        m.putBoolean("deleted", deleted);
                        ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                           .emit("WhatsAppThreatCleaned", m);
                    }
                } catch (Exception ignored) {}
            }
        }

        // Dismiss the notification
        if (notifId != -1) {
            NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(notifId);
        }
    }

    private static WhatsAppGuardService.ScanEntry findEntry(String path) {
        for (WhatsAppGuardService.ScanEntry e : WhatsAppGuardService.scanHistory) {
            if (path.equals(e.filePath)) return e;
        }
        return null;
    }
}
