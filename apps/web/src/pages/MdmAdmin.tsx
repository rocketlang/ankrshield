/**
 * A7 MDM Admin Portal
 * IT admin dashboard for managing enrolled AnkrShield devices.
 * Demo/skeleton with mock data.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK_DEVICES = [
  {
    id: '1',
    name: "Rahul's Phone",
    os: 'Android 14',
    enrolled: '2026-02-20',
    lastSeen: '2 min ago',
    compliance: 'compliant',
    blockedToday: 47,
    riskScore: 12,
  },
  {
    id: '2',
    name: "Priya's Device",
    os: 'Android 13',
    enrolled: '2026-02-21',
    lastSeen: '1 hour ago',
    compliance: 'compliant',
    blockedToday: 8,
    riskScore: 28,
  },
  {
    id: '3',
    name: "Amit's Phone",
    os: 'Android 12',
    enrolled: '2026-02-22',
    lastSeen: '3 days ago',
    compliance: 'non-compliant',
    blockedToday: 0,
    riskScore: 71,
  },
  {
    id: '4',
    name: 'Sales Team Device',
    os: 'Android 14',
    enrolled: '2026-02-25',
    lastSeen: '5 min ago',
    compliance: 'compliant',
    blockedToday: 134,
    riskScore: 8,
  },
];

const MOCK_POLICY = {
  requireScreenLock: true,
  minPinLength: 6,
  blockSideloading: true,
  enforceVpn: true,
  customBlockDomains: ['malware-test.com', 'phish-demo.net'],
};

// ─── Style constants ──────────────────────────────────────────────────────────
const BG = '#060a10';
const CARD = '#0d1420';
const BORDER = '#1e2a3a';
const VIOLET = '#7c3aed';
const VIOLET_HOVER = '#6d28d9';

// ─── Toggle Switch (display-only) ────────────────────────────────────────────
function Toggle({ value }: { value: boolean }) {
  return (
    <div
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: value ? VIOLET : '#1e2a3a',
        position: 'relative',
        flexShrink: 0,
        cursor: 'default',
        transition: 'background 0.2s',
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          position: 'absolute',
          top: 3,
          left: value ? 21 : 3,
          transition: 'left 0.2s',
        }}
      />
    </div>
  );
}

// ─── QR Modal ────────────────────────────────────────────────────────────────
function QrModal({ policy, onClose }: { policy: typeof MOCK_POLICY; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          padding: '32px 28px',
          maxWidth: 380,
          width: '100%',
          textAlign: 'center',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ color: '#fff', fontWeight: 800, fontSize: 20, marginBottom: 8 }}>
          Device Enrollment QR
        </h3>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
          Scan with AnkrShield app to enroll this device
        </p>

        {/* QR placeholder */}
        <div
          style={{
            width: 200,
            height: 200,
            background: '#1e2a3a',
            border: `2px dashed #334155`,
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            color: '#475569',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 8 }}>📱</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>QR Code</div>
        </div>

        {/* Policy summary */}
        <div
          style={{
            background: '#0a0f1a',
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            padding: '12px 16px',
            textAlign: 'left',
            marginBottom: 20,
          }}
        >
          <p
            style={{
              color: '#94a3b8',
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 10,
            }}
          >
            Policy included
          </p>
          {[
            { label: 'Screen lock required', value: policy.requireScreenLock },
            { label: `Min PIN length: ${policy.minPinLength}`, value: true },
            { label: 'Block sideloading', value: policy.blockSideloading },
            { label: 'Enforce VPN', value: policy.enforceVpn },
          ].map((row) => (
            <div
              key={row.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <span style={{ color: '#64748b', fontSize: 13 }}>{row.label}</span>
              <Toggle value={row.value} />
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: `1px solid ${BORDER}`,
            color: '#94a3b8',
            borderRadius: 8,
            padding: '10px 24px',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Device Card ──────────────────────────────────────────────────────────────
function DeviceCard({ device }: { device: (typeof MOCK_DEVICES)[0] }) {
  const [expanded, setExpanded] = useState(false);
  const isNonCompliant = device.compliance === 'non-compliant';

  return (
    <div
      style={{
        background: CARD,
        border: `1px solid ${isNonCompliant ? '#d9770640' : BORDER}`,
        borderRadius: 12,
        padding: '16px 18px',
        marginBottom: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{device.name}</span>
            <span
              style={{
                background: isNonCompliant ? '#d9770620' : '#4ade8020',
                color: isNonCompliant ? '#f59e0b' : '#4ade80',
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 12,
              }}
            >
              {isNonCompliant ? '⚠ Out of compliance' : '✓ Compliant'}
            </span>
          </div>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
            {device.os} · Enrolled {device.enrolled} · Last seen {device.lastSeen}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
            <span style={{ color: '#94a3b8', fontSize: 13 }}>
              <span style={{ color: '#a78bfa', fontWeight: 700 }}>{device.blockedToday}</span>{' '}
              blocked today
            </span>
            <span style={{ color: '#94a3b8', fontSize: 13 }}>
              Risk:{' '}
              <span
                style={{
                  color:
                    device.riskScore < 30
                      ? '#4ade80'
                      : device.riskScore < 70
                        ? '#fbbf24'
                        : '#f87171',
                  fontWeight: 700,
                }}
              >
                {device.riskScore}
              </span>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => setExpanded((x) => !x)}
            style={{
              background: 'transparent',
              border: `1px solid ${BORDER}`,
              color: '#94a3b8',
              borderRadius: 7,
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {expanded ? 'Hide' : 'View Details'}
          </button>
          <button
            onClick={() => window.confirm(`Remote wipe ${device.name}? This cannot be undone.`)}
            style={{
              background: 'transparent',
              border: '1px solid #f8717140',
              color: '#f87171',
              borderRadius: 7,
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Remote Wipe
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            {[
              { label: 'Device ID', value: `DEV-${device.id.padStart(4, '0')}` },
              { label: 'OS Version', value: device.os },
              { label: 'Enrolled', value: device.enrolled },
              { label: 'Last Seen', value: device.lastSeen },
              { label: 'DNS Blocked Today', value: String(device.blockedToday) },
              { label: 'Risk Score', value: String(device.riskScore) },
              { label: 'Policy Status', value: isNonCompliant ? 'Non-compliant' : 'Compliant' },
              { label: 'MDM Enrolled', value: 'Yes' },
            ].map((row) => (
              <div key={row.label}>
                <p
                  style={{
                    color: '#475569',
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 0.8,
                    margin: '0 0 2px',
                  }}
                >
                  {row.label}
                </p>
                <p style={{ color: '#cbd5e1', fontSize: 14, margin: 0 }}>{row.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MdmAdmin() {
  const [policy, setPolicy] = useState(MOCK_POLICY);
  const [newDomain, setNewDomain] = useState('');
  const [pushed, setPushed] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const totalBlocked = MOCK_DEVICES.reduce((s, d) => s + d.blockedToday, 0);
  const compliantCount = MOCK_DEVICES.filter((d) => d.compliance === 'compliant').length;
  const avgRisk = Math.round(
    MOCK_DEVICES.reduce((s, d) => s + d.riskScore, 0) / MOCK_DEVICES.length
  );

  function addDomain() {
    const d = newDomain.trim().toLowerCase();
    if (d && !policy.customBlockDomains.includes(d)) {
      setPolicy((p) => ({ ...p, customBlockDomains: [...p.customBlockDomains, d] }));
    }
    setNewDomain('');
  }

  function removeDomain(domain: string) {
    setPolicy((p) => ({
      ...p,
      customBlockDomains: p.customBlockDomains.filter((x) => x !== domain),
    }));
  }

  function pushPolicy() {
    setPushed(true);
    setTimeout(() => setPushed(false), 3000);
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: BG,
        color: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {showQr && <QrModal policy={policy} onClose={() => setShowQr(false)} />}

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
        <Link to="/dashboard" style={{ color: '#94a3b8', fontSize: 14, textDecoration: 'none' }}>
          ← Dashboard
        </Link>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>🛡️ xShield</span>
        <div style={{ width: 80 }} />
      </nav>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 28,
          }}
        >
          <div>
            <h1 style={{ color: '#fff', fontWeight: 900, fontSize: 26, margin: 0 }}>
              MDM Admin Portal
            </h1>
            <p style={{ color: '#64748b', fontSize: 14, margin: '4px 0 0' }}>
              Mobile Device Management · AnkrShield enterprise
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                background: '#a78bfa20',
                color: '#a78bfa',
                fontSize: 13,
                fontWeight: 700,
                padding: '5px 14px',
                borderRadius: 20,
              }}
            >
              {MOCK_DEVICES.length} devices enrolled
            </span>
            <button
              onClick={() => setShowQr(true)}
              style={{
                background: VIOLET,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '9px 18px',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = VIOLET_HOVER;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = VIOLET;
              }}
            >
              Generate Enrollment QR
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 14,
            marginBottom: 28,
          }}
        >
          {[
            { label: 'Total Devices', value: MOCK_DEVICES.length, color: '#a78bfa' },
            {
              label: 'Compliant',
              value: `${compliantCount}/${MOCK_DEVICES.length}`,
              color: '#4ade80',
            },
            { label: 'Threats Blocked Today', value: totalBlocked, color: '#fbbf24' },
            {
              label: 'Avg Risk Score',
              value: avgRisk,
              color: avgRisk < 30 ? '#4ade80' : avgRisk < 70 ? '#fbbf24' : '#f87171',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                background: CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 12,
                padding: '18px 20px',
              }}
            >
              <p
                style={{
                  color: '#64748b',
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  margin: '0 0 6px',
                }}
              >
                {stat.label}
              </p>
              <p style={{ color: stat.color, fontSize: 28, fontWeight: 900, margin: 0 }}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Main two-column layout */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Policy panel — 1/3 */}
          <div style={{ flex: '1 1 280px', maxWidth: 340 }}>
            <div
              style={{
                background: CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 14,
                padding: '20px 18px',
              }}
            >
              <p style={{ color: '#fff', fontWeight: 800, fontSize: 16, marginBottom: 18 }}>
                Active Policy
              </p>

              {/* Toggle rows */}
              {[
                { label: 'Require screen lock', key: 'requireScreenLock' as const },
                {
                  label: `Min PIN length: ${policy.minPinLength}`,
                  key: 'minPinLength' as const,
                  alwaysOn: true,
                },
                { label: 'Block app sideloading', key: 'blockSideloading' as const },
                { label: 'Enforce VPN', key: 'enforceVpn' as const },
              ].map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 14,
                  }}
                >
                  <span style={{ color: '#94a3b8', fontSize: 14 }}>{row.label}</span>
                  <Toggle
                    value={row.alwaysOn ? true : Boolean(policy[row.key as keyof typeof policy])}
                  />
                </div>
              ))}

              <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16, marginTop: 4 }}>
                <p style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                  Custom Block Domains
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  {policy.customBlockDomains.map((d) => (
                    <div
                      key={d}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#0a0f1a',
                        border: `1px solid ${BORDER}`,
                        borderRadius: 7,
                        padding: '6px 10px',
                      }}
                    >
                      <span style={{ color: '#cbd5e1', fontSize: 13, fontFamily: 'monospace' }}>
                        {d}
                      </span>
                      <button
                        onClick={() => removeDomain(d)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#f87171',
                          cursor: 'pointer',
                          fontSize: 16,
                          lineHeight: 1,
                          padding: '0 2px',
                        }}
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add domain */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addDomain()}
                    placeholder="bad-domain.com"
                    style={{
                      flex: 1,
                      background: '#0a0f1a',
                      border: `1px solid ${BORDER}`,
                      borderRadius: 7,
                      padding: '7px 10px',
                      color: '#fff',
                      fontSize: 13,
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={addDomain}
                    style={{
                      background: VIOLET,
                      border: 'none',
                      color: '#fff',
                      borderRadius: 7,
                      padding: '7px 12px',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              <button
                onClick={pushPolicy}
                style={{
                  width: '100%',
                  background: pushed ? '#166534' : VIOLET,
                  border: 'none',
                  color: '#fff',
                  borderRadius: 9,
                  padding: '11px 0',
                  marginTop: 18,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 700,
                  transition: 'background 0.2s',
                }}
              >
                {pushed ? '✓ Pushed!' : 'Push Policy to All Devices'}
              </button>
            </div>
          </div>

          {/* Device list — 2/3 */}
          <div style={{ flex: '2 1 400px' }}>
            <p
              style={{
                color: '#94a3b8',
                fontSize: 14,
                fontWeight: 700,
                marginBottom: 14,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
              }}
            >
              Enrolled Devices
            </p>
            {MOCK_DEVICES.map((device) => (
              <DeviceCard key={device.id} device={device} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
