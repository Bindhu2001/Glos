import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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

function StatCard({
  icon, label, value, iconBg, iconColor, s,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  iconBg: string;
  iconColor: string;
  s: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={s.statCard}>
      <View style={[s.statIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function QuickActionBtn({
  icon, label, iconColor, onPress, s,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  iconColor: string;
  onPress: () => void;
  s: ReturnType<typeof makeStyles>;
}) {
  return (
    <TouchableOpacity style={s.qaBtn} onPress={onPress} activeOpacity={0.8}>
      <View style={[s.qaIcon, { backgroundColor: iconColor + '22' }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <Text style={s.qaLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export default function DashboardScreen() {
  const api = useApi();
  const { workspace, setWorkspace } = useWorkspace();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [data, setData] = useState<DashData | null>(null);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      const [dash, notif, me] = await Promise.all([
        api.dashboard.getMyDashboard(workspace.id),
        api.notifications.unreadCount(),
        api.me.getProfile(),
      ]);
      setData(dash.data);
      setUnread(notif.data.count ?? 0);
      const first = me.data?.firstName ?? me.data?.first_name ?? '';
      setUserName(first);
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

  const greeting = getGreeting();
  const displayName = userName || 'there';

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity hitSlop={12}>
          <Ionicons name="menu-outline" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Dashboard</Text>
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
        {/* Greeting */}
        <Text style={s.greeting}>{greeting}, {displayName} 👋</Text>
        <Text style={s.greetingSub}>Here's what's happening today.</Text>

        {/* Workspace Banner */}
        <LinearGradient
          colors={['#4F6EF7', '#7e3af2']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.bannerCard}
        >
          <View style={s.bannerLeft}>
            <View style={s.bannerAppRow}>
              <Ionicons name="briefcase-outline" size={14} color="rgba(255,255,255,0.8)" />
              <Text style={s.bannerAppName}>{workspace?.name}</Text>
            </View>
            <Text style={s.bannerTitle}>My Dashboard</Text>
          </View>
          <View style={s.bannerIllustration}>
            <Ionicons name="bar-chart-outline" size={48} color="rgba(255,255,255,0.3)" />
          </View>
        </LinearGradient>

        {/* Overview */}
        <Text style={s.sectionLabel}>Overview</Text>
        <View style={s.statsGrid}>
          <StatCard
            s={s}
            icon="checkmark-circle-outline"
            label="My Tasks"
            value={data?.tasks?.total ?? 0}
            iconBg={colors.primary + '22'}
            iconColor={colors.primary}
          />
          <StatCard
            s={s}
            icon="trophy-outline"
            label="Completed"
            value={data?.tasks?.done ?? 0}
            iconBg={colors.success + '22'}
            iconColor={colors.success}
          />
          <StatCard
            s={s}
            icon="alert-circle-outline"
            label="In Progress"
            value={data?.tasks?.in_progress ?? 0}
            iconBg={colors.warning + '22'}
            iconColor={colors.warning}
          />
          <StatCard
            s={s}
            icon="time-outline"
            label="Time This Month"
            value={formatDuration(data?.hours?.this_month?.minutes ?? 0)}
            iconBg={colors.info + '22'}
            iconColor={colors.info}
          />
        </View>

        {/* Quick Actions */}
        <Text style={[s.sectionLabel, { marginTop: 20 }]}>Quick Actions</Text>
        <View style={s.quickActions}>
          <QuickActionBtn
            s={s}
            icon="add-circle-outline"
            label="New Task"
            iconColor={colors.primary}
            onPress={() => navigation.navigate('TasksTab', { screen: 'CreateTask', params: { appId: workspace!.id } })}
          />
          <QuickActionBtn
            s={s}
            icon="create-outline"
            label="New Post"
            iconColor={colors.success}
            onPress={() => navigation.navigate('FeedTab', { screen: 'CreatePost', params: { appId: workspace!.id } })}
          />
          <QuickActionBtn
            s={s}
            icon="newspaper-outline"
            label="Feed"
            iconColor={colors.warning}
            onPress={() => navigation.navigate('FeedTab')}
          />
          <QuickActionBtn
            s={s}
            icon="person-outline"
            label="Profile"
            iconColor="#7e3af2"
            onPress={() => navigation.navigate('ProfileTab')}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },

    // Header
    header: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: c.surface, paddingHorizontal: 20,
      paddingBottom: 14, paddingTop: 10,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: c.textPrimary, marginLeft: 12 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    notifBtn: { position: 'relative' },
    badge: {
      position: 'absolute', top: -4, right: -4, backgroundColor: c.danger,
      minWidth: 16, height: 16, borderRadius: 8,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    },
    badgeText: { fontSize: 10, color: '#ffffff', fontWeight: '700' },

    content: { padding: 20, paddingBottom: 40 },

    // Greeting
    greeting: { fontSize: 22, fontWeight: '800', color: c.textPrimary, marginBottom: 4 },
    greetingSub: { fontSize: 13, color: c.textSecondary, marginBottom: 20 },

    // Workspace Banner
    bannerCard: {
      borderRadius: 16, padding: 20, flexDirection: 'row',
      alignItems: 'center', marginBottom: 24, overflow: 'hidden',
    },
    bannerLeft: { flex: 1 },
    bannerAppRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
    bannerAppName: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
    bannerTitle: { fontSize: 20, fontWeight: '800', color: '#ffffff' },
    bannerIllustration: { opacity: 0.9 },

    // Overview grid
    sectionLabel: {
      fontSize: 12, fontWeight: '700', color: c.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12,
    },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 4 },
    statCard: {
      flex: 1, minWidth: '44%', backgroundColor: c.surface,
      borderRadius: 14, padding: 16,
      borderWidth: 1, borderColor: c.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    statIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    statValue: { fontSize: 24, fontWeight: '800', color: c.textPrimary },
    statLabel: { fontSize: 12, color: c.textSecondary, marginTop: 2 },

    // Quick Actions
    quickActions: { flexDirection: 'row', gap: 10 },
    qaBtn: {
      flex: 1, backgroundColor: c.surface, borderRadius: 14, padding: 14,
      alignItems: 'center', gap: 10, borderWidth: 1, borderColor: c.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
    },
    qaIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    qaLabel: { fontSize: 11, fontWeight: '600', color: c.textSecondary, textAlign: 'center' },
  });
}
