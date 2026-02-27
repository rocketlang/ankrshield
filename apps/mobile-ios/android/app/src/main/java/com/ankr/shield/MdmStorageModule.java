package com.ankr.shield;

import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * MdmStorageModule — persistent key/value store for MDM Lite (A7).
 *
 * Backed by Android SharedPreferences under the "xshield_mdm" preference file.
 * Exposes a minimal AsyncStorage-compatible API to JS.
 *
 * JS API:
 *   NativeModules.MdmStorageModule.getItem(key)          → Promise<string|null>
 *   NativeModules.MdmStorageModule.setItem(key, value)   → Promise<void>
 *   NativeModules.MdmStorageModule.removeItem(key)       → Promise<void>
 */
public class MdmStorageModule extends ReactContextBaseJavaModule {

    private static final String PREFS_NAME = "xshield_mdm";

    public MdmStorageModule(@NonNull ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return "MdmStorageModule";
    }

    @ReactMethod
    public void getItem(String key, Promise promise) {
        try {
            SharedPreferences prefs = getReactApplicationContext()
                    .getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE);
            String value = prefs.getString(key, null);
            promise.resolve(value);
        } catch (Exception e) {
            promise.reject("MDM_STORAGE_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void setItem(String key, String value, Promise promise) {
        try {
            SharedPreferences prefs = getReactApplicationContext()
                    .getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE);
            prefs.edit().putString(key, value).apply();
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("MDM_STORAGE_ERROR", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void removeItem(String key, Promise promise) {
        try {
            SharedPreferences prefs = getReactApplicationContext()
                    .getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE);
            prefs.edit().remove(key).apply();
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("MDM_STORAGE_ERROR", e.getMessage(), e);
        }
    }
}
