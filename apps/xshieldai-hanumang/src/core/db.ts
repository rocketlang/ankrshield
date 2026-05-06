// HanumanG — SQLite core
// @rule:HNG-S-001 — mudrika verification is the gate; all observations start here
// @rule:HNG-S-008 — mudrika structure: principal_id, agent_id, trust_mask, scope_key, ttl, pramana_chain
// @rule:HNG-S-007 — audit trail is append-only; attestations immutable post-issue

// eslint-disable-next-line import/no-unresolved
import { join } from 'path';

import { Database } from 'bun:sqlite';

const DB_PATH = process.env['HANUMANG_DB'] ?? join(process.cwd(), 'hanumang.sqlite');
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
  // Registered agents being monitored
  db.run(`CREATE TABLE IF NOT EXISTS hanumang_agents (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL UNIQUE,
    agent_type TEXT NOT NULL CHECK(agent_type IN ('officer','worker','auditor','supervisor')),
    officer_role TEXT,
    principal_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    trust_mask_granted INTEGER NOT NULL DEFAULT 0,
    scope_key TEXT NOT NULL,
    registered_at TEXT NOT NULL,
    last_seen TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','retired')),
    baseline_locked INTEGER NOT NULL DEFAULT 0,
    human_modified INTEGER NOT NULL DEFAULT 0
  )`);

  // Mudrika verification log (append-only)
  db.run(`CREATE TABLE IF NOT EXISTS hanumang_mudrikas (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    mudrika_id TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    trust_mask INTEGER NOT NULL,
    scope_key TEXT NOT NULL,
    issued_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    verified_at TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK(outcome IN ('PASS','FAIL','EXPIRED','REVOKED')),
    failure_reason TEXT,
    pramana_chain TEXT,
    _meta_duration_ms INTEGER
  )`);

  // Per-axis observation records (append-only)
  db.run(`CREATE TABLE IF NOT EXISTS hanumang_axis_observations (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    axis TEXT NOT NULL CHECK(axis IN (
      'mudrika_integrity','identity_broadcast','mandate_bounds',
      'proportional_force','return_with_proof','no_overreach','truthful_report'
    )),
    score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
    outcome TEXT NOT NULL CHECK(outcome IN ('PASS','WARN','FAIL')),
    evidence TEXT,
    rule_id TEXT NOT NULL,
    task_id TEXT,
    before_state TEXT,
    after_state TEXT
  )`);

  // Issued attestation certificates (immutable)
  db.run(`CREATE TABLE IF NOT EXISTS hanumang_attestations (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    issued_at TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    overall_grade TEXT NOT NULL CHECK(overall_grade IN ('A','B','C','D','F')),
    overall_score INTEGER NOT NULL,
    axis_scores TEXT NOT NULL,
    violation_count INTEGER NOT NULL DEFAULT 0,
    frameworks TEXT,
    signed_by TEXT NOT NULL DEFAULT 'hanumang-auto',
    revoked INTEGER NOT NULL DEFAULT 0
  )`);

  // Behavioral baselines per agent-role (for overreach detection)
  db.run(`CREATE TABLE IF NOT EXISTS hanumang_baselines (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL UNIQUE,
    customer_id TEXT NOT NULL,
    trust_mask_avg_used INTEGER NOT NULL DEFAULT 0,
    trust_mask_granted INTEGER NOT NULL DEFAULT 0,
    typical_scope_keys TEXT,
    avg_task_duration_s INTEGER,
    observation_count INTEGER NOT NULL DEFAULT 0,
    locked_at TEXT,
    updated_at TEXT NOT NULL
  )`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_mudrikas_agent ON hanumang_mudrikas(agent_id)`);
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_observations_agent ON hanumang_axis_observations(agent_id, axis)`
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_attestations_agent ON hanumang_attestations(agent_id, issued_at)`
  );
}

// ── Agent registration ────────────────────────────────────────────────────────

export interface HanumanAgent {
  id: string;
  agent_id: string;
  agent_type: string;
  officer_role: string | null;
  principal_id: string;
  customer_id: string;
  trust_mask_granted: number;
  scope_key: string;
  registered_at: string;
  last_seen: string | null;
  status: string;
  baseline_locked: boolean;
  human_modified: boolean;
}

export function registerAgent(
  a: Omit<HanumanAgent, 'id' | 'registered_at' | 'last_seen' | 'baseline_locked' | 'human_modified'>
): HanumanAgent {
  const db = getDb();
  const id = `HNG-AG-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO hanumang_agents(id,agent_id,agent_type,officer_role,principal_id,customer_id,trust_mask_granted,scope_key,registered_at,status,baseline_locked,human_modified)
     VALUES(?,?,?,?,?,?,?,?,?,'active',0,1)
     ON CONFLICT(agent_id) DO UPDATE SET trust_mask_granted=excluded.trust_mask_granted, scope_key=excluded.scope_key, last_seen=?`,
    [
      id,
      a.agent_id,
      a.agent_type,
      a.officer_role ?? null,
      a.principal_id,
      a.customer_id,
      a.trust_mask_granted,
      a.scope_key,
      now,
      now,
    ]
  );
  return getAgent(a.agent_id)!;
}

export function getAgent(agent_id: string): HanumanAgent | null {
  const db = getDb();
  const row = db.query('SELECT * FROM hanumang_agents WHERE agent_id=?').get(agent_id) as Record<
    string,
    unknown
  > | null;
  if (!row) return null;
  return {
    ...row,
    baseline_locked: row.baseline_locked === 1,
    human_modified: row.human_modified === 1,
  } as HanumanAgent;
}

export function listAgents(customer_id: string): HanumanAgent[] {
  const db = getDb();
  return (
    db
      .query('SELECT * FROM hanumang_agents WHERE customer_id=? ORDER BY registered_at DESC')
      .all(customer_id) as Record<string, unknown>[]
  ).map(
    (r) =>
      ({
        ...r,
        baseline_locked: r.baseline_locked === 1,
        human_modified: r.human_modified === 1,
      }) as HanumanAgent
  );
}

// ── Mudrika log ───────────────────────────────────────────────────────────────

export interface MudrikaRecord {
  id: string;
  agent_id: string;
  mudrika_id: string;
  principal_id: string;
  trust_mask: number;
  scope_key: string;
  issued_at: string;
  expires_at: string;
  verified_at: string;
  outcome: 'PASS' | 'FAIL' | 'EXPIRED' | 'REVOKED';
  failure_reason: string | null;
  pramana_chain: string | null;
  _meta_duration_ms: number;
}

export function recordMudrika(m: Omit<MudrikaRecord, 'id'>): MudrikaRecord {
  const db = getDb();
  const id = `HNG-MDR-${Date.now().toString(36).toUpperCase()}`;
  db.run(
    `INSERT INTO hanumang_mudrikas(id,agent_id,mudrika_id,principal_id,trust_mask,scope_key,issued_at,expires_at,verified_at,outcome,failure_reason,pramana_chain,_meta_duration_ms)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      m.agent_id,
      m.mudrika_id,
      m.principal_id,
      m.trust_mask,
      m.scope_key,
      m.issued_at,
      m.expires_at,
      m.verified_at,
      m.outcome,
      m.failure_reason ?? null,
      m.pramana_chain ?? null,
      m._meta_duration_ms,
    ]
  );
  return { id, ...m };
}

