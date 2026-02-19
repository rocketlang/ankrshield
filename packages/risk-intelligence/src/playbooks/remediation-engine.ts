/**
 * Remediation Playbook Engine
 *
 * Takes a RiskReport and generates a concrete, copy-pasteable remediation
 * playbook for every finding — no "contact sales", no vague advice.
 *
 * Action categories:
 *   dns_fix          — exact DNS records to add/update
 *   port_lockdown    — ufw + iptables commands per exposed port
 *   phishing_takedown — pre-filled abuse report templates
 *   breach_response  — per-breach credential reset steps
 *   secret_rotation  — GitHub token revocation + rotation steps
 *   cicd             — GitHub Actions YAML to add xShield to CI pipeline
 */

import type { RegisteredTyposquat } from '../detectors/dns-validator.js';
import type { GithubLeakHit } from '../detectors/github-dork.js';
import type { RiskReport, ExposedService, BreachRecord, DomainThreat } from '../types.js';

// ─── Output types ─────────────────────────────────────────────────────────────

export interface DNSRecord {
  type: string;
  name: string;
  value: string;
  ttl?: number;
}

export interface RemediationStep {
  order: number;
  instruction: string;
  /** Exact CLI command the user can copy-paste */
  command?: string;
  /** DNS record to add (for dns_fix actions) */
  record?: DNSRecord;
  /** External URL (takedown form, HIBP, GitHub revoke page, etc.) */
  url?: string;
  /** Code block (YAML, config) */
  code?: string;
}

export interface RemediationAction {
  id: string;
  category:
    | 'dns_fix'
    | 'port_lockdown'
    | 'phishing_takedown'
    | 'breach_response'
    | 'secret_rotation'
    | 'typosquat_monitoring'
    | 'cicd';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  steps: RemediationStep[];
  estimatedMinutes: number;
  /** True = xShield could auto-apply via Cloudflare API / ufw / etc. */
  automatable: boolean;
}

export interface RemediationPlaybook {
  domain: string;
  reportId: string;
  generatedAt: string;
  riskScore: number;
  riskLevel: string;
  totalActions: number;
  estimatedTotalMinutes: number;
  actions: RemediationAction[];
  /** Ready-to-paste GitHub Actions YAML for CI/CD integration */
  cicdYaml: string;
  /** One-sentence executive summary */
  summary: string;
}

// ─── DNS fix generators ───────────────────────────────────────────────────────

function spfPlaybook(domain: string, existing?: string): RemediationAction {
  const record = existing
    ? `${existing.replace(/-all$/, '')} include:spf.migadu.com -all`
    : `v=spf1 include:spf.migadu.com -all`;

  return {
    id: 'dns_spf',
    category: 'dns_fix',
    priority: 'high',
    title: 'Add / Fix SPF Record',
    description:
      'No SPF record found. Without SPF, anyone can send email claiming to be from your domain.',
    estimatedMinutes: 5,
    automatable: true,
    steps: [
      {
        order: 1,
        instruction: 'Log in to your DNS provider (Cloudflare, Route53, etc.)',
        url: 'https://dash.cloudflare.com',
      },
      {
        order: 2,
        instruction: `Add the following TXT record at the root (@) of ${domain}:`,
        record: { type: 'TXT', name: '@', value: record, ttl: 3600 },
      },
      {
        order: 3,
        instruction: 'Verify with:',
        command: `dig TXT ${domain} +short`,
      },
    ],
  };
}

