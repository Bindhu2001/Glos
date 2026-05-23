import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../hooks/useApi';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import { formatDuration } from '../../utils/format';
import LoadingSpinner from '../../components/common/LoadingSpinner';

interface DashData {
  tasks?: { total?: number; done?: number; in_progress?: number; open?: number; blocked?: number; overdue?: number; completion_rate?: number };
  hours?: { today?: { minutes?: number }; this_week?: { minutes?: number }; this_month?: { minutes?: number } };
  latest_review?: any;
  roles?: any[];
}

function StatCard({ icon, label, value, color, s }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string | number; color: string; s: ReturnType<typeof makeStyles> }) {
  return (
    <View style={[s.statCard, { borderLeftColor: color }]}>
      <View style={[s.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const api = useApi();
  const { workspace, setWorkspace } = useWorkspace();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      const [dash, notif] = await Promise.all([
        api.dashboard.getMyDashboard(workspace.id),
        api.notifications.unreadCount(),
      ]);
      setData(dash.data);
      setUnread(notif.data.count ?? 0);
    } catch {}
  }, [workspace]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>My Dashboard</Text>
          <Text style={s.wsName}>{workspace?.name}</Text>
        </View>
        <View style={s.headerRight}>
          <TouchableOpacity
            style={s.notifBtn}
            onPress={() => navigation.navigate('Notifications')}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
            {unread > 0 && (
              <View style={s.badge}>
                <Text style={s.badgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setWorkspace(null)} hitSlop={8}>
            <Ionicons name="swap-horizontal-outline" size={22} color={colors.gray500} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.sectionLabel}>Overview</Text>
        <View style={s.statsGrid}>
          <StatCard s={s} icon="checkmark-circle-outline" label="My Tasks" value={data?.tasks?.total ?? 0} color={colors.primary} />
          <StatCard s={s} icon="trophy-outline" label="Completed" value={data?.tasks?.done ?? 0} color={colors.success} />
          <StatCard s={s} icon="alert-circle-outline" label="In Progress" value={data?.tasks?.in_progress ?? 0} color={colors.warning} />
          <StatCard s={s} icon="time-outline" label="Time This Month" value={formatDuration(data?.hours?.this_month?.minutes ?? 0)} color={colors.info} />
        </View>

        <Text style={[s.sectionLabel, { marginTop: 20 }]}>Quick Actions</Text>
        <View style={s.quickActions}>
          <TouchableOpacity style={s.qaBtn} onPress={() => navigation.navigate('TasksTab', { screen: 'CreateTask', params: { appId: workspace!.id } })}>
            <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
            <Text style={s.qaLabel}>New Task</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.qaBtn} onPress={() => navigation.navigate('FeedTab', { screen: 'CreatePost', params: { appId: workspace!.id } })}>
            <Ionicons name="create-outline" size={24} color={colors.success} />
            <Text style={s.qaLabel}>New Post</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.qaBtn} onPress={() => navigation.navigate('FeedTab')}>
            <Ionicons name="newspaper-outline" size={24} color={colors.warning} />
            <Text style={s.qaLabel}>Feed</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.qaBtn} onPress={() => navigation.navigate('ProfileTab')}>
            <Ionicons name="person-outline" size={24} color={colors.info} />
            <Text style={s.qaLabel}>Profile</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: c.surface, paddingHorizontal: 20, paddingBottom: 14,
      paddingTop: 10, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    greeting: { fontSize: 20, fontWeight: '700', color: c.textPrimary },
    wsName: { fontSize: 13, color: c.textSecondary, marginTop: 1 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    notifBtn: { position: 'relative' },
    badge: {
      position: 'absolute', top: -4, right: -4, backgroundColor: c.danger,
      minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    },
    badgeText: { fontSize: 10, color: '#ffffff', fontWeight: '700' },
    content: { padding: 16, paddingBottom: 32 },
    sectionLabel: { fontSize: 13, fontWeight: '700', color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
    statCard: {
      flex: 1, minWidth: '44%', backgroundColor: c.surface, borderRadius: 12, padding: 14,
      borderLeftWidth: 3, borderWidth: 1, borderColor: c.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
    },
    statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    statValue: { fontSize: 22, fontWeight: '800', color: c.textPrimary },
    statLabel: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
    quickActions: { flexDirection: 'row', gap: 10 },
    qaBtn: {
      flex: 1, backgroundColor: c.surface, borderRadius: 12, padding: 14,
      alignItems: 'center', gap: 8, borderWidth: 1, borderColor: c.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
    },
    qaLabel: { fontSize: 12, fontWeight: '600', color: c.textSecondary, textAlign: 'center' },
  });
}
