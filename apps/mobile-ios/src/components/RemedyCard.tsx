/**
 * RemedyCard — the reusable "every alert carries a remedy" primitive.
 *
 * Founder law (2026-07-11): an alert without a remedy is a loose assurance. A warning
 * that only tells the user something is wrong, with no button to act, is not protection.
 * Every alert surface should render through this card so the remedy is never optional.
 *
 * Prop-driven and threat-agnostic — no imports from any specific feature. The ransomware
 * feed is the first adopter; ThreatAlerts / Network / others adopt it next.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export type Severity = 'critical' | 'advisory';

export interface RemedyAction {
  label: string;
  kind?: 'primary' | 'neutral';
  onPress: () => void;
}

interface RemedyCardProps {
  icon: string;
  title: string;
  severity: Severity;
  detail: string;
  /** Optional monospace sub-line, e.g. the file path or domain the alert concerns. */
  subPath?: string;
  remedies: RemedyAction[];
}

const SEVERITY = {
  critical: { color: '#ef4444', bg: '#1a0a0a' },
  advisory: { color: '#eab308', bg: '#161207' },
} as const;

export function RemedyCard({ icon, title, severity, detail, subPath, remedies }: RemedyCardProps) {
  const sev = SEVERITY[severity] ?? SEVERITY.critical;
  return (
    <View style={[s.card, { borderLeftColor: sev.color, backgroundColor: sev.bg }]}>
      <View style={s.header}>
        <Text style={s.icon}>{icon}</Text>
        <Text style={[s.title, { color: sev.color }]}>{title}</Text>
        {severity === 'advisory' && <Text style={s.advisoryTag}>likely safe</Text>}
      </View>
      <Text style={s.detail}>{detail}</Text>
      {subPath ? (
        <Text style={s.subPath} numberOfLines={2}>
          {subPath}
        </Text>
      ) : null}
      {remedies.length > 0 && (
        <View style={s.actions}>
          {remedies.map((r, i) => (
            <TouchableOpacity
              key={`${r.label}-${i}`}
              style={[s.btn, r.kind === 'primary' ? s.btnPrimary : s.btnNeutral]}
              onPress={r.onPress}
            >
              <Text style={[s.btnTxt, r.kind === 'primary' ? s.btnTxtPrimary : s.btnTxtNeutral]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 10,
    borderLeftWidth: 4,
    padding: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  icon: { fontSize: 18 },
  title: { flex: 1, fontSize: 13, fontWeight: '700' },
  advisoryTag: {
    color: '#a16207',
    fontSize: 10,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: '#a16207',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  detail: { color: '#d1d5db', fontSize: 12, marginBottom: 4 },
  subPath: { color: '#4b5563', fontSize: 10, fontFamily: 'monospace', marginBottom: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  btn: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  btnPrimary: { backgroundColor: '#dc2626' },
  btnNeutral: { backgroundColor: '#1f2937', borderWidth: 1, borderColor: '#374151' },
  btnTxt: { fontSize: 12, fontWeight: '700' },
  btnTxtPrimary: { color: '#fff' },
  btnTxtNeutral: { color: '#e5e7eb' },
});
