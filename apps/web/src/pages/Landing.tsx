/**
 * xShield AI — Landing Page
 * Two-product landing: xShield (B2B API) + AnkrShield (Mobile)
 * Philosophy: AnkrShield works WITH users — surgical inhibition, never blocks apps they trust
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';

const BG = '#060a10';
const BG_ALT = '#080c14';
const BG_CARD = '#0d1117';
const BORDER = '#1e2a3a';
const VIOLET = '#7c3aed';
const VIOLET_L = '#a78bfa';
const GREEN = '#22c55e';
const AMBER = '#f59e0b';
const TEXT = '#f1f5f9';
const MUTED = '#64748b';

// ─── Shared atoms ─────────────────────────────────────────────────────────────

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

const Badge = ({ label, color = VIOLET }: { label: string; color?: string }) => (
  <span
    style={{
      background: color + '22',
      color,
      border: `1px solid ${color}44`,
      borderRadius: 4,
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 1,
    }}
  >
    {label}
  </span>
);

const SectionHead = ({ title, sub }: { title: string; sub: string }) => (
  <div style={{ textAlign: 'center', marginBottom: 48 }}>
    <h2 style={{ fontSize: 32, fontWeight: 800, color: TEXT, margin: 0 }}>{title}</h2>
    <p style={{ color: MUTED, marginTop: 10, fontSize: 16, maxWidth: 560, margin: '10px auto 0' }}>
      {sub}
    </p>
  </div>
);

// ─── Nav ─────────────────────────────────────────────────────────────────────

function Nav({ tab, setTab }: { tab: string; setTab: (t: string) => void }) {
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
          gap: 8,
        }}
      >
        {/* Logo */}
        <span style={{ fontWeight: 800, fontSize: 18, color: TEXT, marginRight: 16 }}>
          🛡️ xShield
        </span>

        {/* Product tabs */}
        {['xShield API', 'AnkrShield App'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? VIOLET + '22' : 'transparent',
              color: tab === t ? VIOLET_L : MUTED,
              border: `1px solid ${tab === t ? VIOLET + '44' : 'transparent'}`,
              borderRadius: 6,
              padding: '4px 14px',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              transition: 'all .2s',
            }}
          >
            {t}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <Link
          to="/docs"
          style={{ color: MUTED, fontSize: 13, textDecoration: 'none', marginRight: 12 }}
        >
          Docs
        </Link>
        <Link
          to="/login"
          style={{ color: MUTED, fontSize: 13, textDecoration: 'none', marginRight: 12 }}
        >
          Sign In
        </Link>
        <Link
          to="/onboarding"
          style={{
            background: VIOLET,
            color: '#fff',
            borderRadius: 6,
            padding: '6px 16px',
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

// ─── xShield tab ─────────────────────────────────────────────────────────────

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
    title: 'India Threat Intelligence',
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
    desc: 'Machine-readable threat feeds for Splunk, Sentinel, QRadar. Recorded Future charges $30K+/yr for this',
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
    desc: '8 alert channels: Slack, Telegram, WhatsApp, PagerDuty, Jira, SMS, Email, FCM',
    badge: 'STARTER',
  },
  {
    icon: '⚖️',
    title: 'MITRE ATT&CK Mapping',
    desc: 'Every finding mapped to ATT&CK v15 techniques. Navigator layer export included',
    badge: 'FREE',
  },
];

const PLANS = [
  {
    name: 'FREE',
    price: '$0',
    scans: '10 scans/mo',
    features: [
      'Domain risk API',
      'Brand monitor',
      'India intel',
      'MITRE mapping',
      'STIX export (read-only)',
      'Community support',
    ],
    cta: 'Get API Key',
    to: '/register',
    highlight: false,
  },
  {
    name: 'STARTER',
    price: '$99/mo',
    scans: '500 scans/mo',
    features: [
      'Everything in FREE',
      'AI threat narratives',
      'Supply chain scan',
      'Watch alerts (8 channels)',
      'Registrant pivoting',
      'Team accounts',
      'Email support',
    ],
    cta: 'Start Trial →',
    to: '/onboarding',
    highlight: true,
  },
  {
    name: 'PRO',
    price: '$499/mo',
    scans: 'Unlimited',
    features: [
      'Everything in STARTER',
      'STIX/TAXII 2.1 full export',
      'SBOM ingestion',
      'Phishing kit fingerprinter',
      'Enterprise SSO',
      'SLA + dedicated support',
    ],
    cta: 'Contact Sales',
    to: '/enterprise/onboarding',
    highlight: false,
  },
];

