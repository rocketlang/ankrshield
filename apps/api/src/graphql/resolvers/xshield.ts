/**
 * xShield GraphQL Resolvers
 *
 * Queries:
 *   xshieldScan(domain)           — full risk report (no auth, quota enforced)
 *   xshieldPlaybook(domain)       — remediation playbook from risk scan (API key required)
 *   xshieldApiKey(keyPrefix)      — info about a key (auth: the key itself via header)
 *   xshieldWatches                — list watches for authenticated API key
 *   xshieldWatchAlerts(watchId)   — alerts for a specific watch
 *   xshieldTyposquats(domain)     — generate typosquat variants
 *   xshieldIocFeed                — IOC feed (CRITICAL/HIGH domains from recent scans)
 *   xshieldStatus                 — platform health/stats
 *
 * Mutations:
 *   xshieldCreateApiKey(input)    — create API key, returns raw key ONCE
 *   xshieldAddWatch(input)        — add domain to watch list
 *   xshieldRemoveWatch(watchId)   — remove watch
 *   xshieldPauseWatch(watchId)    — pause watch
 *   xshieldResumeWatch(watchId)   — resume watch
 */

import crypto from 'crypto';

import { runRiskEngine, buildRemediationPlaybook } from '@ankrshield/risk-intelligence';

import {
  checkIndiaThreatIntel,
  fingerprintPhishingKit,
} from '../../xshield/india-threat-bridge.js';
import { scanDomain, generateTyposquats } from '../../xshield/risk-engine';
import { builder, prisma } from '../builder';
import { XShieldApiKeyCreateInput, WatchCreateInput } from '../types/xshield';

// ── API Key helpers ───────────────────────────────────────────────────────────

function generateRawKey(): string {
  return 'xsk_' + crypto.randomBytes(24).toString('base64url');
}

function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function resolveApiKey(rawKey: string) {
  const hash = hashKey(rawKey);
  return (prisma as any).xShieldApiKey.findUnique({ where: { keyHash: hash } });
}

function getApiKeyFromContext(context: any): string | null {
  return (context.request?.headers?.['x-api-key'] as string) ?? null;
}

async function requireApiKey(context: any) {
  const rawKey = getApiKeyFromContext(context);
  if (!rawKey) throw new Error('X-API-Key header required');
  const apiKey = await resolveApiKey(rawKey);
  if (!apiKey || !apiKey.isActive) throw new Error('Invalid or inactive API key');
  return apiKey;
}

async function checkAndDecrementQuota(apiKeyId: string): Promise<void> {
  const key = await (prisma as any).xShieldApiKey.findUnique({ where: { id: apiKeyId } });
  if (!key) throw new Error('API key not found');

  // Reset quota if new month
  const now = new Date();
  if (key.quotaResetAt < now) {
    await (prisma as any).xShieldApiKey.update({
      where: { id: apiKeyId },
      data: { usedThisMonth: 0, quotaResetAt: new Date(now.getFullYear(), now.getMonth() + 1, 1) },
    });
    return;
  }

  if (key.tier === 'FREE' && key.usedThisMonth >= key.monthlyQuota) {
    throw new Error(
      `Monthly quota exceeded (${key.monthlyQuota} reports/month on Free tier). Upgrade at xshieldai.com/pricing`
    );
  }

  await (prisma as any).xShieldApiKey.update({
    where: { id: apiKeyId },
    data: { usedThisMonth: { increment: 1 }, lastUsedAt: now },
  });
}

// ── Queries ───────────────────────────────────────────────────────────────────

