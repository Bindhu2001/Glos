import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAudioPlayer } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../hooks/useApi';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useHasTeam } from '../../contexts/HasTeamContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import { formatDuration } from '../../utils/format';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import LoadError from '../../components/common/LoadError';
import Logo from '../../components/common/Logo';
import Avatar from '../../components/common/Avatar';
import { useLoadWithTimeout } from '../../hooks/useLoadWithTimeout';
import { stripNonContentElements, stripTags } from '../../utils/postContent';
import BusinessReviewCalendarWidget from './widgets/BusinessReviewCalendarWidget';
import HoursTrendWidget from './widgets/HoursTrendWidget';
import LeaderboardWidget, { LeaderboardEntry } from './widgets/LeaderboardWidget';
import TaskCompletionWidget from './widgets/TaskCompletionWidget';
import TeamRoutineAnalysisWidget from './widgets/TeamRoutineAnalysisWidget';
import AppreciationsFeedbackWidget from './widgets/AppreciationsFeedbackWidget';
import TeamActivityTableWidget from './widgets/TeamActivityTableWidget';
import BusinessReviewsTableWidget from './widgets/BusinessReviewsTableWidget';

const PROJECT_STATUS_COLORS: Record<string, string> = {
  active: '#38bdf8', completed: '#4ade80', overdue: '#f87171', near_end: '#fbbf24', inactive: '#94a3b8', deleted: '#f87171',
};

interface TrendPoint { minutes: number; day?: string; week?: string; month?: string }

interface PendingReview { id: number; status: string; cycle_name?: string; periodicity?: string; year?: number }

interface UpcomingEvent { type: 'birthday' | 'work_anniversary'; name: string; user_id: number; date: string; days_until: number; years?: number }

interface RoutineStat {
  routine: { id: number; description: string; periodicity: string };
  role_name?: string;
  combined_pct: number | null;
  status: 'not_applicable' | 'not_started' | 'pending' | 'incomplete' | 'completed';
  tasks_completed: number;
  tasks_total: number;
}

interface TeamRoutineReportee {
  user: { id: number; first_name?: string; last_name?: string; email?: string };
  overall_efficiency: number | null;
  routine_stats: RoutineStat[];
  is_manager?: boolean;
}

interface DashData {
  user?: { id?: number };
  primary_role_name?: string | null;
  roles?: Array<{ id?: number; title?: string; level?: number }>;
  has_reportees?: boolean;
  tasks?: {
    total?: number; done?: number; in_progress?: number; open?: number; blocked?: number; overdue?: number; completion_rate?: number;
    completed_today?: number; due_today?: number; today_planned_minutes?: number; today_on_time_pct?: number;
  };
  hours?: { today?: { minutes?: number }; this_week?: { minutes?: number }; this_month?: { minutes?: number } };
  daily_trend?: TrendPoint[];
  weekly_trend?: TrendPoint[];
  monthly_trend?: TrendPoint[];
  my_pending_reviews?: PendingReview[];
  latest_review?: any;
}

interface TeamMember {
  user_id?: number;
  user?: { id?: number; first_name?: string; last_name?: string };
  first_name?: string;
  last_name?: string;
  email?: string;
  tasks_total?: number;
  tasks?: { total?: number; not_started_est_hrs?: number; in_progress_est_hrs?: number };
  tasks_done?: number;
  hours_this_week?: number;
  hours?: number;
  overdue?: number;
  glos_score?: { total?: number };
  engagement_trend?: Array<{ score?: number }>;
}

interface TeamDashData {
  members?: TeamMember[];
  sub_managers?: Array<{ user_id: number; name: string }>;
  min_hours_per_week?: number;
  min_hours_per_day?: number;
  team_totals?: {
    member_count?: number;
    hours_this_week?: number;
    avg_hours_this_week?: number;
    total_overdue?: number;
    team_tasks?: { completed?: number; in_progress?: number; on_hold?: number; delayed?: number; total?: number };
    team_productivity?: number;
    ontime_completion?: number;
    team_mood?: number;
    manager_name?: string;
    org_name?: string;
  };
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

type DashView = 'my' | 'Team';

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

// Matches web's TeamDashboard.jsx MoodGauge exactly — same >=8/>=6 thresholds
// for emoji, color, and label, so the same score reads the same way on both.
function getMoodLabel(score: number): string {
  if (score >= 8) return 'Great Team Vibes!';
  if (score >= 6) return 'Good Energy';
  return 'Needs Attention';
}

function getMoodEmoji(score: number): string {
  if (score >= 8) return '😄';
  if (score >= 6) return '🙂';
  return '😟';
}

function getMoodColor(score: number, colors: AppColors): string {
  if (score >= 8) return colors.success;
  if (score >= 6) return colors.warning;
  return colors.danger;
}

function getMemberName(m: TeamMember): string {
  const first = m.user?.first_name ?? m.first_name ?? '';
  const last = m.user?.last_name ?? m.last_name ?? '';
  return [first, last].filter(Boolean).join(' ') || m.email || 'Member';
}

function getMemberTasks(m: TeamMember): number {
  return m.tasks?.total ?? m.tasks_total ?? 0;
}

function getMemberScore(m: TeamMember): number {
  return m.glos_score?.total ?? 0;
}

function getMemberWorkloadHrs(m: TeamMember): number {
  return Number(m.tasks?.not_started_est_hrs ?? 0) + Number(m.tasks?.in_progress_est_hrs ?? 0);
}

const PODIUM_ICONS = ['🥇', '🥈', '🥉'];

export default function DashboardScreen() {
  const api = useApi();
  const { workspace, setWorkspace } = useWorkspace();
  const { isAdmin, canSeeTeamContent } = useHasTeam();
  const { colors, isDark, toggleTheme } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  // Cross-tab navigation into a nested MoreStack screen: without seeding
  // MoreHome first, the target screen becomes MoreStack's sole/initial
  // route, so its back button has nothing local to pop and falls through to
  // the tab navigator instead — bouncing the user back to Home rather than
  // to the More tab's own root, like every other stack behaves.
  const goToMore = useCallback((screen: string, params?: Record<string, unknown>) => {
    // Two synchronous navigate() calls race against React Navigation's own state
    // batching — the second dispatch can read stale state and end up acting as if
    // only the target screen was navigated to, i.e. it becomes the stack's sole
    // route again. `initial: false` is the documented single-dispatch fix: it
    // seeds the nested stack with its default initial route (MoreHome) and pushes
    // the target on top atomically, so back always lands on MoreHome.
    navigation.navigate('MoreTab', { screen, params, initial: false } as never);
  }, [navigation]);

  const [data, setData] = useState<DashData | null>(null);
  const [teamData, setTeamData] = useState<TeamDashData | null>(null);
  const [pendingBusinessReviews, setPendingBusinessReviews] = useState(0);
  const [userName, setUserName] = useState('');
  const [myPhotoUrl, setMyPhotoUrl] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);
  // Web's NotificationBell.jsx polls every 30s and dings on an increase —
  // mobile had no equivalent at all: unread count only ever refreshed on
  // load/refocus, and silently, with no sound. Reuses the same nudge sound
  // asset as chat (see useChatUnread.ts) rather than adding a second one.
  const notifPlayer = useAudioPlayer(require('../../../assets/sounds/nudge.wav'));
  const notifPlayerRef = useRef(notifPlayer);
  notifPlayerRef.current = notifPlayer;
  const prevUnreadRef = useRef<number | null>(null);
  const applyUnread = useCallback((count: number) => {
    if (prevUnreadRef.current !== null && count > prevUnreadRef.current) {
      try { notifPlayerRef.current.seekTo(0); notifPlayerRef.current.play(); } catch {}
    }
    prevUnreadRef.current = count;
    setUnread(count);
  }, []);
  const [dashView, setDashView] = useState<DashView>('my');
  const [mgrScope, setMgrScope] = useState<'direct' | 'all' | 'admin'>('direct');
  const [viewAs, setViewAs] = useState<number | null>(null);
  const { loading, loadError, run } = useLoadWithTimeout();

