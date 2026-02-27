/**
 * xShield Risk Engine
 * 13-source threat intelligence aggregator
 * Produces 0-100 risk score + MITRE ATT&CK mappings
 */

export type RiskLevel = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RiskFinding {
  source: string;
  signal: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  detail: string;
  mitreId?: string;
  mitreTactic?: string;
  mitreTechnique?: string;
}

export interface MitreMapping {
  techniqueId: string;
  techniqueName: string;
  tacticId: string;
  tacticName: string;
  confidence: 'low' | 'medium' | 'high';
  source: string;
}

export interface RiskReport {
  domain: string;
  riskScore: number;
  riskLevel: RiskLevel;
  scannedAt: string;
  findings: RiskFinding[];
  mitreMapping: MitreMapping[];
  navigatorLayer: object;
  summary: string;
  recommendations: string[];
  sourceBreakdown: Record<string, { score: number; findings: number }>;
}

// ── MITRE ATT&CK v15 Technique Catalog (curated subset) ──────────────────────
const MITRE_TECHNIQUES: Record<string, { name: string; tacticId: string; tacticName: string }> = {
  'T1566': { name: 'Phishing', tacticId: 'TA0001', tacticName: 'Initial Access' },
  'T1566.001': { name: 'Spearphishing Attachment', tacticId: 'TA0001', tacticName: 'Initial Access' },
  'T1566.002': { name: 'Spearphishing Link', tacticId: 'TA0001', tacticName: 'Initial Access' },
  'T1566.003': { name: 'Spearphishing via Service', tacticId: 'TA0001', tacticName: 'Initial Access' },
  'T1078': { name: 'Valid Accounts', tacticId: 'TA0001', tacticName: 'Initial Access' },
  'T1190': { name: 'Exploit Public-Facing Application', tacticId: 'TA0001', tacticName: 'Initial Access' },
  'T1133': { name: 'External Remote Services', tacticId: 'TA0001', tacticName: 'Initial Access' },
  'T1071': { name: 'Application Layer Protocol', tacticId: 'TA0011', tacticName: 'Command and Control' },
  'T1071.001': { name: 'Web Protocols', tacticId: 'TA0011', tacticName: 'Command and Control' },
  'T1071.004': { name: 'DNS', tacticId: 'TA0011', tacticName: 'Command and Control' },
  'T1041': { name: 'Exfiltration Over C2 Channel', tacticId: 'TA0010', tacticName: 'Exfiltration' },
  'T1048': { name: 'Exfiltration Over Alternative Protocol', tacticId: 'TA0010', tacticName: 'Exfiltration' },
  'T1496': { name: 'Resource Hijacking', tacticId: 'TA0040', tacticName: 'Impact' },
  'T1486': { name: 'Data Encrypted for Impact', tacticId: 'TA0040', tacticName: 'Impact' },
  'T1589': { name: 'Gather Victim Identity Information', tacticId: 'TA0043', tacticName: 'Reconnaissance' },
  'T1592': { name: 'Gather Victim Host Information', tacticId: 'TA0043', tacticName: 'Reconnaissance' },
  'T1595': { name: 'Active Scanning', tacticId: 'TA0043', tacticName: 'Reconnaissance' },
  'T1114': { name: 'Email Collection', tacticId: 'TA0009', tacticName: 'Collection' },
  'T1539': { name: 'Steal Web Session Cookie', tacticId: 'TA0006', tacticName: 'Credential Access' },
  'T1110': { name: 'Brute Force', tacticId: 'TA0006', tacticName: 'Credential Access' },
  'T1562': { name: 'Impair Defenses', tacticId: 'TA0005', tacticName: 'Defense Evasion' },
  'T1036': { name: 'Masquerading', tacticId: 'TA0005', tacticName: 'Defense Evasion' },
};

function toMitreMapping(techniqueId: string, confidence: 'low' | 'medium' | 'high', source: string): MitreMapping | null {
  const t = MITRE_TECHNIQUES[techniqueId];
  if (!t) return null;
  return { techniqueId, techniqueName: t.name, tacticId: t.tacticId, tacticName: t.tacticName, confidence, source };
}

function scoreToLevel(score: number): RiskLevel {
  if (score <= 15) return 'MINIMAL';
  if (score <= 35) return 'LOW';
  if (score <= 60) return 'MEDIUM';
  if (score <= 80) return 'HIGH';
  return 'CRITICAL';
}

