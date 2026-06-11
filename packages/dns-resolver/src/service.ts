// @rule:R-008 — AnkrShield DNS-Shield service (WS1-T2)
//
// The runnable enforcement: load the 203k tracker floor (WS1-T1) into a DomainLookup, wrap it
// in the DNSResolver (DoH + consent-aware app-allowlist), and expose it over HTTP so a browser,
// OS, or the Android VPN can point its Secure-DNS at it. Trackers → NXDOMAIN (the connection
// closes); everything else is proxied through to the upstream DoH. Normal apps keep working;
// an app's own domains are never blocked for it (surgical inhibition via app-allowlist).
//
// Zero new deps (node:http) — this is a leaf package; a filtering DoH proxy doesn't need a
// framework. Port is injected by ankr-ctl from ports.json (never hardcoded, R-008).

import { createServer } from 'node:http';

import { DomainLookup } from './blocklist/lookup.js';
import { loadNdjsonIntoLookup } from './blocklist/ndjson-loader.js';
import { DNSResolver } from './resolver.js';

const PORT = Number(process.env.PORT);
if (!PORT) {
  console.error(
    '[dns-shield] FATAL: PORT env not injected — start via ankr-ctl (ports.json authority)'
  );
  process.exit(1);
}

const UPSTREAM_DOH = process.env.DOH_UPSTREAM ?? 'https://cloudflare-dns.com/dns-query';

const lookup = new DomainLookup();
const resolver = new DNSResolver({ blocklist: lookup, cacheEnabled: true });

// ── Privacy stats (WS1-T3) — the real "what AnkrShield blocked" data ──────────
// The shield IS the source of truth for tracker activity (not a Prisma table). We track
// category-aware aggregates in memory so the backend/dashboard serves truth, not seed data.
const privacy = {
  startedAt: new Date().toISOString(),
  blocked: 0,
  allowed: 0,
  byCategory: new Map<string, number>(),
  topDomains: new Map<string, number>(),
  recent: [] as Array<{ domain: string; category: string; app: string | null; at: string }>,
};
async function recordBlock(domain: string, app?: string) {
  // Own counters — resolver.stats.blocked only ticks inside resolve(), which we skip on a block.
  privacy.blocked++;
  const info = await lookup.getDomainInfo(domain).catch(() => null);
  const category = (info as any)?.category ?? 'unknown';
  privacy.byCategory.set(category, (privacy.byCategory.get(category) ?? 0) + 1);
  privacy.topDomains.set(domain, (privacy.topDomains.get(domain) ?? 0) + 1);
  privacy.recent.unshift({ domain, category, app: app ?? null, at: new Date().toISOString() });
  if (privacy.recent.length > 100) privacy.recent.pop();
}
function recordAllow() {
  privacy.allowed++;
}
function privacySummary() {
  const top = [...privacy.topDomains.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([domain, hits]) => ({ domain, hits }));
  const byCategory = Object.fromEntries(
    [...privacy.byCategory.entries()].sort((a, b) => b[1] - a[1])
  );
  const totalBlocked = privacy.blocked;
  const totalResolved = privacy.allowed;
  const totalSeen = totalBlocked + totalResolved;
  // Honest metric, not a fuzzy score: how much of this session's DNS traffic was tracking we cut.
  const trackerBlockRatePct = totalSeen === 0 ? 0 : Math.round((totalBlocked / totalSeen) * 100);
  return {
    since: privacy.startedAt,
    blocklist_size: lookup.getStats().domainsLoaded,
    totals: { blocked: totalBlocked, resolved: totalResolved, cached: resolver.stats.cached },
    trackers_blocked: totalBlocked,
    tracker_block_rate_pct: trackerBlockRatePct,
    by_category: byCategory,
    top_trackers: top,
    recent_blocks: privacy.recent.slice(0, 25),
  };
}

function json(
  res: import('node:http').ServerResponse,
  status: number,
  body: unknown,
  contentType = 'application/json'
) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': contentType, 'access-control-allow-origin': '*' });
  res.end(payload);
}