  // My Dashboard extra widgets
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [wished, setWished] = useState<Set<number>>(new Set());
  const [myProjects, setMyProjects] = useState<any[]>([]);
  const [myRoutines, setMyRoutines] = useState<RoutineStat[]>([]);
  const [myRoutinesEfficiency, setMyRoutinesEfficiency] = useState<number | null>(null);

  // Team Dashboard extra widgets
  const [teamRoutines, setTeamRoutines] = useState<TeamRoutineReportee[]>([]);
  const [apprMembers, setApprMembers] = useState<any[]>([]);
  const [apprTotals, setApprTotals] = useState<{ total_appr: number; total_fb: number }>({ total_appr: 0, total_fb: 0 });

  const currentMonth = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const loadMyExtras = useCallback(async (appId: number) => {
    const [lb, ev, proj, rout] = await Promise.all([
      api.dashboard.getLeaderboard(appId).catch(() => ({ data: {} })),
      api.dashboard.getUpcomingEvents(appId).catch(() => ({ data: {} })),
      api.projects.list(appId, { mine: true }).catch(() => ({ data: [] })),
      api.routines.getDashboard(appId, { mode: 'month', month: currentMonth }).catch(() => ({ data: {} })),
    ]);
    const lbMembers = lb.data?.members ?? [];
    setLeaderboard(lbMembers.map((m: any) => ({
      id: m.user?.id, name: [m.user?.first_name, m.user?.last_name].filter(Boolean).join(' ') || m.user?.email || 'Member',
      score: m.glos_score?.total ?? 0, categories: m.glos_score?.categories ?? [],
    })));
    setEvents((ev.data?.events ?? []).filter((e: UpcomingEvent) => !(e.type === 'work_anniversary' && e.years === 0)));
    const projItems = proj.data?.items ?? proj.data ?? [];
    setMyProjects(Array.isArray(projItems) ? projItems : []);
    setMyRoutines(rout.data?.routine_stats ?? []);
    setMyRoutinesEfficiency(rout.data?.overall_efficiency ?? null);
  }, [api, currentMonth]);

  // Admins default to the "admin" scope (equivalent to the old full-org
  // getTeamDashboard view) but can still switch to Direct Reportees/Entire
  // Team if they also manage people directly — matches web's scope dropdown,
  // which shows all three options to admins and only the first two to plain
  // managers (see Sidebar.jsx / TeamDashboard.jsx showAdminScope logic).
  useEffect(() => {
    if (isAdmin) setMgrScope('admin');
  }, [isAdmin]);

  const loadTeamData = useCallback(async () => {
    if (!workspace || !canSeeTeamContent) return;
    const apiScope = mgrScope === 'all' ? 'team' : mgrScope;
    const scopeViewAs = mgrScope === 'all' && viewAs != null ? viewAs : undefined;
    // routRes/apprRes only depend on mgrScope/viewAs/currentMonth, not on
    // teamRes — no reason to wait for getManagerDashboard before firing them.
    const [teamRes, routRes, apprRes, bizRevRes] = await Promise.all([
      api.dashboard.getManagerDashboard(workspace.id, mgrScope, undefined, viewAs ?? undefined),
      api.routines.getTeamDashboard(workspace.id, { mode: 'month', month: currentMonth, scope: mgrScope, view_as: scopeViewAs }).catch(() => ({ data: {} })),
      api.appreciations.getTeamStats(workspace.id, { scope: apiScope, month: currentMonth, view_as: scopeViewAs }).catch(() => ({ data: {} })),
      // Matches web's TeamDashboard.jsx "Business Reviews Pending" hero tile —
      // open daily/weekly/monthly check-ins this manager still needs to complete.
      api.businessReviews.dashboard(workspace.id, {}).catch(() => ({ data: {} })),
    ]);
    setTeamData(teamRes.data);
    setTeamRoutines(routRes.data?.reportees ?? []);
    setApprMembers(apprRes.data?.members ?? []);
    setApprTotals({ total_appr: apprRes.data?.total_appr ?? 0, total_fb: apprRes.data?.total_fb ?? 0 });
    setPendingBusinessReviews((bizRevRes.data?.pending ?? []).length);
  }, [workspace, api, isAdmin, canSeeTeamContent, mgrScope, viewAs, currentMonth]);

