package com.ankr.shield;

import android.app.Activity;
import android.content.Intent;
import android.net.VpnService;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.Arguments;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableNativeArray;
import com.facebook.react.bridge.WritableNativeMap;
import java.util.List;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

/**
 * React Native bridge for DnsVpnService.
 *
 * JS API:
 *   NativeModules.DnsVpn.start()         → Promise<void>   (requests VPN permission if needed)
 *   NativeModules.DnsVpn.stop()          → void
 *   NativeModules.DnsVpn.getStats()      → Promise<Stats>
 *   NativeModules.DnsVpn.isRunning()     → Promise<boolean>
 *
 * JS events (DeviceEventEmitter):
 *   'DnsQueryEvent'  { domain, blocked, category, vendor }
 *
 * Event delivery: direct static listener on DnsVpnService (same process).
 * Avoids Android broadcast implicit-delivery restrictions (API 26+/33+).
 */
public class DnsVpnModule extends ReactContextBaseJavaModule implements ActivityEventListener {

    private static final String MODULE_NAME = "DnsVpn";
    private static final int    VPN_REQ_CODE = 0x0DEF;
    private static final String EVENT_DNS    = "DnsQueryEvent";

    private @Nullable Promise pendingStartPromise;
    private boolean listenerRegistered = false;

    public DnsVpnModule(@NonNull ReactApplicationContext reactContext) {
        super(reactContext);
        reactContext.addActivityEventListener(this);
    }

    @Override
    public void initialize() {
        super.initialize();
        // Register listener immediately — catches the case where VPN was already
        // running before this app session started (service persisted).
        registerDnsListener();
    }

    @NonNull
    @Override
    public String getName() { return MODULE_NAME; }

    // ─── Public JS methods ───────────────────────────────────────────────────

    @ReactMethod
    public void start(Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No current activity");
            return;
        }

