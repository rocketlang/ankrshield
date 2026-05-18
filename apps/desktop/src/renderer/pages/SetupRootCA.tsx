/* SPDX-License-Identifier: AGPL-3.0-only */
// SetupRootCA — root CA install consent ceremony (ASD-T-003).
//
// @rule:ASD-002 — every install has its own root CA
// @rule:ASD-012 — root CA install is its own ceremony with explicit consent
// @rule:ASD-YK-007 — ConsentDialog is a first-class component, each render
//   produces a PRAMANA-shape consent record (written via IPC handler)

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface RootCASetupInfo {
  ca: { fingerprintSha256: string; generatedAt: string; validUntil: string } | null;
  trustStore: {
    platformSupported: boolean;
    installed: boolean;
    installedAt?: string;
    manualInstallCommand?: string;
    manualRevokeCommand?: string;
  };
  consent: {
    answered: boolean;
    decision: 'allow' | 'deny' | 'skip' | null;
    answeredAt: string | null;
  };
}

declare global {
  interface Window {
    electronAPI?: {
      aegisProxyGetRootCASetupInfo?: () => Promise<RootCASetupInfo>;
      aegisProxyRecordRootCAConsent?: (decision: 'allow' | 'deny' | 'skip') => Promise<{
        ok: true;
        install?: { ok: boolean; error?: string; installedAt?: string };
      }>;
    };
  }
}

type FlowState =
  | { kind: 'loading' }
  | { kind: 'ready'; info: RootCASetupInfo }
  | { kind: 'submitting'; decision: 'allow' | 'deny' | 'skip' }
  | { kind: 'done'; decision: 'allow' | 'deny' | 'skip'; installError?: string }
  | { kind: 'error'; message: string };

export function SetupRootCA() {
  const navigate = useNavigate();
  const [state, setState] = useState<FlowState>({ kind: 'loading' });

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.aegisProxyGetRootCASetupInfo) {
      setState({ kind: 'error', message: 'Electron API not available.' });
      return;
    }
    api
      .aegisProxyGetRootCASetupInfo()
      .then((info) => setState({ kind: 'ready', info }))
      .catch((err: Error) => setState({ kind: 'error', message: err.message }));
  }, []);

  const submit = async (decision: 'allow' | 'deny' | 'skip') => {
    const api = window.electronAPI;
    if (!api?.aegisProxyRecordRootCAConsent) return;
    setState({ kind: 'submitting', decision });
    try {
      const result = await api.aegisProxyRecordRootCAConsent(decision);
      const installError = result.install && !result.install.ok ? result.install.error : undefined;
      setState({ kind: 'done', decision, installError });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  if (state.kind === 'loading') {
    return <div className="p-8 text-gray-400">Loading CA setup…</div>;
  }
  if (state.kind === 'error') {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-red-400">CA setup error</h1>
        <p className="mt-2 text-gray-300">{state.message}</p>
      </div>
    );
  }
  if (state.kind === 'submitting') {
    return (
      <div className="p-8 text-gray-300">
        {state.decision === 'allow'
          ? 'Installing CA — your OS may prompt for your password…'
          : 'Recording your decision…'}
      </div>
    );
  }
  if (state.kind === 'done') {
    return (
      <DoneView
        decision={state.decision}
        installError={state.installError}
        onContinue={() => navigate('/agents')}
      />
    );
  }

  return (
    <CeremonyView
      info={state.info}
      onAllow={() => submit('allow')}
      onDeny={() => submit('deny')}
      onSkip={() => submit('skip')}
    />
  );
}

