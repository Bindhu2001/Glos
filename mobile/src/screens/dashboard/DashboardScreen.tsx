import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, Platform, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../hooks/useApi';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import { formatDuration } from '../../utils/format';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Logo from '../../components/common/Logo';

interface DashData {
  tasks?: { total?: number; done?: number; in_progress?: number; open?: number; blocked?: number; overdue?: number; completion_rate?: number };
  hours?: { today?: { minutes?: number }; this_week?: { minutes?: number }; this_month?: { minutes?: number } };
  latest_review?: any;
  roles?: any[];
}

interface FeedItem {
  id: number;
  author_name?: string;
  author?: { first_name?: string; last_name?: string; email?: string };
  post_type?: string;
  type?: string;
  content?: string;
  body?: string;
  created_at?: string;
}

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning,';
  if (h < 17) return 'Good afternoon,';
  return 'Good evening,';
}

function timeAgo(iso?: string) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function initials(name?: string) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function decodeHtml(str: string) {
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
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
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      const [appRes, dash, notif, me, feedRes] = await Promise.all([
        api.workspace.getApp(workspace.id),
        api.dashboard.getMyDashboard(workspace.id),
        api.notifications.unreadCount(),
        api.me.getProfile(),
        api.feed.list(workspace.id),
      ]);
      const appData = appRes.data?.app ?? appRes.data;
      if (appData && appData.is_active === false) {
        setWorkspace(null);
        return;
      }
      setData(dash.data);
      setUnread(notif.data.count ?? 0);
      const first = me.data?.firstName ?? me.data?.first_name ?? '';
      const last = me.data?.lastName ?? me.data?.last_name ?? '';
      setUserName(`${first} ${last}`.trim() || first);
      const items = feedRes.data?.items ?? feedRes.data ?? [];
      setFeed(Array.isArray(items) ? items.slice(0, 3) : []);
    } catch {}
  }, [workspace, api, setWorkspace]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useFocusEffect(useCallback(() => {
    if (!workspace) return;
    api.notifications.unreadCount()
      .then((r) => setUnread(r.data.count ?? 0))
      .catch(() => {});
  }, [workspace, api]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) return <LoadingSpinner />;

  const tasks = data?.tasks;
  const total = tasks?.total ?? 0;
  const done = tasks?.done ?? 0;
  const inProgress = tasks?.in_progress ?? 0;
  const overdue = tasks?.overdue ?? 0;
  const todayMins = data?.hours?.today?.minutes ?? 0;
  const weekMins = data?.hours?.this_week?.minutes ?? 0;
  const monthMins = data?.hours?.this_month?.minutes ?? 0;
  const displayName = userName || 'there';
  const greetFirst = displayName.split(' ')[0];
  const now = new Date();
  const dateLabel = `${DAY_NAMES[now.getDay()]} · ${now.getDate()} ${MONTH_SHORT[now.getMonth()]}`;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={s.topBar}>
        <Logo size={54} width={170} />
        <View style={s.topRight}>
          <TouchableOpacity style={s.iconBtn} onPress={() => navigation.navigate('Notifications')}>
            <Ionicons name="notifications-outline" size={20} color={colors.primary} />
            {unread > 0 && <View style={s.notifDot} />}
          </TouchableOpacity>
          <View style={s.avatar}>
            <Text style={s.avatarTxt}>{initials(displayName)}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Date strip */}
        <View style={s.dateStrip}>
          <View style={s.greenDot} />
          <Text style={s.dateLabel}>{dateLabel}</Text>
          <Text style={s.dateSep}>·</Text>
          <Text style={s.wsLabel}>{workspace?.name?.toUpperCase() ?? 'WORKSPACE'}</Text>
        </View>

        {/* Greeting */}
        <View style={s.greetSection}>
          <Text style={s.greetLine}>{getGreeting()}</Text>
          <Text style={s.greetName}>{displayName}</Text>
          <Text style={s.greetTagline}>— ready when you are.</Text>
        </View>

        {/* This week logged card */}
        <View style={s.loggedCard}>
          <Text style={s.loggedLabel}>THIS WEEK · LOGGED</Text>
          <Text style={s.loggedHours}>{formatDuration(weekMins)}</Text>
          <Text style={s.loggedSub}>{total} tasks · {done} completed · {inProgress} in progress</Text>
          <View style={s.loggedBtns}>
            <TouchableOpacity style={s.logBtn} onPress={() => navigation.navigate('TasksTab')}>
              <Ionicons name="checkmark-circle-outline" size={14} color={colors.primary} />
              <Text style={s.logBtnTxt}>My Tasks</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.logBtn, s.logBtnTeal]} onPress={() => navigation.navigate('PerformanceTab', { screen: 'TaskReports' })}>
              <Ionicons name="bar-chart-outline" size={14} color={colors.secondary} />
              <Text style={[s.logBtnTxt, { color: colors.secondary }]}>Task Report</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 2×2 Stats grid */}
        <View style={s.statsGrid}>
          <View style={[s.statCell, s.statCellBR]}>
            <Text style={s.statPeriod}>TODAY</Text>
            <Text style={s.statNum}>{formatDuration(todayMins)}</Text>
            <Text style={s.statSub}>logged</Text>
          </View>
          <View style={[s.statCell, s.statCellB]}>
            <Text style={s.statPeriod}>THIS WEEK</Text>
            <Text style={[s.statNum, { color: colors.primary }]}>{formatDuration(weekMins)}</Text>
            <Text style={s.statSub}>logged</Text>
          </View>
          <View style={[s.statCell, s.statCellR]}>
            <Text style={s.statPeriod}>THIS MONTH</Text>
            <Text style={[s.statNum, { color: colors.secondary }]}>{formatDuration(monthMins)}</Text>
            <Text style={s.statSub}>logged</Text>
          </View>
          <View style={s.statCell}>
            <Text style={s.statPeriod}>TASKS</Text>
            <Text style={[s.statNum, { color: overdue > 0 ? colors.danger : colors.success }]}>
              {overdue > 0 ? overdue : done}
            </Text>
            <Text style={s.statSub}>{overdue > 0 ? 'overdue' : 'done'}</Text>
          </View>
        </View>

        {/* Switch workspace */}
        <TouchableOpacity style={s.switchRow} onPress={() => setWorkspace(null)}>
          <Ionicons name="swap-horizontal-outline" size={14} color={colors.primary} />
          <Text style={s.switchTxt}>Switch Workspace</Text>
          <Text style={s.switchName} numberOfLines={1}>{workspace?.name}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.gray400} />
        </TouchableOpacity>

        {/* Team Feed */}
        <View style={s.feedSec}>
          <View style={s.feedHeader}>
            <Text style={s.feedTitle}>TEAM FEED</Text>
            <TouchableOpacity onPress={() => navigation.navigate('FeedTab')}>
              <Text style={s.feedSeeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          {feed.length === 0 ? (
            <View style={s.feedEmpty}>
              <Ionicons name="newspaper-outline" size={28} color={colors.gray300} />
              <Text style={s.feedEmptyTxt}>No recent posts</Text>
            </View>
          ) : (
            feed.map(item => {
              const name = item.author_name ?? ([item.author?.first_name, item.author?.last_name].filter(Boolean).join(' ') || item.author?.email || 'User');
              const type = item.post_type ?? item.type ?? 'post';
              const text = decodeHtml(item.content ?? item.body ?? '');
              const isAppr = type === 'appreciation';
              return (
                <TouchableOpacity
                  key={item.id}
                  style={s.feedItem}
                  activeOpacity={0.75}
                  onPress={() => navigation.navigate('FeedTab', { screen: 'PostDetail', params: { postId: item.id, appId: workspace!.id } })}
                >
                  <View style={[s.feedAv, isAppr ? s.feedAvGreen : s.feedAvBlue]}>
                    <Text style={[s.feedAvTxt, { color: isAppr ? colors.success : colors.primary }]}>
                      {initials(name)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.feedRow}>
                      <Text style={s.feedName}>{name}</Text>
                      <View style={[s.typePill, isAppr ? s.typePillGreen : s.typePillBlue]}>
                        <Text style={[s.typePillTxt, { color: isAppr ? colors.success : colors.primary }]}>
                          {isAppr ? '❤ Appreciation' : '📝 Post'}
                        </Text>
                      </View>
                    </View>
                    <Text style={s.feedTime}>{timeAgo(item.created_at)}</Text>
                    <Text style={s.feedText} numberOfLines={2}>{text}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(c: AppColors) {
  const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    topBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.surface, paddingHorizontal: 18, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    logoImg: { width: 100, height: 36 },
    topRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    iconBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: c.primaryLight, alignItems: 'center', justifyContent: 'center' },
    notifDot: { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: c.danger, borderWidth: 1.5, borderColor: c.surface },
    avatar: { width: 36, height: 36, borderRadius: 10, backgroundColor: c.primaryLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: c.primary + '55' },
    avatarTxt: { fontSize: 13, fontWeight: '900', color: c.primary },

    scroll: { paddingBottom: 32 },

    dateStrip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 20, paddingVertical: 10,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    greenDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#10b981' },
    dateLabel: { fontSize: 11, fontWeight: '700', color: c.textSecondary, letterSpacing: 0.5 },
    dateSep: { fontSize: 11, color: c.gray300 },
    wsLabel: { fontSize: 11, fontWeight: '700', color: c.primary, letterSpacing: 0.5 },

    greetSection: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 4 },
    greetLine: { fontSize: 32, fontFamily: SERIF, color: c.textPrimary, lineHeight: 40 },
    greetName: { fontSize: 32, fontFamily: SERIF, color: c.primary, lineHeight: 40 },
    greetTagline: { fontSize: 14, color: c.textSecondary, fontStyle: 'italic', marginTop: 6 },

    loggedCard: {
      marginHorizontal: 16, marginTop: 16,
      backgroundColor: c.surface, borderRadius: 14,
      borderWidth: 1, borderColor: c.border, padding: 18,
    },
    loggedLabel: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginBottom: 6 },
    loggedHours: { fontSize: 36, fontWeight: '800', color: c.secondary, letterSpacing: -1, lineHeight: 42 },
    loggedSub: { fontSize: 12, color: c.textSecondary, marginTop: 4, marginBottom: 14 },
    loggedBtns: { flexDirection: 'row', gap: 10 },
    logBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: c.primaryLight, paddingVertical: 9, borderRadius: 10,
    },
    logBtnTeal: { backgroundColor: c.infoLight },
    logBtnTxt: { fontSize: 13, fontWeight: '700', color: c.primary },

    statsGrid: {
      flexDirection: 'row', flexWrap: 'wrap',
      marginHorizontal: 16, marginTop: 12,
      backgroundColor: c.surface, borderRadius: 14,
      borderWidth: 1, borderColor: c.border, overflow: 'hidden',
    },
    statCell: { width: '50%', padding: 14 },
    statCellBR: { borderRightWidth: 1, borderRightColor: c.border, borderBottomWidth: 1, borderBottomColor: c.border },
    statCellB: { borderBottomWidth: 1, borderBottomColor: c.border },
    statCellR: { borderRightWidth: 1, borderRightColor: c.border },
    statPeriod: { fontSize: 9, fontWeight: '700', color: c.textMuted, letterSpacing: 0.8, marginBottom: 4 },
    statNum: { fontSize: 20, fontWeight: '800', color: c.textPrimary, letterSpacing: -0.5 },
    statSub: { fontSize: 10, color: c.textSecondary, marginTop: 2 },

    switchRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginTop: 10, padding: 12,
      backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border,
    },
    switchTxt: { fontSize: 12, color: c.primary, fontWeight: '600' },
    switchName: { flex: 1, fontSize: 11, color: c.textMuted, textAlign: 'right' },

    feedSec: { marginHorizontal: 16, marginTop: 20, marginBottom: 8 },
    feedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    feedTitle: { fontSize: 11, fontWeight: '700', color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
    feedSeeAll: { fontSize: 12, fontWeight: '700', color: c.primary },
    feedEmpty: { alignItems: 'center', gap: 8, paddingVertical: 20 },
    feedEmptyTxt: { fontSize: 13, color: c.textMuted },
    feedItem: { flexDirection: 'row', gap: 10, marginBottom: 10, backgroundColor: c.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: c.border },
    feedAv: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    feedAvBlue: { backgroundColor: c.primaryLight },
    feedAvGreen: { backgroundColor: c.successLight },
    feedAvTxt: { fontSize: 12, fontWeight: '900' },
    feedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' },
    feedName: { fontSize: 12, fontWeight: '700', color: c.textPrimary },
    feedTime: { fontSize: 10, color: c.textMuted, marginBottom: 3 },
    feedText: { fontSize: 12, color: c.textSecondary, lineHeight: 17 },
    typePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
    typePillBlue: { backgroundColor: c.primaryLight },
    typePillGreen: { backgroundColor: c.successLight },
    typePillTxt: { fontSize: 10, fontWeight: '700' },
  });
}
