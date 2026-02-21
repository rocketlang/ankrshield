package com.ankr.shield;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

/**
 * React Native bridge for WhatsAppGuardService.
 *
 * JS API:
 *   NativeModules.WhatsAppGuard.startGuard()     → Promise<boolean>
 *   NativeModules.WhatsAppGuard.stopGuard()      → Promise<boolean>
 *   NativeModules.WhatsAppGuard.isRunning()      → Promise<boolean>
 *   NativeModules.WhatsAppGuard.getScanHistory() → Promise<ScanEntry[]>
 *   NativeModules.WhatsAppGuard.clearHistory()   → Promise<boolean>
 *
 * Events emitted (DeviceEventEmitter):
 *   'WhatsAppFileEvent' → { fileName, filePath, verdict, reason, ts, fileSizeBytes }
 */
public class WhatsAppGuardModule extends ReactContextBaseJavaModule {

    private static final String PREFS = "ankr_guard";
    private static final String KEY_ENABLED = "guard_enabled";
    private static final String KEY_NOTIFS  = "notifications_enabled";

    private static volatile boolean running = false;

    // Shared with AnkrShieldAccessibilityService for event emission
    public static volatile ReactApplicationContext reactContext = null;

    public WhatsAppGuardModule(@NonNull ReactApplicationContext ctx) {
        super(ctx);
        reactContext = ctx;

        // Wire up attachment scan events → JS
        WhatsAppGuardService.listener = entry -> {
            if (!entry.verdict.equals("clean")) {
                sendFileEvent(entry);
            }
        };

        // Wire up impersonation + call events from accessibility service → JS
        AnkrShieldAccessibilityService.reactContext = ctx;
    }

    @NonNull
    @Override
    public String getName() { return "WhatsAppGuard"; }

    @ReactMethod
    public void startGuard(Promise promise) {
        try {
            Intent intent = new Intent(getReactApplicationContext(), WhatsAppGuardService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getReactApplicationContext().startForegroundService(intent);
            } else {
                getReactApplicationContext().startService(intent);
            }
            running = true;
            promise.resolve(true);
        } catch (Throwable t) {
            // Catches SecurityException, IllegalStateException (ForegroundServiceStartNotAllowedException,
            // ForegroundServiceDidNotStartInTimeException), and any Error subclasses on Android 15+
            promise.reject("START_ERROR", t.getClass().getSimpleName() + ": " + t.getMessage());
        }
    }