function CeremonyView({
  info,
  onAllow,
  onDeny,
  onSkip,
}: {
  info: RootCASetupInfo;
  onAllow: () => void;
  onDeny: () => void;
  onSkip: () => void;
}) {
  const ca = info.ca;
  const ts = info.trustStore;
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold">
          <span className="text-ankr-green">Set up</span> the aegis-proxy CA
        </h1>
        <p className="mt-2 text-sm text-gray-400">
          ankrshield-desktop has generated a root certificate authority that lives only on this
          machine. Trusting it lets the aegis-proxy decrypt your HTTPS_PROXY traffic so AgentFeed
          can show what your AI tools are doing.
        </p>
      </header>

      {info.consent.answered ? (
        <div className="bg-yellow-900/40 border border-yellow-700 text-yellow-200 px-4 py-3 rounded">
          <strong>You already answered this ceremony</strong> on{' '}
          {info.consent.answeredAt?.slice(0, 19).replace('T', ' ')} →{' '}
          <code>{info.consent.decision}</code>. Submitting again writes a new record (the latest
          decision wins).
        </div>
      ) : null}

      {ts.installed ? (
        <div className="bg-green-900/30 border border-green-700 text-green-200 px-4 py-3 rounded">
          ✓ CA is currently installed at <code>{ts.installedAt}</code>. Re-running this ceremony
          will re-install (idempotent).
        </div>
      ) : null}

      <Section title="The CA on this install">
        {ca ? (
          <dl className="text-sm font-mono space-y-1">
            <Row label="SHA-256" value={formatFingerprint(ca.fingerprintSha256)} />
            <Row label="Generated" value={ca.generatedAt} />
            <Row label="Valid until" value={ca.validUntil} />
            <Row label="Public cert" value="~/.ankrshield/ca.crt" />
            <Row label="Private key" value="OS keychain (ankrshield-ca / root-key)" />
          </dl>
        ) : (
          <p className="text-gray-400">CA not yet generated. Restart the app to create one.</p>
        )}
      </Section>

      <Section title="What this does">
        <p>
          The aegis-proxy listens on <code>127.0.0.1:4857</code>. When a tool with{' '}
          <code>HTTPS_PROXY=http://127.0.0.1:4857</code> makes an HTTPS request, the proxy mints a
          per-host leaf certificate signed by this root CA, terminates TLS using that leaf, observes
          the decrypted request, then re-encrypts to the real upstream over a fresh TLS connection.
          Trusting the CA in your OS trust store lets your tools accept the per-host leaves without
          warning.
        </p>
      </Section>

      <Section title="Why it's needed">
        <p>
          Without trust, every HTTPS request fails the TLS handshake. You'd see "untrusted
          certificate" errors in your tools and AgentFeed would only show plain-HTTP traffic, which
          is virtually nothing today.
        </p>
      </Section>

      <Section title="How to revoke">
        <p>
          Uninstall ankrshield-desktop to remove the CA from the trust store. To revoke manually:
        </p>
        {ts.manualRevokeCommand ? (
          <pre className="mt-2 text-xs bg-gray-900 p-3 rounded border border-gray-700 overflow-x-auto">
            {ts.manualRevokeCommand}
          </pre>
        ) : null}
      </Section>

      <Section title="If you refuse">
        <p>
          The CA stays on disk in <code>~/.ankrshield/ca.crt</code> and the key in your OS keychain,
          but isn't installed into the system trust store. HTTPS CONNECT through the proxy will be
          refused. Plain-HTTP traffic still flows; the privacy engine still blocks tracker domains.
          You can change your mind any time from this page.
        </p>
      </Section>

      {!ts.platformSupported ? (
        <div className="bg-blue-900/30 border border-blue-700 text-blue-200 px-4 py-3 rounded">
          Automatic install for this platform is not yet implemented. The "Trust this CA" button
          will record your consent and surface the manual command:
          <pre className="mt-2 text-xs bg-gray-900 p-3 rounded border border-gray-700 overflow-x-auto">
            {ts.manualInstallCommand}
          </pre>
        </div>
      ) : null}

      <footer className="flex flex-wrap gap-3 pt-4 border-t border-gray-700">
        <button
          type="button"
          className="px-4 py-2 rounded font-medium bg-ankr-green text-white hover:bg-green-600"
          onClick={onAllow}
        >
          Trust this CA
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded font-medium bg-gray-700 text-gray-200 hover:bg-gray-600"
          onClick={onSkip}
        >
          Skip for now
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded font-medium bg-red-700/70 text-white hover:bg-red-700"
          onClick={onDeny}
        >
          Refuse — never install
        </button>
      </footer>
    </div>
  );
}

function DoneView({
  decision,
  installError,
  onContinue,
}: {
  decision: 'allow' | 'deny' | 'skip';
  installError?: string;
  onContinue: () => void;
}) {
  let body: React.ReactNode;
  if (decision === 'allow' && !installError) {
    body = (
      <>
        <h1 className="text-2xl font-bold text-ankr-green">CA trusted</h1>
        <p className="mt-2 text-gray-300">
          The CA is installed in your system trust store. HTTPS CONNECT through the aegis-proxy will
          now succeed and AgentFeed will show decrypted request observations.
        </p>
      </>
    );
  } else if (decision === 'allow' && installError) {
    body = (
      <>
        <h1 className="text-2xl font-bold text-yellow-400">Consent recorded, install failed</h1>
        <p className="mt-2 text-gray-300">{installError}</p>
        <p className="mt-2 text-gray-400 text-sm">
          The consent record is in{' '}
          <code>~/.ankrshield/audit/{'{date}'}/consent-root-ca-*.json</code>. You can install the CA
          manually or re-run this ceremony.
        </p>
      </>
    );
  } else {
    body = (
      <>
        <h1 className="text-2xl font-bold text-gray-300">Decision recorded: {decision}</h1>
        <p className="mt-2 text-gray-400">
          The CA stays inert. HTTPS CONNECT through the aegis-proxy will continue to refuse with
          ASD-010 / 502 until you re-run this ceremony and choose to trust.
        </p>
      </>
    );
  }
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      {body}
      <button
        type="button"
        className="mt-4 px-4 py-2 rounded font-medium bg-gray-700 text-gray-200 hover:bg-gray-600"
        onClick={onContinue}
      >
        Go to AgentFeed →
      </button>
    </div>
  );
}

// ─── Layout primitives ───────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <h2 className="font-semibold text-white mb-2">{title}</h2>
      <div className="text-sm text-gray-300 space-y-2">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="text-gray-500 w-28">{label}</dt>
      <dd className="text-gray-200 break-all">{value}</dd>
    </div>
  );
}

function formatFingerprint(hex: string): string {
  // Group by 4 chars for readability: ab12 cd34 ...
  return hex.match(/.{1,4}/g)?.join(' ') ?? hex;
}
