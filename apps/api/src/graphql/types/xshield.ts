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

const XShieldRiskReportRef = builder.objectRef<
  XShieldRiskReport & {
    parsedFindings?: any[];
    parsedMitre?: any[];
    parsedSourceBreakdown?: Record<string, any>;
  }
>('XShieldRiskReport');

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
        const f = (report as any).parsedFindings ?? (report.findings as any[]);
        return Array.isArray(f) ? f : [];
      },
    }),

    mitreMapping: t.field({
      type: ['MitreMapping'],
      resolve: (report) => {
        const m = (report as any).parsedMitre ?? (report.mitreMapping as any);
        return Array.isArray(m) ? m : [];
      },
    }),

    sourceBreakdown: t.field({
      type: ['SourceScore'],
      resolve: (report) => {
        const bd = (report as any).parsedSourceBreakdown ?? (report.findings as any);
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

    threatNarrative: t.field({
      type: 'ThreatNarrative',
      nullable: true,
      resolve: (report) => (report as any).parsedThreatNarrative ?? null,
    }),

    brandFindings: t.field({
      type: 'BrandMonitorResult',
      nullable: true,
      resolve: (report) => (report as any).parsedBrandFindings ?? null,
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

// ── Remediation Playbook Types ─────────────────────────────────────────────────

// DNSRecord — exact record to add/update in DNS provider
builder.objectType('XShieldDNSRecord', {
  fields: (t) => ({
    type: t.string({ resolve: (r: any) => r.type }),
    name: t.string({ resolve: (r: any) => r.name }),
    value: t.string({ resolve: (r: any) => r.value }),
    ttl: t.int({ nullable: true, resolve: (r: any) => r.ttl ?? null }),
  }),
});

// RemediationStep — one copy-pasteable action
builder.objectType('RemediationStep', {
  fields: (t) => ({
    order: t.int({ resolve: (s: any) => s.order }),
    instruction: t.string({ resolve: (s: any) => s.instruction }),
    command: t.string({ nullable: true, resolve: (s: any) => s.command ?? null }),
    url: t.string({ nullable: true, resolve: (s: any) => s.url ?? null }),
    code: t.string({ nullable: true, resolve: (s: any) => s.code ?? null }),
    record: t.field({
      type: 'XShieldDNSRecord',
      nullable: true,
      resolve: (s: any) => s.record ?? null,
    }),
  }),
});

// RemediationAction — one actionable fix with steps
builder.objectType('RemediationAction', {
  fields: (t) => ({
    id: t.string({ resolve: (a: any) => a.id }),
    category: t.string({ resolve: (a: any) => a.category }),
    priority: t.string({ resolve: (a: any) => a.priority }),
    title: t.string({ resolve: (a: any) => a.title }),
    description: t.string({ resolve: (a: any) => a.description }),
    estimatedMinutes: t.int({ resolve: (a: any) => a.estimatedMinutes }),
    automatable: t.boolean({ resolve: (a: any) => a.automatable }),
    steps: t.field({
      type: ['RemediationStep'],
      resolve: (a: any) => a.steps ?? [],
    }),
  }),
});

// XShieldPlaybook — full remediation playbook for a domain
builder.objectType('XShieldPlaybook', {
  fields: (t) => ({
    domain: t.string({ resolve: (p: any) => p.domain }),
    reportId: t.string({ resolve: (p: any) => p.reportId }),
    generatedAt: t.string({ resolve: (p: any) => p.generatedAt }),
    riskScore: t.int({ resolve: (p: any) => p.riskScore }),
    riskLevel: t.string({ resolve: (p: any) => p.riskLevel }),
    totalActions: t.int({ resolve: (p: any) => p.totalActions }),
    estimatedTotalMinutes: t.int({ resolve: (p: any) => p.estimatedTotalMinutes }),
    summary: t.string({ resolve: (p: any) => p.summary }),
    cicdYaml: t.string({ resolve: (p: any) => p.cicdYaml }),
    actions: t.field({
      type: ['RemediationAction'],
      resolve: (p: any) => p.actions ?? [],
    }),
  }),
});

// ── IndiaThreatResult (X10) ──────────────────────────────────────────────────

builder.objectType('IndiaThreatResult', {
  fields: (t) => ({
    isIndiaTarget: t.boolean({ resolve: (r: any) => r.isIndiaTarget }),
    matchedPatterns: t.stringList({ resolve: (r: any) => r.matchedPatterns ?? [] }),
    certInAdvisoryMatch: t.boolean({ resolve: (r: any) => r.certInAdvisoryMatch }),
    upiFraudIndicator: t.boolean({ resolve: (r: any) => r.upiFraudIndicator }),
    govtImpersonation: t.boolean({ resolve: (r: any) => r.govtImpersonation }),
    riskScore: t.int({ resolve: (r: any) => r.riskScore }),
  }),
});

// ── PhishingKitResult (X12) ──────────────────────────────────────────────────

builder.objectType('PhishingKitResult', {
  fields: (t) => ({
    detected: t.boolean({ resolve: (r: any) => r.detected }),
    kitName: t.string({ nullable: true, resolve: (r: any) => r.kitName ?? null }),
    confidence: t.int({ resolve: (r: any) => r.confidence }),
    indicators: t.stringList({ resolve: (r: any) => r.indicators ?? [] }),
    riskScore: t.int({ resolve: (r: any) => r.riskScore }),
  }),
});

// ── BrandFinding / BrandMonitorResult (X6) ───────────────────────────────────

builder.objectType('BrandFinding', {
  fields: (t) => ({
    inputTerm: t.string({ resolve: (r: any) => r.inputTerm }),
    candidate: t.string({ resolve: (r: any) => r.candidate }),
    platform: t.string({ resolve: (r: any) => r.platform }),
    similarityScore: t.int({ resolve: (r: any) => r.similarityScore }),
    riskScore: t.int({ resolve: (r: any) => r.riskScore }),
    impersonationPatterns: t.stringList({ resolve: (r: any) => r.impersonationPatterns }),
    reason: t.string({ resolve: (r: any) => r.reason }),
  }),
});

builder.objectType('BrandMonitorResult', {
  fields: (t) => ({
    brandTerms: t.stringList({ resolve: (r: any) => r.brandTerms }),
    totalScore: t.int({ resolve: (r: any) => r.totalScore }),
    highRiskCount: t.int({ resolve: (r: any) => r.highRiskCount }),
    findings: t.field({ type: ['BrandFinding'], resolve: (r: any) => r.findings }),
  }),
});

// ── SupplyChainFinding / SupplyChainPackageReport (X7) ────────────────────────

builder.objectType('SupplyChainFinding', {
  fields: (t) => ({
    type: t.string({ resolve: (r: any) => r.type }),
    severity: t.string({ resolve: (r: any) => r.severity }),
    message: t.string({ resolve: (r: any) => r.title ?? r.message ?? '' }),
    packageName: t.string({ nullable: true, resolve: (r: any) => r.packageName ?? null }),
    cveId: t.string({ nullable: true, resolve: (r: any) => r.cveId ?? null }),
    score: t.int({ resolve: (r: any) => r.score ?? 0 }),
  }),
});

builder.objectType('SupplyChainPackageReport', {
  fields: (t) => ({
    packageName: t.string({ resolve: (r: any) => r.name ?? r.packageName }),
    ecosystem: t.string({ resolve: (r: any) => r.ecosystem }),
    riskScore: t.int({ resolve: (r: any) => r.score ?? r.riskScore ?? 0 }),
    findings: t.field({ type: ['SupplyChainFinding'], resolve: (r: any) => r.findings ?? [] }),
    summary: t.string({ resolve: (r: any) => r.summary ?? '' }),
    latestVersion: t.string({ nullable: true, resolve: (r: any) => r.latestVersion ?? null }),
    publishedAt: t.string({ nullable: true, resolve: (r: any) => r.publishedAt ?? null }),
    repositoryUrl: t.string({ nullable: true, resolve: (r: any) => r.repositoryUrl ?? null }),
    monthlyDownloads: t.int({ nullable: true, resolve: (r: any) => r.monthlyDownloads ?? null }),
    maintainerCount: t.int({ nullable: true, resolve: (r: any) => r.maintainerCount ?? null }),
  }),
});

// ── ThreatNarrative (X9) ──────────────────────────────────────────────────────

builder.objectType('ThreatNarrative', {
  fields: (t) => ({
    executiveSummary: t.string({ resolve: (r: any) => r.executiveSummary }),
    technicalBrief: t.string({ resolve: (r: any) => r.technicalBrief }),
    immediateActions: t.stringList({ resolve: (r: any) => r.immediateActions }),
    riskExplanation: t.string({ resolve: (r: any) => r.riskExplanation }),
    threatActorProfile: t.string({
      nullable: true,
      resolve: (r: any) => r.threatActorProfile ?? null,
    }),
    estimatedTimeToExploit: t.string({
      nullable: true,
      resolve: (r: any) => r.estimatedTimeToExploit ?? null,
    }),
    generatedBy: t.string({ nullable: true, resolve: (r: any) => r.generatedBy ?? null }),
  }),
});

export { XShieldRiskReportRef, DomainWatchRef, WatchAlertRef, XShieldApiKeyRef };