builder.queryField('xshieldScan', (t) =>
  t.field({
    type: 'XShieldRiskReport',
    args: {
      domain: t.arg.string({ required: true }),
    },
    resolve: async (_parent, { domain }, context) => {
      // Try to authenticate (optional — anonymous gets basic free scan)
      const rawKey = getApiKeyFromContext(context);
      let apiKeyId: string | null = null;

      if (rawKey) {
        const key = await resolveApiKey(rawKey);
        if (key?.isActive) {
          await checkAndDecrementQuota(key.id);
          apiKeyId = key.id;
        }
      }

      // Run risk scan
      const report = await scanDomain(domain);

      // Persist to DB
      const saved = await (prisma as any).xShieldRiskReport.create({
        data: {
          domain: report.domain,
          riskScore: report.riskScore,
          riskLevel: report.riskLevel,
          findings: report.findings as any,
          mitreMapping: {
            mappings: report.mitreMapping,
            navigatorLayer: report.navigatorLayer,
            summary: report.summary,
            recommendations: report.recommendations,
          } as any,
          ...(apiKeyId ? { apiKeyId } : {}),
        },
      });

      // Enrich saved object with parsed fields for resolver
      return Object.assign(saved, {
        parsedFindings: report.findings,
        parsedMitre: report.mitreMapping,
        parsedSourceBreakdown: report.sourceBreakdown,
      });
    },
  })
);

builder.queryField('xshieldWatches', (t) =>
  t.field({
    type: ['DomainWatch'],
    resolve: async (_parent, _args, context) => {
      const apiKey = await requireApiKey(context);
      return (prisma as any).xShieldDomainWatch.findMany({
        where: { apiKeyId: apiKey.id, status: { not: 'DELETED' } },
        orderBy: { createdAt: 'desc' },
      });
    },
  })
);

builder.queryField('xshieldWatchAlerts', (t) =>
  t.field({
    type: ['WatchAlert'],
    args: {
      watchId: t.arg.string({ required: true }),
      limit: t.arg.int({ defaultValue: 20 }),
    },
    resolve: async (_parent, { watchId, limit }, context) => {
      const apiKey = await requireApiKey(context);
      // Verify ownership
      const watch = await (prisma as any).xShieldDomainWatch.findFirst({
        where: { id: watchId, apiKeyId: apiKey.id },
      });
      if (!watch) throw new Error('Watch not found');

      return (prisma as any).watchAlert.findMany({
        where: { watchId },
        orderBy: { triggeredAt: 'desc' },
        take: limit ?? 20,
      });
    },
  })
);

builder.queryField('xshieldTyposquats', (t) =>
  t.field({
    type: ['String'],
    args: {
      domain: t.arg.string({ required: true }),
    },
    resolve: (_parent, { domain }) => generateTyposquats(domain),
  })
);

builder.queryField('xshieldIocFeed', (t) =>
  t.field({
    type: ['String'],
    args: {
      limit: t.arg.int({ defaultValue: 100 }),
      minRiskScore: t.arg.int({ defaultValue: 60 }),
    },
    resolve: async (_parent, { limit, minRiskScore }) => {
      const reports = await (prisma as any).xShieldRiskReport.findMany({
        where: {
          riskScore: { gte: minRiskScore ?? 60 },
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) }, // last 7 days
        },
        orderBy: { riskScore: 'desc' },
        take: limit ?? 100,
        distinct: ['domain'],
        select: { domain: true, riskScore: true, riskLevel: true },
      });

      return reports.map((r) => `${r.domain} (score:${r.riskScore} level:${r.riskLevel})`);
    },
  })
);

builder.queryField('xshieldStatus', (t) =>
  t.field({
    type: 'XShieldStatus',
    resolve: async () => {
      const [totalScans, activeWatches, totalApiKeys] = await Promise.all([
        (prisma as any).xShieldRiskReport.count(),
        (prisma as any).xShieldDomainWatch.count({ where: { status: 'ACTIVE' } }),
        (prisma as any).xShieldApiKey.count({ where: { isActive: true } }),
      ]);

      return {
        status: 'operational',
        totalScans,
        activeWatches,
        totalApiKeys,
        sources: [
          'DNS/SPF/DMARC',
          'GreyNoise',
          'HIBP',
          'Shodan',
          'crt.sh',
          'PhishTank/OpenPhish',
          'VirusTotal',
          'MXToolbox',
          'URLScan',
          'OTX/AlienVault',
          'PasteMonitor',
          'GitHub',
          'Typosquat',
        ],
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      };
    },
  })
);

