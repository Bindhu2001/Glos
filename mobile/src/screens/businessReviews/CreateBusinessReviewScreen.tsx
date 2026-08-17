import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { MoreStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import { showAlert } from '../../components/common/AlertModal';
import ScreenHeader from '../../components/common/ScreenHeader';
import Button from '../../components/common/Button';
import DatePickerField from '../../components/common/DatePickerField';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import LoadError from '../../components/common/LoadError';
import MemberPickerModal, { PickOption } from '../../components/common/MemberPickerModal';
import { formatDate } from '../../utils/format';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'CreateBusinessReview'>;
type Rt = RouteProp<MoreStackParamList, 'CreateBusinessReview'>;

type ReviewKind = 'daily' | 'other';
type SubType = 'weekly' | 'monthly';
type ScopeType = 'department' | 'project' | 'contract' | 'direct_reportees' | 'entire_team';

// Matches web's CreateReviewModal (BusinessReviewHub.jsx) exactly: a review is
// either a plain Daily Check-In (just a date), or an "Other" review which is
// always Weekly or Monthly AND always has an explicit scope — there is no
// scope-less weekly/monthly review on web. "Direct Reportees" is simply the
// "just my own team" scope choice, not a fallback for skipping scope entirely.
const SCOPE_LABELS: Record<ScopeType, string> = {
  department: 'Department',
  project: 'Project',
  contract: 'Agreement',
  direct_reportees: 'Direct Reportees',
  entire_team: 'Entire Team (by Manager)',
};
const SCOPE_HINTS: Record<ScopeType, string> = {
  department: '',
  project: '',
  contract: '',
  direct_reportees: 'Will include your direct reportees only.',
  entire_team: "Will include the selected manager's full reporting hierarchy (all levels).",
};
const SCOPE_PICKER_LABEL: Record<ScopeType, string> = {
  department: 'Select Department',
  project: 'Select Project',
  contract: 'Select Agreement',
  direct_reportees: '',
  entire_team: 'Select Manager (reviews their full hierarchy)',
};

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function snapToMonday(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  date.setDate(date.getDate() - ((day + 6) % 7));
  return ymd(date);
}
function addDays(dateStr: string, n: number) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
}
function computePeriod(kind: ReviewKind, subType: SubType, dailyDate: string, weekStart: string, monthAnchor: string) {
  if (kind === 'daily') return { start: dailyDate, end: dailyDate };
  if (subType === 'weekly') return { start: weekStart, end: addDays(weekStart, 6) };
  const [y, m] = monthAnchor.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  return { start: ymd(first), end: ymd(last) };
}

