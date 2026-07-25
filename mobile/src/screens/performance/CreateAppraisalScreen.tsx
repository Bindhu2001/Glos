import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { PerformanceStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import { showAlert } from '../../components/common/AlertModal';
import ScreenHeader from '../../components/common/ScreenHeader';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Avatar from '../../components/common/Avatar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import MemberPickerModal, { PickOption } from '../../components/common/MemberPickerModal';

type Rt = RouteProp<PerformanceStackParamList, 'CreateAppraisal'>;

const REASONS = [
  { value: 'salary_increment', label: 'Salary Increment' },
  { value: 'annual_appraisal', label: 'Annual Appraisal' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'disciplinary_action', label: 'Disciplinary Action' },
  { value: 'others', label: 'Others' },
];

function memberName(m: any) {
  return m.name ?? (`${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email || 'Member');
}

export default function CreateAppraisalScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<Rt>();
  const { appId } = params;
  const { colors } = useTheme();
  const api = useApi();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [reason, setReason] = useState('annual_appraisal');
  const [reasonNotes, setReasonNotes] = useState('');
  const [cycleIds, setCycleIds] = useState<number[]>([]);

  const [members, setMembers] = useState<any[]>([]);
  const [cycles, setCycles] = useState<{ id: number; name: string }[]>([]);
  const [employeeModal, setEmployeeModal] = useState(false);
  const [cycleModal, setCycleModal] = useState(false);

  const load = useCallback(async () => {
    setDataLoading(true);
    try {
      const [membersRes, cyclesRes] = await Promise.all([
        api.workspace.getMembers(appId),
        api.performance.getCycles(appId),
      ]);
      const memberRows: any[] = membersRes.data?.members ?? membersRes.data?.items ?? membersRes.data ?? [];
      setMembers(memberRows);
      const cycleRows: any[] = cyclesRes.data?.items ?? cyclesRes.data ?? [];
      setCycles(cycleRows.map((c: any) => ({ id: c.id, name: `${c.cycle_name} (${c.year})` })));
    } catch (err) {
      showAlert('Could not load form data', apiErrorMessage(err));
    } finally {
      setDataLoading(false);
    }
  }, [appId, api]);

  useEffect(() => { load(); }, [load]);

  const memberOptions: PickOption[] = members.map((m) => ({ id: m.user_id ?? m.id, name: memberName(m), photoUrl: m.photo_url }));
  const employeeName = employeeId ? memberOptions.find((o) => o.id === employeeId)?.name : null;

  const handleCreate = async () => {
    if (!employeeId) return showAlert('Validation', 'Select an employee.');
    if (cycleIds.length === 0) return showAlert('Validation', 'Select at least one review cycle.');
    setSaving(true);
    try {
      await api.performance.createAppraisal(appId, {
        platform_user_id: employeeId,
        reason,
        reason_notes: reasonNotes.trim() || undefined,
        included_cycle_ids: cycleIds,
      });
      navigation.goBack();
    } catch (err) {
      showAlert('Could not create appraisal', apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (dataLoading) return <LoadingSpinner />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <View style={[s.container, { paddingTop: insets.top }]}>
        <ScreenHeader
          title="Trigger Appraisal"
          showBack
          right={<Button label="Create" onPress={handleCreate} loading={saving} style={s.saveBtn} />}
        />
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.fieldLabel}>Employee *</Text>
          <TouchableOpacity style={s.pickerRow} onPress={() => setEmployeeModal(true)}>
            {employeeId ? <Avatar name={employeeName ?? '?'} size={26} /> : <Ionicons name="person-outline" size={16} color={colors.gray400} />}
            <Text style={employeeId ? s.pickerValue : s.pickerPlaceholder}>{employeeName ?? 'Tap to select an employee'}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.gray400} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>

          <Text style={s.fieldLabel}>Reason *</Text>
          <View style={s.chipRow}>
            {REASONS.map((r) => (
              <TouchableOpacity key={r.value} style={[s.chip, reason === r.value && s.chipActive]} onPress={() => setReason(r.value)}>
                <Text style={[s.chipText, reason === r.value && s.chipTextActive]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Input label="Notes" value={reasonNotes} onChangeText={setReasonNotes} placeholder="Optional context" multiline numberOfLines={3} />

          <Text style={s.fieldLabel}>Review Cycles to Include * ({cycleIds.length})</Text>
          <TouchableOpacity style={s.pickerRow} onPress={() => setCycleModal(true)}>
            <Ionicons name="calendar-outline" size={16} color={colors.gray400} />
            <Text style={cycleIds.length ? s.pickerValue : s.pickerPlaceholder}>
              {cycleIds.length ? cycleIds.map((id) => cycles.find((c) => c.id === id)?.name ?? '?').join(', ') : 'Tap to select cycles'}
            </Text>
          </TouchableOpacity>
          {cycles.length === 0 && <Text style={s.hintText}>No review cycles found. Ask an admin to create one first.</Text>}
        </ScrollView>
      </View>

      <MemberPickerModal
        visible={employeeModal}
        title="Select Employee"
        options={memberOptions}
        selected={employeeId ? [employeeId] : []}
        onChange={(ids) => setEmployeeId(ids[0] ?? null)}
        onClose={() => setEmployeeModal(false)}
      />
      <MemberPickerModal
        visible={cycleModal}
        title="Select Review Cycles"
        options={cycles}
        multi
        selected={cycleIds}
        onChange={setCycleIds}
        onClose={() => setCycleModal(false)}
        allowClear={false}
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
    pickerRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.gray50, borderRadius: 10, padding: 12,
      borderWidth: 1, borderColor: c.border, marginBottom: 16,
    },
    pickerValue: { fontSize: 14, color: c.textPrimary, fontWeight: '500', flex: 1 },
    pickerPlaceholder: { fontSize: 14, color: c.gray400, flex: 1 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface },
    chipActive: { backgroundColor: c.primaryLight, borderColor: c.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: c.gray500 },
    chipTextActive: { color: c.primary },
    hintText: { fontSize: 12, color: c.gray400, fontStyle: 'italic', marginTop: -8 },
  });
}
