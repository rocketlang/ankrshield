package com.ankr.shield;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;

/**
 * A11 — Linked Devices Watchdog
 *
 * Monitors WhatsApp linked devices for unexpected additions.
 *
 * How it works:
 *   1. AnkrShieldAccessibilityService already monitors WhatsApp UI.
 *   2. When user navigates to WhatsApp > Linked Devices, the accessibility service
 *      captures the device list and calls LinkedDevicesModule.onDeviceListCaptured().
 *   3. We diff the new list against the stored baseline.
 *   4. New devices → HIGH alert + JS event.
 *   5. WorkManager schedules a 15-min periodic check that prompts the user to
 *      open WhatsApp Linked Devices if they haven't done so in 24 hours.
 *
 * JS API:
 *   NativeModules.LinkedDevices.startWatchdog()        → Promise<boolean>
 *   NativeModules.LinkedDevices.stopWatchdog()         → Promise<boolean>
 *   NativeModules.LinkedDevices.isRunning()            → Promise<boolean>
 *   NativeModules.LinkedDevices.getKnownDevices()      → Promise<DeviceEntry[]>
 *   NativeModules.LinkedDevices.getNewDeviceAlerts()   → Promise<NewDeviceAlert[]>
 *   NativeModules.LinkedDevices.clearAlerts()          → Promise<boolean>
 *   NativeModules.LinkedDevices.trustDevice(id)        → Promise<boolean>
 *     Mark a device as expected — suppresses future alerts for it.
 *   NativeModules.LinkedDevices.resetBaseline()        → Promise<boolean>
 *     Re-seed baseline from current captured list (call after user reviews all devices).
 *
 * Events:
 *   'LinkedDeviceAdded' → { deviceName, deviceId, detectedAt }
 */
public class LinkedDevicesModule extends ReactContextBaseJavaModule {

    private static final String TAG = "LinkedDevices";
    private static final String PREFS = "ankr_linked_devices";
    private static final String KEY_BASELINE = "baseline_devices_json";
    private static final String KEY_TRUSTED = "trusted_device_ids_json";
    private static final String KEY_RUNNING = "watchdog_running";
    private static final String KEY_LAST_CAPTURE = "last_capture_ts";
    private static final String WORK_NAME = "ankrshield_linked_devices_check";

    public static final CopyOnWriteArrayList<NewDeviceAlert> newDeviceAlerts =
        new CopyOnWriteArrayList<>();

    public static volatile ReactApplicationContext reactContext = null;

    public static class DeviceEntry {
        public final String id;
        public final String name;
        public final long firstSeenTs;

        DeviceEntry(String id, String name) {
            this.id = id;
            this.name = name;
            this.firstSeenTs = System.currentTimeMillis();
        }
    }

    public static class NewDeviceAlert {
        public final String deviceName;
        public final String deviceId;
        public final long detectedAt;

        NewDeviceAlert(String deviceName, String deviceId) {
            this.deviceName = deviceName;
            this.deviceId = deviceId;
            this.detectedAt = System.currentTimeMillis();
        }
    }

    public LinkedDevicesModule(@NonNull ReactApplicationContext ctx) {
        super(ctx);
        reactContext = ctx;
    }

    @NonNull
    @Override
    public String getName() { return "LinkedDevices"; }

