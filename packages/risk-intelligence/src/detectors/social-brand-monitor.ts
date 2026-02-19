/**
 * Social Brand Impersonation Monitor
 *
 * Detects fake accounts, channels, and groups impersonating a brand on
 * social/messaging platforms: Telegram, Discord, Twitter/X, GitHub.
 *
 * Attack patterns detected:
 *   1. Typosquatting (ankrlabs vs ankr-labs, ankrr vs ankr)
 *   2. Lookalike names (AnkrOfficial, OfficialAnkr, AnkrSupport)
 *   3. Common impersonation suffixes (_official, _support, _help, _airdrop)
 *   4. Leet-speak substitutions (4nkr, @nkr)
 *   5. Homoglyph substitutions (аnkr with Cyrillic а)
 *
 * Phase 1 (this implementation): heuristic typosquatting generation + scoring.
 * Phase 2 (future): live platform API queries for real-time monitoring.
 *
 * Usage:
 *   const result = checkBrandImpersonation(['ankr', 'ankrshield', 'xshield'], candidates);
 *   // candidates comes from: platform scraping, user reports, scheduled API queries
 */

export interface BrandFinding {
  inputTerm: string; // The brand term being protected
  candidate: string; // The suspicious name/handle found
  platform: string; // telegram | discord | twitter | github | unknown
  similarityScore: number; // 0-100: how similar to original
  impersonationPatterns: string[]; // Which patterns matched
  riskScore: number; // Overall threat score 0-100
  reason: string;
}

export interface BrandMonitorResult {
  brandTerms: string[];
  findings: BrandFinding[];
  totalScore: number; // Max score across all findings
  highRiskCount: number; // Findings with riskScore >= 70
}

// ---------------------------------------------------------------------------
// Impersonation patterns
// ---------------------------------------------------------------------------

const IMPERSONATION_PREFIXES = [
  'official',
  'real',
  'the',
  'true',
  'original',
  'verified',
  'official_',
  'real_',
  'the_',
  'true_',
];

const IMPERSONATION_SUFFIXES = [
  '_official',
  '_support',
  '_help',
  '_airdrop',
  '_bot',
  '_io',
  '_token',
  '_coin',
  '_nft',
  '_dao',
  '_defi',
  '_finance',
  '_news',
  '_ann',
  '_announcements',
  '_admin',
  '_team',
  'official',
  'support',
  'help',
  'airdrop',
  'bot',
];

// Leet-speak substitutions
const LEET_MAP: Record<string, string[]> = {
  a: ['4', '@', 'α'],
  e: ['3'],
  i: ['1', '!', 'l'],
  o: ['0'],
  s: ['5', '$'],
  t: ['7'],
  l: ['1', 'I'],
  g: ['9'],
  b: ['8'],
};

// ---------------------------------------------------------------------------
// Levenshtein distance (edit distance) — for typosquatting detection
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Normalise: remove separators, lowercase, strip impersonation affixes
function normalise(name: string): string {
  return name.toLowerCase().replace(/[_\-. ]/g, '');
}

// ---------------------------------------------------------------------------
// Typosquatting variants generator
// Used to check if a candidate was GENERATED from a brand term
// ---------------------------------------------------------------------------

function generateTyposquatVariants(term: string): Set<string> {
  const variants = new Set<string>();
  const t = term.toLowerCase();

  // Simple char swaps
  for (let i = 0; i < t.length - 1; i++) {
    const swapped = t.slice(0, i) + t[i + 1] + t[i] + t.slice(i + 2);
    variants.add(swapped);
  }

  // Single char deletion
  for (let i = 0; i < t.length; i++) {
    variants.add(t.slice(0, i) + t.slice(i + 1));
  }

  // Single char duplication
  for (let i = 0; i < t.length; i++) {
    variants.add(t.slice(0, i) + t[i] + t[i] + t.slice(i + 1));
  }

  // Leet speak substitutions (single character)
  for (let i = 0; i < t.length; i++) {
    const char = t[i];
    if (char && LEET_MAP[char]) {
      for (const sub of LEET_MAP[char]) {
        variants.add(t.slice(0, i) + sub + t.slice(i + 1));
      }
    }
  }

  return variants;
}

// ---------------------------------------------------------------------------
// Main analysis function — checks a single candidate against brand terms
// ---------------------------------------------------------------------------

