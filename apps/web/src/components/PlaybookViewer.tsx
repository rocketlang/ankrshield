/**
 * PlaybookViewer — Remediation playbook renderer for xShield STARTER+ users.
 *
 * Behaviour:
 *   tier === 'FREE'   → upgrade prompt (violet border, Lock icon)
 *   playbook === null → skeleton loader
 *   else              → ordered list of remediation actions
 *     - Numbered step badge (violet)
 *     - Title (white) + description (gray-400)
 *     - command? → dark code block (green monospace) + Copy button
 *     - yaml?    → dark code block (blue monospace) + Download YAML button
 */

import { useState } from 'react';
import {
  Lock,
  Copy,
  Check,
  Download,
  Terminal,
  FileCode2,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';

interface PlaybookAction {
  type: string;
  title: string;
  description: string;
  command?: string;
  yaml?: string;
}

interface Playbook {
  domain: string;
  actions: PlaybookAction[];
}

interface PlaybookViewerProps {
  playbook: Playbook | null;
  tier: string;
}

// ── Upgrade prompt ────────────────────────────────────────────────────────────

function UpgradePrompt() {
  return (
    <div className="rounded-xl border border-violet-500/40 bg-violet-950/30 p-6 flex flex-col items-center text-center gap-4">
      <div className="w-14 h-14 rounded-full bg-violet-900/50 border border-violet-500/40 flex items-center justify-center">
        <Lock className="w-6 h-6 text-violet-400" />
      </div>
      <div>
        <h3 className="text-white font-semibold text-base mb-1">
          Remediation Playbooks — STARTER+
        </h3>
        <p className="text-sm text-gray-400 max-w-sm">
          Upgrade to <span className="text-violet-300 font-medium">STARTER</span> or
          higher to unlock AI-generated step-by-step remediation playbooks, DNS
          fixes, port lockdowns, phishing takedowns, and more.
        </p>
      </div>
      <a
        href="https://xshieldai.com/pricing"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition"
      >
        <Sparkles className="w-4 h-4" />
        Upgrade to STARTER
      </a>
    </div>
  );
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function SkeletonLoader() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-4">
          <div className="w-8 h-8 rounded-full bg-gray-700 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-700 rounded w-1/3" />
            <div className="h-3 bg-gray-800 rounded w-2/3" />
            <div className="h-3 bg-gray-800 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Copy button (toggles to checkmark for 2s) ─────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable in some embedded contexts
    }
  };

  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition px-2 py-1 rounded hover:bg-gray-700"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-emerald-400">Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          Copy
        </>
      )}
    </button>
  );
}

// ── YAML download button ──────────────────────────────────────────────────────

function DownloadYamlButton({ yaml, domain, title }: { yaml: string; domain: string; title: string }) {
  const handleDownload = () => {
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filename = `xshield-${domain}-${title.toLowerCase().replace(/\s+/g, '-')}.yaml`;
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleDownload}
      title="Download YAML"
      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition px-2 py-1 rounded hover:bg-gray-700"
    >
      <Download className="w-3.5 h-3.5" />
      Download YAML
    </button>
  );
}

// ── Action type badge color ────────────────────────────────────────────────────

const ACTION_TYPE_COLORS: Record<string, string> = {
  dns_fix: 'bg-blue-900/50 text-blue-300 border-blue-700/50',
  port_lockdown: 'bg-orange-900/50 text-orange-300 border-orange-700/50',
  phishing_takedown: 'bg-red-900/50 text-red-300 border-red-700/50',
  breach_response: 'bg-rose-900/50 text-rose-300 border-rose-700/50',
  secret_rotation: 'bg-yellow-900/50 text-yellow-300 border-yellow-700/50',
  typosquat_monitoring: 'bg-purple-900/50 text-purple-300 border-purple-700/50',
  cicd: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50',
};

function actionTypeBadgeClass(type: string): string {
  return (
    ACTION_TYPE_COLORS[type] ?? 'bg-gray-800 text-gray-400 border-gray-600'
  );
}

// ── Single action step ────────────────────────────────────────────────────────

function ActionStep({
  action,
  index,
  domain,
}: {
  action: PlaybookAction;
  index: number;
  domain: string;
}) {
  const [expanded, setExpanded] = useState(index === 0); // first step open by default

  return (
    <div className="flex gap-4">
      {/* Step number */}
      <div className="flex flex-col items-center shrink-0">
        <div className="w-8 h-8 rounded-full bg-violet-900/60 border border-violet-500/50 flex items-center justify-center text-xs font-bold text-violet-300">
          {index + 1}
        </div>
        {/* Connector line — shown between steps */}
        <div className="flex-1 w-px bg-gray-700/60 mt-1" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-6 min-w-0">
        {/* Header row */}
        <div
          className="flex items-center gap-2 cursor-pointer group"
          onClick={() => setExpanded((v) => !v)}
        >
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide border ${actionTypeBadgeClass(action.type)}`}
          >
            {action.type.replace(/_/g, ' ')}
          </span>
          <span className="text-white font-semibold text-sm flex-1 group-hover:text-violet-200 transition">
            {action.title}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
          )}
        </div>

        {/* Expandable body */}
        {expanded && (
          <div className="mt-2 space-y-3">
            {/* Description */}
            <p className="text-sm text-gray-400 leading-relaxed">
              {action.description}
            </p>

            {/* Command block */}
            {action.command && (
              <div className="rounded-lg overflow-hidden border border-gray-700">
                <div className="flex items-center justify-between bg-gray-800 px-3 py-1.5 border-b border-gray-700">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Terminal className="w-3.5 h-3.5" />
                    Shell command
                  </div>
                  <CopyButton text={action.command} />
                </div>
                <div className="bg-gray-950 px-4 py-3 overflow-x-auto">
                  <pre className="text-xs font-mono text-green-400 whitespace-pre">
                    {action.command}
                  </pre>
                </div>
              </div>
            )}

            {/* YAML block */}
            {action.yaml && (
              <div className="rounded-lg overflow-hidden border border-gray-700">
                <div className="flex items-center justify-between bg-gray-800 px-3 py-1.5 border-b border-gray-700">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <FileCode2 className="w-3.5 h-3.5" />
                    YAML config
                  </div>
                  <div className="flex items-center gap-1">
                    <CopyButton text={action.yaml} />
                    <DownloadYamlButton
                      yaml={action.yaml}
                      domain={domain}
                      title={action.title}
                    />
                  </div>
                </div>
                <div className="bg-gray-950 px-4 py-3 overflow-x-auto max-h-60">
                  <pre className="text-xs font-mono text-blue-300 whitespace-pre">
                    {action.yaml}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function PlaybookViewer({ playbook, tier }: PlaybookViewerProps) {
  const isFreeTier = tier?.toUpperCase() === 'FREE';

  if (isFreeTier) {
    return <UpgradePrompt />;
  }

  if (playbook === null) {
    return <SkeletonLoader />;
  }

  if (!playbook.actions || playbook.actions.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-gray-500">
        No remediation actions required — domain posture looks healthy.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="mb-4 pb-3 border-b border-gray-700">
        <p className="text-xs text-gray-500">
          Remediation playbook for{' '}
          <span className="text-white font-medium">{playbook.domain}</span>
          {' '}— {playbook.actions.length} action{playbook.actions.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Steps */}
      {playbook.actions.map((action, i) => (
        <ActionStep
          key={`${action.type}-${i}`}
          action={action}
          index={i}
          domain={playbook.domain}
        />
      ))}
    </div>
  );
}
