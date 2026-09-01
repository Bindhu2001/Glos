import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList, Platform, ActivityIndicator,
  RefreshControl, TextInput, Modal, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { MoreStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import LoadError from '../../components/common/LoadError';
import { showAlert } from '../../components/common/AlertModal';
import DatePickerField from '../../components/common/DatePickerField';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'ComplianceTasks'>;

// Matches web's ComplianceTasks.jsx exactly — a different (smaller) status
// set than ComplianceBoardScreen's, since that screen edits progress on a
// specific month's service while this one only schedules/reassigns tasks.
const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On Hold' },
];
const CHECK_OPTIONS = [
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

function statusMeta(s?: string | null) {
  switch (s) {
    case 'completed': return { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: 'Completed' };
    case 'in_progress': return { bg: 'rgba(37,99,235,0.15)', color: '#2563eb', label: 'In Progress' };
    case 'on_hold': return { bg: 'rgba(107,114,128,0.15)', color: '#6b7280', label: 'On Hold' };
    case 'delayed': return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: 'Delayed' };
    default: return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'Pending' };
  }
}
function checkMeta(s?: string | null) {
  switch (s) {
    case 'approved': return { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: 'Approved' };
    case 'rejected': return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: 'Rejected' };
    case 'pending_review': return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'Pending Review' };
    default: return null;
  }
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const MONTH_NAMES_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtPeriod(month?: number | string | null, year?: number | string | null) {
  const m = Number(month);
  if (!m) return '—';
  const name = m >= 1 && m <= 12 ? MONTH_NAMES_SHORT[m - 1] : `M${m}`;
  return year ? `${name} ${year}` : name;
}

// 24 months back + 3 months ahead, newest first — matches web's buildMonthOptions().
function buildMonthOptions() {
  const now = new Date();
  const options: { value: string; label: string; month: number; year: number }[] = [];
  const start = new Date(2025, 7, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 3, 1);
  for (const d = new Date(end); d >= start; d.setMonth(d.getMonth() - 1)) {
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    options.push({ value: `${m}-${y}`, label: `${MONTH_NAMES_FULL[m - 1]} ${y}`, month: m, year: y });
  }
  return options;
}
const MONTH_OPTIONS = buildMonthOptions();
const NOW = new Date();
const DEFAULT_PERIOD = `${NOW.getMonth() + 1}-${NOW.getFullYear()}`;

interface EmptyForm {
  title: string;
  agreement_id: number | null;
  agreement_service_id: number | null;
  due_date: string;
  assigned_user_id: number | null;
  service_month: string;
  remarks: string;
}
const EMPTY_FORM: EmptyForm = {
  title: '', agreement_id: null, agreement_service_id: null,
  due_date: '', assigned_user_id: null, service_month: DEFAULT_PERIOD, remarks: '',
};

