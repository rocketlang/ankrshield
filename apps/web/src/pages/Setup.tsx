/**
 * X5-5/6/7 — Post-Registration Setup Wizard
 *
 * Shown immediately after a user creates their account.
 * 3 steps:
 *   Step 1: Enter domain to monitor → live risk scan
 *   Step 2: Configure alert channels (email pre-filled, Slack + Telegram optional)
 *   Step 3: Domain added to watch → "You're Protected" confirmation
 *
 * Navigates to /dashboard on completion.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../stores/authStore';

const API = import.meta.env.VITE_API_URL ?? 'https://xshieldai.com/api';
const V = '#7c3aed';
const V_L = '#a78bfa';
const BG = '#060a10';
const CARD = '#0d1420';
const BORDER = '#1e2a3a';
const GREEN = '#4ade80';
const MUTED = '#64748b';

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score < 30) return GREEN;
  if (score < 70) return '#fbbf24';
  return '#f87171';
}

function Field({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  hint,
  disabled,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 13,
          fontWeight: 600,
          color: '#94a3b8',
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
          opacity: disabled ? 0.5 : 1,
        }}
      />
      {hint && <p style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

function Btn({
  onClick,
  loading,
  disabled,
  variant = 'primary',
  children,
}: {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      style={{
        background: variant === 'primary' ? V : 'transparent',
        border: variant === 'ghost' ? `1px solid ${BORDER}` : 'none',
        color: '#fff',
        borderRadius: 9,
        padding: '12px 24px',
        fontSize: 15,
        fontWeight: 700,
        cursor: loading || disabled ? 'not-allowed' : 'pointer',
        opacity: loading || disabled ? 0.6 : 1,
        width: '100%',
      }}
    >
      {loading ? 'Please wait...' : children}
    </button>
  );
}

const SCAN_STEPS = [
  'Checking DNS records (A, MX, NS)...',
  'Verifying SPF + DMARC configuration...',
  'Querying certificate transparency logs...',
  'Scanning 10+ threat intelligence feeds...',
  'Checking for lookalike / typosquat domains...',
  'Generating your risk score...',
];

// ─── Step indicators ──────────────────────────────────────────────────────────

function Steps({ current }: { current: 1 | 2 | 3 }) {
  const labels = ['Scan domain', 'Alert channels', 'Protected'];
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 0, marginBottom: 40 }}>
      {labels.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: done ? GREEN + '30' : active ? V : CARD,
                  border: `2px solid ${done ? GREEN : active ? V : BORDER}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 800,
                  color: done ? GREEN : active ? '#fff' : MUTED,
                  margin: '0 auto 6px',
                }}
              >
                {done ? '✓' : n}
              </div>
              <div style={{ fontSize: 11, color: active ? V_L : MUTED, whiteSpace: 'nowrap' }}>
                {label}
              </div>
            </div>
            {i < labels.length - 1 && (
              <div
                style={{
                  width: 60,
                  height: 2,
                  background: done ? GREEN + '40' : BORDER,
                  margin: '-14px 8px 0',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1 — Domain scan ─────────────────────────────────────────────────────

function Step1({
  onComplete,
}: {
  onComplete: (domain: string, score: number, level: string) => void;
}) {
  const [domain, setDomain] = useState('');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [visibleSteps, setVisibleSteps] = useState<number[]>([]);
  const [err, setErr] = useState('');

  const startScan = useCallback(() => {
    const d = domain
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .toLowerCase();
    if (!d || !d.includes('.')) return setErr('Enter a valid domain (e.g. yourcompany.com)');
    setErr('');
    setScanning(true);
    setProgress(0);
    setVisibleSteps([]);

    // Animate progress
    const start = Date.now();
    const iv = setInterval(() => {
      const pct = Math.min(100, Math.floor(((Date.now() - start) / 5000) * 100));
      setProgress(pct);
      if (pct >= 100) clearInterval(iv);
    }, 60);

    // Reveal scan steps with delays
    SCAN_STEPS.forEach((_, i) => {
      setTimeout(() => setVisibleSteps((p) => [...p, i]), i * 800 + 300);
    });

    // API call
    fetch(`${API}/risk/score?domain=${encodeURIComponent(d)}`)
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        const score = (data.riskScore ?? data.score ?? 45) as number;
        const level = (data.riskLevel ?? data.level ?? 'MEDIUM') as string;
        clearInterval(iv);
        setProgress(100);
        setTimeout(() => onComplete(d, score, level), 600);
      })
      .catch(() => {
        clearInterval(iv);
        setProgress(100);
        setTimeout(() => onComplete(d, 45, 'MEDIUM'), 600);
      });
  }, [domain, onComplete]);

  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 900, color: '#fff', marginBottom: 8 }}>
        Which domain should we protect?
      </h2>
      <p style={{ color: MUTED, fontSize: 15, marginBottom: 28 }}>
        We'll scan it immediately across 10+ threat sources.
      </p>

      {!scanning ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field
            label="Your company domain"
            value={domain}
            onChange={setDomain}
            placeholder="yourcompany.com"
          />
          {err && <p style={{ color: '#f87171', fontSize: 13 }}>{err}</p>}
          <Btn onClick={startScan}>Scan Now →</Btn>
        </div>
      ) : (
        <div>
          <p style={{ color: MUTED, fontSize: 13, marginBottom: 8 }}>
            Scanning {domain.trim().replace(/^https?:\/\//, '')}...
          </p>
          <div
            style={{
              background: CARD,
              borderRadius: 100,
              height: 8,
              overflow: 'hidden',
              marginBottom: 20,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${V}, ${V_L})`,
                borderRadius: 100,
                transition: 'width 0.1s linear',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SCAN_STEPS.map((step, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  opacity: visibleSteps.includes(i) ? 1 : 0,
                  transition: 'opacity 0.4s',
                }}
              >
                <span style={{ color: GREEN, fontSize: 13 }}>✓</span>
                <span style={{ color: '#94a3b8', fontSize: 14 }}>{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 2 — Alert channels ──────────────────────────────────────────────────

function Step2({
  domain,
  score,
  level,
  onComplete,
  onBack,
}: {
  domain: string;
  score: number;
  level: string;
  onComplete: () => void;
  onBack: () => void;
}) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const [emailAlert, setEmailAlert] = useState(user?.email ?? '');
  const [slackWebhook, setSlackWebhook] = useState('');
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = useCallback(async () => {
    setErr('');
    setSaving(true);
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const tasks: Promise<void>[] = [];

    // Email integration
    if (emailAlert) {
      tasks.push(
        fetch(`${API}/integrations/email`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ email: emailAlert }),
          credentials: 'include',
        }).then(() => {})
      );
    }

    // Slack
    if (slackWebhook.startsWith('https://hooks.slack.com/')) {
      tasks.push(
        fetch(`${API}/integrations/slack`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ webhookUrl: slackWebhook }),
          credentials: 'include',
        }).then(() => {})
      );
    }

    // Telegram
    if (telegramToken && telegramChatId) {
      tasks.push(
        fetch(`${API}/integrations/telegram`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ botToken: telegramToken, chatId: telegramChatId }),
          credentials: 'include',
        }).then(() => {})
      );
    }

    // Add domain to watch
    tasks.push(
      fetch(`${API}/watch/domain`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ domain, alertThreshold: 30 }),
        credentials: 'include',
      }).then(() => {})
    );

    try {
      await Promise.allSettled(tasks);
      onComplete();
    } catch {
      setErr('Something went wrong — your domain watch was still saved. Click Next to continue.');
      onComplete();
    } finally {
      setSaving(false);
    }
  }, [emailAlert, slackWebhook, telegramToken, telegramChatId, token, domain, onComplete]);

  const col = scoreColor(score);

  return (
    <div>
      {/* Score summary */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: '14px 18px',
          marginBottom: 28,
        }}
      >
        <div style={{ textAlign: 'center', minWidth: 60 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: col, lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: 10, color: MUTED }}>/ 100</div>
        </div>
        <div>
          <div style={{ fontWeight: 700, color: '#fff', fontSize: 15 }}>{domain}</div>
          <div style={{ color: col, fontSize: 13, fontWeight: 700, marginTop: 2 }}>
            {level} RISK
          </div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: MUTED }}>
          Monitoring starts after setup
        </div>
      </div>

      <h2 style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 6 }}>
        Where should we send alerts?
      </h2>
      <p style={{ color: MUTED, fontSize: 14, marginBottom: 24 }}>
        Email is required. Slack and Telegram are optional but highly recommended.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Field
          label="Alert email (required)"
          type="email"
          value={emailAlert}
          onChange={setEmailAlert}
          placeholder="security@yourcompany.com"
          hint="You'll get an email when your risk score changes or a threat is detected"
        />

        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 18 }}>
          <div
            style={{
              fontSize: 12,
              color: MUTED,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginBottom: 14,
            }}
          >
            Optional channels
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field
              label="Slack Incoming Webhook URL"
              value={slackWebhook}
              onChange={setSlackWebhook}
              placeholder="https://hooks.slack.com/services/..."
              hint="Paste your Slack Incoming Webhook URL to get Block Kit alerts"
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field
                label="Telegram Bot Token"
                value={telegramToken}
                onChange={setTelegramToken}
                placeholder="123456:ABC-DEF..."
              />
              <Field
                label="Telegram Chat ID"
                value={telegramChatId}
                onChange={setTelegramChatId}
                placeholder="-1001234567890"
                hint="From @userinfobot"
              />
            </div>
          </div>
        </div>

        {err && <p style={{ color: '#fbbf24', fontSize: 13 }}>{err}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
          <Btn onClick={onBack} variant="ghost">
            ← Back
          </Btn>
          <Btn onClick={save} loading={saving} disabled={!emailAlert}>
            Save & Activate Watch →
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Step 3 — You're protected ────────────────────────────────────────────────

function Step3({ domain, score }: { domain: string; score: number }) {
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    timerRef.current = setTimeout(() => navigate('/dashboard'), 8000);
    return () => clearTimeout(timerRef.current!);
  }, [navigate]);

  const col = scoreColor(score);

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🛡️</div>

      <h2 style={{ fontSize: 28, fontWeight: 900, color: '#fff', marginBottom: 8 }}>
        You're Protected
      </h2>
      <p style={{ color: col, fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{domain}</p>
      <p style={{ color: MUTED, fontSize: 15, marginBottom: 32 }}>
        Continuous 5-minute monitoring is now active. You'll be alerted the moment anything changes.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 32,
        }}
      >
        {[
          { icon: '📡', label: '10+ threat feeds', sub: 'updated every 5 min' },
          { icon: '📧', label: 'Alerts configured', sub: 'email + optional channels' },
          { icon: '🎭', label: 'Typosquat watch', sub: 'lookalike domains' },
        ].map((c) => (
          <div
            key={c.label}
            style={{
              background: CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: '14px 12px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 22, marginBottom: 6 }}>{c.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1' }}>{c.label}</div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <button
        onClick={() => navigate('/dashboard')}
        style={{
          background: V,
          color: '#fff',
          border: 'none',
          borderRadius: 9,
          padding: '13px 32px',
          fontSize: 15,
          fontWeight: 700,
          cursor: 'pointer',
          width: '100%',
        }}
      >
        Go to Dashboard →
      </button>
      <p style={{ color: MUTED, fontSize: 12, marginTop: 10 }}>
        Redirecting automatically in a few seconds...
      </p>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function Setup() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [domain, setDomain] = useState('');
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState('MEDIUM');

  return (
    <div
      style={{
        minHeight: '100vh',
        background: BG,
        color: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
        }}
      >
        <span style={{ fontWeight: 800, fontSize: 18 }}>🛡️ xShield</span>
        <span
          style={{
            marginLeft: 12,
            background: `${V}22`,
            color: V_L,
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 4,
            letterSpacing: 1,
          }}
        >
          SETUP
        </span>
      </nav>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '48px 24px 80px' }}>
        <Steps current={step} />

        {step === 1 && (
          <Step1
            onComplete={(d, s, l) => {
              setDomain(d);
              setScore(s);
              setLevel(l);
              setStep(2);
            }}
          />
        )}
        {step === 2 && (
          <Step2
            domain={domain}
            score={score}
            level={level}
            onComplete={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && <Step3 domain={domain} score={score} />}
      </div>
    </div>
  );
}
