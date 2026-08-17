import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Platform, Alert, ActivityIndicator, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';

const ROLES = [
  { value: 'admin', label: 'Admin', desc: 'Can manage members, tasks, and settings' },
  { value: 'member', label: 'Member', desc: 'Standard access — view and work on tasks' },
];

export default function InviteMemberScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [loading, setLoading] = useState(false);

  const send = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    if (!workspace?.id) return;
    setLoading(true);
    try {
      await api.appInvitations.send(workspace.id, trimmed, role);
      Alert.alert('Invitation Sent', `An invitation has been sent to ${trimmed}.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      const d = err?.response?.data;
      // Matches web's MembersAndInvites.jsx exactly — the backend returns a
      // generic "error" string too, but this specific 402/user_limit_exceeded
      // case gets a friendlier message with the actual seat count instead of
      // the raw backend text.
      const msg = err?.response?.status === 402 && d?.reason === 'user_limit_exceeded'
        ? `You've reached your plan's limit of ${d.allowed} user${d.allowed === 1 ? '' : 's'}. Upgrade your plan to invite more members.`
        : d?.error ?? 'Failed to send invitation.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.title}>Invite Member</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <View style={s.section}>
            <Text style={s.label}>Email Address</Text>
            <TextInput
              style={s.input}
              placeholder="colleague@company.com"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={s.section}>
            <Text style={s.label}>Role</Text>
            {ROLES.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[s.roleCard, role === r.value && s.roleCardActive]}
                onPress={() => setRole(r.value as 'admin' | 'member')}
                activeOpacity={0.7}
              >
                <View style={s.roleCardLeft}>
                  <Text style={[s.roleName, role === r.value && s.roleNameActive]}>{r.label}</Text>
                  <Text style={s.roleDesc}>{r.desc}</Text>
                </View>
                {role === r.value && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={s.sendBtn} onPress={send} disabled={loading} activeOpacity={0.8}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="send-outline" size={18} color="#fff" />
                <Text style={s.sendBtnText}>Send Invitation</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: AppColors) {
  const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 20, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700' },
    body: { padding: 20, gap: 24 },
    section: { gap: 10 },
    label: { fontSize: 13, fontWeight: '700', color: c.textSecondary, letterSpacing: 0.5 },
    input: {
      backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 16, paddingVertical: 14,
      fontSize: 15, color: c.textPrimary,
    },
    roleCard: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.surface, borderRadius: 12, padding: 14,
      borderWidth: 1, borderColor: c.border,
    },
    roleCardActive: { borderColor: c.primary, backgroundColor: c.primary + '08' },
    roleCardLeft: { flex: 1, gap: 2 },
    roleName: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    roleNameActive: { color: c.primary },
    roleDesc: { fontSize: 12, color: c.textSecondary },
    sendBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: c.primary, borderRadius: 14, paddingVertical: 16,
    },
    sendBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  });
}
