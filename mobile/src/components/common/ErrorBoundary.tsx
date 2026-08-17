import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  stack: string | null;
}

// Without this, any uncaught render error in a screen crashes/closes the whole
// app in a release build (no red-box like in dev) — this keeps the app alive
// with a recoverable screen instead.
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, stack: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.setState({ stack: [error.stack, info.componentStack].filter(Boolean).join('\n\n---\n\n') });
  }

  render() {
    if (this.state.error) {
      return (
        <View style={s.container}>
          <Text style={s.title}>Something went wrong</Text>
          <Text style={s.message}>{this.state.error.message}</Text>
          <TouchableOpacity style={s.button} onPress={() => this.setState({ error: null, stack: null })}>
            <Text style={s.buttonText}>Try Again</Text>
          </TouchableOpacity>
          {!!this.state.stack && (
            <ScrollView style={s.stackBox}>
              <Text selectable style={s.stackText}>{this.state.stack}</Text>
            </ScrollView>
          )}
        </View>
      );
    }
    return this.props.children;
  }
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 8 },
  message: { fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 20 },
  button: { backgroundColor: '#0f766e', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  buttonText: { color: '#fff', fontWeight: '700' },
  stackBox: { marginTop: 24, maxHeight: 300, width: '100%', backgroundColor: '#f3f4f6', borderRadius: 8, padding: 10 },
  stackText: { fontSize: 10, color: '#374151', fontFamily: 'monospace' },
});
