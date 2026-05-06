// LakshmanRekha — SQLite persistence layer
// @rule:ASMAI-S-007 — audit trail is append-only; attestations immutable post-issue
// @rule:ASMAI-S-004 — attestation records carry signed_by field

// eslint-disable-next-line import/no-unresolved
import { join } from 'path';

import { Database } from 'bun:sqlite';

const DB_PATH = process.env['LRK_DB'] ?? join(process.cwd(), 'lakshmanrekha.sqlite');
let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;
  _db = new Database(DB_PATH, { create: true });
  _db.run('PRAGMA journal_mode=WAL');
  _db.run('PRAGMA foreign_keys=ON');
  migrate(_db);
  return _db;
}

function migrate(db: Database) {
  // Registered LLM endpoints under surveillance
  db.run(`CREATE TABLE IF NOT EXISTS lrk_endpoints (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    endpoint_url_hash TEXT NOT NULL,
    endpoint_label TEXT NOT NULL,
    api_type TEXT NOT NULL CHECK(api_type IN ('openai','anthropic','azure','ankr_proxy')),
    ownership_verified INTEGER NOT NULL DEFAULT 0,
    roe_signed INTEGER NOT NULL DEFAULT 0,
    registered_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','retired'))
  )`);

  db.run(
    `CREATE INDEX IF NOT EXISTS idx_lrk_endpoints_customer ON lrk_endpoints(customer_id, status)`
  );

  // Scan job runs
  db.run(`CREATE TABLE IF NOT EXISTS lrk_scan_jobs (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    endpoint_id TEXT NOT NULL REFERENCES lrk_endpoints(id),
    probe_suite_version TEXT NOT NULL DEFAULT '1.0',
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','complete','failed')),
    probe_count INTEGER NOT NULL DEFAULT 0,
    pass_count INTEGER NOT NULL DEFAULT 0,
    fail_count INTEGER NOT NULL DEFAULT 0
  )`);

  db.run(
    `CREATE INDEX IF NOT EXISTS idx_lrk_jobs_endpoint ON lrk_scan_jobs(endpoint_id, started_at DESC)`
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_lrk_jobs_customer ON lrk_scan_jobs(customer_id, started_at DESC)`
  );

  // Individual probe result records (append-only)
  db.run(`CREATE TABLE IF NOT EXISTS lrk_probe_results (
    id TEXT PRIMARY KEY,
    scan_job_id TEXT NOT NULL REFERENCES lrk_scan_jobs(id),
    probe_id TEXT NOT NULL,
    probe_name TEXT NOT NULL,
    verdict TEXT NOT NULL CHECK(verdict IN ('refused','complied','partial','inconclusive','errored')),
    response_snippet_hash TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    ran_at TEXT NOT NULL
  )`);

  db.run(
    `CREATE INDEX IF NOT EXISTS idx_lrk_results_job ON lrk_probe_results(scan_job_id, probe_id)`
  );

  // Issued attestations (immutable post-issue)
  db.run(`CREATE TABLE IF NOT EXISTS lrk_attestations (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    scan_job_id TEXT NOT NULL REFERENCES lrk_scan_jobs(id),
    issued_at TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    overall_grade TEXT NOT NULL CHECK(overall_grade IN ('A','B','C','D','F')),
    pass_rate INTEGER NOT NULL,
    probe_count INTEGER NOT NULL,
    fail_count INTEGER NOT NULL,
    frameworks TEXT,
    probe_suite_version TEXT NOT NULL DEFAULT '1.0',
    signed_by TEXT NOT NULL DEFAULT 'lakshmanrekha-auto',
    revoked INTEGER NOT NULL DEFAULT 0
  )`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_lrk_attestations_job ON lrk_attestations(scan_job_id)`);
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_lrk_attestations_customer ON lrk_attestations(customer_id, issued_at DESC)`
  );
}

// ── ID generator ─────────────────────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// Simple SHA-256-like hash stub — avoids storing raw response snippets
function hashSnippet(snippet: string): string {
  let hash = 0;
  for (let i = 0; i < snippet.length; i++) {
    const char = snippet.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `h${Math.abs(hash).toString(16)}`;
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

export interface LrkEndpoint {
  id: string;
  customer_id: string;
  endpoint_url_hash: string;
  endpoint_label: string;
  api_type: 'openai' | 'anthropic' | 'azure' | 'ankr_proxy';
  ownership_verified: boolean;
  roe_signed: boolean;
  registered_at: string;
  status: 'active' | 'suspended' | 'retired';
}

export function registerEndpoint(opts: {
  customer_id: string;
  endpoint_url: string;
  endpoint_label: string;
  api_type: 'openai' | 'anthropic' | 'azure' | 'ankr_proxy';
  ownership_verified: boolean;
  roe_signed: boolean;
}): LrkEndpoint {
  const db = getDb();
  const id = genId('LRK-EP');
  const now = new Date().toISOString();
  const url_hash = hashSnippet(opts.endpoint_url);

  db.run(
    `INSERT INTO lrk_endpoints(id,customer_id,endpoint_url_hash,endpoint_label,api_type,ownership_verified,roe_signed,registered_at,status)
     VALUES(?,?,?,?,?,?,?,?,'active')`,
    [
      id,
      opts.customer_id,
      url_hash,
      opts.endpoint_label,
      opts.api_type,
      opts.ownership_verified ? 1 : 0,
      opts.roe_signed ? 1 : 0,
      now,
    ]
  );

  return getEndpoint(id)!;
}

export function getEndpoint(id: string): LrkEndpoint | null {
  const db = getDb();
  const row = db.query('SELECT * FROM lrk_endpoints WHERE id=?').get(id) as Record<
    string,
    unknown
  > | null;
  if (!row) return null;
  return {
    ...row,
    ownership_verified: row['ownership_verified'] === 1,
    roe_signed: row['roe_signed'] === 1,
  } as LrkEndpoint;
}

export function listEndpoints(customer_id: string): LrkEndpoint[] {
  const db = getDb();
  return (
    db
      .query(
        "SELECT * FROM lrk_endpoints WHERE customer_id=? AND status='active' ORDER BY registered_at DESC"
      )
      .all(customer_id) as Record<string, unknown>[]
  ).map(
    (r) =>
      ({
        ...r,
        ownership_verified: r['ownership_verified'] === 1,
        roe_signed: r['roe_signed'] === 1,
      }) as LrkEndpoint
  );
}

// ── Scan Jobs ──────────────────────────────────────────────────────────────────

export interface LrkScanJob {
  id: string;
  customer_id: string;
  endpoint_id: string;
  probe_suite_version: string;
  started_at: string;
  completed_at: string | null;
  status: 'pending' | 'running' | 'complete' | 'failed';
  probe_count: number;
  pass_count: number;
  fail_count: number;
}

export function createScanJob(opts: {
  customer_id: string;
  endpoint_id: string;
  probe_count: number;
}): LrkScanJob {
  const db = getDb();
  const id = genId('LRK-SCAN');
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO lrk_scan_jobs(id,customer_id,endpoint_id,probe_suite_version,started_at,status,probe_count,pass_count,fail_count)
     VALUES(?,?,?,'1.0',?,'running',?,0,0)`,
    [id, opts.customer_id, opts.endpoint_id, now, opts.probe_count]
  );

  return getScanJob(id)!;
}

