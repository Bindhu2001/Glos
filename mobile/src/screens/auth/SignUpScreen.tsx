import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { useSignUp, useSSO } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AuthStackParamList } from '../../navigation/types';
import { Colors } from '../../utils/colors';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Logo from '../../components/common/Logo';

WebBrowser.maybeCompleteAuthSession();

type Nav = NativeStackNavigationProp<AuthStackParamList, 'SignUp'>;

export default function SignUpScreen() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const { startSSOFlow } = useSSO();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSignUp = async () => {
    if (!isLoaded) return;
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      Alert.alert('Missing Fields', 'Please fill in all fields.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Weak Password', 'Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await signUp.create({ firstName: firstName.trim(), lastName: lastName.trim(), emailAddress: email.trim(), password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err: any) {
      Alert.alert('Sign Up Failed', err.errors?.[0]?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!isLoaded) return;
    if (!code.trim()) {
      Alert.alert('Enter Code', 'Please enter the verification code from your email.');
      return;
    }
    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      }
    } catch (err: any) {
      Alert.alert('Verification Failed', err.errors?.[0]?.message ?? 'Invalid code.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    try {
      const result = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri(),
      });

      if (!result) {
        Alert.alert('Google Sign Up Failed', 'No response from Google. Try again.');
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

      Alert.alert('Google Sign Up Failed', 'Could not establish session. Please try again.');
    } catch (err: any) {
      console.error('[GoogleSignUp] Error:', err);
      Alert.alert('Google Sign Up Failed', err.errors?.[0]?.message ?? 'Something went wrong. Try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
          {!pendingVerification ? (
            <>
              <Text style={styles.heading}>Create account</Text>
              <Text style={styles.subheading}>Join your team on glos</Text>

              {/* Google OAuth */}
              <TouchableOpacity
                style={[styles.googleBtn, googleLoading && styles.googleBtnDisabled]}
                onPress={handleGoogleSignUp}
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

              <View style={styles.nameRow}>
                <Input label="First Name" value={firstName} onChangeText={setFirstName}
                  placeholder="Jane" containerStyle={{ flex: 1 }} />
                <Input label="Last Name" value={lastName} onChangeText={setLastName}
                  placeholder="Doe" containerStyle={{ flex: 1 }} />
              </View>
              <Input label="Work Email" value={email} onChangeText={setEmail}
                keyboardType="email-address" autoCapitalize="none" placeholder="you@company.com" />
              <Input label="Password" value={password} onChangeText={setPassword}
                secureTextEntry placeholder="Min. 8 characters" />

              <Button label="Create Account" onPress={handleSignUp} loading={loading} fullWidth style={{ marginTop: 4 }} />
            </>
          ) : (
            <>
              <Text style={styles.heading}>Check your email</Text>
              <Text style={styles.subheading}>We sent a 6-digit code to {email}</Text>
              <Input
                label="Verification Code"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                placeholder="123456"
                containerStyle={{ marginTop: 8 }}
              />
              <Button label="Verify Email" onPress={handleVerify} loading={loading} fullWidth />
              <TouchableOpacity onPress={() => setPendingVerification(false)} style={styles.backLink}>
                <Text style={styles.backLinkText}>← Wrong email? Go back</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {!pendingVerification && (
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('SignIn')}>
              <Text style={styles.footerLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        )}
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
  nameRow: { flexDirection: 'row', gap: 12 },
  backLink: { marginTop: 16, alignItems: 'center' },
  backLinkText: { fontSize: 14, color: Colors.textSecondary },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { fontSize: 14, color: Colors.textSecondary },
  footerLink: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
});
