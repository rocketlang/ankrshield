// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / renderer — AEGIS settings cockpit (ASD-T-032 / FR-16)
//
// Single home for every aegis-proxy configuration knob, replacing the
// previous "settings live as tiles scattered across AgentFeed +
// ReportCard" pattern. Existing tiles stay in place (they're still useful
// where they sit); this page is the canonical "where do I change X?"
// surface for the user + the demo path.
//
// Sections (per remaining-work doc §3.2):
//   1. Identity & Trust — root CA fingerprint, install status, ceremony link
//   2. Apps & TOFU      — count of stored policies, link to /budget
//   3. DAN gate         — global timeout + WA/TG carrier credential status
//   4. Budget           — retention + global controls (link to /budget for per-app)
//   5. Audit & retention— retention_days, keep digests, compress prior day,
//                         "run now" + last-digest tile
//   6. Didactic & PROOF — didactic toggle, parity coverage % + report path
//
// Pure renderer: every section reads + writes existing IPC. Main side was
// fully wired by T-014..T-033; this page is the discoverability fix.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ConsentDialog } from '../components/ConsentDialog';

declare global {
  interface Window {
    electronAPI?: {
      aegisProxyGetRootCASetupInfo?: () => Promise<unknown>;
      aegisProxyListAppPolicies?: () => Promise<Record<string, unknown>>;
      aegisProxyGetDanTimeoutConfig?: () => Promise<{
        global_ms: number;
        limits: { min_ms: number; max_ms: number; default_ms: number };
      }>;
      aegisProxySetDanTimeoutGlobal?: (ms: number) => Promise<{ applied_ms: number }>;
      aegisProxyGetWhatsAppCredentials?: () => Promise<{
        configured: boolean;
        from_number?: string;
      }>;
      aegisProxyGetTelegramCredentials?: () => Promise<{
        configured: boolean;
        chat_id?: string;
      }>;
      aegisProxyAuditRetentionGet?: () => Promise<{
        retention_days: number | null;
        keep_weekly_digests: boolean;
        compress_prior_day: boolean;
      }>;
      aegisProxyAuditRetentionSet?: (input: {
        retention_days?: number | null;
        keep_weekly_digests?: boolean;
        compress_prior_day?: boolean;
      }) => Promise<{
        retention_days: number | null;
        keep_weekly_digests: boolean;
        compress_prior_day: boolean;
      }>;
      aegisProxyAuditRetentionRunNow?: () => Promise<{
        pruned: number;
        gzipped: number;
        digestsWritten: number;
      }>;
      aegisProxyKillSwitchGet?: () => Promise<{
        globalState: 'normal' | 'paused' | 'throttled' | 'locked';
        perApp: Record<string, 'normal' | 'paused' | 'throttled' | 'locked'>;
      }>;
      aegisProxyDidacticState?: () => Promise<{ enabled: boolean; updated_at: string | null }>;
      aegisProxyDidacticSet?: (input: {
        enabled: boolean;
      }) => Promise<{ enabled: boolean; updated_at: string | null }>;
      aegisProxyRequestAuditStats?: () => Promise<{ writes: number; errors: number }>;
      aegisProxyDanInboundState?: () => Promise<{
        tg_polling_enabled: boolean;
        wa_polling_enabled: boolean;
        poll_interval_ms: number;
        updated_at: string | null;
      }>;
      aegisProxyDanInboundRunning?: () => Promise<{
        tg_running: boolean;
        wa_running: boolean;
        wa_stats: {
          running: boolean;
          port: number;
          dispatched: number;
          sigFailures: number;
        } | null;
      }>;
      aegisProxyDanInboundSet?: (input: {
        tg_polling_enabled?: boolean;
        wa_polling_enabled?: boolean;
        poll_interval_ms?: number;
        wa_webhook_port?: number;
      }) => Promise<{
        config: {
          tg_polling_enabled: boolean;
          wa_polling_enabled: boolean;
          poll_interval_ms: number;
          wa_webhook_port: number;
          updated_at: string | null;
        };
        tg_running: boolean;
        wa_running: boolean;
      }>;
      aegisProxyWaWebhookCredsStatus?: () => Promise<{
        configured: boolean;
        verify_token_preview?: string;
      }>;
      aegisProxyWaWebhookCredsSet?: (input: {
        app_secret: string;
        verify_token?: string;
      }) => Promise<{ ok: true; verify_token_preview: string } | { ok: false; error: string }>;
      aegisProxyWaWebhookCredsClear?: () => Promise<{ cleared: boolean }>;
      aegisProxyWaWebhookCredsGetVerifyToken?: () => Promise<{ verify_token: string | null }>;
      aegisProxyKeyListFindings?: () => Promise<{
        findings: Array<{
          path: string;
          line: number;
          provider: 'anthropic' | 'openai' | 'unknown';
          preview: string;
          finding_id: string;
        }>;
        lastScanAt: string;
      }>;
      aegisProxyKeyRescan?: () => Promise<{
        findings: Array<{
          path: string;
          line: number;
          provider: 'anthropic' | 'openai' | 'unknown';
          preview: string;
          finding_id: string;
        }>;
        lastScanAt: string;
      }>;
      aegisProxyKeyMigrateOne?: (input: { finding_id: string }) => Promise<
        | {
            ok: true;
            finding_id: string;
            backup_path: string;
            keychain_service: string;
            keychain_account: string;
            migrated_at: string;
          }
        | { ok: false; finding_id?: string; reason: string }
      >;
    };
  }
}

