import Foundation
import AVFoundation
import Contacts
import CoreLocation
import Photos
import UserNotifications

/// PermissionAuditModule — iOS equivalent of Android's AppScannerModule.
///
/// Audits the current app's permission grants (Camera, Mic, Contacts,
/// Location, Photos, Notifications) and exposes results to React Native.
///
/// JS API:
///   PermissionAuditModule.audit()
///     → Promise<PermissionReport[]>
///
/// Where PermissionReport = { permission, status, risk }

@objc(PermissionAuditModule)
final class PermissionAuditModule: NSObject {

    @objc static func requiresMainQueueSetup() -> Bool { false }

    @objc func audit(_ resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
        Task { @MainActor in
            var results: [[String: Any]] = []

            // ── Camera ────────────────────────────────────────────────────────
            let camStatus = AVCaptureDevice.authorizationStatus(for: .video)
            results.append([
                "permission": "Camera",
                "status":     camStatus.label,
                "granted":    camStatus == .authorized,
                "risk":       "LOW",
                "icon":       "📷",
            ])

            // ── Microphone ────────────────────────────────────────────────────
            let micStatus = AVCaptureDevice.authorizationStatus(for: .audio)
            results.append([
                "permission": "Microphone",
                "status":     micStatus.label,
                "granted":    micStatus == .authorized,
                "risk":       "MEDIUM",
                "icon":       "🎤",
            ])

            // ── Contacts ──────────────────────────────────────────────────────
            let contactStatus = CNContactStore.authorizationStatus(for: .contacts)
            results.append([
                "permission": "Contacts",
                "status":     contactStatus.label,
                "granted":    contactStatus == .authorized,
                "risk":       "HIGH",
                "icon":       "👤",
            ])

            // ── Location ──────────────────────────────────────────────────────
            let locMgr = CLLocationManager()
            let locStatus = locMgr.authorizationStatus
            results.append([
                "permission": "Location",
                "status":     locStatus.label,
                "granted":    locStatus == .authorizedWhenInUse || locStatus == .authorizedAlways,
                "alwaysOn":   locStatus == .authorizedAlways,
                "risk":       locStatus == .authorizedAlways ? "HIGH" : "MEDIUM",
                "icon":       "📍",
            ])

            // ── Photos ────────────────────────────────────────────────────────
            let photoStatus = PHPhotoLibrary.authorizationStatus(for: .readWrite)
            results.append([
                "permission": "Photos",
                "status":     photoStatus.label,
                "granted":    photoStatus == .authorized || photoStatus == .limited,
                "limited":    photoStatus == .limited,
                "risk":       "MEDIUM",
                "icon":       "🖼️",
            ])

            // ── Notifications ─────────────────────────────────────────────────
            let notifSettings = await UNUserNotificationCenter.current().notificationSettings()
            let notifGranted  = notifSettings.authorizationStatus == .authorized
            results.append([
                "permission": "Notifications",
                "status":     notifSettings.authorizationStatus.label,
                "granted":    notifGranted,
                "risk":       "LOW",
                "icon":       "🔔",
            ])

            // ── Privacy Score ─────────────────────────────────────────────────
            let highRiskGranted = results.filter {
                ($0["risk"] as? String) == "HIGH" && ($0["granted"] as? Bool == true)
            }.count
            let score = max(0, 100 - highRiskGranted * 20 - results.filter { $0["granted"] as? Bool == true }.count * 5)

            resolve([
                "permissions": results,
                "privacyScore": score,
                "scannedAt": ISO8601DateFormatter().string(from: Date()),
            ])
        }
    }
}

// ── Label helpers ─────────────────────────────────────────────────────────────

private extension AVAuthorizationStatus {
    var label: String {
        switch self {
        case .authorized:          return "granted"
        case .denied:              return "denied"
        case .restricted:          return "restricted"
        case .notDetermined:       return "not_asked"
        @unknown default:          return "unknown"
        }
    }
}

private extension CNAuthorizationStatus {
    var label: String {
        switch self {
        case .authorized:          return "granted"
        case .denied:              return "denied"
        case .restricted:          return "restricted"
        case .notDetermined:       return "not_asked"
        @unknown default:          return "unknown"
        }
    }
}

private extension CLAuthorizationStatus {
    var label: String {
        switch self {
        case .authorizedAlways:    return "always"
        case .authorizedWhenInUse: return "when_in_use"
        case .denied:              return "denied"
        case .restricted:          return "restricted"
        case .notDetermined:       return "not_asked"
        @unknown default:          return "unknown"
        }
    }
}

private extension PHAuthorizationStatus {
    var label: String {
        switch self {
        case .authorized:          return "granted"
        case .limited:             return "limited"
        case .denied:              return "denied"
        case .restricted:          return "restricted"
        case .notDetermined:       return "not_asked"
        @unknown default:          return "unknown"
        }
    }
}

private extension UNAuthorizationStatus {
    var label: String {
        switch self {
        case .authorized:          return "granted"
        case .denied:              return "denied"
        case .provisional:         return "provisional"
        case .ephemeral:           return "ephemeral"
        case .notDetermined:       return "not_asked"
        @unknown default:          return "unknown"
        }
    }
}
