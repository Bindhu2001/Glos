import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, KeyboardAvoidingView, TextInput } from 'react-native';
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
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import DatePickerField from '../../components/common/DatePickerField';
import Avatar from '../../components/common/Avatar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import MemberPickerModal, { PickOption } from '../../components/common/MemberPickerModal';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'CreateEditAgreement'>;
type Rt = RouteProp<MoreStackParamList, 'CreateEditAgreement'>;

const STATUSES = ['active', 'draft', 'expired', 'terminated'] as const;

function memberLabel(m: any): string {
  return m.name ?? (`${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email || 'Member');
}

export default function CreateEditAgreementScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { appId, agreementId } = params;
  const isEdit = agreementId != null;
  const { colors } = useTheme();
  const api = useApi();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [clientId, setClientId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rmUserId, setRmUserId] = useState<number | null>(null);
  const [serviceOwnerId, setServiceOwnerId] = useState<number | null>(null);
  const [status, setStatus] = useState<typeof STATUSES[number]>('active');
  const [notes, setNotes] = useState('');
  const [clauses, setClauses] = useState<string[]>([]);
  const [clauseDraft, setClauseDraft] = useState('');
  const [allocatedIds, setAllocatedIds] = useState<number[]>([]);

  const [members, setMembers] = useState<any[]>([]);
  const [clients, setClients] = useState<PickOption[]>([]);
  const [clientModal, setClientModal] = useState(false);
  const [rmModal, setRmModal] = useState(false);
  const [ownerModal, setOwnerModal] = useState(false);
  const [allocModal, setAllocModal] = useState(false);

  const load = useCallback(async () => {
    setDataLoading(true);
    try {
      const [membersRes, clientsRes, agRes] = await Promise.all([
        api.workspace.getMembers(appId),
        api.contracts.listClients(appId, {}),
        isEdit ? api.contracts.getAgreement(appId, agreementId!) : Promise.resolve(null),
      ]);
      const membersList: any[] = membersRes.data?.members ?? membersRes.data?.items ?? membersRes.data ?? [];
      setMembers(membersList);
      const clientRows: any[] = clientsRes.data ?? [];
      setClients(clientRows.map((c) => ({ id: c.id, name: c.client_name })));

      if (isEdit && agRes) {
        const a = agRes.data;
        setClientId(a.client_id ?? a.client?.id ?? null);
        setStartDate(a.start_date ? String(a.start_date).slice(0, 10) : '');
        setEndDate(a.end_date ? String(a.end_date).slice(0, 10) : '');
        setRmUserId(a.rm_user_id ?? a.rm_user?.id ?? null);
        setServiceOwnerId(a.service_owner_id ?? a.service_owner?.id ?? null);
        setStatus((a.status as any) ?? 'active');
        setNotes(a.notes ?? '');
        setClauses(Array.isArray(a.clauses) ? a.clauses : []);
        setAllocatedIds((a.allocated_users ?? []).map((u: any) => u.id).filter(Boolean));
      }
    } catch (err) {
      showAlert('Could not load form data', apiErrorMessage(err));
    } finally {
      setDataLoading(false);
    }
  }, [appId, isEdit, agreementId, api]);

  useEffect(() => { load(); }, [load]);

  const memberOptions: PickOption[] = members.map((m) => ({ id: m.user_id ?? m.id, name: memberLabel(m), photoUrl: m.photo_url }));
  const nameFor = (id: number | null) => (id ? memberOptions.find((o) => o.id === id)?.name ?? 'Unknown' : 'None');

  const addClause = () => {
    if (!clauseDraft.trim()) return;
    setClauses((prev) => [...prev, clauseDraft.trim()]);
    setClauseDraft('');
  };
  const removeClause = (idx: number) => setClauses((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!clientId) return showAlert('Validation', 'Select a client.');
    if (!startDate) return showAlert('Validation', 'Start date is required.');
    if (!endDate) return showAlert('Validation', 'End date is required.');
    if (endDate < startDate) return showAlert('Validation', 'End date must be on or after start date.');

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        client_id: clientId,
        start_date: startDate,
        end_date: endDate,
        rm_user_id: rmUserId ?? undefined,
        service_owner_id: serviceOwnerId ?? undefined,
        status,
        notes: notes.trim() || undefined,
        clauses,
        allocated_user_ids: allocatedIds,
      };
      if (isEdit) {
        await api.contracts.updateAgreement(appId, agreementId!, body);
      } else {
        await api.contracts.createAgreement(appId, body);
      }
      navigation.goBack();
    } catch (err) {
      showAlert(isEdit ? 'Could not update agreement' : 'Could not create agreement', apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (dataLoading) return <LoadingSpinner />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <View style={[s.container, { paddingTop: insets.top }]}>
        <ScreenHeader
          title={isEdit ? 'Edit Agreement' : 'New Agreement'}
          showBack
          right={<Button label={isEdit ? 'Save' : 'Create'} onPress={handleSave} loading={saving} style={s.saveBtn} />}
        />
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.fieldLabel}>Client *</Text>
          <TouchableOpacity style={s.pickerRow} onPress={() => setClientModal(true)}>
            <Ionicons name="business-outline" size={16} color={colors.gray400} />
            <Text style={clientId ? s.pickerValue : s.pickerPlaceholder}>
              {clientId ? clients.find((c) => c.id === clientId)?.name ?? 'Selected' : 'Tap to select a client'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.gray400} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>

          <DatePickerField label="Start Date *" value={startDate} onChange={setStartDate} />
          <DatePickerField label="End Date *" value={endDate} onChange={setEndDate} />

          <Text style={s.fieldLabel}>Relationship Manager</Text>
          <TouchableOpacity style={s.pickerRow} onPress={() => setRmModal(true)}>
            {rmUserId ? <Avatar name={nameFor(rmUserId)} size={26} /> : <Ionicons name="person-outline" size={16} color={colors.gray400} />}
            <Text style={rmUserId ? s.pickerValue : s.pickerPlaceholder}>{nameFor(rmUserId)}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.gray400} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>

          <Text style={s.fieldLabel}>Service Owner</Text>
          <TouchableOpacity style={s.pickerRow} onPress={() => setOwnerModal(true)}>
            {serviceOwnerId ? <Avatar name={nameFor(serviceOwnerId)} size={26} /> : <Ionicons name="person-outline" size={16} color={colors.gray400} />}
            <Text style={serviceOwnerId ? s.pickerValue : s.pickerPlaceholder}>{nameFor(serviceOwnerId)}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.gray400} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>

          <Text style={s.fieldLabel}>Status</Text>
          <View style={s.chipRow}>
            {STATUSES.map((st) => (
              <TouchableOpacity key={st} style={[s.chip, status === st && s.chipActive]} onPress={() => setStatus(st)}>
                <Text style={[s.chipText, status === st && s.chipTextActive]}>{st}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.fieldLabel}>Assign Operations Users ({allocatedIds.length})</Text>
          <TouchableOpacity style={s.pickerRow} onPress={() => setAllocModal(true)}>
            <Ionicons name="people-outline" size={16} color={colors.gray400} />
            <Text style={allocatedIds.length ? s.pickerValue : s.pickerPlaceholder}>
              {allocatedIds.length ? allocatedIds.map((id) => nameFor(id)).join(', ') : 'Tap to assign users'}
            </Text>
          </TouchableOpacity>

          <Input label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional notes" multiline numberOfLines={3} />

          <Text style={s.fieldLabel}>Clauses</Text>
          {clauses.map((c, i) => (
            <View key={i} style={s.clauseRow}>
              <Text style={s.clauseText} numberOfLines={2}>{c}</Text>
              <TouchableOpacity onPress={() => removeClause(i)}>
                <Ionicons name="close-circle" size={18} color={colors.gray400} />
              </TouchableOpacity>
            </View>
          ))}
          <View style={s.clauseAddRow}>
            <TextInput
              style={s.clauseInput}
              placeholder="Add a clause..."
              placeholderTextColor={colors.gray400}
              value={clauseDraft}
              onChangeText={setClauseDraft}
              onSubmitEditing={addClause}
            />
            <TouchableOpacity onPress={addClause}>
              <Ionicons name="add-circle" size={22} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

      <MemberPickerModal visible={clientModal} title="Select Client" options={clients} selected={clientId ? [clientId] : []} onChange={(ids) => setClientId(ids[0] ?? null)} onClose={() => setClientModal(false)} />
      <MemberPickerModal visible={rmModal} title="Select Relationship Manager" options={memberOptions} selected={rmUserId ? [rmUserId] : []} onChange={(ids) => setRmUserId(ids[0] ?? null)} onClose={() => setRmModal(false)} />
      <MemberPickerModal visible={ownerModal} title="Select Service Owner" options={memberOptions} selected={serviceOwnerId ? [serviceOwnerId] : []} onChange={(ids) => setServiceOwnerId(ids[0] ?? null)} onClose={() => setOwnerModal(false)} />
      <MemberPickerModal visible={allocModal} title="Assign Operations Users" options={memberOptions} multi selected={allocatedIds} onChange={setAllocatedIds} onClose={() => setAllocModal(false)} allowClear={false} />
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
    chipText: { fontSize: 13, fontWeight: '600', color: c.gray500, textTransform: 'capitalize' },
    chipTextActive: { color: c.primary },
    clauseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.gray50, borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: c.border },
    clauseText: { flex: 1, fontSize: 13, color: c.textPrimary },
    clauseAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
    clauseInput: { flex: 1, backgroundColor: c.gray50, borderRadius: 8, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: c.textPrimary },
  });
}