function XShieldTab() {
  return (
    <div>
      {/* Hero */}
      <section style={{ background: BG, padding: '80px 24px 64px', textAlign: 'center' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              gap: 8,
              justifyContent: 'center',
              flexWrap: 'wrap',
              marginBottom: 20,
            }}
          >
            <Badge label="Apache 2.0 Open Source" color={GREEN} />
            <Badge label="Self-hosted in 30s" color={VIOLET} />
            <Badge label="India-first Threat Intel" color={AMBER} />
          </div>
          <h1
            style={{
              fontSize: 52,
              fontWeight: 900,
              color: TEXT,
              lineHeight: 1.1,
              margin: '0 0 20px',
            }}
          >
            Threat Intelligence
            <br />
            <span style={{ color: VIOLET_L }}>at SMB Prices</span>
          </h1>
          <p style={{ color: MUTED, fontSize: 18, lineHeight: 1.7, marginBottom: 32 }}>
            Domain risk API · Brand protection · Supply chain scanning · AI narratives · STIX/TAXII
            2.1
            <br />
            Recorded Future charges $30K+/yr. We start at{' '}
            <strong style={{ color: TEXT }}>$99/month</strong>.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              to="/onboarding"
              style={{
                background: VIOLET,
                color: '#fff',
                padding: '12px 28px',
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
                padding: '12px 28px',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 15,
                textDecoration: 'none',
                background: 'transparent',
              }}
            >
              View on GitHub
            </a>
          </div>
          <div style={{ marginTop: 24 }}>
            <Code>npx xshield-warrior start</Code>
            <span style={{ color: MUTED, fontSize: 13, marginLeft: 12 }}>
              — self-host in 30 seconds
            </span>
          </div>
        </div>
      </section>

      {/* Capabilities grid */}
      <section style={{ background: BG_ALT, padding: '64px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <SectionHead
            title="12 Capabilities, One API"
            sub="Everything from domain risk scoring to STIX/TAXII threat feeds — all via REST + GraphQL"
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
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
                  <span style={{ fontWeight: 700, color: TEXT, fontSize: 15 }}>{c.title}</span>
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

      {/* Self-host */}
      <section style={{ background: BG, padding: '64px 24px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <SectionHead
            title="Self-Host in 30 Seconds"
            sub="Your threat data stays on your server. No telemetry. Apache 2.0."
          />
          <div
            style={{
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: '24px 32px',
              textAlign: 'left',
            }}
          >
            <div style={{ color: MUTED, fontSize: 12, marginBottom: 8 }}>TERMINAL</div>
            <pre
              style={{
                margin: 0,
                color: '#7ee787',
                fontFamily: 'monospace',
                fontSize: 14,
                lineHeight: 1.8,
              }}
            >
              <span style={{ color: MUTED }}>$ </span>npx xshield-warrior start{'\n'}
              <span style={{ color: MUTED }}>$ </span>npx xshield-warrior scan example.com{'\n'}
              <span style={{ color: MUTED }}>$ </span>npx xshield-warrior setup {'  '}
              <span style={{ color: MUTED }}># interactive wizard</span>
            </pre>
          </div>
          <p style={{ color: MUTED, marginTop: 16, fontSize: 13 }}>
            Apache 2.0 · No telemetry · PostgreSQL or in-memory · Works offline
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section style={{ background: BG_ALT, padding: '64px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <SectionHead
            title="Simple Pricing"
            sub="No per-seat fees. No annual lock-in. API key per team."
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
                      top: -12,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: VIOLET,
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 12px',
                      borderRadius: 20,
                    }}
                  >
                    MOST POPULAR
                  </div>
                )}
                <div style={{ fontWeight: 800, fontSize: 20, color: TEXT }}>{p.name}</div>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 900,
                    color: p.highlight ? VIOLET_L : TEXT,
                    margin: '8px 0 4px',
                  }}
                >
                  {p.price}
                </div>
                <div style={{ color: MUTED, fontSize: 13, marginBottom: 20 }}>{p.scans}</div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, marginBottom: 24 }}>
                  {p.features.map((f) => (
                    <li
                      key={f}
                      style={{
                        color: MUTED,
                        fontSize: 13,
                        marginBottom: 8,
                        paddingLeft: 16,
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
                    padding: '10px',
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
        </div>
      </section>

      {/* India angle */}
      <section style={{ background: BG, padding: '64px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <SectionHead
            title="Built for India's Threat Landscape"
            sub="The only security platform that understands Indian fraud patterns, DPDP Act 2023, and vernacular users"
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {[
              {
                icon: '💸',
                title: 'UPI Fraud Detection',
                desc: 'Flags domains mimicking NPCI, BHIM, PhonePe, GPay with India-specific pattern matching',
              },
              {
                icon: '⚖️',
                title: 'DPDP Act 2023',
                desc: "India's GDPR equivalent. We map findings to reportable incidents under Sections 4, 6, 8, 9, 11, 17",
              },
              {
                icon: '🌐',
                title: 'Hindi & Vernacular',
                desc: 'Risk findings in Hindi, Tamil, Telugu — the only security tool serving 500M+ vernacular internet users',
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
                <div style={{ fontSize: 28, marginBottom: 10 }}>{c.icon}</div>
                <div style={{ fontWeight: 700, color: TEXT, fontSize: 16, marginBottom: 8 }}>
                  {c.title}
                </div>
                <p style={{ color: MUTED, fontSize: 13, margin: 0, lineHeight: 1.6 }}>{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── AnkrShield tab ───────────────────────────────────────────────────────────

const ANKR_FEATURES = [
  {
    icon: '🚫',
    title: 'IOC DNS Blocker',
    desc: "Blocks known malicious domains at the network layer. Syncs from xShield's live threat feed every 6 hours. 2,000+ IOCs.",
  },
  {
    icon: '🔍',
    title: 'App Scope Monitor',
    desc: 'See exactly which permissions each app uses vs. what it actually needs. A flashlight app with READ_SMS? Flagged instantly.',
  },
  {
    icon: '🕵️',
    title: 'Stalkerware Detector',
    desc: "Detects covert surveillance apps by IOC database + disguise patterns. India's most underreported threat — we built this first.",
  },
  {
    icon: '📶',
    title: 'Network Threat Scanner',
    desc: 'Detects evil twin WiFi, ARP spoofing, open networks. Shows per-app connection analysis with surgical block toggles.',
  },
  {
    icon: '📩',
    title: 'SMS Fraud Shield',
    desc: 'Detects UPI fraud, fake bank SMSes, OTP harvesting — 9 Indian fraud types. All analysis on-device. Your SMS never leaves your phone.',
  },
  {
    icon: '⚖️',
    title: 'DPDP Compliance Scanner',
    desc: "Shows which installed apps violate India's Digital Personal Data Protection Act 2023. No other app does this.",
  },
  {
    icon: '🏢',
    title: 'MDM Lite',
    desc: 'QR-based corporate enrollment. IT admins push policy (screen lock, VPN, sideload block) — no MDM server needed. $2/device vs $8 for Intune.',
  },
  {
    icon: '🇮🇳',
    title: 'Hindi · Tamil · Telugu',
    desc: 'Full UI in 4 languages. Risk findings read aloud in Hindi. The only security app built for Bharat.',
  },
];

const QR_PAYLOAD = encodeURIComponent(
  JSON.stringify({
    version: 1,
    server: 'https://xshieldai.com',
    policy: { requireScreenLock: true, minPinLength: 6, blockSideloading: true, enforceVpn: true },
  })
);

function AnkrShieldTab() {
  return (
    <div>
      {/* Hero */}
      <section style={{ background: BG, padding: '80px 24px 64px' }}>
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
            <Badge label="Android · India-first · Privacy-preserving" color={GREEN} />
            <h1
              style={{
                fontSize: 46,
                fontWeight: 900,
                color: TEXT,
                lineHeight: 1.15,
                margin: '16px 0 20px',
              }}
            >
              Security that works
              <br />
              <span style={{ color: GREEN }}>with you</span>,<br />
              not against you.
            </h1>
            <p style={{ color: MUTED, fontSize: 16, lineHeight: 1.8, marginBottom: 28 }}>
              AnkrShield never blocks apps you trust or turns off your internet. It watches for{' '}
              <em style={{ color: TEXT }}>excess behaviour</em> — and surgically stops only that.
            </p>
            <div
              style={{
                background: BG_CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                padding: '14px 18px',
                marginBottom: 28,
              }}
            >
              <div style={{ color: GREEN, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                ✓ The AnkrShield Promise
              </div>
              <ul
                style={{
                  margin: 0,
                  padding: '0 0 0 16px',
                  color: MUTED,
                  fontSize: 13,
                  lineHeight: 2,
                }}
              >
                <li>WhatsApp, GPay, Instagram — work exactly as before</li>
                <li>
                  Only the <em style={{ color: TEXT }}>excess data uploads</em> get blocked
                </li>
                <li>You decide what's "too much" — we just show you</li>
                <li>No DNS on/off toggle — always on, always surgical</li>
              </ul>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <a
                href="/download/ankrshield.apk"
                style={{
                  background: GREEN,
                  color: '#000',
                  padding: '12px 24px',
                  borderRadius: 8,
                  fontWeight: 800,
                  fontSize: 14,
                  textDecoration: 'none',
                }}
              >
                ↓ Download APK (Android)
              </a>
              <a
                href="https://github.com/rocketlang/ankrshield"
                target="_blank"
                rel="noreferrer"
                style={{
                  border: `1px solid ${BORDER}`,
                  color: TEXT,
                  padding: '12px 24px',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 14,
                  textDecoration: 'none',
                }}
              >
                View Source
              </a>
            </div>
          </div>

          {/* Right: How it works */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              {
                emoji: '✅',
                label: 'WhatsApp connects to whatsapp.net',
                sub: 'Expected — no action',
                color: GREEN,
              },
              {
                emoji: '✅',
                label: 'HDFC app reads your SMS for OTP',
                sub: 'Expected for banking — allowed',
                color: GREEN,
              },
              {
                emoji: '⚠️',
                label: 'Flashlight app uploads contacts to Russia',
                sub: 'Excess scope — blocked surgically',
                color: AMBER,
              },
              {
                emoji: '🚫',
                label: 'Fake UPI app queries malware-cdn.ru',
                sub: 'IOC match — blocked instantly',
                color: '#ef4444',
              },
              {
                emoji: '✅',
                label: 'Instagram loads images from cdninstagram.com',
                sub: 'Allowlisted — passes through',
                color: GREEN,
              },
            ].map((row) => (
              <div
                key={row.label}
                style={{
                  background: BG_CARD,
                  border: `1px solid ${row.color}33`,
                  borderRadius: 8,
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <span style={{ fontSize: 20 }}>{row.emoji}</span>
                <div>
                  <div style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>{row.label}</div>
                  <div style={{ color: row.color, fontSize: 12, marginTop: 2 }}>{row.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section style={{ background: BG_ALT, padding: '64px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <SectionHead
            title="8 Shields, One App"
            sub="Built for India — DPDP Act, UPI fraud, vernacular UI. Zero compromise on your app experience."
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 16,
            }}
          >
            {ANKR_FEATURES.map((f) => (
              <div
                key={f.title}
                style={{
                  background: BG_CARD,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10,
                  padding: '20px 22px',
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 10 }}>{f.icon}</div>
                <div style={{ fontWeight: 700, color: TEXT, fontSize: 15, marginBottom: 6 }}>
                  {f.title}
                </div>
                <p style={{ color: MUTED, fontSize: 13, margin: 0, lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Surgical inhibition explainer */}
      <section style={{ background: BG, padding: '64px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <SectionHead
            title="Surgical, Not Sledgehammer"
            sub="Most security apps block entire apps or kill your internet. AnkrShield blocks only the specific call that's out of scope."
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div
              style={{
                background: '#1a0a0a',
                border: '1px solid #7f1d1d',
                borderRadius: 10,
                padding: 24,
              }}
            >
              <div style={{ color: '#ef4444', fontWeight: 700, marginBottom: 12 }}>
                ❌ Old approach (other apps)
              </div>
              <ul
                style={{
                  color: MUTED,
                  fontSize: 13,
                  lineHeight: 2,
                  margin: 0,
                  padding: '0 0 0 16px',
                }}
              >
                <li>Toggle DNS on/off</li>
                <li>Block entire app categories</li>
                <li>Whitelist/blacklist whole domains</li>
                <li>VPN always slowing you down</li>
                <li>Breaks apps you need</li>
              </ul>
            </div>
            <div
              style={{
                background: '#051a0f',
                border: `1px solid ${GREEN}44`,
                borderRadius: 10,
                padding: 24,
              }}
            >
              <div style={{ color: GREEN, fontWeight: 700, marginBottom: 12 }}>
                ✓ AnkrShield approach
              </div>
              <ul
                style={{
                  color: MUTED,
                  fontSize: 13,
                  lineHeight: 2,
                  margin: 0,
                  padding: '0 0 0 16px',
                }}
              >
                <li>Always on — zero manual toggling</li>
                <li>Per-connection surgical block</li>
                <li>App allowlist from user's installs</li>
                <li>Only IOC + excess scope blocked</li>
                <li>Every app you use works normally</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Corporate MDM + QR */}
      <section style={{ background: BG_ALT, padding: '64px 24px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <SectionHead
            title="Corporate Deployment in 60 Seconds"
            sub="IT admin generates a policy QR. Employee scans it. Done. No MDM server. No per-device agent."
          />
          <div
            style={{
              display: 'flex',
              gap: 32,
              alignItems: 'center',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                background: BG_CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 12,
                padding: 24,
              }}
            >
              <div
                style={{
                  background: '#fff',
                  padding: 10,
                  borderRadius: 8,
                  display: 'inline-block',
                }}
              >
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${QR_PAYLOAD}`}
                  alt="AnkrShield MDM Enrollment QR"
                  width={160}
                  height={160}
                  style={{ display: 'block' }}
                />
              </div>
              <div style={{ color: MUTED, fontSize: 12, marginTop: 10 }}>
                Scan with AnkrShield app to enroll
              </div>
              <div style={{ color: MUTED, fontSize: 11, marginTop: 4 }}>
                Demo policy — customize in MDM portal
              </div>
            </div>
            <div style={{ textAlign: 'left', maxWidth: 340 }}>
              <div style={{ fontWeight: 700, color: TEXT, fontSize: 18, marginBottom: 12 }}>
                Default Policy Includes:
              </div>
              <ul
                style={{
                  color: MUTED,
                  fontSize: 14,
                  lineHeight: 2,
                  margin: 0,
                  padding: '0 0 0 16px',
                }}
              >
                <li>
                  <span style={{ color: GREEN }}>✓</span> Screen lock required (min 6-digit PIN)
                </li>
                <li>
                  <span style={{ color: GREEN }}>✓</span> Sideloading blocked
                </li>
                <li>
                  <span style={{ color: GREEN }}>✓</span> VPN / DNS filter enforced
                </li>
                <li>
                  <span style={{ color: GREEN }}>✓</span> Live IOC blocklist sync
                </li>
              </ul>
              <div style={{ marginTop: 20 }}>
                <Link
                  to="/mdm"
                  style={{
                    background: VIOLET,
                    color: '#fff',
                    padding: '10px 20px',
                    borderRadius: 7,
                    fontWeight: 700,
                    fontSize: 13,
                    textDecoration: 'none',
                  }}
                >
                  Open MDM Admin Portal →
                </Link>
              </div>
              <div style={{ color: MUTED, fontSize: 12, marginTop: 10 }}>
                Included in STARTER+ · No extra charge per device
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* vs competitors */}
      <section style={{ background: BG, padding: '64px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <SectionHead
            title="Why AnkrShield"
            sub="The only mobile security app built for India's real threat environment"
          />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Feature', 'AnkrShield', 'Lookout', 'Zimperium', 'Any Indian app'].map(
                    (h, i) => (
                      <th
                        key={h}
                        style={{
                          padding: '10px 16px',
                          borderBottom: `1px solid ${BORDER}`,
                          color: i === 1 ? VIOLET_L : MUTED,
                          textAlign: i === 0 ? 'left' : 'center',
                          fontWeight: i === 1 ? 800 : 600,
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {[
                  ['UPI fraud detection', '✅', '❌', '❌', '❌'],
                  ['DPDP Act 2023 scanner', '✅', '❌', '❌', '❌'],
                  ['Hindi / Tamil UI', '✅', '❌', '❌', 'Partial'],
                  ['Consent-aware (no DNS toggle)', '✅', '❌', '❌', '❌'],
                  ['Stalkerware detection', '✅', '✅', 'Partial', '❌'],
                  ['MDM lite (QR enrollment)', '✅', '❌ (enterprise only)', '❌', '❌'],
                  ['Open source', '✅ Apache 2.0', '❌', '❌', '❌'],
                  ['Free tier', '✅', '❌', '❌', 'Some'],
                ].map(([feat, ...vals]) => (
                  <tr key={feat} style={{ borderBottom: `1px solid ${BORDER}22` }}>
                    <td style={{ padding: '10px 16px', color: TEXT }}>{feat}</td>
                    {vals.map((v, i) => (
                      <td
                        key={i}
                        style={{
                          padding: '10px 16px',
                          textAlign: 'center',
                          color: v.startsWith('✅')
                            ? GREEN
                            : v.startsWith('❌')
                              ? '#ef444466'
                              : AMBER,
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
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer
      style={{
        background: BG_CARD,
        borderTop: `1px solid ${BORDER}`,
        padding: '32px 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ color: MUTED, fontSize: 13, marginBottom: 12 }}>
        xShield + AnkrShield by <strong style={{ color: TEXT }}>ANKR Labs</strong> · Gurgaon, India
        · <span style={{ color: MUTED }}>Powerp Box IT Solutions Pvt Ltd</span>
      </div>
      <div
        style={{
          display: 'flex',
          gap: 20,
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        {[
          ['GitHub', 'https://github.com/rocketlang/ankrshield'],
          ['Docs', '/docs'],
          ['Onboarding', '/onboarding'],
          ['MDM Portal', '/mdm'],
          ['Download APK', '/download/ankrshield.apk'],
        ].map(([label, href]) =>
          href.startsWith('http') ? (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              style={{ color: MUTED, fontSize: 12, textDecoration: 'none' }}
            >
              {label}
            </a>
          ) : (
            <Link
              key={label}
              to={href}
              style={{ color: MUTED, fontSize: 12, textDecoration: 'none' }}
            >
              {label}
            </Link>
          )
        )}
      </div>
      <div style={{ color: MUTED + '88', fontSize: 11 }}>
        © 2026 Powerp Box IT Solutions Pvt Ltd · Apache 2.0 Open Source
      </div>
    </footer>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function Landing() {
  const [tab, setTab] = useState<string>('xShield API');

  return (
    <div
      style={{
        background: BG,
        minHeight: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: TEXT,
      }}
    >
      <Nav tab={tab} setTab={setTab} />
      {tab === 'xShield API' ? <XShieldTab /> : <AnkrShieldTab />}
      <Footer />
    </div>
  );
}
