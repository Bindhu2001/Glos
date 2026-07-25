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

type Nav = NativeStackNavigationProp<MoreStackParamList, 'CreateEditProject'>;
type Rt = RouteProp<MoreStackParamList, 'CreateEditProject'>;

interface MilestoneDraft { key: string; title: string; start_date: string; end_date: string }

function memberLabel(m: any): string {
  return m.name ?? (`${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email || 'Member');
}

export default function CreateEditProjectScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { appId, projectId } = params;
  const isEdit = projectId != null;
  const { colors } = useTheme();
  const api = useApi();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [clientId, setClientId] = useState<number | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientDetails, setClientDetails] = useState('');
  const [ownerUserId, setOwnerUserId] = useState<number | null>(null);
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [billingType, setBillingType] = useState<'fixed' | 'per_hour'>('fixed');
  const [totalBilling, setTotalBilling] = useState('');
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([]);

  const [members, setMembers] = useState<any[]>([]);
  const [clients, setClients] = useState<PickOption[]>([]);
  const [ownerModal, setOwnerModal] = useState(false);
  const [membersModal, setMembersModal] = useState(false);
  const [clientModal, setClientModal] = useState(false);

  const load = useCallback(async () => {
    setDataLoading(true);
    try {
      const [meRes, membersRes, clientsRes, projRes] = await Promise.all([
        api.me.getProfile(),
        api.workspace.getMembers(appId),
        api.contracts.listClients(appId, {}),
        isEdit ? api.projects.get(appId, projectId!) : Promise.resolve(null),
      ]);
      const meId = meRes.data?.id ?? meRes.data?.user?.id ?? null;
      const membersList: any[] = membersRes.data?.members ?? membersRes.data?.items ?? membersRes.data ?? [];
      setMembers(membersList);
      const clientRows: any[] = clientsRes.data ?? [];
      setClients(clientRows.map((c) => ({ id: c.id, name: c.client_name })));

      if (isEdit && projRes) {
        const p = projRes.data;
        setName(p.name ?? '');
        setClientId(p.client_id ?? null);
        setClientName(p.client_name ?? '');
        setClientDetails(p.client_details ?? '');
        setOwnerUserId(p.owner_user_id ?? null);
        setStartDate(p.start_date ? String(p.start_date).slice(0, 10) : '');
        setEndDate(p.end_date ? String(p.end_date).slice(0, 10) : '');
        setRemarks(p.remarks ?? '');
        setBillingType(p.billing_type === 'per_hour' ? 'per_hour' : 'fixed');
        setTotalBilling(p.total_billing != null ? String(p.total_billing) : '');
        const existingMembers: number[] = (p.member_user_ids ?? []).filter(Boolean);
        setMemberIds(existingMembers.length ? existingMembers : (meId ? [meId] : []));
      } else if (meId) {
        setOwnerUserId(meId);
        setMemberIds([meId]);
        setMilestones([{ key: `${Date.now()}`, title: '', start_date: '', end_date: '' }]);
      }
    } catch (err) {
      showAlert('Could not load form data', apiErrorMessage(err));
    } finally {
      setDataLoading(false);
    }
  }, [appId, isEdit, projectId, api]);

  useEffect(() => { load(); }, [load]);

  const memberOptions: PickOption[] = members.map((m) => ({ id: m.user_id ?? m.id, name: memberLabel(m), photoUrl: m.photo_url }));

  const getOwnerName = () => {
    if (!ownerUserId) return 'None';
    return memberOptions.find((o) => o.id === ownerUserId)?.name ?? 'Unknown';
  };

  const addMilestoneRow = () => setMilestones((prev) => [...prev, { key: `${Date.now()}-${prev.length}`, title: '', start_date: '', end_date: '' }]);
  const removeMilestoneRow = (key: string) => setMilestones((prev) => prev.filter((m) => m.key !== key));
  const updateMilestoneRow = (key: string, patch: Partial<MilestoneDraft>) =>
    setMilestones((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));

  const handleSave = async () => {
    if (!name.trim()) return showAlert('Validation', 'Project name is required.');
    if (!clientId && !clientName.trim()) return showAlert('Validation', 'Select or enter a client.');
    if (!startDate) return showAlert('Validation', 'Start date is required.');
    if (endDate && endDate < startDate) return showAlert('Validation', 'End date must be on or after start date.');

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        client_id: clientId ?? undefined,
        client_name: !clientId ? clientName.trim() : undefined,
        client_details: clientDetails.trim() || undefined,
        owner_user_id: ownerUserId ?? undefined,
        start_date: startDate,
        end_date: endDate || undefined,
        remarks: remarks.trim() || undefined,
        member_user_ids: memberIds,
        billing_type: billingType,
        total_billing: totalBilling.trim() ? Number(totalBilling) : undefined,
      };
      if (isEdit) {
        await api.projects.update(appId, projectId!, body);
      } else {
        const validMilestones = milestones.filter((m) => m.title.trim());
        await api.projects.create(appId, { ...body, milestones: validMilestones.map((m) => ({ title: m.title.trim(), start_date: m.start_date || undefined, end_date: m.end_date || undefined })) });
      }
      navigation.goBack();
    } catch (err) {
      showAlert(isEdit ? 'Could not update project' : 'Could not create project', apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (dataLoading) return <LoadingSpinner />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <View style={[s.container, { paddingTop: insets.top }]}>
        <ScreenHeader
          title={isEdit ? 'Edit Project' : 'New Project'}
          showBack
          right={<Button label={isEdit ? 'Save' : 'Create'} onPress={handleSave} loading={saving} style={s.saveBtn} />}
        />
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Input label="Project Name *" value={name} onChangeText={setName} placeholder="e.g. Website Redesign" />

          <Text style={s.fieldLabel}>Client *</Text>
          <TouchableOpacity style={s.pickerRow} onPress={() => setClientModal(true)}>
            <Ionicons name="business-outline" size={16} color={colors.gray400} />
            <Text style={clientId ? s.pickerValue : s.pickerPlaceholder}>
              {clientId ? clients.find((c) => c.id === clientId)?.name ?? 'Selected' : 'Tap to select a client'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.gray400} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
          {!clientId && (
            <Input value={clientName} onChangeText={setClientName} placeholder="Or type a client name" containerStyle={{ marginTop: -8 }} />
          )}
          <Input label="Client Details" value={clientDetails} onChangeText={setClientDetails} placeholder="Optional context about the client" multiline numberOfLines={2} />

          <DatePickerField label="Start Date *" value={startDate} onChange={setStartDate} />
          <DatePickerField label="End Date" value={endDate} onChange={setEndDate} />

          <Text style={s.fieldLabel}>Owner</Text>
          <TouchableOpacity style={s.pickerRow} onPress={() => setOwnerModal(true)}>
            {ownerUserId ? <Avatar name={getOwnerName()} size={26} /> : <Ionicons name="person-outline" size={16} color={colors.gray400} />}
            <Text style={ownerUserId ? s.pickerValue : s.pickerPlaceholder}>{getOwnerName()}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.gray400} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>

          <Text style={s.fieldLabel}>Members ({memberIds.length})</Text>
          <TouchableOpacity style={s.pickerRow} onPress={() => setMembersModal(true)}>
            <Ionicons name="people-outline" size={16} color={colors.gray400} />
            <Text style={memberIds.length ? s.pickerValue : s.pickerPlaceholder}>
              {memberIds.length ? memberIds.map((id) => memberOptions.find((o) => o.id === id)?.name ?? '?').join(', ') : 'Tap to add members'}
            </Text>
          </TouchableOpacity>

          <Text style={s.fieldLabel}>Billing Type</Text>
          <View style={s.chipRow}>
            {(['fixed', 'per_hour'] as const).map((bt) => (
              <TouchableOpacity
                key={bt}
                style={[s.chip, billingType === bt && s.chipActive]}
                onPress={() => setBillingType(bt)}
              >
                <Text style={[s.chipText, billingType === bt && s.chipTextActive]}>{bt === 'fixed' ? 'Fixed' : 'Per Hour'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Input label="Total Billing" value={totalBilling} onChangeText={setTotalBilling} placeholder="Optional amount" keyboardType="decimal-pad" />
          <Input label="Remarks" value={remarks} onChangeText={setRemarks} placeholder="Optional notes" multiline numberOfLines={3} />

          {!isEdit && (
            <>
              <Text style={s.fieldLabel}>Milestones</Text>
              {milestones.map((m) => (
                <View key={m.key} style={s.msCard}>
                  <View style={s.msHeadRow}>
                    <TextInput
                      style={s.msTitleInput}
                      placeholder="Milestone title"
                      placeholderTextColor={colors.gray400}
                      value={m.title}
                      onChangeText={(t) => updateMilestoneRow(m.key, { title: t })}
                    />
                    <TouchableOpacity onPress={() => removeMilestoneRow(m.key)}>
                      <Ionicons name="close-circle" size={20} color={colors.gray400} />
                    </TouchableOpacity>
                  </View>
                  <View style={s.msDatesRow}>
                    <View style={{ flex: 1 }}>
                      <DatePickerField value={m.start_date} onChange={(d) => updateMilestoneRow(m.key, { start_date: d })} placeholder="Start" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <DatePickerField value={m.end_date} onChange={(d) => updateMilestoneRow(m.key, { end_date: d })} placeholder="End" />
                    </View>
                  </View>
                </View>
              ))}
              <TouchableOpacity style={s.addRow} onPress={addMilestoneRow}>
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                <Text style={s.addRowTxt}>Add Milestone</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>

      <MemberPickerModal
        visible={ownerModal}
        title="Select Owner"
        options={memberOptions}
        selected={ownerUserId ? [ownerUserId] : []}
        onChange={(ids) => setOwnerUserId(ids[0] ?? null)}
        onClose={() => setOwnerModal(false)}
      />
      <MemberPickerModal
        visible={membersModal}
        title="Select Members"
        options={memberOptions}
        multi
        selected={memberIds}
        onChange={setMemberIds}
        onClose={() => setMembersModal(false)}
        allowClear={false}
      />
      <MemberPickerModal
        visible={clientModal}
        title="Select Client"
        options={clients}
        selected={clientId ? [clientId] : []}
        onChange={(ids) => { setClientId(ids[0] ?? null); if (ids[0]) setClientName(''); }}
        onClose={() => setClientModal(false)}
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
    chipRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface },
    chipActive: { backgroundColor: c.primaryLight, borderColor: c.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: c.gray500 },
    chipTextActive: { color: c.primary },
    msCard: { backgroundColor: c.gray50, borderRadius: 10, borderWidth: 1, borderColor: c.border, padding: 10, marginBottom: 10 },
    msHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    msTitleInput: { flex: 1, fontSize: 14, color: c.textPrimary, paddingVertical: 4 },
    msDatesRow: { flexDirection: 'row', gap: 10 },
    addRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
    addRowTxt: { fontSize: 13, fontWeight: '700', color: c.primary },
  });
}