export default function ComplianceTasksScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [tasks, setTasks] = useState<any[]>([]);
  const [agreements, setAgreements] = useState<any[]>([]);
  const [members, setMembers] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [checkFilter, setCheckFilter] = useState('');
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [checkPickerOpen, setCheckPickerOpen] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [updateTarget, setUpdateTarget] = useState<any>(null);
  const [logsTarget, setLogsTarget] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!workspace?.id) return;
    if (!isRefresh) setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      if (checkFilter) params.check_status = checkFilter;
      const [taskRes, agRes, memRes] = await Promise.all([
        api.contracts.listContractTasks(workspace.id, params),
        api.contracts.listAgreements(workspace.id, {}),
        api.workspace.getMembers(workspace.id).catch(() => ({ data: {} })),
      ]);
      setTasks(taskRes.data ?? []);
      setAgreements(agRes.data ?? []);
      const memberRows: any[] = memRes.data?.members ?? memRes.data?.items ?? memRes.data ?? [];
      setMembers(memberRows.map((m: any) => ({
        id: m.user_id ?? m.id,
        name: `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email || 'Member',
      })));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load compliance tasks.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspace?.id, search, statusFilter, checkFilter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openLogs = async (t: any) => {
    setLogsTarget(t);
    setLogsLoading(true);
    setLogs([]);
    if (!workspace?.id) return;
    try {
      const res = await api.contracts.getContractTaskLogs(workspace.id, t.id);
      setLogs(res.data ?? []);
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const pendingTasks = tasks.filter((t) => t.status === 'pending').length;
  const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const pctColor = pct === 100 ? '#10b981' : pct >= 60 ? colors.primary : pct >= 30 ? '#d69e2e' : '#ef4444';

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Compliance Tasks</Text>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => setCreateOpen(true)}
        >
          <Ionicons name="add" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* KPI strip */}
      <View style={s.kpiRow}>
        <View style={[s.kpiTile, { backgroundColor: pctColor }]}>
          <Text style={[s.kpiValue, { color: '#fff' }]}>{pct}%</Text>
          <Text style={[s.kpiLabel, { color: 'rgba(255,255,255,0.85)' }]}>Completion</Text>
        </View>
        <View style={s.kpiTile}>
          <Text style={s.kpiValue}>{totalTasks}</Text>
          <Text style={s.kpiLabel}>Total</Text>
        </View>
        <View style={s.kpiTile}>
          <Text style={s.kpiValue}>{completedTasks}</Text>
          <Text style={s.kpiLabel}>Completed</Text>
        </View>
        <View style={s.kpiTile}>
          <Text style={s.kpiValue}>{pendingTasks}</Text>
          <Text style={s.kpiLabel}>Pending</Text>
        </View>
      </View>

      <View style={s.searchBar}>
        <Ionicons name="search-outline" size={16} color={colors.gray400} />
        <TextInput
          style={s.searchInput}
          placeholder="Search task number or name…"
          placeholderTextColor={colors.gray400}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => load()}
          returnKeyType="search"
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.gray400} />
          </TouchableOpacity>
        )}
      </View>

      <View style={s.filterRow}>
        <TouchableOpacity style={s.filterBtn} onPress={() => setStatusPickerOpen(true)}>
          <Text style={s.filterBtnTxt} numberOfLines={1}>
            {statusFilter ? STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label : 'All Statuses'}
          </Text>
          <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={s.filterBtn} onPress={() => setCheckPickerOpen(true)}>
          <Text style={s.filterBtnTxt} numberOfLines={1}>
            {checkFilter ? CHECK_OPTIONS.find((o) => o.value === checkFilter)?.label : 'All Reviews'}
          </Text>
          <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : error ? (
        <LoadError message={error} onRetry={() => load()} />
      ) : (
        <ScrollView
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
        >
          {tasks.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="shield-checkmark-outline" size={40} color={colors.gray400} />
              <Text style={s.emptyText}>No tasks found</Text>
              <Text style={s.emptySub}>Create compliance tasks to track deliverables.</Text>
            </View>
          ) : (
            tasks.map((t) => {
              const st = statusMeta(t.status);
              const ck = checkMeta(t.check_status);
              return (
                <TouchableOpacity key={t.id} style={s.card} activeOpacity={0.7} onPress={() => setUpdateTarget(t)}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle} numberOfLines={2}>{t.title || t.task_number}</Text>
                    <Text style={s.cardSub} numberOfLines={1}>
                      {t.agreement_name || t.agreement_number || '—'} · {t.client_name || '—'}
                    </Text>
                    <Text style={s.cardSub} numberOfLines={1}>{t.service_name || t.service_code || '—'}</Text>
                    <View style={s.metaRow}>
                      <Text style={s.metaText}>Due {fmtDate(t.due_date)}</Text>
                      <Text style={s.metaDot}>·</Text>
                      <Text style={s.metaText}>{fmtPeriod(t.service_month, t.service_year)}</Text>
                    </View>
                    <View style={s.badgeRow}>
                      <View style={[s.badge, { backgroundColor: st.bg }]}>
                        <Text style={[s.badgeText, { color: st.color }]}>{st.label}</Text>
                      </View>
                      {ck && (
                        <View style={[s.badge, { backgroundColor: ck.bg }]}>
                          <Text style={[s.badgeText, { color: ck.color }]}>{ck.label}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity onPress={(e) => { e.stopPropagation(); openLogs(t); }} hitSlop={8} style={s.historyBtn}>
                    <Ionicons name="time-outline" size={18} color={colors.gray400} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {createOpen && (
        <TaskFormModal
          mode="create"
          agreements={agreements}
          members={members}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); load(); }}
        />
      )}

      {updateTarget && (
        <TaskFormModal
          mode="update"
          task={updateTarget}
          agreements={agreements}
          members={members}
          onClose={() => setUpdateTarget(null)}
          onSaved={() => { setUpdateTarget(null); load(); }}
          onViewHistory={() => { openLogs(updateTarget); }}
        />
      )}

      {logsTarget && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setLogsTarget(null)}>
          <View style={s.modalOverlay}>
            <View style={[s.modalCard, { paddingBottom: 16 + insets.bottom }]}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle} numberOfLines={1}>Audit Log — {logsTarget.task_number}</Text>
                <TouchableOpacity onPress={() => setLogsTarget(null)} hitSlop={8}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={s.modalBody}>
                {logsLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
                ) : logs.length === 0 ? (
                  <View style={s.empty}>
                    <Ionicons name="time-outline" size={32} color={colors.gray400} />
                    <Text style={s.emptyText}>No history yet</Text>
                  </View>
                ) : (
                  logs.map((l, i) => {
                    const lst = statusMeta(l.status);
                    const lck = l.log_type === 'check' ? checkMeta(l.check_status || 'approved') : null;
                    return (
                      <View key={l.id} style={s.logRow}>
                        <View style={s.logDotCol}>
                          <View style={[s.logDot, { backgroundColor: i === 0 ? colors.primary : colors.border }]} />
                          {i < logs.length - 1 && <View style={s.logLine} />}
                        </View>
                        <View style={{ flex: 1, paddingBottom: 14 }}>
                          <View style={s.badgeRow}>
                            <View style={[s.badge, { backgroundColor: lst.bg }]}>
                              <Text style={[s.badgeText, { color: lst.color }]}>{lst.label}</Text>
                            </View>
                            {lck && (
                              <View style={[s.badge, { backgroundColor: lck.bg }]}>
                                <Text style={[s.badgeText, { color: lck.color }]}>{lck.label}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={s.logBy}>
                            by <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{l.updated_by_name}</Text>
                            <Text style={s.logDate}>  ·  {fmtDate(l.created_at)}</Text>
                          </Text>
                          {!!l.remarks && <Text style={s.logRemarks}>"{l.remarks}"</Text>}
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      <PickerModal
        visible={statusPickerOpen}
        title="Status"
        options={[{ value: '', label: 'All Statuses' }, ...STATUS_OPTIONS]}
        selected={statusFilter}
        onSelect={(v) => { setStatusFilter(v); setStatusPickerOpen(false); }}
        onClose={() => setStatusPickerOpen(false)}
        s={s}
        colors={colors}
      />
      <PickerModal
        visible={checkPickerOpen}
        title="Review"
        options={[{ value: '', label: 'All Reviews' }, ...CHECK_OPTIONS]}
        selected={checkFilter}
        onSelect={(v) => { setCheckFilter(v); setCheckPickerOpen(false); }}
        onClose={() => setCheckPickerOpen(false)}
        s={s}
        colors={colors}
      />
    </View>
  );
}

function PickerModal({ visible, title, options, selected, onSelect, onClose, s, colors }: {
  visible: boolean; title: string; options: { value: string; label: string }[]; selected: string;
  onSelect: (v: string) => void; onClose: () => void; s: ReturnType<typeof makeStyles>; colors: AppColors;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.pickerBackdrop} activeOpacity={1} onPress={onClose}>
        <View style={s.pickerCard}>
          <Text style={s.pickerCardTitle}>{title}</Text>
          <FlatList
            data={options}
            keyExtractor={(o) => o.value}
            style={{ maxHeight: 340 }}
            renderItem={({ item }) => {
              const active = item.value === selected;
              return (
                <TouchableOpacity style={[s.pickerOption, active && s.pickerOptionActive]} onPress={() => onSelect(item.value)}>
                  <Text style={[s.pickerOptionTxt, active && s.pickerOptionTxtActive]}>{item.label}</Text>
                  {active && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function TaskFormModal({
  mode, task, agreements, members, onClose, onSaved, onViewHistory,
}: {
  mode: 'create' | 'update'; task?: any; agreements: any[]; members: { id: number; name: string }[];
  onClose: () => void; onSaved: () => void; onViewHistory?: () => void;
}) {
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [form, setForm] = useState<EmptyForm>(() => mode === 'update' && task ? {
    title: task.title || '',
    agreement_id: task.agreement_id ?? null,
    agreement_service_id: task.agreement_service_id ?? null,
    due_date: task.due_date ? String(task.due_date).slice(0, 10) : '',
    assigned_user_id: task.assigned_user_id ?? null,
    service_month: task.service_month && task.service_year ? `${task.service_month}-${task.service_year}` : DEFAULT_PERIOD,
    remarks: task.remarks || '',
  } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [agPickerOpen, setAgPickerOpen] = useState(false);
  const [svcPickerOpen, setSvcPickerOpen] = useState(false);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  const selectedAgreement = agreements.find((a) => a.id === form.agreement_id);
  const services: any[] = selectedAgreement?.services ?? [];
  const selectedService = services.find((sv) => sv.id === form.agreement_service_id);
  const selectedAssignee = members.find((m) => m.id === form.assigned_user_id);
  const selectedMonth = MONTH_OPTIONS.find((o) => o.value === form.service_month);

  const handleSave = async () => {
    if (!workspace?.id) return;
    if (!form.agreement_id) return setErr('Agreement is required');
    if (!form.agreement_service_id) return setErr('Service line is required');
    if (!form.due_date) return setErr('Due date is required');
    if (mode === 'create' && !form.assigned_user_id) return setErr('Assignee is required');
    setErr(null);
    setSaving(true);
    try {
      const [month, year] = form.service_month.split('-');
      const body = {
        title: form.title.trim() || null,
        agreement_id: form.agreement_id,
        agreement_service_id: form.agreement_service_id,
        due_date: form.due_date,
        assigned_user_id: form.assigned_user_id,
        service_month: month ? Number(month) : null,
        service_year: year ? Number(year) : null,
        remarks: form.remarks.trim() || null,
      };
      if (mode === 'create') {
        await api.contracts.createContractTask(workspace.id, body);
      } else {
        await api.contracts.updateContractTask(workspace.id, task.id, body);
      }
      onSaved();
    } catch (e) {
      showAlert('Could Not Save', apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[s.modalCard, { paddingBottom: 16 + insets.bottom }]}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle} numberOfLines={1}>
              {mode === 'create' ? 'Add Compliance Task' : `Update: ${task?.task_number ?? ''}`}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>Task Name</Text>
            <TextInput
              style={s.input}
              value={form.title}
              onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
              placeholder="e.g. File GST Return – June 2026"
              placeholderTextColor={colors.gray400}
              maxLength={200}
            />

            <Text style={s.fieldLabel}>Agreement *</Text>
            <TouchableOpacity style={s.pickerTrigger} onPress={() => setAgPickerOpen(true)}>
              <Text style={[s.pickerTriggerTxt, !selectedAgreement && s.placeholderTxt]} numberOfLines={1}>
                {selectedAgreement
                  ? [selectedAgreement.agreement_number, selectedAgreement.client?.client_name, selectedAgreement.agreement_name].filter(Boolean).join(' — ')
                  : 'Select agreement'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.gray400} />
            </TouchableOpacity>

            <Text style={s.fieldLabel}>Service Line *</Text>
            <TouchableOpacity
              style={[s.pickerTrigger, !services.length && s.pickerTriggerDisabled]}
              onPress={() => services.length && setSvcPickerOpen(true)}
              disabled={!services.length}
            >
              <Text style={[s.pickerTriggerTxt, !selectedService && s.placeholderTxt]} numberOfLines={1}>
                {selectedService ? (selectedService.service_name || selectedService.service_code) : 'Select service'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.gray400} />
            </TouchableOpacity>

            <Text style={s.fieldLabel}>Due Date *</Text>
            <DatePickerField
              value={form.due_date}
              onChange={(v) => setForm((f) => ({ ...f, due_date: v }))}
              placeholder="Select due date"
              containerStyle={{ marginBottom: 0 }}
            />

            <Text style={[s.fieldLabel, { marginTop: 16 }]}>Assigned To {mode === 'create' ? '*' : ''}</Text>
            <TouchableOpacity style={s.pickerTrigger} onPress={() => setAssigneePickerOpen(true)}>
              <Text style={[s.pickerTriggerTxt, !selectedAssignee && s.placeholderTxt]} numberOfLines={1}>
                {selectedAssignee?.name ?? 'Select member'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.gray400} />
            </TouchableOpacity>

            <Text style={s.fieldLabel}>Service Month</Text>
            <TouchableOpacity style={s.pickerTrigger} onPress={() => setMonthPickerOpen(true)}>
              <Text style={s.pickerTriggerTxt} numberOfLines={1}>{selectedMonth?.label ?? 'Select month'}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.gray400} />
            </TouchableOpacity>

            <Text style={s.fieldLabel}>Remarks</Text>
            <TextInput
              style={[s.input, s.inputMulti]}
              value={form.remarks}
              onChangeText={(v) => setForm((f) => ({ ...f, remarks: v }))}
              placeholder="Notes..."
              placeholderTextColor={colors.gray400}
              multiline
              numberOfLines={3}
              maxLength={1000}
            />

            {err && <Text style={s.errText}>{err}</Text>}

            <TouchableOpacity style={[s.submitBtn, saving && s.submitBtnDisabled]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.submitBtnText}>{mode === 'create' ? 'Create Task' : 'Save Changes'}</Text>}
            </TouchableOpacity>

            {mode === 'update' && (
              <>
                {checkMeta(task?.check_status) && (
                  <View style={[s.badge, { alignSelf: 'flex-start', marginTop: 14, backgroundColor: checkMeta(task?.check_status)!.bg }]}>
                    <Text style={[s.badgeText, { color: checkMeta(task?.check_status)!.color }]}>{checkMeta(task?.check_status)!.label}</Text>
                  </View>
                )}
                {!!task?.check_remarks && (
                  <View style={s.pastReview}>
                    <Text style={s.fieldLabel}>Last Review Comment</Text>
                    <Text style={s.pastReviewText}>{task.check_remarks}</Text>
                  </View>
                )}
                <TouchableOpacity style={s.historyLink} onPress={onViewHistory}>
                  <Ionicons name="time-outline" size={14} color={colors.primary} />
                  <Text style={s.historyLinkTxt}>View Audit Log</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <PickerModal
        visible={agPickerOpen}
        title="Select Agreement"
        options={agreements.map((a) => ({
          value: String(a.id),
          label: [a.agreement_number, a.client?.client_name, a.agreement_name].filter(Boolean).join(' — '),
        }))}
        selected={String(form.agreement_id ?? '')}
        onSelect={(v) => { setForm((f) => ({ ...f, agreement_id: Number(v), agreement_service_id: null })); setAgPickerOpen(false); }}
        onClose={() => setAgPickerOpen(false)}
        s={s}
        colors={colors}
      />
      <PickerModal
        visible={svcPickerOpen}
        title="Select Service"
        options={services.map((sv) => ({ value: String(sv.id), label: sv.service_name || sv.service_code || String(sv.id) }))}
        selected={String(form.agreement_service_id ?? '')}
        onSelect={(v) => { setForm((f) => ({ ...f, agreement_service_id: Number(v) })); setSvcPickerOpen(false); }}
        onClose={() => setSvcPickerOpen(false)}
        s={s}
        colors={colors}
      />
      <PickerModal
        visible={assigneePickerOpen}
        title="Assign To"
        options={members.map((m) => ({ value: String(m.id), label: m.name }))}
        selected={String(form.assigned_user_id ?? '')}
        onSelect={(v) => { setForm((f) => ({ ...f, assigned_user_id: Number(v) })); setAssigneePickerOpen(false); }}
        onClose={() => setAssigneePickerOpen(false)}
        s={s}
        colors={colors}
      />
      <PickerModal
        visible={monthPickerOpen}
        title="Service Month"
        options={MONTH_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        selected={form.service_month}
        onSelect={(v) => { setForm((f) => ({ ...f, service_month: v })); setMonthPickerOpen(false); }}
        onClose={() => setMonthPickerOpen(false)}
        s={s}
        colors={colors}
      />
    </Modal>
  );
}

function makeStyles(c: AppColors) {
  const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 20, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700' },

    kpiRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 14 },
    kpiTile: {
      flex: 1, backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      paddingVertical: 10, alignItems: 'center', gap: 2,
    },
    kpiValue: { fontSize: 17, fontWeight: '800', color: c.textPrimary },
    kpiLabel: { fontSize: 10, fontWeight: '600', color: c.textMuted, textTransform: 'uppercase' },

    searchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.gray50, marginHorizontal: 16, marginTop: 12,
      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
      borderWidth: 1.5, borderColor: c.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: c.textPrimary },

    filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 10 },
    filterBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1,
      backgroundColor: c.gray50, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'space-between',
    },
    filterBtnTxt: { fontSize: 12, fontWeight: '600', color: c.textSecondary, flexShrink: 1 },

    list: { padding: 16, gap: 10 },
    empty: { alignItems: 'center', gap: 6, paddingTop: 60 },
    emptyText: { fontSize: 14, fontWeight: '600', color: c.textMuted },
    emptySub: { fontSize: 12, color: c.textMuted, textAlign: 'center' },

    card: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      backgroundColor: c.surface, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: c.border,
    },
    cardTitle: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    cardSub: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    metaText: { fontSize: 11, color: c.textMuted },
    metaDot: { fontSize: 11, color: c.textMuted },
    badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    badgeText: { fontSize: 10.5, fontWeight: '700' },
    historyBtn: { padding: 4 },

    // Picker (filter/select) modal
    pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
    pickerCard: { backgroundColor: c.surface, borderRadius: 14, padding: 12, maxHeight: 420 },
    pickerCardTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary, marginBottom: 8, paddingHorizontal: 6 },
    pickerOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8 },
    pickerOptionActive: { backgroundColor: c.primaryLight },
    pickerOptionTxt: { fontSize: 14, color: c.textPrimary, flex: 1 },
    pickerOptionTxtActive: { color: c.primary, fontWeight: '700' },

    // Form modal (create/update)
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%' },
    modalHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    modalTitle: { fontSize: 16, fontWeight: '700', color: c.textPrimary, flex: 1, marginRight: 10 },
    modalBody: { padding: 18 },
    fieldLabel: { fontSize: 12, fontWeight: '700', color: c.textSecondary, marginBottom: 6, marginTop: 4 },
    input: {
      fontSize: 14, color: c.textPrimary, backgroundColor: c.gray50, borderRadius: 10,
      borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 10,
    },
    inputMulti: { minHeight: 70, textAlignVertical: 'top' },
    pickerTrigger: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.gray50, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 12, paddingVertical: 12,
    },
    pickerTriggerDisabled: { opacity: 0.5 },
    pickerTriggerTxt: { fontSize: 14, color: c.textPrimary, flex: 1, marginRight: 8 },
    placeholderTxt: { color: c.gray400 },
    errText: { fontSize: 12, color: c.danger, marginTop: 10 },
    submitBtn: {
      backgroundColor: c.primary, borderRadius: 12, paddingVertical: 13,
      alignItems: 'center', justifyContent: 'center', marginTop: 18,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    pastReview: { marginTop: 16, backgroundColor: c.gray50, borderRadius: 10, padding: 12 },
    pastReviewText: { fontSize: 13, color: c.textSecondary, fontStyle: 'italic', marginTop: 2 },
    historyLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, alignSelf: 'center', padding: 6 },
    historyLinkTxt: { fontSize: 13, fontWeight: '700', color: c.primary },

    // Audit log
    logRow: { flexDirection: 'row', gap: 12 },
    logDotCol: { alignItems: 'center', width: 10 },
    logDot: { width: 8, height: 8, borderRadius: 4 },
    logLine: { width: 1, flex: 1, backgroundColor: c.border, marginTop: 4 },
    logBy: { fontSize: 12, color: c.textSecondary, marginTop: 4 },
    logDate: { fontSize: 11, color: c.textMuted },
    logRemarks: { fontSize: 12, color: c.textSecondary, fontStyle: 'italic', marginTop: 4 },
  });
}