    @ReactMethod
    public void startWatchdog(Promise promise) {
        try {
            PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                LinkedDevicesCheckWorker.class, 15, TimeUnit.MINUTES)
                .build();
            WorkManager.getInstance(getReactApplicationContext())
                .enqueueUniquePeriodicWork(WORK_NAME,
                    ExistingPeriodicWorkPolicy.KEEP, request);
            getPrefs().edit().putBoolean(KEY_RUNNING, true).apply();
            promise.resolve(true);
            Log.i(TAG, "Linked devices watchdog started (15-min interval)");
        } catch (Exception e) {
            promise.reject("START_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void stopWatchdog(Promise promise) {
        WorkManager.getInstance(getReactApplicationContext()).cancelUniqueWork(WORK_NAME);
        getPrefs().edit().putBoolean(KEY_RUNNING, false).apply();
        promise.resolve(true);
    }

    @ReactMethod
    public void isRunning(Promise promise) {
        promise.resolve(getPrefs().getBoolean(KEY_RUNNING, false));
    }

    @ReactMethod
    public void getKnownDevices(Promise promise) {
        try {
            String json = getPrefs().getString(KEY_BASELINE, "[]");
            JSONArray arr = new JSONArray(json);
            WritableArray result = Arguments.createArray();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                WritableMap m = Arguments.createMap();
                m.putString("id", obj.optString("id"));
                m.putString("name", obj.optString("name"));
                m.putDouble("firstSeenTs", obj.optLong("firstSeenTs"));
                result.pushMap(m);
            }
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("DEVICES_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void getNewDeviceAlerts(Promise promise) {
        try {
            WritableArray arr = Arguments.createArray();
            for (NewDeviceAlert a : newDeviceAlerts) {
                WritableMap m = Arguments.createMap();
                m.putString("deviceName", a.deviceName);
                m.putString("deviceId", a.deviceId);
                m.putDouble("detectedAt", a.detectedAt);
                arr.pushMap(m);
            }
            promise.resolve(arr);
        } catch (Exception e) {
            promise.reject("ALERTS_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void clearAlerts(Promise promise) {
        newDeviceAlerts.clear();
        promise.resolve(true);
    }

    @ReactMethod
    public void trustDevice(String deviceId, Promise promise) {
        try {
            String json = getPrefs().getString(KEY_TRUSTED, "[]");
            JSONArray arr = new JSONArray(json);
            arr.put(deviceId);
            getPrefs().edit().putString(KEY_TRUSTED, arr.toString()).apply();
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("TRUST_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void resetBaseline(Promise promise) {
        // Re-seed from the last captured device list (same as current baseline if no new devices)
        // This just clears the newDeviceAlerts so user won't be warned about currently known devices
        newDeviceAlerts.clear();
        promise.resolve(true);
    }

    // Required by NativeEventEmitter
    @ReactMethod public void addListener(String eventName) {}
    @ReactMethod public void removeListeners(int count) {}

    // ── Called by AnkrShieldAccessibilityService ───────────────────────────────

    /**
     * Called by the accessibility service when it reads WhatsApp's Linked Devices screen.
     * @param deviceListJson JSON array: [{"id":"Chrome_Windows_1","name":"Chrome on Windows"},...]
     */
    public static void onDeviceListCaptured(String deviceListJson) {
        Context ctx = reactContext;
        if (ctx == null) return;
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        try {
            JSONArray current = new JSONArray(deviceListJson);
            String baselineJson = prefs.getString(KEY_BASELINE, null);
            String trustedJson = prefs.getString(KEY_TRUSTED, "[]");
            JSONArray trusted = new JSONArray(trustedJson);

            if (baselineJson == null) {
                // First capture — set as baseline
                prefs.edit()
                    .putString(KEY_BASELINE, deviceListJson)
                    .putLong(KEY_LAST_CAPTURE, System.currentTimeMillis())
                    .apply();
                Log.i(TAG, "Linked devices baseline seeded: " + current.length() + " devices");
                return;
            }

            JSONArray baseline = new JSONArray(baselineJson);
            java.util.Set<String> knownIds = new java.util.HashSet<>();
            java.util.Set<String> trustedIds = new java.util.HashSet<>();
            for (int i = 0; i < baseline.length(); i++) {
                knownIds.add(baseline.getJSONObject(i).optString("id"));
            }
            for (int i = 0; i < trusted.length(); i++) {
                trustedIds.add(trusted.getString(i));
            }

            for (int i = 0; i < current.length(); i++) {
                JSONObject dev = current.getJSONObject(i);
                String id = dev.optString("id");
                String name = dev.optString("name", "Unknown device");
                if (!knownIds.contains(id) && !trustedIds.contains(id)) {
                    // New unknown device!
                    NewDeviceAlert alert = new NewDeviceAlert(name, id);
                    newDeviceAlerts.add(alert);
                    fireNewDeviceNotification(ctx, name);
                    emitNewDeviceEvent(name, id);
                    Log.w(TAG, "New WhatsApp linked device detected: " + name);
                }
            }

            // Update baseline (include new devices so we don't re-alert)
            prefs.edit()
                .putString(KEY_BASELINE, deviceListJson)
                .putLong(KEY_LAST_CAPTURE, System.currentTimeMillis())
                .apply();

        } catch (Exception e) {
            Log.e(TAG, "onDeviceListCaptured error", e);
        }
    }

    private static void fireNewDeviceNotification(Context ctx, String deviceName) {
        android.app.NotificationManager nm = (android.app.NotificationManager)
            ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        int flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT |
            (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M
                ? android.app.PendingIntent.FLAG_IMMUTABLE : 0);

        android.app.PendingIntent openApp = android.app.PendingIntent.getActivity(
            ctx, 0,
            new android.content.Intent(ctx, MainActivity.class)
                .setFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra("deeplink", "ankrshield://linked-devices"),
            flags
        );

        androidx.core.app.NotificationCompat.Builder builder =
            new androidx.core.app.NotificationCompat.Builder(ctx,
                NotificationChannels.CHANNEL_OTP_GUARD)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle("New WhatsApp Linked Device")
                .setContentText(deviceName + " was added to your WhatsApp")
                .setStyle(new androidx.core.app.NotificationCompat.BigTextStyle()
                    .bigText("A device was linked to your WhatsApp account:\n\n" +
                        deviceName + "\n\nIf this wasn't you, open AnkrShield to log it out.")
                )
                .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(openApp);

        nm.notify(NotificationChannels.NOTIF_ID_LINKED_DEVICE, builder.build());
    }

    private static void emitNewDeviceEvent(String deviceName, String deviceId) {
        try {
            if (reactContext == null || !reactContext.hasActiveCatalystInstance()) return;
            WritableMap m = Arguments.createMap();
            m.putString("deviceName", deviceName);
            m.putString("deviceId", deviceId);
            m.putDouble("detectedAt", System.currentTimeMillis());
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("LinkedDeviceAdded", m);
        } catch (Exception e) {
            Log.e(TAG, "Failed to emit LinkedDeviceAdded", e);
        }
    }

    private SharedPreferences getPrefs() {
        return getReactApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ── WorkManager worker ──────────────────────────────────────────────────────

    /**
     * Runs every 15 minutes. If > 24h since last accessibility capture of
     * the Linked Devices screen, posts a gentle reminder notification.
     */
    public static class LinkedDevicesCheckWorker extends Worker {

        private static final long REMIND_AFTER_MS = 24 * 60 * 60 * 1000L;

        public LinkedDevicesCheckWorker(@NonNull Context ctx,
                                         @NonNull WorkerParameters params) {
            super(ctx, params);
        }

        @NonNull
        @Override
        public Result doWork() {
            try {
                SharedPreferences prefs =
                    getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                long lastCapture = prefs.getLong(KEY_LAST_CAPTURE, 0L);
                if (System.currentTimeMillis() - lastCapture > REMIND_AFTER_MS) {
                    postReminderNotification();
                }
            } catch (Exception e) {
                Log.e(TAG, "LinkedDevicesCheckWorker error", e);
            }
            return Result.success();
        }

        private void postReminderNotification() {
            android.app.NotificationManager nm = (android.app.NotificationManager)
                getApplicationContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            int flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT |
                (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M
                    ? android.app.PendingIntent.FLAG_IMMUTABLE : 0);

            android.content.Intent waIntent =
                getApplicationContext().getPackageManager()
                    .getLaunchIntentForPackage("com.whatsapp");

            androidx.core.app.NotificationCompat.Builder builder =
                new androidx.core.app.NotificationCompat.Builder(
                    getApplicationContext(), NotificationChannels.CHANNEL_SHIELD_STATUS)
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentTitle("WhatsApp Linked Devices — Check Recommended")
                    .setContentText(
                        "You haven't reviewed linked devices in 24h. Tap to open WhatsApp.")
                    .setPriority(androidx.core.app.NotificationCompat.PRIORITY_LOW)
                    .setAutoCancel(true);

            if (waIntent != null) {
                waIntent.setFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                builder.setContentIntent(android.app.PendingIntent.getActivity(
                    getApplicationContext(), 0, waIntent, flags));
            }

            nm.notify(NotificationChannels.NOTIF_ID_LINKED_DEVICE_REMIND, builder.build());
        }
    }
}
