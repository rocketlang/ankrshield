package com.ankr.shield;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.VpnService;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
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
 */
public class DnsVpnModule extends ReactContextBaseJavaModule implements ActivityEventListener {

    private static final String MODULE_NAME    = "DnsVpn";
    private static final int    VPN_REQ_CODE   = 0x0DEF;
    private static final String EVENT_DNS      = "DnsQueryEvent";

    private @Nullable Promise   pendingStartPromise;
    private BroadcastReceiver   dnsEventReceiver;
    private boolean             receiverRegistered = false;

    public DnsVpnModule(@NonNull ReactApplicationContext reactContext) {
        super(reactContext);
        reactContext.addActivityEventListener(this);
    }

    @Override
    public void initialize() {
        super.initialize();
        // If VPN was already running before the app (re)started, register the
        // broadcast receiver immediately so DNS events flow to JS right away.
        if (DnsVpnService.running) {
            registerDnsReceiver();
        }
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
            // OS needs to show the VPN permission dialog
            pendingStartPromise = promise;
            activity.startActivityForResult(vpnIntent, VPN_REQ_CODE);
        } else {
            // Permission already granted
            doStartVpn(promise);
        }
    }

    @ReactMethod
    public void stop(Promise promise) {
        Intent stopIntent = new Intent(getReactApplicationContext(), DnsVpnService.class);
        stopIntent.setAction("STOP");
        getReactApplicationContext().startService(stopIntent);
        unregisterDnsReceiver();
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
        promise.resolve(stats);
    }

    @ReactMethod
    public void isRunning(Promise promise) {
        promise.resolve(DnsVpnService.running);
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
        Context ctx = getReactApplicationContext();
        Intent startIntent = new Intent(ctx, DnsVpnService.class);
        ctx.startService(startIntent);
        registerDnsReceiver();
        if (promise != null) promise.resolve(null);
    }

    private void registerDnsReceiver() {
        if (receiverRegistered) return;
        dnsEventReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (!DnsVpnService.ACTION_DNS_EVENT.equals(intent.getAction())) return;
                WritableMap params = Arguments.createMap();
                params.putString("domain",   intent.getStringExtra(DnsVpnService.EXTRA_DOMAIN));
                params.putBoolean("blocked", intent.getBooleanExtra(DnsVpnService.EXTRA_BLOCKED, false));
                params.putString("category", intent.getStringExtra(DnsVpnService.EXTRA_CATEGORY));
                params.putString("vendor",   intent.getStringExtra(DnsVpnService.EXTRA_VENDOR));
                sendEvent(EVENT_DNS, params);
            }
        };
        IntentFilter filter = new IntentFilter(DnsVpnService.ACTION_DNS_EVENT);
        // Android 13+ (API 33) requires explicit exported flag on registerReceiver
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getReactApplicationContext().registerReceiver(
                dnsEventReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getReactApplicationContext().registerReceiver(dnsEventReceiver, filter);
        }
        receiverRegistered = true;
    }

    private void unregisterDnsReceiver() {
        if (!receiverRegistered || dnsEventReceiver == null) return;
        try {
            getReactApplicationContext().unregisterReceiver(dnsEventReceiver);
        } catch (Exception ignored) {}
        receiverRegistered = false;
    }

    private void sendEvent(String eventName, @Nullable WritableMap params) {
        try {
            getReactApplicationContext()
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, params);
        } catch (Exception ignored) {}
    }

    @ReactMethod
    public void addListener(String eventName) {}  // Required for RN event emitter

    @ReactMethod
    public void removeListeners(Integer count) {}  // Required for RN event emitter
}
