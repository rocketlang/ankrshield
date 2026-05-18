/**
 * Immutable Audit Logger
 * @rule:XSACT-009 Audit trail mandatory for ALL actions
 * @rule:INF-XSACT-004 No audit write → action BLOCKED
 * @rule:CA-003 before_snapshot + after_snapshot + delta in every record
 */

import { randomUUID } from 'node:crypto';

export type ConsentMode = 'mode_1' | 'mode_2' | 'mode_3';
export type ExecutionPath = 'option_a' | 'option_b' | 'both';
export type AuditResult = 'success' | 'blocked' | 'failed' | 'pending_approval';

export interface AuditRecord {
  id: string;
  client_id: string;
  timestamp: string;

  // @rule:CA-003
  before_snapshot: Record<string, unknown>;
  action_taken: string;
  after_snapshot: Record<string, unknown> | null;
  delta: Record<string, unknown> | null;

  // @rule:XSACT-009
  consent_mode: ConsentMode;
  execution_path: ExecutionPath;
  rule_id_applied: string[];
  jurisdiction_detected: string;
  legal_basis_applied: string;

  result: AuditResult;
  result_detail?: string;

  // @rule:CA-004 telemetry minimum
  duration_ms: number;
  trust_mask_applied: number;
}

/** File-backed append-only audit log — survives restarts. @see persistence/file-store.ts */
import { FileBackedArray } from '../persistence/file-store.js';
const auditLog = new FileBackedArray<AuditRecord>('audit-log');

/**
 * Write an audit record BEFORE executing an action.
 * @rule:INF-XSACT-004 If this throws, the caller MUST block the action.
 */
export function writeAuditRecord(record: Omit<AuditRecord, 'id' | 'timestamp'>): AuditRecord {
  const full: AuditRecord = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...record,
  };

  // In production: append to immutable DB table with write-once constraint
  auditLog.push(full);

  return full;
}

export function getAuditRecords(clientId: string): AuditRecord[] {
  return auditLog.filter((r) => r.client_id === clientId);
}

export function getAuditRecord(id: string): AuditRecord | undefined {
  return auditLog.find((r) => r.id === id);
}
