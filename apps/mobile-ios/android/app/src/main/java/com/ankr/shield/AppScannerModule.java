package com.ankr.shield;

import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.util.List;

/**
 * Native module — returns real installed app list from Android PackageManager.
 *
 * JS API:
 *   NativeModules.AppScanner.getInstalledApps()
 *     → Promise<Array<{ packageName, appName, permissions, isSystemApp, installSource }>>
 *
 * Each entry mirrors the AppPermissions interface in @ankrshield/android-monitor
 * so it drops directly into monitor.scanApps() without any JS transformation.
 */
public class AppScannerModule extends ReactContextBaseJavaModule {

    public AppScannerModule(@NonNull ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() { return "AppScanner"; }

    @ReactMethod
    public void getInstalledApps(Promise promise) {
        try {
            PackageManager pm = getReactApplicationContext().getPackageManager();
            List<ApplicationInfo> apps =
                pm.getInstalledApplications(PackageManager.GET_META_DATA);

            WritableArray result = Arguments.createArray();

            for (ApplicationInfo app : apps) {
                WritableMap entry = Arguments.createMap();
                entry.putString("packageName", app.packageName);

                // Human-readable label
                String label;
                try {
                    label = pm.getApplicationLabel(app).toString();
                } catch (Exception e) {
                    label = app.packageName;
                }
                entry.putString("appName", label);

                // Declared permissions — strip android.permission. prefix
                WritableArray perms = Arguments.createArray();
                try {
                    PackageInfo pkgInfo =
                        pm.getPackageInfo(app.packageName, PackageManager.GET_PERMISSIONS);
                    if (pkgInfo.requestedPermissions != null) {
                        for (String p : pkgInfo.requestedPermissions) {
                            String short_ = p.startsWith("android.permission.")
                                ? p.substring("android.permission.".length())
                                : p;
                            perms.pushString(short_);
                        }
                    }
                } catch (PackageManager.NameNotFoundException ignored) {}
                entry.putArray("permissions", perms);

                // System app flag
                boolean isSystem = (app.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
                entry.putBoolean("isSystemApp", isSystem);

                // Install source
                String installSource = "unknown";
                try {
                    String installer = pm.getInstallerPackageName(app.packageName);
                    if ("com.android.vending".equals(installer)) {
                        installSource = "play_store";
                    } else if (installer != null && !installer.isEmpty()) {
                        installSource = "other";
                    } else if (!isSystem) {
                        // Non-system, no installer → sideloaded
                        installSource = "file_manager";
                    }
                } catch (Exception ignored) {}
                entry.putString("installSource", installSource);

                result.pushMap(entry);
            }

            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("SCAN_ERROR", e.getMessage(), e);
        }
    }
}
