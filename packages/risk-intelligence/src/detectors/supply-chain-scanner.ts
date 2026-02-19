/**
 * Supply Chain Risk Scanner
 *
 * Checks npm and PyPI packages for:
 *   - Typosquatting (Levenshtein distance ≤ 2 from popular packages)
 *   - Known vulnerabilities (OSV.dev free API — no key required)
 *   - Abandoned packages (last release > 2 years ago)
 *   - Very new + low-download packages (possible plant)
 *   - Single maintainer (npm only — bus-factor risk)
 *   - Missing source repository
 *
 * Data sources — all free, no auth:
 *   registry.npmjs.org        — npm package metadata
 *   api.npmjs.org/downloads   — monthly download counts
 *   pypi.org/pypi/{pkg}/json  — PyPI package metadata
 *   api.osv.dev/v1/querybatch — vulnerability database (npm, PyPI, Go, Rust…)
 */

const TIMEOUT_MS = 12_000;
const ABANDONED_DAYS = 730; // 2 years

// ── OSV ecosystem names ───────────────────────────────────────────────────────

const OSV_ECOSYSTEM: Record<'npm' | 'pypi', string> = {
  npm: 'npm',
  pypi: 'PyPI',
};

// ── Levenshtein ───────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

// ── Popular packages list (for typosquat detection) ───────────────────────────

const POPULAR_NPM = new Set([
  'react',
  'react-dom',
  'lodash',
  'axios',
  'express',
  'typescript',
  'webpack',
  'babel-core',
  '@babel/core',
  'jest',
  'eslint',
  'prettier',
  'moment',
  'chalk',
  'commander',
  'dotenv',
  'uuid',
  'cors',
  'body-parser',
  'mongoose',
  'socket.io',
  'passport',
  'jsonwebtoken',
  'bcrypt',
  'bcryptjs',
  'multer',
  'sharp',
  'zod',
  'yup',
  'react-router',
  'react-router-dom',
  'next',
  'vue',
  'angular',
  'jquery',
  'tailwindcss',
  'vite',
  'rollup',
  'esbuild',
  'prisma',
  'typeorm',
  'knex',
  'redis',
  'bull',
  'winston',
  'bunyan',
  'pino',
  'morgan',
  'debug',
  'nodemon',
  'pm2',
  'cross-env',
  'rimraf',
  'glob',
  'semver',
  'chokidar',
  'inquirer',
  'yargs',
  'meow',
  'ora',
  'kleur',
  'picocolors',
  'ansi-styles',
  'supports-color',
  'minimatch',
  'micromatch',
  'fastify',
  'koa',
  'hapi',
  'nestjs',
  'sequelize',
  'knex',
  'objection',
  'luxon',
  'date-fns',
  'dayjs',
  'immer',
  'zustand',
  'jotai',
  'recoil',
  'mobx',
  'redux',
  '@reduxjs/toolkit',
  'rxjs',
  'graphql',
  'apollo-server',
  'apollo-client',
  'urql',
  'swr',
  'react-query',
  '@tanstack/react-query',
  'vitest',
  'playwright',
  'cypress',
  'puppeteer',
  'cheerio',
  'jsdom',
  'node-fetch',
  'got',
  'superagent',
  'ky',
  'undici',
]);

const POPULAR_PYPI = new Set([
  'requests',
  'numpy',
  'pandas',
  'scipy',
  'matplotlib',
  'scikit-learn',
  'tensorflow',
  'torch',
  'flask',
  'django',
  'fastapi',
  'pydantic',
  'sqlalchemy',
  'celery',
  'redis',
  'boto3',
  'botocore',
  'urllib3',
  'six',
  'certifi',
  'charset-normalizer',
  'idna',
  'packaging',
  'setuptools',
  'wheel',
  'pip',
  'tqdm',
  'Pillow',
  'cryptography',
  'PyYAML',
  'click',
  'rich',
  'httpx',
  'aiohttp',
  'pytest',
  'black',
  'mypy',
  'flake8',
  'pylint',
  'isort',
  'poetry',
  'uvicorn',
  'gunicorn',
  'starlette',
  'httpcore',
  'anyio',
  'attrs',
  'cattrs',
  'marshmallow',
  'alembic',
  'stripe',
  'twilio',
  'paramiko',
  'fabric',
  'ansible',
  'airflow',
  'luigi',
  'prefect',
  'scrapy',
  'beautifulsoup4',
  'lxml',
  'selenium',
  'playwright',
  'pytest-asyncio',
  'pytest-cov',
  'freezegun',
  'factory-boy',
  'faker',
  'arrow',
  'pendulum',
  'python-dateutil',
  'pytz',
  'dateparser',
  'psycopg2',
  'pymongo',
  'motor',
  'aioredis',
  'databases',
]);

