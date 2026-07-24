import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
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
import { useLoadWithTimeout } from '../../hooks/useLoadWithTimeout';

interface DashData {
  tasks?: { total?: number; done?: number; in_progress?: number; open?: number; blocked?: number; overdue?: number; completion_rate?: number };
  hours?: { today?: { minutes?: number }; this_week?: { minutes?: number }; this_month?: { minutes?: number } };
  latest_review?: any;
  roles?: any[];
}

interface TeamMember {
  user_id?: number;
  user?: { id?: number; first_name?: string; last_name?: string };
  first_name?: string;
  last_name?: string;
  email?: string;
  tasks_total?: number;
  tasks?: { total?: number };
  tasks_done?: number;
  hours_this_week?: number;
  hours?: number;
  overdue?: number;
  engagement_trend?: Array<{ score?: number }>;
}

interface TeamDashData {
  members?: TeamMember[];
  sub_managers?: Array<{ user_id: number; name: string }>;
  team_totals?: {
    member_count?: number;
    hours_this_week?: number;
    avg_hours_this_week?: number;
    total_overdue?: number;
    team_tasks?: { completed?: number; in_progress?: number; on_hold?: number; delayed?: number; total?: number };
    team_productivity?: number;
    team_activity?: Array<{ actor_name?: string; action?: string; item?: string; ts?: string; tag?: string }>;
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

function getMoodLabel(score: number): string {
  if (score >= 8) return 'Excellent';
  if (score >= 6) return 'Good';
  if (score >= 4) return 'Fair';
  return 'Needs attention';
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
  const trend = m.engagement_trend ?? [];
  const raw = trend.length > 0 ? (trend[trend.length - 1]?.score ?? 0) : 0;
  return Math.round(raw * 10);
}

const PODIUM_ICONS = ['🥇', '🥈', '🥉'];

export default function DashboardScreen() {
  const api = useApi();
  const { workspace, setWorkspace } = useWorkspace();
  const { isAdmin, canSeeTeamContent } = useHasTeam();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [data, setData] = useState<DashData | null>(null);
  const [teamData, setTeamData] = useState<TeamDashData | null>(null);
  const [userName, setUserName] = useState('');
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);
  const [dashView, setDashView] = useState<DashView>('my');
  const [mgrScope, setMgrScope] = useState<'direct' | 'all'>('direct');
  const [viewAs, setViewAs] = useState<number | null>(null);
  const { loading, loadError, run } = useLoadWithTimeout();

  const loadTeamData = useCallback(async () => {
    if (!workspace || !canSeeTeamContent) return;
    const teamRes = isAdmin
      ? await api.dashboard.getTeamDashboard(workspace.id)
      : await api.dashboard.getManagerDashboard(workspace.id, mgrScope, undefined, viewAs ?? undefined);
    setTeamData(teamRes.data);
  }, [workspace, api, isAdmin, canSeeTeamContent, mgrScope, viewAs]);

  const load = useCallback(async () => {
    if (!workspace) return;
    // Team/manager content is available to admins and to members who have
    // reportees in the org chart — matches QA web's Sidebar.jsx `hasTeam` gate.
    const [appRes, dash, notif, me, feedRes] = await Promise.all([
      api.workspace.getApp(workspace.id),
      api.dashboard.getMyDashboard(workspace.id),
      api.notifications.unreadCount(),
      api.me.getProfile(),
      api.feed.list(workspace.id),
      loadTeamData(),
    ]);
    const appData = appRes.data?.app ?? appRes.data;
    if (appData && appData.is_active === false) { setWorkspace(null); return; }
    setData(dash.data);
    setUnread(notif.data.count ?? 0);
    const first = me.data?.firstName ?? me.data?.first_name ?? '';
    const last = me.data?.lastName ?? me.data?.last_name ?? '';
    setUserName(`${first} ${last}`.trim() || first);
    const items = feedRes.data?.items ?? feedRes.data ?? [];
    setFeed(Array.isArray(items) ? items.slice(0, 3) : []);
  }, [workspace, api, setWorkspace, loadTeamData]);

  useEffect(() => { run(load); }, [load]);

  useEffect(() => { if (dashView === 'Team') loadTeamData(); }, [mgrScope, viewAs]);

  useFocusEffect(useCallback(() => {
    if (!workspace) return;
    api.notifications.unreadCount()
      .then((r) => setUnread(r.data.count ?? 0))
      .catch(() => {});
  }, [workspace, api]));

  const onRefresh = async () => {
    setRefreshing(true);
    await run(load, true);
    setRefreshing(false);
  };

  if (loading) return <LoadingSpinner />;
  if (loadError) return <LoadError onRetry={() => run(load)} />;

  const tasks = data?.tasks;
  const total = tasks?.total ?? 0;
  const done = tasks?.done ?? 0;
  const inProgress = tasks?.in_progress ?? 0;
  const overdue = tasks?.overdue ?? 0;
  const todayMins = data?.hours?.today?.minutes ?? 0;
  const weekMins = data?.hours?.this_week?.minutes ?? 0;
  const monthMins = data?.hours?.this_month?.minutes ?? 0;
  const displayName = userName || 'there';
  const now = new Date();
  const dateLabel = `${DAY_NAMES[now.getDay()]} · ${now.getDate()} ${MONTH_SHORT[now.getMonth()]}`;

  const tt = teamData?.team_totals;
  const members = teamData?.members ?? [];

  const leaderboard = [...members].sort((a, b) => getMemberScore(b) - getMemberScore(a));

  const workloadSorted = [...members]
    .sort((a, b) => getMemberTasks(b) - getMemberTasks(a))
    .slice(0, 5);
  const workloadMax = Math.max(...workloadSorted.map(getMemberTasks), 1);

  const taskTotal = tt?.team_tasks?.total ?? 0;
  const taskCompleted = tt?.team_tasks?.completed ?? 0;
  const completionPct = taskTotal > 0 ? Math.round((taskCompleted / taskTotal) * 100) : 0;

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
          <TouchableOpacity style={s.avatar} onPress={() => navigation.navigate('ProfileTab')}>
            <Text style={s.avatarTxt}>{initials(displayName)}</Text>
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
              <TouchableOpacity style={s.teamHeadBtn} onPress={() => navigation.navigate('TasksTab')}>
                <Ionicons name="list-outline" size={13} color={colors.primary} />
                <Text style={s.teamHeadBtnTxt}>All Tasks</Text>
              </TouchableOpacity>
            </View>

            {/* Sub-manager scope switch — only shown for hasTeam members (not admins) who manage other managers */}
            {!isAdmin && (teamData?.sub_managers?.length ?? 0) > 0 && (
              <View style={s.scopeRow}>
                <TouchableOpacity
                  style={[s.scopeBtn, mgrScope === 'direct' && s.scopeBtnActive]}
                  onPress={() => { setMgrScope('direct'); setViewAs(null); }}
                >
                  <Text style={[s.scopeBtnTxt, mgrScope === 'direct' && s.scopeBtnTxtActive]}>My Direct Team</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.scopeBtn, mgrScope === 'all' && s.scopeBtnActive]}
                  onPress={() => { setMgrScope('all'); setViewAs(null); }}
                >
                  <Text style={[s.scopeBtnTxt, mgrScope === 'all' && s.scopeBtnTxtActive]}>Whole Org (incl. sub-teams)</Text>
                </TouchableOpacity>
              </View>
            )}
            {!isAdmin && mgrScope === 'all' && (teamData?.sub_managers?.length ?? 0) > 0 && (
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

            {/* 3 KPI cards */}
            <View style={s.kpiRow}>
              <View style={[s.kpiCard, { borderTopColor: colors.primary }]}>
                <Text style={s.kpiLabel}>PRODUCTIVITY</Text>
                <Text style={[s.kpiValue, { color: colors.primary }]}>
                  {tt?.team_productivity != null ? `${tt.team_productivity}%` : '—'}
                </Text>
                <Text style={s.kpiSub}>team avg</Text>
              </View>
              <View style={[s.kpiCard, { borderTopColor: colors.success }]}>
                <Text style={s.kpiLabel}>MEMBERS</Text>
                <Text style={[s.kpiValue, { color: colors.success }]}>
                  {tt?.member_count ?? '—'}
                </Text>
                <Text style={s.kpiSub}>active</Text>
              </View>
              <View style={[s.kpiCard, { borderTopColor: colors.secondary }]}>
                <Text style={s.kpiLabel}>COMPLETION</Text>
                <Text style={[s.kpiValue, { color: colors.secondary }]}>
                  {taskTotal > 0 ? `${completionPct}%` : '—'}
                </Text>
                <Text style={s.kpiSub}>{taskCompleted} tasks</Text>
              </View>
            </View>

            {/* Task breakdown */}
            <View style={s.breakCard}>
              <Text style={s.breakTitle}>TASK STATUS</Text>
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

            {/* Team Workload bars */}
            {workloadSorted.length > 0 && (
              <View style={s.sectionCard}>
                <Text style={s.sectionHead}>TEAM WORKLOAD</Text>
                {workloadSorted.map((m, idx) => {
                  const name = getMemberName(m);
                  const taskCount = getMemberTasks(m);
                  const pct = workloadMax > 0 ? taskCount / workloadMax : 0;
                  return (
                    <View key={m.user_id ?? m.user?.id ?? idx} style={s.workloadRow}>
                      <Text style={s.workloadName} numberOfLines={1}>{name}</Text>
                      <View style={s.workloadBarBg}>
                        <View style={[s.workloadBarFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: colors.primary }]} />
                      </View>
                      <Text style={s.workloadCount}>{taskCount}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Recent Team Activity */}
            {(tt?.team_activity ?? []).length > 0 && (
              <View style={s.sectionCard}>
                <Text style={s.sectionHead}>RECENT ACTIVITY</Text>
                {(tt!.team_activity!).slice(0, 6).map((a, idx) => (
                  <View key={idx} style={s.activityRow}>
                    <View style={s.activityAv}>
                      <Text style={s.activityAvTxt}>{initials(a.actor_name)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.activityText} numberOfLines={2}>
                        <Text style={s.activityBold}>{a.actor_name}</Text>
                        {a.action ? ` ${a.action}` : ''}
                        {a.item ? ` ${a.item}` : ''}
                      </Text>
                      <Text style={s.activityTime}>{timeAgo(a.ts)}</Text>
                    </View>
                    {a.tag ? (
                      <View style={s.activityTag}>
                        <Text style={s.activityTagTxt}>{a.tag}</Text>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            )}

            {/* Team Leaderboard */}
            {leaderboard.length > 0 && (
              <View style={s.sectionCard}>
                <Text style={s.sectionHead}>TEAM LEADERBOARD</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 12, paddingVertical: 4 }}
                >
                  {leaderboard.map((m, idx) => {
                    const name = getMemberName(m);
                    const score = getMemberScore(m);
                    const avColor = idx === 0 ? colors.success
                      : idx === 1 ? colors.primary
                      : idx === 2 ? colors.secondary
                      : colors.gray300;
                    return (
                      <View key={m.user_id ?? m.user?.id ?? idx} style={s.lbCard}>
                        {idx < 3
                          ? <Text style={s.lbMedal}>{PODIUM_ICONS[idx]}</Text>
                          : <Text style={s.lbRankNum}>{`#${idx + 1}`}</Text>}
                        <View style={[s.lbAvatar, { backgroundColor: avColor }]}>
                          <Text style={s.lbAvatarTxt}>{initials(name)}</Text>
                        </View>
                        <Text style={s.lbName} numberOfLines={1}>{name.split(' ')[0]}</Text>
                        {score > 0 && <Text style={s.lbPts}>{score} pts</Text>}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Team Mood */}
            {tt?.team_mood != null && (
              <View style={s.moodCard}>
                <Text style={s.sectionHead}>TEAM MOOD</Text>
                <View style={s.moodBody}>
                  <Text style={s.moodScore}>
                    {tt.team_mood}
                    <Text style={s.moodBase}>/10</Text>
                  </Text>
                  <View style={s.moodBarBg}>
                    <View style={[s.moodBarFill, {
                      width: `${tt.team_mood * 10}%` as any,
                      backgroundColor: tt.team_mood >= 7 ? colors.success : tt.team_mood >= 4 ? colors.secondary : colors.danger,
                    }]} />
                  </View>
                  <Text style={s.moodLabel}>{getMoodLabel(tt.team_mood)}</Text>
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
    avatar: { width: 36, height: 36, borderRadius: 10, backgroundColor: c.primaryLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: c.primary + '55' },
    avatarTxt: { fontSize: 13, fontWeight: '900', color: c.primary },

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
    scopeBtnTxt: { fontSize: 12, fontWeight: '700', color: c.textSecondary },
    scopeBtnTxtActive: { color: '#fff' },
    viewAsRow: { marginTop: 10 },
    viewAsChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    viewAsChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    viewAsChipTxt: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
    viewAsChipTxtActive: { color: '#fff' },

    // KPI cards row
    kpiRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 14 },
    kpiCard: {
      flex: 1, backgroundColor: c.surface, borderRadius: 12,
      borderWidth: 1, borderColor: c.border, padding: 12,
      borderTopWidth: 3,
    },
    kpiLabel: { fontSize: 9, fontWeight: '700', color: c.textMuted, letterSpacing: 0.8, marginBottom: 6 },
    kpiValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
    kpiSub: { fontSize: 10, color: c.textSecondary, marginTop: 2 },

    // Task breakdown
    breakCard: {
      marginHorizontal: 16, marginTop: 12,
      backgroundColor: c.surface, borderRadius: 14,
      borderWidth: 1, borderColor: c.border, padding: 16,
    },
    breakTitle: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginBottom: 12 },
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

    // Workload bars
    workloadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    workloadName: { width: 80, fontSize: 12, fontWeight: '600', color: c.textPrimary },
    workloadBarBg: { flex: 1, height: 8, backgroundColor: c.gray100, borderRadius: 4, overflow: 'hidden' },
    workloadBarFill: { height: 8, borderRadius: 4 },
    workloadCount: { width: 28, fontSize: 12, fontWeight: '700', color: c.textSecondary, textAlign: 'right' },

    // Activity feed
    activityRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    activityAv: {
      width: 32, height: 32, borderRadius: 10,
      backgroundColor: c.primaryLight, alignItems: 'center', justifyContent: 'center',
    },
    activityAvTxt: { fontSize: 11, fontWeight: '900', color: c.primary },
    activityText: { fontSize: 12, color: c.textSecondary, lineHeight: 17, flex: 1 },
    activityBold: { fontWeight: '700', color: c.textPrimary },
    activityTime: { fontSize: 10, color: c.textMuted, marginTop: 2 },
    activityTag: {
      backgroundColor: c.primaryLight, paddingHorizontal: 7, paddingVertical: 2,
      borderRadius: 8, alignSelf: 'center',
    },
    activityTagTxt: { fontSize: 10, fontWeight: '700', color: c.primary },

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
  });
}
