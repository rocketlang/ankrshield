/**
 * NetworkBehaviorScreen — A4
 * Per-app network behavior analysis.
 * Philosophy: consent-aware, surgical inhibition — block only excess scope calls,
 * never the whole app, never connections that belong to the app's stated purpose.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
  StatusBar,
} from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Connection {
  domain: string;
  country: string;
  dataKB: number;
  expected: boolean;
  blocked: boolean;
}

interface AppConnection {
  packageName: string;
  appName: string;
  category: string;
  connections: Connection[];
}

// ─── Country flag helper ──────────────────────────────────────────────────────

const COUNTRY_FLAGS: Record<string, string> = {
  CN: '\uD83C\uDDE8\uD83C\uDDF3',
  RU: '\uD83C\uDDF7\uD83C\uDDFA',
  US: '\uD83C\uDDFA\uD83C\uDDF8',
  SG: '\uD83C\uDDF8\uD83C\uDDEC',
  IN: '\uD83C\uDDEE\uD83C\uDDF3',
};

function countryFlag(code: string): string {
  return COUNTRY_FLAGS[code] ?? code;
}

function formatData(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_APP_CONNECTIONS: AppConnection[] = [
  {
    packageName: 'com.whatsapp',
    appName: 'WhatsApp',
    category: 'messaging',
    connections: [
      { domain: 'e2.whatsapp.net', country: 'US', dataKB: 1240, expected: true, blocked: false },
      { domain: 'mmg.whatsapp.net', country: 'US', dataKB: 890, expected: true, blocked: false },
    ],
  },
  {
    packageName: 'com.superclean.booster',
    appName: 'Super Cleaner Pro',
    category: 'system_tool',
    connections: [
      {
        domain: 'analytics.superclean.com',
        country: 'CN',
        dataKB: 340,
        expected: false,
        blocked: false,
      },
      {
        domain: 'tracker.mobvista.com',
        country: 'SG',
        dataKB: 120,
        expected: false,
        blocked: false,
      },
      { domain: 'cdn.superclean.com', country: 'CN', dataKB: 88, expected: true, blocked: false },
    ],
  },
  {
    packageName: 'com.flashlight.turbo',
    appName: 'Flashlight Turbo',
    category: 'unknown',
    connections: [
      {
        domain: 'data.harvest-api.ru',
        country: 'RU',
        dataKB: 560,
        expected: false,
        blocked: false,
      },
      { domain: 'ads.admob.com', country: 'US', dataKB: 45, expected: false, blocked: false },
    ],
  },
  {
    packageName: 'com.netflix.mediaclient',
    appName: 'Netflix',
    category: 'streaming',
    connections: [
      { domain: 'nflxvideo.net', country: 'US', dataKB: 45600, expected: true, blocked: false },
      { domain: 'nflximg.net', country: 'US', dataKB: 1200, expected: true, blocked: false },
    ],
  },
  {
    packageName: 'com.hdfc.mobilebanking',
    appName: 'HDFC MobileBanking',
    category: 'banking',
    connections: [
      {
        domain: 'netbanking.hdfcbank.com',
        country: 'IN',
        dataKB: 780,
        expected: true,
        blocked: false,
      },
      { domain: 'api.hdfcbank.com', country: 'IN', dataKB: 340, expected: true, blocked: false },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function NetworkBehaviorScreen() {
  // Per-connection block toggle state: "packageName::domain" -> boolean
  const [blockState, setBlockState] = useState<Record<string, boolean>>({});
  // Per-app expected-section expand state
  const [expectedOpen, setExpectedOpen] = useState<Record<string, boolean>>({});

  function toggleBlock(pkg: string, domain: string) {
    const key = `${pkg}::${domain}`;
    setBlockState((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function isConnectionBlocked(pkg: string, domain: string): boolean {
    return !!blockState[`${pkg}::${domain}`];
  }

  function toggleExpected(pkg: string) {
    setExpectedOpen((prev) => ({ ...prev, [pkg]: !prev[pkg] }));
  }

  // Summary stats
  const suspiciousTotal = MOCK_APP_CONNECTIONS.reduce(
    (acc, app) => acc + app.connections.filter((c) => !c.expected).length,
    0
  );
  const appsWithSuspicious = MOCK_APP_CONNECTIONS.filter((app) =>
    app.connections.some((c) => !c.expected)
  ).length;

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#080c14" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Network Behavior</Text>
        <Text style={s.subtitle}>Per-app connection analysis — block only excess scope</Text>
      </View>

      {/* Summary bar */}
      <View style={s.summaryBar}>
        <Text style={s.summaryText}>
          <Text style={s.summaryAmber}>{suspiciousTotal} suspicious connections</Text>
          {` detected across ${appsWithSuspicious} apps`}
        </Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {MOCK_APP_CONNECTIONS.map((app) => {
          const unexpected = app.connections.filter((c) => !c.expected);
          const expected = app.connections.filter((c) => c.expected);
          const totalDataKB = app.connections.reduce((acc, c) => acc + c.dataKB, 0);
          const allExpected = unexpected.length === 0;
          const isExpOpen = !!expectedOpen[app.packageName];

          return (
            <View key={app.packageName} style={s.card}>
              {/* Card header: app name + category + total data */}
              <View style={s.cardHeader}>
                <View style={s.cardHeaderLeft}>
                  <Text style={s.appName}>{app.appName}</Text>
                  <View style={s.categoryRow}>
                    <View style={s.categoryBadge}>
                      <Text style={s.categoryText}>{app.category.replace(/_/g, ' ')}</Text>
                    </View>
                    <Text style={s.totalData}>{formatData(totalDataKB)} sent</Text>
                  </View>
                </View>
              </View>

              {/* All-clean green line (WhatsApp, Netflix, HDFC) */}
              {allExpected && (
                <View style={s.allCleanRow}>
                  <Text style={s.allCleanText}>{'✓ All connections within purpose'}</Text>
                  {/* Collapsed expected section toggle */}
                  <TouchableOpacity onPress={() => toggleExpected(app.packageName)}>
                    <Text style={s.showExpected}>
                      {`Expected (${expected.length}) ${isExpOpen ? '▲' : '▼'}`}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Unexpected connections — amber section */}
              {unexpected.length > 0 && (
                <View style={s.unexpectedSection}>
                  <Text style={s.unexpectedHeader}>
                    {`${unexpected.length} unexpected connection${unexpected.length > 1 ? 's' : ''}`}
                  </Text>
                  {unexpected.map((conn) => {
                    const blocked = isConnectionBlocked(app.packageName, conn.domain);
                    return (
                      <View key={conn.domain} style={s.connRow}>
                        <View style={s.connInfo}>
                          <Text
                            style={[s.connDomain, blocked && s.connDomainBlocked]}
                            numberOfLines={1}
                          >
                            {conn.domain}
                          </Text>
                          <Text style={s.connMeta}>
                            {`${countryFlag(conn.country)} ${conn.country}  ·  ${formatData(conn.dataKB)}`}
                          </Text>
                        </View>
                        <View style={s.connRight}>
                          {blocked && (
                            <View style={s.blockedBadge}>
                              <Text style={s.blockedBadgeText}>BLOCKED</Text>
                            </View>
                          )}
                          <Switch
                            value={blocked}
                            onValueChange={() => toggleBlock(app.packageName, conn.domain)}
                            trackColor={{ false: '#1e293b', true: '#7f1d1d' }}
                            thumbColor={blocked ? '#fca5a5' : '#475569'}
                          />
                        </View>
                      </View>
                    );
                  })}
                  <Text style={s.surgicalNote}>
                    Only these specific calls will be blocked — app continues to work normally
                  </Text>
                </View>
              )}

              {/* Expected connections — collapsed grey section */}
              {!allExpected && expected.length > 0 && (
                <View style={s.expectedSection}>
                  <TouchableOpacity
                    style={s.expectedToggle}
                    onPress={() => toggleExpected(app.packageName)}
                  >
                    <Text style={s.expectedToggleText}>
                      {`Expected (${expected.length}) ${isExpOpen ? '▲' : '▼'}`}
                    </Text>
                  </TouchableOpacity>
                  {isExpOpen &&
                    expected.map((conn) => (
                      <View key={conn.domain} style={s.expectedRow}>
                        <Text style={s.expectedDomain} numberOfLines={1}>
                          {conn.domain}
                        </Text>
                        <Text style={s.expectedMeta}>
                          {`${countryFlag(conn.country)} ${conn.country}  ·  ${formatData(conn.dataKB)}`}
                        </Text>
                      </View>
                    ))}
                </View>
              )}

              {/* All-clean expanded expected list */}
              {allExpected &&
                isExpOpen &&
                expected.map((conn) => (
                  <View key={conn.domain} style={s.expectedRow}>
                    <Text style={s.expectedDomain} numberOfLines={1}>
                      {conn.domain}
                    </Text>
                    <Text style={s.expectedMeta}>
                      {`${countryFlag(conn.country)} ${conn.country}  ·  ${formatData(conn.dataKB)}`}
                    </Text>
                  </View>
                ))}
            </View>
          );
        })}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080c14' },

  header: {
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 16,
    backgroundColor: '#0d1117',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  title: { color: '#f1f5f9', fontSize: 22, fontWeight: '700' },
  subtitle: { color: '#64748b', fontSize: 13, marginTop: 4 },

  summaryBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#1a1200',
    borderBottomWidth: 1,
    borderBottomColor: '#78350f',
  },
  summaryText: { color: '#92400e', fontSize: 13, fontWeight: '500' },
  summaryAmber: { color: '#fbbf24', fontWeight: '700' },

  scroll: { flex: 1 },
  scrollContent: { padding: 12 },

  card: {
    backgroundColor: '#0d1117',
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 14,
  },
  cardHeaderLeft: { flex: 1 },
  appName: { color: '#e2e8f0', fontSize: 15, fontWeight: '700' },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  categoryBadge: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  categoryText: { color: '#94a3b8', fontSize: 11, textTransform: 'capitalize' },
  totalData: { color: '#475569', fontSize: 12 },

  // All-clean green indicator
  allCleanRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  allCleanText: { color: '#4ade80', fontSize: 13, fontWeight: '600' },
  showExpected: { color: '#475569', fontSize: 12 },

  // Unexpected amber section
  unexpectedSection: {
    backgroundColor: '#1a0a0a',
    borderTopWidth: 1,
    borderTopColor: '#450a0a',
    padding: 12,
  },
  unexpectedHeader: { color: '#fca5a5', fontSize: 12, fontWeight: '700', marginBottom: 8 },

  connRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2d0a0a',
  },
  connInfo: { flex: 1, marginRight: 10 },
  connDomain: { color: '#f1f5f9', fontSize: 13, fontWeight: '600' },
  connDomainBlocked: { textDecorationLine: 'line-through', color: '#6b7280' },
  connMeta: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  connRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  blockedBadge: {
    backgroundColor: '#450a0a',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  blockedBadgeText: { color: '#fca5a5', fontSize: 10, fontWeight: '800' },

  surgicalNote: {
    color: '#78350f',
    fontSize: 11,
    marginTop: 10,
    fontStyle: 'italic',
    lineHeight: 16,
  },

  // Expected grey section
  expectedSection: {
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  expectedToggle: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  expectedToggleText: { color: '#475569', fontSize: 12 },

  expectedRow: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#161b22',
  },
  expectedDomain: { color: '#4b5563', fontSize: 12 },
  expectedMeta: { color: '#374151', fontSize: 11, marginTop: 2 },
});
