/**
 * Existential Threat Classifier
 * @rule:XSACT-YK-002 ≥2 independent signals required for EXISTENTIAL classification
 * @rule:INF-XSACT-002 EXISTENTIAL → Mode 3 fires regardless of client default mode
 * @rule:INF-XSACT-007 Single signal → downgrade to HIGH, route to Mode 1
 */

export type ThreatSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'EXISTENTIAL';

export interface ThreatSignal {
  source: string; // e.g. "dark_web_monitor", "credential_stuffing_detector"
  category: ExistentialCategory;
  confidence: number; // 0-1
  evidence: string;
  detected_at: string;
}

export type ExistentialCategory =
  | 'credential_active_stuffing' // C-suite creds on dark web + active stuffing
  | 'executive_physical_exposure' // Executive home address + threat actor context
  | 'live_financial_fraud' // Live phishing, transactions in progress
  | 'ransomware_named_target' // Ransomware group confirmed target announcement
  | 'zero_day_active_exploitation'; // Zero-day actively exploited against company infra

export interface ClassificationResult {
  severity: ThreatSeverity;
  signal_count: number;
  signals: ThreatSignal[];
  categories_confirmed: ExistentialCategory[];
  mode_triggered: 'mode_1' | 'mode_3';
  reasoning: string;
}

/**
 * Classify threat severity from collected signals.
 * @rule:XSACT-YK-002 ≥2 signals → EXISTENTIAL → Mode 3
 * @rule:INF-XSACT-007 1 signal → HIGH → Mode 1 queue
 */
export function classifyThreat(signals: ThreatSignal[]): ClassificationResult {
  // Filter to high-confidence existential signals only (≥0.7)
  const existentialSignals = signals.filter(
    (s) => s.confidence >= 0.7 && isExistentialCategory(s.category)
  );

  const uniqueSources = new Set(existentialSignals.map((s) => s.source));
  const categoriesConfirmed = [...new Set(existentialSignals.map((s) => s.category))];

  // @rule:XSACT-YK-002 ≥2 INDEPENDENT sources required
  if (uniqueSources.size >= 2 && existentialSignals.length >= 2) {
    return {
      severity: 'EXISTENTIAL',
      signal_count: existentialSignals.length,
      signals: existentialSignals,
      categories_confirmed: categoriesConfirmed as ExistentialCategory[],
      mode_triggered: 'mode_3',
      reasoning: `${uniqueSources.size} independent sources confirmed existential threat in categories: ${categoriesConfirmed.join(', ')}. Mode 3 fires. @rule:XSACT-YK-002`,
    };
  }

  // @rule:INF-XSACT-007 Single signal → downgrade to HIGH → Mode 1
  if (existentialSignals.length === 1) {
    return {
      severity: 'HIGH',
      signal_count: 1,
      signals: existentialSignals,
      categories_confirmed: categoriesConfirmed as ExistentialCategory[],
      mode_triggered: 'mode_1',
      reasoning: `Single existential signal detected (source: ${existentialSignals[0]?.source}). Downgraded to HIGH — awaiting second confirmation before Mode 3. @rule:INF-XSACT-007`,
    };
  }

  // Non-existential signals
  const hasHighSignals = signals.some((s) => s.confidence >= 0.8);
  const hasMediumSignals = signals.some((s) => s.confidence >= 0.5);

  return {
    severity: hasHighSignals ? 'CRITICAL' : hasMediumSignals ? 'HIGH' : 'MEDIUM',
    signal_count: signals.length,
    signals,
    categories_confirmed: [],
    mode_triggered: 'mode_1',
    reasoning: 'No existential signals confirmed. Standard threat routing.',
  };
}

function isExistentialCategory(category: string): category is ExistentialCategory {
  return [
    'credential_active_stuffing',
    'executive_physical_exposure',
    'live_financial_fraud',
    'ransomware_named_target',
    'zero_day_active_exploitation',
  ].includes(category);
}