  const load = useCallback(async () => {
    if (!workspace) return;
    // Team/manager content is available to admins and to members who have
    // reportees in the org chart — matches QA web's Sidebar.jsx `hasTeam` gate.
    const [appRes, dash, notif, me, feedRes, , , membersRes] = await Promise.all([
      api.workspace.getApp(workspace.id),
      api.dashboard.getMyDashboard(workspace.id),
      api.notifications.unreadCount(workspace.id),
      api.me.getProfile(),
      api.feed.list(workspace.id),
      loadMyExtras(workspace.id),
      loadTeamData(),
      api.workspace.getMembers(workspace.id).catch(() => ({ data: {} })),
    ]);
    const appData = appRes.data?.app ?? appRes.data;
    if (appData && appData.is_active === false) { setWorkspace(null); return; }
    setData(dash.data);
    applyUnread(notif.data.count ?? 0);
    const first = me.data?.firstName ?? me.data?.first_name ?? '';
    const last = me.data?.lastName ?? me.data?.last_name ?? '';
    setUserName(`${first} ${last}`.trim() || first);
    const myId = me.data?.id;
    const memberRows: any[] = membersRes.data?.members ?? membersRes.data?.items ?? membersRes.data ?? [];
    const myMember = memberRows.find((m: any) => String(m.user_id ?? m.id) === String(myId));
    setMyPhotoUrl(myMember?.photo_url ?? null);
    const items = feedRes.data?.items ?? feedRes.data ?? [];
    setFeed(Array.isArray(items) ? items.slice(0, 3) : []);
  }, [workspace, api, setWorkspace, loadMyExtras, loadTeamData, applyUnread]);

  useEffect(() => { run(load); }, [load]);

  useEffect(() => { if (dashView === 'Team') loadTeamData(); }, [mgrScope, viewAs]);

