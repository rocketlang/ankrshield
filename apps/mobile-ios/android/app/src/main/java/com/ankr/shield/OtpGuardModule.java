package com.ankr.shield;

import android.Manifest;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

/**
 * A10 — React Native bridge for OtpGuardReceiver.
 *
 * JS API:
 *   NativeModules.OtpGuard.isEnabled()                   → Promise<boolean>
 *   NativeModules.OtpGuard.setEnabled(bool)              → Promise<boolean>
 *   NativeModules.OtpGuard.hasPermission()               → Promise<boolean>
 *   NativeModules.OtpGuard.getEventHistory()             → Promise<OtpEvent[]>
 *   NativeModules.OtpGuard.clearHistory()                → Promise<boolean>
 *   NativeModules.OtpGuard.startGraceWindow()            → Promise<boolean>
 *     Call when user deliberately opens WA re-registration — suppresses alerts for 5 min.
 *   NativeModules.OtpGuard.getGraceWindowRemainingMs()  → Promise<number>
 *
 * Events (DeviceEventEmitter):
 *   'OtpGuardEvent' → { senderDisplay, senderHash, otpCode, ts, wasInGrace, isHijackAttempt }
 */
public class OtpGuardModule extends ReactContextBaseJavaModule {

    private static final String PREFS = "ankr_otp_guard";
    private static final String KEY_ENABLED = "otp_guard_enabled";
    private static final String KEY_GRACE_UNTIL = "grace_window_until_ms";

    /** Shared with OtpGuardReceiver for event emission to JS. */
    public static volatile ReactApplicationContext reactContext = null;

    public OtpGuardModule(@NonNull ReactApplicationContext ctx) {
        super(ctx);
        reactContext = ctx;
    }

    @NonNull
    @Override
    public String getName() { return "OtpGuard"; }

    @ReactMethod
    public void isEnabled(Promise promise) {
        SharedPreferences prefs = getPrefs();
        promise.resolve(prefs.getBoolean(KEY_ENABLED, true)); // on by default
    }

    @ReactMethod
    public void setEnabled(boolean enabled, Promise promise) {
        getPrefs().edit().putBoolean(KEY_ENABLED, enabled).apply();
        promise.resolve(true);
    }

    @ReactMethod
    public void hasPermission(Promise promise) {
        int result = ContextCompat.checkSelfPermission(
            getReactApplicationContext(), Manifest.permission.RECEIVE_SMS);
        promise.resolve(result == PackageManager.PERMISSION_GRANTED);
    }

    @ReactMethod
    public void getEventHistory(Promise promise) {
        try {
            WritableArray arr = Arguments.createArray();
            for (OtpGuardReceiver.OtpEvent e : OtpGuardReceiver.eventHistory) {
                WritableMap m = Arguments.createMap();
                m.putString("senderDisplay", e.senderDisplay);
                m.putString("senderHash", e.senderHash);
                m.putString("otpCode", e.otpCode);
                m.putDouble("ts", e.ts);
                m.putBoolean("wasInGrace", e.wasInGrace);
                m.putBoolean("isHijackAttempt", !e.wasInGrace);
                arr.pushMap(m);
            }
            promise.resolve(arr);
        } catch (Exception e) {
            promise.reject("HISTORY_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void clearHistory(Promise promise) {
        OtpGuardReceiver.eventHistory.clear();
        promise.resolve(true);
    }

    /**
     * Call when user deliberately initiates WhatsApp re-registration.
     * Suppresses hijack alerts for 5 minutes.
     */
    @ReactMethod
    public void startGraceWindow(Promise promise) {
        long until = System.currentTimeMillis() + OtpGuardReceiver.GRACE_WINDOW_MS;
        getPrefs().edit().putLong(KEY_GRACE_UNTIL, until).apply();
        promise.resolve(true);
    }

    @ReactMethod
    public void getGraceWindowRemainingMs(Promise promise) {
        long graceUntil = getPrefs().getLong(KEY_GRACE_UNTIL, 0L);
        long remaining = graceUntil - System.currentTimeMillis();
        promise.resolve((double) Math.max(0, remaining));
    }

    // Required by NativeEventEmitter
    @ReactMethod public void addListener(String eventName) {}
    @ReactMethod public void removeListeners(int count) {}

    private SharedPreferences getPrefs() {
        return getReactApplicationContext()
            .getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
    }
}
