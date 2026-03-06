package com.ankr.shield;

import android.content.SharedPreferences;
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

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;

/**
 * PermissionWatcherModule — detects when installed apps gain or lose permissions after updates.
 *
 * Workflow:
 *   1. User calls snapshotPermissions() → baseline stored in SharedPreferences.
 *   2. After time passes (app updates), user calls getPermissionDiffs().
 *   3. Module compares current grants vs. baseline and returns the delta.
 *
 * JS API:
 *   NativeModules.PermissionWatcher.snapshotPermissions()  → Promise<{ count, snapshotAt }>
 *   NativeModules.PermissionWatcher.hasSnapshot()          → Promise<{ has, snapshotAt, count }>
 *   NativeModules.PermissionWatcher.getPermissionDiffs()   → Promise<DiffEntry[]>
 *   NativeModules.PermissionWatcher.clearSnapshot()        → Promise<boolean>
 *
 * DiffEntry: { packageName, appName, added: string[], removed: string[], snapshotAt: number }
 */
public class PermissionWatcherModule extends ReactContextBaseJavaModule {

    private static final String PREFS = "ankr_perm_watcher";
    private static final String KEY_SNAPSHOT   = "permission_snapshot";
    private static final String KEY_SNAPSHOT_AT = "snapshot_at";

    public PermissionWatcherModule(@NonNull ReactApplicationContext ctx) {
        super(ctx);
    }

    @NonNull
    @Override
    public String getName() { return "PermissionWatcher"; }

    /** Take a fresh baseline snapshot of all installed apps and their granted permissions. */
    @ReactMethod
    public void snapshotPermissions(Promise promise) {
        try {
            JSONObject snapshot = buildSnapshot();
            long now = System.currentTimeMillis();

            SharedPreferences prefs = getReactApplicationContext()
                .getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
            prefs.edit()
                .putString(KEY_SNAPSHOT, snapshot.toString())
                .putLong(KEY_SNAPSHOT_AT, now)
                .apply();

            WritableMap result = Arguments.createMap();
            result.putInt("count", snapshot.length());
            result.putDouble("snapshotAt", now);
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("SNAPSHOT_ERROR", e.getMessage(), e);
        }
    }

    /** Returns whether a snapshot exists and when it was taken. */
    @ReactMethod
    public void hasSnapshot(Promise promise) {
        try {
            SharedPreferences prefs = getReactApplicationContext()
                .getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
            boolean has = prefs.contains(KEY_SNAPSHOT);
            long snapshotAt = prefs.getLong(KEY_SNAPSHOT_AT, 0);

            WritableMap result = Arguments.createMap();
            result.putBoolean("has", has);
            result.putDouble("snapshotAt", snapshotAt);
            if (has) {
                try {
                    JSONObject snap = new JSONObject(prefs.getString(KEY_SNAPSHOT, "{}"));
                    result.putInt("count", snap.length());
                } catch (Exception e) {
                    result.putInt("count", 0);
                }
            } else {
                result.putInt("count", 0);
            }
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("SNAPSHOT_CHECK_ERROR", e.getMessage(), e);
        }
    }

