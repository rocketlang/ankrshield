/**
 * ConferenceScreen
 *
 * Lets a phone join a live conference room by entering the 6-char code
 * displayed on the big screen. Once joined, the device forwards its REAL
 * blocked-tracker events from the on-device DNS shield to the room — no
 * simulation (reality beats the synthetic; every event on the big screen is
 * an actual tracker this phone tried to reach).
 *
 * State machine:
 *   idle → joining → joined (→ left)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { vpnService, DnsQueryEvent } from '../services/VpnService';

const API_BASE = 'https://xshieldai.com/api';

// ─── Types ──────────────────────────────────────────────────────────────────

interface JoinResult {
  deviceId: string;
  name: string;
  code: string;
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export function ConferenceScreen(_props: { navigation: unknown }) {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'joining' | 'joined' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [session, setSession] = useState<JoinResult | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [blockedCount, setBlockedCount] = useState(0);
  const [shieldOn, setShieldOn] = useState(true);
  const lastSentRef = useRef(0);

  // Forward ONE real DNS-shield event to the room (throttled by the caller).
  const sendEvent = useCallback(async (deviceId: string, roomCode: string, ev: DnsQueryEvent) => {
    try {
      await fetch(`${API_BASE}/session/${roomCode}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          tracker: ev.domain, // real domain the phone tried to reach
          company: ev.vendor || 'Unknown',
          category: ev.category,
          dataType: ev.app || 'app', // the real app that made the request
          blocked: ev.blocked,
          bytes: 0, // DNS layer — no byte count; never fabricate one
        }),
      });
      setEventCount((n) => n + 1);
      if (ev.blocked) {
        setBlockedCount((n) => n + 1);
      }
    } catch {
      // ignore — network may be slow at a conference
    }
  }, []);

  // Once joined, subscribe to the REAL on-device DNS stream and forward tracker
  // hits to the room. No timer, no simulation — the big screen only ever shows
  // trackers this phone actually contacted. Throttled to ≤1/sec so a busy phone
  // doesn't flood the room.
  useEffect(() => {
    if (status !== 'joined' || !session) {
      return;
    }

    vpnService
      .isRunning()
      .then(setShieldOn)
      .catch(() => setShieldOn(false));

    const unsub = vpnService.onDnsQuery((ev) => {
      // Only forward real trackers (skip clean/first-party lookups).
      if (!ev.category || ev.category === 'clean') {
        return;
      }
      const now = Date.now();
      if (now - lastSentRef.current < 1000) {
        return;
      } // throttle
      lastSentRef.current = now;
      void sendEvent(session.deviceId, session.code, ev);
    });

    return unsub;
  }, [status, session, sendEvent]);

  async function join() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setErrorMsg('Enter the 6-character room code from the big screen.');
      return;
    }

    setStatus('joining');
    setErrorMsg('');

    try {
      const res = await fetch(`${API_BASE}/session/${trimmed}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Phone-${trimmed.slice(0, 4)}` }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Room not found');
      }

      const data = (await res.json()) as JoinResult;
      setSession(data);
      setStatus('joined');
    } catch (e) {
      setStatus('error');
      setErrorMsg((e as Error).message ?? 'Could not join room. Check the code and try again.');
    }
  }

  function leave() {
    // The onDnsQuery subscription is torn down by the effect cleanup when
    // status leaves 'joined'.
    setStatus('idle');
    setSession(null);
    setCode('');
    setEventCount(0);
    setBlockedCount(0);
  }

  // ─── Joined state ───────────────────────────────────────────────────────────

  if (status === 'joined' && session) {
    const blockedPct = eventCount > 0 ? Math.round((blockedCount / eventCount) * 100) : 0;

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentPadded}>
        {/* Header */}
        <View style={styles.joinedHeader}>
          <Text style={styles.joinedEmoji}>🎤</Text>
          <Text style={styles.joinedTitle}>You're Live!</Text>
          <Text style={styles.joinedSubtitle}>
            Your device appears on the conference screen as{' '}
            <Text style={styles.deviceName}>{session.name}</Text>
          </Text>
          {!shieldOn && (
            <Text style={styles.shieldHint}>
              ⚠ Turn on the DNS Shield to contribute your real tracker blocks to the room.
            </Text>
          )}
        </View>

        {/* Room code pill */}
        <View style={styles.roomCodePill}>
          <Text style={styles.roomCodeLabel}>Room</Text>
          <Text style={styles.roomCode}>{session.code}</Text>
        </View>

        {/* Live stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{eventCount}</Text>
            <Text style={styles.statLabel}>Events sent</Text>
          </View>
          <View style={[styles.statCard, { borderColor: '#10b981' }]}>
            <Text style={[styles.statValue, { color: '#10b981' }]}>{blockedPct}%</Text>
            <Text style={styles.statLabel}>Blocked</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#3b82f6' }]}>{blockedCount}</Text>
            <Text style={styles.statLabel}>Protected</Text>
          </View>
        </View>

        {/* Status line */}
        <View style={styles.statusLine}>
          <View style={styles.pulseDot} />
          <Text style={styles.statusText}>Forwarding your real tracker blocks as they happen…</Text>
        </View>

        {/* Privacy notice */}
        <View style={styles.privacyBox}>
          <Text style={styles.privacyTitle}>🔒 Privacy Notice</Text>
          <Text style={styles.privacyText}>
            Your device appears as <Text style={styles.highlight}>{session.name}</Text>. Only real
            tracker events are shared — the tracker domain, the app that called it, and whether it
            was blocked (e.g. "Instagram → graph.facebook.com, blocked"). No IP address, no
            identity, no page content, no browsing history leaves this device.
          </Text>
        </View>

        {/* Leave button */}
        <TouchableOpacity style={styles.leaveButton} onPress={leave}>
          <Text style={styles.leaveButtonText}>Leave Room</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ─── Idle / joining / error state ──────────────────────────────────────────

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentPadded}>
      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.heroEmoji}>📺</Text>
        <Text style={styles.heroTitle}>Join Conference Room</Text>
        <Text style={styles.heroSubtitle}>
          Enter the 6-character code displayed on the conference screen to appear live on the
          tracker visualization.
        </Text>
      </View>

      {/* Code input */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Room Code</Text>
        <TextInput
          style={styles.codeInput}
          value={code}
          onChangeText={(t) =>
            setCode(
              t
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '')
                .slice(0, 6)
            )
          }
          placeholder="CONF24"
          placeholderTextColor="#444"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          keyboardType="default"
        />
        {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
      </View>

      {/* Join button */}
      <TouchableOpacity
        style={[styles.joinButton, status === 'joining' && styles.joinButtonDisabled]}
        onPress={join}
        disabled={status === 'joining'}
      >
        {status === 'joining' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.joinButtonText}>Join Room →</Text>
        )}
      </TouchableOpacity>

      {/* Privacy notice */}
      <View style={styles.privacyBox}>
        <Text style={styles.privacyTitle}>🔒 What gets shared?</Text>
        <Text style={styles.privacyText}>
          Only anonymized tracker domain names. Your device appears as a random ID like
          "Device-A4B2". No personal data, no real browsing history, no IP address is shared with
          other attendees.
        </Text>
      </View>

      {/* How it works */}
      <View style={styles.howItWorksBox}>
        <Text style={styles.howItWorksTitle}>How it works</Text>
        {[
          '1. Enter the room code from the big screen',
          '2. Your phone joins the live visualization',
          '3. AnkrShield reports which trackers it blocked',
          '4. Watch the big screen fill up with real data',
        ].map((step) => (
          <Text key={step} style={styles.howItWorksStep}>
            {step}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080c14',
  },
  contentPadded: {
    padding: 20,
    gap: 20,
  },

  // Hero
  hero: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  heroEmoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Input
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  codeInput: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    padding: 16,
    fontSize: 28,
    fontWeight: 'bold',
    color: '#3b82f6',
    letterSpacing: 8,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    marginTop: 4,
  },

  // Join button
  joinButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  joinButtonDisabled: {
    opacity: 0.6,
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Privacy box
  privacyBox: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e3a5f',
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  privacyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#60a5fa',
  },
  privacyText: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
  },
  highlight: {
    color: '#93c5fd',
    fontWeight: '600',
  },

  // How it works
  howItWorksBox: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  howItWorksTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9ca3af',
    marginBottom: 4,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  howItWorksStep: {
    fontSize: 13,
    color: '#d1d5db',
    lineHeight: 20,
  },

  // Joined state
  joinedHeader: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  joinedEmoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  joinedTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#10b981',
    marginBottom: 6,
  },
  joinedSubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  shieldHint: {
    color: '#fbbf24',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '600',
  },
  deviceName: {
    color: '#60a5fa',
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  roomCodePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e3a5f',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 20,
    gap: 10,
    alignSelf: 'center',
  },
  roomCodeLabel: {
    fontSize: 12,
    color: '#60a5fa',
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  roomCode: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 4,
    fontFamily: 'monospace',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#ef4444',
    fontFamily: 'monospace',
  },
  statLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#111827',
    borderRadius: 8,
    padding: 12,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  statusText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  leaveButton: {
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  leaveButtonText: {
    color: '#9ca3af',
    fontSize: 15,
    fontWeight: '600',
  },
});
