/**
 * Risk Lookup Screen
 * Enter any domain to get a live risk score + remediation playbook from the backend.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';

import { API_BASE } from '../config';
import { WarriorService, RiskScore, RiskPlaybook } from '../services/WarriorService';

const svc = new WarriorService();

interface AiNarrative {
  domain: string;
  narrative: string;
  model: string;
  generatedAt: string;
}

function levelColor(level: string): string {
  switch (level?.toLowerCase()) {
    case 'critical':
      return '#ef4444';
    case 'high':
      return '#f97316';
    case 'medium':
      return '#eab308';
    case 'low':
      return '#22c55e';
    default:
      return '#6b7280';
  }
}

export function RiskLookupScreen() {
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState<RiskScore | null>(null);
  const [playbook, setPlaybook] = useState<RiskPlaybook | null>(null);
  const [narrative, setNarrative] = useState<AiNarrative | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [narrativeError, setNarrativeError] = useState(false);

  async function lookup() {
    const d = domain
      .trim()
      .replace(/^https?:\/\//, '')
      .split('/')[0];
    if (!d) return;
    setLoading(true);
    setScore(null);
    setPlaybook(null);
    setNarrative(null);
    setNarrativeError(false);
    try {
      const [s, p] = await Promise.all([svc.getRiskScore(d), svc.getRiskPlaybook(d)]);
      setScore(s);
      setPlaybook(p);
      if (!s) Alert.alert('Not found', `No risk data for ${d}`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchNarrative() {
    const d = domain
      .trim()
      .replace(/^https?:\/\//, '')
      .split('/')[0];
    if (!d) return;
    setNarrativeLoading(true);
    setNarrative(null);
    setNarrativeError(false);
    try {
      const res = await fetch(`${API_BASE}/risk/narrative?domain=${encodeURIComponent(d)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AiNarrative = await res.json();
      setNarrative(data);
    } catch {
      setNarrativeError(true);
    } finally {
      setNarrativeLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          value={domain}
          onChangeText={setDomain}
          placeholder="Enter domain (e.g. facebook.com)"
          placeholderTextColor="#4b5563"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onSubmitEditing={lookup}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.btn} onPress={lookup} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.btnText}>Scan</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Risk Score result */}
      {score && (
        <View style={[styles.scoreCard, { borderColor: levelColor(score.level) }]}>
          <View style={styles.scoreHeader}>
            <Text style={styles.scoreDomain}>{score.domain}</Text>
            <View style={[styles.levelBadge, { backgroundColor: levelColor(score.level) + '22' }]}>
              <Text style={[styles.levelText, { color: levelColor(score.level) }]}>
                {score.level?.toUpperCase() ?? 'UNKNOWN'}
              </Text>
            </View>
          </View>
          <Text style={[styles.scoreNum, { color: levelColor(score.level) }]}>
            {score.score}
            <Text style={styles.scoreMax}>/100</Text>
          </Text>
          {score.categories?.length > 0 && (
            <View style={styles.chips}>
              {score.categories.map((c, i) => (
                <Text key={i} style={styles.chip}>
                  {c}
                </Text>
              ))}
            </View>
          )}
          {score.lastSeen && <Text style={styles.lastSeen}>Last seen: {score.lastSeen}</Text>}
        </View>
      )}

      {/* AI Threat Brief */}
      {score && (
        <View style={styles.narrativeSection}>
          {!narrative && !narrativeLoading && !narrativeError && (
            <TouchableOpacity style={styles.narrativeBtn} onPress={fetchNarrative}>
              <Text style={styles.narrativeBtnText}>Get AI Brief</Text>
            </TouchableOpacity>
          )}
          {narrativeLoading && (
            <View style={styles.narrativeCard}>
              <ActivityIndicator color="#7c3aed" size="small" />
            </View>
          )}
          {narrativeError && !narrativeLoading && (
            <View style={styles.narrativeCard}>
              <Text style={styles.narrativeErrorText}>AI Brief unavailable</Text>
            </View>
          )}
          {narrative && !narrativeLoading && (
            <View style={styles.narrativeCard}>
              <View style={styles.narrativeBadge}>
                <Text style={styles.narrativeBadgeText}>AI BRIEF</Text>
              </View>
              <Text style={styles.narrativeText}>{narrative.narrative}</Text>
              <Text style={styles.narrativeTimestamp}>
                {new Date(narrative.generatedAt).toLocaleString()} · {narrative.model}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Playbook */}
      {playbook?.steps?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Remediation Playbook</Text>
          {playbook.steps.map((step, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDesc}>{step.description}</Text>
                {step.command && <Text style={styles.command}>{step.command}</Text>}
              </View>
            </View>
          ))}
        </View>
      )}

      {!score && !loading && (
        <View style={styles.hint}>
          <Text style={styles.hintText}>
            Enter any domain to check its threat level and get a fix playbook.
          </Text>
          <Text style={styles.hintExample}>
            Try: google-analytics.com, doubleclick.net, facebook.com
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080c14' },
  searchRow: { flexDirection: 'row', padding: 16, gap: 10 },
  input: {
    flex: 1,
    backgroundColor: '#111827',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  btn: {
    backgroundColor: '#1d4ed8',
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  scoreCard: {
    margin: 16,
    marginTop: 0,
    padding: 20,
    backgroundColor: '#111827',
    borderRadius: 14,
    borderWidth: 1,
  },
  scoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  scoreDomain: { color: '#e5e7eb', fontSize: 16, fontWeight: '700', flex: 1 },
  levelBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  levelText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  scoreNum: { fontSize: 52, fontWeight: '900', lineHeight: 56 },
  scoreMax: { fontSize: 20, color: '#6b7280', fontWeight: '400' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: {
    backgroundColor: '#1f2937',
    color: '#9ca3af',
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  lastSeen: { color: '#4b5563', fontSize: 11, marginTop: 10 },
  section: { margin: 16, marginTop: 0 },
  sectionTitle: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  step: { flexDirection: 'row', marginBottom: 16 },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1d4ed8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    flexShrink: 0,
    marginTop: 2,
  },
  stepNumText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  stepBody: { flex: 1 },
  stepTitle: { color: '#e5e7eb', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  stepDesc: { color: '#9ca3af', fontSize: 13, lineHeight: 19 },
  command: {
    fontFamily: 'monospace',
    backgroundColor: '#0f172a',
    color: '#34d399',
    fontSize: 12,
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  hint: { padding: 32, alignItems: 'center' },
  hintText: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 12,
  },
  hintExample: { color: '#374151', fontSize: 12, textAlign: 'center' },
  narrativeSection: { marginHorizontal: 16, marginBottom: 16 },
  narrativeBtn: {
    backgroundColor: '#4c1d95',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  narrativeBtnText: { color: '#e9d5ff', fontWeight: '700', fontSize: 14 },
  narrativeCard: {
    backgroundColor: '#1a1f2e',
    borderRadius: 12,
    padding: 16,
    minHeight: 48,
    justifyContent: 'center',
  },
  narrativeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#7c3aed',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  narrativeBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  narrativeText: {
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 20,
  },
  narrativeTimestamp: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 10,
  },
  narrativeErrorText: {
    color: '#6b7280',
    fontSize: 13,
    textAlign: 'center',
  },
});