// ── Axis observations ─────────────────────────────────────────────────────────

export interface AxisObservation {
  id: string;
  agent_id: string;
  customer_id: string;
  observed_at: string;
  axis: string;
  score: number;
  outcome: 'PASS' | 'WARN' | 'FAIL';
  evidence: string | null;
  rule_id: string;
  task_id: string | null;
  before_state: string | null;
  after_state: string | null;
}

export function recordObservation(o: Omit<AxisObservation, 'id' | 'observed_at'>): AxisObservation {
  const db = getDb();
  const id = `HNG-OBS-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO hanumang_axis_observations(id,agent_id,customer_id,observed_at,axis,score,outcome,evidence,rule_id,task_id,before_state,after_state)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      o.agent_id,
      o.customer_id,
      now,
      o.axis,
      o.score,
      o.outcome,
      o.evidence ?? null,
      o.rule_id,
      o.task_id ?? null,
      o.before_state ?? null,
      o.after_state ?? null,
    ]
  );
  return { id, observed_at: now, ...o };
}

export function getAxisHistory(agent_id: string, axis?: string, limit = 50): AxisObservation[] {
  const db = getDb();
  if (axis) {
    return db
      .query(
        'SELECT * FROM hanumang_axis_observations WHERE agent_id=? AND axis=? ORDER BY observed_at DESC LIMIT ?'
      )
      .all(agent_id, axis, limit) as AxisObservation[];
  }
  return db
    .query(
      'SELECT * FROM hanumang_axis_observations WHERE agent_id=? ORDER BY observed_at DESC LIMIT ?'
    )
    .all(agent_id, limit) as AxisObservation[];
}

// ── Attestations ──────────────────────────────────────────────────────────────

export interface Attestation {
  id: string;
  agent_id: string;
  customer_id: string;
  issued_at: string;
  period_start: string;
  period_end: string;
  overall_grade: string;
  overall_score: number;
  axis_scores: string;
  violation_count: number;
  frameworks: string | null;
  signed_by: string;
  revoked: boolean;
}

export function issueAttestation(
  a: Omit<Attestation, 'id' | 'issued_at' | 'revoked'>
): Attestation {
  const db = getDb();
  const id = `HNG-ATT-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO hanumang_attestations(id,agent_id,customer_id,issued_at,period_start,period_end,overall_grade,overall_score,axis_scores,violation_count,frameworks,signed_by,revoked)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0)`,
    [
      id,
      a.agent_id,
      a.customer_id,
      now,
      a.period_start,
      a.period_end,
      a.overall_grade,
      a.overall_score,
      a.axis_scores,
      a.violation_count,
      a.frameworks ?? null,
      a.signed_by,
    ]
  );
  return { id, issued_at: now, revoked: false, ...a };
}

export function getAttestation(id: string): Attestation | null {
  const db = getDb();
  const row = db.query('SELECT * FROM hanumang_attestations WHERE id=?').get(id) as Record<
    string,
    unknown
  > | null;
  if (!row) return null;
  return { ...row, revoked: row.revoked === 1 } as Attestation;
}

export function listAttestations(agent_id: string): Attestation[] {
  const db = getDb();
  return (
    db
      .query('SELECT * FROM hanumang_attestations WHERE agent_id=? ORDER BY issued_at DESC')
      .all(agent_id) as Record<string, unknown>[]
  ).map((r) => ({ ...r, revoked: r.revoked === 1 }) as Attestation);
}

// ── Baseline ──────────────────────────────────────────────────────────────────

export function upsertBaseline(
  agent_id: string,
  customer_id: string,
  trust_mask_used: number,
  trust_mask_granted: number,
  scope_key: string
): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.run(
    `
    INSERT INTO hanumang_baselines(id,agent_id,customer_id,trust_mask_avg_used,trust_mask_granted,typical_scope_keys,observation_count,updated_at)
    VALUES(?,?,?,?,?,?,1,?)
    ON CONFLICT(agent_id) DO UPDATE SET
      trust_mask_avg_used=(trust_mask_avg_used*observation_count+?)/(observation_count+1),
      trust_mask_granted=excluded.trust_mask_granted,
      observation_count=observation_count+1,
      updated_at=excluded.updated_at`,
    [
      `HNG-BL-${agent_id}`,
      agent_id,
      customer_id,
      trust_mask_used,
      trust_mask_granted,
      scope_key,
      now,
      trust_mask_used,
    ]
  );
}

export function getBaseline(agent_id: string) {
  const db = getDb();
  return db.query('SELECT * FROM hanumang_baselines WHERE agent_id=?').get(agent_id) as Record<
    string,
    unknown
  > | null;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function getStats() {
  const db = getDb();
  const agents = (
    db.query("SELECT COUNT(*) as n FROM hanumang_agents WHERE status='active'").get() as {
      n: number;
    }
  ).n;
  const violations = (
    db.query("SELECT COUNT(*) as n FROM hanumang_axis_observations WHERE outcome='FAIL'").get() as {
      n: number;
    }
  ).n;
  const attestations = (
    db.query('SELECT COUNT(*) as n FROM hanumang_attestations WHERE revoked=0').get() as {
      n: number;
    }
  ).n;
  const mudrikasToday = (
    db
      .query("SELECT COUNT(*) as n FROM hanumang_mudrikas WHERE verified_at >= date('now')")
      .get() as { n: number }
  ).n;
  return {
    active_agents: agents,
    total_violations: violations,
    attestations_issued: attestations,
    mudrikas_verified_today: mudrikasToday,
  };
}
