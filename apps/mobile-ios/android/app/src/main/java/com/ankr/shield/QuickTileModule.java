package com.ankr.shield;

import android.annotation.TargetApi;
import android.content.SharedPreferences;
import android.os.Build;
import android.service.quicksettings.TileService;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

public class QuickTileModule extends ReactContextBaseJavaModule {
    private static final String PREFS = "AnkrShieldPrefs";

    public QuickTileModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return "QuickTileModule";
    }

    @ReactMethod
    public void updateTileState(boolean active, int riskScore, Promise promise) {
        try {
            SharedPreferences prefs = getReactApplicationContext()
                .getSharedPreferences(PREFS, ReactApplicationContext.MODE_PRIVATE);
            prefs.edit()
                .putBoolean("protectionActive", active)
                .putInt("riskScore", riskScore)
                .apply();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                TileService.requestListeningState(
                    getReactApplicationContext(),
                    new android.content.ComponentName(
                        getReactApplicationContext(),
                        QuickShieldTile.class
                    )
                );
            }
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("TILE_ERROR", e.getMessage());
        }
    }
}
