import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Platform } from 'react-native';
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
import LoadError from '../../components/common/LoadError';
import Button from '../../components/common/Button';
import DatePickerField from '../../components/common/DatePickerField';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'ProjectFinancials'>;
type Rt = RouteProp<MoreStackParamList, 'ProjectFinancials'>;

function money(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function dateOnly(d?: string | null): string {
  if (!d) return '';
  return String(d).slice(0, 10);
}

// Matches web's ProjectViewModal.jsx FinancialsPanel — owner/admin only
// (backend's requireFinanceAccess gate). API client already had
// getFinancials/listCosts/createCost/deleteCost wired but no screen called
// them; this was a real absent feature, not just a UI gap.
export default function ProjectFinancialsScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { colors } = useTheme();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<'cost' | 'invoice'>('cost');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.projects.getFinancials(params.appId, params.projectId);
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load financials.'));
    } finally {
      setLoading(false);
    }
  }, [params.appId, params.projectId]);

  useEffect(() => { load(); }, [load]);

  const addEntry = async () => {
    if (!description.trim()) return showAlert('Validation', 'Description is required.');
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return showAlert('Validation', 'Amount must be a positive number.');
    setSubmitting(true);
    try {
      await api.projects.createCost(params.appId, params.projectId, {
        kind, description: description.trim(), amount: amt, entry_date: entryDate || undefined,
      });
      setDescription(''); setAmount(''); setEntryDate('');
      await load();
    } catch (err) {
      showAlert('Could not add entry', apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const deleteEntry = (id: number) => {
    showAlert('Delete Entry', 'Remove this ledger entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.projects.deleteCost(params.appId, params.projectId, id);
            await load();
          } catch (err) {
            showAlert('Could not delete entry', apiErrorMessage(err));
          }
        },
      },
    ]);
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Financials</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : error || !data ? (
        <LoadError message={error ?? 'Could not load financials.'} onRetry={load} />
      ) : (
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {/* Overview — profit/loss once an invoice exists, cost-incurred-so-far otherwise */}
          <View style={s.card}>
            <Text style={s.cardLabel}>OVERVIEW</Text>
            <Text style={s.overviewBilling}>
              Billing: <Text style={s.overviewBillingVal}>{data.billing_type === 'per_hour' ? 'Per Hour' : 'Fixed Rate'}</Text>
            </Text>
            {data.invoiced_total > 0 ? (
              <View style={[s.overviewBox, { backgroundColor: (data.profit >= 0 ? colors.success : colors.danger) + '14', borderColor: (data.profit >= 0 ? colors.success : colors.danger) + '40' }]}>
                <Text style={s.overviewBoxLbl}>{data.profit >= 0 ? 'Profit' : 'Loss'}</Text>
                <Text style={[s.overviewBoxVal, { color: data.profit >= 0 ? colors.success : colors.danger }]}>{money(Math.abs(data.profit))}</Text>
                {data.margin_pct != null && <Text style={s.overviewMargin}>{data.margin_pct}% margin</Text>}
              </View>
            ) : (
              <View style={s.overviewBox}>
                <Text style={s.overviewBoxLbl}>Cost incurred so far</Text>
                <Text style={s.overviewBoxVal}>{money(data.total_actual_cost)}</Text>
                <Text style={s.overviewMargin}>No invoice recorded yet — profit/loss will show once one is added.</Text>
              </View>
            )}
          </View>

          {/* Summary tiles */}
          <View style={s.card}>
            <Text style={s.cardLabel}>SUMMARY</Text>
            <View style={s.summaryGrid}>
              {[
                { label: 'Billing', value: data.total_billing != null ? money(data.total_billing) : '—' },
                { label: 'Est. Cost', value: money(data.estimated_cost) },
                { label: 'Actual Cost', value: money(data.actual_labor_cost) },
                { label: 'Invoiced', value: money(data.invoiced_total) },
                { label: 'Other Costs', value: money(data.other_costs_total) },
                { label: 'Est. Hours', value: money(data.estimated_hours) },
              ].map((item) => (
                <View key={item.label} style={s.summaryTile}>
                  <Text style={s.summaryTileLbl}>{item.label.toUpperCase()}</Text>
                  <Text style={s.summaryTileVal}>{item.value}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Costs / Invoices ledgers */}
          <View style={s.card}>
            <Ledger title="Costs" entries={(data.costs ?? []).filter((c: any) => c.kind !== 'invoice')} accentColor={colors.danger} onDelete={deleteEntry} s={s} deleteColor={colors.danger} />
          </View>
          <View style={s.card}>
            <Ledger title="Invoices" entries={(data.costs ?? []).filter((c: any) => c.kind === 'invoice')} accentColor={colors.success} onDelete={deleteEntry} s={s} deleteColor={colors.danger} />
          </View>

          {/* Add entry */}
          <View style={s.card}>
            <Text style={s.cardLabel}>ADD ENTRY</Text>
            <View style={s.formRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Type *</Text>
                <View style={s.kindRow}>
                  {(['cost', 'invoice'] as const).map((k) => (
                    <TouchableOpacity key={k} style={[s.kindChip, kind === k && s.kindChipActive]} onPress={() => setKind(k)}>
                      <Text style={[s.kindChipTxt, kind === k && s.kindChipTxtActive]}>{k === 'cost' ? 'Cost' : 'Invoice'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Amount *</Text>
                <TextInput style={s.textInput} value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={colors.gray400} keyboardType="decimal-pad" />
              </View>
            </View>
            <Text style={s.fieldLabel}>Description *</Text>
            <TextInput style={s.textInput} value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor={colors.gray400} maxLength={300} />
            <View style={{ marginTop: 8 }}>
              <DatePickerField label="Date" value={entryDate} onChange={setEntryDate} />
            </View>
            <Button label="+ Add Entry" onPress={addEntry} loading={submitting} fullWidth />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Ledger({ title, entries, accentColor, deleteColor, onDelete, s }: {
  title: string; entries: any[]; accentColor: string; deleteColor: string; onDelete: (id: number) => void; s: ReturnType<typeof makeStyles>;
}) {
  const total = entries.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  return (
    <View>
      <Text style={s.cardLabel}>{title.toUpperCase()}</Text>
      {entries.length === 0 ? (
        <Text style={s.ledgerEmpty}>No entries yet.</Text>
      ) : (
        <>
          {entries.map((c: any, i: number) => (
            <View key={c.id} style={s.ledgerRow}>
              <Text style={s.ledgerSno}>{i + 1}</Text>
              <Text style={s.ledgerDesc} numberOfLines={1}>{c.description}</Text>
              <Text style={s.ledgerDate}>{dateOnly(c.entry_date)}</Text>
              <Text style={s.ledgerAmt}>{money(c.amount)}</Text>
              <TouchableOpacity onPress={() => onDelete(c.id)} hitSlop={8}>
                <Ionicons name="close" size={14} color={deleteColor} />
              </TouchableOpacity>
            </View>
          ))}
          <View style={[s.ledgerTotalRow, { backgroundColor: accentColor + '14', borderColor: accentColor + '38' }]}>
            <Text style={[s.ledgerTotalTxt, { color: accentColor }]}>Total</Text>
            <Text style={[s.ledgerTotalTxt, { color: accentColor }]}>{money(total)}</Text>
          </View>
        </>
      )}
    </View>
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
    title: { fontSize: 18, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700' },
    body: { padding: 16, paddingBottom: 40, gap: 12 },
    card: { backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 14 },
    cardLabel: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginBottom: 10 },
    overviewBilling: { fontSize: 12, color: c.textSecondary, marginBottom: 10 },
    overviewBillingVal: { fontWeight: '700', color: c.textPrimary },
    overviewBox: { borderRadius: 10, padding: 12, backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border },
    overviewBoxLbl: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
    overviewBoxVal: { fontSize: 20, fontWeight: '800', color: c.textPrimary, marginTop: 2 },
    overviewMargin: { fontSize: 11, color: c.textSecondary, marginTop: 4 },
    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    summaryTile: { width: '47%', backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 9 },
    summaryTileLbl: { fontSize: 9, fontWeight: '700', color: c.textMuted, letterSpacing: 0.4 },
    summaryTileVal: { fontSize: 13, fontWeight: '700', color: c.textPrimary, marginTop: 2 },
    ledgerEmpty: { fontSize: 12, color: c.textMuted },
    ledgerRow: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border, borderRadius: 6,
      paddingHorizontal: 8, paddingVertical: 6, marginBottom: 4,
    },
    ledgerSno: { fontSize: 10, fontWeight: '700', color: c.textMuted, minWidth: 14 },
    ledgerDesc: { flex: 1, fontSize: 11, color: c.textPrimary },
    ledgerDate: { fontSize: 10, color: c.textMuted },
    ledgerAmt: { fontSize: 11, fontWeight: '700', color: c.textPrimary },
    ledgerTotalRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6, marginTop: 2,
    },
    ledgerTotalTxt: { fontSize: 11, fontWeight: '700' },
    formRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
    fieldLabel: { fontSize: 10, fontWeight: '600', color: c.textMuted, marginBottom: 4, marginTop: 8 },
    textInput: {
      backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: c.textPrimary,
    },
    kindRow: { flexDirection: 'row', gap: 6 },
    kindChip: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border },
    kindChipActive: { backgroundColor: c.primaryLight, borderColor: c.primary },
    kindChipTxt: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
    kindChipTxtActive: { color: c.primary, fontWeight: '700' },
  });
}
