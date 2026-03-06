package com.ankr.shield;

import android.content.ContentResolver;
import android.content.Context;
import android.hardware.biometrics.BiometricManager;
import android.os.Build;
import android.provider.Settings;

import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.List;

/**
 * DeviceHealthModule — audits device security settings and returns a hardening report.
 *
 * JS API:
 *   NativeModules.DeviceHealth.getSecurityChecks() → Promise<CheckResult[]>
 *
 * CheckResult: {
 *   id:             string,
 *   label:          string,
 *   passed:         boolean,
 *   severity:       'critical' | 'high' | 'medium' | 'info',
 *   value:          string,    // human-readable current state
 *   recommendation: string,    // what to do if !passed
 *   settingsAction: string,    // 'screen_lock' | 'developer_options' | ... (for deep-link)
 * }
 */
public class DeviceHealthModule extends ReactContextBaseJavaModule {

    public DeviceHealthModule(@NonNull ReactApplicationContext ctx) {
        super(ctx);
    }

    @NonNull
    @Override
    public String getName() { return "DeviceHealth"; }

    @ReactMethod
    public void getSecurityChecks(Promise promise) {
        try {
            WritableArray checks = Arguments.createArray();
            ContentResolver cr = getReactApplicationContext().getContentResolver();

            // 1. Screen lock (PIN / pattern / password / biometric)
            android.app.KeyguardManager km = (android.app.KeyguardManager)
                getReactApplicationContext().getSystemService(Context.KEYGUARD_SERVICE);
            boolean screenLock = km != null && km.isKeyguardSecure();
            checks.pushMap(check(
                "screen_lock", "Screen Lock",
                screenLock, "critical",
                screenLock ? "Enabled (PIN/Pattern/Biometric)" : "No lock screen set",
                "Set a PIN, pattern or biometric lock in Security settings.",
                "android.settings.SECURITY_SETTINGS"
            ));

            // 2. Biometric auth (API 29+)
            boolean hasBiometric = false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                hasBiometric = checkBiometric();
            }
            checks.pushMap(check(
                "biometric", "Biometric Authentication",
                hasBiometric, "medium",
                hasBiometric ? "Fingerprint/Face enrolled" : "No biometric enrolled",
                "Enroll a fingerprint or face ID in Security settings for faster secure unlock.",
                "android.settings.SECURITY_SETTINGS"
            ));

            // 3. Root detection
            boolean rooted = isRooted();
            checks.pushMap(check(
                "root", "Root / Superuser Access",
                !rooted, "critical",
                rooted ? "Root access detected (su binary found)" : "Not rooted",
                "A rooted device exposes all apps and data to elevated attack surface. Avoid rooting.",
                null
            ));

            // 4. Developer options
            int devOptions = Settings.Global.getInt(cr, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0);
            checks.pushMap(check(
                "developer_options", "Developer Options",
                devOptions == 0, "high",
                devOptions != 0 ? "Enabled — exposes USB debugging, mock locations" : "Disabled",
                "Disable Developer Options in Settings → About Phone → tap Build Number to toggle.",
                "android.settings.APPLICATION_DEVELOPMENT_SETTINGS"
            ));

            // 5. ADB / USB debugging
            int adbEnabled = Settings.Global.getInt(cr, Settings.Global.ADB_ENABLED, 0);
            checks.pushMap(check(
                "adb_debugging", "USB Debugging (ADB)",
                adbEnabled == 0, "high",
                adbEnabled != 0 ? "Enabled — allows full device control over USB" : "Disabled",
                "Turn off USB Debugging in Developer Options when not actively developing.",
                "android.settings.APPLICATION_DEVELOPMENT_SETTINGS"
            ));

            // 6. Unknown sources / sideloading (pre-Oreo; Oreo+ is per-app in install unknown apps)
            boolean unknownSources = false;
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                unknownSources = Settings.Secure.getInt(
                    cr, Settings.Secure.INSTALL_NON_MARKET_APPS, 0) != 0;
            }
            checks.pushMap(check(
                "unknown_sources", "Unknown App Sources",
                !unknownSources, "high",
                unknownSources ? "Enabled — apps from outside Play Store allowed" : "Disabled",
                "Disable 'Install unknown apps' to block sideloaded APKs from untrusted sources.",
                "android.settings.SECURITY_SETTINGS"
            ));

            // 7. Package verifier (Play Protect proxy)
            int pkgVerifier = Settings.Global.getInt(cr, "package_verifier_enable", 1);
            checks.pushMap(check(
                "play_protect", "Google Play Protect",
                pkgVerifier != 0, "high",
                pkgVerifier != 0 ? "Enabled — scans apps for malware" : "Disabled",
                "Re-enable Play Protect in Play Store → Profile → Play Protect.",
                "android.intent.action.MAIN"
            ));

            // 8. Stay-awake-while-charging (minor indicator of developer use, info only)
            int stayAwake = Settings.Global.getInt(cr, Settings.Global.STAY_ON_WHILE_PLUGGED_IN, 0);
            checks.pushMap(check(
                "stay_awake", "Stay Awake While Charging",
                stayAwake == 0, "info",
                stayAwake != 0 ? "Enabled (Developer Options)" : "Disabled",
                "Turn off 'Stay Awake' in Developer Options — reduces screen exposure when charging.",
                "android.settings.APPLICATION_DEVELOPMENT_SETTINGS"
            ));

            promise.resolve(checks);
        } catch (Exception e) {
            promise.reject("HEALTH_ERROR", e.getMessage(), e);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    @RequiresApi(api = Build.VERSION_CODES.Q)
    private boolean checkBiometric() {
        try {
            BiometricManager bm = BiometricManager.from(getReactApplicationContext());
            return bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK)
                == BiometricManager.BIOMETRIC_SUCCESS;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean isRooted() {
        // Check known su binary locations
        List<String> suPaths = Arrays.asList(
            "/system/bin/su", "/system/xbin/su", "/sbin/su",
            "/system/app/Superuser.apk", "/system/app/SuperSU.apk",
            "/data/local/xbin/su", "/data/local/bin/su",
            "/system/sd/xbin/su", "/system/bin/failsafe/su"
        );
        for (String path : suPaths) {
            if (new File(path).exists()) return true;
        }
        // Check for Magisk (common root framework)
        if (new File("/sbin/.magisk").exists() || new File("/data/adb/magisk").exists()) return true;
        // Try running su (silently)
        try {
            Process p = Runtime.getRuntime().exec(new String[]{"which", "su"});
            BufferedReader br = new BufferedReader(new InputStreamReader(p.getInputStream()));
            return br.readLine() != null;
        } catch (Exception ignored) {}
        return false;
    }

    private static WritableMap check(String id, String label, boolean passed, String severity,
                                      String value, String recommendation, String settingsAction) {
        WritableMap m = Arguments.createMap();
        m.putString("id", id);
        m.putString("label", label);
        m.putBoolean("passed", passed);
        m.putString("severity", severity);
        m.putString("value", value);
        m.putString("recommendation", recommendation);
        m.putString("settingsAction", settingsAction != null ? settingsAction : "");
        return m;
    }
}
