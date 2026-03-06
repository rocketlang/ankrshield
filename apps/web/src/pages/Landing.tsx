/**
 * xShield AI — Enterprise Landing Page
 * Audience: CTOs, CISOs, DevSecOps, SOC teams, SMBs
 * Tone: authoritative, precise, credibility-first
 */

import { Link } from 'react-router-dom';

const BG = '#060a10';
const BG_ALT = '#080c14';
const BG_CARD = '#0d1117';
const BORDER = '#1e2a3a';
const VIOLET = '#7c3aed';
const VIOLET_L = '#a78bfa';
const GREEN = '#22c55e';
const AMBER = '#f59e0b';
const RED = '#ef4444';
const TEXT = '#f1f5f9';
const MUTED = '#64748b';

const Badge = ({ label, color = VIOLET }: { label: string; color?: string }) => (
  <span
    style={{
      background: color + '22',
      color,
      border: `1px solid ${color}44`,
      borderRadius: 4,
      padding: '2px 10px',
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 1,
    }}
  >
    {label}
  </span>
);

const Code = ({ children }: { children: string }) => (
  <code
    style={{
      background: '#1a1f2e',
      color: '#7ee787',
      padding: '2px 8px',
      borderRadius: 4,
      fontFamily: 'monospace',
      fontSize: 13,
    }}
  >
    {children}
  </code>
);

const SectionHead = ({ title, sub }: { title: string; sub: string }) => (
  <div style={{ textAlign: 'center', marginBottom: 52 }}>
    <h2 style={{ fontSize: 34, fontWeight: 800, color: TEXT, margin: 0 }}>{title}</h2>
    <p style={{ color: MUTED, marginTop: 12, fontSize: 16, maxWidth: 560, margin: '12px auto 0' }}>
      {sub}
    </p>
  </div>
);

