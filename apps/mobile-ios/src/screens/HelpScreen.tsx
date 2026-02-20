/**
 * Help & Guide Screen
 * In-app manual — what AnkrShield is, why you need it, and how each feature works.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';

interface Section {
  id: string;
  emoji: string;
  title: string;
  summary: string;
  body: string;
}

const SECTIONS: Section[] = [
  {
    id: 'what',
    emoji: '🛡️',
    title: 'What is AnkrShield?',
    summary: 'Your personal AI-powered security layer for Android.',
    body: `AnkrShield is a privacy and security app that works silently in the background to protect your phone from trackers, spyware, and malicious networks — without sending your data anywhere.

It combines four layers of protection:

1. DNS Filtering — intercepts every network request your apps make and blocks known malware, ad-tracking, and spyware domains before they even connect.

2. Spyware Scanner — checks every installed app against thousands of known stalkerware and spyware signatures (Amnesty, Citizen Lab, Exodus Privacy data).

3. AI Warrior — a server-side engine that monitors attack patterns hitting the AnkrShield network and pushes real-time threat alerts to your phone.

4. Live Threat Feed — a live stream of active cyber-attacks being detected across the network, so you can see what's happening right now.`,
  },
  {
    id: 'why',
    emoji: '🤔',
    title: 'Why do I need this?',
    summary: 'Your phone makes hundreds of hidden connections every hour.',
    body: `Most people don't realise how much their phone leaks.

Every time you open an app, it typically contacts 5–30 tracking domains before you even see the screen. These are ad networks, analytics companies, and data brokers that build profiles on you.

Stalkerware is another threat — apps that hide on your device and silently send your location, messages, and calls to someone monitoring you. These are often installed by abusive partners or employers.

AnkrShield addresses both:
• DNS Filtering blocks trackers at the network level — no VPN server in the middle, everything stays on your device.
• The App Scanner detects stalkerware and spyware using the same IOC databases used by security researchers at Amnesty International and Citizen Lab.`,
  },
  {
    id: 'dns',
    emoji: '🔒',
    title: 'Enabling DNS Filtering',
    summary: 'Step-by-step guide to turn on the network shield.',
    body: `DNS Filtering is the core protection feature. Here's how to enable it:

Step 1 — Open Settings
  Tap "Settings" from the Home screen.

Step 2 — Find "DNS Filtering" under Protection
  You'll see a toggle labelled "DNS Filtering".

Step 3 — Tap the toggle to turn it ON
  Android will show a VPN connection dialog — this is expected. AnkrShield uses a local VPN to intercept DNS queries entirely on your device. No traffic goes to any external VPN server.

Step 4 — Tap "OK" or "Allow"
  The shield activates. You'll see the 🛡 DNS Shield Active banner on the Home screen with live counts of blocked and allowed queries.

Step 5 — Check what's being blocked
  Tap "Recent Activity" or "View Dashboard" to see which domains were blocked.

Why the VPN permission?
Android requires VPN permission to intercept DNS at the OS level. AnkrShield's VPN is a local loopback — it does not route your internet traffic through any external server. Think of it as a filter that sits between your apps and your router, on your phone itself.`,
  },
  {
    id: 'scanner',
    emoji: '🔬',
    title: 'App Scanner',
    summary: 'Detects hidden spyware in your installed apps.',
    body: `The App Scanner (called "App Scanner" from the Home screen) checks every app on your phone against multiple detection layers:

IOC Database Match
  Known stalkerware and spyware package names from Amnesty International, Citizen Lab, and Exodus Privacy. A match here is flagged as CRITICAL immediately.

Permission Analysis
  Dangerous permission combinations used by spyware — e.g., an app that requests SMS access + microphone + background location + boot startup has a classic stalkerware profile even if its name looks innocent.

Install Source Check
  Apps installed directly from a file (not from the Play Store or a recognised app store) are analysed more strictly. This is because real stalkerware is almost never on Google Play — it's sideloaded.

Risk levels:
  🔴 CRITICAL — matches a known malware signature. Uninstall immediately.
  🟠 HIGH — dangerous permission combo. Investigate and remove if suspicious.
  🟡 SUSPICIOUS — unusual but not conclusive. Review the app.
  🟢 CLEAN — no flags found.

Note: System apps pre-installed by your phone's manufacturer are skipped unless they match a known IOC.`,
  },
  {
    id: 'warrior',
    emoji: '⚔️',
    title: 'AI Warrior',
    summary: 'Server-side AI that fights attackers in real time.',
    body: `The AI Warrior runs on the AnkrShield server and actively analyses every suspicious connection attempt against the infrastructure.

What it does:
• Detects attack patterns — port scans, brute-force attempts, honeypot triggers, SQL injection probes, exploit attempts.
• Scores threat chains — groups related attacks into chains and assigns a threat score (0–100).
• Auto-blocks confirmed attackers — IPs with a score ≥ 70 are blocked and reported to AbuseIPDB automatically.
• Pushes alerts to your phone — if a high-confidence attack chain (score ≥ 80) is detected, your phone receives a real-time push alert.

Viewing from the app:
  Tap "AI Warrior" from the Home screen to see the current threat landscape: active attack chains, blocked IPs, and honeypot events.

This feature requires the app to be connected to the AnkrShield server. You'll see a "Disconnected" badge if the server can't be reached.`,
  },
  {
    id: 'live',
    emoji: '🔴',
    title: 'Live Threats',
    summary: 'Real-time stream of attacks hitting the network.',
    body: `The Live Threats screen shows a rolling feed of active cyber-attack events detected by the server — the same events the AI Warrior is analysing.

Each event shows:
• Attack type (port scan, brute force, SQL injection, etc.)
• Source IP and country
• Threat score
• Whether the IP has been blocked

This is most useful for:
• Understanding what kinds of threats are common right now.
• Seeing if your own network's traffic has been associated with any flagged IPs.
• Getting context on the push alerts the AI Warrior sends you.

The feed updates every 30 seconds automatically.`,
  },
  {
    id: 'conference',
    emoji: '🎤',
    title: 'Secure Conference',
    summary: 'End-to-end encrypted audio rooms.',
    body: `The Conference feature lets you join or create private audio rooms that route through the AnkrShield server with end-to-end encryption.

How to use:
1. Tap "Join Conference" from the Home screen.
2. Enter a room code (or create a new room — you'll get a code to share).
3. Share the code with participants over a secure channel.
4. Tap "Join" to connect.

The room code is the encryption key — only people who have it can join. The server sees only encrypted audio packets and does not store recordings.`,
  },
  {
    id: 'privacy',
    emoji: '🔐',
    title: 'Privacy Score',
    summary: 'What the score on the Home screen means.',
    body: `The Privacy Score (the number in the circle on the Home screen) is a 0–100 composite of three sub-scores:

Network Score — based on how many connections your apps make to known tracking or malicious domains. Higher blocked % = higher score.

DNS Score — whether DNS Filtering is active and how many DNS queries have been intercepted vs. allowed.

App Score — based on the App Scanner results. No flagged apps = 100. Critical findings drop the score significantly.

The overall level:
  🟢 High (80–100) — Well protected.
  🟡 Medium (50–79) — Some gaps. Enable DNS Filtering and run the App Scanner.
  🔴 Low (0–49) — Significant exposure. Follow the recommendations.`,
  },
];

export function HelpScreen() {
  const [expanded, setExpanded] = useState<string | null>('what');

  function toggle(id: string) {
    setExpanded((prev) => (prev === id ? null : id));
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>AnkrShield v1.2.6 — tap any topic to expand.</Text>

      {SECTIONS.map((s) => {
        const open = expanded === s.id;
        return (
          <View key={s.id} style={[styles.card, open && styles.cardOpen]}>
            <TouchableOpacity
              style={styles.cardHeader}
              onPress={() => toggle(s.id)}
              activeOpacity={0.75}
            >
              <Text style={styles.cardEmoji}>{s.emoji}</Text>
              <View style={styles.cardTitles}>
                <Text style={styles.cardTitle}>{s.title}</Text>
                <Text style={styles.cardSummary}>{s.summary}</Text>
              </View>
              <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {open && (
              <View style={styles.cardBody}>
                <Text style={styles.bodyText}>{s.body}</Text>
              </View>
            )}
          </View>
        );
      })}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          AnkrShield is free and open. All DNS processing happens on your device. No personal data
          is sent to any server.
        </Text>
        <Text style={styles.footerLink}>xshieldai.com</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c1118',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  intro: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
  },
  cardOpen: {
    borderColor: '#22d3ee',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  cardEmoji: {
    fontSize: 24,
    width: 32,
    textAlign: 'center',
  },
  cardTitles: {
    flex: 1,
  },
  cardTitle: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  cardSummary: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 16,
  },
  chevron: {
    color: '#475569',
    fontSize: 11,
  },
  cardBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#1e3a5f',
  },
  bodyText: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 21,
    marginTop: 12,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    color: '#374151',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  footerLink: {
    color: '#0891b2',
    fontSize: 12,
  },
});
