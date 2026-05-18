import NetworkExtension
import os.log

/// NEDNSProxyProvider — intercepts all DNS queries system-wide.
///
/// Architecture:
///   iOS DNS queries → AnkrShieldDNSProxyProvider (Network Extension)
///       → blocklist check (UserDefaults App Group)
///       → if blocked: synthesise NXDOMAIN reply locally
///       → if clean:   forward to DoH resolver (Cloudflare / Google fallback)
///
/// Communication with main app:
///   - Blocklist stored in App Group container: UserDefaults(suiteName: "group.com.ankr.shield")
///   - Stats written back to same container (block count, last domain, etc.)
///   - Main app reads stats via DnsProxyModule.swift

final class AnkrShieldDNSProxyProvider: NEDNSProxyProvider {

    // ── Configuration keys (must match DnsProxyModule.swift) ─────────────────
    private static let appGroup      = "group.com.ankr.shield"
    private static let blocklistKey  = "ankrshield_blocklist"
    private static let statsKey      = "ankrshield_dns_stats"
    private static let primaryDoH    = "https://cloudflare-dns.com/dns-query"
    private static let fallbackDoH   = "https://dns.google/dns-query"

    private let log = OSLog(subsystem: "com.ankr.shield.dnsproxy", category: "DNS")
    private var blockedDomains: Set<String> = []
    private var stats = DnsStats()
    private let urlSession: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest  = 5
        cfg.timeoutIntervalForResource = 10
        return URLSession(configuration: cfg)
    }()

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override func startProxy(options: [String : Any]? = nil, completionHandler: @escaping (Error?) -> Void) {
        loadBlocklist()
        os_log("DNS proxy started — %{public}d blocked domains", log: log, type: .info, blockedDomains.count)
        completionHandler(nil)
    }

    override func stopProxy(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        persistStats()
        os_log("DNS proxy stopped — reason %{public}d", log: log, type: .info, reason.rawValue)
        completionHandler()
    }

    // ── Query handling ────────────────────────────────────────────────────────

    override func handleNewFlow(_ flow: NEAppProxyFlow) -> Bool {
        // We only handle UDP DNS flows (port 53)
        guard let udpFlow = flow as? NEAppProxyUDPFlow else { return false }
        handleUDPFlow(udpFlow)
        return true
    }

    private func handleUDPFlow(_ flow: NEAppProxyUDPFlow) {
        flow.open(withLocalEndpoint: nil) { [weak self] error in
            guard let self = self, error == nil else { return }
            self.readDatagrams(from: flow)
        }
    }

    private func readDatagrams(from flow: NEAppProxyUDPFlow) {
        flow.readDatagrams { [weak self] datagrams, endpoints, error in
            guard let self = self, let datagrams = datagrams, error == nil else { return }

            for (i, data) in datagrams.enumerated() {
                guard let endpoint = endpoints?[i] as? NWHostEndpoint else { continue }
                self.processDNSQuery(data: data, flow: flow, remoteEndpoint: endpoint)
            }

            // Keep reading
            self.readDatagrams(from: flow)
        }
    }

    private func processDNSQuery(data: Data, flow: NEAppProxyUDPFlow, remoteEndpoint: NWHostEndpoint) {
        guard let domain = extractDomain(from: data) else {
            // Unrecognised — forward as-is
            forwardToDoH(data: data, flow: flow, remoteEndpoint: remoteEndpoint)
            return
        }

        let normalised = domain.lowercased().trimmingCharacters(in: .init(charactersIn: "."))
        stats.totalQueries += 1

        if isBlocked(normalised) {
            stats.blockedQueries += 1
            stats.lastBlockedDomain = normalised
            os_log("Blocked: %{public}@", log: log, type: .debug, normalised)
            let nxdomain = synthesiseNXDomain(queryData: data)
            flow.writeDatagrams([nxdomain], sentBy: [remoteEndpoint]) { _ in }
            persistStats()
        } else {
            forwardToDoH(data: data, flow: flow, remoteEndpoint: remoteEndpoint)
        }
    }

    // ── Blocklist ─────────────────────────────────────────────────────────────

    private func loadBlocklist() {
        let defaults = UserDefaults(suiteName: Self.appGroup)
        let raw = defaults?.string(forKey: Self.blocklistKey) ?? ""
        blockedDomains = Set(
            raw.components(separatedBy: "\n")
               .map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
               .filter { !$0.isEmpty }
        )
    }

    private func isBlocked(_ domain: String) -> Bool {
        if blockedDomains.contains(domain) { return true }
        // Also check parent domains
        var parts = domain.components(separatedBy: ".")
        while parts.count > 2 {
            parts.removeFirst()
            if blockedDomains.contains(parts.joined(separator: ".")) { return true }
        }
        return false
    }

    // ── DoH forwarding ────────────────────────────────────────────────────────

    private func forwardToDoH(data: Data, flow: NEAppProxyUDPFlow, remoteEndpoint: NWHostEndpoint) {
        doHQuery(url: Self.primaryDoH, dnsWire: data) { [weak self] result in
            switch result {
            case .success(let response):
                flow.writeDatagrams([response], sentBy: [remoteEndpoint]) { _ in }
            case .failure:
                // Fallback to secondary resolver
                self?.doHQuery(url: Self.fallbackDoH, dnsWire: data) { result2 in
                    if case .success(let resp2) = result2 {
                        flow.writeDatagrams([resp2], sentBy: [remoteEndpoint]) { _ in }
                    }
                }
            }
        }
    }

    private func doHQuery(url: String, dnsWire: Data, completion: @escaping (Result<Data, Error>) -> Void) {
        guard let requestURL = URL(string: url) else {
            completion(.failure(NSError(domain: "AnkrShield", code: -1)))
            return
        }
        var request = URLRequest(url: requestURL)
        request.httpMethod = "POST"
        request.setValue("application/dns-message", forHTTPHeaderField: "Content-Type")
        request.setValue("application/dns-message", forHTTPHeaderField: "Accept")
        request.httpBody = dnsWire

        urlSession.dataTask(with: request) { data, response, error in
            if let error = error { completion(.failure(error)); return }
            guard let data = data else {
                completion(.failure(NSError(domain: "AnkrShield", code: -2)))
                return
            }
            completion(.success(data))
        }.resume()
    }

    // ── DNS wire format helpers ───────────────────────────────────────────────

    /// Extract the first QNAME from a DNS query wire-format message.
    private func extractDomain(from data: Data) -> String? {
        guard data.count > 12 else { return nil }
        var idx = 12 // skip 12-byte DNS header
        var labels: [String] = []
        while idx < data.count {
            let len = Int(data[idx])
            idx += 1
            if len == 0 { break }
            guard idx + len <= data.count else { return nil }
            guard let label = String(data: data[idx..<(idx + len)], encoding: .utf8) else { return nil }
            labels.append(label)
            idx += len
        }
        return labels.isEmpty ? nil : labels.joined(separator: ".")
    }

    /// Build a minimal NXDOMAIN response for the given query.
    private func synthesiseNXDomain(queryData: Data) -> Data {
        guard queryData.count >= 12 else { return queryData }
        var response = queryData
        // Byte 2-3: Flags. Set QR=1 (response), RCODE=3 (NXDOMAIN), RA=1
        response[2] = 0x81 // QR=1, OPCODE=0, AA=0, TC=0, RD=1
        response[3] = 0x83 // RA=1, Z=0, RCODE=3
        // Zero out answer/authority/additional counts
        response[6] = 0; response[7] = 0
        response[8] = 0; response[9] = 0
        response[10] = 0; response[11] = 0
        return response
    }

    // ── Stats persistence ─────────────────────────────────────────────────────

    private func persistStats() {
        let defaults = UserDefaults(suiteName: Self.appGroup)
        let dict: [String: Any] = [
            "totalQueries":    stats.totalQueries,
            "blockedQueries":  stats.blockedQueries,
            "lastBlockedDomain": stats.lastBlockedDomain ?? "",
            "updatedAt": ISO8601DateFormatter().string(from: Date()),
        ]
        defaults?.set(dict, forKey: Self.statsKey)
    }
}

// ── Value types ───────────────────────────────────────────────────────────────

private struct DnsStats {
    var totalQueries:   Int    = 0
    var blockedQueries: Int    = 0
    var lastBlockedDomain: String? = nil
}