        Intent vpnIntent = VpnService.prepare(activity);
        if (vpnIntent != null) {
            pendingStartPromise = promise;
            activity.startActivityForResult(vpnIntent, VPN_REQ_CODE);
        } else {
            doStartVpn(promise);
        }
    }

    @ReactMethod
    public void stop(Promise promise) {
        Intent stopIntent = new Intent(getReactApplicationContext(), DnsVpnService.class);
        stopIntent.setAction("STOP");
        getReactApplicationContext().startService(stopIntent);
        unregisterDnsListener();
        promise.resolve(null);
    }

    @ReactMethod
    public void getStats(Promise promise) {
        WritableMap stats = Arguments.createMap();
        stats.putDouble("totalQueries",   (double) DnsVpnService.totalQueries.get());
        stats.putDouble("blockedCount",   (double) DnsVpnService.blockedCount.get());
        stats.putDouble("allowedCount",   (double) DnsVpnService.allowedCount.get());
        stats.putString("lastBlocked",    DnsVpnService.lastBlockedDomain);
        stats.putBoolean("running",       DnsVpnService.running);
        stats.putBoolean("paused",        DnsVpnService.paused);
        stats.putDouble("pauseUntilMs",   (double) DnsVpnService.pauseUntilMs);
        promise.resolve(stats);
    }

    @ReactMethod
    public void isRunning(Promise promise) {
        promise.resolve(DnsVpnService.running);
    }

    /** Pause DNS filtering for N minutes (intentional browsing bypass). */
    @ReactMethod
    public void pause(double minutes, Promise promise) {
        Intent intent = new Intent(getReactApplicationContext(), DnsVpnService.class);
        intent.setAction("PAUSE");
        intent.putExtra("minutes", (long) minutes);
        getReactApplicationContext().startService(intent);
        promise.resolve(null);
    }

    /** Resume DNS filtering immediately (cancel any active pause). */
    @ReactMethod
    public void resume(Promise promise) {
        Intent intent = new Intent(getReactApplicationContext(), DnsVpnService.class);
        intent.setAction("RESUME");
        getReactApplicationContext().startService(intent);
        promise.resolve(null);
    }

    /** Returns true if DNS filtering is currently paused (call active or manual bypass). */
    @ReactMethod
    public void isPaused(Promise promise) {
        promise.resolve(DnsVpnService.paused);
    }

    // ─── VPN permission result ───────────────────────────────────────────────

    @Override
    public void onActivityResult(Activity activity, int requestCode, int resultCode, @Nullable Intent data) {
        if (requestCode != VPN_REQ_CODE) return;
        if (resultCode == Activity.RESULT_OK) {
            doStartVpn(pendingStartPromise);
        } else {
            if (pendingStartPromise != null) {
                pendingStartPromise.reject("PERMISSION_DENIED", "VPN permission denied by user");
            }
        }
        pendingStartPromise = null;
    }

    @Override
    public void onNewIntent(Intent intent) {}

    // ─── Internal helpers ────────────────────────────────────────────────────

    private void doStartVpn(@Nullable Promise promise) {
        Intent startIntent = new Intent(getReactApplicationContext(), DnsVpnService.class);
        getReactApplicationContext().startService(startIntent);
        registerDnsListener();
        if (promise != null) promise.resolve(null);
    }

    private void registerDnsListener() {
        if (listenerRegistered) return;
        DnsVpnService.dnsEventListener = (domain, blocked, category, vendor) -> {
            WritableMap params = Arguments.createMap();
            params.putString("domain",   domain);
            params.putBoolean("blocked", blocked);
            params.putString("category", category != null ? category : "");
            params.putString("vendor",   vendor != null ? vendor : "");
            sendEvent(EVENT_DNS, params);
        };
        listenerRegistered = true;
    }

    private void unregisterDnsListener() {
        DnsVpnService.dnsEventListener = null;
        listenerRegistered = false;
    }

    private void sendEvent(String eventName, @Nullable WritableMap params) {
        try {
            getReactApplicationContext()
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, params);
        } catch (Exception ignored) {}
    }


    /** Returns list of installed user apps {packageName, appName, icon}. */
    @ReactMethod
    public void getInstalledApps(Promise promise) {
        PackageManager pm = getReactApplicationContext().getPackageManager();
        List<ApplicationInfo> apps = pm.getInstalledApplications(PackageManager.GET_META_DATA);
        WritableArray result = new WritableNativeArray();
        String myPkg = getReactApplicationContext().getPackageName();
        for (ApplicationInfo app : apps) {
            // Skip system apps and ourselves
            if ((app.flags & ApplicationInfo.FLAG_SYSTEM) != 0) continue;
            if (app.packageName.equals(myPkg)) continue;
            WritableNativeMap entry = new WritableNativeMap();
            entry.putString("packageName", app.packageName);
            entry.putString("appName", (String) pm.getApplicationLabel(app));
            entry.putBoolean("bypassed", DnsVpnService.bypassPackages.contains(app.packageName));
            result.pushMap(entry);
        }
        promise.resolve(result);
    }

    /** Set the full bypass list; restarts VPN interface if running. */
    @ReactMethod
    public void setBypassApps(ReadableArray packages, Promise promise) {
        DnsVpnService.bypassPackages.clear();
        for (int i = 0; i < packages.size(); i++) {
            DnsVpnService.bypassPackages.add(packages.getString(i));
        }
        if (DnsVpnService.running) {
            // Rebuild VPN to apply new bypass list
            Intent intent = new Intent(getReactApplicationContext(), DnsVpnService.class);
            intent.setAction("REBUILD");
            getReactApplicationContext().startService(intent);
        }
        promise.resolve(null);
    }

    /** Toggle one package in/out of the bypass list. */
    @ReactMethod
    public void toggleBypassApp(String packageName, boolean bypass, Promise promise) {
        if (bypass) DnsVpnService.bypassPackages.add(packageName);
        else        DnsVpnService.bypassPackages.remove(packageName);
        if (DnsVpnService.running) {
            Intent intent = new Intent(getReactApplicationContext(), DnsVpnService.class);
            intent.setAction("REBUILD");
            getReactApplicationContext().startService(intent);
        }
        promise.resolve(null);
    }

    /** Get current bypass list as array of package name strings. */
    @ReactMethod
    public void getBypassApps(Promise promise) {
        WritableArray result = new WritableNativeArray();
        for (String pkg : DnsVpnService.bypassPackages) result.pushString(pkg);
        promise.resolve(result);
    }

    /** Enable or disable passive mode (detect but never block). */
    @ReactMethod
    public void setPassiveMode(boolean enabled, Promise promise) {
        DnsVpnService.passiveMode = enabled;
        promise.resolve(null);
    }

    @ReactMethod
    public void isPassiveMode(Promise promise) {
        promise.resolve(DnsVpnService.passiveMode);
    }

    @ReactMethod
    public void addListener(String eventName) {}  // Required for RN event emitter

    @ReactMethod
    public void removeListeners(Integer count) {}  // Required for RN event emitter
}
