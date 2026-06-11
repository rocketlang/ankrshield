#!/usr/bin/env node
// @rule:Forja-2.0 — xShield scan-chain tokenless proof (Slice 2B)
//
// Durable, gate-able proof that the DRP scan-chain runs as DECLARED deterministic reads
// with zero LLM tokens. Mirrors mari8x scripts/run-chain.mjs. Exits 0 iff the chain
// completed AND tokenless (llm_calls === 0). Run with the AI proxy OFF — it must still pass.
//
//   node apps/api/scripts/run-scan-chain.mjs example.com
//   AI_PROXY_DOWN=1 node apps/api/scripts/run-scan-chain.mjs example.com   # proof under severance

const domain = process.argv[2] || 'example.com';
const base = process.env.XSHIELD_URL || `http://localhost:${process.env.PORT || 4481}`;

const res = await fetch(`${base}/api/v2/chains/domain-scan`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ domain }),
});
if (!res.ok) {
  console.error(`HTTP ${res.status} from ${base}`);
  process.exit(2);
}
const { record, reportCard } = await res.json();

console.log(`\nCHAIN '${record.chain}' — ${record.label}`);
console.log(`domain: ${domain}`);
for (const n of record.nodeResults) {
  console.log(`  ${n.ok ? '⚡' : '✗'} ${n.slug.padEnd(22)} ${n.summary}`);
}
for (const g of record.gated) {
  console.log(`  ⏸ GATED '${g.action}' → ${g.status} (proposed, not executed)`);
}
console.log(`\n  nodes_ok    = ${record.nodes_ok}/${record.nodes_total}`);
console.log(`  http_calls  = ${record.http_calls}`);
console.log(`  llm_calls   = ${record.llm_calls}`);
console.log(`  TOKENLESS   = ${record.tokenless}`);
console.log(`  duration_ms = ${record.duration_ms}`);
console.log(`\n  ReportCard: ${reportCard.domain} → ${reportCard.risk.level} (${reportCard.risk.score})  [${reportCard.schema}]`);

const pass = record.completed && record.tokenless;
console.log(`\n${pass ? '✅ PASS' : '❌ FAIL'} — tokenless governed scan-chain\n`);
process.exit(pass ? 0 : 1);