// ─── Nav ─────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav
      style={{
        background: BG,
        borderBottom: `1px solid ${BORDER}`,
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          height: 60,
          gap: 24,
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 18, color: TEXT }}>🛡️ xShield AI</span>
        <span
          style={{
            background: VIOLET + '22',
            color: VIOLET_L,
            border: `1px solid ${VIOLET}44`,
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          ENTERPRISE
        </span>

        <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
          {[
            ['Capabilities', '#capabilities'],
            ['Pricing', '#pricing'],
            ['Docs', '/docs'],
          ].map(([label, href]) =>
            href.startsWith('/') ? (
              <Link
                key={label}
                to={href}
                style={{ color: MUTED, fontSize: 13, textDecoration: 'none', padding: '4px 12px' }}
              >
                {label}
              </Link>
            ) : (
              <a
                key={label}
                href={href}
                style={{ color: MUTED, fontSize: 13, textDecoration: 'none', padding: '4px 12px' }}
              >
                {label}
              </a>
            )
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Personal app crosslink */}
        <Link
          to="/personal"
          style={{
            color: GREEN,
            fontSize: 12,
            fontWeight: 600,
            textDecoration: 'none',
            border: `1px solid ${GREEN}33`,
            borderRadius: 6,
            padding: '4px 12px',
          }}
        >
          📱 Personal App →
        </Link>

        <Link to="/login" style={{ color: MUTED, fontSize: 13, textDecoration: 'none' }}>
          Sign In
        </Link>
        <Link
          to="/onboarding"
          style={{
            background: VIOLET,
            color: '#fff',
            borderRadius: 6,
            padding: '6px 18px',
            fontSize: 13,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Start Free →
        </Link>
      </div>
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section style={{ background: BG, padding: '90px 24px 72px', textAlign: 'center' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginBottom: 24,
          }}
        >
          <Badge label="Apache 2.0 Open Source" color={GREEN} />
          <Badge label="Self-hosted in 30s" color={VIOLET} />
          <Badge label="India-first Threat Intel" color={AMBER} />
          <Badge label="STIX/TAXII 2.1" color={MUTED} />
        </div>

        <h1
          style={{
            fontSize: 58,
            fontWeight: 900,
            color: TEXT,
            lineHeight: 1.08,
            margin: '0 0 24px',
          }}
        >
          Threat Intelligence
          <br />
          <span style={{ color: VIOLET_L }}>at SMB Prices.</span>
        </h1>

        <p
          style={{
            color: MUTED,
            fontSize: 19,
            lineHeight: 1.75,
            marginBottom: 16,
            maxWidth: 620,
            margin: '0 auto 16px',
          }}
        >
          Domain risk API · Brand protection · Supply chain scanning · AI threat narratives ·
          STIX/TAXII 2.1 export
        </p>
        <p style={{ color: MUTED, fontSize: 15, marginBottom: 36 }}>
          Recorded Future charges <span style={{ color: RED, fontWeight: 700 }}>$30,000+/yr</span>.{' '}
          xShield starts at <strong style={{ color: TEXT }}>$99/month</strong>.
        </p>

        <div
          style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginBottom: 28,
          }}
        >
          <Link
            to="/onboarding"
            style={{
              background: VIOLET,
              color: '#fff',
              padding: '13px 30px',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 15,
              textDecoration: 'none',
            }}
          >
            Scan Your Domain Free →
          </Link>
          <a
            href="https://github.com/rocketlang/ankrshield"
            target="_blank"
            rel="noreferrer"
            style={{
              border: `1px solid ${BORDER}`,
              color: TEXT,
              padding: '13px 30px',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 15,
              textDecoration: 'none',
            }}
          >
            ⭐ View on GitHub
          </a>
        </div>

        <div style={{ marginTop: 8 }}>
          <Code>npx xshield-warrior start</Code>
          <span style={{ color: MUTED, fontSize: 13, marginLeft: 12 }}>
            — self-host in 30 seconds
          </span>
        </div>

        {/* Trust bar */}
        <div
          style={{
            display: 'flex',
            gap: 32,
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginTop: 52,
            paddingTop: 40,
            borderTop: `1px solid ${BORDER}`,
          }}
        >
          {[
            ['17', 'Intelligence Sources'],
            ['12', 'API Capabilities'],
            ['5min', 'Alert Latency'],
            ['$0', 'Starter Tier'],
          ].map(([val, label]) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: VIOLET_L }}>{val}</div>
              <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Capabilities ─────────────────────────────────────────────────────────────

const CAPABILITIES = [
  {
    icon: '🔍',
    title: 'Domain Risk Scoring',
    desc: '12 parallel sources: DNS/SPF/DMARC, GreyNoise, HIBP, Shodan, OTX, URLScan, crt.sh',
    badge: 'FREE',
  },
  {
    icon: '🏷️',
    title: 'Brand Impersonation',
    desc: 'Typosquat detection + favicon pHash visual similarity + social handle monitoring',
    badge: 'FREE',
  },
  {
    icon: '🔐',
    title: 'Certificate Transparency',
    desc: 'Live certstream WebSocket — 24–48h advance warning before phishing attacks launch',
    badge: 'FREE',
  },
  {
    icon: '📦',
    title: 'Supply Chain + SBOM',
    desc: 'Dependency confusion detection for npm/PyPI. Accepts CycloneDX and SPDX SBOM files',
    badge: 'STARTER',
  },
  {
    icon: '🇮🇳',
    title: 'India Threat Intel',
    desc: 'UPI/NPCI fraud patterns, CERT-In advisories, telecom OTP abuse — no competitor covers this',
    badge: 'FREE',
  },
  {
    icon: '🎣',
    title: 'Phishing Kit Fingerprinter',
    desc: 'Identifies GoPhish, Evilginx2, Modlishka, Zphisher by HTML/JS fingerprint — links campaigns to actors',
    badge: 'STARTER',
  },
  {
    icon: '📡',
    title: 'STIX/TAXII 2.1 Export',
    desc: 'Machine-readable threat feeds for Splunk, Sentinel, QRadar. Recorded Future charges $30K+/yr for this.',
    badge: 'PRO',
  },
  {
    icon: '🤖',
    title: 'AI Threat Narrative',
    desc: 'Claude generates plain-English executive briefings from raw risk data — actionable for non-technical stakeholders',
    badge: 'STARTER',
  },
  {
    icon: '🔎',
    title: 'Registrant Pivoting',
    desc: 'RDAP + crt.sh correlation — find all domains registered by the same threat actor',
    badge: 'STARTER',
  },
  {
    icon: '👥',
    title: 'Team Accounts',
    desc: 'Multi-tenant workspaces with OWNER/ADMIN/ANALYST/VIEWER roles. Team-owned API keys',
    badge: 'STARTER',
  },
  {
    icon: '🚨',
    title: 'Watch Alerts',
    desc: '8 alert channels: Slack, Telegram, WhatsApp, PagerDuty, Jira, SMS, Email, FCM push',
    badge: 'STARTER',
  },
  {
    icon: '⚖️',
    title: 'MITRE ATT&CK v15',
    desc: 'Every finding mapped to ATT&CK techniques. Navigator layer export + executive heatmap included',
    badge: 'FREE',
  },
];

function Capabilities() {
  return (
    <section id="capabilities" style={{ background: BG_ALT, padding: '72px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SectionHead
          title="12 Capabilities. One API."
          sub="Everything from domain risk scoring to STIX/TAXII threat feeds — REST + GraphQL, works in 5 minutes"
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(285px, 1fr))',
            gap: 16,
          }}
        >
          {CAPABILITIES.map((c) => (
            <div
              key={c.title}
              style={{
                background: BG_CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
                padding: '20px 22px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 22 }}>{c.icon}</span>
                <span style={{ fontWeight: 700, color: TEXT, fontSize: 14 }}>{c.title}</span>
                <span style={{ marginLeft: 'auto' }}>
                  <Badge
                    label={c.badge}
                    color={c.badge === 'FREE' ? GREEN : c.badge === 'STARTER' ? VIOLET : AMBER}
                  />
                </span>
              </div>
              <p style={{ color: MUTED, fontSize: 13, margin: 0, lineHeight: 1.6 }}>{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Self-host / Deploy ───────────────────────────────────────────────────────

function SelfHost() {
  return (
    <section style={{ background: BG, padding: '72px 24px' }}>
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 60,
          alignItems: 'center',
        }}
      >
        <div>
          <Badge label="SELF-HOSTED" color={GREEN} />
          <h2
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: TEXT,
              margin: '16px 0 16px',
              lineHeight: 1.2,
            }}
          >
            Deploy it yourself.
            <br />
            <span style={{ color: GREEN }}>Own your data.</span>
          </h2>
          <p style={{ color: MUTED, fontSize: 16, lineHeight: 1.8, marginBottom: 24 }}>
            Clone the repo, run the engine, point it at your domain. 17 intelligence sources + AI
            threat narrative — no account, no telemetry, no vendor trust required.
          </p>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: '0 0 28px',
              color: MUTED,
              fontSize: 14,
              lineHeight: 2.2,
            }}
          >
            {[
              'PostgreSQL or in-memory mode',
              'Air-gap friendly (offline IOC snapshots)',
              'REST + GraphQL API out of the box',
              'Apache 2.0 — fork and modify freely',
              'Docker Compose in one command',
            ].map((f) => (
              <li key={f}>
                <span style={{ color: GREEN }}>✓ </span>
                {f}
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: 12 }}>
            <a
              href="https://github.com/rocketlang/ankrshield"
              target="_blank"
              rel="noreferrer"
              style={{
                background: VIOLET,
                color: '#fff',
                padding: '10px 22px',
                borderRadius: 7,
                fontWeight: 700,
                fontSize: 14,
                textDecoration: 'none',
              }}
            >
              ⭐ Star on GitHub
            </a>
            <Link
              to="/docs"
              style={{
                border: `1px solid ${BORDER}`,
                color: TEXT,
                padding: '10px 22px',
                borderRadius: 7,
                fontWeight: 600,
                fontSize: 14,
                textDecoration: 'none',
              }}
            >
              Read Docs
            </Link>
          </div>
        </div>

        <div
          style={{
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: '28px 32px',
          }}
        >
          <div style={{ color: MUTED, fontSize: 11, letterSpacing: 1, marginBottom: 14 }}>
            TERMINAL
          </div>
          <pre
            style={{
              margin: 0,
              color: '#7ee787',
              fontFamily: 'monospace',
              fontSize: 13.5,
              lineHeight: 2,
            }}
          >
            <span style={{ color: MUTED }}>$</span> npx xshield-warrior start{'\n'}
            <span style={{ color: '#3b82f6' }}>▶</span> xShield API listening on :7171{'\n'}
            <span style={{ color: '#3b82f6' }}>▶</span> 17 intel sources loaded{'\n'}
            {'\n'}
            <span style={{ color: MUTED }}>$</span> npx xshield-warrior scan ankrlabs.org{'\n'}
            <span style={{ color: '#7ee787' }}>✓</span> Risk score:{' '}
            <span style={{ color: GREEN }}>12/100</span> · SAFE{'\n'}
            <span style={{ color: '#7ee787' }}>✓</span> No typosquats · SPF pass · No IOCs{'\n'}
            {'\n'}
            <span style={{ color: MUTED }}>$</span> npx xshield-warrior setup{'\n'}
            <span style={{ color: MUTED }}># interactive wizard — Slack/PagerDuty/SIEM</span>
          </pre>
          <div
            style={{
              marginTop: 20,
              padding: '12px 16px',
              background: VIOLET + '11',
              border: `1px solid ${VIOLET}33`,
              borderRadius: 8,
              color: MUTED,
              fontSize: 12,
            }}
          >
            <strong style={{ color: VIOLET_L }}>Open Live Dashboard →</strong> Real-time view of
            attack chains, honeypot hits, APT IOC matches, and pre-blocked IPs.
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── India angle ──────────────────────────────────────────────────────────────

function IndiaAngle() {
  return (
    <section style={{ background: BG_ALT, padding: '72px 24px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <SectionHead
          title="Built for India's Threat Landscape"
          sub="The only security API that understands UPI fraud, DPDP Act 2023, CERT-In advisories, and vernacular users"
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {[
            {
              icon: '💸',
              title: 'UPI / NPCI Fraud Patterns',
              desc: 'Flags domains mimicking NPCI, BHIM, PhonePe, GPay with India-specific regex + WHOIS correlation. No competitor does this.',
            },
            {
              icon: '⚖️',
              title: 'DPDP Act 2023',
              desc: "India's GDPR. We map every finding to reportable incidents under Sections 4, 6, 8, 9, 11, 17 — compliance teams love this.",
            },
            {
              icon: '🌐',
              title: 'Hindi · Tamil · Telugu',
              desc: 'Risk findings in 4 Indian languages. The only security platform serving 500M+ vernacular internet users.',
            },
          ].map((c) => (
            <div
              key={c.title}
              style={{
                background: BG_CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
                padding: 24,
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 12 }}>{c.icon}</div>
              <div style={{ fontWeight: 700, color: TEXT, fontSize: 15, marginBottom: 8 }}>
                {c.title}
              </div>
              <p style={{ color: MUTED, fontSize: 13, margin: 0, lineHeight: 1.7 }}>{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

const PLANS = [
  {
    name: 'FREE',
    price: '$0',
    sub: 'Forever free',
    scans: '10 scans/month',
    features: [
      'Domain risk API',
      'Brand monitor',
      'India intel',
      'MITRE mapping',
      'STIX export (read)',
      'Community support',
    ],
    cta: 'Get API Key',
    to: '/register',
    highlight: false,
  },
  {
    name: 'STARTER',
    price: '$99',
    sub: 'per month',
    scans: '500 scans/month',
    features: [
      'Everything in FREE',
      'AI threat narratives',
      'Supply chain scan',
      'Watch alerts (8 channels)',
      'Registrant pivoting',
      'Team accounts (5 seats)',
      'Email support',
    ],
    cta: 'Start 14-day Trial →',
    to: '/onboarding',
    highlight: true,
  },
  {
    name: 'PRO',
    price: '$499',
    sub: 'per month',
    scans: 'Unlimited',
    features: [
      'Everything in STARTER',
      'STIX/TAXII 2.1 full export',
      'SBOM ingestion',
      'Phishing kit fingerprinter',
      'Enterprise SSO (SAML)',
      'SLA + dedicated engineer',
    ],
    cta: 'Contact Sales',
    to: '/onboarding',
    highlight: false,
  },
];

function Pricing() {
  return (
    <section id="pricing" style={{ background: BG, padding: '72px 24px' }}>
      <div style={{ maxWidth: 1020, margin: '0 auto' }}>
        <SectionHead
          title="Simple Pricing. No Surprises."
          sub="No per-seat fees. No annual lock-in. One API key per team. Cancel anytime."
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {PLANS.map((p) => (
            <div
              key={p.name}
              style={{
                background: BG_CARD,
                border: `2px solid ${p.highlight ? VIOLET : BORDER}`,
                borderRadius: 12,
                padding: '28px 24px',
                position: 'relative',
              }}
            >
              {p.highlight && (
                <div
                  style={{
                    position: 'absolute',
                    top: -13,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: VIOLET,
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '3px 14px',
                    borderRadius: 20,
                  }}
                >
                  MOST POPULAR
                </div>
              )}
              <div style={{ fontWeight: 800, fontSize: 18, color: p.highlight ? VIOLET_L : TEXT }}>
                {p.name}
              </div>
              <div
                style={{
                  fontSize: 38,
                  fontWeight: 900,
                  color: TEXT,
                  margin: '10px 0 0',
                  lineHeight: 1,
                }}
              >
                {p.price}
              </div>
              <div style={{ color: MUTED, fontSize: 13, marginBottom: 6 }}>{p.sub}</div>
              <div
                style={{
                  background: p.highlight ? VIOLET + '22' : BG_ALT,
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                  color: p.highlight ? VIOLET_L : MUTED,
                  marginBottom: 20,
                  display: 'inline-block',
                }}
              >
                {p.scans}
              </div>
              <ul style={{ listStyle: 'none', margin: '0 0 24px', padding: 0 }}>
                {p.features.map((f) => (
                  <li
                    key={f}
                    style={{
                      color: MUTED,
                      fontSize: 13,
                      marginBottom: 9,
                      paddingLeft: 18,
                      position: 'relative',
                    }}
                  >
                    <span style={{ position: 'absolute', left: 0, color: GREEN }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to={p.to}
                style={{
                  display: 'block',
                  textAlign: 'center',
                  background: p.highlight ? VIOLET : 'transparent',
                  border: `1px solid ${p.highlight ? VIOLET : BORDER}`,
                  color: p.highlight ? '#fff' : TEXT,
                  padding: '11px',
                  borderRadius: 7,
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: 'none',
                }}
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>

        <p style={{ textAlign: 'center', color: MUTED, fontSize: 13, marginTop: 28 }}>
          Self-hosting? <strong style={{ color: TEXT }}>Apache 2.0 — always free</strong> to run on
          your own infrastructure.{' '}
          <a
            href="https://github.com/rocketlang/ankrshield"
            target="_blank"
            rel="noreferrer"
            style={{ color: VIOLET_L }}
          >
            GitHub →
          </a>
        </p>
      </div>
    </section>
  );
}

// ─── Competitor comparison ─────────────────────────────────────────────────────

function Comparison() {
  return (
    <section style={{ background: BG_ALT, padding: '72px 24px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <SectionHead
          title="vs. The Incumbents"
          sub="Enterprise threat intelligence without the enterprise price tag"
        />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {[
                  'Capability',
                  'xShield',
                  'Recorded Future',
                  'Crowdstrike',
                  'OSINT-only tools',
                ].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      padding: '12px 16px',
                      borderBottom: `1px solid ${BORDER}`,
                      color: i === 1 ? VIOLET_L : MUTED,
                      textAlign: i === 0 ? 'left' : 'center',
                      fontWeight: i === 1 ? 800 : 600,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['Domain risk API', '✅ REST+GQL', '✅ REST', '✅ REST', '⚠️ manual'],
                ['STIX/TAXII 2.1', '✅ FREE tier', '✅ $30K+/yr', '✅ $50K+/yr', '❌'],
                ['AI threat narrative', '✅ STARTER', '⚠️ add-on', '⚠️ add-on', '❌'],
                ['India threat intel', '✅ native', '⚠️ limited', '⚠️ limited', '❌'],
                ['Supply chain SBOM', '✅ STARTER', '✅ enterprise', '✅ enterprise', '❌'],
                ['Self-hosted', '✅ 30 seconds', '❌', '❌', '✅'],
                ['Open source', '✅ Apache 2.0', '❌', '❌', '⚠️ some'],
                ['Price', '✅ $0–$499/mo', '❌ $30K+/yr', '❌ $50K+/yr', '✅ free but limited'],
              ].map(([feat, ...vals]) => (
                <tr key={feat} style={{ borderBottom: `1px solid ${BORDER}22` }}>
                  <td style={{ padding: '11px 16px', color: TEXT }}>{feat}</td>
                  {vals.map((v, i) => (
                    <td
                      key={i}
                      style={{
                        padding: '11px 16px',
                        textAlign: 'center',
                        color: v.startsWith('✅') ? GREEN : v.startsWith('❌') ? RED + '88' : AMBER,
                      }}
                    >
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ─── Personal app crosslink ───────────────────────────────────────────────────

function PersonalCrosslink() {
  return (
    <section style={{ background: BG, padding: '64px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div
          style={{
            background: `linear-gradient(135deg, #051a0f 0%, #060a10 100%)`,
            border: `1px solid ${GREEN}33`,
            borderRadius: 16,
            padding: '44px 48px',
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 40,
            alignItems: 'center',
          }}
        >
          <div>
            <Badge label="PERSONAL APP" color={GREEN} />
            <h3 style={{ fontSize: 26, fontWeight: 800, color: TEXT, margin: '14px 0 12px' }}>
              Protecting your own phone?
              <br />
              <span style={{ color: GREEN }}>AnkrShield is built for you.</span>
            </h3>
            <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.8, margin: 0 }}>
              xShield protects your org's domains. AnkrShield protects your personal device — UPI
              fraud, WhatsApp account hijacking, stalkerware, SMS OTP theft. India-first. Free
              download. No account needed.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
              <Link
                to="/personal"
                style={{
                  background: GREEN,
                  color: '#000',
                  padding: '10px 22px',
                  borderRadius: 7,
                  fontWeight: 800,
                  fontSize: 14,
                  textDecoration: 'none',
                }}
              >
                📱 AnkrShield Personal →
              </Link>
              <a
                href="/download/ankrshield.apk"
                style={{
                  border: `1px solid ${GREEN}44`,
                  color: GREEN,
                  padding: '10px 22px',
                  borderRadius: 7,
                  fontWeight: 600,
                  fontSize: 14,
                  textDecoration: 'none',
                }}
              >
                ↓ Download APK
              </a>
            </div>
          </div>
          <div style={{ textAlign: 'center', minWidth: 140 }}>
            <div style={{ fontSize: 72 }}>📱</div>
            <div style={{ color: GREEN, fontWeight: 800, fontSize: 15, marginTop: 8 }}>Free</div>
            <div style={{ color: MUTED, fontSize: 12 }}>Android · India-first</div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer
      style={{
        background: BG_CARD,
        borderTop: `1px solid ${BORDER}`,
        padding: '40px 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: TEXT, marginBottom: 4 }}>
          🛡️ xShield AI{' '}
          <span style={{ color: MUTED, fontWeight: 400, fontSize: 13 }}>by ANKR Labs</span>
        </div>
        <div style={{ color: MUTED, fontSize: 12, marginBottom: 20 }}>
          Powerp Box IT Solutions Pvt Ltd · Gurgaon, India
        </div>
        <div
          style={{
            display: 'flex',
            gap: 20,
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginBottom: 20,
          }}
        >
          {[
            ['GitHub', 'https://github.com/rocketlang/ankrshield', true],
            ['Docs', '/docs', false],
            ['Pricing', '#pricing', false],
            ['Dashboard', '/dashboard', false],
            ['Live Threats', '/live', false],
            ['MDM Portal', '/mdm', false],
            ['AnkrShield App', '/personal', false],
          ].map(([label, href, external]) =>
            external ? (
              <a
                key={label as string}
                href={href as string}
                target="_blank"
                rel="noreferrer"
                style={{ color: MUTED, fontSize: 12, textDecoration: 'none' }}
              >
                {label}
              </a>
            ) : (
              <Link
                key={label as string}
                to={href as string}
                style={{ color: MUTED, fontSize: 12, textDecoration: 'none' }}
              >
                {label}
              </Link>
            )
          )}
        </div>
        <div style={{ color: MUTED + '88', fontSize: 11 }}>
          © 2026 Powerp Box IT Solutions Pvt Ltd · Apache 2.0 Open Source · xshieldai.com
        </div>
      </div>
    </footer>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function Landing() {
  return (
    <div
      style={{
        background: BG,
        minHeight: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: TEXT,
      }}
    >
      <Nav />
      <Hero />
      <Capabilities />
      <SelfHost />
      <IndiaAngle />
      <Pricing />
      <Comparison />
      <PersonalCrosslink />
      <Footer />
    </div>
  );
}