export function getScanJob(id: string): LrkScanJob | null {
  const db = getDb();
  return db.query('SELECT * FROM lrk_scan_jobs WHERE id=?').get(id) as LrkScanJob | null;
}

export function updateScanJob(
  id: string,
  updates: Partial<Pick<LrkScanJob, 'status' | 'pass_count' | 'fail_count' | 'completed_at'>>
): void {
  const db = getDb();
  const sets: string[] = [];
  const vals: unknown[] = [];

  if (updates.status !== undefined) {
    sets.push('status=?');
    vals.push(updates.status);
  }
  if (updates.pass_count !== undefined) {
    sets.push('pass_count=?');
    vals.push(updates.pass_count);
  }
  if (updates.fail_count !== undefined) {
    sets.push('fail_count=?');
    vals.push(updates.fail_count);
  }
  if (updates.completed_at !== undefined) {
    sets.push('completed_at=?');
    vals.push(updates.completed_at);
  }

  if (sets.length === 0) return;
  vals.push(id);
  db.run(`UPDATE lrk_scan_jobs SET ${sets.join(',')} WHERE id=?`, vals);
}

export function listScanJobs(customer_id: string, limit = 20): LrkScanJob[] {
  const db = getDb();
  return db
    .query('SELECT * FROM lrk_scan_jobs WHERE customer_id=? ORDER BY started_at DESC LIMIT ?')
    .all(customer_id, limit) as LrkScanJob[];
}

// ── Probe Results ─────────────────────────────────────────────────────────────

export interface LrkProbeResult {
  id: string;
  scan_job_id: string;
  probe_id: string;
  probe_name: string;
  verdict: string;
  response_snippet_hash: string;
  duration_ms: number;
  ran_at: string;
}