builder.objectType('XShieldStatus', {
  fields: (t) => ({
    status: t.string({ resolve: (s: any) => s.status }),
    totalScans: t.int({ resolve: (s: any) => s.totalScans }),
    activeWatches: t.int({ resolve: (s: any) => s.activeWatches }),
    totalApiKeys: t.int({ resolve: (s: any) => s.totalApiKeys }),
    sources: t.stringList({ resolve: (s: any) => s.sources }),
    version: t.string({ resolve: (s: any) => s.version }),
    timestamp: t.string({ resolve: (s: any) => s.timestamp }),
  }),
});

builder.queryField('xshieldApiKeyInfo', (t) =>
  t.field({
    type: 'XShieldApiKey',
    nullable: true,
    resolve: async (_parent, _args, context) => {
      const rawKey = getApiKeyFromContext(context);
      if (!rawKey) return null;
      return resolveApiKey(rawKey);
    },
  })
);

// ── Mutations ─────────────────────────────────────────────────────────────────

builder.mutationField('xshieldCreateApiKey', (t) =>
  t.field({
    type: 'CreateApiKeyResult',
    args: {
      input: t.arg({ type: XShieldApiKeyCreateInput, required: true }),
    },
    resolve: async (_parent, { input }) => {
      const raw = generateRawKey();
      const hash = hashKey(raw);
      const prefix = raw.slice(0, 12); // "xsk_XXXXXXXX"

      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(1);
      nextMonth.setHours(0, 0, 0, 0);

      const apiKey = await (prisma as any).xShieldApiKey.create({
        data: {
          keyHash: hash,
          keyPrefix: prefix,
          name: input.name,
          email: input.email,
          orgName: input.orgName ?? null,
          tier: 'FREE',
          monthlyQuota: 10,
          usedThisMonth: 0,
          quotaResetAt: nextMonth,
        },
      });

      return { apiKey, rawKey: raw };
    },
  })
);

builder.mutationField('xshieldAddWatch', (t) =>
  t.field({
    type: 'DomainWatch',
    args: {
      input: t.arg({ type: WatchCreateInput, required: true }),
    },
    resolve: async (_parent, { input }, context) => {
      const apiKey = await requireApiKey(context);

      // STARTER+ only
      if (apiKey.tier === 'FREE') {
        throw new Error(
          'Domain Watch requires Starter tier or above. Upgrade at xshieldai.com/pricing'
        );
      }

      // Check for existing watch
      const existing = await (prisma as any).xShieldDomainWatch.findFirst({
        where: { apiKeyId: apiKey.id, domain: input.domain.toLowerCase() },
      });
      if (existing && existing.status !== 'DELETED') {
        throw new Error(`Already watching ${input.domain}`);
      }

      return (prisma as any).xShieldDomainWatch.upsert({
        where: { apiKeyId_domain: { apiKeyId: apiKey.id, domain: input.domain.toLowerCase() } },
        create: {
          apiKeyId: apiKey.id,
          domain: input.domain.toLowerCase(),
          alertThreshold: input.alertThreshold ?? 40,
          webhookUrl: input.webhookUrl ?? null,
          status: 'ACTIVE',
        },
        update: {
          status: 'ACTIVE',
          alertThreshold: input.alertThreshold ?? 40,
          webhookUrl: input.webhookUrl ?? null,
        },
      });
    },
  })
);

builder.mutationField('xshieldRemoveWatch', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      watchId: t.arg.string({ required: true }),
    },
    resolve: async (_parent, { watchId }, context) => {
      const apiKey = await requireApiKey(context);
      const watch = await (prisma as any).xShieldDomainWatch.findFirst({
        where: { id: watchId, apiKeyId: apiKey.id },
      });
      if (!watch) throw new Error('Watch not found');

      await (prisma as any).xShieldDomainWatch.update({
        where: { id: watchId },
        data: { status: 'DELETED' },
      });
      return true;
    },
  })
);