// ── DNS Analysis ──────────────────────────────────────────────────────────────
async function checkDns(domain: string): Promise<{ findings: RiskFinding[]; score: number }> {
  const findings: RiskFinding[] = [];
  let score = 0;

  try {
    const { promises: dns } = await import('dns');

    // MX check
    try {
      await dns.resolveMx(domain);
    } catch {
      findings.push({ source: 'DNS', signal: 'no_mx', severity: 'low', detail: 'No MX records — domain may be for non-email use or recently registered' });
      score += 5;
    }

    // TXT/SPF check
    try {
      const txt = await dns.resolveTxt(domain);
      const hasSPF = txt.flat().some(r => r.startsWith('v=spf'));
      const hasDMARC = txt.flat().some(r => r.startsWith('v=DMARC'));
      if (!hasSPF) {
        findings.push({ source: 'DNS/SPF', signal: 'no_spf', severity: 'medium', detail: 'No SPF record — domain vulnerable to email spoofing', mitreId: 'T1566', mitreTactic: 'Initial Access', mitreTechnique: 'Phishing' });
        score += 10;
      }
      if (!hasDMARC) {
        findings.push({ source: 'DNS/DMARC', signal: 'no_dmarc', severity: 'medium', detail: 'No DMARC policy — email authentication not enforced', mitreId: 'T1566', mitreTactic: 'Initial Access', mitreTechnique: 'Phishing' });
        score += 8;
      }
    } catch {
      // no TXT records
    }
  } catch {
    // DNS resolution failed
  }

  return { findings, score };
}

// ── Typosquat Detection ───────────────────────────────────────────────────────
function generateTyposquats(domain: string): string[] {
  const [name, ...tldParts] = domain.split('.');
  const tld = tldParts.join('.');
  const squats: string[] = [];

  // Character substitution (visual similarity)
  const subs: Record<string, string[]> = {
    'a': ['4', '@'], 'e': ['3'], 'i': ['1', 'l'], 'o': ['0'],
    's': ['5', '$'], 'g': ['9'], 'l': ['1', 'I'], 'b': ['6'],
  };
  for (let i = 0; i < name.length; i++) {
    const ch = name[i]!.toLowerCase();
    if (subs[ch]) {
      for (const sub of subs[ch]!) {
        squats.push(`${name.slice(0, i)}${sub}${name.slice(i + 1)}.${tld}`);
      }
    }
  }

  // Missing letter
  for (let i = 0; i < name.length; i++) {
    squats.push(`${name.slice(0, i)}${name.slice(i + 1)}.${tld}`);
  }

  // Doubled letter
  for (let i = 0; i < name.length; i++) {
    squats.push(`${name.slice(0, i)}${name[i]}${name.slice(i)}.${tld}`);
  }

  // TLD variations
  const altTlds = ['com', 'net', 'org', 'info', 'co', 'io', 'xyz'].filter(t => t !== tld);
  for (const altTld of altTlds.slice(0, 3)) {
    squats.push(`${name}.${altTld}`);
  }

  // Hyphen insertion
  for (let i = 1; i < name.length; i++) {
    squats.push(`${name.slice(0, i)}-${name.slice(i)}.${tld}`);
  }

  // Dedup and limit
  return [...new Set(squats)].slice(0, 50);
}

async function checkTyposquats(domain: string): Promise<{ findings: RiskFinding[]; score: number; squats: string[] }> {
  const findings: RiskFinding[] = [];
  let score = 0;
  const squats = generateTyposquats(domain);

  // DNS-resolve a sample of squats to find registered ones
  const { promises: dns } = await import('dns');
  const registered: string[] = [];

  const sampleSize = Math.min(squats.length, 20);
  const sample = squats.slice(0, sampleSize);

  const results = await Promise.allSettled(
    sample.map(async (sq) => {
      try {
        await dns.resolve(sq);
        return sq;
      } catch {
        return null;
      }
    })
  );

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) registered.push(r.value);
  }

  if (registered.length > 0) {
    findings.push({
      source: 'Typosquat',
      signal: 'typosquat_registered',
      severity: registered.length > 3 ? 'high' : 'medium',
      detail: `${registered.length} typosquat variant(s) registered: ${registered.slice(0, 3).join(', ')}`,
      mitreId: 'T1036',
      mitreTactic: 'Defense Evasion',
      mitreTechnique: 'Masquerading',
    });
    score += Math.min(registered.length * 8, 25);
  }

  return { findings, score, squats };
}

