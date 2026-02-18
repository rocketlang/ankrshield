/**
 * GitHub Secret Exposure Scanner
 *
 * Searches public GitHub repositories for accidentally committed secrets,
 * credentials, and configuration files referencing the target domain.
 *
 * This is the #1 free intelligence source that Resecurity charges $50K/year
 * to monitor. Developers frequently commit .env files, config files with
 * database URLs, and API keys that reference their company domain.
 *
 * Requires: GITHUB_TOKEN (free personal access token at github.com/settings/tokens)
 * Endpoint: GET https://api.github.com/search/code
 *
 * Rate limit: 10 req/minute authenticated (vs 10/hour unauthenticated).
 * We run 3 targeted dork patterns per call — enough signal without burning quota.
 *
 * If GITHUB_TOKEN is not set, returns [] silently.
 */

import type { RiskFactor } from '../types.js';

const GH_SEARCH = 'https://api.github.com/search/code';
const TIMEOUT_MS = 15_000;

export interface GithubLeakHit {
  repository: string;
  filePath: string;
  url: string;
  /** The code snippet from the search result */
  snippet: string;
  /** Best-guess classification of what was leaked */
  leakType: 'api_key' | 'database_url' | 'password' | 'env_file' | 'config' | 'domain_mention';
  detectedAt: string;
}

interface GhSearchItem {
  path?: string;
  html_url?: string;
  repository?: { full_name?: string };
  text_matches?: Array<{ fragment?: string }>;
}

interface GhSearchResponse {
  total_count?: number;
  items?: GhSearchItem[];
  message?: string; // e.g. "API rate limit exceeded"
}

const DORK_PATTERNS = [
  { q: (d: string) => `"${d}" filename:.env`, type: 'env_file' as const },
  { q: (d: string) => `"${d}" password OR secret OR api_key`, type: 'api_key' as const },
  { q: (d: string) => `"${d}" DATABASE_URL OR connectionstring`, type: 'database_url' as const },
];

function classifySnippet(snippet: string): GithubLeakHit['leakType'] {
  const s = snippet.toLowerCase();
  if (
    s.includes('database_url') ||
    s.includes('connectionstring') ||
    s.includes('postgres://') ||
    s.includes('mysql://')
  )
    return 'database_url';
  if (
    s.includes('api_key') ||
    s.includes('api-key') ||
    s.includes('apikey') ||
    s.includes('secret') ||
    s.includes('token')
  )
    return 'api_key';
  if (s.includes('password') || s.includes('passwd') || s.includes('pwd')) return 'password';
  if (s.includes('.env')) return 'env_file';
  return 'domain_mention';
}

async function runDork(query: string, apiKey: string): Promise<GhSearchItem[]> {
  const url = `${GH_SEARCH}?q=${encodeURIComponent(query)}&per_page=5&sort=indexed`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Accept: 'application/vnd.github.text-match+json',
        Authorization: `Bearer ${apiKey}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'xShieldAI/1.0',
      },
    });

    if (res.status === 403 || res.status === 429) return []; // rate limited
    if (!res.ok) return [];

    const data = (await res.json()) as GhSearchResponse;
    if (data.message?.includes('rate limit')) return [];
    return data.items ?? [];
  } catch {
    return [];
  }
}

/**
 * Search GitHub for secrets/credentials referencing the given domain.
 * Returns [] immediately if GITHUB_TOKEN is not set.
 */
export async function scanGithubSecrets(
  domain: string,
  githubToken?: string
): Promise<GithubLeakHit[]> {
  const token = githubToken ?? process.env['GITHUB_TOKEN'];
  if (!token) return [];

  const base = domain.toLowerCase().replace(/^www\./, '');
  const now = new Date().toISOString();
  const hits: GithubLeakHit[] = [];
  const seen = new Set<string>();

  // Run dork patterns sequentially to respect 10 req/min rate limit
  for (const dork of DORK_PATTERNS) {
    const items = await runDork(dork.q(base), token);

    for (const item of items) {
      const url = item.html_url ?? '';
      if (seen.has(url)) continue;
      seen.add(url);

      const snippet = item.text_matches?.[0]?.fragment ?? '';
      hits.push({
        repository: item.repository?.full_name ?? 'unknown/unknown',
        filePath: item.path ?? '',
        url,
        snippet: snippet.slice(0, 300),
        leakType: snippet ? classifySnippet(snippet) : dork.type,
        detectedAt: now,
      });
    }

    // Small delay to avoid rate limit
    await new Promise((r) => setTimeout(r, 500));
  }

  return hits;
}

/**
 * Convert GitHub leak hits into RiskFactor entries.
 */
export function githubLeaksToFactors(hits: GithubLeakHit[], domain: string): RiskFactor[] {
  if (hits.length === 0) return [];

  const credHits = hits.filter((h) =>
    ['api_key', 'database_url', 'password', 'env_file'].includes(h.leakType)
  );
  const factors: RiskFactor[] = [];

  if (credHits.length > 0) {
    factors.push({
      category: 'code_secret_exposure',
      summary: `${credHits.length} public GitHub file(s) contain possible credentials/secrets referencing ${domain}`,
      score: Math.min(50 + credHits.length * 15, 90),
      source: 'internal',
      detail: credHits
        .slice(0, 3)
        .map((h) => `${h.repository}/${h.filePath} (${h.leakType})`)
        .join(' · '),
    });
  }

  const mentionHits = hits.filter((h) => h.leakType === 'domain_mention');
  if (mentionHits.length > 0) {
    factors.push({
      category: 'scanner_activity',
      summary: `${mentionHits.length} public GitHub file(s) mention ${domain} — possible recon or disclosure`,
      score: Math.min(10 + mentionHits.length * 5, 30),
      source: 'internal',
      detail: mentionHits
        .slice(0, 3)
        .map((h) => h.repository)
        .join(', '),
    });
  }

  return factors;
}
