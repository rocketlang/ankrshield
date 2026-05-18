package com.ankr.shield;

import android.content.Context;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * WidgetModule — React Native bridge for ShieldStatusWidget.
 *
 * JS API:
 *   NativeModules.WidgetModule.updateWidget(score: number, threatsBlocked: number)
 *
 * Called from src/services/WidgetService.ts whenever the privacy score
 * or threat count changes so the home screen widget stays current.
 */
public class WidgetModule extends ReactContextBaseJavaModule {

    public WidgetModule(@NonNull ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return "WidgetModule";
    }

    /**
     * Update the home screen widget with fresh score and threat count.
     *
     * @param score          Current privacy score (0–100).
     * @param threatsBlocked Number of threats blocked today.
     */
    @ReactMethod
    public void updateWidget(int score, int threatsBlocked) {
        Context context = getReactApplicationContext();
        ShieldStatusWidget.updateWidgetData(context, score, threatsBlocked);
    }
}
