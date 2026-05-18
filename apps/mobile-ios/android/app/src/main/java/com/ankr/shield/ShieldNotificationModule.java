package com.ankr.shield;

import android.content.Intent;
import android.os.Build;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * React Native bridge module for the ShieldNotificationService.
 * Exposes start(blockedToday, riskScore) and stop() to JavaScript.
 */
public class ShieldNotificationModule extends ReactContextBaseJavaModule {

    public ShieldNotificationModule(ReactApplicationContext ctx) {
        super(ctx);
    }

    @Override
    public String getName() {
        return "ShieldNotification";
    }

    @ReactMethod
    public void start(int blockedToday, int riskScore) {
        Intent intent = new Intent(getReactApplicationContext(), ShieldNotificationService.class);
        intent.putExtra("blocked_today", blockedToday);
        intent.putExtra("risk_score", riskScore);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getReactApplicationContext().startForegroundService(intent);
        } else {
            getReactApplicationContext().startService(intent);
        }
    }

    @ReactMethod
    public void stop() {
        getReactApplicationContext().stopService(
            new Intent(getReactApplicationContext(), ShieldNotificationService.class)
        );
    }
}
