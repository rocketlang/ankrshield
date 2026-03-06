import Foundation
import UIKit
import LocalAuthentication

/// iOSHealthModule — iOS device security posture check.
///
/// Equivalent of Android's DeviceHealthModule.
/// Checks: passcode, biometrics, jailbreak indicators, iOS version, storage.
///
/// JS API:
///   iOSHealthModule.getHealthReport()
///     → Promise<{ score, checks[], isJailbroken }>

@objc(IOSHealthModule)
final class iOSHealthModule: NSObject {

    @objc static func requiresMainQueueSetup() -> Bool { false }

    @objc func getHealthReport(_ resolve: @escaping RCTPromiseResolveBlock,
                               rejecter reject: @escaping RCTPromiseRejectBlock) {
        var checks: [[String: Any]] = []

        // ── Passcode / Biometrics ─────────────────────────────────────────────
        let laContext = LAContext()
        var authError: NSError?
        let hasBiometrics = laContext.canEvaluatePolicy(.deviceOwnerAuthentication, error: &authError)
        let biometricType: String
        switch laContext.biometryType {
        case .faceID:      biometricType = "Face ID"
        case .touchID:     biometricType = "Touch ID"
        case .opticID:     biometricType = "Optic ID"
        default:           biometricType = "none"
        }

        checks.append([
            "id":      "screen_lock",
            "label":   "Screen Lock",
            "pass":    hasBiometrics,
            "detail":  hasBiometrics ? "Device protected (\(biometricType))" : "No screen lock set — high risk",
            "weight":  25,
        ])

        // ── iOS Version ───────────────────────────────────────────────────────
        let version     = UIDevice.current.systemVersion
        let components  = version.split(separator: ".").compactMap { Int($0) }
        let majorVer    = components.first ?? 0
        let isSupported = majorVer >= 16 // iOS 16+ = current + one prior
        checks.append([
            "id":      "os_version",
            "label":   "iOS Version",
            "pass":    isSupported,
            "detail":  "iOS \(version)\(isSupported ? " (supported)" : " — update recommended")",
            "weight":  20,
        ])

        // ── Jailbreak detection ───────────────────────────────────────────────
        let jailbroken = detectJailbreak()
        checks.append([
            "id":      "jailbreak",
            "label":   "Device Integrity",
            "pass":    !jailbroken,
            "detail":  jailbroken ? "Jailbreak indicators found — security reduced" : "Device appears unmodified",
            "weight":  30,
        ])

        // ── Storage encryption ────────────────────────────────────────────────
        // iOS always encrypts storage when a passcode is set (Data Protection API)
        checks.append([
            "id":      "storage_encryption",
            "label":   "Storage Encryption",
            "pass":    hasBiometrics, // tied to passcode
            "detail":  hasBiometrics ? "Data Protection active" : "Enable passcode to activate encryption",
            "weight":  15,
        ])

        // ── Auto-lock ─────────────────────────────────────────────────────────
        // Cannot read auto-lock setting programmatically; advise the user
        checks.append([
            "id":      "auto_lock",
            "label":   "Auto-Lock",
            "pass":    true, // cannot verify — informational
            "detail":  "Set auto-lock ≤ 1 min in Settings → Display & Brightness",
            "weight":  10,
        ])

        // ── Score ─────────────────────────────────────────────────────────────
        let maxWeight  = checks.reduce(0) { $0 + (($1["weight"] as? Int) ?? 0) }
        let earnedWeight = checks.reduce(0) { acc, c -> Int in
            let pass   = c["pass"] as? Bool ?? false
            let weight = c["weight"] as? Int ?? 0
            return acc + (pass ? weight : 0)
        }
        let score = maxWeight > 0 ? Int(Double(earnedWeight) / Double(maxWeight) * 100) : 0

        resolve([
            "score":      score,
            "checks":     checks,
            "isJailbroken": jailbroken,
            "osVersion":  version,
            "deviceModel": UIDevice.current.model,
            "scannedAt":  ISO8601DateFormatter().string(from: Date()),
        ])
    }

    // ── Jailbreak heuristics ──────────────────────────────────────────────────

    private func detectJailbreak() -> Bool {
        #if targetEnvironment(simulator)
        return false // Never flag simulator
        #else
        // 1. Check for common jailbreak file paths
        let jailbreakPaths = [
            "/Applications/Cydia.app",
            "/Library/MobileSubstrate/MobileSubstrate.dylib",
            "/bin/bash",
            "/usr/sbin/sshd",
            "/etc/apt",
            "/usr/bin/ssh",
            "/private/var/lib/apt",
            "/.bootstrapped_electra",
            "/usr/lib/libjailbreak.dylib",
        ]
        for path in jailbreakPaths {
            if FileManager.default.fileExists(atPath: path) { return true }
        }

        // 2. Can we write outside the sandbox?
        let testPath = "/private/jailbreak_test_\(UUID().uuidString)"
        do {
            try "test".write(toFile: testPath, atomically: true, encoding: .utf8)
            try FileManager.default.removeItem(atPath: testPath)
            return true // Should not succeed on a non-jailbroken device
        } catch {}

        // 3. Suspicious dylib injection via DYLD_INSERT_LIBRARIES
        if let libs = ProcessInfo.processInfo.environment["DYLD_INSERT_LIBRARIES"],
           !libs.isEmpty {
            return true
        }

        return false
        #endif
    }
}
