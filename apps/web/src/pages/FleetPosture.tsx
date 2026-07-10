/**
 * xShieldAI — Fleet Privacy Posture (corporate face of AnkrShield's witness)
 * Audience: CISO, DPO, IT/MDM admins. Tone: matches Landing.tsx (dark, inline styles).
 *
 * Honesty (FP-018 / scope-clean law): this describes a capability. It never claims to
 * collect an employee's personal data — AnkrShield witnesses on-device and only the
 * beyond-scope PATTERN aggregates. We embody the privacy we enforce.
 */

import { Link } from 'react-router-dom';

const BG = '#060a10';
const BG_ALT = '#080c14';
const BG_CARD = '#0d1117';
const BORDER = '#1e2a3a';
const VIOLET = '#7c3aed';
const VIOLET_L = '#a78bfa';
const GREEN = '#22c55e';
const TEXT = '#f1f5f9';
const MUTED = '#64748b';

const CARDS = [
  {
    icon: '📱',
    title: 'Witness, per device',
    desc: 'The AnkrShield agent witnesses which app contacted which tracker beyond its required scope — kernel-attributed, cited against the tracker database, on-device. Nothing guessed.',
  },
  {
    icon: '🐾',
    title: 'Tame by policy',
    desc: "Push a policy that blocks an aggressive app's trackers across the whole fleet while the app keeps working. Trackers live on different domains than function — taming doesn't break the app.",
  },
  {
    icon: '🔏',
    title: 'Notarized evidence',
    desc: 'Any finding can be sealed by the Evidence Notary (Ed25519, tamper-evident) into a regulator-grade record — integrity, issuer, and time, independently verifiable.',
  },
  {
    icon: '📊',
    title: 'DPO dashboard',
    desc: 'Beyond-scope exposure across the fleet, ranked. Which vendors, which apps, which policies would close them — a purpose-limitation view a Data Protection Officer can act on.',
  },
];

export default function FleetPosture() {
  return (
    <div
      style={{
        background: BG,
        minHeight: '100vh',
        color: TEXT,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <nav style={{ borderBottom: `1px solid ${BORDER}`, padding: '0 24px' }}>
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            height: 60,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <Link
            to="/"
            style={{ fontWeight: 800, fontSize: 17, color: TEXT, textDecoration: 'none' }}
          >
            🛡️ xShield AI
          </Link>
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
          <div style={{ flex: 1 }} />
          <Link to="/pricing" style={{ color: MUTED, fontSize: 13, textDecoration: 'none' }}>
            Pricing
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
            Book a demo →
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: '80px 24px 56px', textAlign: 'center' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <span
            style={{
              background: GREEN + '18',
              color: GREEN,
              border: `1px solid ${GREEN}44`,
              borderRadius: 4,
              padding: '3px 12px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            THE ENTERPRISE FACE OF ANKRSHIELD
          </span>
          <h1 style={{ fontSize: 52, fontWeight: 900, lineHeight: 1.1, margin: '20px 0 18px' }}>
            See what every managed device
            <br />
            <span style={{ color: VIOLET_L }}>is leaking.</span>
          </h1>
          <p
            style={{ color: MUTED, fontSize: 19, lineHeight: 1.7, maxWidth: 640, margin: '0 auto' }}
          >
            AnkrShield's on-device witness, aggregated across your fleet. Which apps exfiltrate
            beyond their scope — and a one-policy fix that tames them without breaking them.
          </p>
        </div>
      </section>

      {/* Cards */}
      <section style={{ background: BG_ALT, padding: '64px 24px' }}>
        <div
          style={{
            maxWidth: 1000,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16,
          }}
        >
          {CARDS.map((c) => (
            <div
              key={c.title}
              style={{
                background: BG_CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
                padding: '22px 24px',
              }}
            >
              <div style={{ fontSize: 26, marginBottom: 10 }}>{c.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{c.title}</div>
              <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.65, margin: 0 }}>{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Honesty / scope-clean */}
      <section style={{ padding: '64px 24px' }}>
        <div
          style={{
            maxWidth: 760,
            margin: '0 auto',
            background: BG_CARD,
            border: `1px solid ${GREEN}33`,
            borderRadius: 12,
            padding: '28px 32px',
          }}
        >
          <div style={{ color: GREEN, fontWeight: 800, fontSize: 15, marginBottom: 10 }}>
            🤝 We embody the privacy we enforce.
          </div>
          <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.7, margin: 0 }}>
            AnkrShield witnesses <strong style={{ color: TEXT }}>on the device</strong>. Only the
            beyond-scope
            <strong style={{ color: TEXT }}> pattern</strong> aggregates — app → tracker vendor →
            count — never an employee's content, contacts, or location. You get a purpose-limitation
            posture; your people keep their privacy. A privacy-enforcement tool that harvested would
            be a contradiction — so it doesn't.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '32px 24px 96px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 30, fontWeight: 800, marginBottom: 14 }}>
          Bring the witness to your fleet.
        </h2>
        <Link
          to="/onboarding"
          style={{
            background: VIOLET,
            color: '#fff',
            borderRadius: 8,
            padding: '14px 36px',
            fontSize: 16,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Book a demo →
        </Link>
        <p style={{ color: MUTED, fontSize: 13, marginTop: 18 }}>
          Also free for individuals —{' '}
          <a href="https://xshieldai.com/download" style={{ color: GREEN }}>
            AnkrShield on Android
          </a>
          .
        </p>
      </section>
    </div>
  );
}
