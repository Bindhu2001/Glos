import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { useApi } from '../../hooks/useApi';
import { useHasTeam } from '../../contexts/HasTeamContext';
import { AppColors } from '../../utils/colors';
import { MoreStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import { showAlert } from '../../components/common/AlertModal';
import ScreenHeader from '../../components/common/ScreenHeader';
import Button from '../../components/common/Button';
import DatePickerField from '../../components/common/DatePickerField';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import MemberPickerModal, { PickOption } from '../../components/common/MemberPickerModal';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'CreateBusinessReview'>;
type Rt = RouteProp<MoreStackParamList, 'CreateBusinessReview'>;

type ReviewType = 'daily' | 'weekly' | 'monthly';
type ScopeType = 'department' | 'project' | 'contract' | 'direct_reportees' | 'entire_team';

const SCOPE_LABELS: Record<ScopeType, string> = {
  department: 'Department',
  project: 'Project',
  contract: 'Contract',
  direct_reportees: 'Direct Reportees',
  entire_team: 'Entire Team',
};

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function computePeriod(type: ReviewType, dateStr: string) {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (type === 'daily') return { start: ymd(d), end: ymd(d) };
  if (type === 'weekly') {
    const day = d.getDay();
    const diffToMon = (day + 6) % 7;
    const mon = new Date(d); mon.setDate(d.getDate() - diffToMon);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { start: ymd(mon), end: ymd(sun) };
  }
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: ymd(first), end: ymd(last) };
}

