package com.ankr.shield;

import android.content.Intent;
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
        } catch (Exception e) {
            promise.reject("START_ERROR", e.getMessage(), e);
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
