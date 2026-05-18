package com.ankr.shield;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.telephony.PhoneStateListener;
import android.telephony.ServiceState;
import android.telephony.TelephonyManager;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.security.MessageDigest;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * A12 — SIM Swap Detector
 *
 * Stores a SHA-256 hash of the current SIM's ICCID on first run.
 * Registers a PhoneStateListener to detect when the ICCID changes.
 * On change: fires HIGH alert + emits JS event + blocks UPI transactions for 10 min.
 *
 * Privacy note: ICCID is hashed before storage — raw value never persisted.
 *
 * JS API:
 *   NativeModules.SimSwap.startMonitoring()          → Promise<boolean>
 *   NativeModules.SimSwap.stopMonitoring()           → Promise<boolean>
 *   NativeModules.SimSwap.isMonitoring()             → Promise<boolean>
 *   NativeModules.SimSwap.hasPermission()            → Promise<boolean>
 *   NativeModules.SimSwap.getSwapHistory()           → Promise<SimSwapEvent[]>
 *   NativeModules.SimSwap.clearHistory()             → Promise<boolean>
 *   NativeModules.SimSwap.getCurrentSimInfo()        → Promise<SimInfo>
 *   NativeModules.SimSwap.acknowledgeSwap()          → Promise<boolean>
 *     Call when user confirms they know about the SIM change (e.g. got a new SIM voluntarily).
 *
 * Events:
 *   'SimSwapDetected' → { carrier, changeTs, isFirstBaseline }
 */
public class SimSwapModule extends ReactContextBaseJavaModule {

    private static final String TAG = "SimSwapModule";
    private static final String PREFS = "ankr_sim_swap";
    private static final String KEY_BASELINE_ICCID_HASH = "baseline_iccid_hash";
    private static final String KEY_BASELINE_CARRIER = "baseline_carrier";
    private static final String KEY_MONITORING = "monitoring_enabled";

    /** Block UPI transactions for 10 minutes after SIM swap. */
    private static final long UPI_BLOCK_DURATION_MS = 10 * 60 * 1000L;

    private static volatile boolean monitoring = false;
    private PhoneStateListener phoneStateListener = null;
    private TelephonyManager telephonyManager = null;

    public static final CopyOnWriteArrayList<SimSwapEvent> swapHistory =
        new CopyOnWriteArrayList<>();

    public static volatile ReactApplicationContext reactContext = null;

    public static class SimSwapEvent {
        public final String newCarrier;
        public final long ts;
        public SimSwapEvent(String newCarrier) {
            this.newCarrier = newCarrier;
            this.ts = System.currentTimeMillis();
        }
    }

    public SimSwapModule(@NonNull ReactApplicationContext ctx) {
        super(ctx);
        reactContext = ctx;
        telephonyManager = (TelephonyManager)
            ctx.getSystemService(Context.TELEPHONY_SERVICE);
    }

    @NonNull
    @Override
    public String getName() { return "SimSwap"; }

