import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
  ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useClerk } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../hooks/useApi';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import LoadingSpinner from '../../components/common/LoadingSpinner';

interface App {
  id: number;
  name: string;
  role: string;
  type: string;
}

interface Invitation {
  id: number;
  token: string;
  app_name: string;
  app_type: string;
  role: string;
  invited_by_first_name?: string;
  invited_by_last_name?: string;
  invited_by_email?: string;
}

const APP_PALETTE = [
  '#1a56db', '#0e9f6e', '#c27803', '#e02424', '#7e3af2', '#0694a2',
];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return APP_PALETTE[Math.abs(hash) % APP_PALETTE.length];
}

export default function WorkspaceSelectScreen() {
  const api = useApi();
  const { setWorkspace } = useWorkspace();
  const { signOut } = useClerk();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [apps, setApps] = useState<App[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptingToken, setAcceptingToken] = useState<string | null>(null);
  const [decliningToken, setDecliningToken] = useState<string | null>(null);

  const loadApps = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [appsRes, invRes] = await Promise.all([
        api.workspace.listApps(),
        api.invitations.listMine().catch(() => ({ data: [] })),
      ]);
      const raw = appsRes.data.apps ?? [];
      setApps(raw.map((a: any) => ({ ...a, role: a.role ?? a.my_role })));
      const invData = invRes.data;
      setInvitations(
        Array.isArray(invData) ? invData :
        Array.isArray(invData?.items) ? invData.items :
        Array.isArray(invData?.invitations) ? invData.invitations : []
      );
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        setError('Session expired. Please sign in again.');
      } else if (status === 403) {
        setError('Access denied. You may not be a member of any workspace.');
      } else {
        setError(`Could not load workspaces (${status ?? 'network error'})`);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api]);

  useEffect(() => { loadApps(); }, [loadApps]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadApps(true);
  }, [loadApps]);

  const selectApp = (app: App) => {
    setWorkspace({ id: app.id, name: app.name, type: app.type, role: app.role as any });
  };

  const handleAccept = async (inv: Invitation) => {
    setAcceptingToken(inv.token);
    try {
      await api.invitations.accept(inv.token);
      await loadApps(true);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Failed to accept invitation');
    } finally {
      setAcceptingToken(null);
    }
  };

  const handleDecline = async (inv: Invitation) => {
    Alert.alert(
      'Decline Invitation',
      `Decline invitation to ${inv.app_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setDecliningToken(inv.token);
            try {
              await api.invitations.decline(inv.token);
              setInvitations((prev) => prev.filter((i) => i.token !== inv.token));
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.error ?? 'Failed to decline invitation');
            } finally {
              setDecliningToken(null);
            }
          },
        },
      ],
    );
  };

  const inviterName = (inv: Invitation) => {
    const name = [inv.invited_by_first_name, inv.invited_by_last_name].filter(Boolean).join(' ');
    return name || inv.invited_by_email || 'Someone';
  };

  const roleColor = (role: string) => {
    if (role === 'super_admin') return colors.danger;
    if (role === 'admin') return colors.warning;
    return colors.primary;
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>Select Workspace</Text>
        <Text style={s.subtitle}>Choose the workspace you want to enter</Text>
        <TouchableOpacity onPress={() => { setWorkspace(null); signOut(); }} style={s.signOutBtn}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <View style={s.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.gray400} />
          <Text style={s.errorTitle}>Failed to load</Text>
          <Text style={s.errorMsg}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => loadApps()}>
            <Ionicons name="refresh-outline" size={16} color="#ffffff" />
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={apps}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            invitations.length > 0 ? (
              <View style={s.invitationsSection}>
                <View style={s.invitationsHeader}>
                  <Ionicons name="mail-outline" size={16} color={colors.primary} />
                  <Text style={s.invitationsTitle}>
                    Pending Invitations ({invitations.length})
                  </Text>
                </View>
                {invitations.map((inv) => (
                  <View key={inv.id} style={s.invitationCard}>
                    <View style={[s.invitationIcon, { backgroundColor: colorForName(inv.app_name) + '22' }]}>
                      <Text style={[s.invitationIconText, { color: colorForName(inv.app_name) }]}>
                        {inv.app_name[0]?.toUpperCase()}
                      </Text>
                    </View>
                    <View style={s.invitationInfo}>
                      <Text style={s.invitationAppName}>{inv.app_name}</Text>
                      <Text style={s.invitationMeta}>
                        Invited by {inviterName(inv)} · Role: {inv.role}
                      </Text>
                    </View>
                    <View style={s.invitationActions}>
                      <TouchableOpacity
                        style={[s.declineBtn, decliningToken === inv.token && s.actionBtnBusy]}
                        onPress={() => handleDecline(inv)}
                        disabled={acceptingToken === inv.token || decliningToken === inv.token}
                      >
                        {decliningToken === inv.token ? (
                          <ActivityIndicator size="small" color={colors.danger} />
                        ) : (
                          <Text style={s.declineBtnText}>Decline</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.acceptBtn, acceptingToken === inv.token && s.actionBtnBusy]}
                        onPress={() => handleAccept(inv)}
                        disabled={acceptingToken === inv.token || decliningToken === inv.token}
                      >
                        {acceptingToken === inv.token ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text style={s.acceptBtnText}>Accept</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            ) : null
          }
          ListEmptyComponent={
            invitations.length === 0 ? (
              <View style={s.emptyContainer}>
                <Ionicons name="briefcase-outline" size={48} color={colors.gray400} />
                <Text style={s.emptyTitle}>No workspaces found</Text>
                <Text style={s.emptySubtitle}>Ask your team admin to invite you to a workspace.</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const iconColor = colorForName(item.name);
            const rc = roleColor(item.role);
            return (
              <TouchableOpacity
                style={[s.appCard, { borderLeftColor: iconColor }]}
                onPress={() => selectApp(item)}
                activeOpacity={0.8}
              >
                <View style={[s.appIcon, { backgroundColor: iconColor }]}>
                  <Text style={s.appIconText}>{item.name[0]?.toUpperCase()}</Text>
                </View>
                <View style={s.appInfo}>
                  <Text style={s.appName}>{item.name}</Text>
                  <Text style={s.appType}>{item.type?.toUpperCase()}</Text>
                </View>
                {item.role ? (
                  <View style={[s.roleBadge, { backgroundColor: rc + '22' }]}>
                    <Text style={[s.roleText, { color: rc }]}>
                      {item.role?.replace('_', ' ')}
                    </Text>
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={18} color={colors.gray400} />
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      backgroundColor: c.surface, padding: 24, paddingBottom: 20,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    title: { fontSize: 26, fontWeight: '800', color: c.textPrimary },
    subtitle: { fontSize: 14, color: c.textSecondary, marginTop: 4 },
    signOutBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, alignSelf: 'flex-start' },
    signOutText: { fontSize: 14, color: c.danger, fontWeight: '600' },
    list: { padding: 16, gap: 10 },
    // Invitations
    invitationsSection: {
      backgroundColor: c.primaryLight, borderRadius: 14, padding: 14,
      marginBottom: 6, gap: 10,
    },
    invitationsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    invitationsTitle: { fontSize: 13, fontWeight: '700', color: c.primary },
    invitationCard: {
      backgroundColor: c.surface, borderRadius: 12, padding: 12,
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderWidth: 1, borderColor: c.border,
    },
    invitationIcon: {
      width: 40, height: 40, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center',
    },
    invitationIconText: { fontSize: 18, fontWeight: '800' },
    invitationInfo: { flex: 1 },
    invitationAppName: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    invitationMeta: { fontSize: 11, color: c.textSecondary, marginTop: 2 },
    invitationActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    declineBtn: {
      borderWidth: 1, borderColor: c.danger, paddingHorizontal: 12, paddingVertical: 8,
      borderRadius: 8, minWidth: 64, alignItems: 'center',
    },
    declineBtnText: { fontSize: 13, fontWeight: '700', color: c.danger },
    acceptBtn: {
      backgroundColor: c.primary, paddingHorizontal: 14, paddingVertical: 8,
      borderRadius: 8, minWidth: 64, alignItems: 'center',
    },
    actionBtnBusy: { opacity: 0.7 },
    acceptBtnText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
    // Workspace cards
    appCard: {
      backgroundColor: c.surface, borderRadius: 14, padding: 16,
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: 1, borderColor: c.border,
      borderLeftWidth: 4,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    },
    appIcon: {
      width: 46, height: 46, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center',
    },
    appIconText: { fontSize: 20, fontWeight: '800', color: '#ffffff' },
    appInfo: { flex: 1 },
    appName: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    appType: { fontSize: 11, color: c.textSecondary, marginTop: 2 },
    roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    roleText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
    errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
    errorTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
    errorMsg: { fontSize: 13, color: c.textSecondary, textAlign: 'center' },
    retryBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: c.primary, paddingHorizontal: 20, paddingVertical: 10,
      borderRadius: 10, marginTop: 4,
    },
    retryText: { color: '#ffffff', fontWeight: '600', fontSize: 14 },
    emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, marginTop: 80 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
    emptySubtitle: { fontSize: 13, color: c.textSecondary, textAlign: 'center' },
  });
}