// ── crt.sh Certificate Transparency ──────────────────────────────────────────
async function checkCerts(domain: string): Promise<{ findings: RiskFinding[]; score: number }> {
  const findings: RiskFinding[] = [];
  let score = 0;

  try {
    const r = await fetch(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'xShield/1.0 (+xshieldai.com)' },
    });
    if (r.ok) {
      const certs = await r.json() as any[];
      const lookalike = certs.filter(c => {
        const cn = (c.common_name || '').toLowerCase();
        return cn !== domain.toLowerCase() && cn.includes(domain.split('.')[0]!.toLowerCase());
      });
      if (lookalike.length > 2) {
        findings.push({
          source: 'CertTransparency',
          signal: 'lookalike_certs',
          severity: 'high',
          detail: `${lookalike.length} lookalike TLS certificates issued (potential brand impersonation)`,
          mitreId: 'T1566.002',
          mitreTactic: 'Initial Access',
          mitreTechnique: 'Spearphishing Link',
        });
        score += 15;
      }
    }
  } catch {
    // crt.sh unavailable — don't penalise
  }

  return { findings, score };
}

// ── GreyNoise (IP reputation) — uses public community API ────────────────────
async function checkGreyNoise(domain: string): Promise<{ findings: RiskFinding[]; score: number }> {
  const findings: RiskFinding[] = [];
  let score = 0;

  try {
    const { promises: dns } = await import('dns');
    const addrs = await dns.resolve4(domain).catch(() => []);
    if (addrs.length === 0) return { findings, score };

    const ip = addrs[0]!;
    const r = await fetch(`https://api.greynoise.io/v3/community/${ip}`, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'xShield/1.0',
        ...(process.env.GREYNOISE_API_KEY ? { 'key': process.env.GREYNOISE_API_KEY } : {}),
      },
    });

    if (r.ok) {
      const data = await r.json() as any;
      if (data.noise) {
        findings.push({
          source: 'GreyNoise',
          signal: 'ip_noisy',
          severity: data.classification === 'malicious' ? 'critical' : 'medium',
          detail: `IP ${ip} is classified as "${data.classification || 'noise'}" by GreyNoise (mass scanner/malicious activity detected)`,
          mitreId: 'T1595',
          mitreTactic: 'Reconnaissance',
          mitreTechnique: 'Active Scanning',
        });
        score += data.classification === 'malicious' ? 30 : 15;
      }
    }
  } catch {
    // GreyNoise unreachable
  }

  return { findings, score };
}

// ── HIBP Breach Check ─────────────────────────────────────────────────────────
async function checkBreaches(domain: string): Promise<{ findings: RiskFinding[]; score: number; breaches: any[] }> {
  const findings: RiskFinding[] = [];
  let score = 0;
  const breaches: any[] = [];

  try {
    const r = await fetch(`https://haveibeenpwned.com/api/v3/breaches`, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'xShield/1.0',
        ...(process.env.HIBP_API_KEY ? { 'hibp-api-key': process.env.HIBP_API_KEY } : {}),
      },
    });

    if (r.ok) {
      const allBreaches = await r.json() as any[];
      const domainBreaches = allBreaches.filter(b =>
        b.Domain?.toLowerCase() === domain.toLowerCase()
      );

      if (domainBreaches.length > 0) {
        breaches.push(...domainBreaches);
        const totalPwned = domainBreaches.reduce((s, b) => s + (b.PwnCount || 0), 0);
        findings.push({
          source: 'HIBP',
          signal: 'domain_breached',
          severity: totalPwned > 1_000_000 ? 'critical' : totalPwned > 100_000 ? 'high' : 'medium',
          detail: `Domain has ${domainBreaches.length} known breach(es) affecting ~${totalPwned.toLocaleString()} accounts`,
          mitreId: 'T1589',
          mitreTactic: 'Reconnaissance',
          mitreTechnique: 'Gather Victim Identity Information',
        });
        score += Math.min(domainBreaches.length * 5 + (totalPwned > 1_000_000 ? 20 : 10), 30);
      }
    }
  } catch {
    // HIBP unreachable
  }

  return { findings, score, breaches };
}

