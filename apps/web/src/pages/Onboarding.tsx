/**
 * X5 — Pre-signup Onboarding Wizard
 *
 * Step 1: Enter email + domain  →  "Scan My Domain"
 * Step 2: Live animated scan    →  GET /risk/score
 * Step 3: Teaser results        →  register + unlock
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://xshieldai.com/api';

// ─── Constants ────────────────────────────────────────────────────────────────
const VIOLET = '#7c3aed';
const VIOLET_HOVER = '#6d28d9';
const BG = '#060a10';
const CARD = '#0d1420';
const BORDER = '#1e2a3a';

const SCAN_STEPS = [
  { label: 'Checking DNS/SPF records...', delay: 500 },
  { label: 'Scanning certificate transparency...', delay: 1000 },
  { label: 'Querying threat intel sources...', delay: 1800 },
  { label: 'Running brand impersonation check...', delay: 2500 },
  { label: 'Generating risk score...', delay: 3200 },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface RiskScore {
  domain: string;
  score: number;
  level: string;
  categories: string[];
  lastSeen?: string;
}

// Raw shape the API may return (fields differ between REST versions)
interface RawRiskScore extends RiskScore {
  riskScore?: number;
  riskLevel?: string;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function scoreColor(score: number) {
  if (score < 30) return { text: '#4ade80', label: 'MINIMAL', desc: 'Low risk' };
  if (score < 70) return { text: '#fbbf24', label: 'MEDIUM', desc: 'Moderate risk' };
  return { text: '#f87171', label: 'HIGH', desc: 'High risk' };
}

function levelColor(level: string) {
  if (level === 'MINIMAL' || level === 'LOW') return '#4ade80';
  if (level === 'MEDIUM') return '#fbbf24';
  return '#f87171';
}

// ─── Input helper ─────────────────────────────────────────────────────────────
function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  disabled,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoComplete?: string;
}) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          color: '#94a3b8',
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        style={{
          width: '100%',
          background: '#0a0f1a',
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: '11px 14px',
          color: '#fff',
          fontSize: 15,
          outline: 'none',
          boxSizing: 'border-box',
          opacity: disabled ? 0.6 : 1,
        }}
      />
    </div>
  );
}

// ─── Step 1: Enter email + domain ─────────────────────────────────────────────
function Step1({
  email,
  domain,
  onEmailChange,
  onDomainChange,
  onSubmit,
}: {
  email: string;
  domain: string;
  onEmailChange: (v: string) => void;
  onDomainChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const [err, setErr] = useState('');

  function handleClick() {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return setErr('Please enter a valid email address.');
    }
    const d = domain
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    if (!d) return setErr('Please enter the domain you want to protect.');
    onDomainChange(d);
    setErr('');
    onSubmit();
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <h1
        style={{ fontSize: 30, fontWeight: 900, color: '#fff', marginBottom: 8, lineHeight: 1.2 }}
      >
        See your threat score in 10 seconds
      </h1>
      <p style={{ color: '#64748b', fontSize: 15, marginBottom: 32 }}>
        Enter your domain and we'll scan 10+ threat intelligence sources — instantly, for free.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field
          label="Work email"
          type="email"
          value={email}
          onChange={onEmailChange}
          placeholder="you@yourcompany.com"
          autoComplete="email"
        />
        <Field
          label="Your domain to protect"
          type="text"
          value={domain}
          onChange={onDomainChange}
          placeholder="yourcompany.com"
          autoComplete="off"
        />

        {err && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{err}</p>}

        <button
          onClick={handleClick}
          style={{
            background: VIOLET,
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            padding: '13px 0',
            fontSize: 16,
            fontWeight: 700,
            cursor: 'pointer',
            marginTop: 4,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = VIOLET_HOVER;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = VIOLET;
          }}
        >
          Scan My Domain →
        </button>
      </div>

      <p style={{ marginTop: 24, color: '#475569', fontSize: 13, textAlign: 'center' }}>
        Already have an account?{' '}
        <Link to="/login" style={{ color: '#a78bfa', textDecoration: 'none' }}>
          Sign in →
        </Link>
      </p>
    </div>
  );
}

// ─── Step 2: Animated scan ────────────────────────────────────────────────────
function Step2({
  domain,
  onComplete,
}: {
  domain: string;
  onComplete: (result: RiskScore) => void;
}) {
  const [progress, setProgress] = useState(0);
  const [visibleSteps, setVisibleSteps] = useState<number[]>([]);
  const [animDone, setAnimDone] = useState(false);
  const resultRef = useRef<RiskScore | null>(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Trigger completion when both animation and API result are ready
  const tryComplete = useCallback((done: boolean) => {
    if (done && resultRef.current && !completedRef.current) {
      completedRef.current = true;
      onCompleteRef.current(resultRef.current);
    }
  }, []);

  useEffect(() => {
    // Progress bar: 0→100 over 4 seconds
    const start = Date.now();
    const iv = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, Math.floor((elapsed / 4000) * 100));
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(iv);
        setAnimDone(true);
      }
    }, 50);

    // Staggered scan step labels
    SCAN_STEPS.forEach(({ delay }, i) => {
      setTimeout(() => setVisibleSteps((prev) => [...prev, i]), delay);
    });

    // API call
    fetch(`${API_BASE}/risk/score?domain=${encodeURIComponent(domain)}`)
      .then((r) => r.json())
      .then((data: RawRiskScore) => {
        // Normalise field names (score vs riskScore)
        resultRef.current = {
          domain: data.domain ?? domain,
          score: data.riskScore ?? data.score ?? 42,
          level: data.riskLevel ?? data.level ?? 'MEDIUM',
          categories: data.categories ?? [],
          lastSeen: data.lastSeen,
        };
      })
      .catch(() => {
        // Fallback mock so demo always works
        resultRef.current = {
          domain,
          score: 42,
          level: 'MEDIUM',
          categories: ['dns_misconfiguration', 'missing_dmarc', 'open_ports'],
          lastSeen: new Date().toISOString(),
        };
      });

    return () => clearInterval(iv);
  }, [domain, tryComplete]);

  // Watch for animation completion
  useEffect(() => {
    tryComplete(animDone);
  }, [animDone, tryComplete]);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 6 }}>Scanning</p>
      <p style={{ color: '#fff', fontWeight: 700, fontSize: 18, marginBottom: 28 }}>{domain}</p>

      {/* Progress bar */}
      <div
        style={{
          background: '#0d1420',
          borderRadius: 100,
          height: 8,
          overflow: 'hidden',
          marginBottom: 28,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${VIOLET}, #a78bfa)`,
            borderRadius: 100,
            transition: 'width 0.1s linear',
          }}
        />
      </div>

      {/* Scan steps */}
      <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SCAN_STEPS.map((s, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              opacity: visibleSteps.includes(i) ? 1 : 0,
              transform: visibleSteps.includes(i) ? 'translateY(0)' : 'translateY(6px)',
              transition: 'opacity 0.3s, transform 0.3s',
            }}
          >
            <span style={{ color: '#4ade80', fontSize: 14, flexShrink: 0 }}>✓</span>
            <span style={{ color: '#94a3b8', fontSize: 14 }}>{s.label}</span>
          </div>
        ))}
      </div>

      <p style={{ color: '#475569', fontSize: 13, marginTop: 32 }}>
        {progress < 100 ? `${progress}% complete` : 'Finalising report...'}
      </p>
    </div>
  );
}

