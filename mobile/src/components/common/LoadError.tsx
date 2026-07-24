import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  onRetry: () => void;
  message?: string;
}

export default function LoadError({ onRetry, message = 'Unable to load data. Please check your connection.' }: Props) {
  return (
    <View style={s.container}>
      <Text style={s.msg}>{message}</Text>
      <TouchableOpacity style={s.btn} onPress={onRetry}>
        <Text style={s.btnText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' },
  msg: { fontSize: 15, color: '#555', textAlign: 'center', marginBottom: 20 },
  btn: { backgroundColor: '#1a56db', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
