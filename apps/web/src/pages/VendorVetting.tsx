/**
 * xShieldAI — Vendor App Vetting (corporate face of the App Safety Index)
 * Audience: CISO, procurement, app-review boards. Matches Landing.tsx styling.
 *
 * Honesty (FP-018): a grade is COMPUTE (counted behavior) + QUOTE (cited tracker/IOC rows)
 * or NULL (abstain). We grade cited behavior, never a vibe — and we say "not enough evidence"
 * when that's the truth.
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
const TEXT = '#f1f5f9';
const MUTED = '#64748b';

const STEPS = [
  {
    n: '1',
    title: 'Submit',
    desc: 'A Play Store link, an APK, or a vendor SDK. Internal apps can be graded before they ship — grade-before-birth.',
  },
  {
    n: '2',
    title: 'Grade by cited behavior',
    desc: 'Trackers contacted, scope overreach, permission combos, known IOCs — each a counted event or a cited database row. No heuristic vibe.',
  },
  {
    n: '3',
    title: 'Compute · Quote · Null',
    desc: 'A grade you can defend, or an honest "not enough evidence yet" — never a confident guess. The abstention is a feature.',
  },
  {
    n: '4',
    title: 'Policy gate',
    desc: 'Set the floor: block apps below grade B, or any ungraded app, from your fleet. The gate is the product.',
  },
];

const GRADES = [
  { g: 'A', color: GREEN, label: 'Scope-clean — no known beyond-scope tracking' },
  { g: 'C', color: AMBER, label: 'Aggressive data collection — tameable' },
  { g: 'F', color: '#ef4444', label: 'Stalkerware/APT-grade behavior — block' },
];

export default function VendorVetting() {
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
          <Link to="/fleet" style={{ color: MUTED, fontSize: 13, textDecoration: 'none' }}>
            Fleet Posture
          </Link>
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
            Request access →
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
            THE ENTERPRISE FACE OF THE APP SAFETY INDEX
          </span>
          <h1 style={{ fontSize: 52, fontWeight: 900, lineHeight: 1.1, margin: '20px 0 18px' }}>
            Grade an app <span style={{ color: VIOLET_L }}>before</span>
            <br />
            it touches your fleet.
          </h1>
          <p
            style={{ color: MUTED, fontSize: 19, lineHeight: 1.7, maxWidth: 640, margin: '0 auto' }}
          >
            Every app your people install is a data-protection decision. Vet it against cited
            behavior — trackers, scope, IOCs — and gate what fails. Cited, not guessed.
          </p>
        </div>
      </section>

      {/* Grades strip */}
      <section style={{ padding: '0 24px 8px' }}>
        <div
          style={{
            maxWidth: 900,
            margin: '0 auto',
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {GRADES.map((x) => (
            <div
              key={x.g}
              style={{
                background: BG_CARD,
                border: `1px solid ${x.color}55`,
                borderRadius: 10,
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flex: '1 1 260px',
              }}
            >
              <span style={{ fontSize: 30, fontWeight: 900, color: x.color }}>{x.g}</span>
              <span style={{ color: MUTED, fontSize: 13, lineHeight: 1.5 }}>{x.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Steps */}
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
          {STEPS.map((s) => (
            <div
              key={s.n}
              style={{
                background: BG_CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
                padding: '22px 24px',
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: VIOLET + '22',
                  color: VIOLET_L,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 12,
                }}
              >
                {s.n}
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{s.title}</div>
              <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.65, margin: 0 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Dogfood honesty */}
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
            ✅ We grade ourselves too.
          </div>
          <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.7, margin: 0 }}>
            Every ANKR app must pass its own grade. Our own education app, study8x, teaches millions
            using a pseudonymous student ID — never a child's name or data — so it grades{' '}
            <strong style={{ color: TEXT }}>A, scope-clean</strong>. We only vet others because our
            own hands are clean.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '32px 24px 96px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 30, fontWeight: 800, marginBottom: 14 }}>
          Stop approving apps on a vibe.
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
          Request access →
        </Link>
      </section>
    </div>
  );
}
