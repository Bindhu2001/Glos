import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClerkProvider } from '@clerk/clerk-expo';
import * as SecureStore from 'expo-secure-store';
import { WorkspaceProvider } from './src/contexts/WorkspaceContext';
import AppNavigator from './src/navigation/AppNavigator';

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';

const savedKeys: string[] = [];

const tokenCache = {
  async getToken(key: string) {
    try { return await SecureStore.getItemAsync(key); } catch { return null; }
  },
  async saveToken(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value);
      if (!savedKeys.includes(key)) savedKeys.push(key);
    } catch {}
  },
  async clearCache() {
    for (const key of savedKeys) {
      try { await SecureStore.deleteItemAsync(key); } catch {}
    }
    savedKeys.length = 0;
  },
};

export default function App() {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <SafeAreaProvider>
        <WorkspaceProvider>
          <StatusBar style="dark" />
          <AppNavigator />
        </WorkspaceProvider>
      </SafeAreaProvider>
    </ClerkProvider>
  );
}