function detectTyposquat(
  name: string,
  ecosystem: 'npm' | 'pypi'
): { target: string; distance: number } | null {
  const popular = ecosystem === 'npm' ? POPULAR_NPM : POPULAR_PYPI;
  const lower = name.toLowerCase();

  // Exact match in popular list — not a typosquat
  if (popular.has(lower) || popular.has(name)) return null;

  let closest: { target: string; distance: number } | null = null;
  for (const pkg of popular) {
    const d = levenshtein(lower, pkg.toLowerCase());
    if (d <= 2 && (closest === null || d < closest.distance)) {
      closest = { target: pkg, distance: d };
    }
  }
  return closest;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SupplyChainEcosystem = 'npm' | 'pypi';

export interface PackageCheck {
  ecosystem: SupplyChainEcosystem;
  name: string;
  version?: string; // if omitted, checks latest
}

export interface SupplyChainFinding {
  type:
    | 'typosquat'
    | 'vulnerability'
    | 'abandoned'
    | 'very_new'
    | 'single_maintainer'
    | 'no_source'
    | 'unknown_package';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  detail: string;
}

export interface PackageRisk {
  ecosystem: string;
  name: string;
  requestedVersion: string | null;
  latestVersion: string | null;
  publishedAt: string | null; // latest release date
  maintainerCount: number | null; // npm only
  monthlyDownloads: number | null; // npm only
  repositoryUrl: string | null;
  score: number; // 0–100
  findings: SupplyChainFinding[];
}

export interface SupplyChainReport {
  packages: PackageRisk[];
  summary: {
    totalPackages: number;
    highRisk: number; // score 55–74
    criticalRisk: number; // score 75–100
    totalVulnerabilities: number;
    totalTyposquats: number;
    checkedAt: string;
    durationMs: number;
  };
}

// ── OSV batch query ───────────────────────────────────────────────────────────

interface OsvVuln {
  id: string;
  summary?: string;
  database_specific?: { severity?: string };
  severity?: { type: string; score: string }[];
}

interface OsvBatchResult {
  results: Array<{ vulns?: OsvVuln[] }>;
}

async function queryOsvBatch(
  packages: Array<{ name: string; version?: string; ecosystem: string }>
): Promise<OsvVuln[][]> {
  if (packages.length === 0) return [];
  try {
    const queries = packages.map((p) => ({
      package: { name: p.name, ecosystem: p.ecosystem },
      ...(p.version ? { version: p.version } : {}),
    }));
    const res = await fetch('https://api.osv.dev/v1/querybatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ queries }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return packages.map(() => []);
    const data = (await res.json()) as OsvBatchResult;
    return data.results.map((r) => r.vulns ?? []);
  } catch {
    return packages.map(() => []);
  }
}

function osvSeverity(v: OsvVuln): 'low' | 'medium' | 'high' | 'critical' {
  const dbSev = v.database_specific?.severity?.toUpperCase();
  if (dbSev === 'CRITICAL') return 'critical';
  if (dbSev === 'HIGH') return 'high';
  if (dbSev === 'MODERATE' || dbSev === 'MEDIUM') return 'medium';
  if (dbSev === 'LOW') return 'low';

  // Fall back to CVSS score
  const cvss = v.severity?.find((s) => s.type.startsWith('CVSS'))?.score;
  if (cvss) {
    const n = parseFloat(cvss);
    if (n >= 9) return 'critical';
    if (n >= 7) return 'high';
    if (n >= 4) return 'medium';
    return 'low';
  }
  return 'medium';
}

const VULN_SCORE: Record<string, number> = {
  critical: 55,
  high: 35,
  medium: 15,
  low: 5,
};

// ── npm checks ────────────────────────────────────────────────────────────────

interface NpmPackument {
  name: string;
  'dist-tags': Record<string, string>;
  time: Record<string, string>; // version → ISO date; also "created"/"modified"
  maintainers?: { name: string }[];
  repository?: { url?: string } | string;
  versions?: Record<string, { repository?: { url: string } | string }>;
}

interface NpmDownloads {
  downloads: number;
  package: string;
}

async function checkNpm(pkg: PackageCheck): Promise<PackageRisk> {
  const findings: SupplyChainFinding[] = [];

  // Typosquat check (local, instant)
  const typo = detectTyposquat(pkg.name, 'npm');
  if (typo) {
    findings.push({
      type: 'typosquat',
      severity: typo.distance === 1 ? 'critical' : 'high',
      title: `Possible typosquat of "${typo.target}"`,
      detail: `Name differs by ${typo.distance} character(s) from the popular package "${typo.target}". Verify this is intentional.`,
    });
  }

  // Parallel: registry + downloads
  const [packument, downloads] = await Promise.allSettled([
    fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}`, {
      headers: { Accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).then((r) => (r.ok ? (r.json() as Promise<NpmPackument>) : null)),

    fetch(`https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(pkg.name)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).then((r) => (r.ok ? (r.json() as Promise<NpmDownloads>) : null)),
  ]);

  const meta = packument.status === 'fulfilled' ? packument.value : null;
  const dl = downloads.status === 'fulfilled' ? downloads.value : null;

  if (!meta) {
    findings.push({
      type: 'unknown_package',
      severity: 'high',
      title: 'Package not found on npm registry',
      detail: `"${pkg.name}" does not exist on the npm registry. This may indicate a dependency confusion attack vector.`,
    });
    return {
      ecosystem: 'npm',
      name: pkg.name,
      requestedVersion: pkg.version ?? null,
      latestVersion: null,
      publishedAt: null,
      maintainerCount: null,
      monthlyDownloads: null,
      repositoryUrl: null,
      score: computeScore(findings),
      findings,
    };
  }

  const latest = meta['dist-tags']?.latest ?? null;
  const version = pkg.version ?? latest;
  const publishedAt =
    version && meta.time?.[version] ? meta.time[version] : (meta.time?.modified ?? null);

  // Repository URL
  const repo = meta.repository;
  const repoUrl: string | null =
    typeof repo === 'string'
      ? repo
      : typeof repo?.url === 'string'
        ? repo.url.replace(/^git\+/, '').replace(/\.git$/, '')
        : null;

  // Maintainer count
  const maintainerCount = meta.maintainers?.length ?? null;

  // Monthly downloads
  const monthlyDownloads = dl?.downloads ?? null;

  // Age checks
  if (publishedAt) {
    const daysSince = (Date.now() - new Date(publishedAt).getTime()) / 86_400_000;
    if (daysSince > ABANDONED_DAYS) {
      findings.push({
        type: 'abandoned',
        severity: 'medium',
        title: `Package not updated in ${Math.floor(daysSince / 365)} year(s)`,
        detail: `Last release was ${new Date(publishedAt).toISOString().slice(0, 10)} (${Math.floor(daysSince)} days ago). Abandoned packages may contain unpatched vulnerabilities.`,
      });
    }
    if (daysSince < 30 && monthlyDownloads !== null && monthlyDownloads < 1_000) {
      findings.push({
        type: 'very_new',
        severity: 'medium',
        title: 'Very new package with low download count',
        detail: `Published ${Math.floor(daysSince)} day(s) ago with only ${monthlyDownloads.toLocaleString()} monthly downloads. New packages with low traction may be dependency confusion plants.`,
      });
    }
  }

  if (maintainerCount === 1) {
    findings.push({
      type: 'single_maintainer',
      severity: 'low',
      title: 'Single maintainer',
      detail:
        'Only one maintainer has publish access. Account takeover of a single person would compromise this package.',
    });
  }

  if (!repoUrl) {
    findings.push({
      type: 'no_source',
      severity: 'low',
      title: 'No source repository linked',
      detail: 'Package metadata does not include a repository URL, making code review impossible.',
    });
  }

  return {
    ecosystem: 'npm',
    name: pkg.name,
    requestedVersion: pkg.version ?? null,
    latestVersion: latest,
    publishedAt,
    maintainerCount,
    monthlyDownloads,
    repositoryUrl: repoUrl,
    score: computeScore(findings),
    findings,
  };
}