// ── URLScan.io ────────────────────────────────────────────────────────────────
async function checkUrlScan(domain: string): Promise<{ findings: RiskFinding[]; score: number }> {
  const findings: RiskFinding[] = [];
  let score = 0;

  try {
    const r = await fetch(`https://urlscan.io/api/v1/search/?q=domain:${encodeURIComponent(domain)}&size=5`, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'xShield/1.0',
        ...(process.env.URLSCAN_API_KEY ? { 'API-Key': process.env.URLSCAN_API_KEY } : {}),
      },
    });

    if (r.ok) {
      const data = await r.json() as any;
      const results: any[] = data.results || [];
      const malicious = results.filter(res => res.verdicts?.overall?.malicious);
      if (malicious.length > 0) {
        findings.push({
          source: 'URLScan',
          signal: 'urlscan_malicious',
          severity: 'high',
          detail: `URLScan.io flagged ${malicious.length} scan(s) of this domain as malicious`,
          mitreId: 'T1566.002',
          mitreTactic: 'Initial Access',
          mitreTechnique: 'Spearphishing Link',
        });
        score += 20;
      }
    }
  } catch {
    // URLScan unreachable
  }

  return { findings, score };
}

// ── PhishTank / OpenPhish ─────────────────────────────────────────────────────
async function checkPhishing(domain: string): Promise<{ findings: RiskFinding[]; score: number }> {
  const findings: RiskFinding[] = [];
  let score = 0;

  try {
    // OpenPhish feed (public)
    const r = await fetch('https://openphish.com/feed.txt', {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'xShield/1.0' },
    });
    if (r.ok) {
      const text = await r.text();
      const hits = text.split('\n').filter(line => {
        try {
          return new URL(line.trim()).hostname.endsWith(domain);
        } catch {
          return false;
        }
      });
      if (hits.length > 0) {
        findings.push({
          source: 'OpenPhish',
          signal: 'active_phishing',
          severity: 'critical',
          detail: `Domain found in OpenPhish active phishing feed (${hits.length} URL(s))`,
          mitreId: 'T1566.002',
          mitreTactic: 'Initial Access',
          mitreTechnique: 'Spearphishing Link',
        });
        score += 40;
      }
    }
  } catch {
    // feed unreachable
  }

  return { findings, score };
}