  // Matches web's 30s poll (NotificationBell.jsx) — mobile previously only
  // ever refreshed the unread count on load/refocus, so a notification that
  // arrived while the app just sat open on the Dashboard was never noticed
  // until the user left and came back.
  useEffect(() => {
    if (!workspace) return;
    const appId = workspace.id;
    const id = setInterval(() => {
      api.notifications.unreadCount(appId).then((r) => applyUnread(r.data.count ?? 0)).catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  }, [workspace, api, applyUnread]);

  const onWish = useCallback(async (userId: number, type: 'birthday' | 'work_anniversary') => {
    if (!workspace) return;
    try {
      await api.dashboard.sendWish(workspace.id, userId, type);
      setWished((prev) => new Set(prev).add(userId));
    } catch {
      // ignore — non-critical action
    }
  }, [workspace, api]);

  useFocusEffect(useCallback(() => {
    if (!workspace) return;
    api.notifications.unreadCount(workspace.id)
      .then((r) => applyUnread(r.data.count ?? 0))
      .catch(() => {});
  }, [workspace, api, applyUnread]));

  const onRefresh = async () => {
    setRefreshing(true);
    await run(load, true);
    setRefreshing(false);
  };

  if (loading) return <LoadingSpinner />;
  if (loadError) return <LoadError onRetry={() => run(load)} />;

  const tasks = data?.tasks;
  const todayMins = data?.hours?.today?.minutes ?? 0;
  const displayName = userName || 'there';
  const now = new Date();
  const dateLabel = `${DAY_NAMES[now.getDay()]} · ${now.getDate()} ${MONTH_SHORT[now.getMonth()]}`;

  const tt = teamData?.team_totals;
  const members = teamData?.members ?? [];
  const minHoursPerWeek = teamData?.min_hours_per_week ?? 40;

  const teamLeaderboard: LeaderboardEntry[] = members.map((m) => ({
    id: m.user_id ?? m.user?.id ?? 0,
    name: getMemberName(m),
    score: getMemberScore(m),
  }));

  const workloadSorted = [...members]
    .sort((a, b) => getMemberWorkloadHrs(b) - getMemberWorkloadHrs(a));
  const workloadMax = Math.max(...workloadSorted.map(getMemberWorkloadHrs), minHoursPerWeek);

  const taskTotal = tt?.team_tasks?.total ?? 0;
  const taskCompleted = tt?.team_tasks?.completed ?? 0;
  const completionPct = taskTotal > 0 ? Math.round((taskCompleted / taskTotal) * 100) : 0;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={s.topBar}>
        <Logo size={54} width={170} />
        <View style={s.topRight}>
          {/* Sun/moon matches the icon ProfileScreen's Dark Mode row already
              uses — a quick-access twin of that same toggle, not a new one. */}
          <TouchableOpacity style={s.iconBtn} onPress={toggleTheme}>
            <Ionicons name={isDark ? 'moon' : 'sunny-outline'} size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={() => navigation.navigate('Notifications')}>
            <Ionicons name="notifications-outline" size={20} color={colors.primary} />
            {unread > 0 && <View style={s.notifDot} />}
          </TouchableOpacity>
          <TouchableOpacity style={s.avatarWrap} onPress={() => navigation.navigate('ProfileTab')}>
            <Avatar name={displayName} photoUrl={myPhotoUrl} size={36} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Dashboard view toggle — admins only */}
      {canSeeTeamContent && (
        <View style={s.viewToggleRow}>
          <TouchableOpacity
            style={[s.viewToggleBtn, dashView === 'my' && s.viewToggleBtnActive]}
            onPress={() => setDashView('my')}
          >
            <Ionicons name={dashView === 'my' ? 'person' : 'person-outline'} size={13} color={dashView === 'my' ? '#fff' : colors.textSecondary} />
            <Text style={[s.viewToggleTxt, dashView === 'my' && s.viewToggleTxtActive]}>My Dashboard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.viewToggleBtn, dashView === 'Team' && s.viewToggleBtnActive]}
            onPress={() => setDashView('Team')}
          >
            <Ionicons name={dashView === 'Team' ? 'people' : 'people-outline'} size={13} color={dashView === 'Team' ? '#fff' : colors.textSecondary} />
            <Text style={[s.viewToggleTxt, dashView === 'Team' && s.viewToggleTxtActive]}>Team Dashboard</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── MY DASHBOARD ── */}
        {dashView === 'my' && (
          <>
            {/* Date strip */}
            <View style={s.dateStrip}>
              <View style={s.greenDot} />
              <Text style={s.dateLabel}>{dateLabel}</Text>
              <Text style={s.dateSep}>·</Text>
              <Text style={s.wsLabel}>{workspace?.name?.toUpperCase() ?? 'WORKSPACE'}</Text>
            </View>

            {/* Greeting */}
            <View style={s.greetSection}>
              <View style={s.greetRow}>
                <TouchableOpacity onPress={() => navigation.navigate('ProfileTab')}>
                  <Avatar name={displayName} photoUrl={myPhotoUrl} size={56} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={s.greetLine}>{getGreeting()}</Text>
                  <Text style={s.greetName} numberOfLines={1}>{displayName}</Text>
                  {(data?.primary_role_name ?? data?.roles?.[0]?.title) ? (
                    <Text style={s.greetRole}>{data?.primary_role_name ?? data?.roles?.[0]?.title}</Text>
                  ) : (
                    <Text style={s.greetTagline}>— ready when you are.</Text>
                  )}
                </View>
              </View>
            </View>

            {/* Today's Summary */}
            <View style={s.sectionCard}>
              <Text style={s.sectionHead}>TODAY'S SUMMARY</Text>
              <View style={s.todayGrid}>
                <View style={s.todayTile}>
                  <View style={s.todayTopRow}>
                    <View style={[s.todayIconBox, { backgroundColor: colors.success + '1A' }]}>
                      <Ionicons name="checkmark-done" size={16} color={colors.success} />
                    </View>
                    <Text style={s.todayVal}>{tasks?.completed_today ?? 0}</Text>
                  </View>
                  <Text style={s.todayLbl}>Tasks Done</Text>
                </View>
                <View style={s.todayTile}>
                  <View style={s.todayTopRow}>
                    <View style={[s.todayIconBox, { backgroundColor: colors.primary + '1A' }]}>
                      <Ionicons name="time-outline" size={16} color={colors.primary} />
                    </View>
                    <Text style={s.todayVal}>{formatDuration(todayMins)}</Text>
                  </View>
                  <Text style={s.todayLbl}>
                    Hours Logged{tasks?.today_planned_minutes ? ` / ${formatDuration(tasks.today_planned_minutes)}` : ''}
                  </Text>
                </View>
                <View style={s.todayTile}>
                  <View style={s.todayTopRow}>
                    <View style={[s.todayIconBox, { backgroundColor: colors.secondary + '1A' }]}>
                      <Ionicons name="calendar-outline" size={16} color={colors.secondary} />
                    </View>
                    <Text style={s.todayVal}>{tasks?.due_today ?? 0}</Text>
                  </View>
                  <Text style={s.todayLbl}>Due Today</Text>
                </View>
                <View style={s.todayTile}>
                  {(() => {
                    const otr = tasks?.today_on_time_pct ?? null;
                    const color = otr == null ? colors.textMuted : otr >= 80 ? colors.success : otr >= 50 ? colors.warning : colors.danger;
                    return (
                      <View style={s.todayTopRow}>
                        <View style={[s.todayIconBox, { backgroundColor: color + '1A' }]}>
                          <Ionicons name="trending-up-outline" size={16} color={color} />
                        </View>
                        <Text style={[s.todayVal, { color }]}>{otr != null ? `${otr}%` : '—'}</Text>
                      </View>
                    );
                  })()}
                  <Text style={s.todayLbl}>On-Time Rate</Text>
                </View>
              </View>
            </View>

            {/* Hours Logged Trend */}
            <HoursTrendWidget
              daily={data?.daily_trend ?? []}
              weekly={data?.weekly_trend ?? []}
              monthly={data?.monthly_trend ?? []}
              colors={colors}
            />

            {/* GLOS Leaderboard */}
            <LeaderboardWidget title="GLOS LEADERBOARD" entries={leaderboard} meId={data?.user?.id} colors={colors} />

            {/* Business Review Calendar */}
            {workspace && (
              <BusinessReviewCalendarWidget appId={workspace.id} mode="my" hasReportees={data?.has_reportees} colors={colors} />
            )}

            {/* Upcoming Events */}
            {events.length > 0 && (
              <View style={s.sectionCard}>
                <Text style={s.sectionHead}>UPCOMING EVENTS (NEXT 15 DAYS)</Text>
                {events.map((e) => (
                  <View key={`${e.type}-${e.user_id}-${e.date}`} style={s.eventRow}>
                    <View style={s.eventIconBox}>
                      <Ionicons name={e.type === 'birthday' ? 'gift-outline' : 'trophy-outline'} size={16} color={colors.secondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.eventName}>{e.name}</Text>
                      <Text style={s.eventSub}>
                        {e.type === 'birthday' ? 'Birthday' : `Work Anniversary${e.years ? ` · ${e.years}yr` : ''}`}
                        {' · '}{e.days_until === 0 ? 'Today' : `in ${e.days_until}d`}
                      </Text>
                    </View>
                    {e.days_until === 0 && (
                      <TouchableOpacity
                        style={[s.wishBtn, wished.has(e.user_id) && s.wishBtnDone]}
                        disabled={wished.has(e.user_id)}
                        onPress={() => onWish(e.user_id, e.type)}
                      >
                        <Text style={s.wishBtnTxt}>{wished.has(e.user_id) ? 'Wished' : 'Wish'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* My Performance Reviews */}
            {(data?.my_pending_reviews ?? []).length > 0 && (
              <View style={s.sectionCard}>
                <TouchableOpacity style={s.sectionHeadRow} onPress={() => navigation.navigate('PerformanceTab')}>
                  <Text style={s.sectionHead}>MY PERFORMANCE REVIEWS</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.gray400} />
                </TouchableOpacity>
                {(data!.my_pending_reviews!).slice(0, 2).map((r) => {
                  const stage = r.status === 'pending_self'
                    ? { label: 'Self Review Pending', color: colors.warning }
                    : r.status === 'pending_manager'
                    ? { label: 'Manager Review Pending', color: colors.primary }
                    : { label: 'Approval Pending', color: '#8b5cf6' };
                  return (
                    <View key={r.id} style={s.reviewRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.reviewCycle}>{r.cycle_name ?? 'Review'} {r.year ?? ''}</Text>
                        <Text style={[s.reviewStage, { color: stage.color }]}>{stage.label}</Text>
                      </View>
                      {r.status === 'pending_self' && (
                        <TouchableOpacity style={s.reviewBtn} onPress={() => navigation.navigate('PerformanceTab')}>
                          <Text style={s.reviewBtnTxt}>Complete Now</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* My Projects */}
            {myProjects.length > 0 && (
              <View style={s.sectionCard}>
                <Text style={s.sectionHead}>MY PROJECTS</Text>
                {myProjects.slice(0, 6).map((p) => {
                  const statusColor = PROJECT_STATUS_COLORS[p.computed_status] ?? '#6b7280';
                  const isOwner = p.owner_user_id === data?.user?.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={s.projRow}
                      onPress={() => goToMore('ProjectDetail', { projectId: p.id, appId: workspace!.id })}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={s.projNameRow}>
                          <Text style={s.projName} numberOfLines={1}>{p.name}</Text>
                          {isOwner && <View style={s.ownerPill}><Text style={s.ownerPillTxt}>Owner</Text></View>}
                        </View>
                        <Text style={s.projSub}>{p.total_tasks ?? 0} tasks · {p.completion_pct ?? 0}% done</Text>
                      </View>
                      <View style={[s.projStatusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor + '55' }]}>
                        <Text style={[s.projStatusTxt, { color: statusColor }]}>{(p.computed_status ?? 'active').replace('_', ' ')}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* My Routines */}
            {myRoutines.length > 0 && (
              <View style={s.sectionCard}>
                <Text style={s.sectionHead}>MY ROUTINES</Text>
                {(() => {
                  // Matches web's MyDashboard.jsx exactly: efficiency is the
                  // backend's overall_efficiency (average of each routine's
                  // combined_pct — task-completion-weighted), not a recount of
                  // how many routines happen to be status==='completed'. The
                  // two can disagree a lot — a routine can be in-progress with
                  // a partial combined_pct while its status is still
                  // 'incomplete'/'pending', which the old count-based formula
                  // here silently dropped to 0 instead of counting partially.
                  const eff = myRoutinesEfficiency;
                  const effColor = eff == null ? colors.textMuted : eff >= 80 ? colors.success : eff >= 50 ? colors.warning : colors.danger;
                  // 'on_track' is a distinct status from 'completed' on web (see
                  // MyDashboard.jsx's onTrack filter) — counting only
                  // 'completed' here undercounted On Track / overcounted nothing
                  // into Attention (on_track isn't in the attention list either way).
                  const onTrack = myRoutines.filter((r) => r.status === 'completed' || (r.status as string) === 'on_track').length;
                  const needsAttn = myRoutines.filter((r) => ['pending', 'incomplete', 'not_started'].includes(r.status)).length;
                  return (
                    <View style={s.routineKpiRow}>
                      <View style={s.routineKpiCell}><Text style={[s.routineKpiVal, { color: effColor }]}>{eff != null ? `${eff}%` : '—'}</Text><Text style={s.routineKpiLbl}>Efficiency</Text></View>
                      <View style={s.routineKpiCell}><Text style={s.routineKpiVal}>{onTrack}</Text><Text style={s.routineKpiLbl}>On Track</Text></View>
                      <View style={s.routineKpiCell}><Text style={[s.routineKpiVal, needsAttn > 0 && { color: colors.danger }]}>{needsAttn}</Text><Text style={s.routineKpiLbl}>Attention</Text></View>
                      <View style={s.routineKpiCell}><Text style={s.routineKpiVal}>{myRoutines.length}</Text><Text style={s.routineKpiLbl}>Total</Text></View>
                    </View>
                  );
                })()}
                {myRoutines.slice(0, 6).map((r) => {
                  const statusColor = r.status === 'completed' ? colors.success : r.status === 'pending' ? colors.warning : r.status === 'incomplete' ? colors.danger : colors.gray400;
                  return (
                    <View key={r.routine.id} style={s.routineRow}>
                      <Text style={s.routineDesc} numberOfLines={1}>{r.routine.description}</Text>
                      <View style={[s.routineBadge, { backgroundColor: statusColor + '22', borderColor: statusColor + '55' }]}>
                        <Text style={[s.routineBadgeTxt, { color: statusColor }]}>
                          {r.combined_pct != null ? `${r.combined_pct}%` : r.status.replace('_', ' ')}
                        </Text>
                      </View>
                    </View>
                  );
                })}
                <TouchableOpacity onPress={() => goToMore('Routines')}>
                  <Text style={s.viewAllLink}>View all →</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Task Completion */}
            <TaskCompletionWidget
              total={tasks?.total ?? 0}
              done={tasks?.done ?? 0}
              open={tasks?.open ?? 0}
              overdue={tasks?.overdue ?? 0}
              blocked={tasks?.blocked ?? 0}
              colors={colors}
            />

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
                  const text = stripTags(stripNonContentElements(item.content ?? item.body ?? ''));
                  const isAppr = type === 'appreciation';
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={s.feedItem}
                      activeOpacity={0.75}
                      onPress={() => navigation.navigate('FeedTab', { screen: 'PostDetail', params: { postId: item.id, appId: workspace!.id }, initial: false } as never)}
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
          </>
        )}

        {/* ── TEAM DASHBOARD (matches web TeamDashboard.jsx) ── */}
        {dashView === 'Team' && canSeeTeamContent && (
          <>
            {/* Date strip */}
            <View style={s.dateStrip}>
              <View style={[s.greenDot, { backgroundColor: colors.primary }]} />
              <Text style={s.dateLabel}>{dateLabel}</Text>
              <Text style={s.dateSep}>·</Text>
              <Text style={s.wsLabel}>TEAM DASHBOARD</Text>
            </View>

            {/* Header */}
            <View style={s.teamHeadRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.teamHeadTitle}>{tt?.org_name ?? workspace?.name ?? 'Team'}</Text>
                <Text style={s.teamHeadSub}>
                  {tt?.member_count ?? 0} members
                  {tt?.manager_name ? ` · ${tt.manager_name}` : ''}
                </Text>
              </View>
            </View>

            {/* Scope switch — matches web TeamDashboard.jsx's Direct Reportees / Entire Team / All Members select.
                Shown to admins too (they can also have their own hierarchy), not just plain managers;
                "All Members" is admin-only, matching web's canWrite/owner gate. */}
            <View style={s.scopeRow}>
              <TouchableOpacity
                style={[s.scopeBtn, mgrScope === 'direct' && s.scopeBtnActive]}
                onPress={() => { setMgrScope('direct'); setViewAs(null); }}
              >
                <Text style={[s.scopeBtnTxt, mgrScope === 'direct' && s.scopeBtnTxtActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Direct Reportees</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.scopeBtn, mgrScope === 'all' && s.scopeBtnActive]}
                onPress={() => { setMgrScope('all'); setViewAs(null); }}
              >
                <Text style={[s.scopeBtnTxt, mgrScope === 'all' && s.scopeBtnTxtActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Entire Team</Text>
              </TouchableOpacity>
              {isAdmin && (
                <TouchableOpacity
                  style={[s.scopeBtn, mgrScope === 'admin' && s.scopeBtnActive]}
                  onPress={() => { setMgrScope('admin'); setViewAs(null); }}
                >
                  <Text style={[s.scopeBtnTxt, mgrScope === 'admin' && s.scopeBtnTxtActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>All Members</Text>
                </TouchableOpacity>
              )}
            </View>
            {mgrScope === 'all' && (teamData?.sub_managers?.length ?? 0) > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.viewAsRow} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
                <TouchableOpacity style={[s.viewAsChip, viewAs === null && s.viewAsChipActive]} onPress={() => setViewAs(null)}>
                  <Text style={[s.viewAsChipTxt, viewAs === null && s.viewAsChipTxtActive]}>Everyone</Text>
                </TouchableOpacity>
                {teamData!.sub_managers!.map((sm) => (
                  <TouchableOpacity key={sm.user_id} style={[s.viewAsChip, viewAs === sm.user_id && s.viewAsChipActive]} onPress={() => setViewAs(sm.user_id)}>
                    <Text style={[s.viewAsChipTxt, viewAs === sm.user_id && s.viewAsChipTxtActive]}>{sm.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* KPI cards — one line, matching web's hero-stat row exactly:
                Members, Overall Progress (= Completion), On-Time Completion,
                Business Review (only when there's actually a queue). Mobile
                previously showed "Productivity" here, which duplicated
                Completion's own calculation client-side instead of surfacing
                the distinct on-time metric the backend already returns. */}
            <View style={s.kpiRow}>
              <View style={[s.kpiCard, { borderTopColor: colors.success }]}>
                <View style={s.kpiHeadRow}>
                  <Text style={s.kpiLabel} numberOfLines={1}>MEMBERS</Text>
                  <View style={[s.kpiIconWrap, { backgroundColor: colors.success + '22' }]}>
                    <Ionicons name="people-outline" size={12} color={colors.success} />
                  </View>
                </View>
                <Text style={[s.kpiValue, { color: colors.success }]}>
                  {tt?.member_count ?? '—'}
                </Text>
                <Text style={s.kpiSub}>active</Text>
              </View>
              <View style={[s.kpiCard, { borderTopColor: colors.secondary }]}>
                <View style={s.kpiHeadRow}>
                  <Text style={s.kpiLabel} numberOfLines={1}>COMPLETION</Text>
                  <View style={[s.kpiIconWrap, { backgroundColor: colors.secondary + '22' }]}>
                    <Ionicons name="checkmark-circle-outline" size={12} color={colors.secondary} />
                  </View>
                </View>
                <Text style={[s.kpiValue, { color: colors.secondary }]}>
                  {taskTotal > 0 ? `${completionPct}%` : '—'}
                </Text>
                <Text style={s.kpiSub}>{taskCompleted} tasks</Text>
              </View>
              <View style={[s.kpiCard, { borderTopColor: colors.primary }]}>
                <View style={s.kpiHeadRow}>
                  <Text style={s.kpiLabel} numberOfLines={1}>ON-TIME</Text>
                  <View style={[s.kpiIconWrap, { backgroundColor: colors.primary + '22' }]}>
                    <Ionicons name="speedometer-outline" size={12} color={colors.primary} />
                  </View>
                </View>
                <Text style={[s.kpiValue, { color: colors.primary }]}>
                  {tt?.ontime_completion != null ? `${tt.ontime_completion}%` : '—'}
                </Text>
                <Text style={s.kpiSub}>on time</Text>
              </View>
              {pendingBusinessReviews > 0 && (
                <TouchableOpacity
                  style={[s.kpiCard, { borderTopColor: '#d97706' }]}
                  onPress={() => goToMore('BusinessReviewsList')}
                >
                  <View style={s.kpiHeadRow}>
                    <Text style={s.kpiLabel} numberOfLines={1}>BUSINESS REVIEW</Text>
                    <View style={[s.kpiIconWrap, { backgroundColor: '#d9770622' }]}>
                      <Ionicons name="bar-chart-outline" size={12} color="#d97706" />
                    </View>
                  </View>
                  <Text style={[s.kpiValue, { color: '#d97706' }]}>{pendingBusinessReviews}</Text>
                  <Text style={s.kpiSub}>pending</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Task breakdown */}
            <View style={s.breakCard}>
              <View style={s.breakTitleRow}>
                <Text style={[s.breakTitle, { marginBottom: 0 }]}>TASK STATUS</Text>
                <TouchableOpacity style={s.teamHeadBtn} onPress={() => navigation.navigate('TasksTab')}>
                  <Ionicons name="list-outline" size={13} color={colors.primary} />
                  <Text style={s.teamHeadBtnTxt}>View All</Text>
                </TouchableOpacity>
              </View>
              <View style={s.breakRow}>
                <Text style={s.breakLabel}>Total</Text>
                <Text style={[s.breakVal, { color: colors.textPrimary }]}>{tt?.team_tasks?.total ?? 0}</Text>
              </View>
              <View style={s.breakDivider} />
              <View style={s.breakRow}>
                <View style={[s.breakDot, { backgroundColor: colors.success }]} />
                <Text style={s.breakLabel}>Completed</Text>
                <Text style={[s.breakVal, { color: colors.success }]}>{tt?.team_tasks?.completed ?? 0}</Text>
              </View>
              <View style={s.breakRow}>
                <View style={[s.breakDot, { backgroundColor: colors.primary }]} />
                <Text style={s.breakLabel}>In Progress</Text>
                <Text style={[s.breakVal, { color: colors.primary }]}>{tt?.team_tasks?.in_progress ?? 0}</Text>
              </View>
              <View style={s.breakRow}>
                <View style={[s.breakDot, { backgroundColor: colors.gray400 }]} />
                <Text style={s.breakLabel}>On Hold</Text>
                <Text style={[s.breakVal, { color: colors.textSecondary }]}>{tt?.team_tasks?.on_hold ?? 0}</Text>
              </View>
              <View style={s.breakRow}>
                <View style={[s.breakDot, { backgroundColor: colors.danger }]} />
                <Text style={s.breakLabel}>Delayed</Text>
                <Text style={[s.breakVal, { color: colors.danger }]}>{tt?.team_tasks?.delayed ?? 0}</Text>
              </View>
            </View>

            {/* Team Workload bars — pending hours (not_started + in_progress est) vs min hours/week */}
            {workloadSorted.length > 0 && (
              <View style={s.sectionCard}>
                <Text style={s.sectionHead}>TEAM WORKLOAD{minHoursPerWeek ? ` (min ${minHoursPerWeek}h/week)` : ''}</Text>
                {/* Fixed maxHeight (not flex/flexShrink) so this scrolls within
                    its own box once the team is bigger than ~10 people, instead
                    of just growing the page — nestedScrollEnabled lets the inner
                    scroll win over the outer page ScrollView on Android. */}
                <ScrollView style={s.workloadScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  {workloadSorted.map((m, idx) => {
                    const name = getMemberName(m);
                    const hrs = getMemberWorkloadHrs(m);
                    const pct = workloadMax > 0 ? hrs / workloadMax : 0;
                    const barColor = hrs >= minHoursPerWeek ? colors.danger : hrs >= minHoursPerWeek * 0.2 ? colors.warning : colors.success;
                    return (
                      <View key={m.user_id ?? m.user?.id ?? idx} style={s.workloadRow}>
                        <Text style={s.workloadName} numberOfLines={1}>{name}</Text>
                        <View style={s.workloadBarBg}>
                          <View style={[s.workloadBarFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: barColor }]} />
                        </View>
                        <Text style={s.workloadCount} numberOfLines={1}>{formatDuration(Math.round(hrs * 60))}</Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Team Activity by employee */}
            <TeamActivityTableWidget
              appId={workspace!.id}
              isAdmin={isAdmin}
              scope={mgrScope}
              viewAs={viewAs}
              colors={colors}
              minHoursPerDay={teamData?.min_hours_per_day ?? 0}
              minHoursPerWeek={teamData?.min_hours_per_week ?? 0}
            />

            {/* Business Reviews — per-manager daily/weekly/monthly check-in rollup */}
            {data?.user?.id != null && (
              <BusinessReviewsTableWidget
                appId={workspace!.id}
                mgrScope={mgrScope}
                viewAs={viewAs}
                meId={data.user.id}
                colors={colors}
              />
            )}

            {/* Routine Analysis */}
            <TeamRoutineAnalysisWidget reportees={teamRoutines} colors={colors} onViewAllRoutines={() => goToMore('Routines')} />

            {/* Appreciations & Feedback */}
            <AppreciationsFeedbackWidget members={apprMembers} totalAppr={apprTotals.total_appr} totalFb={apprTotals.total_fb} colors={colors} />

            {/* Business Review Calendar (reviews this manager conducts) */}
            {data?.user?.id != null && (
              <BusinessReviewCalendarWidget appId={workspace!.id} mode="team" meId={data.user.id} colors={colors} />
            )}

            {/* Team Leaderboard — ranked by GLOS score within the current scope */}
            <LeaderboardWidget title="TEAM LEADERBOARD" entries={teamLeaderboard} meId={data?.user?.id} colors={colors} />

            {/* Team Mood — thresholds/emoji match web's MoodGauge exactly
                (>=8 great/green, >=6 good/amber, else needs attention/red). */}
            {tt?.team_mood != null && (
              <View style={s.moodCard}>
                <Text style={s.sectionHead}>TEAM MOOD</Text>
                <View style={s.moodBody}>
                  <View style={[s.moodEmojiWrap, { backgroundColor: getMoodColor(tt.team_mood, colors) + '18' }]}>
                    <Text style={s.moodEmoji}>{getMoodEmoji(tt.team_mood)}</Text>
                  </View>
                  <Text style={s.moodScore}>
                    {tt.team_mood}
                    <Text style={s.moodBase}>/10</Text>
                  </Text>
                  <View style={s.moodBarBg}>
                    <View style={[s.moodBarFill, {
                      width: `${tt.team_mood * 10}%` as any,
                      backgroundColor: getMoodColor(tt.team_mood, colors),
                    }]} />
                  </View>
                  <Text style={[s.moodLabel, { color: getMoodColor(tt.team_mood, colors) }]}>
                    {getMoodLabel(tt.team_mood)}
                  </Text>
                </View>
              </View>
            )}

            {/* Switch workspace */}
            <TouchableOpacity style={s.switchRow} onPress={() => setWorkspace(null)}>
              <Ionicons name="swap-horizontal-outline" size={14} color={colors.primary} />
              <Text style={s.switchTxt}>Switch Workspace</Text>
              <Text style={s.switchName} numberOfLines={1}>{workspace?.name}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.gray400} />
            </TouchableOpacity>
          </>
        )}
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
    topRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    iconBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: c.primaryLight, alignItems: 'center', justifyContent: 'center' },
    notifDot: { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: c.danger, borderWidth: 1.5, borderColor: c.surface },
    avatarWrap: { borderRadius: 18, borderWidth: 1.5, borderColor: c.primary + '55', overflow: 'hidden' },

    viewToggleRow: {
      flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    viewToggleBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingVertical: 8, borderRadius: 10,
      backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border,
    },
    viewToggleBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    viewToggleTxt: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
    viewToggleTxtActive: { color: '#fff' },

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
    greetRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    greetLine: { fontSize: 22, fontFamily: SERIF, color: c.textPrimary, lineHeight: 26 },
    greetName: { fontSize: 26, fontFamily: SERIF, color: c.primary, lineHeight: 32 },
    greetRole: { fontSize: 12, color: c.textSecondary, fontWeight: '600', marginTop: 4 },
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

    teamHeadRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4,
    },
    teamHeadTitle: { fontSize: 20, fontWeight: '800', color: c.textPrimary, letterSpacing: -0.3 },
    teamHeadSub: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
    teamHeadBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: c.primaryLight, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    },
    teamHeadBtnTxt: { fontSize: 12, fontWeight: '700', color: c.primary },

    scopeRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 10 },
    scopeBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border },
    scopeBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    scopeBtnTxt: { fontSize: 10.5, fontWeight: '700', color: c.textSecondary, textAlign: 'center' },
    scopeBtnTxtActive: { color: '#fff' },
    viewAsRow: { marginTop: 10 },
    viewAsChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    viewAsChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    viewAsChipTxt: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
    viewAsChipTxtActive: { color: '#fff' },

    // KPI cards — one line of up to 4, matching web's single hero-stat row
    // (previously wrapped into a 2x2 grid, which read as two separate rows).
    kpiRow: { flexDirection: 'row', gap: 6, marginHorizontal: 16, marginTop: 14 },
    kpiCard: {
      flex: 1, backgroundColor: c.surface, borderRadius: 12,
      borderWidth: 1, borderColor: c.border, padding: 8,
      borderTopWidth: 3,
    },
    kpiHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
    kpiIconWrap: { width: 18, height: 18, borderRadius: 5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    // flexShrink:1 lets the label truncate instead of wrapping to a second
    // line or overflowing the card on narrower screens (RN's default
    // flexShrink is 0, so this needs to be explicit).
    kpiLabel: { flexShrink: 1, fontSize: 8, fontWeight: '700', color: c.textMuted, letterSpacing: 0.4 },
    kpiValue: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5, marginTop: 5 },
    kpiSub: { fontSize: 9, color: c.textSecondary, marginTop: 1 },

    // Task breakdown
    breakCard: {
      marginHorizontal: 16, marginTop: 12,
      backgroundColor: c.surface, borderRadius: 14,
      borderWidth: 1, borderColor: c.border, padding: 16,
    },
    breakTitle: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginBottom: 12 },
    breakTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    breakRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
    breakDivider: { height: 1, backgroundColor: c.border, marginVertical: 6 },
    breakDot: { width: 8, height: 8, borderRadius: 4 },
    breakLabel: { flex: 1, fontSize: 13, color: c.textSecondary },
    breakVal: { fontSize: 14, fontWeight: '800' },

    // Generic section card
    sectionCard: {
      marginHorizontal: 16, marginTop: 12,
      backgroundColor: c.surface, borderRadius: 14,
      borderWidth: 1, borderColor: c.border, padding: 16,
    },
    sectionHead: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginBottom: 12 },
    sectionHeadRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 0,
    },

    // Workload bars
    workloadScroll: { maxHeight: 260 },
    workloadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    // flexShrink:1 matters here — RN defaults flexShrink to 0 (unlike web
    // CSS), so a plain fixed width never yields space back on narrower
    // screens, and can force the bar toward zero width instead of shrinking
    // the label to fit.
    workloadName: { width: 130, flexShrink: 1, fontSize: 12, fontWeight: '600', color: c.textPrimary },
    workloadBarBg: { flex: 1, minWidth: 24, height: 8, backgroundColor: c.gray100, borderRadius: 4, overflow: 'hidden' },
    workloadBarFill: { height: 8, borderRadius: 4 },
    workloadCount: { width: 66, flexShrink: 1, fontSize: 12, fontWeight: '700', color: c.textSecondary, textAlign: 'right' },

    // Leaderboard
    lbCard: { alignItems: 'center', width: 80 },
    lbMedal: { fontSize: 20, marginBottom: 6 },
    lbRankNum: { fontSize: 12, fontWeight: '700', color: c.textMuted, marginBottom: 6 },
    lbAvatar: {
      width: 56, height: 56, borderRadius: 28,
      alignItems: 'center', justifyContent: 'center', marginBottom: 8,
    },
    lbAvatarTxt: { fontSize: 20, fontWeight: '900', color: '#fff' },
    lbName: { fontSize: 12, fontWeight: '700', color: c.textPrimary, textAlign: 'center' },
    lbPts: { fontSize: 11, fontWeight: '700', color: c.secondary, marginTop: 2 },

    // Mood
    moodCard: {
      marginHorizontal: 16, marginTop: 12,
      backgroundColor: c.surface, borderRadius: 14,
      borderWidth: 1, borderColor: c.border, padding: 16,
    },
    moodBody: { alignItems: 'center', paddingVertical: 8 },
    moodEmojiWrap: {
      width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
      marginBottom: 8,
    },
    moodEmoji: { fontSize: 34 },
    moodScore: { fontSize: 40, fontWeight: '800', color: c.textPrimary, letterSpacing: -1 },
    moodBase: { fontSize: 16, fontWeight: '400', color: c.textMuted },
    moodBarBg: {
      width: '100%', height: 10, backgroundColor: c.gray100,
      borderRadius: 5, overflow: 'hidden', marginVertical: 10,
    },
    moodBarFill: { height: 10, borderRadius: 5 },
    moodLabel: { fontSize: 14, fontWeight: '700', color: c.textSecondary },

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

    // Today's Summary
    todayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    todayTile: {
      width: '47%', backgroundColor: c.background, borderRadius: 12,
      borderWidth: 1, borderColor: c.border, padding: 12,
    },
    todayTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    todayIconBox: {
      width: 28, height: 28, borderRadius: 14,
      alignItems: 'center', justifyContent: 'center',
    },
    todayVal: { fontSize: 20, fontWeight: '800', color: c.textPrimary, letterSpacing: -0.5 },
    todayLbl: { fontSize: 10, color: c.textMuted, marginTop: 2 },

    // Upcoming Events
    eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    eventIconBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: c.infoLight, alignItems: 'center', justifyContent: 'center' },
    eventName: { fontSize: 12, fontWeight: '700', color: c.textPrimary },
    eventSub: { fontSize: 11, color: c.textMuted, marginTop: 1 },
    wishBtn: { backgroundColor: c.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    wishBtnDone: { backgroundColor: c.gray300 },
    wishBtnTxt: { fontSize: 11, fontWeight: '700', color: '#fff' },

    // My Performance Reviews
    reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    reviewCycle: { fontSize: 12, fontWeight: '700', color: c.textPrimary },
    reviewStage: { fontSize: 11, fontWeight: '700', marginTop: 2 },
    reviewBtn: { backgroundColor: c.primaryLight, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    reviewBtnTxt: { fontSize: 11, fontWeight: '700', color: c.primary },

    // My Projects
    projRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: c.border },
    projNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    projName: { fontSize: 12, fontWeight: '700', color: c.textPrimary, flexShrink: 1 },
    ownerPill: { backgroundColor: c.warningLight, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
    ownerPillTxt: { fontSize: 9, fontWeight: '700', color: c.warning },
    projSub: { fontSize: 11, color: c.textMuted, marginTop: 2 },
    projStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
    projStatusTxt: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },

    // My Routines
    routineKpiRow: { flexDirection: 'row', marginBottom: 12 },
    routineKpiCell: { flex: 1, alignItems: 'center' },
    routineKpiVal: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    routineKpiLbl: { fontSize: 9, color: c.textMuted, marginTop: 2 },
    routineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: c.border },
    routineDesc: { flex: 1, fontSize: 12, fontWeight: '600', color: c.textPrimary },
    routineBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
    routineBadgeTxt: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
    viewAllLink: { fontSize: 12, fontWeight: '700', color: c.primary, marginTop: 8, textAlign: 'right' },
  });
}
