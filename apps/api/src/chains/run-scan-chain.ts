// @rule:Forja-2.0 — xShield operator surface runtime (Slice 2B)
//
// A compact, self-contained chain runner implementing the ankr-widget-chain-v1 contract
// (same record shape as the mari8x/freightbox shared core: llm_calls, tokenless, nodes_ok).
//
// Why local and not the mari8x runtime (FP-001 Product Isolation): freightbox dynamic-imports
// /root/apps/ankr-maritime/backend/src/lib/chain-runtime.mjs — a hard cross-repo filesystem
// dependency. xShieldAI is a separate product; it must not break when maritime moves a file.
// The honest fix is to publish the runtime as an @ankr/operator-surface export so every
// consumer shares ONE implementation without cross-product paths. Until then this mirrors the
// contract exactly. TODO(operator-surface): lift this into @ankr/operator-surface/src/chain.ts.
//
// Tokenless boundary: a node call is an LLM call only when it hits the AI proxy (:4444). The
// deterministic DRP reads (risk/dns/playbook) never do, so record.tokenless is REAL — the AI
// narrative is intentionally not a chain node (it would make the proof an artifact, not truth).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export interface ChainNode {
  slug: string;
  path?: string;
  gql?: string;
  needs?: string[];
  argsFrom?: Record<string, string>;
  why?: string;
}
export interface GatedTail {
  action: string;
  gate_tier?: string;
  approvals?: number;
  commitMode?: string;
  argsFrom?: Record<string, string>;
  note?: string;
}
export interface ChainDef {
  id: string;
  label: string;
  desc?: string;
  profile?: { baseUrl?: string; gqlPath?: string };
  trigger?: { event?: string; payloadKeys?: string[] };
  nodes: ChainNode[];
  gatedTail?: GatedTail;
}

interface NodeResult {
  slug: string;
  why?: string;
  url: string;
  ok: boolean;
  status: number;
  summary: string;
  body: unknown;
}
export interface ChainRecord {
  chain: string;
  label: string;
  trigger: { event?: string; payload: Record<string, unknown> };
  nodes_total: number;
  nodes_ok: number;
  gated: {
    action: string;
    status: string;
    pendingArgs?: string[];
    resolvedArgs?: Record<string, unknown>;
  }[];
  llm_calls: number;
  http_calls: number;
  proxy_calls: number;
  duration_ms: number;
  completed: boolean;
  tokenless: boolean;
  nodeResults: NodeResult[];
}

function loadChains(): ChainDef[] {
  const raw = JSON.parse(readFileSync(join(HERE, 'scan-chain.json'), 'utf-8'));
  return raw.chains as ChainDef[];
}

