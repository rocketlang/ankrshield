package com.ankr.shield;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.InstallSourceInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

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
                // If a designated installer (app store) claimed responsibility, it is NOT
                // a manual sideload — give it the benefit of the doubt (Samsung Galaxy Store,
                // F-Droid, Amazon Appstore, etc. all set installingPackageName to themselves).
                if (installing != null && !installing.isEmpty()) {
                    return "unknown";
                }
                // installingPackageName is null but initiating is set → Package Installer
                // was used directly (user tapped an APK in Files/browser) = real sideload.
                if (!isSystem && initiating != null && !initiating.isEmpty()) {
                    return "file_manager";
                }
                return "unknown";
            } catch (PackageManager.NameNotFoundException | SecurityException ignored) {}
        }

        // Fallback: legacy API (still works on older Android)
        try {
            String installer = pm.getInstallerPackageName(packageName);
            if ("com.android.vending".equals(installer)) return "play_store";
            if ("com.android.shell".equals(installer))   return "adb";
            if (installer != null && !installer.isEmpty()) {
                // Legacy API can't distinguish app stores from Package Installer —
                // only flag as sideloaded if the installer is the system Package Installer.
                // Any other non-null installer is likely an app store → unknown.
                if ("com.android.packageinstaller".equals(installer)
                        || "com.google.android.packageinstaller".equals(installer)) {
                    return isSystem ? "unknown" : "file_manager";
                }
                return "unknown";
            }
        } catch (Exception ignored) {}

        // Can't determine — don't assume sideloaded
        return "unknown";
    }

    /**
     * Open the Android system settings page for a specific app.
     * User can manually revoke permissions from this screen.
     */
    @ReactMethod
    public void openAppSettings(String packageName, Promise promise) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + packageName));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getReactApplicationContext().startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("SETTINGS_ERROR", e.getMessage(), e);
        }
    }

    /**
     * Launch an installed app by its package (its main/launcher activity).
     * Resolves true if launched, false if the app isn't installed / has no
     * launcher (so JS can fall back to a web URL). Never throws to the UI.
     */
    @ReactMethod
    public void openApp(String packageName, Promise promise) {
        try {
            Intent intent = getReactApplicationContext()
                .getPackageManager()
                .getLaunchIntentForPackage(packageName);
            if (intent == null) {
                promise.resolve(false); // not installed / no launcher
                return;
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getReactApplicationContext().startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.resolve(false); // never crash the caller — JS falls back
        }
    }

    /**
     * Launch the Android uninstall dialog for a specific app.
     * Android shows a system confirmation — we never force-uninstall.
     */
    @ReactMethod
    public void uninstallApp(String packageName, Promise promise) {
        try {
            Intent intent = new Intent(Intent.ACTION_DELETE);
            intent.setData(Uri.parse("package:" + packageName));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getReactApplicationContext().startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("UNINSTALL_ERROR", e.getMessage(), e);
        }
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
                        for (int pi = 0; pi < pkgInfo.requestedPermissions.length; pi++) {
                            // Only include permissions the user actually granted at runtime.
                            // A declared-but-denied permission gives the app zero real access —
                            // flagging it would produce false positives for ordinary apps.
                            boolean granted = (pkgInfo.requestedPermissionsFlags != null)
                                && (pkgInfo.requestedPermissionsFlags[pi]
                                    & PackageInfo.REQUESTED_PERMISSION_GRANTED) != 0;
                            if (!granted) continue;
                            String p = pkgInfo.requestedPermissions[pi];
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
