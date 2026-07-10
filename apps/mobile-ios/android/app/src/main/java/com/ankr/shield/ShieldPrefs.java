package com.ankr.shield;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * ShieldPrefs — persistent state for the DNS shield (ASCT-T2.4).
 *
 * Two bypass sets, deliberately separate:
 *   - USER set: apps the user explicitly excluded (Split Tunnel toggles).
 *     Honored in every mode.
 *   - AUTO set: financial apps seeded by Intelligent mode so banking apps
 *     play normal without configuration. Honored only in INTELLIGENT mode;
 *     GUARD mode ("overreach guards") ignores auto entries — protection
 *     over compatibility, by explicit user choice.
 *
 * A financial app the user manually re-enables is remembered in AUTO_REMOVED
 * and never re-seeded.
 *
 * Modes (ASCT scope-transparency):
 *   INTELLIGENT (default) — non-intrusive by itself, maximum information:
 *     known trackers blocked, banking auto-bypassed, call auto-pause.
 *   GUARD — overreach guards enabled: auto bypasses ignored, only explicit
 *     user exclusions honored.
 */
final class ShieldPrefs {

    static final String MODE_INTELLIGENT = "intelligent";
    static final String MODE_GUARD       = "guard";

    private static final String STORE        = "ankrshield_dns";
    private static final String KEY_USER     = "bypass_user";
    private static final String KEY_AUTO     = "bypass_auto";
    private static final String KEY_REMOVED  = "bypass_auto_removed";
    private static final String KEY_SEEDED   = "bypass_seeded_v1";
    private static final String KEY_MODE     = "shield_mode";

    private ShieldPrefs() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(STORE, Context.MODE_PRIVATE);
    }

    static String getMode(Context ctx) {
        return prefs(ctx).getString(KEY_MODE, MODE_INTELLIGENT);
    }

    static void setMode(Context ctx, String mode) {
        String m = MODE_GUARD.equals(mode) ? MODE_GUARD : MODE_INTELLIGENT;
        prefs(ctx).edit().putString(KEY_MODE, m).apply();
    }

    static Set<String> getUserBypass(Context ctx) {
        return new HashSet<>(prefs(ctx).getStringSet(KEY_USER, Collections.emptySet()));
    }

    static Set<String> getAutoBypass(Context ctx) {
        return new HashSet<>(prefs(ctx).getStringSet(KEY_AUTO, Collections.emptySet()));
    }

    static Set<String> getAutoRemoved(Context ctx) {
        return new HashSet<>(prefs(ctx).getStringSet(KEY_REMOVED, Collections.emptySet()));
    }

    static boolean isSeeded(Context ctx) {
        return prefs(ctx).getBoolean(KEY_SEEDED, false);
    }

    static void saveSeed(Context ctx, Set<String> auto) {
        prefs(ctx).edit()
            .putStringSet(KEY_AUTO, auto)
            .putBoolean(KEY_SEEDED, true)
            .apply();
    }

    /** User toggled a package. Keeps user/auto/removed sets consistent. */
    static void setUserToggle(Context ctx, String pkg, boolean bypass) {
        Set<String> user    = getUserBypass(ctx);
        Set<String> auto    = getAutoBypass(ctx);
        Set<String> removed = getAutoRemoved(ctx);

        if (bypass) {
            user.add(pkg);
            removed.remove(pkg);
        } else {
            user.remove(pkg);
            if (auto.remove(pkg)) removed.add(pkg); // never re-seed what the user un-bypassed
        }
        prefs(ctx).edit()
            .putStringSet(KEY_USER, user)
            .putStringSet(KEY_AUTO, auto)
            .putStringSet(KEY_REMOVED, removed)
            .apply();
    }

    static void replaceUserBypass(Context ctx, Set<String> user) {
        prefs(ctx).edit().putStringSet(KEY_USER, user).apply();
    }

    /** Effective set the VPN should exclude, given the current mode. */
    static Set<String> effectiveBypass(Context ctx) {
        Set<String> eff = getUserBypass(ctx);
        if (MODE_INTELLIGENT.equals(getMode(ctx))) {
            eff.addAll(getAutoBypass(ctx));
        }
        return eff;
    }
}