function dmarcPlaybook(domain: string): RemediationAction {
  return {
    id: 'dns_dmarc',
    category: 'dns_fix',
    priority: 'high',
    title: 'Add DMARC Policy',
    description:
      'No DMARC record found. DMARC stops phishing emails that spoof your domain reaching inboxes.',
    estimatedMinutes: 5,
    automatable: true,
    steps: [
      {
        order: 1,
        instruction: `Add a TXT record at _dmarc.${domain}:`,
        record: {
          type: 'TXT',
          name: '_dmarc',
          value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain};`,
          ttl: 3600,
        },
      },
      {
        order: 2,
        instruction: 'After 30 days with no legitimate mail failures, tighten to p=reject:',
        record: {
          type: 'TXT',
          name: '_dmarc',
          value: `v=DMARC1; p=reject; rua=mailto:dmarc@${domain};`,
          ttl: 3600,
        },
      },
      {
        order: 3,
        instruction: 'Verify:',
        command: `dig TXT _dmarc.${domain} +short`,
      },
    ],
  };
}

function caaPlaybook(domain: string): RemediationAction {
  return {
    id: 'dns_caa',
    category: 'dns_fix',
    priority: 'medium',
    title: 'Add CAA Records',
    description:
      'No CAA record found. CAA restricts which Certificate Authorities can issue SSL certs for your domain — prevents unauthorized cert issuance.',
    estimatedMinutes: 5,
    automatable: true,
    steps: [
      {
        order: 1,
        instruction: 'Add the following CAA records:',
        record: { type: 'CAA', name: '@', value: '0 issue "letsencrypt.org"' },
      },
      {
        order: 2,
        instruction: 'Add wildcard restriction:',
        record: { type: 'CAA', name: '@', value: '0 issuewild "letsencrypt.org"' },
      },
      {
        order: 3,
        instruction: 'If using Cloudflare SSL, also add:',
        record: { type: 'CAA', name: '@', value: '0 issue "digicert.com"' },
      },
      {
        order: 4,
        instruction: 'Verify:',
        command: `dig CAA ${domain} +short`,
      },
    ],
  };
}

// ─── Port lockdown generators ─────────────────────────────────────────────────

const RISKY_PORTS: Record<
  number,
  { service: string; reason: string; severity: 'critical' | 'high' | 'medium' }
> = {
  22: {
    service: 'SSH',
    reason: 'Restrict to specific IP ranges — brute force target',
    severity: 'high',
  },
  23: { service: 'Telnet', reason: 'Unencrypted — disable immediately', severity: 'critical' },
  3306: {
    service: 'MySQL',
    reason: 'Database should not be internet-exposed',
    severity: 'critical',
  },
  5432: {
    service: 'PostgreSQL',
    reason: 'Database should not be internet-exposed',
    severity: 'critical',
  },
  6379: { service: 'Redis', reason: 'No auth by default — data exfil risk', severity: 'critical' },
  27017: { service: 'MongoDB', reason: 'Frequently exploited when exposed', severity: 'critical' },
  9200: {
    service: 'Elasticsearch',
    reason: 'Unauthenticated read/write when exposed',
    severity: 'critical',
  },
  8080: {
    service: 'HTTP Alt',
    reason: 'Dev/staging server exposed to internet',
    severity: 'medium',
  },
  8443: {
    service: 'HTTPS Alt',
    reason: 'Non-standard HTTPS port — may expose admin panels',
    severity: 'medium',
  },
  21: { service: 'FTP', reason: 'Unencrypted file transfer — replace with SFTP', severity: 'high' },
  25: { service: 'SMTP', reason: 'Open relay risk if misconfigured', severity: 'high' },
  3389: { service: 'RDP', reason: 'Remote Desktop — ransomware entry point', severity: 'critical' },
  5900: { service: 'VNC', reason: 'Remote desktop — restrict to VPN only', severity: 'critical' },
  11211: {
    service: 'Memcached',
    reason: 'DDoS amplification + data leak if exposed',
    severity: 'critical',
  },
};

function portLockdownPlaybook(service: ExposedService): RemediationAction {
  const known = RISKY_PORTS[service.port];
  const priority = known?.severity ?? 'medium';
  const reason = known?.reason ?? 'Unnecessary exposure increases attack surface';
  const cveNote = service.cves.length > 0 ? ` CVEs: ${service.cves.slice(0, 3).join(', ')}.` : '';

  return {
    id: `port_${service.port}`,
    category: 'port_lockdown',
    priority,
    title: `Lock Down Port ${service.port} (${service.product || known?.service || 'Unknown Service'})`,
    description:
      `${reason}.${cveNote} Product: ${service.product || 'unknown'} ${service.version || ''}`.trim(),
    estimatedMinutes: 10,
    automatable: false,
    steps: [
      {
        order: 1,
        instruction: `Block port ${service.port} with ufw:`,
        command: `sudo ufw deny ${service.port}/${service.protocol} && sudo ufw reload`,
      },
      {
        order: 2,
        instruction: 'Or with iptables:',
        command: `sudo iptables -A INPUT -p ${service.protocol} --dport ${service.port} -j DROP && sudo iptables-save > /etc/iptables/rules.v4`,
      },
      ...(service.port === 22
        ? [
            {
              order: 3,
              instruction: 'For SSH: restrict to your IP only instead of blocking entirely:',
              command: `sudo ufw allow from YOUR.IP.HERE to any port 22 && sudo ufw deny 22`,
            },
          ]
        : []),
      ...(service.cves.length > 0
        ? [
            {
              order: service.port === 22 ? 4 : 3,
              instruction: `Update the vulnerable software to patch ${service.cves[0]}:`,
              command: `sudo apt update && sudo apt upgrade ${service.product?.toLowerCase() || ''}`,
            },
          ]
        : []),
      {
        order: service.cves.length > 0 ? 4 : 3,
        instruction: 'Verify port is closed:',
        command: `nmap -p ${service.port} YOUR_SERVER_IP`,
      },
    ],
  };
}

// ─── Phishing takedown generators ────────────────────────────────────────────

function phishingTakedownPlaybook(threat: DomainThreat): RemediationAction {
  return {
    id: `phishing_${threat.domain.replace(/\./g, '_')}`,
    category: 'phishing_takedown',
    priority: 'critical',
    title: `Takedown Phishing Site: ${threat.domain}`,
    description: `Active phishing page detected at ${threat.url} (verdict: ${threat.verdict}). Users may be submitting credentials to this site.`,
    estimatedMinutes: 30,
    automatable: false,
    steps: [
      {
        order: 1,
        instruction: 'Report to Google Safe Browsing (blocks in Chrome/Firefox within hours):',
        url: `https://safebrowsing.google.com/safebrowsing/report_phish/?url=${encodeURIComponent(threat.url)}`,
      },
      {
        order: 2,
        instruction: 'Report to Cloudflare Abuse (if behind Cloudflare):',
        url: 'https://www.cloudflare.com/abuse/',
      },
      {
        order: 3,
        instruction: 'Report to the domain registrar via ICANN WHOIS lookup:',
        url: `https://lookup.icann.org/en/lookup?name=${threat.domain}`,
      },
      {
        order: 4,
        instruction: 'Submit to PhishTank to crowdsource blocking:',
        url: `https://www.phishtank.com/add_web_phish.php`,
      },
      {
        order: 5,
        instruction: 'Report to your national CERT (India: CERT-In):',
        url: 'https://www.cert-in.org.in/s2cwebApplication/indexController.jsp',
      },
      {
        order: 6,
        instruction: 'If you have screenshotUrl evidence, preserve it:',
        url: threat.screenshotUrl ?? undefined,
      },
    ].filter((s) => s.url || s.command),
  };
}