    @ReactMethod
    public void startMonitoring(Promise promise) {
        if (!hasReadPhoneStatePermission()) {
            promise.reject("NO_PERMISSION", "READ_PHONE_STATE permission required");
            return;
        }
        if (monitoring) { promise.resolve(true); return; }

        // Seed baseline if first run
        seedBaselineIfNeeded();

        phoneStateListener = new PhoneStateListener() {
            @Override
            public void onServiceStateChanged(ServiceState serviceState) {
                checkForSwap();
            }
        };

        try {
            telephonyManager.listen(phoneStateListener,
                PhoneStateListener.LISTEN_SERVICE_STATE);
            monitoring = true;
            getPrefs().edit().putBoolean(KEY_MONITORING, true).apply();
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("START_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void stopMonitoring(Promise promise) {
        if (phoneStateListener != null && telephonyManager != null) {
            telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_NONE);
            phoneStateListener = null;
        }
        monitoring = false;
        getPrefs().edit().putBoolean(KEY_MONITORING, false).apply();
        promise.resolve(true);
    }

    @ReactMethod
    public void isMonitoring(Promise promise) {
        promise.resolve(monitoring);
    }

    @ReactMethod
    public void hasPermission(Promise promise) {
        promise.resolve(hasReadPhoneStatePermission());
    }

    @ReactMethod
    public void getCurrentSimInfo(Promise promise) {
        try {
            WritableMap m = Arguments.createMap();
            String carrier = telephonyManager.getNetworkOperatorName();
            m.putString("carrier", carrier != null ? carrier : "Unknown");
            m.putBoolean("hasBaseline",
                getPrefs().getString(KEY_BASELINE_ICCID_HASH, null) != null);
            promise.resolve(m);
        } catch (Exception e) {
            promise.reject("SIM_INFO_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void getSwapHistory(Promise promise) {
        try {
            WritableArray arr = Arguments.createArray();
            for (SimSwapEvent e : swapHistory) {
                WritableMap m = Arguments.createMap();
                m.putString("newCarrier", e.newCarrier);
                m.putDouble("ts", e.ts);
                arr.pushMap(m);
            }
            promise.resolve(arr);
        } catch (Exception e) {
            promise.reject("HISTORY_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void clearHistory(Promise promise) {
        swapHistory.clear();
        promise.resolve(true);
    }

    /**
     * User confirms they are aware of the SIM change (e.g. they got a new SIM voluntarily).
     * Updates the baseline to the new ICCID.
     */
    @ReactMethod
    public void acknowledgeSwap(Promise promise) {
        seedBaseline(); // re-seed with current ICCID
        UpiGuardModule.setSimSwapBlock(false); // unblock UPI
        promise.resolve(true);
    }

    // Required by NativeEventEmitter
    @ReactMethod public void addListener(String eventName) {}
    @ReactMethod public void removeListeners(int count) {}

    // ── Private ────────────────────────────────────────────────────────────────

    private void seedBaselineIfNeeded() {
        if (getPrefs().getString(KEY_BASELINE_ICCID_HASH, null) == null) {
            seedBaseline();
        }
    }

    private void seedBaseline() {
        try {
            @SuppressWarnings("MissingPermission")
            String iccid = telephonyManager.getSimSerialNumber();
            if (iccid == null || iccid.isEmpty()) return;

            String hash = sha256(iccid);
            String carrier = telephonyManager.getNetworkOperatorName();
            getPrefs().edit()
                .putString(KEY_BASELINE_ICCID_HASH, hash)
                .putString(KEY_BASELINE_CARRIER, carrier != null ? carrier : "")
                .apply();
            Log.i(TAG, "SIM baseline seeded for carrier: " + carrier);
        } catch (SecurityException e) {
            Log.w(TAG, "READ_PHONE_STATE not granted — cannot seed baseline");
        }
    }

    private void checkForSwap() {
        if (!hasReadPhoneStatePermission()) return;
        try {
            @SuppressWarnings("MissingPermission")
            String currentIccid = telephonyManager.getSimSerialNumber();
            if (currentIccid == null || currentIccid.isEmpty()) return;

            String currentHash = sha256(currentIccid);
            String baselineHash = getPrefs().getString(KEY_BASELINE_ICCID_HASH, null);

            if (baselineHash == null) {
                seedBaseline();
                return;
            }

            if (!currentHash.equals(baselineHash)) {
                String carrier = telephonyManager.getNetworkOperatorName();
                SimSwapEvent event = new SimSwapEvent(carrier != null ? carrier : "Unknown");
                if (swapHistory.size() >= 20) swapHistory.remove(0);
                swapHistory.add(event);

                // Block UPI for 10 min
                UpiGuardModule.setSimSwapBlock(true);
                scheduleUpiBlockLift();

                // Fire notification
                fireSwapAlert(carrier);

                // Emit to JS
                emitSwapEvent(event);

                Log.w(TAG, "SIM swap detected! New carrier: " + carrier);
            }
        } catch (SecurityException e) {
            Log.w(TAG, "checkForSwap: READ_PHONE_STATE revoked");
        }
    }

    private void scheduleUpiBlockLift() {
        new Thread(() -> {
            try {
                Thread.sleep(UPI_BLOCK_DURATION_MS);
                UpiGuardModule.setSimSwapBlock(false);
            } catch (InterruptedException ignored) {}
        }).start();
    }

    private void fireSwapAlert(String carrier) {
        android.app.NotificationManager nm = (android.app.NotificationManager)
            getReactApplicationContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        android.app.PendingIntent openApp = android.app.PendingIntent.getActivity(
            getReactApplicationContext(), 0,
            new android.content.Intent(getReactApplicationContext(), MainActivity.class)
                .setFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra("deeplink", "ankrshield://sim-swap"),
            android.app.PendingIntent.FLAG_UPDATE_CURRENT |
                (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M
                    ? android.app.PendingIntent.FLAG_IMMUTABLE : 0)
        );

        androidx.core.app.NotificationCompat.Builder builder =
            new androidx.core.app.NotificationCompat.Builder(
                getReactApplicationContext(), NotificationChannels.CHANNEL_SIM_SWAP)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle("SIM Card Replaced — Security Alert")
                .setContentText("Your SIM was swapped or replaced. UPI blocked for 10 min.")
                .setStyle(new androidx.core.app.NotificationCompat.BigTextStyle()
                    .bigText(
                        "Your SIM card was replaced or swapped (detected via ICCID change).\n\n" +
                        "New carrier: " + (carrier != null ? carrier : "Unknown") + "\n\n" +
                        "Action taken: UPI/GPay transactions blocked for 10 minutes.\n\n" +
                        "If this was you (new SIM), tap to dismiss. If not — call your operator NOW."
                    )
                )
                .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
                .setCategory(androidx.core.app.NotificationCompat.CATEGORY_ALARM)
                .setAutoCancel(false)
                .setContentIntent(openApp);

        nm.notify(NotificationChannels.NOTIF_ID_SIM_SWAP, builder.build());
    }

    private void emitSwapEvent(SimSwapEvent event) {
        try {
            if (reactContext == null || !reactContext.hasActiveCatalystInstance()) return;
            WritableMap m = Arguments.createMap();
            m.putString("carrier", event.newCarrier);
            m.putDouble("changeTs", event.ts);
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("SimSwapDetected", m);
        } catch (Exception e) {
            Log.e(TAG, "Failed to emit SimSwapDetected", e);
        }
    }

    private boolean hasReadPhoneStatePermission() {
        return ContextCompat.checkSelfPermission(
            getReactApplicationContext(), Manifest.permission.READ_PHONE_STATE)
            == PackageManager.PERMISSION_GRANTED;
    }

    private String sha256(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(input.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private SharedPreferences getPrefs() {
        return getReactApplicationContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
