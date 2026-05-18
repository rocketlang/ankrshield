/**
 * Feature Request Screen
 * Users can submit feature suggestions — saved server-side via POST /feature-request.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

import { API_BASE } from '../config';

const CATEGORIES = [
  { id: 'security', label: '🔒 Security', desc: 'Threat detection, scanner improvements' },
  { id: 'privacy', label: '🔐 Privacy', desc: 'Data controls, anonymity features' },
  { id: 'dns', label: '🌐 DNS / VPN', desc: 'Filtering rules, bypass, performance' },
  { id: 'ui', label: '🎨 UI / UX', desc: 'Design, navigation, accessibility' },
  { id: 'performance', label: '⚡ Performance', desc: 'Speed, battery, memory usage' },
  { id: 'other', label: '💡 Other', desc: 'Anything else on your mind' },
];

export function FeatureRequestScreen({ navigation }: any) {
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    if (!category) {
      Alert.alert('Category required', 'Please select a category for your request.');
      return;
    }
    if (title.trim().length < 5) {
      Alert.alert('Title too short', 'Please write a brief title (at least 5 characters).');
      return;
    }
    if (description.trim().length < 10) {
      Alert.alert('More detail needed', 'Please describe your idea in a little more detail.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/feature-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          title: title.trim(),
          description: description.trim(),
          appVersion: '1.2.6',
          platform: Platform.OS,
        }),
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setSubmitted(true);
    } catch (e) {
      Alert.alert(
        'Could not submit',
        'Check your connection and try again. Your idea has not been lost — you can copy it and try later.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <View style={styles.thankYouContainer}>
        <Text style={styles.thankYouEmoji}>🎉</Text>
        <Text style={styles.thankYouTitle}>Thank you!</Text>
        <Text style={styles.thankYouBody}>
          Your feature request has been saved. We review every suggestion and prioritise based on
          community demand.
        </Text>
        <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.doneBtnTxt}>Back to Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0c1118' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          What would make AnkrShield better for you? Every request is read by the team.
        </Text>

        {/* Category picker */}
        <Text style={styles.label}>Category</Text>
        <View style={styles.categories}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.catChip, category === c.id && styles.catChipActive]}
              onPress={() => setCategory(c.id)}
              activeOpacity={0.75}
            >
              <Text style={[styles.catLabel, category === c.id && styles.catLabelActive]}>
                {c.label}
              </Text>
              <Text style={[styles.catDesc, category === c.id && styles.catDescActive]}>
                {c.desc}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Title */}
        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="One-line summary of your idea"
          placeholderTextColor="#374151"
          maxLength={120}
          returnKeyType="next"
        />

        {/* Description */}
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the feature, why it's useful, and how you'd expect it to work…"
          placeholderTextColor="#374151"
          multiline
          numberOfLines={6}
          maxLength={1000}
          textAlignVertical="top"
        />
        <Text style={styles.charCount}>{description.length}/1000</Text>

        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitBtnTxt}>Submit Request</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c1118',
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  intro: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 24,
    textAlign: 'center',
  },
  label: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  categories: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  catChip: {
    width: '48%',
    backgroundColor: '#111827',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 12,
  },
  catChipActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#0f1f3d',
  },
  catLabel: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  catLabelActive: {
    color: '#60a5fa',
  },
  catDesc: {
    color: '#374151',
    fontSize: 11,
    lineHeight: 15,
  },
  catDescActive: {
    color: '#1d4ed8',
  },
  input: {
    backgroundColor: '#111827',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    color: '#f1f5f9',
    fontSize: 14,
    padding: 14,
    marginBottom: 20,
  },
  textarea: {
    minHeight: 130,
    marginBottom: 4,
  },
  charCount: {
    color: '#374151',
    fontSize: 11,
    textAlign: 'right',
    marginBottom: 24,
  },
  submitBtn: {
    backgroundColor: '#1d4ed8',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnTxt: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Thank-you state
  thankYouContainer: {
    flex: 1,
    backgroundColor: '#0c1118',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  thankYouEmoji: {
    fontSize: 64,
    marginBottom: 20,
  },
  thankYouTitle: {
    color: '#f1f5f9',
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 12,
  },
  thankYouBody: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },
  doneBtn: {
    backgroundColor: '#1d4ed8',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  doneBtnTxt: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