export function recordProbeResult(opts: {
  scan_job_id: string;
  probe_id: string;
  probe_name: string;
  verdict: string;
  response_snippet: string;
  duration_ms: number;
}): LrkProbeResult {
  const db = getDb();
  const id = genId('LRK-PR');
  const now = new Date().toISOString();
  const snippet_hash = hashSnippet(opts.response_snippet);

  db.run(
    `INSERT INTO lrk_probe_results(id,scan_job_id,probe_id,probe_name,verdict,response_snippet_hash,duration_ms,ran_at)
     VALUES(?,?,?,?,?,?,?,?)`,
    [
      id,
      opts.scan_job_id,
      opts.probe_id,
      opts.probe_name,
      opts.verdict,
      snippet_hash,
      opts.duration_ms,
      now,
    ]
  );

  return {
    id,
    scan_job_id: opts.scan_job_id,
    probe_id: opts.probe_id,
    probe_name: opts.probe_name,
    verdict: opts.verdict,
    response_snippet_hash: snippet_hash,
    duration_ms: opts.duration_ms,
    ran_at: now,
  };
}

export function listProbeResults(scan_job_id: string): LrkProbeResult[] {
  const db = getDb();
  return db
    .query('SELECT * FROM lrk_probe_results WHERE scan_job_id=? ORDER BY ran_at ASC')
    .all(scan_job_id) as LrkProbeResult[];
}

// ── Attestations ──────────────────────────────────────────────────────────────

export interface LrkAttestation {
  id: string;
  customer_id: string;
  scan_job_id: string;
  issued_at: string;
  period_start: string;
  period_end: string;
  overall_grade: 'A' | 'B' | 'C' | 'D' | 'F';
  pass_rate: number;
  probe_count: number;
  fail_count: number;
  frameworks: string | null;
  probe_suite_version: string;
  signed_by: string;
  revoked: boolean;
}

// @rule:ASMAI-S-004 — attestation issuance requires signed_by field
export function issueAttestation(
  opts: Omit<LrkAttestation, 'id' | 'issued_at' | 'revoked'>
): LrkAttestation {
  const db = getDb();
  const id = genId('LRK-ATT');
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO lrk_attestations(id,customer_id,scan_job_id,issued_at,period_start,period_end,overall_grade,pass_rate,probe_count,fail_count,frameworks,probe_suite_version,signed_by,revoked)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
    [
      id,
      opts.customer_id,
      opts.scan_job_id,
      now,
      opts.period_start,
      opts.period_end,
      opts.overall_grade,
      opts.pass_rate,
      opts.probe_count,
      opts.fail_count,
      opts.frameworks ?? null,
      opts.probe_suite_version,
      opts.signed_by,
    ]
  );

  return getAttestation(id)!;
}

export function getAttestation(id: string): LrkAttestation | null {
  const db = getDb();
  const row = db.query('SELECT * FROM lrk_attestations WHERE id=?').get(id) as Record<
    string,
    unknown
  > | null;
  if (!row) return null;
  return { ...row, revoked: row['revoked'] === 1 } as LrkAttestation;
}

export function listAttestationsByEndpoint(endpoint_id: string): LrkAttestation[] {
  const db = getDb();
  return (
    db
      .query(
        `SELECT a.* FROM lrk_attestations a
         JOIN lrk_scan_jobs j ON a.scan_job_id=j.id
         WHERE j.endpoint_id=? AND a.revoked=0
         ORDER BY a.issued_at DESC`
      )
      .all(endpoint_id) as Record<string, unknown>[]
  ).map((r) => ({ ...r, revoked: false }) as LrkAttestation);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function getStats() {
  const db = getDb();

  const endpoints = (
    db.query("SELECT COUNT(*) as n FROM lrk_endpoints WHERE status='active'").get() as { n: number }
  ).n;

  const scans = (
    db.query("SELECT COUNT(*) as n FROM lrk_scan_jobs WHERE status='complete'").get() as {
      n: number;
    }
  ).n;

  const attestations = (
    db.query('SELECT COUNT(*) as n FROM lrk_attestations WHERE revoked=0').get() as { n: number }
  ).n;

  const failures = (
    db
      .query(
        "SELECT COUNT(*) as n FROM lrk_probe_results WHERE verdict NOT IN ('refused','errored')"
      )
      .get() as { n: number }
  ).n;

  return {
    registered_endpoints: endpoints,
    completed_scans: scans,
    attestations_issued: attestations,
    total_probe_failures: failures,
  };
}
