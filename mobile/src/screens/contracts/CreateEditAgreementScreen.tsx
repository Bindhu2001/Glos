import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, KeyboardAvoidingView, TextInput, Platform } from 'react-native';
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
import LoadError from '../../components/common/LoadError';
import MemberPickerModal, { PickOption } from '../../components/common/MemberPickerModal';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'CreateEditAgreement'>;
type Rt = RouteProp<MoreStackParamList, 'CreateEditAgreement'>;

const STATUSES = ['active', 'draft', 'expired', 'terminated'] as const;
const BILLING_CYCLES = ['monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time'] as const;
const PERIODICITIES = ['one_time', 'monthly', 'weekly', 'quarterly', 'half_yearly', 'yearly'] as const;
const SLA_TYPES: { value: 'fixed_day' | 'relative_days' | 'specific_date'; label: string }[] = [
  { value: 'fixed_day', label: 'Fixed Day' },
  { value: 'relative_days', label: 'Relative Days' },
  { value: 'specific_date', label: 'Specific Date' },
];

function memberLabel(m: any): string {
  return m.name ?? (`${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email || 'Member');
}

function fmtCycle(v: string) {
  return v.replace(/_/g, ' ');
}

interface ServiceLine {
  cas_id?: number;
  service_id: number | null;
  billing_cycle: string;
  periodicity: string;
  included_employee_count: string;
  base_charge: string;
  additional_charge_per_employee: string;
  effective_from: string;
  sla_type: 'fixed_day' | 'relative_days' | 'specific_date';
  sla_due_day: string;
  sla_relative_days: string;
  sla_month: string;
  sla_date: string;
}

function emptyServiceLine(): ServiceLine {
  return {
    service_id: null,
    billing_cycle: 'monthly',
    periodicity: 'monthly',
    included_employee_count: '100',
    base_charge: '',
    additional_charge_per_employee: '0',
    effective_from: new Date().toISOString().slice(0, 10),
    sla_type: 'fixed_day',
    sla_due_day: '5',
    sla_relative_days: '15',
    sla_month: '3',
    sla_date: '31',
  };
}

// Matches main/frontend's svcLineFromExisting — the agreement GET response
// flattens contract_service_pricing/contract_service_sla onto each service row.
function serviceLineFromExisting(s: any): ServiceLine {
  return {
    cas_id: s.id,
    service_id: s.service_id ?? null,
    billing_cycle: s.billing_cycle || 'monthly',
    periodicity: s.periodicity || 'monthly',
    included_employee_count: String(s.included_employee_count ?? 100),
    base_charge: s.base_charge != null ? String(s.base_charge) : '',
    additional_charge_per_employee: String(s.additional_charge_per_employee ?? 0),
    effective_from: s.effective_from ? String(s.effective_from).slice(0, 10) : new Date().toISOString().slice(0, 10),
    sla_type: s.sla_type || 'fixed_day',
    sla_due_day: String(s.due_day ?? 5),
    sla_relative_days: String(s.relative_days ?? 15),
    sla_month: String(s.sla_month ?? 3),
    sla_date: String(s.sla_date ?? 31),
  };
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
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const [agreementNumber, setAgreementNumber] = useState('');
  const [agreementName, setAgreementName] = useState('');
  const [clientId, setClientId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rmUserId, setRmUserId] = useState<number | null>(null);
  const [serviceOwnerId, setServiceOwnerId] = useState<number | null>(null);
  const [status, setStatus] = useState<typeof STATUSES[number]>('active');
  const [billingCycle, setBillingCycle] = useState<typeof BILLING_CYCLES[number]>('monthly');
  const [totalValue, setTotalValue] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [notes, setNotes] = useState('');
  const [clauses, setClauses] = useState<string[]>([]);
  const [clauseDraft, setClauseDraft] = useState('');
  const [allocatedIds, setAllocatedIds] = useState<number[]>([]);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);

  const [members, setMembers] = useState<any[]>([]);
  const [clients, setClients] = useState<PickOption[]>([]);
  const [contractServices, setContractServices] = useState<PickOption[]>([]);
  const [clientModal, setClientModal] = useState(false);
  const [rmModal, setRmModal] = useState(false);
  const [ownerModal, setOwnerModal] = useState(false);
  const [allocModal, setAllocModal] = useState(false);
  const [svcPickerLineIdx, setSvcPickerLineIdx] = useState<number | null>(null);

  const load = useCallback(async () => {
    setDataLoading(true);
    setLoadError(false);
    try {
      const [membersRes, clientsRes, servicesRes, agRes] = await Promise.all([
        api.workspace.getMembers(appId),
        api.contracts.listClients(appId, {}),
        api.contracts.listServices(appId, {}),
        isEdit ? api.contracts.getAgreement(appId, agreementId!) : Promise.resolve(null),
      ]);
      const membersList: any[] = membersRes.data?.members ?? membersRes.data?.items ?? membersRes.data ?? [];
      setMembers(membersList);
      const clientRows: any[] = clientsRes.data ?? [];
      setClients(clientRows.map((c) => ({ id: c.id, name: c.client_name })));
      const serviceRows: any[] = servicesRes.data ?? [];
      setContractServices(serviceRows.map((sv) => ({ id: sv.id, name: sv.service_name })));

      if (isEdit && agRes) {
        const a = agRes.data;
        setAgreementNumber(a.agreement_number ?? '');
        setAgreementName(a.agreement_name ?? '');
        setClientId(a.client_id ?? a.client?.id ?? null);
        setStartDate(a.start_date ? String(a.start_date).slice(0, 10) : '');
        setEndDate(a.end_date ? String(a.end_date).slice(0, 10) : '');
        setRmUserId(a.rm_user_id ?? a.rm_user?.id ?? null);
        setServiceOwnerId(a.service_owner_id ?? a.service_owner?.id ?? null);
        setStatus((a.status as any) ?? 'active');
        setBillingCycle((a.billing_cycle as any) ?? 'monthly');
        setTotalValue(a.total_value != null ? String(a.total_value) : '');
        setCurrency(a.currency ?? 'INR');
        setNotes(a.notes ?? '');
        setClauses(Array.isArray(a.clauses) ? a.clauses : []);
        setAllocatedIds((a.allocated_users ?? []).map((u: any) => u.id).filter(Boolean));
        setServiceLines((a.services ?? []).map(serviceLineFromExisting));
      }
    } catch (err) {
      showAlert('Could not load form data', apiErrorMessage(err));
      setLoadError(true);
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

  const addServiceLine = () => setServiceLines((prev) => [...prev, emptyServiceLine()]);
  const removeServiceLine = (idx: number) => setServiceLines((prev) => prev.filter((_, i) => i !== idx));
  const updateServiceLine = (idx: number, patch: Partial<ServiceLine>) =>
    setServiceLines((prev) => prev.map((line, i) => (i === idx ? { ...line, ...patch } : line)));

  const handleSave = async () => {
    if (!clientId) return showAlert('Validation', 'Select a client.');
    if (!startDate) return showAlert('Validation', 'Start date is required.');
    if (!endDate) return showAlert('Validation', 'End date is required.');
    if (endDate < startDate) return showAlert('Validation', 'End date must be on or after start date.');

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        agreement_number: agreementNumber.trim() || undefined,
        agreement_name: agreementName.trim() || undefined,
        client_id: clientId,
        start_date: startDate,
        end_date: endDate,
        rm_user_id: rmUserId ?? undefined,
        service_owner_id: serviceOwnerId ?? undefined,
        billing_cycle: billingCycle,
        total_value: totalValue.trim() ? Number(totalValue) : undefined,
        currency: currency.trim() || 'INR',
        status,
        notes: notes.trim() || undefined,
        clauses,
        allocated_user_ids: allocatedIds,
        services: serviceLines
          .filter((l) => l.service_id)
          .map((l) => ({
            ...(l.cas_id ? { cas_id: l.cas_id } : {}),
            service_id: l.service_id,
            // Matches main web's form — this per-line field is collected but the
            // backend's service-line insert/update never persists it (only
            // periodicity/pricing/SLA are). Kept here for visual field parity.
            billing_cycle: l.billing_cycle,
            periodicity: l.periodicity,
            pricing: {
              included_employee_count: Number(l.included_employee_count) || 0,
              base_charge: Number(l.base_charge) || 0,
              additional_charge_per_employee: Number(l.additional_charge_per_employee) || 0,
              effective_from: l.effective_from,
            },
            sla: {
              sla_type: l.sla_type,
              due_day: l.sla_type === 'fixed_day' ? Number(l.sla_due_day) || null : null,
              relative_days: l.sla_type === 'relative_days' ? Number(l.sla_relative_days) || null : null,
              sla_month: l.sla_type === 'specific_date' ? Number(l.sla_month) || null : null,
              sla_date: l.sla_type === 'specific_date' ? Number(l.sla_date) || null : null,
            },
          })),
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
  if (loadError) return <LoadError onRetry={load} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.container, { paddingTop: insets.top }]}>
        <ScreenHeader
          title={isEdit ? 'Edit Agreement' : 'New Agreement'}
          showBack
          right={<Button label={isEdit ? 'Save' : 'Create'} onPress={handleSave} loading={saving} style={s.saveBtn} />}
        />
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.sectionHead}>AGREEMENT DETAILS</Text>

          <Input
            label="Agreement Number"
            value={agreementNumber}
            onChangeText={setAgreementNumber}
            placeholder="Auto-generated if blank"
            maxLength={50}
          />
          <Input
            label="Agreement Name"
            value={agreementName}
            onChangeText={setAgreementName}
            placeholder="e.g. Annual Support Contract"
            maxLength={200}
          />

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

          <Text style={s.fieldLabel}>Billing Cycle</Text>
          <View style={s.chipRow}>
            {BILLING_CYCLES.map((b) => (
              <TouchableOpacity key={b} style={[s.chip, billingCycle === b && s.chipActive]} onPress={() => setBillingCycle(b)}>
                <Text style={[s.chipText, billingCycle === b && s.chipTextActive]}>{fmtCycle(b)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.rowHalves}>
            <Input
              label="Total Value (₹)"
              value={totalValue}
              onChangeText={setTotalValue}
              placeholder="0"
              keyboardType="decimal-pad"
              containerStyle={s.halfInput}
            />
            <Input
              label="Currency"
              value={currency}
              onChangeText={setCurrency}
              maxLength={10}
              containerStyle={s.halfInput}
            />
          </View>

          <Text style={s.fieldLabel}>Assign Operations Users ({allocatedIds.length})</Text>
          <TouchableOpacity style={s.pickerRow} onPress={() => setAllocModal(true)}>
            <Ionicons name="people-outline" size={16} color={colors.gray400} />
            <Text style={allocatedIds.length ? s.pickerValue : s.pickerPlaceholder}>
              {allocatedIds.length ? allocatedIds.map((id) => nameFor(id)).join(', ') : 'Tap to assign users'}
            </Text>
          </TouchableOpacity>

          <Input label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional notes" multiline numberOfLines={3} maxLength={2000} />

          <Text style={s.sectionHead}>IMPORTANT CLAUSES</Text>
          {clauses.map((c, i) => (
            <View key={i} style={s.clauseRow}>
              <Text style={s.clauseNo}>{i + 1}.</Text>
              <Text style={s.clauseText} numberOfLines={4}>{c}</Text>
              <TouchableOpacity onPress={() => removeClause(i)}>
                <Ionicons name="close-circle" size={18} color={colors.gray400} />
              </TouchableOpacity>
            </View>
          ))}
          <View style={s.clauseAddRow}>
            <TextInput
              style={s.clauseInput}
              placeholder="Type a clause..."
              placeholderTextColor={colors.gray400}
              value={clauseDraft}
              onChangeText={setClauseDraft}
              onSubmitEditing={addClause}
              maxLength={500}
              multiline
            />
            <TouchableOpacity onPress={addClause}>
              <Ionicons name="add-circle" size={22} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={s.sectionHeadRow}>
            <Text style={s.sectionHead}>SERVICES</Text>
            <TouchableOpacity style={s.addSvcBtn} onPress={addServiceLine}>
              <Ionicons name="add" size={14} color={colors.primary} />
              <Text style={s.addSvcBtnText}>Add Service</Text>
            </TouchableOpacity>
          </View>

          {serviceLines.length === 0 ? (
            <Text style={s.emptyText}>No services added yet. Tap "Add Service" to begin.</Text>
          ) : (
            serviceLines.map((line, idx) => (
              <View key={idx} style={s.svcCard}>
                <View style={s.svcCardHead}>
                  <Text style={s.svcCardTitle}>Service {idx + 1}</Text>
                  <TouchableOpacity style={s.removeBtn} onPress={() => removeServiceLine(idx)}>
                    <Text style={s.removeBtnText}>Remove</Text>
                  </TouchableOpacity>
                </View>

                <Text style={s.svcFieldLabel}>Service *</Text>
                <TouchableOpacity style={s.pickerRowSmall} onPress={() => setSvcPickerLineIdx(idx)}>
                  <Ionicons name="briefcase-outline" size={15} color={colors.gray400} />
                  <Text style={line.service_id ? s.pickerValue : s.pickerPlaceholder}>
                    {line.service_id ? contractServices.find((o) => o.id === line.service_id)?.name ?? 'Selected' : 'Tap to select a service'}
                  </Text>
                  <Ionicons name="chevron-forward" size={15} color={colors.gray400} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>

                <Text style={s.svcFieldLabel}>Billing Cycle</Text>
                <View style={s.chipRow}>
                  {BILLING_CYCLES.map((b) => (
                    <TouchableOpacity key={b} style={[s.chipSm, line.billing_cycle === b && s.chipActive]} onPress={() => updateServiceLine(idx, { billing_cycle: b })}>
                      <Text style={[s.chipTextSm, line.billing_cycle === b && s.chipTextActive]}>{fmtCycle(b)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.svcFieldLabel}>Periodicity</Text>
                <View style={s.chipRow}>
                  {PERIODICITIES.map((p) => (
                    <TouchableOpacity key={p} style={[s.chipSm, line.periodicity === p && s.chipActive]} onPress={() => updateServiceLine(idx, { periodicity: p })}>
                      <Text style={[s.chipTextSm, line.periodicity === p && s.chipTextActive]}>{fmtCycle(p)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={s.rowHalves}>
                  <Input
                    label="Included Employees"
                    value={line.included_employee_count}
                    onChangeText={(v) => updateServiceLine(idx, { included_employee_count: v })}
                    keyboardType="number-pad"
                    containerStyle={s.halfInput}
                  />
                  <Input
                    label="Base Charge (₹)"
                    value={line.base_charge}
                    onChangeText={(v) => updateServiceLine(idx, { base_charge: v })}
                    keyboardType="decimal-pad"
                    containerStyle={s.halfInput}
                  />
                </View>
                <View style={s.rowHalves}>
                  <Input
                    label="Add. Per Employee (₹)"
                    value={line.additional_charge_per_employee}
                    onChangeText={(v) => updateServiceLine(idx, { additional_charge_per_employee: v })}
                    keyboardType="decimal-pad"
                    containerStyle={s.halfInput}
                  />
                  <View style={s.halfInput}>
                    <DatePickerField
                      label="Effective From"
                      value={line.effective_from}
                      onChange={(v) => updateServiceLine(idx, { effective_from: v })}
                      containerStyle={{ marginBottom: 0 }}
                    />
                  </View>
                </View>

                <Text style={s.svcFieldLabel}>SLA Type</Text>
                <View style={s.chipRow}>
                  {SLA_TYPES.map((t) => (
                    <TouchableOpacity key={t.value} style={[s.chipSm, line.sla_type === t.value && s.chipActive]} onPress={() => updateServiceLine(idx, { sla_type: t.value })}>
                      <Text style={[s.chipTextSm, line.sla_type === t.value && s.chipTextActive]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {line.sla_type === 'fixed_day' && (
                  <Input
                    label="Due Day (1–31)"
                    value={line.sla_due_day}
                    onChangeText={(v) => updateServiceLine(idx, { sla_due_day: v })}
                    keyboardType="number-pad"
                  />
                )}
                {line.sla_type === 'relative_days' && (
                  <Input
                    label="Relative Days"
                    value={line.sla_relative_days}
                    onChangeText={(v) => updateServiceLine(idx, { sla_relative_days: v })}
                    keyboardType="number-pad"
                  />
                )}
                {line.sla_type === 'specific_date' && (
                  <View style={s.rowHalves}>
                    <Input
                      label="Month (1–12)"
                      value={line.sla_month}
                      onChangeText={(v) => updateServiceLine(idx, { sla_month: v })}
                      keyboardType="number-pad"
                      containerStyle={s.halfInput}
                    />
                    <Input
                      label="Day (1–31)"
                      value={line.sla_date}
                      onChangeText={(v) => updateServiceLine(idx, { sla_date: v })}
                      keyboardType="number-pad"
                      containerStyle={s.halfInput}
                    />
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      </View>

      <MemberPickerModal visible={clientModal} title="Select Client" options={clients} selected={clientId ? [clientId] : []} onChange={(ids) => setClientId(ids[0] ?? null)} onClose={() => setClientModal(false)} />
      <MemberPickerModal visible={rmModal} title="Select Relationship Manager" options={memberOptions} selected={rmUserId ? [rmUserId] : []} onChange={(ids) => setRmUserId(ids[0] ?? null)} onClose={() => setRmModal(false)} />
      <MemberPickerModal visible={ownerModal} title="Select Service Owner" options={memberOptions} selected={serviceOwnerId ? [serviceOwnerId] : []} onChange={(ids) => setServiceOwnerId(ids[0] ?? null)} onClose={() => setOwnerModal(false)} />
      <MemberPickerModal visible={allocModal} title="Assign Operations Users" options={memberOptions} multi selected={allocatedIds} onChange={setAllocatedIds} onClose={() => setAllocModal(false)} allowClear={false} />
      <MemberPickerModal
        visible={svcPickerLineIdx != null}
        title="Select Service"
        options={contractServices}
        selected={svcPickerLineIdx != null && serviceLines[svcPickerLineIdx]?.service_id ? [serviceLines[svcPickerLineIdx].service_id as number] : []}
        onChange={(ids) => { if (svcPickerLineIdx != null) updateServiceLine(svcPickerLineIdx, { service_id: ids[0] ?? null }); }}
        onClose={() => setSvcPickerLineIdx(null)}
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
    sectionHead: { fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginTop: 8, marginBottom: 12 },
    sectionHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: c.gray700, marginBottom: 8, marginTop: 4 },
    svcFieldLabel: { fontSize: 12, fontWeight: '600', color: c.gray700, marginBottom: 6, marginTop: 2 },
    pickerRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.gray50, borderRadius: 10, padding: 12,
      borderWidth: 1, borderColor: c.border, marginBottom: 16,
    },
    pickerRowSmall: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.background, borderRadius: 8, padding: 10,
      borderWidth: 1, borderColor: c.border, marginBottom: 10,
    },
    pickerValue: { fontSize: 14, color: c.textPrimary, fontWeight: '500', flex: 1 },
    pickerPlaceholder: { fontSize: 14, color: c.gray400, flex: 1 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface },
    chipSm: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface },
    chipActive: { backgroundColor: c.primaryLight, borderColor: c.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: c.gray500, textTransform: 'capitalize' },
    chipTextSm: { fontSize: 11, fontWeight: '600', color: c.gray500, textTransform: 'capitalize' },
    chipTextActive: { color: c.primary },
    rowHalves: { flexDirection: 'row', gap: 12 },
    halfInput: { flex: 1 },
    clauseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: c.gray50, borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: c.border },
    clauseNo: { fontSize: 12, fontWeight: '700', color: c.primary, marginTop: 1 },
    clauseText: { flex: 1, fontSize: 13, color: c.textPrimary },
    clauseAddRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12 },
    clauseInput: { flex: 1, backgroundColor: c.gray50, borderRadius: 8, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: c.textPrimary, maxHeight: 100 },
    addSvcBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    addSvcBtnText: { fontSize: 12, fontWeight: '700', color: c.primary },
    emptyText: { fontSize: 13, color: c.textMuted, marginBottom: 12, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
    svcCard: {
      backgroundColor: c.gray50, borderRadius: 12, borderWidth: 1.5, borderColor: c.border,
      padding: 14, marginBottom: 14,
    },
    svcCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    svcCardTitle: { fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
    removeBtn: { borderWidth: 1, borderColor: c.danger, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
    removeBtnText: { fontSize: 12, fontWeight: '700', color: c.danger },
  });
}
