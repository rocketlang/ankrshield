# ============================================================
# AnkrShield Release ProGuard Rules
# ============================================================

# ── React Native core ────────────────────────────────────────
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# ── AnkrShield native modules (ReactContextBaseJavaModule subclasses) ─────────
-keep class com.ankr.shield.DnsVpnModule { *; }
-keep class com.ankr.shield.DnsVpnPackage { *; }
-keep class com.ankr.shield.AppScannerModule { *; }
-keep class com.ankr.shield.AppScannerPackage { *; }
-keep class com.ankr.shield.WhatsAppGuardModule { *; }
-keep class com.ankr.shield.WhatsAppGuardPackage { *; }
-keep class com.ankr.shield.RansomwareWatcherModule { *; }
-keep class com.ankr.shield.RansomwareWatcherPackage { *; }
-keep class com.ankr.shield.PermissionWatcherModule { *; }
-keep class com.ankr.shield.PermissionWatcherPackage { *; }
-keep class com.ankr.shield.WidgetModule { *; }
-keep class com.ankr.shield.WidgetPackage { *; }
-keep class com.ankr.shield.MdmStorageModule { *; }
-keep class com.ankr.shield.MdmStoragePackage { *; }
-keep class com.ankr.shield.QuickTileModule { *; }
-keep class com.ankr.shield.QuickTilePackage { *; }
-keep class com.ankr.shield.ShieldNotificationModule { *; }
-keep class com.ankr.shield.ShieldNotificationPackage { *; }
-keep class com.ankr.shield.DeviceHealthModule { *; }
-keep class com.ankr.shield.DeviceHealthPackage { *; }
-keep class com.ankr.shield.UpiGuardModule { *; }
-keep class com.ankr.shield.UpiGuardPackage { *; }
-keep class com.ankr.shield.AvScannerModule { *; }
-keep class com.ankr.shield.AvScannerPackage { *; }
-keep class com.ankr.shield.AntiTheftModule { *; }
-keep class com.ankr.shield.AntiTheftPackage { *; }
-keep class com.ankr.shield.AnkrShieldAdminReceiver { *; }
-keep class com.ankr.shield.BitwardenBridgeModule { *; }
-keep class com.ankr.shield.BitwardenBridgePackage { *; }
-keep class com.ankr.shield.CallGuardMLModule { *; }
-keep class com.ankr.shield.CallGuardMLPackage { *; }
# Keep TFLite if bundled
-keep class org.tensorflow.lite.** { *; }

# ── Keep all @ReactMethod annotations ────────────────────────
-keepclassmembers class * extends com.facebook.react.bridge.ReactContextBaseJavaModule {
    @com.facebook.react.bridge.ReactMethod <methods>;
}

# ── Android services, receivers, widgets ─────────────────────
-keep class com.ankr.shield.DnsVpnService { *; }
-keep class com.ankr.shield.WhatsAppGuardService { *; }
-keep class com.ankr.shield.WhatsAppGuardService$ScanEntry { *; }
-keep class com.ankr.shield.RansomwareWatcherService { *; }
-keep class com.ankr.shield.RansomwareWatcherService$RansomwareAlert { *; }
-keep class com.ankr.shield.RansomwareWatcherService$RansomwareListener { *; }
-keep class com.ankr.shield.AnkrShieldAccessibilityService { *; }
-keep class com.ankr.shield.AnkrShieldAccessibilityService$PhishingAlert { *; }
-keep class com.ankr.shield.AnkrShieldAccessibilityService$ImpersonationAlert { *; }
-keep class com.ankr.shield.ShieldNotificationService { *; }
-keep class com.ankr.shield.ShieldStatusWidget { *; }
-keep class com.ankr.shield.QuickShieldTile { *; }
-keep class com.ankr.shield.BootReceiver { *; }
-keep class com.ankr.shield.ThreatActionReceiver { *; }
-keep class com.ankr.shield.ThreatReporter { *; }

# ── Application / Activity ────────────────────────────────────
-keep class com.ankr.shield.MainApplication { *; }
-keep class com.ankr.shield.MainActivity { *; }
-keep class com.ankr.shield.NotificationChannels { *; }

# ── Kotlin metadata (required for Kotlin coroutines / reflection) ─────────────
-keep class kotlin.Metadata { *; }
-keepclassmembers class **$WhenMappings { <fields>; }

# ── Expo modules ─────────────────────────────────────────────
-keep class expo.modules.** { *; }
-keep class com.swmansion.** { *; }

# ── JSON / Okio / OkHttp (used by RN networking) ─────────────
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-keep class org.json.** { *; }

# ── Suppress warnings for optional dependencies ───────────────
-dontwarn com.facebook.react.flipper.**
-dontwarn com.android.installreferrer.**
