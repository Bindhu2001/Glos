import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Image,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useUser, useSession } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { formatDistanceToNow } from 'date-fns';
import ScreenHeader from '../../components/common/ScreenHeader';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { showAlert } from '../../components/common/AlertModal';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';

// Web's "Manage Email & Security" is just Clerk's hosted openUserProfile()
// modal — Clerk builds and owns that whole UI. The RN SDK has no equivalent
// hosted component (only hooks), so this screen re-implements the same
// capabilities (photo, password, email, active devices) natively against
// Clerk's `user`/`session` resources directly.
function clerkErrorMessage(err: any, fallback: string): string {
  return err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || fallback;
}

export default function AccountSecurityScreen() {
  const { user, isLoaded } = useUser();
  const { session } = useSession();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [photoUploading, setPhotoUploading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [addingEmail, setAddingEmail] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<any>(null);
  const [emailCode, setEmailCode] = useState('');
  const [verifyingEmail, setVerifyingEmail] = useState(false);

  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    if (!user) return;
    setSessionsLoading(true);
    try {
      const list = await user.getSessions();
      setSessions(list.filter((sx: any) => sx.status === 'active'));
    } catch {
      // Sessions list is a nice-to-have alongside the account fields above —
      // fail quietly rather than blocking the rest of the screen on it.
    } finally {
      setSessionsLoading(false);
    }
  }, [user]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  if (!isLoaded || !user) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <ScreenHeader title="Email & Security" showBack />
        <LoadingSpinner />
      </View>
    );
  }

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert('Permission Needed', 'Allow photo library access to change your profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setPhotoUploading(true);
    try {
      const asset = result.assets[0];
      // Clerk's setProfileImage puts `file` straight into a FormData part
      // (`new FormData().append('file', file)`) — a real Blob from
      // fetch(uri).blob() doesn't reliably serialize across RN's FormData
      // bridge the way it does on web. The RN-native-recognized shape for a
      // file-like FormData field is a plain { uri, name, type } object
      // (used throughout RN networking code), which Clerk's code passes
      // straight through unmodified, so it lands in the FormData part
      // exactly as RN's own networking layer expects.
      await user.setProfileImage({
        file: { uri: asset.uri, name: asset.fileName || `photo-${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg' } as any,
      });
    } catch (err: any) {
      showAlert('Upload Failed', clerkErrorMessage(err, 'Could not update your profile photo.'));
    } finally {
      setPhotoUploading(false);
    }
  };

  const savePassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      showAlert('Weak Password', 'New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert("Passwords Don't Match", 'New password and confirmation must match.');
      return;
    }
    if (user.passwordEnabled && !currentPassword) {
      showAlert('Current Password Required', 'Enter your current password to change it.');
      return;
    }
    setSavingPassword(true);
    try {
      await user.updatePassword({
        newPassword,
        currentPassword: user.passwordEnabled ? currentPassword : undefined,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showAlert('Password Updated', 'Your password has been changed.');
    } catch (err: any) {
      showAlert('Could Not Update Password', clerkErrorMessage(err, 'Please check your current password and try again.'));
    } finally {
      setSavingPassword(false);
    }
  };

  const addEmail = async () => {
    if (!newEmail.trim()) return;
    setAddingEmail(true);
    try {
      const email = await user.createEmailAddress({ email: newEmail.trim() });
      await email.prepareVerification({ strategy: 'email_code' });
      setPendingEmail(email);
    } catch (err: any) {
      showAlert('Could Not Add Email', clerkErrorMessage(err, 'Please check the email address and try again.'));
    } finally {
      setAddingEmail(false);
    }
  };

  const verifyEmail = async () => {
    if (!pendingEmail || !emailCode.trim()) return;
    setVerifyingEmail(true);
    try {
      await pendingEmail.attemptVerification({ code: emailCode.trim() });
      await user.reload();
      setPendingEmail(null);
      setEmailCode('');
      setNewEmail('');
    } catch (err: any) {
      showAlert('Verification Failed', clerkErrorMessage(err, 'Incorrect or expired code.'));
    } finally {
      setVerifyingEmail(false);
    }
  };

  const makePrimary = async (emailId: string) => {
    try {
      await user.update({ primaryEmailAddressId: emailId });
      await user.reload();
    } catch (err: any) {
      showAlert('Failed', clerkErrorMessage(err, 'Could not set primary email.'));
    }
  };

  const removeEmail = (email: any) => {
    showAlert(
      'Remove Email',
      `Remove ${email.emailAddress} from your account?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await email.destroy();
              await user.reload();
            } catch (err: any) {
              showAlert('Failed', clerkErrorMessage(err, 'Could not remove this email.'));
            }
          },
        },
      ]
    );
  };

  const revokeSession = (sess: any) => {
    showAlert(
      'Sign Out Device',
      'This device will be signed out immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await sess.revoke();
              loadSessions();
            } catch (err: any) {
              showAlert('Failed', clerkErrorMessage(err, 'Could not sign out this device.'));
            }
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.container, { paddingTop: insets.top }]}>
        <ScreenHeader title="Email & Security" showBack />
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Profile photo */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>PROFILE PHOTO</Text>
            <TouchableOpacity style={s.photoRow} onPress={pickPhoto} disabled={photoUploading} activeOpacity={0.7}>
              {user.hasImage ? (
                <Image source={{ uri: user.imageUrl }} style={s.photo} />
              ) : (
                <View style={[s.photo, s.photoPlaceholder]}>
                  <Text style={s.photoInitial}>
                    {(user.fullName || user.primaryEmailAddress?.emailAddress || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.photoLabel}>{photoUploading ? 'Uploading…' : 'Change Photo'}</Text>
                <Text style={s.hint}>Tap to choose a new profile picture</Text>
              </View>
              {photoUploading
                ? <ActivityIndicator color={colors.primary} />
                : <Ionicons name="chevron-forward" size={16} color={colors.gray300} />}
            </TouchableOpacity>
          </View>

          {/* Email addresses */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>EMAIL ADDRESSES</Text>
            {user.emailAddresses.map((e: any) => {
              const isPrimary = e.id === user.primaryEmailAddressId;
              return (
                <View key={e.id} style={s.emailRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.emailText}>{e.emailAddress}</Text>
                    {isPrimary && <Text style={s.primaryBadge}>Primary</Text>}
                  </View>
                  {!isPrimary && (
                    <>
                      <TouchableOpacity onPress={() => makePrimary(e.id)} style={s.smallBtn}>
                        <Text style={s.smallBtnText}>Make primary</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeEmail(e)} style={s.iconBtn} hitSlop={8}>
                        <Ionicons name="trash-outline" size={16} color={colors.danger} />
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              );
            })}

            {pendingEmail ? (
              <View style={s.inlineForm}>
                <Text style={s.hint}>Enter the verification code sent to {pendingEmail.emailAddress}</Text>
                <Input
                  placeholder="Verification code"
                  value={emailCode}
                  onChangeText={setEmailCode}
                  keyboardType="number-pad"
                />
                <Button label="Verify Email" onPress={verifyEmail} loading={verifyingEmail} fullWidth />
              </View>
            ) : (
              <View style={s.inlineForm}>
                <Input
                  placeholder="Add an email address"
                  value={newEmail}
                  onChangeText={setNewEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <Button label="Add Email" onPress={addEmail} loading={addingEmail} variant="outline" fullWidth />
              </View>
            )}
          </View>

          {/* Password */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>{user.passwordEnabled ? 'CHANGE PASSWORD' : 'SET PASSWORD'}</Text>
            {user.passwordEnabled && (
              <Input
                placeholder="Current password"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
              />
            )}
            <Input placeholder="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
            <Input
              placeholder="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />
            <Button
              label={user.passwordEnabled ? 'Update Password' : 'Set Password'}
              onPress={savePassword}
              loading={savingPassword}
              fullWidth
            />
          </View>

          {/* Active devices */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>ACTIVE DEVICES</Text>
            {sessionsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
            ) : sessions.length === 0 ? (
              <Text style={s.hint}>No active sessions found.</Text>
            ) : (
              sessions.map((sess) => {
                const isCurrent = sess.id === session?.id;
                const act = sess.latestActivity;
                const deviceLabel = [
                  act?.isMobile ? 'Mobile' : 'Desktop',
                  act?.browserName,
                  act?.deviceType,
                ].filter(Boolean).join(' · ') || 'Unknown device';
                const locationLabel = [act?.city, act?.country].filter(Boolean).join(', ');
                return (
                  <View key={sess.id} style={s.sessionRow}>
                    <View style={s.sessionIcon}>
                      <Ionicons
                        name={act?.isMobile ? 'phone-portrait-outline' : 'desktop-outline'}
                        size={18}
                        color={colors.primary}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.sessionDevice}>{deviceLabel}{isCurrent ? ' (This device)' : ''}</Text>
                      {!!locationLabel && <Text style={s.hint}>{locationLabel}</Text>}
                      <Text style={s.hint}>
                        Last active {formatDistanceToNow(new Date(sess.lastActiveAt), { addSuffix: true })}
                      </Text>
                    </View>
                    {!isCurrent && (
                      <TouchableOpacity onPress={() => revokeSession(sess)} style={s.iconBtn} hitSlop={8}>
                        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 16, paddingBottom: 40 },
    section: {
      backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border,
      padding: 16, marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase',
      letterSpacing: 0.5, marginBottom: 12,
    },
    hint: { fontSize: 12, color: c.textMuted, marginTop: 2 },

    photoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    photo: { width: 56, height: 56, borderRadius: 28 },
    photoPlaceholder: { backgroundColor: c.primaryLight, alignItems: 'center', justifyContent: 'center' },
    photoInitial: { fontSize: 22, fontWeight: '700', color: c.primary },
    photoLabel: { fontSize: 15, fontWeight: '600', color: c.textPrimary },

    emailRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    emailText: { fontSize: 14, color: c.textPrimary, fontWeight: '500' },
    primaryBadge: { fontSize: 11, color: c.success, fontWeight: '700', marginTop: 2 },
    smallBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: c.primaryLight },
    smallBtnText: { fontSize: 12, fontWeight: '600', color: c.primary },
    iconBtn: { padding: 6 },
    inlineForm: { marginTop: 12 },

    sessionRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    sessionIcon: {
      width: 34, height: 34, borderRadius: 17, backgroundColor: c.primaryLight,
      alignItems: 'center', justifyContent: 'center',
    },
    sessionDevice: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
  });
}
