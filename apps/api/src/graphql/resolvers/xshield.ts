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

// eslint-disable-next-line import/order
import crypto from 'crypto';

import {
  runRiskEngine,
  buildRemediationPlaybook,
  checkBrandImpersonation,
  scanSupplyChain,
  generateThreatNarrative,
} from '@ankrshield/risk-intelligence';

import {
  checkIndiaThreatIntel,
  fingerprintPhishingKit,
} from '../../xshield/india-threat-bridge.js';
import {
  checkPhoneRiskQuota,
  hashPhone,
  incrementPhoneRiskQuota,
  runPhoneRiskEngine,
  submitPhoneReport,
} from '../../xshield/phone-risk.js';
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
        parsedThreatNarrative: report.threatNarrative ?? null,
        parsedBrandFindings: report.brandFindings ?? null,
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

builder.queryField('xshieldScanHistory', (t) =>
  t.field({
    type: ['ScanHistoryPoint'],
    args: {
      limit: t.arg.int({ defaultValue: 30 }),
      domain: t.arg.string({ required: false }),
    },
    resolve: async (_parent, { limit, domain }, context) => {
      if (!context.apiKey) return [];
      const where: any = { apiKeyId: context.apiKey.id };
      if (domain) where.domain = domain;
      const reports = await (prisma as any).xShieldRiskReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit ?? 30, 100),
        select: { domain: true, riskScore: true, riskLevel: true, createdAt: true, findings: true },
      });
      return reports.map((r: any) => ({
        domain: r.domain,
        riskScore: r.riskScore,
        riskLevel: r.riskLevel,
        scannedAt: r.createdAt.toISOString(),
        findingCount: Array.isArray(r.findings) ? r.findings.length : 0,
      }));
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

// ── Brand Impersonation Monitor (X6) ─────────────────────────────────────────

builder.queryField('xshieldBrandMonitor', (t) =>
  t.field({
    type: 'BrandMonitorResult',
    description:
      'Heuristic brand impersonation check. FREE tier — no auth required. ' +
      'Detects typosquats, lookalike handles, and impersonation patterns on social platforms.',
    args: {
      brandTerms: t.arg.stringList({ required: true }),
      candidates: t.arg.stringList({ required: false }),
    },
    resolve: async (_parent, { brandTerms, candidates }) => {
      const candidateList = (candidates ?? []).map((name: string) => ({ name }));
      return checkBrandImpersonation(brandTerms, candidateList);
    },
  })
);

// ── Supply Chain Scanner (X7) ─────────────────────────────────────────────────

builder.queryField('xshieldSupplyChain', (t) =>
  t.field({
    type: ['SupplyChainPackageReport'],
    description:
      'Scan npm / PyPI packages for supply chain risks: typosquatting, known CVEs, ' +
      'abandoned packages, low-download new packages. FREE tier — no auth required.',
    args: {
      packages: t.arg.stringList({ required: true }), // format: npm:lodash or pypi:requests
    },
    resolve: async (_parent, { packages }) => {
      // Parse ecosystem:name or ecosystem:name@version format
      const parsed = (packages ?? [])
        .map((p: string) => {
          const [eco, rest] = p.split(':', 2);
          if (!rest) return null;
          const [name, version] = rest.split('@', 2);
          if (eco !== 'npm' && eco !== 'pypi') return null;
          return { ecosystem: eco as 'npm' | 'pypi', name, version };
        })
        .filter(Boolean) as Array<{ ecosystem: 'npm' | 'pypi'; name: string; version?: string }>;

      if (parsed.length === 0) {
        throw new Error(
          'No valid packages. Use format npm:lodash or pypi:requests or npm:express@4.18.2'
        );
      }

      const report = await scanSupplyChain(parsed);
      // Return the flat package list — each item matches SupplyChainPackageReport
      return report.packages;
    },
  })
);

// ── AI Threat Narrative (X9) ──────────────────────────────────────────────────

builder.queryField('xshieldNarrative', (t) =>
  t.field({
    type: 'ThreatNarrative',
    nullable: true,
    description:
      'Generate an AI-powered threat narrative for a domain. ' +
      'Runs a full risk scan then produces executive summary, technical brief, and remediation actions. ' +
      'Requires STARTER+ API key.',
    args: { domain: t.arg.string({ required: true }) },
    resolve: async (_parent, { domain }, context) => {
      const apiKey = await requireApiKey(context);
      if (apiKey.tier === 'FREE') {
        throw new Error(
          'xshieldNarrative requires STARTER+ tier. Upgrade at xshieldai.com/pricing'
        );
      }
      await checkAndDecrementQuota(apiKey.id);

      // Full risk scan with narrative enabled
      const report = await runRiskEngine({
        domain,
        shodanApiKey: process.env.SHODAN_API_KEY,
        otxApiKey: process.env.OTX_API_KEY,
        githubToken: process.env.GITHUB_TOKEN,
        enableGithubDork: !!process.env.GITHUB_TOKEN,
        enableThreatNarrative: true,
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      });

      // Return narrative from report if present, else generate separately
      if (report.threatNarrative) return report.threatNarrative;
      return generateThreatNarrative(report, process.env.ANTHROPIC_API_KEY);
    },
  })
);

// ── Multi-tenant Team Accounts ────────────────────────────────────────────────
// Auth: JWT via request.user (populated by authPlugin). These mutations require
// a logged-in user (not just an API key) since teams are tied to user accounts.

function requireUser(context: any): { userId: string } {
  const userId = context.userId ?? context.user?.id ?? context.user?.userId;
  if (!userId) throw new Error('Authentication required. Please sign in.');
  return { userId };
}

// xshieldTeams — list teams the caller is a member of
builder.queryField('xshieldTeams', (t) =>
  t.field({
    type: ['XShieldTeamWithMembers'],
    description: 'List all xShield teams the authenticated user belongs to.',
    resolve: async (_parent, _args, context) => {
      const { userId } = requireUser(context);

      const memberships = await (prisma as any).xShieldTeamMember.findMany({
        where: { userId },
        include: {
          team: {
            include: { _count: { select: { members: true } } },
          },
        },
        orderBy: { joinedAt: 'asc' },
      });

      return memberships.map((m: any) => ({
        ...m.team,
        myRole: m.role,
        memberCount: m.team._count?.members ?? 0,
      }));
    },
  })
);

// xshieldCreateTeam — create a new team, add caller as OWNER
builder.mutationField('xshieldCreateTeam', (t) =>
  t.field({
    type: 'XShieldTeam',
    description: 'Create a new xShield team. The caller becomes the OWNER.',
    args: {
      name: t.arg.string({ required: true }),
      slug: t.arg.string({ required: true }),
    },
    resolve: async (_parent, { name, slug }, context) => {
      const { userId } = requireUser(context);

      // Validate slug — lowercase alphanumeric + hyphens only
      if (!/^[a-z0-9-]{2,40}$/.test(slug)) {
        throw new Error('Slug must be 2-40 chars, lowercase letters, digits and hyphens only.');
      }

      // Check uniqueness
      const existing = await (prisma as any).xShieldTeam.findUnique({ where: { slug } });
      if (existing) throw new Error(`Team slug "${slug}" is already taken.`);

      // Create team + owner membership in a transaction
      const team = await (prisma as any).xShieldTeam.create({
        data: {
          name: name.trim(),
          slug: slug.trim(),
          ownerId: userId,
          members: {
            create: {
              userId,
              role: 'OWNER',
            },
          },
        },
      });

      return team;
    },
  })
);

// xshieldInviteTeamMember — OWNER or ADMIN can invite a user by email
builder.mutationField('xshieldInviteTeamMember', (t) =>
  t.field({
    type: 'XShieldTeamMember',
    description: 'Invite a user to an xShield team by email. Requires OWNER or ADMIN role.',
    args: {
      teamId: t.arg.id({ required: true }),
      email: t.arg.string({ required: true }),
      role: t.arg({ type: 'TeamRole', required: true }),
    },
    resolve: async (_parent, { teamId, email, role }, context) => {
      const { userId } = requireUser(context);

      // Verify caller is OWNER or ADMIN of the team
      const callerMembership = await (prisma as any).xShieldTeamMember.findUnique({
        where: { teamId_userId: { teamId, userId } },
      });
      if (!callerMembership) throw new Error('You are not a member of this team.');
      if (!['OWNER', 'ADMIN'].includes(callerMembership.role)) {
        throw new Error('Only OWNER or ADMIN can invite team members.');
      }

      // Prevent inviting as OWNER (only one owner allowed via transfer)
      if (role === 'OWNER') {
        throw new Error('Cannot invite as OWNER. Use team ownership transfer instead.');
      }

      // Find the target user by email
      const targetUser = await (prisma as any).user.findUnique({ where: { email } });
      if (!targetUser) throw new Error(`No user found with email: ${email}`);

      // Check if already a member
      const existingMembership = await (prisma as any).xShieldTeamMember.findUnique({
        where: { teamId_userId: { teamId, userId: targetUser.id } },
      });
      if (existingMembership) {
        throw new Error(`${email} is already a member of this team.`);
      }

      // Add member
      return (prisma as any).xShieldTeamMember.create({
        data: {
          teamId,
          userId: targetUser.id,
          role,
        },
      });
    },
  })
);

// ── xshieldPhoneRisk (XS-SATOI) ───────────────────────────────────────────────

builder.queryField('xshieldPhoneRisk', (t) =>
  t.field({
    type: 'PhoneRiskResult',
    args: { number: t.arg.string({ required: true }) },
    description:
      'Check if a phone number has been reported as hijacked/spoofed (XS-SATOI). Rate-limited per tier.',
    resolve: async (_root, args, ctx) => {
      const quotaKey = ctx?.userId ? hashPhone(ctx.userId) : hashPhone((ctx as any)?.ip ?? 'anon');
      const quota = await checkPhoneRiskQuota(prisma, quotaKey, ctx?.tier ?? 'FREE');
      if (!quota.allowed) {
        throw new Error(
          `Daily phone risk quota exceeded. Resets at ${quota.resetAt}. Upgrade at xshieldai.com/pricing`
        );
      }
      const result = await runPhoneRiskEngine(prisma, args.number);
      await incrementPhoneRiskQuota(prisma, quotaKey);
      return result;
    },
  })
);

// ── xshieldSubmitPhoneReport (crowd-source) ───────────────────────────────────

builder.mutationField('xshieldSubmitPhoneReport', (t) =>
  t.boolean({
    args: {
      number: t.arg.string({ required: true }),
      platform: t.arg.string({ required: true }),
      notes: t.arg.string(),
    },
    description: 'Submit a crowd-sourced report of a hijacked phone account.',
    resolve: async (_root, args) => {
      await submitPhoneReport(prisma, args.number, args.platform, args.notes ?? undefined);
      return true;
    },
  })
);
