/**
 * AnkrShield Personal — Consumer Landing Page
 * Audience: Individual Android users in India, primarily 18-45, urban + semi-urban
 * Tone: warm, direct, relatable, "your friend who knows tech"
 * Hero: WhatsApp account hijacking defense (India's #1 attack)
 */

import { Link } from 'react-router-dom';

const BG = '#060c08';
const BG_ALT = '#080f0a';
const BG_CARD = '#0d150f';
const BORDER = '#1a2e1e';
const GREEN = '#22c55e';
const GREEN_L = '#86efac';
// const _GREEN_D = '#15803d';
const AMBER = '#f59e0b';
const RED = '#ef4444';
const VIOLET = '#7c3aed';
const TEXT = '#f1f5f9';
const MUTED = '#64748b';
const BG_DARK = '#050908';

const Badge = ({ label, color = GREEN }: { label: string; color?: string }) => (
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
    <p style={{ color: MUTED, marginTop: 12, fontSize: 16, maxWidth: 540, margin: '12px auto 0' }}>
      {sub}
    </p>
  </div>
);

// ─── Nav ─────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav
      style={{
        background: BG_DARK,
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
        <span style={{ fontWeight: 800, fontSize: 18, color: TEXT }}>🛡️ AnkrShield</span>
        <span
          style={{
            background: GREEN + '22',
            color: GREEN_L,
            border: `1px solid ${GREEN}44`,
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          PERSONAL
        </span>

        <div style={{ flex: 1 }} />

        {/* Enterprise crosslink */}
        <Link
          to="/"
          style={{
            color: VIOLET,
            fontSize: 12,
            fontWeight: 600,
            textDecoration: 'none',
            border: `1px solid ${VIOLET}33`,
            borderRadius: 6,
            padding: '4px 12px',
          }}
        >
          🏢 Enterprise API →
        </Link>

        <a
          href="/download/ankrshield.apk"
          style={{
            background: GREEN,
            color: '#000',
            borderRadius: 6,
            padding: '6px 18px',
            fontSize: 13,
            fontWeight: 800,
            textDecoration: 'none',
          }}
        >
          ↓ Download Free
        </a>
      </div>
    </nav>
  );
}

// ─── Hero — WhatsApp hijacking is the hook ────────────────────────────────────

function Hero() {
  return (
    <section style={{ background: BG_DARK, padding: '80px 24px 64px' }}>
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 64,
          alignItems: 'center',
        }}
      >
        <div>
          <Badge label="Free · Android · India-first" color={GREEN} />

          <h1
            style={{
              fontSize: 50,
              fontWeight: 900,
              color: TEXT,
              lineHeight: 1.1,
              margin: '18px 0 20px',
            }}
          >
            "My WhatsApp
            <br />
            was hacked."
            <br />
            <span style={{ color: GREEN, fontSize: 40 }}>Not anymore.</span>
          </h1>

          <p style={{ color: MUTED, fontSize: 16, lineHeight: 1.85, marginBottom: 28 }}>
            India's #1 phone attack — someone calls you, tricks you into forwarding a 6-digit code,
            and takes over your WhatsApp. Your contacts get scammed. AnkrShield intercepts the OTP
            before you can make that mistake.
          </p>

          {/* Promise box */}
          <div
            style={{
              background: BG_CARD,
              border: `1px solid ${GREEN}33`,
              borderRadius: 10,
              padding: '16px 20px',
              marginBottom: 28,
            }}
          >
            <div style={{ color: GREEN, fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
              ✓ What AnkrShield guarantees
            </div>
            <ul
              style={{
                margin: 0,
                padding: '0 0 0 16px',
                color: MUTED,
                fontSize: 13,
                lineHeight: 2.1,
              }}
            >
              <li>WhatsApp, GPay, Instagram — work exactly as before</li>
              <li>No VPN toggle, no manual setup — always on</li>
              <li>Your SMS never leaves your phone</li>
              <li>Free forever — no subscription, no account needed</li>
            </ul>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a
              href="/download/ankrshield.apk"
              style={{
                background: GREEN,
                color: '#000',
                padding: '13px 28px',
                borderRadius: 8,
                fontWeight: 800,
                fontSize: 15,
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
                padding: '13px 28px',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 15,
                textDecoration: 'none',
              }}
            >
              View Source
            </a>
          </div>
          <div style={{ color: MUTED, fontSize: 12, marginTop: 12 }}>
            Enable "Install from unknown sources" in Android settings · v1.4.0
          </div>
        </div>

        {/* Right: Live threat simulation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ color: MUTED, fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>
            WHAT ANKRSHIELD DOES IN REAL TIME
          </div>
          {[
            {
              emoji: '✅',
              label: 'WhatsApp connects to whatsapp.net',
              sub: 'Expected — passes through',
              color: GREEN,
            },
            {
              emoji: '✅',
              label: 'HDFC reads your SMS for OTP',
              sub: 'Banking app — allowed',
              color: GREEN,
            },
            {
              emoji: '🚨',
              label: 'FAKE WhatsApp OTP arrived — user NOT re-registering',
              sub: 'Account hijack attempt — CRITICAL alert fired',
              color: RED,
            },
            {
              emoji: '⚠️',
              label: 'Flashlight app uploads contacts to Russia',
              sub: 'Excess scope — surgically blocked',
              color: AMBER,
            },
            {
              emoji: '🚫',
              label: 'Unknown app queries malware-cdn.ru',
              sub: 'IOC match — blocked instantly',
              color: RED,
            },
            {
              emoji: '✅',
              label: 'Instagram loads cdninstagram.com',
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
                padding: '11px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <span style={{ fontSize: 18, minWidth: 24 }}>{row.emoji}</span>
              <div>
                <div style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>{row.label}</div>
                <div style={{ color: row.color, fontSize: 12, marginTop: 2 }}>{row.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── WhatsApp Hijacking Defense (A10-A13) ─────────────────────────────────────

function WhatsAppDefense() {
  return (
    <section style={{ background: BG_ALT, padding: '72px 24px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <Badge label="NEW IN v1.4" color={AMBER} />
          <h2 style={{ fontSize: 34, fontWeight: 800, color: TEXT, margin: '14px 0 12px' }}>
            WhatsApp Account Defence
          </h2>
          <p style={{ color: MUTED, fontSize: 16, maxWidth: 520, margin: '0 auto' }}>
            Four layers of protection against India's most common phone scam
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
          {[
            {
              icon: '🔢',
              badge: 'A10',
              title: 'WhatsApp OTP Guard',
              color: RED,
              desc: 'If a 6-digit WhatsApp OTP arrives and you haven\'t triggered a re-registration, AnkrShield fires a CRITICAL full-screen alert — "Someone is trying to steal your WhatsApp. Do NOT share this code." — and shows the attacker\'s partial number.',
              note: 'One-tap report to cybercrime.gov.in pre-filled',
            },
            {
              icon: '🖥️',
              badge: 'A11',
              title: 'Linked Devices Watchdog',
              color: AMBER,
              desc: 'Checks your WhatsApp linked devices every 15 minutes. The moment an unknown laptop or phone appears — you get notified with the device fingerprint and an option to log it out remotely.',
              note: 'Works even while screen is off',
            },
            {
              icon: '📶',
              badge: 'A12',
              title: 'SIM Swap Detector',
              color: VIOLET,
              desc: 'Monitors your SIM card identity. If your SIM is swapped without your action — a HIGH alert fires immediately, UPI transactions are blocked for 10 minutes, and you see a step-by-step recovery checklist.',
              note: 'Auto-blocks outgoing UPI on swap',
            },
            {
              icon: '🛡️',
              badge: 'A13',
              title: 'Account Guard Dashboard',
              color: GREEN,
              desc: 'One screen showing the session health of WhatsApp, Gmail, Paytm, PhonePe, BHIM, and Instagram — green/amber/red. One-tap "Secure All" opens each app\'s security settings directly.',
              note: 'Synthesizes A10–A12 signals in one view',
            },
          ].map((c) => (
            <div
              key={c.title}
              style={{
                background: BG_CARD,
                border: `1px solid ${c.color}33`,
                borderRadius: 12,
                padding: '24px 26px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <span style={{ fontSize: 26 }}>{c.icon}</span>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, color: TEXT, fontSize: 15 }}>{c.title}</span>
                    <Badge label={c.badge} color={c.color} />
                  </div>
                </div>
              </div>
              <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.75, margin: '0 0 14px' }}>
                {c.desc}
              </p>
              <div
                style={{
                  background: c.color + '11',
                  border: `1px solid ${c.color}22`,
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 12,
                  color: c.color,
                }}
              >
                💡 {c.note}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 14 Protection Tools ──────────────────────────────────────────────────────

const TOOLS = [
  {
    icon: '📩',
    title: 'SMS Fraud Shield',
    desc: '9 Indian fraud types: UPI fake, bank phishing, KYC scam, OTP harvesting, job fraud, loan scam. All on-device — your SMS never leaves your phone.',
  },
  {
    icon: '💸',
    title: 'UPI Guard',
    desc: 'Validates every UPI URI before you pay. Detects fake PSP IDs, cloned UPI handles, and malicious payment deep-links.',
  },
  {
    icon: '🔗',
    title: 'Link Scanner',
    desc: 'Paste or share any URL — risk scored against 5 threat feeds in 2 seconds. Right from the Android share sheet.',
  },
  {
    icon: '🕵️',
    title: 'Stalkerware Detector',
    desc: "Detects covert spy apps by IOC database and disguise patterns (fake cleaner, fake flashlight). India's most underreported threat.",
  },
  {
    icon: '📶',
    title: 'Network Threat Monitor',
    desc: 'Detects evil twin WiFi, ARP spoofing, suspicious DNS. Per-app connection map with surgical block toggles.',
  },
  {
    icon: '🔍',
    title: 'App Scope Monitor',
    desc: 'See exactly which permissions each app uses vs. what it needs. Flashlight with READ_SMS? Flagged instantly.',
  },
  {
    icon: '⚖️',
    title: 'DPDP Scanner',
    desc: "India's Digital Personal Data Protection Act 2023. Maps each app's excess permissions to specific DPDP sections.",
  },
  {
    icon: '🦠',
    title: 'Ransomware Watch',
    desc: 'FileObserver on /storage — detects mass-encryption patterns before ransomware locks your photos.',
  },
  {
    icon: '🏥',
    title: 'Device Health Check',
    desc: '10-point hygiene report: screen lock, update status, developer options, USB debugging, root detection, backup status.',
  },
  {
    icon: '🌐',
    title: 'Safe Browse (DNS)',
    desc: 'DoH DNS resolver (Cloudflare + Google fallback) with IOC blocklist sync every 6 hours. 2,000+ live IOC domains blocked.',
  },
  {
    icon: '🔑',
    title: 'Permission Watcher',
    desc: 'Tracks which apps gained new permissions since your last check. One notification = entire permission change summary.',
  },
  {
    icon: '🏢',
    title: 'Corporate Shield (MDM)',
    desc: 'QR-based enrollment for company phones. IT admin pushes policy in 60 seconds. $2/device vs $8 for Intune.',
  },
  {
    icon: '🔒',
    title: 'Anti-Theft',
    desc: 'Remote lock, remote wipe trigger, tamper detection. Device Admin API — no cloud account required.',
  },
  {
    icon: '🛡️',
    title: 'Account Guard',
    desc: 'Session health for WhatsApp, Gmail, Paytm, PhonePe, Instagram — synthesizes all A10–A12 signals in one screen.',
  },
];

function ProtectionTools() {
  return (
    <section style={{ background: BG, padding: '72px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SectionHead
          title="14 Shields. One App."
          sub="Every major threat vector on an Indian Android phone — covered, on-device, no account needed."
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 14,
          }}
        >
          {TOOLS.map((t) => (
            <div
              key={t.title}
              style={{
                background: BG_CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
                padding: '18px 20px',
              }}
            >
              <div style={{ fontSize: 22, marginBottom: 8 }}>{t.icon}</div>
              <div style={{ fontWeight: 700, color: TEXT, fontSize: 14, marginBottom: 6 }}>
                {t.title}
              </div>
              <p style={{ color: MUTED, fontSize: 12, margin: 0, lineHeight: 1.65 }}>{t.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Surgical approach explainer ──────────────────────────────────────────────

function SurgicalApproach() {
  return (
    <section style={{ background: BG_ALT, padding: '72px 24px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
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
            <div style={{ color: RED, fontWeight: 700, marginBottom: 14 }}>
              ❌ Other security apps
            </div>
            <ul
              style={{
                color: MUTED,
                fontSize: 14,
                lineHeight: 2.1,
                margin: 0,
                padding: '0 0 0 16px',
              }}
            >
              <li>Toggle DNS on/off manually</li>
              <li>Block entire app categories</li>
              <li>VPN that slows everything down</li>
              <li>Breaks apps you actually need</li>
              <li>Constant notification spam</li>
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
            <div style={{ color: GREEN, fontWeight: 700, marginBottom: 14 }}>✓ AnkrShield</div>
            <ul
              style={{
                color: MUTED,
                fontSize: 14,
                lineHeight: 2.1,
                margin: 0,
                padding: '0 0 0 16px',
              }}
            >
              <li>Always on — zero manual toggling</li>
              <li>Per-connection surgical block</li>
              <li>App allowlist from your installs</li>
              <li>Only IOC + excess scope blocked</li>
              <li>Every app you love works normally</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Download + QR ───────────────────────────────────────────────────────────

function DownloadSection() {
  return (
    <section style={{ background: BG, padding: '72px 24px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
        <SectionHead
          title="Download AnkrShield"
          sub="Free Android APK — no Play Store account needed. Always the latest build."
        />

        <div
          style={{
            display: 'flex',
            gap: 40,
            justifyContent: 'center',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
          }}
        >
          {/* QR */}
          <div
            style={{
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              padding: 24,
              textAlign: 'center',
            }}
          >
            <div
              style={{ background: '#fff', padding: 10, borderRadius: 8, display: 'inline-block' }}
            >
              <img
                src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://xshieldai.com/download/ankrshield.apk"
                alt="Scan to download AnkrShield APK"
                width={160}
                height={160}
                style={{ display: 'block' }}
              />
            </div>
            <div style={{ color: MUTED, fontSize: 12, marginTop: 10 }}>📱 Scan QR to download</div>
          </div>

          {/* Install steps */}
          <div style={{ textAlign: 'left', maxWidth: 340 }}>
            <div style={{ color: TEXT, fontWeight: 700, fontSize: 16, marginBottom: 16 }}>
              Install in 3 steps
            </div>
            {[
              ['1', 'Scan QR or tap Download APK below', GREEN],
              ['2', 'Settings → Security → "Install from unknown sources" → enable', AMBER],
              ['3', 'Open AnkrShield.apk → Install → Done', GREEN],
            ].map(([num, step, color]) => (
              <div
                key={num as string}
                style={{ display: 'flex', gap: 14, marginBottom: 16, alignItems: 'flex-start' }}
              >
                <div
                  style={{
                    background: (color as string) + '22',
                    color: color as string,
                    border: `1px solid ${color as string}44`,
                    borderRadius: '50%',
                    width: 28,
                    height: 28,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                >
                  {num}
                </div>
                <div style={{ color: MUTED, fontSize: 13, lineHeight: 1.6, paddingTop: 4 }}>
                  {step as string}
                </div>
              </div>
            ))}
            <a
              href="/download/ankrshield.apk"
              style={{
                display: 'block',
                background: GREEN,
                color: '#000',
                padding: '12px',
                borderRadius: 8,
                fontWeight: 800,
                fontSize: 15,
                textDecoration: 'none',
                textAlign: 'center',
                marginTop: 8,
              }}
            >
              ↓ Download AnkrShield v1.4.0
            </a>
            <div style={{ color: MUTED, fontSize: 11, marginTop: 8, textAlign: 'center' }}>
              Apache 2.0 · Open source · No telemetry · 14 MB
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Why AnkrShield vs competitors ───────────────────────────────────────────

function Comparison() {
  return (
    <section style={{ background: BG_ALT, padding: '72px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <SectionHead
          title="Why AnkrShield"
          sub="The only mobile security app built for India's actual threats"
        />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Feature', 'AnkrShield', 'Quick Heal', 'Bitdefender', 'Norton'].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      padding: '12px 16px',
                      borderBottom: `1px solid ${BORDER}`,
                      color: i === 1 ? GREEN_L : MUTED,
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
                ['WhatsApp OTP hijack defense', '✅ native (v1.4)', '❌', '❌', '❌'],
                ['UPI fraud detection', '✅ native', '❌', '❌', '❌'],
                ['DPDP Act 2023 scanner', '✅ full', '❌', '❌', '❌'],
                ['India SMS fraud (9 types)', '✅', 'Partial', '❌', '❌'],
                ['SIM swap detection', '✅ (v1.4)', '❌', '❌', '❌'],
                ['Hindi / Tamil / Telugu UI', '✅', '❌', '❌', '❌'],
                ['Stalkerware detection', '✅', '✅', 'Partial', '❌'],
                ['On-device (no cloud upload)', '✅ always', '❌', '❌', '❌'],
                ['Open source', '✅ Apache 2.0', '❌', '❌', '❌'],
                ['Free forever', '✅', '❌', '❌', '❌'],
              ].map(([feat, ...vals]) => (
                <tr key={feat} style={{ borderBottom: `1px solid ${BORDER}22` }}>
                  <td style={{ padding: '10px 16px', color: TEXT }}>{feat}</td>
                  {vals.map((v, i) => (
                    <td
                      key={i}
                      style={{
                        padding: '10px 16px',
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

// ─── Enterprise crosslink ─────────────────────────────────────────────────────

function EnterpriseCrosslink() {
  return (
    <section style={{ background: BG, padding: '64px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div
          style={{
            background: `linear-gradient(135deg, #0d0720 0%, #060a10 100%)`,
            border: `1px solid ${VIOLET}33`,
            borderRadius: 16,
            padding: '44px 48px',
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 40,
            alignItems: 'center',
          }}
        >
          <div>
            <Badge label="FOR TEAMS & COMPANIES" color={VIOLET} />
            <h3 style={{ fontSize: 26, fontWeight: 800, color: TEXT, margin: '14px 0 12px' }}>
              Protecting a company?
              <br />
              <span style={{ color: '#a78bfa' }}>xShield Enterprise is built for you.</span>
            </h3>
            <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.8, margin: 0 }}>
              AnkrShield protects individual phones. xShield protects your company's domain, brand,
              and supply chain — with a full threat intelligence API, SIEM integration, STIX/TAXII
              export, and team dashboards. Starts at $99/mo.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
              <Link
                to="/"
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
                🏢 xShield Enterprise →
              </Link>
              <Link
                to="/onboarding"
                style={{
                  border: `1px solid ${VIOLET}44`,
                  color: '#a78bfa',
                  padding: '10px 22px',
                  borderRadius: 7,
                  fontWeight: 600,
                  fontSize: 14,
                  textDecoration: 'none',
                }}
              >
                Scan Your Domain Free
              </Link>
            </div>
          </div>
          <div style={{ textAlign: 'center', minWidth: 130 }}>
            <div style={{ fontSize: 64 }}>🏢</div>
            <div style={{ color: '#a78bfa', fontWeight: 800, fontSize: 14, marginTop: 8 }}>
              From $99/mo
            </div>
            <div style={{ color: MUTED, fontSize: 12 }}>API · SIEM · Teams</div>
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
          🛡️ AnkrShield{' '}
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
            ['Download APK', '/download/ankrshield.apk', false],
            ['xShield Enterprise', '/', false],
            ['Privacy Policy', '/privacy', false],
            ['Report Bug', 'https://github.com/rocketlang/ankrshield/issues', true],
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
          © 2026 Powerp Box IT Solutions Pvt Ltd · Apache 2.0 Open Source · v1.4.0
        </div>
      </div>
    </footer>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function AnkrShieldLanding() {
  return (
    <div
      style={{
        background: BG_DARK,
        minHeight: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: TEXT,
      }}
    >
      <Nav />
      <Hero />
      <WhatsAppDefense />
      <ProtectionTools />
      <SurgicalApproach />
      <DownloadSection />
      <Comparison />
      <EnterpriseCrosslink />
      <Footer />
    </div>
  );
}