export default function CreateBusinessReviewScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { appId } = params;
  const { colors } = useTheme();
  const api = useApi();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const todayStr = useMemo(() => ymd(new Date()), []);
  const [kind, setKind] = useState<ReviewKind>('daily');
  const [dailyDate, setDailyDate] = useState(params.date ?? todayStr);
  const [subType, setSubType] = useState<SubType>('weekly');
  const [weekStart, setWeekStart] = useState(() => snapToMonday(params.date ?? todayStr));
  const [monthAnchor, setMonthAnchor] = useState(params.date ?? todayStr);

  const [scopeType, setScopeType] = useState<ScopeType | ''>('');
  const [scopeId, setScopeId] = useState<number | null>(null);

  const [departments, setDepartments] = useState<PickOption[]>([]);
  const [projects, setProjects] = useState<PickOption[]>([]);
  const [contracts, setContracts] = useState<PickOption[]>([]);
  const [managers, setManagers] = useState<PickOption[]>([]);
  const [scopeModal, setScopeModal] = useState(false);

  const load = useCallback(async () => {
    setDataLoading(true);
    setLoadError(false);
    try {
      const res = await api.businessReviews.scopeOptions(appId);
      setDepartments((res.data?.departments ?? []).map((d: any) => ({ id: d.id, name: d.name })));
      setProjects((res.data?.projects ?? []).map((p: any) => ({ id: p.id, name: p.name })));
      setContracts((res.data?.contracts ?? []).map((c: any) => ({ id: c.id, name: c.name })));
      setManagers((res.data?.managers ?? []).map((m: any) => ({ id: m.id, name: m.name })));
    } catch (err) {
      showAlert('Could not load form data', apiErrorMessage(err));
      setLoadError(true);
    } finally {
      setDataLoading(false);
    }
  }, [appId, api]);

  useEffect(() => { load(); }, [load]);

  // Matches web's scopeItemOptions() — 'entire_team' picks a manager (whose
  // full hierarchy gets reviewed), not a plain flat list of team members.
  const scopeOptionsFor = (st: ScopeType): PickOption[] => {
    if (st === 'department') return departments;
    if (st === 'project') return projects;
    if (st === 'contract') return contracts;
    if (st === 'entire_team') return managers;
    return [];
  };

  const period = computePeriod(kind, subType, dailyDate, weekStart, monthAnchor);
  const canSubmit = kind === 'daily' ? true : (!!scopeType && (scopeType === 'direct_reportees' || !!scopeId));

  const handleSave = async () => {
    if (!canSubmit) {
      showAlert('Validation', scopeType ? `Select a ${SCOPE_LABELS[scopeType as ScopeType].toLowerCase()}.` : 'Choose a review scope.');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = kind === 'daily'
        ? { type: 'daily', review_date: period.start, period_start: period.start, period_end: period.end }
        : {
            type: subType,
            review_date: period.start,
            period_start: period.start,
            period_end: period.end,
            scope_type: scopeType,
            scope_id: scopeType === 'direct_reportees' ? undefined : scopeId,
          };
      await api.businessReviews.create(appId, body);
      navigation.goBack();
    } catch (err: any) {
      if (err?.response?.data?.error === 'duplicate_review') {
        showAlert('Review already exists', err.response.data.message ?? 'A review already exists for this period.');
      } else {
        showAlert('Could not create review', apiErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  };

  if (dataLoading) return <LoadingSpinner />;
  if (loadError) return <LoadError onRetry={load} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.container, { paddingTop: insets.top }]}>
        <ScreenHeader
          title="New Business Review"
          showBack
          right={<Button label="Create" onPress={handleSave} loading={saving} disabled={!canSubmit} style={s.saveBtn} />}
        />
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.fieldLabel}>Review Type</Text>
          <View style={s.chipRow}>
            <TouchableOpacity style={[s.chip, kind === 'daily' && s.chipActive]} onPress={() => setKind('daily')}>
              <Ionicons name="today-outline" size={14} color={kind === 'daily' ? colors.primary : colors.gray500} />
              <Text style={[s.chipText, kind === 'daily' && s.chipTextActive]}>Daily Check-In</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.chip, kind === 'other' && s.chipActive]} onPress={() => setKind('other')}>
              <Ionicons name="calendar-outline" size={14} color={kind === 'other' ? colors.primary : colors.gray500} />
              <Text style={[s.chipText, kind === 'other' && s.chipTextActive]}>Other Review (Weekly / Monthly)</Text>
            </TouchableOpacity>
          </View>

          {kind === 'daily' ? (
            <DatePickerField label="Review Date *" value={dailyDate} onChange={setDailyDate} />
          ) : (
            <>
              <Text style={s.fieldLabel}>Period Type</Text>
              <View style={s.chipRow}>
                <TouchableOpacity style={[s.chip, subType === 'weekly' && s.chipActive]} onPress={() => setSubType('weekly')}>
                  <Text style={[s.chipText, subType === 'weekly' && s.chipTextActive]}>Weekly (Mon – Sun)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.chip, subType === 'monthly' && s.chipActive]} onPress={() => setSubType('monthly')}>
                  <Text style={[s.chipText, subType === 'monthly' && s.chipTextActive]}>Monthly</Text>
                </TouchableOpacity>
              </View>

              {subType === 'weekly' ? (
                <>
                  <DatePickerField label="Pick any day in the week" value={weekStart} onChange={(v) => setWeekStart(snapToMonday(v))} />
                  <Text style={s.hint}>Auto-snaps to Monday of the selected week</Text>
                </>
              ) : (
                <DatePickerField label="Pick any day in the month" value={monthAnchor} onChange={setMonthAnchor} />
              )}

              <View style={s.scopeSection}>
                <Text style={s.scopeSectionTitle}>REVIEW SCOPE</Text>
                <View style={s.chipRow}>
                  {(Object.keys(SCOPE_LABELS) as ScopeType[]).map((st) => (
                    <TouchableOpacity
                      key={st}
                      style={[s.chip, scopeType === st && s.chipActive]}
                      onPress={() => { setScopeType(st); setScopeId(null); }}
                    >
                      <Text style={[s.chipText, scopeType === st && s.chipTextActive]}>{SCOPE_LABELS[st]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {!!scopeType && scopeType !== 'direct_reportees' && (
                  <TouchableOpacity style={s.pickerRow} onPress={() => setScopeModal(true)}>
                    <Ionicons name="layers-outline" size={16} color={colors.gray400} />
                    <Text style={scopeId ? s.pickerValue : s.pickerPlaceholder}>
                      {scopeId
                        ? scopeOptionsFor(scopeType as ScopeType).find((o) => o.id === scopeId)?.name ?? 'Selected'
                        : SCOPE_PICKER_LABEL[scopeType as ScopeType]}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.gray400} style={{ marginLeft: 'auto' }} />
                  </TouchableOpacity>
                )}

                {!!scopeType && SCOPE_HINTS[scopeType as ScopeType] ? (
                  <Text style={s.hint}>{SCOPE_HINTS[scopeType as ScopeType]}</Text>
                ) : !scopeType ? (
                  <Text style={s.hint}>Choose who this review covers: a department, project, agreement, your direct reportees, or a manager's full hierarchy.</Text>
                ) : null}
              </View>
            </>
          )}

          <View style={s.periodHint}>
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
            <Text style={s.periodHintText}>Period: {formatDate(period.start)} – {formatDate(period.end)}</Text>
          </View>
        </ScrollView>
      </View>

      <MemberPickerModal
        visible={scopeModal}
        title={scopeType ? SCOPE_LABELS[scopeType as ScopeType] : ''}
        options={scopeType ? scopeOptionsFor(scopeType as ScopeType) : []}
        selected={scopeId ? [scopeId] : []}
        onChange={(ids) => setScopeId(ids[0] ?? null)}
        onClose={() => setScopeModal(false)}
      />
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 16, paddingBottom: 40 },
    saveBtn: { paddingVertical: 8, paddingHorizontal: 16 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: c.gray700, marginBottom: 8, marginTop: 4 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
      borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface,
    },
    chipActive: { backgroundColor: c.primaryLight, borderColor: c.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: c.gray500 },
    chipTextActive: { color: c.primary },
    hint: { fontSize: 12, color: c.textMuted, marginTop: -8, marginBottom: 16, lineHeight: 17 },
    scopeSection: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12, marginBottom: 4 },
    scopeSectionTitle: { fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 0.5, marginBottom: 10 },
    pickerRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.gray50, borderRadius: 10, padding: 12,
      borderWidth: 1, borderColor: c.border, marginBottom: 8,
    },
    pickerValue: { fontSize: 14, color: c.textPrimary, fontWeight: '500', flex: 1 },
    pickerPlaceholder: { fontSize: 14, color: c.gray400, flex: 1 },
    periodHint: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: c.gray50, borderRadius: 10, padding: 12, marginTop: 8,
    },
    periodHintText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
  });
}
