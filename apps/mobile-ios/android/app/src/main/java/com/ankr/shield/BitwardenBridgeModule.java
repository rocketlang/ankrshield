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

    private static final String MODULE_NAME = "BitwardenBridge"; // JS name kept for compat

    // Recommended default when none is installed (open-source, auditable, free).
    private static final String RECOMMENDED_PKG = "com.x8bit.bitwarden";

    // Known password managers, package → display name. Bitwarden first (recommended).
    // Detection is brand-neutral: whichever the user already uses is honoured.
    private static final String[][] PASSWORD_MANAGERS = {
        {"com.x8bit.bitwarden",                 "Bitwarden"},
        {"com.x8bit.bitwarden.beta",            "Bitwarden (Beta)"},
        {"proton.android.pass",                 "Proton Pass"},
        {"com.kunzisoft.keepass.free",          "KeePassDX"},
        {"com.kunzisoft.keepass.libre",         "KeePassDX"},
        {"keepass2android.keepass2android",     "KeePass2Android"},
        {"keepass2android.keepass2android_nonet","KeePass2Android Offline"},
        {"com.lastpass.lpandroid",              "LastPass"},
        {"com.agilebits.onepassword",           "1Password"},
        {"io.enpass.app",                       "Enpass"},
        {"com.dashlane",                        "Dashlane"},
        {"com.nordpass.android.app",            "NordPass"},
        {"com.zoho.vault",                      "Zoho Vault"},
    };

    public BitwardenBridgeModule(@NonNull ReactApplicationContext context) {
        super(context);
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    // ── detection ─────────────────────────────────────────────────────────────

    /** Returns {package, displayName} of the first installed manager, or null. */
    private String[] getInstalledManager() {
        PackageManager pm = getReactApplicationContext().getPackageManager();
        for (String[] mgr : PASSWORD_MANAGERS) {
            try {
                pm.getPackageInfo(mgr[0], 0);
                return mgr;
            } catch (PackageManager.NameNotFoundException ignored) {}
        }
        return null;
    }

    /** True if the given package is the device's selected autofill service, or has an
     *  enabled accessibility service (older autofill path). */
    private boolean isAutofillActive(String pkg) {
        try {
            String autofill = android.provider.Settings.Secure.getString(
                getReactApplicationContext().getContentResolver(), "autofill_service");
            if (autofill != null && autofill.contains(pkg)) return true;
            String a11y = android.provider.Settings.Secure.getString(
                getReactApplicationContext().getContentResolver(),
                android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            return a11y != null && a11y.contains(pkg);
        } catch (Exception e) {
            return false;
        }
    }

    // ── getStatus ─────────────────────────────────────────────────────────────

    @ReactMethod
    public void getStatus(Promise promise) {
        try {
            String[] mgr = getInstalledManager();
            boolean installed = mgr != null;

            WritableMap result = Arguments.createMap();
            result.putBoolean("installed",       installed);
            result.putBoolean("autofillEnabled", installed && isAutofillActive(mgr[0]));
            result.putString("packageName",      installed ? mgr[0] : "");
            result.putString("managerName",      installed ? mgr[1] : "");

            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("STATUS_ERROR", e.getMessage(), e);
        }
    }

    // ── openVault ─────────────────────────────────────────────────────────────

    @ReactMethod
    public void openVault() {
        String[] mgr = getInstalledManager();
        String pkg = mgr != null ? mgr[0] : null;
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
                Uri.parse("https://play.google.com/store/apps/details?id=" + RECOMMENDED_PKG));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getReactApplicationContext().startActivity(intent);
        } catch (Exception e) {
            // No browser / Play Store available
        }
    }
}
