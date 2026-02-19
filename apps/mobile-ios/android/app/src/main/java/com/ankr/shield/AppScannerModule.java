package com.ankr.shield;

import android.content.pm.ApplicationInfo;
import android.content.pm.InstallSourceInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;

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

    /**
     * Determine install source using the best available API for the current OS version.
     *
     * Android 30+ (API 30): getInstallSourceInfo() — accurate, the preferred method.
     * Older:                 getInstallerPackageName() — often null for Play Store on 12+.
     *
     * We treat "unknown" as "not confirmed sideloaded" — the scanner only does
     * aggressive combo analysis when the source is confirmed as file_manager or adb.
     */
    private String getInstallSource(PackageManager pm, String packageName, boolean isSystem) {
        // API 30+: use the modern, reliable API
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                InstallSourceInfo info = pm.getInstallSourceInfo(packageName);
                String initiating = info.getInitiatingPackageName();
                String installing = info.getInstallingPackageName();

                // Play Store (vending) covers both the original install and sideload via adb
                if ("com.android.vending".equals(initiating)
                        || "com.android.vending".equals(installing)) {
                    return "play_store";
                }
                // ADB / Dev tools sideload
                if ("com.android.shell".equals(initiating)
                        || "com.android.shell".equals(installing)) {
                    return "adb";
                }
                // Explicit file-manager/browser sideload
                if (!isSystem && initiating != null && !initiating.isEmpty()) {
                    return "file_manager";
                }
                // System package or no initiating info
                return isSystem ? "unknown" : "unknown";
            } catch (PackageManager.NameNotFoundException | SecurityException ignored) {}
        }

        // Fallback: legacy API (still works on older Android)
        try {
            String installer = pm.getInstallerPackageName(packageName);
            if ("com.android.vending".equals(installer)) return "play_store";
            if ("com.android.shell".equals(installer))   return "adb";
            if (installer != null && !installer.isEmpty()) {
                // Another app installed this (e.g. a file manager, app store)
                return isSystem ? "unknown" : "file_manager";
            }
        } catch (Exception ignored) {}

        // Can't determine — don't assume sideloaded
        return "unknown";
    }

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

                entry.putString("installSource", getInstallSource(pm, app.packageName, isSystem));

                result.pushMap(entry);
            }

            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("SCAN_ERROR", e.getMessage(), e);
        }
    }
}