builder.mutationField('xshieldPauseWatch', (t) =>
  t.field({
    type: 'DomainWatch',
    args: {
      watchId: t.arg.string({ required: true }),
    },
    resolve: async (_parent, { watchId }, context) => {
      const apiKey = await requireApiKey(context);
      const watch = await (prisma as any).xShieldDomainWatch.findFirst({
        where: { id: watchId, apiKeyId: apiKey.id },
      });
      if (!watch) throw new Error('Watch not found');

      return (prisma as any).xShieldDomainWatch.update({
        where: { id: watchId },
        data: { status: 'PAUSED' },
      });
    },
  })
);

builder.mutationField('xshieldResumeWatch', (t) =>
  t.field({
    type: 'DomainWatch',
    args: {
      watchId: t.arg.string({ required: true }),
    },
    resolve: async (_parent, { watchId }, context) => {
      const apiKey = await requireApiKey(context);
      const watch = await (prisma as any).xShieldDomainWatch.findFirst({
        where: { id: watchId, apiKeyId: apiKey.id },
      });
      if (!watch) throw new Error('Watch not found');

      return (prisma as any).xShieldDomainWatch.update({
        where: { id: watchId },
        data: { status: 'ACTIVE' },
      });
    },
  })
);

// ── India Threat Intelligence (X10) ──────────────────────────────────────────

builder.queryField('xshieldIndiaThreat', (t) =>
  t.field({
    type: 'IndiaThreatResult',
    description:
      'Check a domain for India-specific threat patterns: UPI fraud, government impersonation, CERT-In advisories, telecom DLT fraud.',
    args: {
      domain: t.arg.string({ required: true }),
      ip: t.arg.string({ required: false }),
    },
    resolve: async (_parent, { domain, ip }) => {
      return checkIndiaThreatIntel(domain, ip ?? undefined);
    },
  })
);

// ── Phishing Kit Fingerprinter (X12) ─────────────────────────────────────────

builder.queryField('xshieldPhishingKit', (t) =>
  t.field({
    type: 'PhishingKitResult',
    description:
      'Fetch and fingerprint a domain for known phishing kit signatures (GoPhish, Evilginx2, Modlishka, King Phisher, Zphisher, BlackEye).',
    args: {
      domain: t.arg.string({ required: true }),
    },
    resolve: async (_parent, { domain }) => {
      return fingerprintPhishingKit(domain);
    },
  })
);

// ── Remediation Playbook ───────────────────────────────────────────────────────

builder.queryField('xshieldPlaybook', (t) =>
  t.field({
    type: 'XShieldPlaybook',
    description:
      'Generate a concrete remediation playbook for a domain. Runs full 12-source risk scan and produces copy-pasteable fix actions for every finding.',
    args: {
      domain: t.arg.string({ required: true }),
    },
    resolve: async (_parent, { domain }, context) => {
      // Require API key — playbook is a premium feature (STARTER+)
      const apiKey = await requireApiKey(context);
      if (apiKey.tier === 'FREE') {
        throw new Error(
          'Remediation playbooks require STARTER tier or above. Upgrade at xshieldai.com/pricing'
        );
      }

      await checkAndDecrementQuota(apiKey.id);

      // Run the full risk-intelligence engine (12 sources, richer than xshieldScan)
      const report = await runRiskEngine({
        domain,
        shodanApiKey: process.env.SHODAN_API_KEY,
        otxApiKey: process.env.OTX_API_KEY,
        githubToken: process.env.GITHUB_TOKEN,
        enableGithubDork: !!process.env.GITHUB_TOKEN,
      });

      // Generate the playbook — exact DNS records, ufw commands, takedown templates, etc.
      const playbook = buildRemediationPlaybook(report);

      // Persist the report for audit trail
      await (prisma as any).xShieldRiskReport.create({
        data: {
          apiKeyId: apiKey.id,
          domain,
          riskScore: report.riskScore,
          riskLevel: report.riskLevel.toUpperCase(),
          findings: report.factors as any,
          mitreMapping: { playbook, summary: playbook.summary } as any,
        },
      });

      return playbook;
    },
  })
);
