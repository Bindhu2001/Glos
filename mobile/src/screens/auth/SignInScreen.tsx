import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { useSignIn, useSSO } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AuthStackParamList } from '../../navigation/types';
import { Colors } from '../../utils/colors';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Logo from '../../components/common/Logo';

WebBrowser.maybeCompleteAuthSession();

type Nav = NativeStackNavigationProp<AuthStackParamList, 'SignIn'>;

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { startSSOFlow } = useSSO();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSignIn = async () => {
    if (!isLoaded) return;
    if (!email.trim() || !password) {
      Alert.alert('Missing Fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const result = await signIn.create({ identifier: email.trim(), password });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      }
    } catch (err: any) {
      Alert.alert('Sign In Failed', err.errors?.[0]?.message ?? 'Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const result = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri(),
      });
      
      if (!result) {
        Alert.alert('Google Sign In Failed', 'No response from Google. Try again.');
        return;
      }

      const { createdSessionId, setActive: setActiveSession, signIn, signUp } = result as any;

      // Priority 1: Use createdSessionId if available
      if (createdSessionId && setActiveSession) {
        await setActiveSession({ session: createdSessionId });
        return;
      }

      // Priority 2: Check signUp result (new account created via Google)
      if (signUp) {
        if (signUp.createdSessionId && setActiveSession) {
          await setActiveSession({ session: signUp.createdSessionId });
          return;
        }
        if (signUp.status === 'complete' && signUp.createdSessionId) {
          await setActiveSession?.({ session: signUp.createdSessionId });
          return;
        }
      }

      // Priority 3: Check signIn result (existing account signin via Google)
      if (signIn) {
        if (signIn.createdSessionId && setActiveSession) {
          await setActiveSession({ session: signIn.createdSessionId });
          return;
        }
        if (signIn.status === 'complete' && signIn.createdSessionId) {
          await setActiveSession?.({ session: signIn.createdSessionId });
          return;
        }
      }

      Alert.alert('Google Sign In Failed', 'Could not establish session. Please try again.');
    } catch (err: any) {
      console.error('[GoogleSignIn] Error:', err);
      Alert.alert('Google Sign In Failed', err.errors?.[0]?.message ?? 'Something went wrong. Try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <Logo size={72} style={styles.logo} />
          <Text style={styles.brandName}>glos</Text>
          <Text style={styles.brandTagline}>perform better</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Welcome back</Text>
          <Text style={styles.subheading}>Sign in to your account</Text>

          {/* Google OAuth */}
          <TouchableOpacity
            style={[styles.googleBtn, googleLoading && styles.googleBtnDisabled]}
            onPress={handleGoogleSignIn}
            activeOpacity={0.8}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <ActivityIndicator size="small" color={Colors.textPrimary} />
            ) : (
              <Ionicons name="logo-google" size={18} color="#EA4335" />
            )}
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@company.com"
            containerStyle={{ marginTop: 4 }}
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
          />

          <Button
            label="Sign In"
            onPress={handleSignIn}
            loading={loading}
            fullWidth
            style={{ marginTop: 4 }}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
            <Text style={styles.footerLink}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 24, flexGrow: 1 },
  brand: { alignItems: 'center', marginBottom: 32 },
  logo: { marginBottom: 12 },
  brandName: { fontSize: 32, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5 },
  brandTagline: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  card: {
    backgroundColor: Colors.white, borderRadius: 20, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  heading: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  subheading: { fontSize: 14, color: Colors.textSecondary, marginTop: 4, marginBottom: 20 },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 16, backgroundColor: Colors.white,
  },
  googleBtnDisabled: { opacity: 0.6 },
  googleBtnText: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { fontSize: 13, color: Colors.textSecondary },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { fontSize: 14, color: Colors.textSecondary },
  footerLink: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
});
