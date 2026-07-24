import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
  ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useClerk } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import Logo from '../../components/common/Logo';
import { useApi } from '../../hooks/useApi';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { showAlert } from '../../components/common/AlertModal';

interface App {
  id: number;
  name: string;
  role: string;
  type: string;
  billing_status?: string;
  member_count?: number;
  owner_email?: string;
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
  const { setWorkspace, setIsPlatformAdmin } = useWorkspace();
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

  // Create workspace modal
  const [showCreate, setShowCreate] = useState(false);
  const [newAppName, setNewAppName] = useState('');
  const [creating, setCreating] = useState(false);

  const loadApps = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [appsRes, invRes, meRes] = await Promise.all([
        api.workspace.listApps(),
        api.invitations.listMine().catch(() => ({ data: [] })),
        api.me.getProfile().catch(() => ({ data: {} })),
      ]);
      const raw = appsRes.data.apps ?? [];
      setApps(raw.map((a: any) => ({ ...a, role: a.role ?? a.my_role })));
      const invData = invRes.data;
      setInvitations(
        Array.isArray(invData) ? invData :
        Array.isArray(invData?.items) ? invData.items :
        Array.isArray(invData?.invitations) ? invData.invitations : []
      );
      setIsPlatformAdmin(!!(meRes.data?.isPlatformAdmin));
    } catch (err: any) {
      const status = err?.response?.status;
      const code = err?.response?.data?.code;
      if (status === 401) setError('Session expired. Please sign in again.');
      else if (code === 'ACCOUNT_DEACTIVATED') setError('Your account has been deactivated. Please contact your administrator.');
      else if (status === 403) setError('Access denied. You may not be a member of any workspace.');
      else setError(`Could not load workspaces (${status ?? 'network error'})`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, setIsPlatformAdmin]);

  useEffect(() => { loadApps(); }, [loadApps]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadApps(true);
  }, [loadApps]);

  const selectApp = (app: App) => {
    setWorkspace({ id: app.id, name: app.name, type: app.type, role: app.role as any });
  };

  const handleCreateWorkspace = async () => {
    const name = newAppName.trim();
    if (!name) { showAlert('Enter a name', 'Workspace name is required.'); return; }
    setCreating(true);
    try {
      const res = await api.workspace.createApp({ type: 'hr', name });
      const created = res.data;
      setShowCreate(false);
      setNewAppName('');
      // Auto-enter the new workspace as super_admin
      setWorkspace({
        id: created.id ?? created.appId,
        name: created.name ?? name,
        type: created.type ?? 'hr',
        role: 'super_admin',
      });
    } catch (err: any) {
      showAlert('Failed', err?.response?.data?.error ?? 'Could not create workspace.');
    } finally {
      setCreating(false);
    }
  };

  const handleAccept = async (inv: Invitation) => {
    setAcceptingToken(inv.token);
    try {
      await api.invitations.accept(inv.token);
      await loadApps(true);
    } catch (err: any) {
      showAlert('Error', err?.response?.data?.error ?? 'Failed to accept invitation');
    } finally {
      setAcceptingToken(null);
    }
  };

  const handleDecline = async (inv: Invitation) => {
    showAlert('Decline Invitation', `Decline invitation to ${inv.app_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline', style: 'destructive',
        onPress: async () => {
          setDecliningToken(inv.token);
          try {
            await api.invitations.decline(inv.token);
            setInvitations((prev) => prev.filter((i) => i.token !== inv.token));
          } catch (err: any) {
            showAlert('Error', err?.response?.data?.error ?? 'Failed to decline invitation');
          } finally { setDecliningToken(null); }
        },
      },
    ]);
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

  /* ── Hero section ── */
  const Hero = (
    <View style={s.hero}>
      <Logo size={40} width={160} />
      <View style={s.orbitWrap}>
        <View style={s.orbitRing} />
        <View style={s.orbitCenter}>
          <Ionicons name="briefcase" size={38} color="#3b82f6" />
        </View>
        <View style={[s.orbitIcon, s.orbitTL, { backgroundColor: '#3b82f622' }]}>
          <Ionicons name="people-outline" size={14} color="#3b82f6" />
        </View>
        <View style={[s.orbitIcon, s.orbitTR, { backgroundColor: '#22d3ee22' }]}>
          <Ionicons name="folder-outline" size={14} color="#22d3ee" />
        </View>
        <View style={[s.orbitIcon, s.orbitBL, { backgroundColor: '#f59e0b22' }]}>
          <Ionicons name="apps-outline" size={14} color="#f59e0b" />
        </View>
        <View style={[s.orbitIcon, s.orbitBR, { backgroundColor: '#5eead422' }]}>
          <Ionicons name="bar-chart-outline" size={14} color="#5eead4" />
        </View>
      </View>
      <Text style={s.heroTitle}>Select Workspace</Text>
      <Text style={s.heroSubtitle}>Choose the workspace{'\n'}you want to enter</Text>
    </View>
  );

  const ListHeader = Hero;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {loading ? (
        <>
          {ListHeader}
          <LoadingSpinner />
        </>
      ) : error ? (
        <>
          {ListHeader}
          <View style={s.errorContainer}>
            <Ionicons name="cloud-offline-outline" size={48} color={colors.gray400} />
            <Text style={s.errorTitle}>Failed to load</Text>
            <Text style={s.errorMsg}>{error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => loadApps()}>
              <Ionicons name="refresh-outline" size={16} color="#ffffff" />
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <FlatList
          data={apps}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <View>
              {ListHeader}
              {invitations.length > 0 && (
                <View style={s.invitationsSection}>
                  <View style={s.invitationsHeader}>
                    <Ionicons name="mail-outline" size={16} color={colors.primary} />
                    <Text style={s.invitationsTitle}>Pending Invitations ({invitations.length})</Text>
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
                        <Text style={s.invitationMeta}>Invited by {inviterName(inv)} · {inv.role}</Text>
                      </View>
                      <View style={s.invitationActions}>
                        <TouchableOpacity
                          style={[s.declineBtn, decliningToken === inv.token && s.actionBtnBusy]}
                          onPress={() => handleDecline(inv)}
                          disabled={acceptingToken === inv.token || decliningToken === inv.token}
                        >
                          {decliningToken === inv.token
                            ? <ActivityIndicator size="small" color={colors.danger} />
                            : <Text style={s.declineBtnText}>Decline</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.acceptBtn, acceptingToken === inv.token && s.actionBtnBusy]}
                          onPress={() => handleAccept(inv)}
                          disabled={acceptingToken === inv.token || decliningToken === inv.token}
                        >
                          {acceptingToken === inv.token
                            ? <ActivityIndicator size="small" color="#ffffff" />
                            : <Text style={s.acceptBtnText}>Accept</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              <View style={s.createRow}>
                <TouchableOpacity style={s.createBtn} onPress={() => setShowCreate(true)}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                  <Text style={s.createBtnText}>Create New Workspace</Text>
                </TouchableOpacity>
              </View>
              {apps.length > 0 && <Text style={s.workspacesLabel}>Your Workspaces</Text>}
            </View>
          }
          ListEmptyComponent={
            invitations.length === 0 ? (
              <View style={s.emptyContainer}>
                <Ionicons name="briefcase-outline" size={48} color={colors.gray400} />
                <Text style={s.emptyTitle}>No workspaces yet</Text>
                <Text style={s.emptySubtitle}>Create a new workspace or ask your admin to invite you.</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const isSuspended = item.billing_status === 'suspended' || item.billing_status === 'cancelled';
            const iconColor = isSuspended ? colors.gray400 : colorForName(item.name);
            const rc = roleColor(item.role);
            return (
              <TouchableOpacity
                style={[
                  s.appCard,
                  { borderLeftColor: iconColor },
                  isSuspended && s.appCardDisabled,
                ]}
                onPress={isSuspended ? undefined : () => selectApp(item)}
                activeOpacity={isSuspended ? 1 : 0.8}
                disabled={isSuspended}
              >
                <View style={[s.appIcon, { backgroundColor: iconColor + '22', borderWidth: 1.5, borderColor: iconColor + '44' }]}>
                  <Text style={[s.appIconText, { color: iconColor }]}>{item.name[0]?.toUpperCase()}</Text>
                </View>
                <View style={s.appInfo}>
                  <Text style={[s.appName, isSuspended && s.appNameDisabled]}>{item.name}</Text>
                  <Text style={s.appType}>{item.type?.toUpperCase()}</Text>
                </View>
                {isSuspended ? (
                  <View style={s.suspendedBadge}>
                    <Ionicons name="ban-outline" size={11} color={colors.danger} />
                    <Text style={s.suspendedText}>
                      {item.billing_status === 'cancelled' ? 'Cancelled' : 'Suspended'}
                    </Text>
                  </View>
                ) : (item.role === 'super_admin' || item.role === 'admin') ? (
                  <View style={[s.roleBadge, { backgroundColor: rc + '22' }]}>
                    <Text style={[s.roleText, { color: rc }]}>Admin</Text>
                  </View>
                ) : item.role === 'member' ? (
                  <View style={[s.roleBadge, { backgroundColor: colors.primary + '22' }]}>
                    <Text style={[s.roleText, { color: colors.primary }]}>Member</Text>
                  </View>
                ) : null}
                {!isSuspended && <Ionicons name="chevron-forward" size={18} color={colors.gray400} />}
              </TouchableOpacity>
            );
          }}
        />
      )}
      {!loading && !error && (
        <View style={s.footer}>
          <TouchableOpacity onPress={() => { setWorkspace(null); signOut({ redirectUrl: undefined }); }} style={s.signOutBtn}>
            <Ionicons name="log-out-outline" size={16} color={colors.danger} />
            <Text style={s.signOutText}>Sign Out</Text>
          </TouchableOpacity>
          <View style={s.footerTrust}>
            <Ionicons name="shield-checkmark-outline" size={13} color={colors.gray400} />
            <Text style={s.footerText}>Secure • Reliable • Trusted</Text>
          </View>
        </View>
      )}

      {/* Create Workspace Modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior="padding">
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Create Workspace</Text>
              <TouchableOpacity onPress={() => { setShowCreate(false); setNewAppName(''); }} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={s.modalLabel}>Workspace Name</Text>
            <TextInput
              style={s.modalInput}
              placeholder="e.g. Acme Corp HR"
              placeholderTextColor={colors.gray400}
              value={newAppName}
              onChangeText={setNewAppName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreateWorkspace}
            />
            <Text style={s.modalHint}>Type: HR · You will be the super admin</Text>
            <TouchableOpacity
              style={[s.modalSubmit, creating && s.modalSubmitBusy]}
              onPress={handleCreateWorkspace}
              disabled={creating}
            >
              {creating
                ? <ActivityIndicator color="#ffffff" size="small" />
                : <Text style={s.modalSubmitText}>Create Workspace</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },

    // ── Shared ──
    logoImg: { width: 180, height: 64 },
    signOutText: { fontSize: 14, color: c.danger, fontWeight: '600' },

    // ── Hero ──
    hero: { alignItems: 'center', paddingTop: 32, paddingBottom: 24, paddingHorizontal: 24 },
    orbitWrap: {
      width: 160, height: 160, alignItems: 'center', justifyContent: 'center',
      marginTop: 20, marginBottom: 20, position: 'relative',
    },
    orbitRing: {
      position: 'absolute', width: 140, height: 140, borderRadius: 70,
      borderWidth: 1.5, borderColor: '#3b82f655', borderStyle: 'dashed',
    },
    orbitCenter: {
      width: 88, height: 88, borderRadius: 44,
      backgroundColor: '#3b82f618', borderWidth: 2, borderColor: '#3b82f640',
      alignItems: 'center', justifyContent: 'center',
    },
    orbitIcon: { position: 'absolute', width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    orbitTL: { top: 10, left: 10 },
    orbitTR: { top: 10, right: 10 },
    orbitBL: { bottom: 10, left: 10 },
    orbitBR: { bottom: 10, right: 10 },
    heroTitle: { fontSize: 26, fontWeight: '800', color: c.textPrimary, textAlign: 'center' },
    heroSubtitle: { fontSize: 14, color: c.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 22 },

    list: { paddingHorizontal: 16, paddingBottom: 32 },
    workspacesLabel: {
      fontSize: 11, fontWeight: '700', color: c.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginTop: 4,
    },

    createRow: { marginBottom: 16 },
    createBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      paddingVertical: 12, borderRadius: 12,
      borderWidth: 1.5, borderColor: c.primary, borderStyle: 'dashed',
      backgroundColor: c.primaryLight,
    },
    createBtnText: { fontSize: 14, fontWeight: '700', color: c.primary },

    // Create modal
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    modalSheet: {
      backgroundColor: c.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22,
      padding: 20,
    },
    modalHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: c.textPrimary },
    modalLabel: { fontSize: 12, fontWeight: '700', color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    modalInput: {
      backgroundColor: c.gray100, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 15, color: c.textPrimary, borderWidth: 1.5, borderColor: c.border,
    },
    modalHint: { fontSize: 12, color: c.textMuted, marginTop: 8, marginBottom: 20 },
    modalSubmit: {
      backgroundColor: c.primary, borderRadius: 12, paddingVertical: 15,
      alignItems: 'center',
    },
    modalSubmitBusy: { opacity: 0.6 },
    modalSubmitText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },

    // Invitations
    invitationsSection: {
      backgroundColor: c.primaryLight, borderRadius: 14, padding: 14,
      marginBottom: 16, gap: 10,
    },
    invitationsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    invitationsTitle: { fontSize: 13, fontWeight: '700', color: c.primary },
    invitationCard: {
      backgroundColor: c.surface, borderRadius: 12, padding: 12,
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderWidth: 1, borderColor: c.border,
    },
    invitationIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    invitationIconText: { fontSize: 18, fontWeight: '800' },
    invitationInfo: { flex: 1 },
    invitationAppName: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    invitationMeta: { fontSize: 11, color: c.textSecondary, marginTop: 2 },
    invitationActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    declineBtn: { borderWidth: 1, borderColor: c.danger, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, minWidth: 64, alignItems: 'center' },
    declineBtnText: { fontSize: 13, fontWeight: '700', color: c.danger },
    acceptBtn: { backgroundColor: c.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, minWidth: 64, alignItems: 'center' },
    actionBtnBusy: { opacity: 0.7 },
    acceptBtnText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },

    // Workspace cards
    appCard: {
      backgroundColor: c.surface, borderRadius: 14, padding: 16,
      flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: 1, borderColor: c.border, borderLeftWidth: 4,
      marginBottom: 10,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    },
    appCardDisabled: { opacity: 0.5 },
    appIcon: { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    appIconText: { fontSize: 26, fontWeight: '800' },
    appInfo: { flex: 1 },
    appName: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    appNameDisabled: { color: c.textMuted },
    appType: { fontSize: 11, color: c.textSecondary, marginTop: 2 },
    roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    roleText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
    suspendedBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: c.dangerLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    },
    suspendedText: { fontSize: 11, fontWeight: '600', color: c.danger },

    // Error / empty
    errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
    errorTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
    errorMsg: { fontSize: 13, color: c.textSecondary, textAlign: 'center' },
    retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
    retryText: { color: '#ffffff', fontWeight: '600', fontSize: 14 },
    emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, marginTop: 20 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
    emptySubtitle: { fontSize: 13, color: c.textSecondary, textAlign: 'center' },

    // Footer
    footer: { alignItems: 'center', gap: 16, paddingVertical: 16, paddingHorizontal: 20, backgroundColor: c.background, borderTopWidth: 1, borderTopColor: c.border },
    signOutBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: c.danger + '44', backgroundColor: c.dangerLight },
    footerTrust: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    footerText: { fontSize: 12, color: c.gray400 },
  });
}