// ─── Breach response generators ───────────────────────────────────────────────

function breachResponsePlaybook(breach: BreachRecord, domain: string): RemediationAction {
  const hasPasswords = breach.dataClasses.some((d) => d.toLowerCase().includes('password'));
  const hasEmails = breach.dataClasses.some((d) => d.toLowerCase().includes('email'));

  return {
    id: `breach_${breach.name.toLowerCase().replace(/\s/g, '_')}`,
    category: 'breach_response',
    priority: hasPasswords ? 'critical' : 'high',
    title: `Respond to ${breach.name} Breach (${breach.breachDate})`,
    description: `${breach.pwnCount.toLocaleString()} accounts exposed. Data: ${breach.dataClasses.join(', ')}.`,
    estimatedMinutes: 60,
    automatable: false,
    steps: [
      ...(hasPasswords
        ? [
            {
              order: 1,
              instruction: `Force password reset for all @${domain} accounts immediately`,
              command: `# If using Migadu/GSuite, trigger bulk password reset from admin panel`,
            },
            {
              order: 2,
              instruction: 'Invalidate all active sessions / JWTs',
              command: `# Rotate JWT_SECRET env var and redeploy to invalidate all tokens`,
            },
          ]
        : []),
      {
        order: hasPasswords ? 3 : 1,
        instruction: 'Enable MFA for all accounts if not already enforced',
        url: 'https://migadu.com/dashboard/',
      },
      ...(hasEmails
        ? [
            {
              order: hasPasswords ? 4 : 2,
              instruction: `Notify affected users via email explaining the ${breach.name} breach`,
              command: `# Draft breach notification email per your jurisdiction's requirements`,
            },
          ]
        : []),
      {
        order: hasPasswords ? 5 : 3,
        instruction: 'Check if any service accounts use the same credentials and rotate those too',
        url: `https://haveibeenpwned.com/DomainSearch`,
      },
      {
        order: hasPasswords ? 6 : 4,
        instruction: 'Set up monitoring for credential stuffing attacks:',
        command: `# Add fail2ban or rate limiting on login endpoints`,
      },
    ],
  };
}

