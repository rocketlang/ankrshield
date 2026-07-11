package com.ankr.shield;

import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

/**
 * AntiTheftModule — device lock, remote wipe, and last-known location.
 *
 * JS API:
 *   NativeModules.AntiTheft.isDeviceAdminActive() → Promise<boolean>
 *   NativeModules.AntiTheft.requestAdminActivation() → void (opens system prompt)
 *   NativeModules.AntiTheft.lockDevice()            → Promise<void>
 *   NativeModules.AntiTheft.wipeDevice()            → Promise<void>  ← IRREVERSIBLE
 *   NativeModules.AntiTheft.getLastLocation()       → Promise<LocationResult | null>
 *
 * LocationResult: { lat, lng, accuracy, provider, ageMs }
 *
 * Requires: app registered as Device Admin (AnkrShieldAdminReceiver).
 * User must activate via "Activate Device Admin" button or Settings > Security.
 */
public class AntiTheftModule extends ReactContextBaseJavaModule {

    private static final String TAG = "AntiTheftModule";

    public AntiTheftModule(@NonNull ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return "AntiTheft";
    }

    // ── Device Admin helpers ──────────────────────────────────────────────────

    @NonNull
    private DevicePolicyManager getDpm() {
        return (DevicePolicyManager) getReactApplicationContext()
            .getSystemService(Context.DEVICE_POLICY_SERVICE);
    }

    @NonNull
    private ComponentName getAdminComponent() {
        return new ComponentName(
            getReactApplicationContext(),
            AnkrShieldAdminReceiver.class
        );
    }

    // ── Public API ────────────────────────────────────────────────────────────

    @ReactMethod
    public void isDeviceAdminActive(Promise promise) {
        try {
            boolean active = getDpm().isAdminActive(getAdminComponent());
            promise.resolve(active);
        } catch (Exception e) {
            promise.resolve(false);
        }
    }

    /**
     * Opens the Android system screen for the user to activate Device Admin.
     * Launches from the CURRENT ACTIVITY when available (the reliable path — an
     * app-context start with NEW_TASK is silently dropped by some OEMs). Resolves
     * true once the system screen is launched; rejects with the reason if it can't,
     * so the JS side can show the failure instead of a dead button.
     */
    @ReactMethod
    public void requestAdminActivation(Promise promise) {
        try {
            if (getDpm().isAdminActive(getAdminComponent())) {
                // Already active — nothing to open.
                promise.resolve(true);
                return;
            }
            Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
            intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, getAdminComponent());
            intent.putExtra(
                DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "AnkrShield uses Device Admin to lock your phone and remotely wipe it if lost or stolen."
            );
            android.app.Activity activity = getCurrentActivity();
            if (activity != null) {
                activity.startActivity(intent);
            } else {
                // No foreground activity — fall back to app context (needs NEW_TASK).
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getReactApplicationContext().startActivity(intent);
            }
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ADMIN_ACTIVATION_FAILED",
                e.getClass().getSimpleName() + ": " + e.getMessage(), e);
        }
    }

    /**
     * Immediately locks the device screen.
     * Requires Device Admin to be active.
     */
    @ReactMethod
    public void lockDevice(Promise promise) {
        try {
            if (!getDpm().isAdminActive(getAdminComponent())) {
                promise.reject("NOT_ADMIN", "Device Admin is not active. Activate it first.");
                return;
            }
            getDpm().lockNow();
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("LOCK_FAILED", e.getMessage(), e);
        }
    }

    /**
     * Factory-resets the device (IRREVERSIBLE — all data is erased).
     * Requires Device Admin to be active.
     * The JS caller is responsible for showing confirmation UI before calling this.
     */
    @ReactMethod
    public void wipeDevice(Promise promise) {
        try {
            if (!getDpm().isAdminActive(getAdminComponent())) {
                promise.reject("NOT_ADMIN", "Device Admin is not active. Activate it first.");
                return;
            }
            // wipeData(0) = factory reset without wiping external storage
            // wipeData(WIPE_EXTERNAL_STORAGE) would also wipe SD card
            getDpm().wipeData(0);
            // If we reach here the wipe was initiated — device will reboot
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("WIPE_FAILED", e.getMessage(), e);
        }
    }

    /**
     * Returns last known location from GPS or network provider (whichever is fresher).
     * Does not start a new location request — reads cached value only.
     * Returns null if location permission is not granted or no cached location exists.
     */
    @ReactMethod
    public void getLastLocation(Promise promise) {
        try {
            LocationManager lm = (LocationManager) getReactApplicationContext()
                .getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) {
                promise.resolve(null);
                return;
            }

            Location best = null;
            try {
                Location gps = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                Location net = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
                if (gps != null && net != null) {
                    best = (gps.getTime() > net.getTime()) ? gps : net;
                } else {
                    best = (gps != null) ? gps : net;
                }
                // Also try fused on Android 9+ (may not be available on all ROMs)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    Location passive = lm.getLastKnownLocation(LocationManager.PASSIVE_PROVIDER);
                    if (passive != null && (best == null || passive.getTime() > best.getTime())) {
                        best = passive;
                    }
                }
            } catch (SecurityException e) {
                // Location permission not granted
                promise.resolve(null);
                return;
            }

            if (best == null) {
                promise.resolve(null);
                return;
            }

            WritableMap loc = Arguments.createMap();
            loc.putDouble("lat", best.getLatitude());
            loc.putDouble("lng", best.getLongitude());
            loc.putDouble("accuracy", best.getAccuracy());
            loc.putString("provider", best.getProvider() != null ? best.getProvider() : "unknown");
            loc.putDouble("ageMs", (double) (System.currentTimeMillis() - best.getTime()));
            promise.resolve(loc);

        } catch (Exception e) {
            promise.resolve(null);
        }
    }
}
