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
 * React Native bridge for RansomwareWatcherService.
 *
 * JS API:
 *   NativeModules.RansomwareWatcher.startWatcher()      → Promise<boolean>
 *   NativeModules.RansomwareWatcher.stopWatcher()       → Promise<boolean>
 *   NativeModules.RansomwareWatcher.isRunning()         → Promise<boolean>
 *   NativeModules.RansomwareWatcher.getAlertHistory()   → Promise<RansomAlert[]>
 *
 * Events (via NativeEventEmitter):
 *   'RansomwareAlert' → { type, filePath, details, ts }
 */
public class RansomwareWatcherModule extends ReactContextBaseJavaModule {

    private static volatile boolean running = false;

    public RansomwareWatcherModule(@NonNull ReactApplicationContext ctx) {
        super(ctx);

        // Wire service detections → JS events
        RansomwareWatcherService.listener = (type, filePath, details) -> {
            try {
                ReactApplicationContext rctx = getReactApplicationContext();
                if (!rctx.hasActiveCatalystInstance()) return;
                WritableMap m = Arguments.createMap();
                m.putString("type", type);
                m.putString("filePath", filePath);
                m.putString("details", details);
                m.putDouble("ts", System.currentTimeMillis());
                rctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("RansomwareAlert", m);
            } catch (Exception ignored) {}
        };
    }

    @NonNull
    @Override
    public String getName() { return "RansomwareWatcher"; }

    @ReactMethod
    public void startWatcher(Promise promise) {
        try {
            Intent intent = new Intent(getReactApplicationContext(), RansomwareWatcherService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getReactApplicationContext().startForegroundService(intent);
            } else {
                getReactApplicationContext().startService(intent);
            }
            running = true;
            promise.resolve(true);
        } catch (Throwable t) {
            promise.reject("START_ERROR", t.getClass().getSimpleName() + ": " + t.getMessage());
        }
    }

    @ReactMethod
    public void stopWatcher(Promise promise) {
        try {
            Intent intent = new Intent(getReactApplicationContext(), RansomwareWatcherService.class);
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
    public void getAlertHistory(Promise promise) {
        try {
            WritableArray arr = Arguments.createArray();
            for (RansomwareWatcherService.RansomwareAlert alert
                    : RansomwareWatcherService.alertHistory) {
                WritableMap m = Arguments.createMap();
                m.putString("type", alert.type);
                m.putString("filePath", alert.filePath);
                m.putString("details", alert.details);
                m.putDouble("ts", alert.ts);
                arr.pushMap(m);
            }
            promise.resolve(arr);
        } catch (Exception e) {
            promise.reject("HISTORY_ERROR", e.getMessage(), e);
        }
    }

    // Required stubs for NativeEventEmitter (RN 0.65+)
    @ReactMethod public void addListener(String eventName) {}
    @ReactMethod public void removeListeners(int count) {}
}