export default function CreateBusinessReviewScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { appId } = params;
  const { colors } = useTheme();
  const api = useApi();
  const { isAdmin } = useHasTeam();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [type, setType] = useState<ReviewType>('daily');
  const [reviewDate, setReviewDate] = useState(params.date ?? ymd(new Date()));
  const [isOther, setIsOther] = useState(false);
  const [scopeType, setScopeType] = useState<ScopeType>('direct_reportees');
  const [scopeId, setScopeId] = useState<number | null>(null);
  const [managerUserId, setManagerUserId] = useState<number | null>(null);

  const [departments, setDepartments] = useState<PickOption[]>([]);
  const [projects, setProjects] = useState<PickOption[]>([]);
  const [contracts, setContracts] = useState<PickOption[]>([]);
  const [managers, setManagers] = useState<PickOption[]>([]);
  const [scopeModal, setScopeModal] = useState(false);
  const [managerModal, setManagerModal] = useState(false);

  const load = useCallback(async () => {
    setDataLoading(true);
    try {
      const res = await api.businessReviews.scopeOptions(appId);
      setDepartments((res.data?.departments ?? []).map((d: any) => ({ id: d.id, name: d.name })));
      setProjects((res.data?.projects ?? []).map((p: any) => ({ id: p.id, name: p.name })));
      setContracts((res.data?.contracts ?? []).map((c: any) => ({ id: c.id, name: c.name })));
      setManagers((res.data?.managers ?? []).map((m: any) => ({ id: m.id, name: m.name })));
    } catch (err) {
      showAlert('Could not load form data', apiErrorMessage(err));
    } finally {
      setDataLoading(false);
    }
  }, [appId, api]);

  useEffect(() => { load(); }, [load]);

  const scopeOptionsFor = (st: ScopeType): PickOption[] => {
    if (st === 'department') return departments;
    if (st === 'project') return projects;
    if (st === 'contract') return contracts;
    return [];
  };

  const handleSave = async () => {
    if (!reviewDate) return showAlert('Validation', 'Select a review date.');
    if (isOther && scopeType !== 'direct_reportees' && !scopeId) {
      return showAlert('Validation', `Select a ${SCOPE_LABELS[scopeType].toLowerCase()}.`);
    }

    setSaving(true);
    try {
      const period = computePeriod(isOther ? 'monthly' : type, reviewDate);
      const body: Record<string, unknown> = isOther
        ? {
            type: 'other',
            review_date: reviewDate,
            period_start: period.start,
            period_end: period.end,
            scope_type: scopeType,
            scope_id: scopeType === 'direct_reportees' ? undefined : scopeId,
          }
        : {
            type,
            review_date: reviewDate,
            period_start: period.start,
            period_end: period.end,
          };
      if (isAdmin && managerUserId) body.manager_user_id = managerUserId;

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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <View style={[s.container, { paddingTop: insets.top }]}>
        <ScreenHeader
          title="New Business Review"
          showBack
          right={<Button label="Create" onPress={handleSave} loading={saving} style={s.saveBtn} />}
        />
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={s.otherRow}>
            <Text style={s.fieldLabel}>Other Review (custom scope)</Text>
            <Switch value={isOther} onValueChange={setIsOther} trackColor={{ true: colors.primary }} />
          </View>

          {!isOther && (
            <>
              <Text style={s.fieldLabel}>Review Type</Text>
              <View style={s.chipRow}>
                {(['daily', 'weekly', 'monthly'] as ReviewType[]).map((t) => (
                  <TouchableOpacity key={t} style={[s.chip, type === t && s.chipActive]} onPress={() => setType(t)}>
                    <Text style={[s.chipText, type === t && s.chipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <DatePickerField label="Review Date *" value={reviewDate} onChange={setReviewDate} />

          {isOther && (
            <>
              <Text style={s.fieldLabel}>Scope Type</Text>
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
              {scopeType !== 'direct_reportees' && scopeType !== 'entire_team' && (
                <>
                  <Text style={s.fieldLabel}>{SCOPE_LABELS[scopeType]}</Text>
                  <TouchableOpacity style={s.pickerRow} onPress={() => setScopeModal(true)}>
                    <Ionicons name="layers-outline" size={16} color={colors.gray400} />
                    <Text style={scopeId ? s.pickerValue : s.pickerPlaceholder}>
                      {scopeId ? scopeOptionsFor(scopeType).find((o) => o.id === scopeId)?.name ?? 'Selected' : `Tap to select a ${SCOPE_LABELS[scopeType].toLowerCase()}`}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.gray400} style={{ marginLeft: 'auto' }} />
                  </TouchableOpacity>
                </>
              )}
            </>
          )}

          {isAdmin && (
            <>
              <Text style={s.fieldLabel}>Create On Behalf Of (optional)</Text>
              <TouchableOpacity style={s.pickerRow} onPress={() => setManagerModal(true)}>
                <Ionicons name="person-outline" size={16} color={colors.gray400} />
                <Text style={managerUserId ? s.pickerValue : s.pickerPlaceholder}>
                  {managerUserId ? managers.find((m) => m.id === managerUserId)?.name ?? 'Selected' : 'Myself'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.gray400} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>

      <MemberPickerModal
        visible={scopeModal}
        title={SCOPE_LABELS[scopeType]}
        options={scopeOptionsFor(scopeType)}
        selected={scopeId ? [scopeId] : []}
        onChange={(ids) => setScopeId(ids[0] ?? null)}
        onClose={() => setScopeModal(false)}
      />
      <MemberPickerModal
        visible={managerModal}
        title="Select Manager"
        options={managers}
        selected={managerUserId ? [managerUserId] : []}
        onChange={(ids) => setManagerUserId(ids[0] ?? null)}
        onClose={() => setManagerModal(false)}
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
    otherRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface },
    chipActive: { backgroundColor: c.primaryLight, borderColor: c.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: c.gray500, textTransform: 'capitalize' },
    chipTextActive: { color: c.primary },
    pickerRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.gray50, borderRadius: 10, padding: 12,
      borderWidth: 1, borderColor: c.border, marginBottom: 16,
    },
    pickerValue: { fontSize: 14, color: c.textPrimary, fontWeight: '500', flex: 1 },
    pickerPlaceholder: { fontSize: 14, color: c.gray400, flex: 1 },
  });
}
