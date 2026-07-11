/**
 * ErrorBoundary — catch React render errors gracefully
 *
 * Wrap any screen or component to prevent a single bad API response
 * from crashing the entire app with a white screen.
 *
 * Usage:
 *   <ErrorBoundary name="HomeScreen">
 *     <HomeScreen />
 *   </ErrorBoundary>
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

interface Props {
  children: React.ReactNode;
  /** Optional name shown in the error card for easier debugging */
  name?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message ?? 'Unknown error' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log silently — don't surface stack trace to user
    console.error(`[ErrorBoundary:${this.props.name ?? 'unknown'}]`, error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.icon}>⚠️</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.sub}>
          {this.props.name
            ? `${this.props.name} ran into a problem.`
            : 'This screen ran into a problem.'}
          {'\n'}AnkrShield is still protecting your device.
        </Text>
        {/* Show the actual error so a tester can screenshot it — beta diagnostic. */}
        {this.state.errorMessage ? (
          <View style={styles.errBox}>
            <Text selectable style={styles.errText}>
              {this.props.name ? `[${this.props.name}] ` : ''}
              {this.state.errorMessage}
            </Text>
          </View>
        ) : null}
        <TouchableOpacity style={styles.retryBtn} onPress={this.handleRetry}>
          <Text style={styles.retryTxt}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  icon: { fontSize: 48, marginBottom: 16 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  sub: { color: '#555', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  errBox: {
    backgroundColor: '#1a0d0d',
    borderWidth: 1,
    borderColor: '#4a1d1d',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    maxWidth: '100%',
  },
  errText: { color: '#f87171', fontSize: 11, fontFamily: 'monospace', lineHeight: 16 },
  retryBtn: {
    backgroundColor: '#1a2a1a',
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 10,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  retryTxt: { color: '#4CAF50', fontSize: 14, fontWeight: '600' },
});
