import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView,
} from 'react-native';
import { useSignUp, useClerk } from '@clerk/clerk-expo';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthStackParamList } from '../../navigation/types';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Logo from '../../components/common/Logo';
import { showAlert } from '../../components/common/AlertModal';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'SignUp'>;

export default function SignUpScreen() {
  const { signUp, isLoaded } = useSignUp();
  const { setActive } = useClerk();
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!isLoaded) return;
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      showAlert('Missing Fields', 'Please fill in all fields.');
      return;
    }
    if (password.length < 8) {
      showAlert('Weak Password', 'Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await signUp.create({ firstName: firstName.trim(), lastName: lastName.trim(), emailAddress: email.trim(), password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err: any) {
      const code = err.errors?.[0]?.code ?? '';
      if (code === 'form_identifier_exists' || code === 'form_identifier_taken' || code === 'email_address_exists') {
        showAlert(
          'Account Already Exists',
          'An account with this email already exists. Please sign in instead.',
          [
            { text: 'Go to Sign In', onPress: () => navigation.navigate('SignIn') },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
        return;
      }
      showAlert('Sign Up Failed', err.errors?.[0]?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!isLoaded) return;
    if (!code.trim()) {
      showAlert('Enter Code', 'Please enter the verification code from your email.');
      return;
    }
    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId! });
      }
    } catch (err: any) {
      showAlert('Verification Failed', err.errors?.[0]?.message ?? 'Invalid code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView
        style={s.container}
        contentContainerStyle={[s.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.brand}>
          <Logo size={100} style={s.logo} />
        </View>

        <View style={s.card}>
          {!pendingVerification ? (
            <>
              <Text style={s.heading}>Create account</Text>
              <Text style={s.subheading}>Join your team on glos</Text>

              <View style={s.nameRow}>
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
              <Text style={s.heading}>Check your email</Text>
              <Text style={s.subheading}>We sent a 6-digit code to {email}</Text>
              <Input
                label="Verification Code"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                placeholder="123456"
                containerStyle={{ marginTop: 8 }}
              />
              <Button label="Verify Email" onPress={handleVerify} loading={loading} fullWidth />
              <TouchableOpacity onPress={() => setPendingVerification(false)} style={s.backLink}>
                <Text style={s.backLinkText}>← Wrong email? Go back</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {!pendingVerification && (
          <View style={s.footer}>
            <Text style={s.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('SignIn')}>
              <Text style={s.footerLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        )}
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
    nameRow: { flexDirection: 'row', gap: 12 },
    backLink: { marginTop: 16, alignItems: 'center' },
    backLinkText: { fontSize: 14, color: c.textSecondary },
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
    footerText: { fontSize: 14, color: c.textSecondary },
    footerLink: { fontSize: 14, color: c.primary, fontWeight: '600' },
  });
}