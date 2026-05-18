/* SPDX-License-Identifier: AGPL-3.0-only */
// ConsentDialog — dedicated first-class component for ANY consent ceremony
// in ankrshield-desktop (ASD-T-019 / FR-21 / ASD-YK-007).
//
// Every presentation produces a PRAMANA-shape consent record via the main
// process's ConsentStore. Every decision produces a paired record linked via
// impression_consent_record_id. The consent_record_id is exposed to the
// caller via onDecided so business calls (resolve TOFU, resolve DAN, install
// CA) can stamp the record id onto downstream audit entries.
//
// Required props enforce the FR-21 contract — no fields are optional that
// the spec lists as mandatory. Body content is composed via `children` so
// each ceremony can render its own form fields (budget input for TOFU,
// tool list for DAN, CA fingerprint for root-CA) without duplicating the
// purpose/consequences/revocation framing.

import { ReactNode, useEffect, useRef, useState } from 'react';

export interface ConsentDialogProps {
  /** Stable identifier for this ceremony (e.g. 'tofu-consent', 'dan-gate'). */
  ceremony: string;
  /**
   * Subject the user is consenting about. App ID + hostname for TOFU,
   * tools list + appId for DAN, etc. Logged verbatim into the PRAMANA
   * record's subject field.
   */
  subject: Record<string, unknown>;
  /** What action the user is being asked to authorise. PRAMANA: context.purpose. */
  purpose: string;
  /** What changes if they say yes. PRAMANA: context.consequences. */
  consequences: string;
  /** How they undo the decision later. PRAMANA: context.revocation_path. */
  revocation_path: string;
  /** Optional headline; defaults to "Consent required". */
  title?: string;
  /** Visual variant: tofu (yellow) | dan (red) | ceremony (blue). */
  variant?: 'tofu' | 'dan' | 'ceremony';
  /** Whether the dialog can be skipped (renders a Skip button). */
  allowSkip?: boolean;
  /**
   * Whether Allow is disabled. Used by TOFU to gate on the mandatory budget
   * input (ASD-005 — no unbounded allow). Errors are shown by the caller.
   */
  allowDisabled?: boolean;
  /**
   * Called when the user resolves the dialog. `consent_record_id` is the
   * id of the PRAMANA *decision* record (not the impression). Returns a
   * Promise so the dialog can show submitting state.
   */
  onDecided: (input: {
    decision: 'allow' | 'deny' | 'skip';
    consent_record_id: string;
  }) => void | Promise<void>;
  /** Body content — form fields specific to this ceremony. */
  children?: ReactNode;
  /** Label override for the Allow button (default: "Allow"). */
  allowLabel?: string;
  /** Label override for the Deny button (default: "Deny"). */
  denyLabel?: string;
}

const VARIANT_CLASSES: Record<
  NonNullable<ConsentDialogProps['variant']>,
  {
    wrapper: string;
    title: string;
    description: string;
    allow: string;
  }
> = {
  tofu: {
    wrapper: 'bg-yellow-900/40 border border-yellow-600',
    title: 'text-yellow-200',
    description: 'text-yellow-300',
    allow: 'bg-ankr-green hover:bg-green-600',
  },
  dan: {
    wrapper: 'bg-red-900/40 border border-red-600',
    title: 'text-red-200',
    description: 'text-red-300',
    allow: 'bg-ankr-green hover:bg-green-600',
  },
  ceremony: {
    wrapper: 'bg-blue-900/40 border border-blue-600',
    title: 'text-blue-200',
    description: 'text-blue-300',
    allow: 'bg-ankr-green hover:bg-green-600',
  },
};

export function ConsentDialog(props: ConsentDialogProps) {
  const {
    ceremony,
    subject,
    purpose,
    consequences,
    revocation_path,
    title = 'Consent required',
    variant = 'tofu',
    allowSkip = false,
    allowDisabled = false,
    onDecided,
    children,
    allowLabel = 'Allow',
    denyLabel = 'Deny',
  } = props;

  const [impressionId, setImpressionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // useRef + bool flag so React strict-mode double-mount doesn't fire two impressions.
  const impressionFiredRef = useRef(false);

  const styles = VARIANT_CLASSES[variant];
  const context = { purpose, consequences, revocation_path };

  useEffect(() => {
    if (impressionFiredRef.current) return;
    impressionFiredRef.current = true;
    const api = window.electronAPI;
    if (!api?.aegisProxyRecordConsentImpression) return;
    void api
      .aegisProxyRecordConsentImpression({ ceremony, subject, context })
      .then((r) => setImpressionId(r.consent_record_id))
      .catch(() => {
        // PRAMANA write failure is non-fatal for the dialog itself;
        // we still allow the user to decide. The decision call carries
        // its own try/catch.
      });
    // We intentionally omit subject/context from deps — the dialog
    // represents one ceremony presentation; remounting on prop change
    // would create spurious impression records.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (decision: 'allow' | 'deny' | 'skip') => {
    if (submitting) return;
    setSubmitting(true);
    const api = window.electronAPI;
    let recordId = '';
    if (api?.aegisProxyRecordConsentDecision) {
      try {
        const r = await api.aegisProxyRecordConsentDecision({
          ceremony,
          decision,
          subject,
          context,
          impression_consent_record_id: impressionId ?? undefined,
        });
        recordId = r.consent_record_id;
      } catch {
        // Audit write failed — proceed but emit empty id. Caller can detect
        // and surface a warning to the user if it cares.
      }
    }
    try {
      await onDecided({ decision, consent_record_id: recordId });
    } finally {
      // Don't reset submitting — the dialog will be unmounted by the parent
      // on successful resolution. If the parent re-renders us we'll be
      // a fresh instance.
    }
  };

  return (
    <section className={`${styles.wrapper} rounded-lg p-4 space-y-3`}>
      <header>
        <h3 className={`font-semibold ${styles.title}`}>{title}</h3>
        <p className={`text-xs ${styles.description}`}>{purpose}</p>
      </header>
      <dl className="text-xs space-y-1 text-gray-300">
        <div>
          <dt className="font-semibold text-gray-200 inline">Consequences: </dt>
          <dd className="inline">{consequences}</dd>
        </div>
        <div>
          <dt className="font-semibold text-gray-200 inline">Revocation: </dt>
          <dd className="inline">{revocation_path}</dd>
        </div>
        {impressionId ? (
          <div className="text-[10px] font-mono text-gray-500 mt-1">
            impression: {impressionId.slice(0, 8)}…
          </div>
        ) : null}
      </dl>
      {children ? <div className="bg-gray-900/60 rounded p-2">{children}</div> : null}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={submitting || allowDisabled}
          onClick={() => void submit('allow')}
          className={`px-3 py-1.5 rounded font-medium text-sm text-white disabled:opacity-50 ${styles.allow}`}
        >
          {allowLabel}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void submit('deny')}
          className="px-3 py-1.5 rounded font-medium text-sm bg-red-700/70 text-white hover:bg-red-700 disabled:opacity-50"
        >
          {denyLabel}
        </button>
        {allowSkip ? (
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit('skip')}
            className="px-3 py-1.5 rounded font-medium text-sm bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-50"
          >
            Skip for now
          </button>
        ) : null}
      </div>
    </section>
  );
}
