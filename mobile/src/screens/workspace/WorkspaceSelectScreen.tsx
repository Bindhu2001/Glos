import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useClerk } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../hooks/useApi';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { Colors } from '../../utils/colors';
import LoadingSpinner from '../../components/common/LoadingSpinner';

interface App {
  id: number;
  name: string;
  role: string;
  type: string;
}

export default function WorkspaceSelectScreen() {
  const api = useApi();
  const { setWorkspace } = useWorkspace();
  const { signOut } = useClerk();
  const insets = useSafeAreaInsets();

  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadApps = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const r = await api.workspace.listApps();
      const raw = r.data.apps ?? [];
      setApps(raw.map((a: any) => ({ ...a, role: a.role ?? a.my_role })));
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.error ?? err?.message ?? 'Unknown error';
      console.warn('[WorkspaceSelect] loadApps failed:', status, msg, 'Full error:', err);
      
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

  const ROLE_COLOR: Record<string, string> = {
    super_admin: Colors.danger,
    admin: Colors.warning,
    member: Colors.primary,
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Select Workspace</Text>
        <Text style={styles.subtitle}>Choose the workspace you want to enter</Text>
        <TouchableOpacity onPress={() => { setWorkspace(null); signOut(); }} style={styles.signOutBtn}>
          <Ionicons name="log-out-outline" size={18} color={Colors.gray500} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.gray400} />
          <Text style={styles.errorTitle}>Failed to load</Text>
          <Text style={styles.errorMsg}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadApps()}>
            <Ionicons name="refresh-outline" size={16} color={Colors.white} />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : apps.length === 0 ? (
        <FlatList
          data={[]}
          renderItem={null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="briefcase-outline" size={48} color={Colors.gray400} />
              <Text style={styles.emptyTitle}>No workspaces found</Text>
              <Text style={styles.emptySubtitle}>Ask your team admin to invite you to a workspace.</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={apps}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.appCard} onPress={() => selectApp(item)} activeOpacity={0.8}>
              <View style={styles.appIcon}>
                <Text style={styles.appIconText}>{item.name[0]?.toUpperCase()}</Text>
              </View>
              <View style={styles.appInfo}>
                <Text style={styles.appName}>{item.name}</Text>
                <Text style={styles.appType}>{item.type?.toUpperCase()}</Text>
              </View>
              {item.role ? (
                <View style={[styles.roleBadge, { backgroundColor: (ROLE_COLOR[item.role] ?? Colors.primary) + '20' }]}>
                  <Text style={[styles.roleText, { color: ROLE_COLOR[item.role] ?? Colors.primary }]}>
                    {item.role?.replace('_', ' ')}
                  </Text>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={18} color={Colors.gray400} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.white, padding: 24, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, alignSelf: 'flex-start' },
  signOutText: { fontSize: 14, color: Colors.gray500 },
  list: { padding: 16, gap: 10 },
  appCard: {
    backgroundColor: Colors.white, borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  appIcon: {
    width: 46, height: 46, borderRadius: 12,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  appIconText: { fontSize: 20, fontWeight: '800', color: Colors.white },
  appInfo: { flex: 1 },
  appName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  appType: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  roleText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  errorTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  errorMsg: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 10, marginTop: 4,
  },
  retryText: { color: Colors.white, fontWeight: '600', fontSize: 14 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, marginTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  emptySubtitle: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
});
