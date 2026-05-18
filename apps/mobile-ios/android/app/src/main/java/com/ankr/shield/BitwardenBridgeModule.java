package com.ankr.shield;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

/**
 * BitwardenBridgeModule — React Native bridge for Bitwarden password manager.
 *
 * Allows AnkrShield to:
 *   1. Check if Bitwarden is installed
 *   2. Open Bitwarden's autofill accessibility settings
 *   3. Deep-link into the Bitwarden vault (generic vault open)
 *   4. Trigger the Bitwarden autofill service setup intent
 *
 * Privacy note: AnkrShield NEVER reads vault contents. The module only
 * launches Bitwarden via public Android intents.
 *
 * JS API:
 *   BitwardenBridge.getStatus()  → Promise<{ installed, autofillEnabled, packageName }>
 *   BitwardenBridge.openVault()  → void (launches Bitwarden main activity)
 *   BitwardenBridge.openSetup()  → void (opens accessibility settings for autofill setup)
 *   BitwardenBridge.installPrompt() → void (opens Play Store listing)
 */
public class BitwardenBridgeModule extends ReactContextBaseJavaModule {

    private static final String MODULE_NAME = "BitwardenBridge";

    // Both free and premium APK package names
    private static final String BITWARDEN_PKG       = "com.x8bit.bitwarden";
    private static final String BITWARDEN_BETA_PKG  = "com.x8bit.bitwarden.beta";

    // Bitwarden's autofill service component
    private static final String BITWARDEN_AUTOFILL_SERVICE =
        "com.x8bit.bitwarden/.autofill.BitwardenAutofillService";

    public BitwardenBridgeModule(@NonNull ReactApplicationContext context) {
        super(context);
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    // ── isInstalled helper ────────────────────────────────────────────────────

    private String getInstalledPkg() {
        PackageManager pm = getReactApplicationContext().getPackageManager();
        for (String pkg : new String[]{BITWARDEN_PKG, BITWARDEN_BETA_PKG}) {
            try {
                pm.getPackageInfo(pkg, 0);
                return pkg;
            } catch (PackageManager.NameNotFoundException ignored) {}
        }
        return null;
    }

    // ── getStatus ─────────────────────────────────────────────────────────────

    @ReactMethod
    public void getStatus(Promise promise) {
        try {
            String pkg = getInstalledPkg();
            boolean installed = pkg != null;

            // Check if Bitwarden's accessibility service is enabled
            boolean autofillEnabled = false;
            if (installed) {
                String enabledServices = android.provider.Settings.Secure.getString(
                    getReactApplicationContext().getContentResolver(),
                    android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
                autofillEnabled = enabledServices != null &&
                    enabledServices.contains(BITWARDEN_AUTOFILL_SERVICE);
            }

            WritableMap result = Arguments.createMap();
            result.putBoolean("installed",       installed);
            result.putBoolean("autofillEnabled", autofillEnabled);
            result.putString("packageName",      pkg != null ? pkg : "");

            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("STATUS_ERROR", e.getMessage(), e);
        }
    }

    // ── openVault ─────────────────────────────────────────────────────────────

    @ReactMethod
    public void openVault() {
        String pkg = getInstalledPkg();
        if (pkg == null) return;

        try {
            Intent intent = getReactApplicationContext()
                .getPackageManager()
                .getLaunchIntentForPackage(pkg);
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getReactApplicationContext().startActivity(intent);
            }
        } catch (Exception e) {
            // Ignore — Bitwarden may not be installed or launchable
        }
    }

    // ── openSetup ─────────────────────────────────────────────────────────────

    /**
     * Opens Android Accessibility Settings so the user can enable
     * Bitwarden's autofill accessibility service.
     */
    @ReactMethod
    public void openSetup() {
        try {
            Intent intent = new Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getReactApplicationContext().startActivity(intent);
        } catch (Exception e) {
            // Fallback: open general Settings
            Intent fallback = new Intent(android.provider.Settings.ACTION_SETTINGS);
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getReactApplicationContext().startActivity(fallback);
        }
    }

    // ── installPrompt ─────────────────────────────────────────────────────────

    @ReactMethod
    public void installPrompt() {
        try {
            Intent intent = new Intent(
                Intent.ACTION_VIEW,
                Uri.parse("https://play.google.com/store/apps/details?id=" + BITWARDEN_PKG));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getReactApplicationContext().startActivity(intent);
        } catch (Exception e) {
            // No browser / Play Store available
        }
    }
}
