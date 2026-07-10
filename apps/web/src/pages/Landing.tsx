/**
 * xShieldAI — Marketing Landing Page
 * Audience: CISOs, CTOs, DevSecOps, SOC teams, maritime security teams
 * Tone: urgent, authoritative, comparison-first, conversion-focused
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

// ─── Color constants (DO NOT change — matches existing dark theme) ─────────────
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
const CYAN = '#06b6d4';

// ─── Shared components ────────────────────────────────────────────────────────

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

const SectionHead = ({ title, sub }: { title: string; sub: string }) => (
  <div style={{ textAlign: 'center', marginBottom: 52 }}>
    <h2 style={{ fontSize: 34, fontWeight: 800, color: TEXT, margin: 0 }}>{title}</h2>
    <p style={{ color: MUTED, marginTop: 12, fontSize: 16, maxWidth: 560, margin: '12px auto 0' }}>
      {sub}
    </p>
  </div>
);

// ─── A. Nav ───────────────────────────────────────────────────────────────────

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
            ['Compare', '#compare'],
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
          <Link
            to="/live"
            style={{
              color: RED,
              fontSize: 13,
              textDecoration: 'none',
              padding: '4px 12px',
              fontWeight: 600,
            }}
          >
            🔴 Live Threats
          </Link>
        </div>

        <div style={{ flex: 1 }} />

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
          Scan Free →
        </Link>
      </div>
    </nav>
  );
}

// ─── B. Hero ──────────────────────────────────────────────────────────────────

function Hero() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    const domain = email.includes('@') ? email.split('@')[1].toLowerCase().trim() : '';
    if (domain) {
      navigate(
        `/onboarding?domain=${encodeURIComponent(domain)}&email=${encodeURIComponent(email)}`
      );
    } else {
      navigate('/onboarding');
    }
  };

  return (
    <section style={{ background: BG, padding: '0 24px 72px', textAlign: 'center' }}>
      {/* Live threat ticker ribbon */}
      <div
        style={{
          background: RED + '18',
          borderBottom: `1px solid ${RED}33`,
          padding: '10px 24px',
          fontSize: 13,
          color: RED,
          fontWeight: 600,
          letterSpacing: 0.3,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            background: RED,
            borderRadius: '50%',
            marginRight: 8,
            animation: 'pulse 2s infinite',
          }}
        />
        LIVE: 3 new phishing domains targeting shipping companies registered in the last hour —
        <Link to="/live" style={{ color: RED, marginLeft: 6, textDecoration: 'underline' }}>
          View threat feed →
        </Link>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', paddingTop: 80 }}>
        {/* H1 — urgency-first */}
        <h1
          style={{
            fontSize: 58,
            fontWeight: 900,
            color: TEXT,
            lineHeight: 1.08,
            margin: '0 0 20px',
          }}
        >
          Your domain is being
          <br />
          <span style={{ color: RED }}>impersonated right now.</span>
        </h1>

        {/* H2 subhead */}
        <p
          style={{
            color: MUTED,
            fontSize: 20,
            lineHeight: 1.7,
            marginBottom: 20,
            maxWidth: 640,
            margin: '0 auto 20px',
          }}
        >
          xShieldAI monitors 25+ threat sources and tells you —{' '}
          <strong style={{ color: TEXT }}>before the phishing emails land.</strong>
        </p>

        {/* Competitive price hook */}
        <div
          style={{
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            padding: '14px 24px',
            display: 'inline-block',
            marginBottom: 36,
            fontSize: 14,
            color: MUTED,
          }}
        >
          <span style={{ color: RED, fontWeight: 700 }}>Recorded Future: $50,000/yr.</span>
          {'  ·  '}
          <span style={{ color: AMBER, fontWeight: 700 }}>DomainTools: $22,000/yr.</span>
          {'  ·  '}
          <span style={{ color: CYAN, fontWeight: 700 }}>xShieldAI: from $99/mo.</span>
          <br />
          <span style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
            Same threat data. Built for teams that actually act on it.
          </span>
        </div>

        {/* Inline email capture */}
        <form
          onSubmit={handleScan}
          style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginBottom: 28,
          }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@company.com"
            style={{
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              color: TEXT,
              borderRadius: 8,
              padding: '13px 18px',
              fontSize: 15,
              width: 280,
              outline: 'none',
            }}
          />
          <button
            type="submit"
            style={{
              background: VIOLET,
              color: '#fff',
              padding: '13px 28px',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 15,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Scan My Domain Free →
          </button>
        </form>

        {/* Trust stats */}
        <div
          style={{
            display: 'flex',
            gap: 32,
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginTop: 40,
            paddingTop: 40,
            borderTop: `1px solid ${BORDER}`,
          }}
        >
          {[
            ['25+', 'Intelligence Sources'],
            ['STIX 2.1', 'Native Output'],
            ['5-min', 'Alert Latency'],
            ['Apache 2.0', 'Open Source'],
          ].map(([val, label]) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: VIOLET_L }}>{val}</div>
              <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── C. Threat Live Feed Teaser ───────────────────────────────────────────────

function LiveFeedTeaser() {
  const detections = [
    {
      severity: 'HIGH',
      domain: 'maersk-logistics[.]com',
      type: 'Typosquat detected',
      age: '2 min ago',
      color: RED,
    },
    {
      severity: 'MED',
      domain: 'cma-cgm-invoice[.]net',
      type: 'Phishing kit: Evilginx2',
      age: '7 min ago',
      color: AMBER,
    },
    {
      severity: 'HIGH',
      domain: 'hapag-lloyd-portal[.]com',
      type: 'Certificate issued, 0-day-old domain',
      age: '11 min ago',
      color: RED,
    },
  ];

  return (
    <section style={{ background: BG_ALT, padding: '64px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              background: RED,
              borderRadius: '50%',
            }}
          />
          <h2 style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: 0 }}>
            Live Threat Detections
          </h2>
          <span
            style={{
              background: RED + '22',
              color: RED,
              border: `1px solid ${RED}44`,
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            LIVE
          </span>
        </div>

        <div
          style={{
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {/* Table header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr 1fr 100px',
              padding: '10px 20px',
              borderBottom: `1px solid ${BORDER}`,
              fontSize: 11,
              fontWeight: 700,
              color: MUTED,
              letterSpacing: 1,
            }}
          >
            <span>SEVERITY</span>
            <span>DOMAIN</span>
            <span>DETECTION</span>
            <span>TIME</span>
          </div>

          {detections.map((d, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '80px 1fr 1fr 100px',
                padding: '14px 20px',
                borderBottom: i < detections.length - 1 ? `1px solid ${BORDER}33` : 'none',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  background: d.color + '22',
                  color: d.color,
                  border: `1px solid ${d.color}44`,
                  borderRadius: 4,
                  padding: '2px 6px',
                  fontSize: 10,
                  fontWeight: 700,
                  display: 'inline-block',
                }}
              >
                {d.severity}
              </span>
              <code
                style={{
                  color: d.severity === 'HIGH' ? RED : AMBER,
                  fontFamily: 'monospace',
                  fontSize: 13,
                }}
              >
                {d.domain}
              </code>
              <span style={{ color: MUTED, fontSize: 13 }}>{d.type}</span>
              <span style={{ color: MUTED, fontSize: 12 }}>{d.age}</span>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <Link
            to="/live"
            style={{
              color: VIOLET_L,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            View Live Threat Feed →
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── D. Capabilities Grid ─────────────────────────────────────────────────────

const CAPABILITIES = [
  {
    icon: '🔍',
    title: 'Domain Risk Scoring',
    desc: '25+ parallel sources: DNS/SPF/DMARC, GreyNoise, HIBP, Shodan, OTX, URLScan, crt.sh and more',
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
    desc: 'UPI/NPCI fraud patterns, CERT-In advisories, TAFCOP/Sanchar phone fraud — no competitor covers this',
    badge: 'FREE',
  },
  {
    icon: '🎣',
    title: 'Phishing Kit Fingerprinter',
    desc: 'Identifies GoPhish, Evilginx2, Modlishka, Zphisher, CredSniper, W3LL Panel by HTML/JS fingerprint',
    badge: 'STARTER',
  },
  {
    icon: '📡',
    title: 'STIX/TAXII 2.1 Export',
    desc: 'Machine-readable threat feeds for Splunk, Sentinel, QRadar. TAXII 2.1 read+write server included.',
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
  {
    icon: '🛡️',
    title: 'Active Defense',
    desc: 'xshield-active: file DMCA, abuse reports, SIEM push, executive notify. Mode 1/2/3 consent-gated.',
    badge: 'PRO',
  },
  {
    icon: '📄',
    title: 'DPDP / GDPR Evidence',
    desc: 'The enterprise face of AnkrShield: turn beyond-scope app tracking into a cited, filable DPDP/GDPR purpose-limitation complaint — vendors, counts, legal basis, pre-filled draft.',
    badge: 'PRO',
    href: '/evidence',
  },
  {
    icon: '🔏',
    title: 'Evidence Notary',
    desc: 'Ed25519-signed, tamper-evident notarization of any evidence pack, in an append-only ledger. Verify independently against the public key. Regulator-grade — integrity + issuer + time.',
    badge: 'PRO',
  },
  {
    icon: '📱',
    title: 'Fleet Privacy Posture',
    desc: 'AnkrShield witnessing across managed devices: which apps leak beyond scope, tamed by policy without breaking them. BYOD/MDM DPO dashboard.',
    badge: 'PRO',
    href: '/fleet',
  },
  {
    icon: '🧪',
    title: 'Vendor App Vetting',
    desc: 'Grade any app before it touches your fleet — cited behavior (trackers, scope, IOCs), compute/quote/null, policy gate on what fails. The enterprise face of the App Safety Index.',
    badge: 'PRO',
    href: '/vendor-vetting',
  },
];

function Capabilities() {
  return (
    <section id="capabilities" style={{ background: BG_ALT, padding: '72px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SectionHead
          title="17 Capabilities. One API."
          sub="Everything from domain risk scoring to active DMCA filing — REST + GraphQL, works in 5 minutes"
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(285px, 1fr))',
            gap: 16,
          }}
        >
          {CAPABILITIES.map((c) => {
            const inner = (
              <>
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
                {c.href && (
                  <span
                    style={{
                      color: VIOLET_L,
                      fontSize: 12,
                      fontWeight: 700,
                      display: 'inline-block',
                      marginTop: 10,
                    }}
                  >
                    Explore →
                  </span>
                )}
              </>
            );
            const cardStyle = {
              background: BG_CARD,
              border: `1px solid ${c.href ? VIOLET + '55' : BORDER}`,
              borderRadius: 10,
              padding: '20px 22px',
              display: 'block',
              textDecoration: 'none',
            } as const;
            return c.href ? (
              <Link key={c.title} to={c.href} style={cardStyle}>
                {inner}
              </Link>
            ) : (
              <div key={c.title} style={cardStyle}>
                {inner}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── E. Competitive Comparison Table ─────────────────────────────────────────

const COMPARE_ROWS = [
  ['Entry price', 'From $99/mo', '$50,000/yr', '$22,000/yr', '$30,000/yr', 'Custom (high)'],
  ['STIX 2.1 native', '✅ Every scan', '⚠️ Export only', '❌', '❌', '❌'],
  ['TAXII 2.1 server', '✅ Read + Write', '❌', '❌', '❌', '❌'],
  ['Active defense', '✅ Mode 1/2/3', '❌', '❌', '⚠️ Internal only', '❌'],
  ['Maritime aware', '✅ Native', '❌', '❌', '❌', '✅ OT only'],
  ['Phishing kit fingerprint', '✅ 6 kits', '✅', '❌', '❌', '❌'],
  ['Supply chain scanning', '✅ npm/PyPI', '⚠️ Limited', '❌', '❌', '❌'],
  ['Phone fraud detection', '✅ TAFCOP/Sanchar', '❌', '❌', '❌', '❌'],
  ['AI threat narrative', '✅ Claude-powered', '❌', '❌', '✅', '❌'],
  ['Beacon / deception', '✅ Built-in', '❌', '❌', '❌', '❌'],
  ['Collective defense feed', '✅ TAXII write', '❌', '❌', '❌', '❌'],
  ['Remediation playbooks', '✅ Copy-paste ready', '❌', '❌', '❌', '❌'],
  ['Self-hostable', '✅ Apache 2.0', '❌', '❌', '❌', '❌'],
  ['No SOAR needed', '✅', '❌ Requires SOAR', '❌', '❌', '❌'],
];

function ComparisonTable() {
  const headers = ['Feature', 'xShieldAI', 'Recorded Future', 'DomainTools', 'Darktrace', 'Cydome'];

  const cellColor = (val: string) => {
    if (val.startsWith('✅')) return GREEN;
    if (val.startsWith('❌')) return MUTED + 'aa';
    if (val.startsWith('⚠️')) return AMBER;
    return MUTED;
  };

  return (
    <section id="compare" style={{ background: BG, padding: '80px 24px' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto' }}>
        <SectionHead
          title="How xShieldAI compares"
          sub="Enterprise-grade intelligence. Not enterprise prices."
        />

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th
                    key={h}
                    style={{
                      padding: '14px 18px',
                      borderBottom: `2px solid ${i === 1 ? VIOLET : BORDER}`,
                      color: i === 1 ? VIOLET_L : MUTED,
                      textAlign: i === 0 ? 'left' : 'center',
                      fontWeight: i === 1 ? 900 : 600,
                      background: i === 1 ? VIOLET + '11' : 'transparent',
                      position: 'relative',
                    }}
                  >
                    {i === 1 && (
                      <div
                        style={{
                          position: 'absolute',
                          top: -14,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: VIOLET,
                          color: '#fff',
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 12px',
                          borderRadius: 10,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        MOST POPULAR
                      </div>
                    )}
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map(([feat, ...vals], ri) => (
                <tr
                  key={feat}
                  style={{
                    borderBottom: `1px solid ${BORDER}22`,
                    background: ri % 2 === 0 ? 'transparent' : BG_CARD + '44',
                  }}
                >
                  <td style={{ padding: '12px 18px', color: TEXT, fontWeight: 500 }}>{feat}</td>
                  {vals.map((v, ci) => (
                    <td
                      key={ci}
                      style={{
                        padding: '12px 18px',
                        textAlign: 'center',
                        color: cellColor(v),
                        background: ci === 0 ? VIOLET + '08' : 'transparent',
                        fontWeight: ci === 0 ? 600 : 400,
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

        {/* Stack cost callout */}
        <div
          style={{
            marginTop: 32,
            background: VIOLET + '11',
            border: `1px solid ${VIOLET}33`,
            borderRadius: 12,
            padding: '20px 28px',
            textAlign: 'center',
          }}
        >
          <p style={{ color: MUTED, fontSize: 14, margin: 0, lineHeight: 1.8 }}>
            The enterprise stack equivalent (RF + DomainTools + SOAR + TAXII integration) costs{' '}
            <span style={{ color: RED, fontWeight: 700 }}>$127,000–207,000/year.</span>
            {'  '}
            <span style={{ color: VIOLET_L, fontWeight: 700 }}>xShieldAI Pro: $499/month.</span>
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── F. Three CISO Questions ──────────────────────────────────────────────────

function CISOQuestions() {
  const questions = [
    {
      q: 'We got phished last month. How do we know before it hits our inbox next time?',
      a: 'Domain Watch polls 25+ sources every 5 minutes. Phishing kit fingerprinting detects campaign infrastructure (Evilginx2, GoPhish, Modlishka) as soon as the kit is deployed — often 24–48 hours before the first phishing email sends. Certificate Transparency gives you pre-launch warning from certstream. By the time the email lands, xShieldAI has already alerted you, mapped it to MITRE ATT&CK T1566, and generated a remediation playbook.',
    },
    {
      q: 'We need to share threat intel with our port authority in standard format. How?',
      a: 'Every xShieldAI scan produces a conformant STIX 2.1 bundle — machine-readable, zero manual work. Your TAXII 2.1 server (included in Pro) lets partners pull directly. Every beacon credential hit automatically pushes to the collective defense feed, warning all other xShieldAI clients in your sector. Your port authority gets a live TAXII pull endpoint. No email attachments. No PDFs. Pure machine-to-machine intel sharing.',
    },
    {
      q: 'We found a phishing domain impersonating us. What do we DO about it?',
      a: 'xshield-active. Mode 1: one-click DMCA filing, Google Safe Browsing abuse report, Cloudflare abuse submission, SIEM push, executive notification — all generated automatically from the STIX record. Mode 2: standing orders execute without per-incident approval. Mode 3: always-on automated response for high-confidence detections. Full audit trail in STIX format. No SOAR license required.',
    },
  ];

  return (
    <section style={{ background: BG_ALT, padding: '72px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <SectionHead title="Three Questions CISOs Ask Us" sub="Real scenarios. Concrete answers." />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {questions.map((item, i) => (
            <article
              key={i}
              style={{
                background: BG_CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 12,
                padding: '24px 28px',
              }}
            >
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: VIOLET_L,
                  margin: '0 0 12px',
                  lineHeight: 1.5,
                }}
              >
                Q{i + 1}: {item.q}
              </h3>
              <p style={{ color: MUTED, fontSize: 14, margin: 0, lineHeight: 1.8 }}>{item.a}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── G. Self-host / Deploy ────────────────────────────────────────────────────

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
            Open source threat intelligence platform —{' '}
            <span style={{ color: GREEN }}>deploy in 30 seconds.</span>
          </h2>
          <p style={{ color: MUTED, fontSize: 16, lineHeight: 1.8, marginBottom: 24 }}>
            Clone the repo, run the engine, point it at your domain. 25+ intelligence sources + AI
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
            <span style={{ color: '#3b82f6' }}>▶</span> 25 intel sources loaded{'\n'}
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

// ─── H. India angle ───────────────────────────────────────────────────────────

function IndiaAngle() {
  return (
    <section style={{ background: BG_ALT, padding: '72px 24px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <SectionHead
          title="Built for India's Threat Landscape"
          sub="The only security platform that understands UPI fraud, DPDP Act 2023, TAFCOP/Sanchar phone fraud, CERT-In advisories, and vernacular users"
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {[
            {
              icon: '💸',
              title: 'UPI / NPCI + TAFCOP Fraud',
              desc: 'Flags domains mimicking NPCI, BHIM, PhonePe, GPay. TAFCOP/Sanchar phone fraud detection. No competitor does this.',
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

// ─── I. Pricing preview ───────────────────────────────────────────────────────

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
      'xshield-active defense',
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

function PricingPreview() {
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
          {'  ·  '}
          <Link to="/pricing" style={{ color: VIOLET_L }}>
            Full pricing details →
          </Link>
        </p>
      </div>
    </section>
  );
}

// ─── J. FAQ Section ───────────────────────────────────────────────────────────

const FAQS = [
  {
    q: 'What is STIX 2.1 and why does it matter?',
    a: 'STIX (Structured Threat Information eXpression) is the global standard format for sharing threat intelligence. Every xShieldAI scan produces a conformant STIX 2.1 bundle — machine-readable, shareable with any TAXII-compatible platform or ISAC. This means your threat data can be consumed directly by Splunk, Microsoft Sentinel, QRadar, or any port authority running a TAXII client — no translation, no manual export.',
  },
  {
    q: 'How does xShieldAI compare to Recorded Future?',
    a: 'Recorded Future is an enterprise intelligence platform starting at $50,000/year, focused on named threat actor attribution and proprietary dark web crawlers. xShieldAI covers the same domain risk, phishing detection, and STIX/TAXII layer — plus active defense — from $99/month. RF is the right choice if you need human analyst escalation 24/7. xShieldAI is the right choice if you need to detect, respond, and share intelligence without a $50K budget.',
  },
  {
    q: 'Is xShieldAI suitable for maritime companies?',
    a: 'Yes. xShieldAI is the only threat intelligence platform with native maritime context: India TAFCOP phone fraud, supply chain typosquats for shipping companies, and collective TAXII defense between port operators. It monitors the IT attack surface (phishing domains, leaked credentials, brand impersonation) that OT tools like Cydome cannot see. Maritime sector clients get sector-specific STIX bundles and peer threat sharing via TAXII.',
  },
  {
    q: 'What is the TAXII write endpoint?',
    a: "Most TAXII servers are read-only — you pull threat data out. xShieldAI's TAXII 2.1 server also accepts writes: OT sensors, external SIEMs, or partner tools can push STIX bundles in. Every beacon credential hit automatically pushes to the collective feed, warning all other xShieldAI clients. This makes xShieldAI a genuine collective defense platform, not just a one-way intel feed.",
  },
  {
    q: 'Can xShieldAI replace our SOAR platform?',
    a: 'For the 80% of security incidents that follow known patterns (phishing domain, abuse report, DMCA takedown), yes. xshield-active Mode 1/2/3 automates the response without a separate SOAR license. For complex multi-stage IR, xShieldAI integrates with your existing SOAR via SIEM push connectors. Most teams find they can retire their SOAR for domain/brand/phishing incident classes entirely.',
  },
  {
    q: "What does 'active defense' mean?",
    a: "Active defense (xshield-active) means xShieldAI doesn't just detect — it acts. Mode 1: automated DMCA filing, Google Safe Browsing report, Cloudflare abuse submission, SIEM push, and executive notification from a single confirmed detection. Mode 2: standing orders execute without per-incident approval. Mode 3: always-on automated response for high-confidence detections. All modes require explicit consent configuration and carry full audit trails in STIX format.",
  },
];

function FAQ() {
  return (
    <section id="faq" style={{ background: BG_ALT, padding: '72px 24px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <SectionHead
          title="Frequently Asked Questions"
          sub="STIX/TAXII, pricing comparisons, maritime security, active defense — answered."
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FAQS.map((item, i) => (
            <article
              key={i}
              style={{
                background: BG_CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
                padding: '20px 24px',
              }}
            >
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: TEXT,
                  margin: '0 0 10px',
                  lineHeight: 1.5,
                }}
              >
                {item.q}
              </h3>
              <p style={{ color: MUTED, fontSize: 13, margin: 0, lineHeight: 1.85 }}>{item.a}</p>
            </article>
          ))}
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

// ─── K. Footer ────────────────────────────────────────────────────────────────

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
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
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
            ['Capabilities', '#capabilities', false, false],
            ['Pricing', '#pricing', false, false],
            ['Compare', '#compare', false, false],
            ['Live Threats', '/live', false, false],
            ['Docs', '/docs', false, false],
            ['GitHub', 'https://github.com/rocketlang/ankrshield', false, true],
            ['Personal App', '/personal', false, false],
          ].map(([label, href, _unused, external]) =>
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
            ) : (href as string).startsWith('/') ? (
              <Link
                key={label as string}
                to={href as string}
                style={{ color: MUTED, fontSize: 12, textDecoration: 'none' }}
              >
                {label}
              </Link>
            ) : (
              <a
                key={label as string}
                href={href as string}
                style={{ color: MUTED, fontSize: 12, textDecoration: 'none' }}
              >
                {label}
              </a>
            )
          )}
        </div>

        <div
          style={{
            color: VIOLET_L,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.5,
            marginBottom: 12,
          }}
        >
          STIX 2.1 Compliant · TAXII 2.1 Native · Apache 2.0 Open Source
        </div>

        <div style={{ color: MUTED + '88', fontSize: 11 }}>
          © 2026 Powerp Box IT Solutions Pvt Ltd · xshieldai.com
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
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: TEXT,
      }}
    >
      <Nav />
      <Hero />
      <LiveFeedTeaser />
      <Capabilities />
      <ComparisonTable />
      <CISOQuestions />
      <SelfHost />
      <IndiaAngle />
      <PricingPreview />
      <FAQ />
      <PersonalCrosslink />
      <Footer />
    </div>
  );
}