/** Upstream DoH passthrough in application/dns-json (for non-blocked domains). */
async function passthroughDoH(name: string, type: string): Promise<{ status: number; body: any }> {
  const url = `${UPSTREAM_DOH}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(url, {
      headers: { Accept: 'application/dns-json' },
      signal: ctrl.signal,
    });
    return { status: r.ok ? 200 : 502, body: await r.json().catch(() => ({})) };
  } catch (e) {
    return { status: 502, body: { error: e instanceof Error ? e.message : String(e) } };
  } finally {
    clearTimeout(timer);
  }
}

const server = createServer(async (req, res) => {
  try {
    const u = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const path = u.pathname;

    // ── Health (ankr-ctl probe) ──────────────────────────────────────────────
    if (path === '/health') {
      const stats = lookup.getStats();
      return json(res, 200, {
        status: 'ok',
        service: 'ankrshield-dns-shield',
        port: PORT,
        blocklist_loaded: stats.domainsLoaded,
        resolver: resolver.stats,
        timestamp: new Date().toISOString(),
      });
    }

    // ── Filtering DoH endpoint — point a browser/OS/Android Secure-DNS here ───
    // Blocked tracker → NXDOMAIN (Status 3): the lookup fails, the tracking connection
    // never opens. Allowed domain → transparent passthrough to the upstream resolver.
    if (path === '/dns-query') {
      const name = u.searchParams.get('name')?.toLowerCase().trim();
      const type = u.searchParams.get('type') ?? 'A';
      const app = u.searchParams.get('app') ?? undefined;
      if (!name) return json(res, 400, { error: 'name query param required' });

      const blocked = await resolver.isBlocked(name, app);
      if (blocked) {
        void recordBlock(name, app);
        // NXDOMAIN — RFC 8484 dns-json shape; Comment marks it as a deliberate block.
        return json(
          res,
          200,
          {
            Status: 3,
            TC: false,
            RD: true,
            RA: true,
            AD: false,
            CD: false,
            Question: [{ name, type: 1 }],
            Answer: [],
            Comment: 'ankrshield: tracker blocked',
          },
          'application/dns-json'
        );
      }
      recordAllow();
      const up = await passthroughDoH(name, type);
      return json(res, up.status, up.body, 'application/dns-json');
    }

    // ── Simple decision API — "should this domain be allowed for this app?" ──
    if (path === '/resolve') {
      const name = u.searchParams.get('name')?.toLowerCase().trim();
      const app = u.searchParams.get('app') ?? undefined;
      if (!name) return json(res, 400, { error: 'name query param required' });
      const blocked = await resolver.isBlocked(name, app);
      if (blocked) void recordBlock(name, app);
      else recordAllow();
      const ip = blocked ? null : await resolver.resolve(name, app);
      return json(res, 200, {
        domain: name,
        app: app ?? null,
        blocked,
        ip,
        reason: blocked ? 'known-tracker' : ip ? 'resolved' : 'nxdomain',
      });
    }

    // ── Stats ────────────────────────────────────────────────────────────────
    if (path === '/stats') {
      return json(res, 200, { blocklist: lookup.getStats(), resolver: resolver.stats });
    }

    // ── Privacy summary (WS1-T3) — real tracker/privacy data for the dashboard ──
    if (path === '/privacy-summary') {
      return json(res, 200, privacySummary());
    }

    return json(res, 404, {
      error: 'not found',
      routes: ['/health', '/dns-query', '/resolve', '/stats', '/privacy-summary'],
    });
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

async function main() {
  console.log('[dns-shield] loading tracker blocklist floor…');
  const t0 = Date.now();
  const r = await loadNdjsonIntoLookup(lookup);
  console.log(
    `[dns-shield] floor ready: ${r.loaded.toLocaleString()} domains in ${((Date.now() - t0) / 1000).toFixed(1)}s`
  );
  server.listen(PORT, '0.0.0.0', () => {
    console.log(
      `[dns-shield] listening on :${PORT} — DoH filter at /dns-query, decision API at /resolve`
    );
  });
}

main().catch((e) => {
  console.error('[dns-shield] failed to start:', e);
  process.exit(1);
});
