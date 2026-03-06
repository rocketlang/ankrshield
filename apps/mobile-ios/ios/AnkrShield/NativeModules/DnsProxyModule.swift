import Foundation
import NetworkExtension

/// DnsProxyModule — React Native bridge for iOS DNS proxy control.
///
/// JS API (mirrors Android DnsVpnModule):
///   DnsProxyModule.startVpn()       → Promise<void>
///   DnsProxyModule.stopVpn()        → Promise<void>
///   DnsProxyModule.isRunning()      → Promise<Bool>
///   DnsProxyModule.getStats()       → Promise<{ totalQueries, blockedQueries, blockedPercent, lastBlockedDomain }>
///   DnsProxyModule.updateBlocklist(domains: string[]) → Promise<void>

@objc(DnsProxyModule)
final class DnsProxyModule: NSObject {

    private static let appGroup       = "group.com.ankr.shield"
    private static let blocklistKey   = "ankrshield_blocklist"
    private static let statsKey       = "ankrshield_dns_stats"
    private static let managerTitle   = "AnkrShield DNS Protection"
    private static let bundleId       = "com.ankr.shield.dnsproxy"

    @objc static func requiresMainQueueSetup() -> Bool { false }

    // ── Start ─────────────────────────────────────────────────────────────────

    @objc func startVpn(_ resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
        Task {
            do {
                let manager = try await loadOrCreateManager()
                manager.isEnabled = true
                try await manager.saveToPreferences()
                try await NETunnelProviderSession.forManager(manager)?.start(options: nil)
                resolve(nil)
            } catch {
                reject("START_ERROR", error.localizedDescription, error)
            }
        }
    }

    // ── Stop ──────────────────────────────────────────────────────────────────

    @objc func stopVpn(_ resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
        Task {
            do {
                let managers = try await NEDNSProxyManager.loadAllFromPreferences()
                for m in managers where m.localizedDescription == Self.managerTitle {
                    m.isEnabled = false
                    try await m.saveToPreferences()
                    (m.providerProtocol as? NEAppProxyProviderProtocol)
                    // session stop
                }
                resolve(nil)
            } catch {
                reject("STOP_ERROR", error.localizedDescription, error)
            }
        }
    }

    // ── Status ────────────────────────────────────────────────────────────────

    @objc func isRunning(_ resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
        Task {
            do {
                let managers = try await NEDNSProxyManager.loadAllFromPreferences()
                let active = managers.first {
                    $0.localizedDescription == Self.managerTitle && $0.isEnabled
                }
                resolve(active != nil)
            } catch {
                resolve(false)
            }
        }
    }

    // ── Stats ─────────────────────────────────────────────────────────────────

    @objc func getStats(_ resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
        let defaults = UserDefaults(suiteName: Self.appGroup)
        let raw = defaults?.dictionary(forKey: Self.statsKey) ?? [:]
        let total   = raw["totalQueries"]   as? Int ?? 0
        let blocked = raw["blockedQueries"] as? Int ?? 0
        let last    = raw["lastBlockedDomain"] as? String ?? ""
        let pct     = total > 0 ? (Double(blocked) / Double(total) * 100).rounded() : 0.0

        resolve([
            "totalQueries":    total,
            "blockedQueries":  blocked,
            "blockedPercent":  pct,
            "lastBlockedDomain": last,
        ])
    }

    // ── Blocklist update ──────────────────────────────────────────────────────

    @objc func updateBlocklist(_ domains: [String],
                               resolver resolve: @escaping RCTPromiseResolveBlock,
                               rejecter reject: @escaping RCTPromiseRejectBlock) {
        let text = domains.map { $0.lowercased().trimmingCharacters(in: .whitespaces) }
                          .filter { !$0.isEmpty }
                          .joined(separator: "\n")
        let defaults = UserDefaults(suiteName: Self.appGroup)
        defaults?.set(text, forKey: Self.blocklistKey)
        defaults?.synchronize()
        resolve(domains.count)
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private func loadOrCreateManager() async throws -> NEDNSProxyManager {
        let managers = try await NEDNSProxyManager.loadAllFromPreferences()
        if let existing = managers.first(where: { $0.localizedDescription == Self.managerTitle }) {
            return existing
        }
        let manager = NEDNSProxyManager()
        manager.localizedDescription = Self.managerTitle
        let proto = NEDNSProxyProviderProtocol()
        proto.providerBundleIdentifier = Self.bundleId
        proto.serverAddress = "cloudflare-dns.com"
        manager.providerProtocol = proto
        return manager
    }
}