interface RootCAInfo {
  ca: { fingerprintSha256: string; generatedAt: string; validUntil: string } | null;
  trustStore: {
    platformSupported: boolean;
    installed: boolean;
    installedAt?: string;
    manualInstallCommand?: string;
    manualRevokeCommand?: string;
  };
  consent: { answered: boolean; decision: string | null; answeredAt: string | null };
}

export function SettingsAegis() {
  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <header>
        <h1 className="text-2xl font-bold">
          <span className="text-ankr-green">AEGIS</span> Settings
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Every config knob for the agentic safeguard, in one place. The privacy-engine settings
          live at{' '}
          <Link to="/settings" className="text-ankr-green hover:underline">
            /settings
          </Link>
          .
        </p>
      </header>

      <IdentityTrustSection />
      <KeyOnDiskSection />
      <AppsTofuSection />
      <DanGateSection />
      <WhatsAppInboundSection />
      <AuditRetentionSection />
      <KillSwitchSummarySection />
      <DidacticPoofSection />
    </div>
  );
}

// ─── 3b. WhatsApp inbound webhook (ASD-T-038) ────────────────────────────────

function WhatsAppInboundSection() {
  const [credsConfigured, setCredsConfigured] = useState<boolean | null>(null);
  const [verifyTokenPreview, setVerifyTokenPreview] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [waPort, setWaPort] = useState<number | null>(null);
  const [waRunning, setWaRunning] = useState<boolean>(false);
  const [waStats, setWaStats] = useState<{ dispatched: number; sigFailures: number } | null>(null);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [appSecretInput, setAppSecretInput] = useState<string>('');
  const [verifyTokenInput, setVerifyTokenInput] = useState<string>('');
  const [setMsg, setSetMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const api = window.electronAPI;
    if (api?.aegisProxyWaWebhookCredsStatus) {
      try {
        const s = await api.aegisProxyWaWebhookCredsStatus();
        setCredsConfigured(s.configured);
        setVerifyTokenPreview(s.verify_token_preview ?? null);
      } catch {
        // ignore
      }
    }
    if (api?.aegisProxyDanInboundState) {
      try {
        const s = await api.aegisProxyDanInboundState();
        setEnabled(s.wa_polling_enabled);
        setWaPort(s.wa_webhook_port);
      } catch {
        // ignore
      }
    }
    if (api?.aegisProxyDanInboundRunning) {
      try {
        const r = await api.aegisProxyDanInboundRunning();
        setWaRunning(r.wa_running);
        if (r.wa_stats)
          setWaStats({ dispatched: r.wa_stats.dispatched, sigFailures: r.wa_stats.sigFailures });
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const flipEnabled = async () => {
    const api = window.electronAPI;
    if (!api?.aegisProxyDanInboundSet || enabled === null) return;
    try {
      const r = await api.aegisProxyDanInboundSet({ wa_polling_enabled: !enabled });
      setEnabled(r.config.wa_polling_enabled);
      setWaPort(r.config.wa_webhook_port);
      setWaRunning(r.wa_running);
    } catch {
      // ignore
    }
  };

  const saveCreds = async () => {
    const api = window.electronAPI;
    if (!api?.aegisProxyWaWebhookCredsSet) return;
    if (!appSecretInput.trim()) {
      setSetMsg('app_secret required');
      return;
    }
    try {
      const r = await api.aegisProxyWaWebhookCredsSet({
        app_secret: appSecretInput.trim(),
        verify_token: verifyTokenInput.trim() || undefined,
      });
      if (r.ok) {
        setSetMsg(`Saved · verify_token preview ${r.verify_token_preview}…`);
        setAppSecretInput('');
        setVerifyTokenInput('');
        await refresh();
      } else {
        setSetMsg(`Save failed: ${r.error}`);
      }
    } catch (err) {
      setSetMsg(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const clearCreds = async () => {
    const api = window.electronAPI;
    if (!api?.aegisProxyWaWebhookCredsClear) return;
    if (
      !window.confirm(
        'Clear stored WhatsApp webhook credentials? Inbound will stop until reconfigured.'
      )
    ) {
      return;
    }
    try {
      await api.aegisProxyWaWebhookCredsClear();
      setRevealedToken(null);
      await refresh();
    } catch {
      // ignore
    }
  };

  const revealToken = async () => {
    const api = window.electronAPI;
    if (!api?.aegisProxyWaWebhookCredsGetVerifyToken) return;
    try {
      const r = await api.aegisProxyWaWebhookCredsGetVerifyToken();
      setRevealedToken(r.verify_token);
    } catch {
      // ignore
    }
  };

  return (
    <Section title="WhatsApp inbound webhook" rule="ASD-T-038 · ASD-008">
      {credsConfigured == null ? (
        <Spinner />
      ) : (
        <>
          <Row
            label="Credentials"
            value={
              credsConfigured ? (
                <Badge tone="ok">configured · verify_token {verifyTokenPreview}…</Badge>
              ) : (
                <Badge tone="warn">not configured</Badge>
              )
            }
          />
          <Row
            label="Inbound polling"
            value={
              enabled == null ? (
                <Spinner inline />
              ) : (
                <span className="flex items-center gap-2">
                  <Toggle
                    checked={enabled}
                    onChange={() => void flipEnabled()}
                    label={enabled ? 'ON' : 'OFF'}
                  />
                  {enabled ? (
                    <Badge tone={waRunning ? 'ok' : 'warn'}>
                      {waRunning
                        ? `listening 127.0.0.1:${waPort}`
                        : credsConfigured
                          ? 'not running (port?)'
                          : 'not running (creds?)'}
                    </Badge>
                  ) : null}
                </span>
              )
            }
          />
          {waStats ? (
            <Row
              label="Session stats"
              value={
                <span className="text-xs text-gray-300">
                  {waStats.dispatched} dispatched ·{' '}
                  {waStats.sigFailures > 0 ? (
                    <span className="text-amber-300">{waStats.sigFailures} sig failures</span>
                  ) : (
                    '0 sig failures'
                  )}
                </span>
              }
            />
          ) : null}
          {credsConfigured ? (
            <div className="pt-2 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => void revealToken()}
                className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
              >
                Reveal verify_token (paste into Meta)
              </button>
              <button
                type="button"
                onClick={() => void clearCreds()}
                className="text-xs px-3 py-1.5 rounded bg-red-800 hover:bg-red-700 text-white"
              >
                Clear credentials
              </button>
              {revealedToken ? (
                <code className="text-[11px] text-amber-200 font-mono break-all">
                  {revealedToken}
                </code>
              ) : null}
            </div>
          ) : (
            <div className="pt-2 space-y-2 border-t border-gray-700 mt-2">
              <p className="text-xs text-gray-400">
                Set the Meta App Secret (used to verify <code>X-Hub-Signature-256</code> on every
                incoming POST). If you leave verify_token blank, a random 32-char hex token is
                generated — paste it into Meta&apos;s webhook configuration page.
              </p>
              <input
                type="password"
                placeholder="Meta App Secret"
                value={appSecretInput}
                onChange={(e) => setAppSecretInput(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white font-mono"
              />
              <input
                type="text"
                placeholder="verify_token (optional — leave blank to auto-generate)"
                value={verifyTokenInput}
                onChange={(e) => setVerifyTokenInput(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white font-mono"
              />
              <button
                type="button"
                onClick={() => void saveCreds()}
                disabled={!appSecretInput.trim()}
                className="text-xs px-3 py-1.5 rounded bg-ankr-green text-white hover:bg-green-600 disabled:opacity-50"
              >
                Save credentials
              </button>
              {setMsg ? <span className="text-xs text-gray-300 ml-2">{setMsg}</span> : null}
            </div>
          )}
          <p className="text-xs text-gray-400 pt-1">
            Webhook listens on <code className="text-gray-300">127.0.0.1:{waPort ?? '?'}</code>{' '}
            only. Expose to Meta via{' '}
            <code className="text-gray-300">
              cloudflared tunnel --url http://localhost:{waPort ?? '?'}
            </code>{' '}
            or ngrok / Tailscale Funnel. Webhook URL path is{' '}
            <code className="text-gray-300">/webhook/whatsapp</code>. Every POST is HMAC-verified
            (ASD-004 deny-first). Outgoing DAN messages already embed the same nonce format as
            Telegram inbound — works end-to-end the moment your tunnel is live.
          </p>
        </>
      )}
    </Section>
  );
}

// ─── 1b. Key-on-disk findings (ASD-T-036 / INF-ASD-002) ──────────────────────

interface KeyFinding {
  path: string;
  line: number;
  provider: 'anthropic' | 'openai' | 'unknown';
  preview: string;
  finding_id: string;
}

function KeyOnDiskSection() {
  const [findings, setFindings] = useState<KeyFinding[] | null>(null);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [pending, setPending] = useState<KeyFinding | null>(null);
  const [migratingId, setMigratingId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.aegisProxyKeyListFindings) return;
    try {
      const r = await api.aegisProxyKeyListFindings();
      setFindings(r.findings);
      setLastScanAt(r.lastScanAt);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rescan = async () => {
    const api = window.electronAPI;
    if (!api?.aegisProxyKeyRescan) return;
    try {
      const r = await api.aegisProxyKeyRescan();
      setFindings(r.findings);
      setLastScanAt(r.lastScanAt);
      setLastResult(`Re-scan complete: ${r.findings.length} finding(s).`);
    } catch (err) {
      setLastResult(`Re-scan failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const completeMigration = async (
    finding: KeyFinding,
    consent_record_id: string
  ): Promise<void> => {
    const api = window.electronAPI;
    if (!api?.aegisProxyKeyMigrateOne) return;
    setMigratingId(finding.finding_id);
    try {
      const r = await api.aegisProxyKeyMigrateOne({
        finding_id: finding.finding_id,
        consent_record_id,
      });
      if (r.ok) {
        setLastResult(
          `Migrated: secret moved to keychain ${r.keychain_service}/${r.keychain_account}; ` +
            `backup at ${r.backup_path}; consent ${consent_record_id.slice(0, 8)}…`
        );
        await refresh();
      } else {
        setLastResult(`Migration failed: ${r.reason}`);
      }
    } finally {
      setMigratingId(null);
    }
  };

  return (
    <Section title="Keys on disk (migration scanner)" rule="INF-ASD-002 · ASD-003">
      {findings == null ? (
        <Spinner />
      ) : (
        <>
          <Row
            label="Last scan"
            value={
              <span className="text-xs text-gray-300">
                {lastScanAt ? new Date(lastScanAt).toLocaleString() : '—'} · {findings.length}{' '}
                finding{findings.length === 1 ? '' : 's'}
              </span>
            }
          />
          {findings.length === 0 ? (
            <p className="text-xs text-gray-400 pt-1">
              No plaintext API keys found in the well-known paths (.env, .bashrc, .zshrc, .profile,
              .aws/credentials, etc.).
            </p>
          ) : (
            <ul className="space-y-2 pt-1">
              {findings.map((f) => (
                <li
                  key={f.finding_id}
                  className="flex items-center justify-between gap-3 text-xs bg-gray-900 border border-gray-700 rounded px-2 py-2"
                >
                  <span className="font-mono text-gray-300 truncate">
                    <Badge tone={f.provider === 'unknown' ? 'warn' : 'neutral'}>{f.provider}</Badge>{' '}
                    {f.path}:{f.line} → <span className="text-amber-300">{f.preview}…</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPending(f)}
                    disabled={migratingId === f.finding_id}
                    className="text-[11px] px-2 py-1 rounded bg-ankr-green text-white hover:bg-green-600 disabled:opacity-50"
                  >
                    {migratingId === f.finding_id ? 'Migrating…' : 'Migrate to keychain'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void rescan()}
              className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
            >
              Re-scan now
            </button>
            {lastResult ? <span className="text-xs text-gray-300">{lastResult}</span> : null}
          </div>
          <p className="text-xs text-gray-400 pt-1">
            INF-ASD-002 ground truth: keys belong in the OS keychain, not on disk. Each migration
            backs up the source file before zeroing, so you can recover manually if needed.
          </p>
          {pending ? (
            <KeyMigrationDialog
              finding={pending}
              onClose={() => setPending(null)}
              onConfirmed={async (cid) => {
                const target = pending;
                setPending(null);
                if (target) await completeMigration(target, cid);
              }}
            />
          ) : null}
        </>
      )}
    </Section>
  );
}

/**
 * Per-key migration consent modal (ASD-T-037 / FR-21). Replaces the
 * prior window.confirm() gate with a first-class ConsentDialog so every
 * migration produces a PRAMANA-shape impression + decision record via
 * ConsentStore (consent_record_id round-tripped to migrate-one). Off-switch
 * is the dialog's Deny button or the X-via-close click outside.
 */
function KeyMigrationDialog({
  finding,
  onClose,
  onConfirmed,
}: {
  finding: KeyFinding;
  onClose: () => void;
  onConfirmed: (consent_record_id: string) => Promise<void>;
}) {
  const handleDecided = async (input: {
    decision: 'allow' | 'deny' | 'skip';
    consent_record_id: string;
  }) => {
    if (input.decision === 'allow') {
      await onConfirmed(input.consent_record_id);
    } else {
      onClose();
    }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="max-w-xl w-full">
        <ConsentDialog
          ceremony="key-on-disk-migration"
          title={`Migrate ${finding.provider} key from ${shortPath(finding.path)}`}
          variant="ceremony"
          allowLabel="Migrate to keychain"
          denyLabel="Keep on disk"
          didacticRuleId="INF-ASD-002"
          subject={{
            finding_id: finding.finding_id,
            path: finding.path,
            line: finding.line,
            provider: finding.provider,
            preview: finding.preview,
          }}
          purpose={
            `Move a plaintext ${finding.provider} API key from ` +
            `${finding.path}:${finding.line} (${finding.preview}…) to the OS keychain.`
          }
          consequences={
            'The source file will be backed up at <path>.ankrshield-bak-<ts> (chmod 0o600), the ' +
            'secret written to the OS keychain (service=ankrshield-migrated-keys), and the ' +
            'source rewritten in-place with a [MIGRATED-TO-KEYCHAIN-…] marker preserving ' +
            'surrounding text. The keychain entry persists even if you later delete the backup.'
          }
          revocation_path={
            'Restore the .ankrshield-bak-* file over the source to undo the rewrite. The ' +
            'keychain entry can be removed via the OS keychain GUI (Keychain Access on macOS, ' +
            'Credential Manager on Windows, seahorse / secret-tool on Linux).'
          }
          onDecided={handleDecided}
        />
      </div>
    </div>
  );
}

function shortPath(path: string): string {
  const parts = path.split('/');
  if (parts.length <= 3) return path;
  return `…/${parts.slice(-2).join('/')}`;
}

// ─── 1. Identity & Trust ─────────────────────────────────────────────────────

function IdentityTrustSection() {
  const [info, setInfo] = useState<RootCAInfo | null>(null);

  useEffect(() => {
    void (async () => {
      const api = window.electronAPI;
      if (!api?.aegisProxyGetRootCASetupInfo) return;
      try {
        const i = (await api.aegisProxyGetRootCASetupInfo()) as RootCAInfo;
        setInfo(i);
      } catch {
        // ignore
      }
    })();
  }, []);

  return (
    <Section title="Identity & Trust" rule="ASD-002 · ASD-012">
      {info ? (
        <>
          <Row
            label="Root CA"
            value={
              info.ca ? (
                <span className="font-mono text-xs">
                  {info.ca.fingerprintSha256.slice(0, 16)}…{info.ca.fingerprintSha256.slice(-8)}
                </span>
              ) : (
                <span className="text-gray-500">not generated</span>
              )
            }
          />
          {info.ca ? <Row label="Valid until" value={info.ca.validUntil.slice(0, 10)} /> : null}
          <Row
            label="OS trust store"
            value={
              info.trustStore.installed ? (
                <Badge tone="ok">installed</Badge>
              ) : info.trustStore.platformSupported ? (
                <Badge tone="warn">not installed</Badge>
              ) : (
                <Badge tone="neutral">platform unsupported</Badge>
              )
            }
          />
          <Row
            label="Install consent"
            value={
              info.consent.answered ? (
                <Badge tone={info.consent.decision === 'allow' ? 'ok' : 'warn'}>
                  {info.consent.decision} · {info.consent.answeredAt?.slice(0, 10)}
                </Badge>
              ) : (
                <Badge tone="warn">not asked</Badge>
              )
            }
          />
          <div className="pt-2">
            <Link
              to="/setup/root-ca"
              className="text-xs px-3 py-1.5 rounded bg-ankr-green text-white hover:bg-green-600"
            >
              Open setup ceremony →
            </Link>
          </div>
        </>
      ) : (
        <Spinner />
      )}
    </Section>
  );
}

// ─── 2. Apps & TOFU ──────────────────────────────────────────────────────────

function AppsTofuSection() {
  const [count, setCount] = useState<number | null>(null);
  const [byDecision, setByDecision] = useState<{ allow: number; deny: number }>({
    allow: 0,
    deny: 0,
  });

  useEffect(() => {
    void (async () => {
      const api = window.electronAPI;
      if (!api?.aegisProxyListAppPolicies) return;
      try {
        const policies = await api.aegisProxyListAppPolicies();
        const entries = Object.values(policies) as Array<{ decision?: string }>;
        setCount(entries.length);
        let allow = 0;
        let deny = 0;
        for (const p of entries) {
          if (p?.decision === 'allow') allow += 1;
          else if (p?.decision === 'deny') deny += 1;
        }
        setByDecision({ allow, deny });
      } catch {
        // ignore
      }
    })();
  }, []);

  return (
    <Section title="Apps & TOFU" rule="ASD-005 · ASD-YK-002">
      {count == null ? (
        <Spinner />
      ) : (
        <>
          <Row label="Registered apps" value={String(count)} />
          <Row
            label="By decision"
            value={
              <span className="space-x-2 text-xs">
                <Badge tone="ok">{byDecision.allow} allowed</Badge>
                <Badge tone={byDecision.deny > 0 ? 'warn' : 'neutral'}>
                  {byDecision.deny} denied
                </Badge>
              </span>
            }
          />
          <p className="text-xs text-gray-400 pt-1">
            First request from an unseen app holds pending until you decide (modal, two-option:
            Allow with budget · Deny). Manage per-app budgets at{' '}
            <Link to="/budget" className="text-ankr-green hover:underline">
              /budget
            </Link>
            .
          </p>
        </>
      )}
    </Section>
  );
}

// ─── 3. DAN gate ─────────────────────────────────────────────────────────────

function DanGateSection() {
  const [globalMs, setGlobalMs] = useState<number | null>(null);
  const [limits, setLimits] = useState<{
    min_ms: number;
    max_ms: number;
    default_ms: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [wa, setWa] = useState<{ configured: boolean; from_number?: string } | null>(null);
  const [tg, setTg] = useState<{ configured: boolean; chat_id?: string } | null>(null);
  const [inbound, setInbound] = useState<{
    tg_polling_enabled: boolean;
    poll_interval_ms: number;
  } | null>(null);
  const [inboundRunning, setInboundRunning] = useState<boolean>(false);

  useEffect(() => {
    void (async () => {
      const api = window.electronAPI;
      if (api?.aegisProxyGetDanTimeoutConfig) {
        try {
          const cfg = await api.aegisProxyGetDanTimeoutConfig();
          setGlobalMs(cfg.global_ms);
          setLimits(cfg.limits);
        } catch {
          // ignore
        }
      }
      if (api?.aegisProxyGetWhatsAppCredentials) {
        try {
          setWa(await api.aegisProxyGetWhatsAppCredentials());
        } catch {
          // ignore
        }
      }
      if (api?.aegisProxyGetTelegramCredentials) {
        try {
          setTg(await api.aegisProxyGetTelegramCredentials());
        } catch {
          // ignore
        }
      }
      if (api?.aegisProxyDanInboundState) {
        try {
          const s = await api.aegisProxyDanInboundState();
          setInbound({
            tg_polling_enabled: s.tg_polling_enabled,
            poll_interval_ms: s.poll_interval_ms,
          });
        } catch {
          // ignore
        }
      }
      if (api?.aegisProxyDanInboundRunning) {
        try {
          setInboundRunning((await api.aegisProxyDanInboundRunning()).tg_running);
        } catch {
          // ignore
        }
      }
    })();
  }, []);

  const flipInbound = async () => {
    const api = window.electronAPI;
    if (!api?.aegisProxyDanInboundSet || !inbound) return;
    try {
      const r = await api.aegisProxyDanInboundSet({
        tg_polling_enabled: !inbound.tg_polling_enabled,
      });
      setInbound({
        tg_polling_enabled: r.config.tg_polling_enabled,
        poll_interval_ms: r.config.poll_interval_ms,
      });
      setInboundRunning(r.tg_running);
    } catch {
      // ignore
    }
  };

  const commitTimeout = async () => {
    if (globalMs == null) return;
    setSaving(true);
    try {
      const r = await window.electronAPI?.aegisProxySetDanTimeoutGlobal?.(globalMs);
      if (r?.applied_ms != null) {
        setGlobalMs(r.applied_ms);
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 1500);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="DAN gate" rule="ASD-008 · INF-ASD-008 · Vivechana Decision 3">
      {globalMs == null || !limits ? (
        <Spinner />
      ) : (
        <>
          <div>
            <Row
              label="Global timeout"
              value={`${Math.round(globalMs / 1000)}s (range ${Math.round(limits.min_ms / 1000)}s–${Math.round(limits.max_ms / 1000)}s)`}
            />
            <div className="flex items-center gap-3 pt-1">
              <input
                type="range"
                min={limits.min_ms}
                max={limits.max_ms}
                step={5000}
                value={globalMs}
                onChange={(e) => setGlobalMs(Number(e.target.value))}
                onMouseUp={() => void commitTimeout()}
                onTouchEnd={() => void commitTimeout()}
                disabled={saving}
                className="flex-1"
              />
              <span className="text-sm font-mono text-white w-12 text-right">
                {Math.round(globalMs / 1000)}s
              </span>
            </div>
            {savedAt != null ? <span className="text-xs text-ankr-green">Saved.</span> : null}
          </div>
          <Row
            label="WhatsApp carrier"
            value={
              wa == null ? (
                <Spinner inline />
              ) : wa.configured ? (
                <Badge tone="ok">configured · {wa.from_number}</Badge>
              ) : (
                <Badge tone="neutral">not configured</Badge>
              )
            }
          />
          <Row
            label="Telegram carrier"
            value={
              tg == null ? (
                <Spinner inline />
              ) : tg.configured ? (
                <Badge tone="ok">configured · chat {tg.chat_id}</Badge>
              ) : (
                <Badge tone="neutral">not configured</Badge>
              )
            }
          />
          <Row
            label="Telegram reply-to-approve"
            value={
              inbound == null ? (
                <Spinner inline />
              ) : (
                <span className="flex items-center gap-2">
                  <Toggle
                    checked={inbound.tg_polling_enabled}
                    onChange={() => void flipInbound()}
                    label={inbound.tg_polling_enabled ? 'ON' : 'OFF'}
                  />
                  {inbound.tg_polling_enabled ? (
                    <Badge tone={inboundRunning ? 'ok' : 'warn'}>
                      {inboundRunning
                        ? `polling every ${Math.round(inbound.poll_interval_ms / 1000)}s`
                        : 'not running (creds?)'}
                    </Badge>
                  ) : null}
                </span>
              )
            }
          />
          <p className="text-xs text-gray-400 pt-1">
            Carrier credentials are stored in the OS keychain (ASD-003). The OS-notification carrier
            is always available as fallback. Inbound: reply{' '}
            <code className="text-gray-300">"y &lt;nonce&gt;"</code> or{' '}
            <code className="text-gray-300">"n &lt;nonce&gt;"</code> on Telegram (nonce embedded in
            the outgoing DAN message). WhatsApp inbound is a future task (Meta Business webhook
            setup required).
          </p>
        </>
      )}
    </Section>
  );
}

// ─── 4. Audit & Retention ────────────────────────────────────────────────────

function AuditRetentionSection() {
  const [cfg, setCfg] = useState<{
    retention_days: number | null;
    keep_weekly_digests: boolean;
    compress_prior_day: boolean;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [ranSummary, setRanSummary] = useState<string | null>(null);
  const [auditStats, setAuditStats] = useState<{ writes: number; errors: number } | null>(null);

  const refresh = useCallback(async () => {
    const api = window.electronAPI;
    if (api?.aegisProxyAuditRetentionGet) {
      try {
        setCfg(await api.aegisProxyAuditRetentionGet());
      } catch {
        // ignore
      }
    }
    if (api?.aegisProxyRequestAuditStats) {
      try {
        setAuditStats(await api.aegisProxyRequestAuditStats());
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const update = async (patch: {
    retention_days?: number | null;
    keep_weekly_digests?: boolean;
    compress_prior_day?: boolean;
  }) => {
    const api = window.electronAPI;
    if (!api?.aegisProxyAuditRetentionSet) return;
    try {
      const next = await api.aegisProxyAuditRetentionSet(patch);
      setCfg(next);
    } catch {
      // ignore
    }
  };

  const runNow = async () => {
    const api = window.electronAPI;
    if (!api?.aegisProxyAuditRetentionRunNow) return;
    setRunning(true);
    try {
      const r = await api.aegisProxyAuditRetentionRunNow();
      setRanSummary(
        `Pruned ${r.pruned} · gzipped ${r.gzipped} · digests written ${r.digestsWritten}`
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <Section title="Audit & retention" rule="ASD-007 · FR-13 · FR-14 · Vivechana Decision 4">
      {cfg == null ? (
        <Spinner />
      ) : (
        <>
          <Row
            label="Retention"
            value={
              <select
                value={cfg.retention_days == null ? 'indefinite' : String(cfg.retention_days)}
                onChange={(e) =>
                  void update({
                    retention_days: e.target.value === 'indefinite' ? null : Number(e.target.value),
                  })
                }
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
              >
                <option value="30">30 days</option>
                <option value="90">90 days (default)</option>
                <option value="180">180 days</option>
                <option value="365">1 year</option>
                <option value="indefinite">keep indefinitely</option>
              </select>
            }
          />
          <Row
            label="Keep weekly digests"
            value={
              <Toggle
                checked={cfg.keep_weekly_digests}
                onChange={(checked) => void update({ keep_weekly_digests: checked })}
                label={cfg.keep_weekly_digests ? 'on' : 'off'}
              />
            }
          />
          <Row
            label="Gzip prior-day files"
            value={
              <Toggle
                checked={cfg.compress_prior_day}
                onChange={(checked) => void update({ compress_prior_day: checked })}
                label={cfg.compress_prior_day ? 'on' : 'off'}
              />
            }
          />
          {auditStats ? (
            <Row
              label="Request receipts (session)"
              value={
                <span className="text-xs">
                  {auditStats.writes} written
                  {auditStats.errors > 0 ? (
                    <span className="text-amber-300"> · {auditStats.errors} errors</span>
                  ) : null}
                </span>
              }
            />
          ) : null}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void runNow()}
              disabled={running}
              className="text-xs px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-50"
            >
              {running ? 'Running…' : 'Run heavy pass now'}
            </button>
            {ranSummary ? <span className="text-xs text-gray-300">{ranSummary}</span> : null}
          </div>
          <p className="text-xs text-gray-400 pt-1">
            Receipts at <code className="text-gray-300">~/.ankrshield/audit/</code>. ZIP export is
            on the{' '}
            <Link to="/report-card" className="text-ankr-green hover:underline">
              report card
            </Link>{' '}
            page.
          </p>
        </>
      )}
    </Section>
  );
}

// ─── 5. Kill switch summary ──────────────────────────────────────────────────

function KillSwitchSummarySection() {
  const [snap, setSnap] = useState<{
    globalState: string;
    perApp: Record<string, string>;
  } | null>(null);

  useEffect(() => {
    const tick = async () => {
      const api = window.electronAPI;
      if (!api?.aegisProxyKillSwitchGet) return;
      try {
        const s = (await api.aegisProxyKillSwitchGet()) as {
          globalState: string;
          perApp: Record<string, string>;
        };
        setSnap(s);
      } catch {
        // ignore
      }
    };
    void tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, []);

  if (!snap) return null;
  const affected = Object.values(snap.perApp).filter((s) => s !== 'normal').length;

  return (
    <Section title="Kill switch (read-only here)" rule="ASD-009 · FR-15 · INF-ASD-006">
      <Row
        label="Global state"
        value={
          <Badge tone={snap.globalState === 'normal' ? 'ok' : 'warn'}>{snap.globalState}</Badge>
        }
      />
      <Row label="Apps in non-normal state" value={String(affected)} />
      <p className="text-xs text-gray-400 pt-1">
        Toggle the kill switch from the{' '}
        <Link to="/report-card" className="text-ankr-green hover:underline">
          report card
        </Link>{' '}
        — the controls live alongside the apps they affect.
      </p>
    </Section>
  );
}

// ─── 6. Didactic mode + PROOF parity status ──────────────────────────────────

function DidacticPoofSection() {
  const [didactic, setDidactic] = useState<{ enabled: boolean; updated_at: string | null } | null>(
    null
  );

  useEffect(() => {
    void (async () => {
      const api = window.electronAPI;
      if (!api?.aegisProxyDidacticState) return;
      try {
        setDidactic(await api.aegisProxyDidacticState());
      } catch {
        // ignore
      }
    })();
  }, []);

  const flip = async () => {
    const api = window.electronAPI;
    if (!api?.aegisProxyDidacticSet || !didactic) return;
    try {
      setDidactic(await api.aegisProxyDidacticSet({ enabled: !didactic.enabled }));
    } catch {
      // ignore
    }
  };

  return (
    <Section title="Didactic mode + PROOF parity" rule="ASD-008 · NFR-10 · Vivechana Decision 5">
      <Row
        label="Didactic mode"
        value={
          didactic == null ? (
            <Spinner inline />
          ) : (
            <Toggle
              checked={didactic.enabled}
              onChange={() => void flip()}
              label={didactic.enabled ? 'ON' : 'OFF'}
            />
          )
        }
      />
      {didactic?.updated_at ? (
        <Row label="Last changed" value={didactic.updated_at.slice(0, 19).replace('T', ' ')} />
      ) : null}
      <Row
        label="PROOF parity report"
        value={
          <a
            href="proposals/ankrshield-desktop-aegis--proof-parity-report--formal--2026-05-19.md"
            className="text-ankr-green hover:underline text-xs"
            onClick={(e) => e.preventDefault()}
            title="File: /root/proposals/ankrshield-desktop-aegis--proof-parity-report--formal--2026-05-19.md"
          >
            …proof-parity-report--formal--2026-05-19.md
          </a>
        }
      />
      <p className="text-xs text-gray-400 pt-1">
        Re-run anytime: <code className="text-gray-300">bun scripts/proof-parity.ts</code>. Didactic
        mode adds 3-line rule explanations to every consent dialog (off by default per ASD-008
        zero-surface).
      </p>
    </Section>
  );
}

// ─── Shared shells ───────────────────────────────────────────────────────────

function Section({
  title,
  rule,
  children,
}: {
  title: string;
  rule: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-2">
      <header className="flex items-baseline justify-between border-b border-gray-700 pb-2 mb-2">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <span className="text-[10px] font-mono text-gray-500">{rule}</span>
      </header>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-200">{value}</span>
    </div>
  );
}

function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'ok' | 'warn' | 'neutral';
}) {
  const cls =
    tone === 'ok'
      ? 'bg-emerald-900/60 text-emerald-200 border-emerald-700'
      : tone === 'warn'
        ? 'bg-yellow-900/60 text-yellow-200 border-yellow-700'
        : 'bg-gray-700/60 text-gray-300 border-gray-600';
  return <span className={`text-[11px] px-2 py-0.5 rounded border ${cls}`}>{children}</span>;
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`text-xs px-3 py-1 rounded ${
        checked
          ? 'bg-blue-700 hover:bg-blue-600 text-white'
          : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
      }`}
    >
      {label}
    </button>
  );
}

function Spinner({ inline = false }: { inline?: boolean }) {
  return <span className={`${inline ? '' : 'block'} text-xs text-gray-500`}>Loading…</span>;
}