// ─── GitHub secret rotation generators ───────────────────────────────────────

function secretRotationPlaybook(leak: GithubLeakHit): RemediationAction {
  const tokenType = leak.secretType ?? 'API key';
  const isGitHubToken = tokenType.toLowerCase().includes('github');

  return {
    id: `secret_${leak.repoFullName?.replace(/\//g, '_') ?? 'unknown'}`,
    category: 'secret_rotation',
    priority: 'critical',
    title: `Rotate Exposed ${tokenType} in ${leak.repoFullName ?? 'GitHub repo'}`,
    description: `A ${tokenType} was found in public GitHub code. Assume it is already compromised — rotate immediately.`,
    estimatedMinutes: 15,
    automatable: false,
    steps: [
      {
        order: 1,
        instruction: 'View the exposed secret:',
        url: leak.htmlUrl,
      },
      ...(isGitHubToken
        ? [
            {
              order: 2,
              instruction: 'Revoke the exposed GitHub token immediately:',
              url: 'https://github.com/settings/tokens',
            },
          ]
        : [
            {
              order: 2,
              instruction: `Revoke the exposed ${tokenType} in its service dashboard`,
            },
          ]),
      {
        order: 3,
        instruction: 'Generate a new secret and update all services that use it',
      },
      {
        order: 4,
        instruction: 'Remove the secret from git history (BFG Repo Cleaner):',
        command: `bfg --delete-files .env && git push --force`,
      },
      {
        order: 5,
        instruction: 'Add secret scanning to prevent future leaks:',
        code: `# .github/workflows/secret-scan.yml\non: [push, pull_request]\njobs:\n  scan:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: gitleaks/gitleaks-action@v2`,
      },
      {
        order: 6,
        instruction: 'Store secrets in environment variables or a vault — never in code:',
        command: `# Use GitHub Secrets: Settings → Secrets → Actions`,
        url: 'https://docs.github.com/en/actions/security-guides/encrypted-secrets',
      },
    ],
  };
}

// ─── Typosquat monitoring playbook ────────────────────────────────────────────

function typosquatPlaybook(squats: RegisteredTyposquat[], domain: string): RemediationAction {
  const impostors = squats.filter((s) => s.isImpostor);
  return {
    id: 'typosquat_monitor',
    category: 'typosquat_monitoring',
    priority: impostors.length > 0 ? 'high' : 'medium',
    title: `Monitor ${squats.length} Lookalike Domain(s) for ${domain}`,
    description: `${squats.length} typosquat variants are registered. ${impostors.length} point to different IPs (potential impostor sites).`,
    estimatedMinutes: 20,
    automatable: false,
    steps: [
      {
        order: 1,
        instruction: `Investigate impostor domains (different IPs):`,
        command:
          squats
            .filter((s) => s.isImpostor)
            .slice(0, 5)
            .map((s) => `dig A ${s.domain} +short  # resolves to ${s.ips[0]}`)
            .join('\n') || '# None detected',
      },
      {
        order: 2,
        instruction: 'Report active phishing impostors to Google Safe Browsing:',
        url: 'https://safebrowsing.google.com/safebrowsing/report_phish/',
      },
      {
        order: 3,
        instruction: 'Register the top 3 most likely typosquats defensively (before attackers do):',
        command:
          [
            ...squats.filter((s) => s.variantType === 'omission').slice(0, 2),
            ...squats.filter((s) => s.variantType === 'substitution').slice(0, 1),
          ]
            .map((s) => `# Register: ${s.domain}`)
            .join('\n') || `# Register common misspellings of ${domain}`,
      },
      {
        order: 4,
        instruction:
          'Set up ongoing monitoring — xShield Domain Watch already active for this domain',
      },
    ],
  };
}

