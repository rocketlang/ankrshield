/**
 * xShield AI — Landing Page
 * xshieldai.com
 */

import { Link } from 'react-router-dom';

// ─── Style constants ────────────────────────────────────────────────────────
const BG_MAIN = '#060a10';
const BG_ALT = '#080c14';
const VIOLET = '#7c3aed';
const VIOLET_HOVER = '#6d28d9';
const VIOLET_LIGHT = '#a78bfa';

// ─── Nav ─────────────────────────────────────────────────────────────────────
function Nav() {
  return (
    <nav
      style={{
        background: BG_MAIN,
        borderBottom: '1px solid #1e2a3a',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 60,
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 20, color: '#fff', letterSpacing: '-0.5px' }}>
          🛡️ xShield
        </span>
        <Link
          to="/login"
          style={{
            background: 'transparent',
            border: `1px solid #334155`,
            color: '#cbd5e1',
            borderRadius: 8,
            padding: '8px 18px',
            fontSize: 14,
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          Sign In
        </Link>
      </div>
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section style={{ background: BG_MAIN, padding: '80px 24px 72px', textAlign: 'center' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1
          style={{
            fontSize: 'clamp(32px, 5vw, 56px)',
            fontWeight: 900,
            color: '#fff',
            lineHeight: 1.15,
            marginBottom: 20,
            letterSpacing: '-1px',
          }}
        >
          Threat Intelligence for the Real World
        </h1>
        <p style={{ fontSize: 18, color: '#94a3b8', marginBottom: 36, lineHeight: 1.7 }}>
          Domain risk API · Brand protection · India-first mobile security · From $99/month
        </p>
        <div
          style={{
            display: 'flex',
            gap: 14,
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginBottom: 40,
          }}
        >
          <Link
            to="/register"
            style={{
              background: VIOLET,
              color: '#fff',
              padding: '14px 28px',
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 700,
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            Start Free →
          </Link>
          <Link
            to="/docs"
            style={{
              background: 'transparent',
              border: '1px solid #334155',
              color: '#cbd5e1',
              padding: '14px 28px',
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            View Docs
          </Link>
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {['10+ threat sources', 'MITRE ATT&CK mapped', 'Apache 2.0 open source'].map((pill) => (
            <span
              key={pill}
              style={{
                background: '#0f172a',
                border: '1px solid #1e2a3a',
                color: '#94a3b8',
                borderRadius: 20,
                padding: '6px 16px',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {pill}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Product Split ────────────────────────────────────────────────────────────
function ProductCard({
  icon,
  title,
  tagline,
  bullets,
  footer,
}: {
  icon: string;
  title: string;
  tagline: string;
  bullets: string[];
  footer: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: '#0d1420',
        border: '1px solid #1e2a3a',
        borderRadius: 16,
        padding: '36px 32px',
        flex: '1 1 320px',
      }}
    >
      <div style={{ fontSize: 36, marginBottom: 16 }}>{icon}</div>
      <h3 style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{title}</h3>
      <p style={{ color: '#64748b', fontSize: 15, marginBottom: 24 }}>{tagline}</p>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: '0 0 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {bullets.map((b) => (
          <li
            key={b}
            style={{
              color: '#94a3b8',
              fontSize: 15,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <span style={{ color: VIOLET_LIGHT, marginTop: 1, flexShrink: 0 }}>✓</span>
            {b}
          </li>
        ))}
      </ul>
      {footer}
    </div>
  );
}

function ProductSplit() {
  return (
    <section style={{ background: BG_ALT, padding: '72px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <ProductCard
            icon="🛡️"
            title="xShield API"
            tagline="Threat intelligence API for security teams"
            bullets={[
              'Domain risk scoring',
              'Brand impersonation detection',
              'Supply chain scanning',
              'STIX/TAXII 2.1 export',
            ]}
            footer={
              <div
                style={{
                  background: '#0a0f1a',
                  border: '1px solid #1e2a3a',
                  borderRadius: 8,
                  padding: '10px 16px',
                  fontSize: 13,
                  color: '#64748b',
                  fontFamily: 'monospace',
                }}
              >
                FREE → STARTER $99/mo → PRO $499/mo
              </div>
            }
          />
          <ProductCard
            icon="📱"
            title="AnkrShield App"
            tagline="India's privacy-first security app"
            bullets={[
              'DNS blocker powered by live IOC feed',
              'DPDP Act 2023 compliance scanner',
              'OTP fraud detection',
              'Consent-aware — never blocks apps you installed',
            ]}
            footer={
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <a
                  href="/download/ankrshield.apk"
                  style={{
                    background: VIOLET,
                    color: '#fff',
                    padding: '10px 18px',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  Download APK →
                </a>
                <a
                  href="https://github.com/xshieldai/warrior"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: 'transparent',
                    border: '1px solid #334155',
                    color: '#94a3b8',
                    padding: '10px 18px',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  View on GitHub →
                </a>
              </div>
            }
          />
        </div>
      </div>
    </section>
  );
}

// ─── How it Works ─────────────────────────────────────────────────────────────
const HOW_STEPS = [
  { n: '01', title: 'Scan', desc: 'Enter any domain, get a risk score in seconds' },
  { n: '02', title: 'Monitor', desc: 'Watch domains 24/7, get alerts when risk changes' },
  { n: '03', title: 'Block', desc: 'AnkrShield mobile blocks threats before they reach you' },
];

function HowItWorks() {
  return (
    <section style={{ background: BG_MAIN, padding: '72px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h2
          style={{
            color: '#fff',
            fontSize: 32,
            fontWeight: 800,
            textAlign: 'center',
            marginBottom: 48,
          }}
        >
          How it works
        </h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
          {HOW_STEPS.map((s) => (
            <div
              key={s.n}
              style={{
                flex: '1 1 260px',
                maxWidth: 320,
                textAlign: 'center',
                padding: '32px 24px',
                background: '#0d1420',
                border: '1px solid #1e2a3a',
                borderRadius: 14,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: VIOLET_LIGHT,
                  letterSpacing: 2,
                  marginBottom: 12,
                }}
              >
                {s.n}
              </div>
              <h3 style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
                {s.title}
              </h3>
              <p style={{ color: '#64748b', fontSize: 15, lineHeight: 1.6 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── India-first ─────────────────────────────────────────────────────────────
const INDIA_CARDS = [
  {
    title: 'UPI Fraud Detection',
    desc: 'Detects UPI-based phishing, fake payment apps, and social engineering patterns specific to Indian payment rails.',
  },
  {
    title: 'DPDP Act 2023 Compliance',
    desc: "Scans apps for India's Digital Personal Data Protection Act violations before they reach end users.",
  },
  {
    title: 'Hindi & Vernacular UI',
    desc: 'Full interface support for Hindi, Tamil, and Telugu — because security should speak your language.',
  },
];

function IndiaFirst() {
  return (
    <section style={{ background: BG_ALT, padding: '72px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ color: '#fff', fontSize: 32, fontWeight: 800, marginBottom: 16 }}>
          Built for India's Threat Landscape
        </h2>
        <p
          style={{
            color: '#64748b',
            fontSize: 16,
            maxWidth: 620,
            margin: '0 auto 48px',
            lineHeight: 1.7,
          }}
        >
          The only security platform that understands India-specific fraud patterns, regulatory
          requirements, and language preferences
        </p>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
          {INDIA_CARDS.map((c) => (
            <div
              key={c.title}
              style={{
                flex: '1 1 280px',
                maxWidth: 340,
                background: '#0d1420',
                border: '1px solid #1e2a3a',
                borderRadius: 14,
                padding: '28px 24px',
                textAlign: 'left',
              }}
            >
              <h3 style={{ color: '#fff', fontSize: 17, fontWeight: 700, marginBottom: 10 }}>
                {c.title}
              </h3>
              <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.65 }}>{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Self-hosting CTA ────────────────────────────────────────────────────────
function SelfHostCTA() {
  return (
    <section style={{ background: BG_MAIN, padding: '72px 24px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <div
          style={{
            background: '#0a0f1a',
            border: '1px solid #1e2a3a',
            borderRadius: 18,
            padding: '48px 40px',
            textAlign: 'center',
          }}
        >
          <h2 style={{ color: '#fff', fontSize: 28, fontWeight: 800, marginBottom: 12 }}>
            Self-host xShield in 30 seconds
          </h2>
          <div
            style={{
              background: '#060a10',
              border: '1px solid #1e2a3a',
              borderRadius: 10,
              padding: '16px 24px',
              margin: '28px 0',
              textAlign: 'left',
              fontFamily: 'monospace',
              fontSize: 15,
              color: '#a78bfa',
              letterSpacing: 0.3,
            }}
          >
            <span style={{ color: '#475569', userSelect: 'none' }}>$ </span>npx @xshieldai/warrior
            start
          </div>
          <p style={{ color: '#64748b', fontSize: 14, marginBottom: 28 }}>
            Apache 2.0 · No telemetry · Your data stays on your server
          </p>
          <Link
            to="/docs"
            style={{
              background: VIOLET,
              color: '#fff',
              padding: '12px 24px',
              borderRadius: 9,
              fontSize: 15,
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            Read Self-Hosting Docs →
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ─────────────────────────────────────────────────────────────────
type PricingTier = {
  name: string;
  price: string;
  scans: string;
  features: string[];
  cta: string;
  ctaLink: string;
  highlighted: boolean;
};

const TIERS: PricingTier[] = [
  {
    name: 'FREE',
    price: '$0',
    scans: '10 scans/mo',
    features: ['Domain risk API'],
    cta: 'Get API Key',
    ctaLink: '/register',
    highlighted: false,
  },
  {
    name: 'STARTER',
    price: '$99/mo',
    scans: '500 scans/mo',
    features: ['Domain risk API', 'Brand monitor', 'Watch alerts'],
    cta: 'Start Trial →',
    ctaLink: '/register',
    highlighted: true,
  },
  {
    name: 'PRO',
    price: '$499/mo',
    scans: 'Unlimited',
    features: [
      'Domain risk API',
      'Brand monitor',
      'Watch alerts',
      'Supply chain',
      'STIX/TAXII',
      'Team accounts',
    ],
    cta: 'Contact Sales',
    ctaLink: 'mailto:hello@ankrlabs.in',
    highlighted: false,
  },
];

function PricingTable() {
  return (
    <section style={{ background: BG_ALT, padding: '72px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ color: '#fff', fontSize: 32, fontWeight: 800, marginBottom: 12 }}>
          Simple, transparent pricing
        </h2>
        <p style={{ color: '#64748b', marginBottom: 48, fontSize: 16 }}>
          Start free, scale as you grow
        </p>
        <div
          style={{
            display: 'flex',
            gap: 20,
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'flex-start',
          }}
        >
          {TIERS.map((t) => (
            <div
              key={t.name}
              style={{
                flex: '1 1 280px',
                maxWidth: 320,
                background: t.highlighted ? '#13103a' : '#0d1420',
                border: `1px solid ${t.highlighted ? VIOLET : '#1e2a3a'}`,
                borderRadius: 16,
                padding: '36px 28px',
                position: 'relative',
              }}
            >
              {t.highlighted && (
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
                    padding: '4px 12px',
                    borderRadius: 20,
                    letterSpacing: 1,
                  }}
                >
                  MOST POPULAR
                </div>
              )}
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: VIOLET_LIGHT,
                  letterSpacing: 2,
                  marginBottom: 8,
                }}
              >
                {t.name}
              </div>
              <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', marginBottom: 4 }}>
                {t.price}
              </div>
              <div style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>{t.scans}</div>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: '0 0 32px',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 9,
                }}
              >
                {t.features.map((f) => (
                  <li
                    key={f}
                    style={{
                      color: '#94a3b8',
                      fontSize: 14,
                      display: 'flex',
                      gap: 8,
                      alignItems: 'flex-start',
                    }}
                  >
                    <span style={{ color: VIOLET_LIGHT, flexShrink: 0 }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <a
                href={t.ctaLink}
                style={{
                  display: 'block',
                  textAlign: 'center',
                  background: t.highlighted ? VIOLET : 'transparent',
                  border: t.highlighted ? 'none' : '1px solid #334155',
                  color: t.highlighted ? '#fff' : '#94a3b8',
                  padding: '12px',
                  borderRadius: 9,
                  fontSize: 15,
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => {
                  if (t.highlighted)
                    (e.currentTarget as HTMLAnchorElement).style.background = VIOLET_HOVER;
                }}
                onMouseLeave={(e) => {
                  if (t.highlighted)
                    (e.currentTarget as HTMLAnchorElement).style.background = VIOLET;
                }}
              >
                {t.cta}
              </a>
            </div>
          ))}
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
        background: '#04070d',
        borderTop: '1px solid #1e2a3a',
        padding: '40px 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div
          style={{
            marginBottom: 20,
            display: 'flex',
            gap: 24,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <a
            href="https://github.com/xshieldai/warrior"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#64748b', fontSize: 14, textDecoration: 'none' }}
          >
            GitHub
          </a>
          <Link to="/docs" style={{ color: '#64748b', fontSize: 14, textDecoration: 'none' }}>
            Docs
          </Link>
          <Link to="/privacy" style={{ color: '#64748b', fontSize: 14, textDecoration: 'none' }}>
            Privacy
          </Link>
          <Link to="/terms" style={{ color: '#64748b', fontSize: 14, textDecoration: 'none' }}>
            Terms
          </Link>
        </div>
        <div style={{ color: '#475569', fontSize: 14, marginBottom: 8 }}>
          xShield by ANKR Labs · Gurgaon, India
        </div>
        <div style={{ color: '#334155', fontSize: 13 }}>© 2026 Powerp Box IT Solutions Pvt Ltd</div>
      </div>
    </footer>
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────
export default function Landing() {
  return (
    <div
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: BG_MAIN,
        minHeight: '100vh',
        color: '#fff',
      }}
    >
      <Nav />
      <Hero />
      <ProductSplit />
      <HowItWorks />
      <IndiaFirst />
      <SelfHostCTA />
      <PricingTable />
      <Footer />
    </div>
  );
}
