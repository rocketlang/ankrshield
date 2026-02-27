/**
 * xShield GraphQL Types
 * Domain risk scanning, watch management, API key management
 */

import { builder } from '../builder';

// Use structural typing instead of Prisma imports (generated client may lag in monorepo TS resolution)
type XShieldApiKey = any;
type DomainWatch = any;
type WatchAlert = any;
type XShieldRiskReport = any;

// ── Enums ─────────────────────────────────────────────────────────────────────

builder.enumType('XShieldTier', {
  values: ['FREE', 'STARTER', 'PRO', 'ENTERPRISE'] as const,
});

builder.enumType('RiskLevel', {
  values: ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const,
});

builder.enumType('WatchStatus', {
  values: ['ACTIVE', 'PAUSED', 'DELETED'] as const,
});

// ── Simple object types (JSON fields returned as plain strings/objects) ────────

// RiskFinding — single threat signal from one source
builder.objectType('RiskFinding', {
  fields: (t) => ({
    source: t.string({ resolve: (r: any) => r.source }),
    signal: t.string({ resolve: (r: any) => r.signal }),
    severity: t.string({ resolve: (r: any) => r.severity }),
    detail: t.string({ resolve: (r: any) => r.detail }),
    mitreId: t.string({ nullable: true, resolve: (r: any) => r.mitreId ?? null }),
    mitreTactic: t.string({ nullable: true, resolve: (r: any) => r.mitreTactic ?? null }),
    mitreTechnique: t.string({ nullable: true, resolve: (r: any) => r.mitreTechnique ?? null }),
  }),
});

// MitreMapping — ATT&CK technique for Navigator
builder.objectType('MitreMapping', {
  fields: (t) => ({
    techniqueId: t.string({ resolve: (m: any) => m.techniqueId }),
    techniqueName: t.string({ resolve: (m: any) => m.techniqueName }),
    tacticId: t.string({ resolve: (m: any) => m.tacticId }),
    tacticName: t.string({ resolve: (m: any) => m.tacticName }),
    confidence: t.string({ resolve: (m: any) => m.confidence }),
    source: t.string({ resolve: (m: any) => m.source }),
  }),
});

// SourceScore — per-source contribution to risk score
builder.objectType('SourceScore', {
  fields: (t) => ({
    source: t.string({ resolve: (s: any) => s.source }),
    score: t.int({ resolve: (s: any) => s.score }),
    findings: t.int({ resolve: (s: any) => s.findings }),
  }),
});

// ── XShieldRiskReport ─────────────────────────────────────────────────────────

const XShieldRiskReportRef = builder.objectRef<XShieldRiskReport & {
  parsedFindings?: any[];
  parsedMitre?: any[];
  parsedSourceBreakdown?: Record<string, any>;
}>('XShieldRiskReport');

XShieldRiskReportRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    domain: t.exposeString('domain'),
    riskScore: t.exposeInt('riskScore'),
    riskLevel: t.expose('riskLevel', { type: 'RiskLevel' }),
    scannedAt: t.expose('createdAt', { type: 'DateTime' }),

    findings: t.field({
      type: ['RiskFinding'],
      resolve: (report) => {
        const f = (report as any).parsedFindings ?? report.findings as any[];
        return Array.isArray(f) ? f : [];
      },
    }),

    mitreMapping: t.field({
      type: ['MitreMapping'],
      resolve: (report) => {
        const m = (report as any).parsedMitre ?? report.mitreMapping as any;
        return Array.isArray(m) ? m : [];
      },
    }),

    sourceBreakdown: t.field({
      type: ['SourceScore'],
      resolve: (report) => {
        const bd = (report as any).parsedSourceBreakdown ?? report.findings as any;
        if (!bd || typeof bd !== 'object') return [];
        // If it's already the findings array, skip — sourceBreakdown stored separately
        if (Array.isArray(bd)) return [];
        return Object.entries(bd).map(([source, v]: [string, any]) => ({
          source,
          score: v.score ?? 0,
          findings: v.findings ?? 0,
        }));
      },
    }),

    summary: t.string({
      resolve: (report) => {
        const m = report.mitreMapping as any;
        return typeof m?.summary === 'string' ? m.summary : `Risk assessment for ${report.domain}`;
      },
    }),

    recommendations: t.stringList({
      resolve: (report) => {
        const m = report.mitreMapping as any;
        return Array.isArray(m?.recommendations) ? m.recommendations : [];
      },
    }),
  }),
});

// ── DomainWatch ───────────────────────────────────────────────────────────────

const DomainWatchRef = builder.objectRef<DomainWatch>('DomainWatch');

DomainWatchRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    domain: t.exposeString('domain'),
    status: t.expose('status', { type: 'WatchStatus' }),
    lastRiskScore: t.exposeInt('lastRiskScore', { nullable: true }),
    lastRiskLevel: t.expose('lastRiskLevel', { type: 'RiskLevel', nullable: true }),
    lastScannedAt: t.expose('lastScannedAt', { type: 'DateTime', nullable: true }),
    alertThreshold: t.exposeInt('alertThreshold'),
    webhookUrl: t.exposeString('webhookUrl', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
  }),
});

// ── WatchAlert ────────────────────────────────────────────────────────────────

const WatchAlertRef = builder.objectRef<WatchAlert>('WatchAlert');

WatchAlertRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    domain: t.exposeString('domain'),
    riskScore: t.exposeInt('riskScore'),
    riskLevel: t.expose('riskLevel', { type: 'RiskLevel' }),
    triggeredAt: t.expose('triggeredAt', { type: 'DateTime' }),
    notified: t.exposeBoolean('notified'),
    notifiedAt: t.expose('notifiedAt', { type: 'DateTime', nullable: true }),
  }),
});

// ── XShieldApiKey ─────────────────────────────────────────────────────────────

const XShieldApiKeyRef = builder.objectRef<XShieldApiKey>('XShieldApiKey');

XShieldApiKeyRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    keyPrefix: t.exposeString('keyPrefix'),
    name: t.exposeString('name'),
    orgName: t.exposeString('orgName', { nullable: true }),
    email: t.exposeString('email'),
    tier: t.expose('tier', { type: 'XShieldTier' }),
    monthlyQuota: t.exposeInt('monthlyQuota'),
    usedThisMonth: t.exposeInt('usedThisMonth'),
    isActive: t.exposeBoolean('isActive'),
    lastUsedAt: t.expose('lastUsedAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});

// ── Input types ───────────────────────────────────────────────────────────────

export const XShieldApiKeyCreateInput = builder.inputType('XShieldApiKeyCreateInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    email: t.string({ required: true }),
    orgName: t.string({ required: false }),
  }),
});

export const WatchCreateInput = builder.inputType('WatchCreateInput', {
  fields: (t) => ({
    domain: t.string({ required: true }),
    alertThreshold: t.int({ required: false }),
    webhookUrl: t.string({ required: false }),
  }),
});

// ── CreateApiKeyResult (includes the raw key once) ───────────────────────────

builder.objectType('CreateApiKeyResult', {
  fields: (t) => ({
    apiKey: t.field({ type: XShieldApiKeyRef, resolve: (r: any) => r.apiKey }),
    rawKey: t.string({ resolve: (r: any) => r.rawKey }),
  }),
});

export {
  XShieldRiskReportRef,
  DomainWatchRef,
  WatchAlertRef,
  XShieldApiKeyRef,
};
