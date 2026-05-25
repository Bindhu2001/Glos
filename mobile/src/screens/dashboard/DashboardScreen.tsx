import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, Platform, Image,
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

interface FeedItem {
  id: number;
  author_name?: string;
  first_name?: string;
  last_name?: string;
  post_type?: string;
  type?: string;
  content?: string;
  body?: string;
  created_at?: string;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
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
      const [dash, notif, me, feedRes] = await Promise.all([
        api.dashboard.getMyDashboard(workspace.id),
        api.notifications.unreadCount(),
        api.me.getProfile(),
        api.feed.list(workspace.id),
      ]);
      setData(dash.data);
      setUnread(notif.data.count ?? 0);
      const first = me.data?.firstName ?? me.data?.first_name ?? '';
      const last = me.data?.lastName ?? me.data?.last_name ?? '';
      setUserName(`${first} ${last}`.trim() || first);
      const items = feedRes.data?.items ?? feedRes.data ?? [];
      setFeed(Array.isArray(items) ? items.slice(0, 3) : []);
    } catch {}
  }, [workspace, api]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

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
  const open = tasks?.open ?? 0;
  const timeMin = data?.hours?.this_month?.minutes ?? 0;
  const displayName = userName || 'there';
  const greetFirst = displayName.split(' ')[0];

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={s.topBar}>
        <Image
          source={require('../../../assets/logo.png')}
          style={s.logoImg}
          resizeMode="contain"
        />
        <View style={s.topRight}>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => navigation.navigate('Notifications')}
          >
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
        {/* Greeting band */}
        <View style={s.greetBand}>
          <View>
            <Text style={s.greetSub}>{getGreeting()}</Text>
            <Text style={s.greetName}>{greetFirst}</Text>
          </View>
          {workspace && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.wsName}>{workspace.name}</Text>
              <Text style={s.wsType}>{workspace.type ? `${workspace.type.toUpperCase()} Workspace` : 'Workspace'}</Text>
            </View>
          )}
        </View>

        {/* Hero card */}
        <LinearGradient
          colors={['#4f46e5', '#7c3aed']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.hero}
        >
          <View style={s.heroAccent} />
          <View style={s.heroAccent2} />
          <Text style={s.heroLabel}>MY TASKS THIS MONTH</Text>
          <Text style={s.heroNum}>{total}</Text>
          <Text style={s.heroDesc}>{inProgress} in progress · {done} completed</Text>
          <View style={s.heroTags}>
            <View style={s.heroTag}>
              <Ionicons name="clipboard-outline" size={9} color="rgba(255,255,255,0.8)" />
              <Text style={s.heroTagTxt}> {open || total} Open</Text>
            </View>
            <View style={s.heroTag}>
              <Ionicons name="reload-outline" size={9} color="rgba(255,255,255,0.8)" />
              <Text style={s.heroTagTxt}> {inProgress} Active</Text>
            </View>
            <View style={s.heroTag}>
              <Ionicons name="trophy-outline" size={9} color="rgba(255,255,255,0.8)" />
              <Text style={s.heroTagTxt}> {done} Done</Text>
            </View>
          </View>
          <Ionicons name="bar-chart-outline" size={48} color="rgba(255,255,255,0.15)" style={s.heroIcon} />
        </LinearGradient>

        {/* 3-cell stats row */}
        <View style={s.cellRow}>
          <View style={s.cell}>
            <Text style={[s.cellNum, { color: colors.primary }]}>{total}</Text>
            <Text style={s.cellLbl}>Tasks</Text>
            <View style={[s.cellBar, { backgroundColor: colors.primary }]} />
          </View>
          <View style={[s.cell, s.cellMid]}>
            <Text style={[s.cellNum, { color: colors.success }]}>{done}</Text>
            <Text style={s.cellLbl}>Done</Text>
            <View style={[s.cellBar, { backgroundColor: colors.success }]} />
          </View>
          <View style={s.cell}>
            <Text style={[s.cellNum, { color: colors.warning }]}>{inProgress}</Text>
            <Text style={s.cellLbl}>Active</Text>
            <View style={[s.cellBar, { backgroundColor: colors.warning }]} />
          </View>
        </View>

        {/* Time + Switch row */}
        <View style={s.smallRow}>
          <View style={s.sCard}>
            <View style={s.sIcon}>
              <Ionicons name="time-outline" size={18} color={colors.primary} />
            </View>
            <View>
              <Text style={s.sLbl}>Time</Text>
              <Text style={s.sVal}>{formatDuration(timeMin)}</Text>
            </View>
          </View>
          <TouchableOpacity style={s.sCard} onPress={() => setWorkspace(null)}>
            <View style={s.sIcon}>
              <Ionicons name="swap-horizontal-outline" size={18} color={colors.primary} />
            </View>
            <View>
              <Text style={s.sLbl}>Workspace</Text>
              <View style={s.switchChip}>
                <Text style={s.switchChipTxt}>Switch</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Team Feed */}
        <View style={s.feedSec}>
          <View style={s.feedHeader}>
            <Text style={s.feedTitle}>TEAM FEED</Text>
            <TouchableOpacity onPress={() => navigation.navigate('FeedTab')}>
              <Text style={s.feedSeeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          {feed.length === 0 ? (
            <Text style={s.feedEmpty}>No recent posts</Text>
          ) : (
            feed.map(item => {
              const name = item.author_name ?? [item.first_name, item.last_name].filter(Boolean).join(' ') ?? 'User';
              const type = item.post_type ?? item.type ?? 'post';
              const text = item.content ?? item.body ?? '';
              const isAppr = type === 'appreciation';
              return (
                <View key={item.id} style={s.feedItem}>
                  <View style={[s.feedAv, isAppr ? s.feedAvGreen : s.feedAvIndigo]}>
                    <Text style={[s.feedAvTxt, { color: isAppr ? colors.success : colors.primary }]}>
                      {initials(name)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.feedRow}>
                      <Text style={s.feedName}>{name}</Text>
                      <View style={[s.typePill, isAppr ? s.typePillGreen : s.typePillIndigo]}>
                        <Text style={[s.typePillTxt, { color: isAppr ? colors.success : colors.primary }]}>
                          {isAppr ? 'Appreciation' : 'Post'}
                        </Text>
                      </View>
                      <Text style={s.feedTime}>{timeAgo(item.created_at)}</Text>
                    </View>
                    <Text style={s.feedText} numberOfLines={2}>{text}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },

    // Top bar
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

    // Greeting band
    greetBand: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.surface, marginHorizontal: 16, marginTop: 14,
      borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border,
    },
    greetSub: { fontSize: 11, color: c.textSecondary, marginBottom: 2 },
    greetName: { fontSize: 17, fontWeight: '900', color: c.textPrimary, letterSpacing: -0.3 },
    wsName: { fontSize: 12, fontWeight: '700', color: c.primary },
    wsType: { fontSize: 10, color: c.textMuted },

    // Hero
    hero: {
      marginHorizontal: 16, marginTop: 12, borderRadius: 18,
      padding: 20, overflow: 'hidden',
      ...Platform.select({ ios: { shadowColor: '#4f46e5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12 }, android: { elevation: 6 } }),
    },
    heroAccent: { position: 'absolute', right: -18, top: -18, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.07)' },
    heroAccent2: { position: 'absolute', right: 18, bottom: -18, width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)' },
    heroLabel: { fontSize: 9, fontWeight: '900', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 },
    heroNum: { fontSize: 44, fontWeight: '900', color: '#ffffff', letterSpacing: -2, lineHeight: 50 },
    heroDesc: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
    heroTags: { flexDirection: 'row', gap: 8, marginTop: 14 },
    heroTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
    heroTagTxt: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
    heroIcon: { position: 'absolute', right: 18, bottom: 16 },

    // Cell row
    cellRow: {
      flexDirection: 'row', marginHorizontal: 16, marginTop: 12,
      backgroundColor: c.surface, borderRadius: 14,
      borderWidth: 1, borderColor: c.border, overflow: 'hidden',
    },
    cell: { flex: 1, padding: 14, alignItems: 'center' },
    cellMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: c.border },
    cellNum: { fontSize: 26, fontWeight: '900', letterSpacing: -1 },
    cellLbl: { fontSize: 9, fontWeight: '700', color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 },
    cellBar: { height: 3, width: 28, borderRadius: 2, marginTop: 8 },

    // Small row
    smallRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 12, gap: 12 },
    sCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border },
    sIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: c.primaryLight, alignItems: 'center', justifyContent: 'center' },
    sLbl: { fontSize: 10, color: c.textSecondary, fontWeight: '600' },
    sVal: { fontSize: 14, fontWeight: '800', color: c.textPrimary },
    switchChip: { marginTop: 2, backgroundColor: c.primaryLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
    switchChipTxt: { fontSize: 10, fontWeight: '700', color: c.primary },

    // Feed
    feedSec: { marginHorizontal: 16, marginTop: 16 },
    feedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    feedTitle: { fontSize: 11, fontWeight: '700', color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
    feedSeeAll: { fontSize: 12, fontWeight: '700', color: c.primary },
    feedEmpty: { fontSize: 13, color: c.textMuted, textAlign: 'center', paddingVertical: 16 },
    feedItem: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    feedAv: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    feedAvIndigo: { backgroundColor: c.primaryLight },
    feedAvGreen: { backgroundColor: c.successLight },
    feedAvTxt: { fontSize: 11, fontWeight: '900' },
    feedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
    feedName: { fontSize: 12, fontWeight: '700', color: c.textPrimary },
    feedTime: { fontSize: 9, color: c.textMuted, marginLeft: 'auto' },
    feedText: { fontSize: 11, color: c.textSecondary, lineHeight: 16 },
    typePill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 },
    typePillIndigo: { backgroundColor: c.primaryLight },
    typePillGreen: { backgroundColor: c.successLight },
    typePillTxt: { fontSize: 9, fontWeight: '700' },
  });
}