function deepGet(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

const isProxyUrl = (url: string) => /:4444(\/|$|\?)/.test(url);

export interface RunOpts {
  chainId?: string;
  domain: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Run a declared scan-chain as a sequence of tokenless AOS read-turns.
 * The gated tail is PROPOSED, never executed (pause-only) — a read-chain cannot start a write.
 */
export async function runScanChain(opts: RunOpts): Promise<ChainRecord> {
  const t0 = Date.now();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const chains = loadChains();
  const chain = chains.find((c) => c.id === (opts.chainId ?? 'domain-scan'));
  if (!chain) throw new Error(`unknown chain: ${opts.chainId}`);
  const baseUrl = opts.baseUrl ?? chain.profile?.baseUrl ?? 'http://localhost:4481';

  // build trigger context from declared payloadKeys
  const trigger: Record<string, unknown> = {};
  for (const k of chain.trigger?.payloadKeys ?? []) {
    if (k === 'domain') trigger[k] = opts.domain;
  }

  const context: Record<string, unknown> = {};
  const nodeResults: NodeResult[] = [];
  let llm_calls = 0;
  let http_calls = 0;

  const resolveSrc = (src: string): unknown => {
    if (src.startsWith('const:')) return src.slice(6);
    if (src.startsWith('trigger.')) return trigger[src.slice(8)];
    if (src.startsWith('context.')) {
      const [, slug, ...rest] = src.split('.');
      return deepGet(context[slug], rest.join('.'));
    }
    return undefined;
  };

  for (const n of chain.nodes) {
    const need = (n.needs ?? [])[0];
    const entityVal = need && n.argsFrom?.[need] ? resolveSrc(n.argsFrom[need]) : undefined;
    if (need && entityVal == null) {
      nodeResults.push({
        slug: n.slug,
        why: n.why,
        url: '',
        ok: false,
        status: 0,
        summary: `STOP — needs '${need}', unresolved`,
      });
      break; // a broken context must halt, not silently skip (WCH-005)
    }
    const enc = entityVal != null ? encodeURIComponent(String(entityVal)) : '';
    const url = n.path
      ? `${baseUrl}${n.path.replace('{entity}', enc)}`
      : `${baseUrl}/api/v2/query/${n.slug}/${enc}`;
    if (isProxyUrl(url)) llm_calls++;
    http_calls++;
    let ok = false;
    let status = 0;
    let body: unknown = null;
    let summary = '';
    try {
      const res = await fetchImpl(url, { method: 'GET' });
      status = res.status;
      const text = await res.text();
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      ok = status === 200 && body != null && !(body as any).error;
      summary = ok ? summarise(n.slug, body) : `HTTP ${status}`;
    } catch (e) {
      summary = `fetch failed: ${e instanceof Error ? e.message : String(e)}`;
    }
    context[n.slug] = body;
    nodeResults.push({ slug: n.slug, why: n.why, url, ok, status, summary, body });
  }

  const completed = nodeResults.length === chain.nodes.length && nodeResults.every((r) => r.ok);

  // gated tail — proposed, never executed (pause-only). The governed-turn pause.
  const gated: ChainRecord['gated'] = [];
  if (chain.gatedTail) {
    const resolvedArgs: Record<string, unknown> = {};
    const pendingArgs: string[] = [];
    for (const [a, s] of Object.entries(chain.gatedTail.argsFrom ?? {})) {
      const v = resolveSrc(s);
      if (v != null) resolvedArgs[a] = v;
      else pendingArgs.push(`${a} (${s})`);
    }
    gated.push({
      action: chain.gatedTail.action,
      status: 'PENDING_APPROVAL',
      pendingArgs,
      resolvedArgs,
    });
  }

  return {
    chain: chain.id,
    label: chain.label,
    trigger: { event: chain.trigger?.event, payload: trigger },
    nodes_total: chain.nodes.length,
    nodes_ok: nodeResults.filter((r) => r.ok).length,
    gated,
    llm_calls,
    http_calls,
    proxy_calls: llm_calls,
    duration_ms: Date.now() - t0,
    completed,
    tokenless: llm_calls === 0,
    nodeResults,
  };
}

function summarise(slug: string, body: any): string {
  if (body == null || typeof body !== 'object') return 'ok';
  if (slug === 'risk-score')
    return `grade ${body.level ?? body.riskLevel ?? '?'} (score ${body.score ?? body.riskScore ?? '?'})`;
  if (slug === 'dns-posture')
    return body.summary ? String(body.summary).slice(0, 80) : `${Object.keys(body).length} records`;
  if (slug === 'remediation-playbook')
    return Array.isArray(body.steps) ? `${body.steps.length} steps` : 'playbook';
  return 'ok';
}

/**
 * Assemble a deterministic Report Card from a completed chain record.
 * Pure function of the node results — no LLM, no new reads. The signable artifact (Slice 3C).
 */
export function assembleReportCard(domain: string, record: ChainRecord) {
  const by = (slug: string) => record.nodeResults.find((r) => r.slug === slug)?.body as any;
  const risk = by('risk-score') ?? {};
  const dns = by('dns-posture') ?? {};
  const playbook = by('remediation-playbook') ?? {};
  return {
    schema: 'xshield-report-card-v1',
    domain,
    issued_at: new Date().toISOString(),
    risk: {
      score: risk.score ?? risk.riskScore ?? null,
      level: risk.level ?? risk.riskLevel ?? null,
      categories: risk.categories ?? [],
    },
    dns_posture: {
      summary: dns.summary ?? null,
      spf: dns.spf ?? null,
      dmarc: dns.dmarc ?? null,
      dnssec: dns.dnssec ?? null,
    },
    remediation: Array.isArray(playbook.steps) ? playbook.steps : [],
    provenance: {
      chain: record.chain,
      tokenless: record.tokenless,
      llm_calls: record.llm_calls,
      nodes_ok: `${record.nodes_ok}/${record.nodes_total}`,
      computed_ms: record.duration_ms,
      method: 'declared deterministic reads (capability-grounded, no LLM)',
    },
    // @rule:CA-005 — this card is substrate truth; any AI narrative is a SEPARATE amber artifact.
    ai_content: {
      present: false,
      note: 'Report Card is deterministic. AI narrative is an explicit opt-in enrichment, not part of this card.',
    },
  };
}