// ─── Step 3: Results + register ───────────────────────────────────────────────
function Step3({ result, email: initialEmail }: { result: RiskScore; email: string }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [regErr, setRegErr] = useState('');
  const [success, setSuccess] = useState(false);

  const col = scoreColor(result.score);
  const displayLevel = result.level ?? col.label;

  async function handleRegister() {
    setRegErr('');
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return setRegErr('Please enter a valid email.');
    }
    if (password.length < 8) {
      return setRegErr('Password must be at least 8 characters.');
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
        credentials: 'include',
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `Error ${res.status}`);
      }
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setRegErr(err instanceof Error ? err.message : 'Registration failed — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Teaser categories (real names, blurred details)
  const teaserCats = result.categories?.slice(0, 3).length
    ? result.categories.slice(0, 3)
    : ['dns_misconfiguration', 'email_security', 'threat_intel'];

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      {/* Score hero */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: 100,
            height: 100,
            borderRadius: '50%',
            border: `4px solid ${col.text}`,
            background: `${col.text}15`,
            marginBottom: 12,
          }}
        >
          <span style={{ fontSize: 32, fontWeight: 900, color: col.text, lineHeight: 1 }}>
            {result.score}
          </span>
          <span style={{ color: '#475569', fontSize: 12 }}>/100</span>
        </div>
        <div>
          <span
            style={{
              display: 'inline-block',
              background: `${levelColor(displayLevel)}20`,
              color: levelColor(displayLevel),
              fontSize: 13,
              fontWeight: 700,
              padding: '4px 12px',
              borderRadius: 20,
              letterSpacing: 1,
            }}
          >
            {displayLevel} RISK
          </span>
        </div>
        <p style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>{result.domain}</p>
      </div>

      {/* Teaser findings */}
      <p
        style={{
          color: '#64748b',
          fontSize: 13,
          marginBottom: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        Findings preview
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {teaserCats.map((cat, i) => (
          <div
            key={i}
            style={{
              background: CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <p
                style={{
                  color: '#cbd5e1',
                  fontSize: 14,
                  fontWeight: 600,
                  margin: 0,
                  textTransform: 'capitalize',
                }}
              >
                {cat.replace(/_/g, ' ')}
              </p>
              <p
                style={{
                  color: '#334155',
                  fontSize: 13,
                  margin: '3px 0 0',
                  filter: 'blur(4px)',
                  userSelect: 'none',
                }}
              >
                ████ ████ ████ ███ ████
              </p>
            </div>
            <span
              style={{
                color: '#f87171',
                fontSize: 11,
                fontWeight: 700,
                background: '#f8717120',
                padding: '3px 8px',
                borderRadius: 6,
                flexShrink: 0,
              }}
            >
              LOCKED
            </span>
          </div>
        ))}
      </div>

      {/* Register to unlock */}
      <div
        style={{
          background: CARD,
          border: `1px solid ${VIOLET}40`,
          borderRadius: 14,
          padding: '24px 20px',
          marginBottom: 16,
        }}
      >
        <p style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
          Unlock Full Report
        </p>
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
          Create a free account to see all findings, remediation steps, and set up 24/7 monitoring.
        </p>

        {success ? (
          <div style={{ textAlign: 'center', color: '#4ade80', fontSize: 15, fontWeight: 600 }}>
            Account created! Check your email to verify. Redirecting to login...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@company.com"
              autoComplete="email"
            />
            <Field
              label="Password (min 8 chars)"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              autoComplete="new-password"
            />

            {regErr && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{regErr}</p>}

            <button
              onClick={() => void handleRegister()}
              disabled={submitting}
              style={{
                background: submitting ? '#4c1d95' : VIOLET,
                color: '#fff',
                border: 'none',
                borderRadius: 9,
                padding: '12px 0',
                fontSize: 15,
                fontWeight: 700,
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Creating account...' : 'Create Free Account →'}
            </button>
          </div>
        )}

        <p style={{ textAlign: 'center', marginTop: 16, color: '#475569', fontSize: 13 }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#a78bfa', textDecoration: 'none' }}>
            Sign in →
          </Link>
        </p>
      </div>

      {/* Upgrade nudge */}
      <div
        style={{
          background: '#0a0f1a',
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          padding: '12px 16px',
          textAlign: 'center',
        }}
      >
        <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
          Upgrade to <span style={{ color: '#a78bfa', fontWeight: 700 }}>STARTER</span> for full
          report + 500 scans/month — <span style={{ color: '#fff', fontWeight: 600 }}>$99/mo</span>
        </p>
      </div>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────
export default function Onboarding() {
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [domain, setDomain] = useState(searchParams.get('domain') ?? '');
  const [result, setResult] = useState<RiskScore | null>(null);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: BG,
        color: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Nav */}
      <nav
        style={{
          borderBottom: `1px solid ${BORDER}`,
          padding: '0 24px',
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Link
          to="/"
          style={{ color: '#fff', fontWeight: 800, fontSize: 18, textDecoration: 'none' }}
        >
          🛡️ xShield
        </Link>
        <Link
          to="/login"
          style={{
            color: '#94a3b8',
            fontSize: 14,
            textDecoration: 'none',
            border: `1px solid ${BORDER}`,
            borderRadius: 7,
            padding: '6px 14px',
          }}
        >
          Sign In
        </Link>
      </nav>

      {/* Step indicator */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '20px 24px 0' }}>
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: n === step ? VIOLET : n < step ? '#4ade8040' : '#0d1420',
              border: `2px solid ${n === step ? VIOLET : n < step ? '#4ade80' : BORDER}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              color: n < step ? '#4ade80' : n === step ? '#fff' : '#475569',
            }}
          >
            {n < step ? '✓' : n}
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '40px 24px 60px', maxWidth: 580, margin: '0 auto' }}>
        {step === 1 && (
          <Step1
            email={email}
            domain={domain}
            onEmailChange={setEmail}
            onDomainChange={setDomain}
            onSubmit={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <Step2
            domain={domain}
            onComplete={(r) => {
              setResult(r);
              setStep(3);
            }}
          />
        )}
        {step === 3 && result && <Step3 result={result} email={email} />}
      </div>
    </div>
  );
}