// ─── CI/CD YAML generator ─────────────────────────────────────────────────────

function generateCicdYaml(domain: string): string {
  return `# xShield Security Scan — add to .github/workflows/xshield.yml
name: xShield Domain Risk Scan

on:
  schedule:
    - cron: '0 8 * * 1'   # Every Monday at 8am UTC
  workflow_dispatch:       # Also trigger manually

jobs:
  risk-scan:
    name: Domain Risk Assessment
    runs-on: ubuntu-latest
    steps:
      - name: Scan ${domain}
        run: |
          RESULT=$(curl -sf "https://xshieldai.com/api/risk/score?domain=${domain}")
          SCORE=$(echo $RESULT | python3 -c "import sys,json; print(json.load(sys.stdin)['riskScore'])")
          LEVEL=$(echo $RESULT | python3 -c "import sys,json; print(json.load(sys.stdin)['riskLevel'])")
          echo "Risk Score: $SCORE/100 ($LEVEL)"
          if [ "$SCORE" -ge 60 ]; then
            echo "::error::Risk score $SCORE exceeds threshold (60). Review at https://xshieldai.com"
            exit 1
          fi
      - name: Full Report (on failure)
        if: failure()
        run: |
          curl -s "https://xshieldai.com/api/risk/report?domain=${domain}" | python3 -m json.tool
`;
}

// ─── Main playbook builder ────────────────────────────────────────────────────

export function buildRemediationPlaybook(report: RiskReport): RemediationPlaybook {
  const actions: RemediationAction[] = [];
  const dns = report.dnsSecurityReport;

  // DNS fixes
  if (dns) {
    if (!dns.spf?.exists) actions.push(spfPlaybook(report.domain, dns.spf?.record ?? undefined));
    if (!dns.dmarc?.exists) actions.push(dmarcPlaybook(report.domain));
    if (!dns.caa?.exists) actions.push(caaPlaybook(report.domain));
  }

  // Port lockdown — only risky ports
  for (const svc of report.exposedServices ?? []) {
    if (RISKY_PORTS[svc.port] || svc.cves.length > 0) {
      actions.push(portLockdownPlaybook(svc));
    }
  }

  // Phishing takedowns
  for (const threat of report.domainThreats ?? []) {
    if (threat.verdict === 'malicious' || threat.verdict === 'suspicious') {
      actions.push(phishingTakedownPlaybook(threat));
    }
  }

  // Breach responses
  for (const breach of report.breaches ?? []) {
    actions.push(breachResponsePlaybook(breach, report.domain));
  }

  // GitHub secret rotation
  for (const leak of report.githubLeaks ?? []) {
    actions.push(secretRotationPlaybook(leak));
  }

  // Typosquat monitoring
  if ((report.registeredTyposquats ?? []).length > 0) {
    actions.push(typosquatPlaybook(report.registeredTyposquats, report.domain));
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  const estimatedTotalMinutes = actions.reduce((sum, a) => sum + a.estimatedMinutes, 0);
  const criticalCount = actions.filter((a) => a.priority === 'critical').length;
  const highCount = actions.filter((a) => a.priority === 'high').length;

  const summary =
    actions.length === 0
      ? `${report.domain} has no actionable findings — no remediation required.`
      : `${actions.length} action(s) needed for ${report.domain}: ${criticalCount} critical, ${highCount} high. Estimated fix time: ${estimatedTotalMinutes} minutes.`;

  return {
    domain: report.domain,
    reportId: report.id,
    generatedAt: new Date().toISOString(),
    riskScore: report.riskScore,
    riskLevel: report.riskLevel,
    totalActions: actions.length,
    estimatedTotalMinutes,
    actions,
    cicdYaml: generateCicdYaml(report.domain),
    summary,
  };
}

export type { RemediationPlaybook, RemediationAction, RemediationStep, DNSRecord };
