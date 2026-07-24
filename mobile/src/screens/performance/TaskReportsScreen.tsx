import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, Modal, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../hooks/useApi';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import LoadError from '../../components/common/LoadError';
import { useLoadWithTimeout } from '../../hooks/useLoadWithTimeout';

type Tab = 'hours' | 'details';

interface HoursRow {
  task_id: number;
  task_number?: string;
  title: string;
  status: string;
  assigned_to_user_id?: number;
  logger_user_id: number;
  user_minutes: number;
  user_hours: number;
  log_entries: number;
  first_log_date?: string;
  last_log_date?: string;
}

interface HoursTaskGroup {
  task_id: number;
  task_number?: string;
  title: string;
  status: string;
  assigned_to_user_id?: number;
  rows: HoursRow[];
  total_minutes: number;
}

interface DetailsTask {
  id: number;
  task_number?: string;
  title: string;
  status: string;
  priority?: string;
  area_id?: number;
  area_name?: string;
  created_by_user_id?: number;
  assigned_to_user_id?: number;
  previous_assignee_ids?: number[];
  created_at?: string;
  due_on?: string;
  estimated_hours?: number;
  total_hours?: number;
  total_minutes?: number;
  checklist_total?: number;
  checklist_done?: number;
}

interface Member {
  user_id: number;
  first_name?: string;
  last_name?: string;
  email?: string;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open:        { bg: 'rgba(107,114,128,0.15)', text: '#9ca3af' },
  in_progress: { bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa' },
  blocked:     { bg: 'rgba(239,68,68,0.15)',   text: '#ef4444' },
  done:        { bg: 'rgba(16,185,129,0.15)',  text: '#10b981' },
  cancelled:   { bg: 'rgba(107,114,128,0.12)', text: '#6b7280' },
};

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  low:    { bg: 'rgba(107,114,128,0.15)', text: '#9ca3af' },
  medium: { bg: 'rgba(245,158,11,0.15)',  text: '#f59e0b' },
  high:   { bg: 'rgba(239,68,68,0.15)',   text: '#ef4444' },
  urgent: { bg: 'rgba(239,68,68,0.20)',   text: '#dc2626' },
};

function fmt(mins?: number) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtDate(s?: string) {
  if (!s) return '—';
  return s.slice(0, 10);
}

function memberName(members: Member[], userId?: number) {
  if (!userId) return '—';
  const m = members.find(x => x.user_id === userId);
  if (!m) return `#${userId}`;
  return `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email || `#${userId}`;
}

