/**
 * MitreHeatmap — MITRE ATT&CK Enterprise tactic heatmap.
 *
 * Renders a 7-column (desktop) / 4-column (mobile) grid of the 14 Enterprise
 * tactics. Each cell is colored by how many scan findings map to that tactic:
 *   0        → gray-800 (no hit)
 *   1–2      → yellow-900/50 + yellow text
 *   3+       → red-900/50 + red text
 *
 * Props:
 *   findings — array of objects, each optionally containing
 *              { mitre?: { tactic: string; technique: string } }
 */

import { ShieldOff } from 'lucide-react';

interface MitreFinding {
  mitre?: {
    tactic: string;
    technique: string;
  };
}

interface MitreHeatmapProps {
  findings: MitreFinding[];
}

// Canonical 14 Enterprise ATT&CK tactics (v15), in kill-chain order
const TACTICS: string[] = [
  'Reconnaissance',
  'Resource Development',
  'Initial Access',
  'Execution',
  'Persistence',
  'Privilege Escalation',
  'Defense Evasion',
  'Credential Access',
  'Discovery',
  'Lateral Movement',
  'Collection',
  'Command and Control',
  'Exfiltration',
  'Impact',
];

// Normalise tactic strings before comparison
function normaliseTactic(t: string): string {
  return t.trim().toLowerCase().replace(/[-_]/g, ' ');
}

function buildCounts(findings: MitreFinding[]): Map<string, number> {
  const counts = new Map<string, number>(
    TACTICS.map((t) => [t, 0])
  );

  for (const f of findings) {
    if (!f.mitre?.tactic) continue;
    const norm = normaliseTactic(f.mitre.tactic);

    // Match against canonical list
    for (const canonical of TACTICS) {
      if (normaliseTactic(canonical) === norm) {
        counts.set(canonical, (counts.get(canonical) ?? 0) + 1);
        break;
      }
    }
  }

  return counts;
}

interface CellStyles {
  container: string;
  count: string;
  label: string;
}

function getCellStyles(count: number): CellStyles {
  if (count === 0) {
    return {
      container: 'bg-gray-800 border border-gray-700/50',
      count: 'text-gray-600',
      label: 'text-gray-500',
    };
  }
  if (count <= 2) {
    return {
      container: 'bg-yellow-900/50 border border-yellow-700/50',
      count: 'text-yellow-300 font-bold',
      label: 'text-yellow-400/80',
    };
  }
  return {
    container: 'bg-red-900/50 border border-red-700/50',
    count: 'text-red-300 font-bold',
    label: 'text-red-400/80',
  };
}

export default function MitreHeatmap({ findings }: MitreHeatmapProps) {
  const validFindings = findings ?? [];
  const counts = buildCounts(validFindings);

  const totalHits = Array.from(counts.values()).reduce((a, b) => a + b, 0);

  if (validFindings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <ShieldOff className="w-8 h-8 text-gray-700" />
        <p className="text-sm text-gray-500">
          No MITRE ATT&amp;CK mappings detected
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">
          MITRE ATT&amp;CK Enterprise v15 — 14 tactics
        </span>
        <span className="text-gray-400">
          <span className="text-white font-semibold">{totalHits}</span> finding
          {totalHits !== 1 ? 's' : ''} mapped
        </span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-gray-800 border border-gray-700 inline-block" />
          No hit
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-yellow-900/70 border border-yellow-700/50 inline-block" />
          1–2 hits
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-900/70 border border-red-700/50 inline-block" />
          3+ hits
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-4 md:grid-cols-7 gap-1.5">
        {TACTICS.map((tactic) => {
          const count = counts.get(tactic) ?? 0;
          const styles = getCellStyles(count);

          return (
            <div
              key={tactic}
              title={`${tactic}: ${count} finding${count !== 1 ? 's' : ''}`}
              className={`rounded-lg p-2 text-center transition-all duration-200 hover:scale-105 cursor-default ${styles.container}`}
            >
              {/* Count */}
              <div className={`text-base leading-none mb-1 ${styles.count}`}>
                {count}
              </div>
              {/* Tactic name — abbreviated to keep cells compact */}
              <div
                className={`text-[9px] leading-tight ${styles.label} break-words`}
              >
                {tactic}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