// ── PyPI checks ───────────────────────────────────────────────────────────────

interface PypiResponse {
  info: {
    name: string;
    version: string;
    home_page?: string;
    project_urls?: Record<string, string>;
    author?: string;
    maintainer?: string;
  };
  releases: Record<string, Array<{ upload_time: string }>>;
}

async function checkPypi(pkg: PackageCheck): Promise<PackageRisk> {
  const findings: SupplyChainFinding[] = [];

  const typo = detectTyposquat(pkg.name, 'pypi');
  if (typo) {
    findings.push({
      type: 'typosquat',
      severity: typo.distance === 1 ? 'critical' : 'high',
      title: `Possible typosquat of "${typo.target}"`,
      detail: `Name differs by ${typo.distance} character(s) from the popular package "${typo.target}".`,
    });
  }

  let meta: PypiResponse | null = null;
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(pkg.name)}/json`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) meta = (await res.json()) as PypiResponse;
  } catch {
    /* network error */
  }

  if (!meta) {
    findings.push({
      type: 'unknown_package',
      severity: 'high',
      title: 'Package not found on PyPI',
      detail: `"${pkg.name}" does not exist on PyPI. Possible dependency confusion attack vector.`,
    });
    return {
      ecosystem: 'pypi',
      name: pkg.name,
      requestedVersion: pkg.version ?? null,
      latestVersion: null,
      publishedAt: null,
      maintainerCount: null,
      monthlyDownloads: null,
      repositoryUrl: null,
      score: computeScore(findings),
      findings,
    };
  }

  const latest = meta.info.version;
  const version = pkg.version ?? latest;
  const releaseFiles = meta.releases[version] ?? meta.releases[latest] ?? [];
  const publishedAt = releaseFiles[0]?.upload_time ?? null;

  // Repository URL — check multiple fields
  const repoUrl =
    meta.info.project_urls?.Source ||
    meta.info.project_urls?.Repository ||
    meta.info.project_urls?.Homepage ||
    meta.info.home_page ||
    null;

  if (publishedAt) {
    const daysSince = (Date.now() - new Date(publishedAt).getTime()) / 86_400_000;
    if (daysSince > ABANDONED_DAYS) {
      findings.push({
        type: 'abandoned',
        severity: 'medium',
        title: `Package not updated in ${Math.floor(daysSince / 365)} year(s)`,
        detail: `Last release was ${new Date(publishedAt).toISOString().slice(0, 10)} (${Math.floor(daysSince)} days ago).`,
      });
    }
    if (daysSince < 30) {
      findings.push({
        type: 'very_new',
        severity: 'low',
        title: 'Very new package',
        detail: `Published only ${Math.floor(daysSince)} day(s) ago.`,
      });
    }
  }

  if (!repoUrl) {
    findings.push({
      type: 'no_source',
      severity: 'low',
      title: 'No source repository linked',
      detail: 'Package metadata does not include a repository URL.',
    });
  }

  return {
    ecosystem: 'pypi',
    name: pkg.name,
    requestedVersion: pkg.version ?? null,
    latestVersion: latest,
    publishedAt,
    maintainerCount: null,
    monthlyDownloads: null,
    repositoryUrl: repoUrl,
    score: computeScore(findings),
    findings,
  };
}

// ── Score calculation ─────────────────────────────────────────────────────────

function computeScore(findings: SupplyChainFinding[]): number {
  let score = 0;
  for (const f of findings) {
    if (f.type === 'typosquat') {
      score += f.severity === 'critical' ? 65 : 45;
    } else if (f.type === 'vulnerability') {
      score += VULN_SCORE[f.severity] ?? 15;
    } else if (f.type === 'abandoned') score += 20;
    else if (f.type === 'unknown_package') score += 40;
    else if (f.type === 'very_new') score += f.severity === 'medium' ? 20 : 10;
    else if (f.type === 'single_maintainer') score += 10;
    else if (f.type === 'no_source') score += 10;
  }
  return Math.min(score, 100);
}

// ── Manifest parsers ──────────────────────────────────────────────────────────

/** Parse package.json (dependencies + devDependencies) */
function parsePackageJson(content: string): PackageCheck[] {
  try {
    const pkg = JSON.parse(content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    return Object.entries(all).map(([name, ver]) => ({
      ecosystem: 'npm',
      name,
      version: typeof ver === 'string' ? ver.replace(/^[\^~>=<]/, '').split(' ')[0] : undefined,
    }));
  } catch {
    return [];
  }
}

/** Parse requirements.txt — handles name==ver, name>=ver, name~=ver, name */
function parseRequirementsTxt(content: string): PackageCheck[] {
  const pkgs: PackageCheck[] = [];
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('-')) continue;
    const match = /^([A-Za-z0-9_.-]+)(?:[=<>~!].*?)?(?:\s*;.*)?$/.exec(line);
    if (!match) continue;
    const name = match[1];
    const verMatch = /==([^\s,;]+)/.exec(line);
    pkgs.push({ ecosystem: 'pypi', name, version: verMatch?.[1] });
  }
  return pkgs;
}

export function parseManifest(content: string, hint: 'npm' | 'pypi' | 'auto'): PackageCheck[] {
  if (hint === 'npm' || (hint === 'auto' && content.trimStart().startsWith('{'))) {
    return parsePackageJson(content);
  }
  return parseRequirementsTxt(content);
}

// ── Main entry point ──────────────────────────────────────────────────────────

/** Scan up to 50 packages. Respects a ~500ms per-package budget. */
export async function scanSupplyChain(packages: PackageCheck[]): Promise<SupplyChainReport> {
  const t0 = Date.now();
  const capped = packages.slice(0, 50);

  // Phase 1 — registry metadata + typosquat (parallel, per package)
  const partials = await Promise.all(
    capped.map((pkg) => (pkg.ecosystem === 'npm' ? checkNpm(pkg) : checkPypi(pkg)))
  );

  // Phase 2 — OSV vulnerabilities (one batch request)
  const osvInputs = capped.map((pkg, i) => ({
    name: pkg.name,
    version: pkg.version ?? partials[i].latestVersion ?? undefined,
    ecosystem: OSV_ECOSYSTEM[pkg.ecosystem],
  }));
  const vulnResults = await queryOsvBatch(osvInputs);

  // Inject vuln findings into partials
  for (let i = 0; i < partials.length; i++) {
    const vulns = vulnResults[i] ?? [];
    for (const v of vulns.slice(0, 10)) {
      // cap at 10 vulns per package
      const sev = osvSeverity(v);
      partials[i].findings.push({
        type: 'vulnerability',
        severity: sev,
        title: v.summary ?? v.id,
        detail: `${v.id} — ${sev.toUpperCase()} severity`,
      });
    }
    // Re-compute score now that vulns are added
    partials[i].score = computeScore(partials[i].findings);
  }

  // Sort: highest score first
  partials.sort((a, b) => b.score - a.score);

  const totalVulns = partials.reduce(
    (s, p) => s + p.findings.filter((f) => f.type === 'vulnerability').length,
    0
  );
  const totalTyposquats = partials.reduce(
    (s, p) => s + p.findings.filter((f) => f.type === 'typosquat').length,
    0
  );

  return {
    packages: partials,
    summary: {
      totalPackages: partials.length,
      highRisk: partials.filter((p) => p.score >= 55 && p.score < 75).length,
      criticalRisk: partials.filter((p) => p.score >= 75).length,
      totalVulnerabilities: totalVulns,
      totalTyposquats,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
    },
  };
}