export default function TaskReportsScreen() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const isAdmin = workspace?.role === 'super_admin' || workspace?.role === 'admin';
  const now = new Date();

  const [tab, setTab] = useState<Tab>('hours');
  const [members, setMembers] = useState<Member[]>([]);
  const [meId, setMeId] = useState<number | null>(null);
  const { loading, loadError, run } = useLoadWithTimeout();
  const [refreshing, setRefreshing] = useState(false);

  // Hours tab
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [hoursItems, setHoursItems] = useState<HoursRow[]>([]);

  // Details tab
  const [detailsItems, setDetailsItems] = useState<DetailsTask[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [showAreaPicker, setShowAreaPicker] = useState(false);

  const monthStr = useMemo(
    () => `${year}-${String(month + 1).padStart(2, '0')}`,
    [year, month]
  );

  const loadMembers = useCallback(async () => {
    if (!workspace) return;
    try {
      const r = await api.members.list(workspace.id);
      setMembers(r.data?.items ?? r.data ?? []);
    } catch {}
  }, [workspace, api]);

  const loadHours = useCallback(async (overrideMeId?: number | null) => {
    if (!workspace) return;
    try {
      const params: { month: string; user_id?: number } = { month: monthStr };
      if (isAdmin) {
        if (selectedUserId !== null) params.user_id = selectedUserId;
      } else {
        const id = overrideMeId ?? meId;
        if (id !== null) params.user_id = id;
      }
      const r = await api.tasks.timeLogReport(workspace.id, params);
      setHoursItems(r.data?.items ?? r.data ?? []);
    } catch {}
  }, [workspace, api, monthStr, selectedUserId, isAdmin, meId]);

  const loadDetails = useCallback(async () => {
    if (!workspace) return;
    try {
      const r = await api.tasks.detailsReport(workspace.id);
      setDetailsItems(r.data?.items ?? r.data ?? []);
    } catch {}
  }, [workspace, api]);

  const isFirstMount = useRef(true);

  const init = useCallback(async () => {
    let resolvedMeId: number | null = null;
    const r = await api.me.getProfile();
    resolvedMeId = r.data?.id ?? r.data?.user?.id ?? null;
    setMeId(resolvedMeId);
    await Promise.all([loadMembers(), loadHours(resolvedMeId), loadDetails()]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { run(init); }, [init]);

  useEffect(() => {
    if (isFirstMount.current) { isFirstMount.current = false; return; }
    loadHours();
  }, [monthStr, selectedUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = async () => {
    setRefreshing(true);
    if (tab === 'hours') await loadHours();
    else await loadDetails();
    setRefreshing(false);
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  // Group hours rows by task
  const hoursGroups = useMemo((): HoursTaskGroup[] => {
    const map = new Map<number, HoursTaskGroup>();
    for (const row of hoursItems) {
      const g = map.get(row.task_id);
      if (g) {
        g.rows.push(row);
        g.total_minutes += row.user_minutes;
      } else {
        map.set(row.task_id, {
          task_id: row.task_id,
          task_number: row.task_number,
          title: row.title,
          status: row.status,
          assigned_to_user_id: row.assigned_to_user_id,
          rows: [row],
          total_minutes: row.user_minutes,
        });
      }
    }
    return Array.from(map.values());
  }, [hoursItems]);

  const grandTotalMinutes = useMemo(
    () => hoursGroups.reduce((sum, g) => sum + g.total_minutes, 0),
    [hoursGroups]
  );

  const filteredDetails = useMemo(() => {
    return detailsItems
      .filter(t => {
        if (statusFilter && t.status !== statusFilter) return false;
        if (priorityFilter && t.priority !== priorityFilter) return false;
        if (areaFilter) {
          if (areaFilter === '_none') return !t.area_name;
          if (t.area_name !== areaFilter) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const at = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bt - at;
      });
  }, [detailsItems, statusFilter, priorityFilter, areaFilter]);

  const areas = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const t of detailsItems) {
      if (t.area_name && !seen.has(t.area_name)) {
        seen.add(t.area_name);
        list.push(t.area_name);
      }
    }
    return list.sort();
  }, [detailsItems]);

  const detailsCompletedCount = filteredDetails.filter(t => t.status === 'done').length;
  const detailsTotalHours = filteredDetails.reduce((sum, t) => sum + (Number(t.total_hours) || 0), 0);

  const selectedMember = members.find(m => m.user_id === selectedUserId);
  const selectedMemberName = selectedMember
    ? `${selectedMember.first_name ?? ''} ${selectedMember.last_name ?? ''}`.trim() || selectedMember.email
    : 'All Members';

  const statusOptions = ['', 'open', 'in_progress', 'blocked', 'done', 'cancelled'];
  const priorityOptions = ['', 'low', 'medium', 'high', 'urgent'];

  if (loading) return <LoadingSpinner />;
  if (loadError) return <LoadError onRetry={() => run(init)} />;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Task Reports</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Tab switcher */}
      <View style={s.tabRow}>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'hours' && s.tabBtnActive]}
          onPress={() => setTab('hours')}
        >
          <Ionicons name="time-outline" size={14} color={tab === 'hours' ? '#fff' : colors.textSecondary} />
          <Text style={[s.tabText, tab === 'hours' && s.tabTextActive]}>Task Hours</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'details' && s.tabBtnActive]}
          onPress={() => setTab('details')}
        >
          <Ionicons name="list-outline" size={14} color={tab === 'details' ? '#fff' : colors.textSecondary} />
          <Text style={[s.tabText, tab === 'details' && s.tabTextActive]}>Task Details</Text>
        </TouchableOpacity>
      </View>

      {/* ── HOURS TAB ────────────────────────────────────── */}
      {tab === 'hours' && (
        <>
          {/* Month picker */}
          <View style={s.monthPicker}>
            <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={8}>
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
            </TouchableOpacity>
            <Text style={s.monthLabel}>{MONTH_NAMES[month]} {year}</Text>
            <TouchableOpacity
              onPress={() => shiftMonth(1)}
              hitSlop={8}
              disabled={year === now.getFullYear() && month === now.getMonth()}
            >
              <Ionicons
                name="chevron-forward"
                size={20}
                color={year === now.getFullYear() && month === now.getMonth()
                  ? colors.gray300 : colors.primary}
              />
            </TouchableOpacity>
          </View>

          {/* Admin member selector */}
          {isAdmin && (
            <TouchableOpacity style={s.filterRow} onPress={() => setShowUserPicker(true)}>
              <Ionicons name="person-outline" size={15} color={colors.primary} />
              <Text style={s.filterRowText}>{selectedMemberName}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.gray400} />
            </TouchableOpacity>
          )}

          {/* Summary cards */}
          <View style={s.summaryRow}>
            <View style={s.summaryCard}>
              <Text style={s.summaryVal}>{hoursGroups.length}</Text>
              <Text style={s.summaryLbl}>Tasks</Text>
            </View>
            <View style={[s.summaryCard, { borderColor: colors.secondary + '44' }]}>
              <Text style={[s.summaryVal, { color: colors.secondary }]}>{fmt(grandTotalMinutes)}</Text>
              <Text style={s.summaryLbl}>Total Hours</Text>
            </View>
            {isAdmin && selectedUserId === null && (
              <View style={[s.summaryCard, { borderColor: colors.primary + '44' }]}>
                <Text style={[s.summaryVal, { color: colors.primary }]}>
                  {new Set(hoursItems.map(r => r.logger_user_id)).size}
                </Text>
                <Text style={s.summaryLbl}>Members</Text>
              </View>
            )}
            <View style={s.summaryCard}>
              <Text style={[s.summaryVal, { fontSize: 13 }]}>{MONTH_NAMES[month]} {String(year).slice(2)}</Text>
              <Text style={s.summaryLbl}>Period</Text>
            </View>
          </View>

          <ScrollView
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            }
            showsVerticalScrollIndicator={false}
          >
            {hoursGroups.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="time-outline" size={40} color={colors.gray300} />
                <Text style={s.emptyText}>No time logs for {MONTH_NAMES[month]} {year}</Text>
              </View>
            ) : (
              <>
                {hoursGroups.map(group => {
                  const sc = STATUS_COLORS[group.status] ?? STATUS_COLORS.open;
                  return (
                    <View key={group.task_id} style={s.hoursCard}>
                      <View style={s.hoursCardHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.hoursTaskNum}>
                            {group.task_number ? `#${group.task_number}` : `#${group.task_id}`}
                          </Text>
                          <Text style={s.hoursTaskTitle} numberOfLines={2}>{group.title}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <View style={[s.badge, { backgroundColor: sc.bg }]}>
                            <Text style={[s.badgeText, { color: sc.text }]}>
                              {(group.status ?? '').replace(/_/g, ' ')}
                            </Text>
                          </View>
                          <Text style={[s.hoursTotal, { color: colors.secondary }]}>
                            {fmt(group.total_minutes)}
                          </Text>
                        </View>
                      </View>

                      {group.rows.map((row, idx) => {
                        const name = memberName(members, row.logger_user_id);
                        const isCurrent = row.logger_user_id === group.assigned_to_user_id;
                        return (
                          <View key={idx} style={s.hoursUserRow}>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={s.hoursUserName}>{name}</Text>
                                {isAdmin && selectedUserId === null && isCurrent && (
                                  <View style={s.currentBadge}>
                                    <Text style={[s.currentBadgeText, { color: colors.success }]}>current</Text>
                                  </View>
                                )}
                              </View>
                              {(row.first_log_date || row.last_log_date) && (
                                <Text style={s.hoursDateRange}>
                                  {fmtDate(row.first_log_date)}
                                  {row.last_log_date && row.last_log_date !== row.first_log_date
                                    ? ` → ${fmtDate(row.last_log_date)}` : ''}
                                </Text>
                              )}
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={[s.hoursUserTime, { color: colors.info }]}>{fmt(row.user_minutes)}</Text>
                              <Text style={s.hoursEntries}>
                                {row.log_entries} entr{row.log_entries === 1 ? 'y' : 'ies'}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}

                {/* Grand total */}
                <View style={s.grandTotal}>
                  <Text style={s.grandTotalLabel}>GRAND TOTAL — {hoursGroups.length} tasks</Text>
                  <Text style={[s.grandTotalValue, { color: colors.secondary }]}>{fmt(grandTotalMinutes)}</Text>
                </View>
              </>
            )}
            <View style={{ height: 32 }} />
          </ScrollView>
        </>
      )}

      {/* ── DETAILS TAB ──────────────────────────────────── */}
      {tab === 'details' && (
        <>
          {/* Filters */}
          <View style={s.filtersRow}>
            <TouchableOpacity
              style={[s.filterChip, statusFilter ? s.filterChipActive : null]}
              onPress={() => setShowStatusPicker(true)}
            >
              <Text style={[s.filterChipText, statusFilter ? s.filterChipTextActive : null]}>
                {statusFilter ? statusFilter.replace(/_/g, ' ') : 'Status'}
              </Text>
              <Ionicons name="chevron-down" size={12} color={statusFilter ? colors.primary : colors.gray400} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.filterChip, priorityFilter ? s.filterChipActive : null]}
              onPress={() => setShowPriorityPicker(true)}
            >
              <Text style={[s.filterChipText, priorityFilter ? s.filterChipTextActive : null]}>
                {priorityFilter || 'Priority'}
              </Text>
              <Ionicons name="chevron-down" size={12} color={priorityFilter ? colors.primary : colors.gray400} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.filterChip, areaFilter ? s.filterChipActive : null]}
              onPress={() => setShowAreaPicker(true)}
            >
              <Text
                style={[s.filterChipText, areaFilter ? s.filterChipTextActive : null]}
                numberOfLines={1}
              >
                {areaFilter === '_none' ? 'No Area' : areaFilter || 'Area'}
              </Text>
              <Ionicons name="chevron-down" size={12} color={areaFilter ? colors.primary : colors.gray400} />
            </TouchableOpacity>

            {(statusFilter || priorityFilter || areaFilter) && (
              <TouchableOpacity
                hitSlop={8}
                onPress={() => { setStatusFilter(''); setPriorityFilter(''); setAreaFilter(''); }}
              >
                <Ionicons name="close-circle" size={22} color={colors.danger} />
              </TouchableOpacity>
            )}
          </View>

          {/* Summary cards */}
          <View style={s.summaryRow}>
            <View style={s.summaryCard}>
              <Text style={s.summaryVal}>{filteredDetails.length}</Text>
              <Text style={s.summaryLbl}>Total Tasks</Text>
            </View>
            <View style={[s.summaryCard, { borderColor: colors.success + '44' }]}>
              <Text style={[s.summaryVal, { color: colors.success }]}>{detailsCompletedCount}</Text>
              <Text style={s.summaryLbl}>Completed</Text>
            </View>
            <View style={[s.summaryCard, { borderColor: colors.secondary + '44' }]}>
              <Text style={[s.summaryVal, { color: colors.secondary }]}>
                {detailsTotalHours > 0 ? `${detailsTotalHours.toFixed(1)}h` : '—'}
              </Text>
              <Text style={s.summaryLbl}>Total Hours</Text>
            </View>
          </View>

          <ScrollView
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            }
            showsVerticalScrollIndicator={false}
          >
            {filteredDetails.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="document-text-outline" size={40} color={colors.gray300} />
                <Text style={s.emptyText}>No tasks match the selected filters</Text>
              </View>
            ) : (
              filteredDetails.map(task => {
                const sc = STATUS_COLORS[task.status] ?? STATUS_COLORS.open;
                const pc = task.priority ? (PRIORITY_COLORS[task.priority] ?? null) : null;
                const checkTotal = task.checklist_total ?? 0;
                const checkDone = task.checklist_done ?? 0;
                const checkPct = checkTotal > 0 ? checkDone / checkTotal : 0;
                const prevAssignees = (Array.isArray(task.previous_assignee_ids) ? task.previous_assignee_ids : [])
                  .filter((uid: number) => uid !== task.assigned_to_user_id);

                return (
                  <TouchableOpacity
                    key={task.id}
                    style={s.detailCard}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (!workspace?.id) return;
                      try {
                        navigation.getParent()?.navigate('TasksTab', {
                          screen: 'TaskDetail',
                          params: { taskId: task.id, appId: workspace.id },
                        });
                      } catch {}
                    }}
                  >
                    {/* Top row */}
                    <View style={s.detailTop}>
                      <Text style={s.detailNum}>
                        {task.task_number ? `#${task.task_number}` : `#${task.id}`}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
                        <View style={[s.badge, { backgroundColor: sc.bg }]}>
                          <Text style={[s.badgeText, { color: sc.text }]}>{(task.status ?? '').replace(/_/g, ' ')}</Text>
                        </View>
                        {pc && (
                          <View style={[s.badge, { backgroundColor: pc.bg }]}>
                            <Text style={[s.badgeText, { color: pc.text }]}>{task.priority}</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <Text style={s.detailTitle}>{task.title}</Text>

                    {task.area_name && (
                      <View style={s.detailRow}>
                        <Ionicons name="grid-outline" size={12} color={colors.gray400} />
                        <Text style={s.detailRowText}>{task.area_name}</Text>
                      </View>
                    )}

                    <View style={s.detailRow}>
                      <Ionicons name="person-outline" size={12} color={colors.gray400} />
                      <Text style={s.detailRowText}>
                        {memberName(members, task.assigned_to_user_id)}
                      </Text>
                      {prevAssignees.length > 0 && (
                        <Text style={s.prevAssignees}>
                          {'  '}prev: {prevAssignees.map(uid => memberName(members, uid)).join(', ')}
                        </Text>
                      )}
                    </View>

                    {task.created_by_user_id && (
                      <View style={s.detailRow}>
                        <Ionicons name="create-outline" size={12} color={colors.gray400} />
                        <Text style={s.detailRowText}>
                          by {memberName(members, task.created_by_user_id)}
                        </Text>
                      </View>
                    )}

                    <View style={s.detailMeta}>
                      {task.created_at && (
                        <View style={s.metaPill}>
                          <Text style={s.metaPillLabel}>Created</Text>
                          <Text style={s.metaPillVal}>{fmtDate(task.created_at)}</Text>
                        </View>
                      )}
                      {task.due_on && (
                        <View style={s.metaPill}>
                          <Text style={s.metaPillLabel}>Due</Text>
                          <Text style={s.metaPillVal}>{fmtDate(task.due_on)}</Text>
                        </View>
                      )}
                      {task.estimated_hours != null && Number(task.estimated_hours) > 0 && (
                        <View style={s.metaPill}>
                          <Text style={s.metaPillLabel}>Est.</Text>
                          <Text style={s.metaPillVal}>{Number(task.estimated_hours).toFixed(1)}h</Text>
                        </View>
                      )}
                      {task.total_hours != null && Number(task.total_hours) > 0 && (
                        <View style={[s.metaPill, { borderColor: colors.secondary + '44' }]}>
                          <Text style={s.metaPillLabel}>Logged</Text>
                          <Text style={[s.metaPillVal, { color: colors.secondary }]}>
                            {Number(task.total_hours).toFixed(1)}h
                          </Text>
                        </View>
                      )}
                    </View>

                    {checkTotal > 0 && (
                      <View style={s.checklistRow}>
                        <View style={s.checklistBar}>
                          <View style={[
                            s.checklistFill,
                            {
                              width: `${Math.round(checkPct * 100)}%` as any,
                              backgroundColor: checkPct === 1 ? colors.success : colors.primary,
                            },
                          ]} />
                        </View>
                        <Text style={s.checklistLabel}>{checkDone}/{checkTotal} done</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
            <View style={{ height: 32 }} />
          </ScrollView>
        </>
      )}

      {/* ── Modals ─────────────────────────────────────── */}

      {/* Member picker */}
      <Modal visible={showUserPicker} transparent animationType="slide">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowUserPicker(false)}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Select Member</Text>
              <TouchableOpacity onPress={() => setShowUserPicker(false)}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={[{ user_id: -1, first_name: 'All', last_name: 'Members', email: '' } as Member, ...members]}
              keyExtractor={item => String(item.user_id)}
              renderItem={({ item }) => {
                const name = item.user_id === -1 ? 'All Members' : memberName(members, item.user_id);
                const sel = item.user_id === -1 ? selectedUserId === null : selectedUserId === item.user_id;
                return (
                  <TouchableOpacity
                    style={[s.pickerRow, sel && s.pickerRowSel]}
                    onPress={() => {
                      setSelectedUserId(item.user_id === -1 ? null : item.user_id);
                      setShowUserPicker(false);
                    }}
                  >
                    <Text style={[s.pickerRowText, sel && s.pickerRowTextSel]}>{name}</Text>
                    {sel && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Status picker */}
      <Modal visible={showStatusPicker} transparent animationType="slide">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowStatusPicker(false)}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Filter by Status</Text>
              <TouchableOpacity onPress={() => setShowStatusPicker(false)}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {statusOptions.map(opt => (
              <TouchableOpacity
                key={opt || '__all__'}
                style={[s.pickerRow, statusFilter === opt && s.pickerRowSel]}
                onPress={() => { setStatusFilter(opt); setShowStatusPicker(false); }}
              >
                <Text style={[s.pickerRowText, statusFilter === opt && s.pickerRowTextSel]}>
                  {opt ? opt.replace(/_/g, ' ') : 'All Statuses'}
                </Text>
                {statusFilter === opt && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Priority picker */}
      <Modal visible={showPriorityPicker} transparent animationType="slide">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowPriorityPicker(false)}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Filter by Priority</Text>
              <TouchableOpacity onPress={() => setShowPriorityPicker(false)}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {priorityOptions.map(opt => (
              <TouchableOpacity
                key={opt || '__all__'}
                style={[s.pickerRow, priorityFilter === opt && s.pickerRowSel]}
                onPress={() => { setPriorityFilter(opt); setShowPriorityPicker(false); }}
              >
                <Text style={[s.pickerRowText, priorityFilter === opt && s.pickerRowTextSel]}>
                  {opt || 'All Priorities'}
                </Text>
                {priorityFilter === opt && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Area picker */}
      <Modal visible={showAreaPicker} transparent animationType="slide">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowAreaPicker(false)}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Filter by Area</Text>
              <TouchableOpacity onPress={() => setShowAreaPicker(false)}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={['', '_none', ...areas]}
              keyExtractor={item => item || '__all__'}
              renderItem={({ item: opt }) => (
                <TouchableOpacity
                  style={[s.pickerRow, areaFilter === opt && s.pickerRowSel]}
                  onPress={() => { setAreaFilter(opt); setShowAreaPicker(false); }}
                >
                  <Text style={[s.pickerRowText, areaFilter === opt && s.pickerRowTextSel]}>
                    {opt === '' ? 'All Areas' : opt === '_none' ? 'No Area' : opt}
                  </Text>
                  {areaFilter === opt && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: c.surface, paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    title: { fontSize: 18, fontWeight: '700', color: c.textPrimary },

    tabRow: {
      flexDirection: 'row', backgroundColor: c.surface,
      paddingHorizontal: 16, paddingVertical: 10, gap: 8,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    tabBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, paddingVertical: 9, borderRadius: 10, backgroundColor: c.gray100,
    },
    tabBtnActive: { backgroundColor: c.primary },
    tabText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    tabTextActive: { color: '#fff' },

    monthPicker: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 16, backgroundColor: c.surface, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    monthLabel: { fontSize: 15, fontWeight: '700', color: c.textPrimary, minWidth: 90, textAlign: 'center' },

    filterRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.surface, paddingHorizontal: 16, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    filterRowText: { flex: 1, fontSize: 14, fontWeight: '600', color: c.textPrimary },

    summaryRow: {
      flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    summaryCard: {
      flex: 1, backgroundColor: c.background, borderRadius: 10,
      padding: 10, alignItems: 'center', borderWidth: 1, borderColor: c.border,
    },
    summaryVal: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    summaryLbl: { fontSize: 9, fontWeight: '600', color: c.textMuted, marginTop: 2, textAlign: 'center' },

    // Hours tab
    hoursCard: {
      backgroundColor: c.surface, marginHorizontal: 12, marginTop: 10,
      borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border,
    },
    hoursCardHeader: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    hoursTaskNum: { fontSize: 11, color: c.textMuted, fontWeight: '600', marginBottom: 2 },
    hoursTaskTitle: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
    hoursTotal: { fontSize: 15, fontWeight: '800' },
    hoursUserRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingVertical: 7, borderTopWidth: 1, borderTopColor: c.border,
    },
    hoursUserName: { fontSize: 13, fontWeight: '600', color: c.textPrimary },
    hoursDateRange: { fontSize: 10, color: c.textMuted, marginTop: 2 },
    hoursUserTime: { fontSize: 13, fontWeight: '700' },
    hoursEntries: { fontSize: 10, color: c.textMuted, marginTop: 1, textAlign: 'right' },
    currentBadge: {
      backgroundColor: 'rgba(16,185,129,0.15)',
      paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6,
    },
    currentBadgeText: { fontSize: 10, fontWeight: '600' },

    grandTotal: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      marginHorizontal: 12, marginTop: 10, marginBottom: 4,
      backgroundColor: c.surface, borderRadius: 10, padding: 14,
      borderWidth: 1, borderColor: c.border,
    },
    grandTotalLabel: { fontSize: 11, fontWeight: '700', color: c.textSecondary, letterSpacing: 0.5 },
    grandTotalValue: { fontSize: 20, fontWeight: '800' },

    // Details tab
    filtersRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 12, paddingVertical: 8,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    filterChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
      backgroundColor: c.gray100, borderWidth: 1, borderColor: c.border,
    },
    filterChipActive: { backgroundColor: c.primaryLight, borderColor: c.primary },
    filterChipText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
    filterChipTextActive: { color: c.primary },

    detailCard: {
      backgroundColor: c.surface, marginHorizontal: 12, marginTop: 10,
      borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border,
    },
    detailTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
    detailNum: { fontSize: 11, color: c.textMuted, fontWeight: '600' },
    detailTitle: { fontSize: 14, fontWeight: '600', color: c.textPrimary, marginBottom: 8 },
    detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginBottom: 4 },
    detailRowText: { fontSize: 12, color: c.textSecondary, flex: 1 },
    prevAssignees: { fontSize: 11, color: c.textMuted, fontStyle: 'italic', flex: 1 },

    detailMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    metaPill: {
      flexDirection: 'row', gap: 4, alignItems: 'center',
      backgroundColor: c.gray50, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
      borderWidth: 1, borderColor: c.border,
    },
    metaPillLabel: { fontSize: 10, fontWeight: '600', color: c.textMuted },
    metaPillVal: { fontSize: 11, fontWeight: '700', color: c.textPrimary },

    checklistRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
    checklistBar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: c.gray100, overflow: 'hidden' },
    checklistFill: { height: '100%', borderRadius: 3 },
    checklistLabel: { fontSize: 10, color: c.textSecondary, fontWeight: '600', minWidth: 52, textAlign: 'right' },

    badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    badgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },

    empty: { alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12 },
    emptyText: { fontSize: 14, color: c.textSecondary, textAlign: 'center' },

    // Modals
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      maxHeight: '60%',
    },
    modalHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 20, paddingVertical: 16,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    modalTitle: { fontSize: 16, fontWeight: '700', color: c.textPrimary },
    pickerRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    pickerRowSel: { backgroundColor: c.primaryLight },
    pickerRowText: { fontSize: 14, color: c.textPrimary, textTransform: 'capitalize' },
    pickerRowTextSel: { fontWeight: '700', color: c.primary },
  });
}