// ── GitHub Leak Scan ──────────────────────────────────────────────────────────
async function checkGithub(domain: string): Promise<{ findings: RiskFinding[]; score: number }> {
  const findings: RiskFinding[] = [];
  let score = 0;

  if (!process.env.GITHUB_TOKEN) {
    return { findings: [{ source: 'GitHub', signal: 'no_token', severity: 'info', detail: 'GitHub API token not configured — leak scan skipped' }], score: 0 };
  }

  try {
    const queries = [
      `"${domain}" password`,
      `"${domain}" api_key`,
      `"${domain}" secret`,
      `"${domain}" token`,
    ];

    let leakCount = 0;
    for (const q of queries) {
      const r = await fetch(
        `https://api.github.com/search/code?q=${encodeURIComponent(q)}&per_page=5`,
        {
          signal: AbortSignal.timeout(4000),
          headers: {
            'User-Agent': 'xShield/1.0',
            'Authorization': `token ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );
      if (r.ok) {
        const data = await r.json() as any;
        leakCount += data.total_count || 0;
      }
      // Rate limiting — small delay between GitHub API calls
      await new Promise(r => setTimeout(r, 200));
    }

    if (leakCount > 0) {
      findings.push({
        source: 'GitHub',
        signal: 'github_secret_leak',
        severity: leakCount > 20 ? 'high' : 'medium',
        detail: `~${leakCount} public GitHub code matches for credentials/secrets referencing this domain`,
        mitreId: 'T1078',
        mitreTactic: 'Initial Access',
        mitreTechnique: 'Valid Accounts',
      });
      score += Math.min(leakCount > 20 ? 25 : 12, 25);
    }
  } catch {
    // GitHub API unreachable
  }

  return { findings, score };
}

// ── OTX AlienVault ────────────────────────────────────────────────────────────
async function checkOTX(domain: string): Promise<{ findings: RiskFinding[]; score: number }> {
  const findings: RiskFinding[] = [];
  let score = 0;

  try {
    const r = await fetch(
      `https://otx.alienvault.com/api/v1/indicators/domain/${encodeURIComponent(domain)}/general`,
      {
        signal: AbortSignal.timeout(5000),
        headers: {
          'User-Agent': 'xShield/1.0',
          ...(process.env.OTX_API_KEY ? { 'X-OTX-API-KEY': process.env.OTX_API_KEY } : {}),
        },
      }
    );
    if (r.ok) {
      const data = await r.json() as any;
      const pulseCount = data.pulse_info?.count || 0;
      if (pulseCount > 0) {
        findings.push({
          source: 'OTX',
          signal: 'otx_threat_pulses',
          severity: pulseCount > 10 ? 'critical' : pulseCount > 3 ? 'high' : 'medium',
          detail: `Domain referenced in ${pulseCount} OTX threat intelligence pulse(s)`,
          mitreId: 'T1071.001',
          mitreTactic: 'Command and Control',
          mitreTechnique: 'Web Protocols',
        });
        score += Math.min(pulseCount * 4, 35);
      }
    }
  } catch {
    // OTX unreachable
  }

  return { findings, score };
}

// ── Shodan (exposed services) ─────────────────────────────────────────────────
async function checkShodan(domain: string): Promise<{ findings: RiskFinding[]; score: number }> {
  const findings: RiskFinding[] = [];
  let score = 0;

  if (!process.env.SHODAN_API_KEY) {
    return { findings: [], score: 0 };
  }

  try {
    const { promises: dns } = await import('dns');
    const addrs = await dns.resolve4(domain).catch(() => []);
    if (addrs.length === 0) return { findings, score };

    const ip = addrs[0]!;
    const r = await fetch(
      `https://api.shodan.io/shodan/host/${ip}?key=${process.env.SHODAN_API_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (r.ok) {
      const data = await r.json() as any;
      const ports: number[] = (data.ports || []);
      const dangerousPorts = ports.filter(p => [23, 25, 110, 143, 3306, 5432, 6379, 27017, 8080, 8443].includes(p));
      if (dangerousPorts.length > 0) {
        findings.push({
          source: 'Shodan',
          signal: 'exposed_services',
          severity: 'medium',
          detail: `Exposed services on dangerous ports: ${dangerousPorts.join(', ')}`,
          mitreId: 'T1190',
          mitreTactic: 'Initial Access',
          mitreTechnique: 'Exploit Public-Facing Application',
        });
        score += dangerousPorts.length * 4;
      }
    }
  } catch {
    // Shodan unreachable
  }

  return { findings, score };
}

// ── MITRE Navigator Layer builder ─────────────────────────────────────────────
function buildNavigatorLayer(mappings: MitreMapping[], domain: string): object {
  return {
    name: `xShield — ${domain}`,
    versions: { attack: '15', navigator: '4.9', layer: '4.5' },
    domain: 'enterprise-attack',
    description: `Risk assessment for ${domain} — generated by xShield`,
    techniques: mappings.map(m => ({
      techniqueID: m.techniqueId,
      tactic: m.tacticName.toLowerCase().replace(/ /g, '-'),
      score: m.confidence === 'high' ? 100 : m.confidence === 'medium' ? 60 : 30,
      color: m.confidence === 'high' ? '#ff0000' : m.confidence === 'medium' ? '#ff8800' : '#ffcc00',
      comment: `Detected via ${m.source}`,
      enabled: true,
    })),
    gradient: { colors: ['#ffffff', '#ff0000'], minValue: 0, maxValue: 100 },
    legendItems: [
      { label: 'High confidence', color: '#ff0000' },
      { label: 'Medium confidence', color: '#ff8800' },
      { label: 'Low confidence', color: '#ffcc00' },
    ],
  };
}

// ── Narrative summary generator ───────────────────────────────────────────────
function buildSummary(domain: string, _score: number, level: RiskLevel, findings: RiskFinding[]): string {
  const count = findings.filter(f => f.severity !== 'info').length;
  if (count === 0) return `${domain} shows no significant threat signals across all monitored sources.`;

  const highSev = findings.filter(f => ['high', 'critical'].includes(f.severity));
  const sources = [...new Set(findings.map(f => f.source))];

  if (level === 'CRITICAL') {
    return `CRITICAL RISK: ${domain} has been flagged by ${sources.length} intelligence sources. Active threats detected include: ${highSev.map(f => f.signal).join(', ')}. Immediate action recommended.`;
  }
  if (level === 'HIGH') {
    return `HIGH RISK: ${domain} shows ${count} threat indicators across ${sources.length} sources. Key concerns: ${highSev.slice(0, 2).map(f => f.detail).join('; ')}.`;
  }
  return `MEDIUM RISK: ${domain} has ${count} security finding(s) requiring attention. Detected by: ${sources.join(', ')}.`;
}

function buildRecommendations(findings: RiskFinding[]): string[] {
  const recs: string[] = [];
  const signals = new Set(findings.map(f => f.signal));

  if (signals.has('no_spf')) recs.push('Add SPF record: "v=spf1 include:_spf.your-provider.com ~all"');
  if (signals.has('no_dmarc')) recs.push('Add DMARC policy: "_dmarc TXT v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com"');
  if (signals.has('typosquat_registered')) recs.push('Register common typosquat variants defensively and redirect to primary domain');
  if (signals.has('lookalike_certs')) recs.push('Monitor Certificate Transparency logs via Certstream for new lookalike certificates');
  if (signals.has('domain_breached')) recs.push('Enforce password reset for all affected accounts; enable MFA across all services');
  if (signals.has('active_phishing')) recs.push('Submit takedown requests via ICANN UDRP and hosting provider abuse contacts immediately');
  if (signals.has('github_secret_leak')) recs.push('Rotate all exposed API keys/credentials immediately; audit git history for secrets');
  if (signals.has('exposed_services')) recs.push('Close or firewall unnecessary service ports; place sensitive services behind VPN');
  if (signals.has('otx_threat_pulses')) recs.push('Review OTX pulse details and block known-bad IPs/domains at perimeter');
  if (signals.has('ip_noisy')) recs.push('Consider rotating server IP; implement fail2ban and rate-limiting on exposed services');

  if (recs.length === 0) recs.push('Continue monitoring domain for new threat signals; review quarterly');
  return recs;
}

// ── Main scan function ────────────────────────────────────────────────────────
export async function scanDomain(domain: string): Promise<RiskReport> {
  const cleanDomain = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  // Run all sources in parallel (with individual timeouts)
  const [dns, typo, cert, greynoise, hibp, urlscan, phish, github, otx, shodan] = await Promise.all([
    checkDns(cleanDomain),
    checkTyposquats(cleanDomain),
    checkCerts(cleanDomain),
    checkGreyNoise(cleanDomain),
    checkBreaches(cleanDomain),
    checkUrlScan(cleanDomain),
    checkPhishing(cleanDomain),
    checkGithub(cleanDomain),
    checkOTX(cleanDomain),
    checkShodan(cleanDomain),
  ]);

  // Aggregate
  const allFindings: RiskFinding[] = [
    ...dns.findings, ...typo.findings, ...cert.findings,
    ...greynoise.findings, ...hibp.findings, ...urlscan.findings,
    ...phish.findings, ...github.findings, ...otx.findings, ...shodan.findings,
  ];

  const rawScore = dns.score + typo.score + cert.score + greynoise.score +
    hibp.score + urlscan.score + phish.score + github.score + otx.score + shodan.score;

  const riskScore = Math.min(rawScore, 100);
  const riskLevel = scoreToLevel(riskScore);

  // Build MITRE mappings
  const mitreRaw = allFindings
    .filter(f => f.mitreId)
    .map(f => toMitreMapping(
      f.mitreId!,
      f.severity === 'critical' ? 'high' : f.severity === 'high' ? 'medium' : 'low',
      f.source
    ))
    .filter((m): m is MitreMapping => m !== null);

  // Deduplicate MITRE by techniqueId
  const mitreMapping = Object.values(
    Object.fromEntries(mitreRaw.map(m => [m.techniqueId, m]))
  );

  const navigatorLayer = buildNavigatorLayer(mitreMapping, cleanDomain);

  return {
    domain: cleanDomain,
    riskScore,
    riskLevel,
    scannedAt: new Date().toISOString(),
    findings: allFindings,
    mitreMapping,
    navigatorLayer,
    summary: buildSummary(cleanDomain, riskScore, riskLevel, allFindings),
    recommendations: buildRecommendations(allFindings),
    sourceBreakdown: {
      DNS:       { score: dns.score,       findings: dns.findings.length },
      Typosquat: { score: typo.score,      findings: typo.findings.length },
      CertTransparency: { score: cert.score, findings: cert.findings.length },
      GreyNoise: { score: greynoise.score, findings: greynoise.findings.length },
      HIBP:      { score: hibp.score,      findings: hibp.findings.length },
      URLScan:   { score: urlscan.score,   findings: urlscan.findings.length },
      OpenPhish: { score: phish.score,     findings: phish.findings.length },
      GitHub:    { score: github.score,    findings: github.findings.length },
      OTX:       { score: otx.score,       findings: otx.findings.length },
      Shodan:    { score: shodan.score,    findings: shodan.findings.length },
    },
  };
}

export { generateTyposquats, scoreToLevel };