export function analyseCandidateForBrand(
  candidate: string,
  brandTerms: string[],
  platform = 'unknown'
): BrandFinding | null {
  const candidateLower = candidate.toLowerCase();
  const candidateNorm = normalise(candidate);

  let bestMatch: { term: string; score: number; patterns: string[] } | null = null;

  for (const term of brandTerms) {
    const termLower = term.toLowerCase();
    const termNorm = normalise(term);
    const patterns: string[] = [];
    let similarityScore = 0;

    // 1. Exact match after normalisation — very high confidence impersonation
    if (candidateNorm === termNorm) {
      patterns.push('exact_normalised_match');
      similarityScore = 95;
    }

    // 2. Contains the brand term as a substring
    if (candidateNorm.includes(termNorm) && candidateNorm !== termNorm) {
      patterns.push('contains_brand_term');
      similarityScore = Math.max(similarityScore, 70);
    }

    // 3. Impersonation prefixes/suffixes
    for (const prefix of IMPERSONATION_PREFIXES) {
      if (
        candidateLower.startsWith(prefix + termLower) ||
        candidateLower.startsWith(prefix + '_' + termLower)
      ) {
        patterns.push(`impersonation_prefix:${prefix}`);
        similarityScore = Math.max(similarityScore, 80);
      }
    }
    for (const suffix of IMPERSONATION_SUFFIXES) {
      if (
        candidateLower.endsWith(termLower + suffix) ||
        candidateLower.endsWith(termLower + '_' + suffix)
      ) {
        patterns.push(`impersonation_suffix:${suffix}`);
        similarityScore = Math.max(similarityScore, 80);
      }
    }

    // 4. Low edit distance (typosquatting)
    const editDist = levenshtein(candidateNorm, termNorm);
    if (editDist === 1 && candidateNorm.length > 3) {
      patterns.push('edit_distance_1');
      similarityScore = Math.max(similarityScore, 85);
    } else if (editDist === 2 && candidateNorm.length > 5) {
      patterns.push('edit_distance_2');
      similarityScore = Math.max(similarityScore, 65);
    }

    // 5. Typosquat variant match
    const variants = generateTyposquatVariants(termNorm);
    if (variants.has(candidateNorm)) {
      patterns.push('typosquat_variant');
      similarityScore = Math.max(similarityScore, 80);
    }

    if (patterns.length > 0 && similarityScore > 0) {
      if (!bestMatch || similarityScore > bestMatch.score) {
        bestMatch = { term, score: similarityScore, patterns };
      }
    }
  }

  if (!bestMatch) return null;

  // Risk score: similarity + platform weight
  const platformWeight = platform === 'telegram' ? 1.1 : platform === 'discord' ? 1.05 : 1.0;
  const riskScore = Math.min(Math.round(bestMatch.score * platformWeight), 100);

  return {
    inputTerm: bestMatch.term,
    candidate,
    platform,
    similarityScore: bestMatch.score,
    impersonationPatterns: bestMatch.patterns,
    riskScore,
    reason: `"${candidate}" matches brand term "${bestMatch.term}" on ${platform} via: ${bestMatch.patterns.join(', ')}`,
  };
}

/**
 * Main entry point — check a list of candidates against brand terms.
 *
 * In production, `candidates` comes from:
 *   - Telegram public channel search API results
 *   - Discord server discovery scraping
 *   - Twitter/X username search
 *   - GitHub org/user search
 *   - User-submitted suspicious handles
 */
export function checkBrandImpersonation(
  brandTerms: string[],
  candidates: Array<{ name: string; platform?: string }>
): BrandMonitorResult {
  const findings: BrandFinding[] = [];

  for (const candidate of candidates) {
    const finding = analyseCandidateForBrand(
      candidate.name,
      brandTerms,
      candidate.platform ?? 'unknown'
    );
    if (finding) findings.push(finding);
  }

  // Sort by risk score descending
  findings.sort((a, b) => b.riskScore - a.riskScore);

  const totalScore = findings.length > 0 ? Math.max(...findings.map((f) => f.riskScore)) : 0;
  const highRiskCount = findings.filter((f) => f.riskScore >= 70).length;

  return { brandTerms, findings, totalScore, highRiskCount };
}

export function brandToFactors(result: BrandMonitorResult) {
  if (result.findings.length === 0) return [];
  return result.findings
    .filter((f) => f.riskScore >= 60)
    .map((f) => ({
      category: 'brand_impersonation' as const,
      source: 'brand_scan' as const,
      score: f.riskScore,
      summary: `Brand Impersonation on ${f.platform}`,
      detail: f.reason,
    }));
}