    @ReactMethod
    public void stopGuard(Promise promise) {
        try {
            Intent intent = new Intent(getReactApplicationContext(), WhatsAppGuardService.class);
            getReactApplicationContext().stopService(intent);
            running = false;
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("STOP_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void isRunning(Promise promise) {
        promise.resolve(running);
    }

    @ReactMethod
    public void getScanHistory(Promise promise) {
        try {
            WritableArray arr = Arguments.createArray();
            for (WhatsAppGuardService.ScanEntry entry : WhatsAppGuardService.scanHistory) {
                WritableMap m = Arguments.createMap();
                m.putString("fileName", entry.fileName);
                m.putString("filePath", entry.filePath);
                m.putString("verdict", entry.verdict);
                m.putString("reason", entry.reason);
                m.putDouble("ts", entry.ts);
                m.putDouble("fileSizeBytes", entry.fileSizeBytes);
                arr.pushMap(m);
            }
            promise.resolve(arr);
        } catch (Exception e) {
            promise.reject("HISTORY_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void clearHistory(Promise promise) {
        WhatsAppGuardService.scanHistory.clear();
        promise.resolve(true);
    }

    /** Returns true if the user previously enabled WhatsApp Guard. */
    @ReactMethod
    public void isGuardEnabled(Promise promise) {
        SharedPreferences prefs = getReactApplicationContext()
            .getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
        promise.resolve(prefs.getBoolean(KEY_ENABLED, false));
    }

    /** Persist the user's choice — called after successful permission grant + guard start. */
    @ReactMethod
    public void setGuardEnabled(boolean enabled, Promise promise) {
        getReactApplicationContext()
            .getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
            .edit().putBoolean(KEY_ENABLED, enabled).apply();
        promise.resolve(true);
    }

    /**
     * Silently restart the guard on app launch — ONLY if the user already opted in.
     * Never called on a fresh install, so no surprise permission dialogs.
     */
    @ReactMethod
    public void autoStart(Promise promise) {
        SharedPreferences prefs = getReactApplicationContext()
            .getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
        if (!prefs.getBoolean(KEY_ENABLED, false)) {
            promise.resolve(false); // not opted in yet — do nothing
            return;
        }
        if (running) { promise.resolve(true); return; }
        startGuard(promise);
    }

    /**
     * Delete a threat file from storage.
     * Mirrors what ThreatActionReceiver does when user taps "Delete Now" on the notification.
     */
    @ReactMethod
    public void deleteFile(String filePath, Promise promise) {
        try {
            // Find entry before deleting (need it for reporting)
            WhatsAppGuardService.ScanEntry entry = null;
            for (WhatsAppGuardService.ScanEntry e : WhatsAppGuardService.scanHistory) {
                if (filePath.equals(e.filePath)) { entry = e; break; }
            }

            boolean deleted = WhatsAppGuardService.deleteThreatFile(filePath);

            // Record locally + report to global threat intel server
            if (entry != null) {
                ThreatReporter.record(getReactApplicationContext(), entry,
                    deleted ? ThreatReporter.ACTION_DELETED : ThreatReporter.ACTION_KEPT);
            }

            // Remove from scan history too
            WhatsAppGuardService.scanHistory.removeIf(e -> e.filePath.equals(filePath));

            // Notify JS so UI can remove the card
            try {
                ReactApplicationContext ctx = getReactApplicationContext();
                if (ctx.hasActiveCatalystInstance()) {
                    com.facebook.react.bridge.WritableMap m =
                        com.facebook.react.bridge.Arguments.createMap();
                    m.putString("filePath", filePath);
                    m.putBoolean("deleted", deleted);
                    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                       .emit("WhatsAppThreatCleaned", m);
                }
            } catch (Exception ignored) {}

            promise.resolve(deleted);
        } catch (Exception e) {
            promise.reject("DELETE_ERROR", e.getMessage(), e);
        }
    }

    /** Returns the user's notifications preference (default: true). */
    @ReactMethod
    public void getNotificationsEnabled(Promise promise) {
        SharedPreferences prefs = getReactApplicationContext()
            .getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
        promise.resolve(prefs.getBoolean(KEY_NOTIFS, true));
    }

    /** Persists the user's notification preference — read by WhatsAppGuardService before firing alerts. */
    @ReactMethod
    public void setNotificationsEnabled(boolean enabled, Promise promise) {
        getReactApplicationContext()
            .getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
            .edit().putBoolean(KEY_NOTIFS, enabled).apply();
        promise.resolve(true);
    }

    /** Returns impersonation alert history from the accessibility service. */
    @ReactMethod
    public void getImpersonationAlerts(Promise promise) {
        try {
            WritableArray arr = Arguments.createArray();
            for (AnkrShieldAccessibilityService.ImpersonationAlert a
                    : AnkrShieldAccessibilityService.alertHistory) {
                WritableMap m = Arguments.createMap();
                m.putString("suspectName", a.suspectName);
                m.putString("similarTo", a.similarTo);
                m.putInt("similarityPct", a.similarityPct);
                m.putDouble("ts", a.ts);
                arr.pushMap(m);
            }
            promise.resolve(arr);
        } catch (Exception e) {
            promise.reject("ALERTS_ERROR", e.getMessage(), e);
        }
    }

    /** Returns locally persisted threat action log (survives app kill/reboot). */
    @ReactMethod
    public void getThreatLog(Promise promise) {
        try {
            String json = ThreatReporter.getLocalLog(getReactApplicationContext());
            promise.resolve(json);
        } catch (Exception e) {
            promise.reject("LOG_ERROR", e.getMessage(), e);
        }
    }

    private void sendFileEvent(WhatsAppGuardService.ScanEntry entry) {
        try {
            ReactApplicationContext ctx = getReactApplicationContext();
            if (!ctx.hasActiveCatalystInstance()) return;
            WritableMap m = Arguments.createMap();
            m.putString("fileName", entry.fileName);
            m.putString("filePath", entry.filePath);
            m.putString("verdict", entry.verdict);
            m.putString("reason", entry.reason);
            m.putDouble("ts", entry.ts);
            m.putDouble("fileSizeBytes", entry.fileSizeBytes);
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
               .emit("WhatsAppFileEvent", m);
        } catch (Exception ignored) {}
    }
}
