import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import LoadError from '../../components/common/LoadError';

type Member = {
  membership_id: number;
  user_id: number;
  role: string;
  is_owner?: boolean;
  joined_at?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  user?: { first_name: string; last_name: string; email: string };
};

type Invitation = {
  id: number;
  invited_email: string;
  role: string;
  status: string;
  created_at?: string;
  invited_by_email?: string;
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: '#7c3aed',
  admin: '#0891b2',
  member: '#059669',
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

const INV_STATUS_COLORS: Record<string, string> = {
  pending: '#d97706',
  accepted: '#059669',
  declined: '#ef4444',
  revoked: '#6b7280',
};

const INV_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  revoked: 'Revoked',
};

export default function MembersScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const canManage = workspace?.role === 'super_admin';
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!workspace?.id) return;
    if (!isRefresh) setLoading(true);
    try {
      const [mRes, iRes] = await Promise.all([
        api.members.list(workspace.id),
        api.appInvitations.list(workspace.id),
      ]);
      setMembers(mRes.data?.items ?? mRes.data ?? []);
      setInvitations(iRes.data?.items ?? iRes.data ?? []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspace?.id]);

  useEffect(() => { load(); }, [load]);

  const changeRole = (member: Member) => {
    if (member.is_owner || member.role === 'super_admin') return;
    const newRole = member.role === 'admin' ? 'member' : 'admin';
    const name = getName(member);
    Alert.alert(
      'Change Role',
      `Change ${name}'s role to ${ROLE_LABELS[newRole]}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await api.members.updateRole(workspace!.id, member.user_id, newRole);
              await load(true);
            } catch {
              Alert.alert('Error', 'Failed to update role.');
            }
          },
        },
      ],
    );
  };

  const removeMember = (member: Member) => {
    if (member.is_owner || member.role === 'super_admin') return;
    const name = getName(member);
    Alert.alert(
      'Remove Member',
      `Remove ${name} from the workspace?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.members.remove(workspace!.id, member.user_id);
              await load(true);
            } catch {
              Alert.alert('Error', 'Failed to remove member.');
            }
          },
        },
      ],
    );
  };

  const revokeInvitation = (inv: Invitation) => {
    Alert.alert(
      'Revoke Invitation',
      `Revoke invitation sent to ${inv.invited_email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.appInvitations.revoke(workspace!.id, inv.id);
              await load(true);
            } catch {
              Alert.alert('Error', 'Failed to revoke invitation.');
            }
          },
        },
      ],
    );
  };

  const getName = (m: Member) => {
    const first = m.first_name ?? m.user?.first_name ?? '';
    const last = m.last_name ?? m.user?.last_name ?? '';
    return `${first} ${last}`.trim() || m.email || m.user?.email || 'Unknown';
  };

  const getEmail = (m: Member) => m.email ?? m.user?.email ?? '';

  const pendingInvites = invitations.filter((i) => i.status === 'pending');

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Members</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : error ? (
        <LoadError onRetry={() => load()} />
      ) : (
        <ScrollView
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
        >
          {/* ── Members ── */}
          <Text style={s.sectionTitle}>Members · {members.length}</Text>
          {members.map((m) => {
            const isOwner = m.is_owner || m.role === 'super_admin';
            const color = ROLE_COLORS[m.role] ?? '#6b7280';
            const name = getName(m);
            const email = getEmail(m);
            return (
              <View key={m.user_id} style={s.card}>
                <View style={[s.avatar, { backgroundColor: color + '22' }]}>
                  <Text style={[s.avatarText, { color }]}>
                    {(name[0] ?? '?').toUpperCase()}
                  </Text>
                </View>
                <View style={s.info}>
                  <Text style={s.name}>{name}</Text>
                  {email ? <Text style={s.email}>{email}</Text> : null}
                  <View style={[s.roleBadge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
                    <Text style={[s.roleText, { color }]}>{ROLE_LABELS[m.role] ?? m.role}</Text>
                  </View>
                </View>
                {!isOwner && canManage && (
                  <View style={s.actions}>
                    <TouchableOpacity style={s.actionBtn} onPress={() => changeRole(m)}>
                      <Ionicons name="swap-horizontal-outline" size={18} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.actionBtn} onPress={() => removeMember(m)}>
                      <Ionicons name="person-remove-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}

          {/* ── Pending Invitations ── */}
          <Text style={[s.sectionTitle, { marginTop: 20 }]}>
            Pending Invitations · {pendingInvites.length}
          </Text>
          {pendingInvites.length === 0 ? (
            <View style={s.emptyInvites}>
              <Text style={s.emptyInvitesText}>No pending invitations</Text>
            </View>
          ) : (
            pendingInvites.map((inv) => {
              const roleColor = ROLE_COLORS[inv.role] ?? '#6b7280';
              return (
                <View key={inv.id} style={s.invCard}>
                  <View style={s.invIconBox}>
                    <Ionicons name="mail-outline" size={18} color="#d97706" />
                  </View>
                  <View style={s.info}>
                    <Text style={s.name}>{inv.invited_email}</Text>
                    <View style={[s.roleBadge, { backgroundColor: roleColor + '18', borderColor: roleColor + '44' }]}>
                      <Text style={[s.roleText, { color: roleColor }]}>{ROLE_LABELS[inv.role] ?? inv.role}</Text>
                    </View>
                    {inv.created_at && (
                      <Text style={s.email}>Sent {new Date(inv.created_at).toLocaleDateString()}</Text>
                    )}
                  </View>
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#ef444414' }]} onPress={() => revokeInvitation(inv)}>
                    <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              );
            })
          )}

          {/* ── All invitations (history) ── */}
          {invitations.filter((i) => i.status !== 'pending').length > 0 && (
            <>
              <Text style={[s.sectionTitle, { marginTop: 20 }]}>Invitation History</Text>
              {invitations.filter((i) => i.status !== 'pending').map((inv) => {
                const statusColor = INV_STATUS_COLORS[inv.status] ?? '#6b7280';
                return (
                  <View key={inv.id} style={[s.invCard, { opacity: 0.7 }]}>
                    <View style={[s.invIconBox, { backgroundColor: statusColor + '14' }]}>
                      <Ionicons name="mail-outline" size={18} color={statusColor} />
                    </View>
                    <View style={s.info}>
                      <Text style={s.name}>{inv.invited_email}</Text>
                      <View style={[s.roleBadge, { backgroundColor: statusColor + '14', borderColor: statusColor + '33' }]}>
                        <Text style={[s.roleText, { color: statusColor }]}>{INV_STATUS_LABELS[inv.status] ?? inv.status}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}
    </View>
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
    list: { padding: 16, gap: 10 },
    sectionTitle: { fontSize: 12, color: c.textMuted, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: c.border,
    },
    invCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: '#d97706' + '33',
    },
    invIconBox: {
      width: 40, height: 40, borderRadius: 10,
      backgroundColor: '#d9770618', alignItems: 'center', justifyContent: 'center',
    },
    avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 18, fontWeight: '700' },
    info: { flex: 1, gap: 3 },
    name: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    email: { fontSize: 12, color: c.textSecondary },
    roleBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8, paddingVertical: 2,
      borderRadius: 6, borderWidth: 1,
    },
    roleText: { fontSize: 11, fontWeight: '700' },
    actions: { flexDirection: 'row', gap: 4 },
    actionBtn: {
      width: 34, height: 34, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.background,
    },
    emptyInvites: {
      backgroundColor: c.surface, borderRadius: 14, padding: 16,
      borderWidth: 1, borderColor: c.border, alignItems: 'center',
    },
    emptyInvitesText: { fontSize: 13, color: c.textMuted },
  });
}
