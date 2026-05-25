import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSignIn, useSSO } from '@clerk/clerk-expo';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AuthStackParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Logo from '../../components/common/Logo';
import { showAlert } from '../../components/common/AlertModal';

WebBrowser.maybeCompleteAuthSession();

type Nav = NativeStackNavigationProp<AuthStackParamList, 'SignIn'>;

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { startSSOFlow } = useSSO();
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSignIn = async () => {
    if (!isLoaded) return;
    if (!email.trim() || !password) {
      showAlert('Missing Fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const result = await signIn.create({ identifier: email.trim(), password });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      }
    } catch (err: any) {
      showAlert('Sign In Failed', 'Wrong email or password.');
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

      if (!result) return;

      const { createdSessionId, setActive: setActiveSession, signIn, signUp } = result as any;

      const activate = async (sessionId: string | null) => {
        if (setActiveSession) await setActiveSession({ session: sessionId });
      };

      if (createdSessionId) { await activate(createdSessionId); return; }
      if (signUp?.status === 'complete') { await activate(signUp.createdSessionId ?? null); return; }
      if (signIn?.status === 'complete') { await activate(signIn.createdSessionId ?? null); return; }
      if (signIn || signUp) {
        showAlert('Connection Failed', 'Could not establish connection. Please allow this app to connect to your account.');
      }
    } catch (err: any) {
      const code = err?.errors?.[0]?.code ?? '';
      if (code === 'oauth_cancelled' || code === 'oauth_access_denied') return;
      showAlert('Google Sign In Failed', err.errors?.[0]?.message ?? 'Something went wrong. Try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={s.container}
        contentContainerStyle={[s.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.brand}>
          <Logo size={100} style={s.logo} />
        </View>

        <View style={s.card}>
          <Text style={s.heading}>Welcome back</Text>
          <Text style={s.subheading}>Sign in to your account</Text>

          <TouchableOpacity
            onPress={handleGoogleSignIn}
            activeOpacity={0.8}
            disabled={googleLoading}
            style={[s.googleBtn, googleLoading && s.googleBtnDisabled]}
          >
            {googleLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <LinearGradient
                colors={['#4285f4', '#34a853', '#fbbc05', '#ea4335']}
                start={{ x: 1, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={s.googleIconBg}
              >
                <Ionicons name="logo-google" size={16} color="#ffffff" />
              </LinearGradient>
            )}
            <Text style={s.googleBtnText}>Continue with Google</Text>
          </TouchableOpacity>

          <View style={s.divider}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>or</Text>
            <View style={s.dividerLine} />
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

        <View style={s.footer}>
          <Text style={s.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
            <Text style={s.footerLink}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 24, flexGrow: 1 },
    brand: { alignItems: 'center', marginBottom: 32 },
    logo: { marginBottom: 12 },
    card: {
      backgroundColor: c.surface, borderRadius: 20, padding: 24,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
      borderWidth: 1, borderColor: c.border,
    },
    heading: { fontSize: 22, fontWeight: '700', color: c.textPrimary },
    subheading: { fontSize: 14, color: c.textSecondary, marginTop: 4, marginBottom: 20 },
    googleBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
      borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16,
      backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.border,
    },
    googleIconBg: {
      width: 28, height: 28, borderRadius: 14,
      alignItems: 'center', justifyContent: 'center',
    },
    googleBtnDisabled: { opacity: 0.6 },
    googleBtnText: { fontSize: 15, fontWeight: '600', color: c.textPrimary },
    divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
    dividerLine: { flex: 1, height: 1, backgroundColor: c.border },
    dividerText: { fontSize: 13, color: c.textSecondary },
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
    footerText: { fontSize: 14, color: c.textSecondary },
    footerLink: { fontSize: 14, color: c.primary, fontWeight: '600' },
  });
}