    /** Compare current grants against the stored baseline and return permission diffs. */
    @ReactMethod
    public void getPermissionDiffs(Promise promise) {
        try {
            SharedPreferences prefs = getReactApplicationContext()
                .getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
            String raw = prefs.getString(KEY_SNAPSHOT, null);
            if (raw == null) {
                promise.reject("NO_SNAPSHOT", "No baseline snapshot. Call snapshotPermissions() first.");
                return;
            }
            long snapshotAt = prefs.getLong(KEY_SNAPSHOT_AT, 0);
            JSONObject baseline = new JSONObject(raw);
            JSONObject current = buildSnapshot();

            WritableArray diffs = Arguments.createArray();

            // Apps present in current (new grants or changes)
            Iterator<String> pkgIt = current.keys();
            while (pkgIt.hasNext()) {
                String pkg = pkgIt.next();
                JSONObject cur = current.getJSONObject(pkg);
                JSONArray curPerms = cur.getJSONArray("permissions");

                Set<String> curSet = jsonArrayToSet(curPerms);
                Set<String> baseSet = new HashSet<>();
                if (baseline.has(pkg)) {
                    baseSet = jsonArrayToSet(baseline.getJSONObject(pkg).getJSONArray("permissions"));
                }

                Set<String> added   = new HashSet<>(curSet);  added.removeAll(baseSet);
                Set<String> removed = new HashSet<>(baseSet); removed.removeAll(curSet);

                if (!added.isEmpty() || !removed.isEmpty()) {
                    WritableMap diff = Arguments.createMap();
                    diff.putString("packageName", pkg);
                    diff.putString("appName", cur.optString("appName", pkg));
                    diff.putArray("added",   setToWritableArray(added));
                    diff.putArray("removed", setToWritableArray(removed));
                    diff.putDouble("snapshotAt", snapshotAt);
                    diffs.pushMap(diff);
                }
            }

            // Apps that were removed entirely (all permissions gone)
            Iterator<String> baseIt = baseline.keys();
            while (baseIt.hasNext()) {
                String pkg = baseIt.next();
                if (!current.has(pkg)) {
                    JSONObject base = baseline.getJSONObject(pkg);
                    Set<String> baseSet = jsonArrayToSet(base.getJSONArray("permissions"));
                    if (!baseSet.isEmpty()) {
                        WritableMap diff = Arguments.createMap();
                        diff.putString("packageName", pkg);
                        diff.putString("appName", base.optString("appName", pkg));
                        diff.putArray("added",   Arguments.createArray());
                        diff.putArray("removed", setToWritableArray(baseSet));
                        diff.putDouble("snapshotAt", snapshotAt);
                        diffs.pushMap(diff);
                    }
                }
            }

            promise.resolve(diffs);
        } catch (Exception e) {
            promise.reject("DIFF_ERROR", e.getMessage(), e);
        }
    }

    /** Erase the stored snapshot so the user can start fresh. */
    @ReactMethod
    public void clearSnapshot(Promise promise) {
        getReactApplicationContext()
            .getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
            .edit().remove(KEY_SNAPSHOT).remove(KEY_SNAPSHOT_AT).apply();
        promise.resolve(true);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Build a JSON map of packageName → { appName, permissions[] } for all installed apps. */
    private JSONObject buildSnapshot() throws Exception {
        PackageManager pm = getReactApplicationContext().getPackageManager();
        List<ApplicationInfo> apps = pm.getInstalledApplications(PackageManager.GET_META_DATA);
        JSONObject snapshot = new JSONObject();

        for (ApplicationInfo app : apps) {
            try {
                PackageInfo pkgInfo = pm.getPackageInfo(app.packageName, PackageManager.GET_PERMISSIONS);
                if (pkgInfo.requestedPermissions == null) continue;

                JSONArray perms = new JSONArray();
                for (int i = 0; i < pkgInfo.requestedPermissions.length; i++) {
                    boolean granted = (pkgInfo.requestedPermissionsFlags != null)
                        && (pkgInfo.requestedPermissionsFlags[i]
                            & PackageInfo.REQUESTED_PERMISSION_GRANTED) != 0;
                    if (!granted) continue;
                    String p = pkgInfo.requestedPermissions[i];
                    String short_ = p.startsWith("android.permission.")
                        ? p.substring("android.permission.".length()) : p;
                    perms.put(short_);
                }
                if (perms.length() == 0) continue;

                String label;
                try { label = pm.getApplicationLabel(app).toString(); }
                catch (Exception e) { label = app.packageName; }

                JSONObject entry = new JSONObject();
                entry.put("appName", label);
                entry.put("permissions", perms);
                snapshot.put(app.packageName, entry);
            } catch (PackageManager.NameNotFoundException ignored) {}
        }
        return snapshot;
    }

    private static Set<String> jsonArrayToSet(JSONArray arr) throws Exception {
        Set<String> set = new HashSet<>();
        for (int i = 0; i < arr.length(); i++) set.add(arr.getString(i));
        return set;
    }

    private static WritableArray setToWritableArray(Set<String> set) {
        WritableArray arr = Arguments.createArray();
        for (String s : set) arr.pushString(s);
        return arr;
    }
}
