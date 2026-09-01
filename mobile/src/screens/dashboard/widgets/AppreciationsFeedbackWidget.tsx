import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../utils/colors';
import { useApi } from '../../../hooks/useApi';

interface Member {
  user_id: number;
  name: string;
  appr_received: number;
  appr_given: number;
  fb_received: number;
  fb_given: number;
  appr_received_days_ago: number | null;
  appr_given_days_ago: number | null;
  fb_received_days_ago: number | null;
  fb_given_days_ago: number | null;
}

// Matches web's TeamDashboard.jsx last12MonthOptions() — same helper as
// BusinessReviewsTableWidget, duplicated locally to keep each widget
// self-contained (each has its own independently-browsable month, matching
// web's ApprFeedSection having its own picker separate from the others).
function buildMonthOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    opts.push({ value, label });
  }
  return opts;
}

// Matches web's daysAgoLabel/daysColor in TeamDashboard.jsx exactly.
function daysAgoLabel(days: number | null) {
  if (days == null) return 'Never';
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}
function daysColor(days: number | null, c: AppColors) {
  if (days == null) return c.textMuted;
  if (days <= 7) return c.success;
  if (days <= 30) return '#d97706';
  return c.danger;
}

export default function AppreciationsFeedbackWidget({
  appId, mgrScope, viewAs, colors,
}: {
  appId: number;
  mgrScope: 'direct' | 'all' | 'admin';
  viewAs: number | null;
  colors: AppColors;
}) {
  const api = useApi();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const monthOptions = useMemo(buildMonthOptions, []);
  const [month, setMonth] = useState(monthOptions[0].value);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [totals, setTotals] = useState({ total_appr: 0, total_fb: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const scope = mgrScope === 'all' ? 'team' : mgrScope;
    const params: Record<string, unknown> = { scope, month };
    if (mgrScope === 'all' && viewAs != null) params.view_as = viewAs;
    try {
      const res = await api.appreciations.getTeamStats(appId, params as any);
      setMembers(res.data?.members ?? []);
      setTotals({ total_appr: res.data?.total_appr ?? 0, total_fb: res.data?.total_fb ?? 0 });
      setError(false);
    } catch {
      setMembers([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [api, appId, mgrScope, viewAs, month]);

  useEffect(() => { load(); }, [load]);

  const monthLabel = month === monthOptions[0].value
    ? 'This Month'
    : monthOptions.find((o) => o.value === month)?.label ?? month;

  if (!loading && !error && members.length === 0) return null;

  const givenAppr = members.reduce((s2, m) => s2 + (m.appr_given ?? 0), 0);
  const givenFb = members.reduce((s2, m) => s2 + (m.fb_given ?? 0), 0);

  return (
    <View style={s.card}>
      <View style={s.headRow}>
        <Text style={s.headTitle}>APPRECIATIONS &amp; FEEDBACK</Text>
        <TouchableOpacity style={s.monthBtn} onPress={() => setPickerOpen(true)}>
          <Text style={s.monthBtnTxt} numberOfLines={1}>{monthLabel}</Text>
          <Ionicons name="chevron-down" size={13} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {error ? (
        <TouchableOpacity onPress={load}>
          <Text style={s.emptyTxt}>Could not load appreciations &amp; feedback. Tap to retry.</Text>
        </TouchableOpacity>
      ) : loading ? (
        <Text style={s.emptyTxt}>Loading…</Text>
      ) : (
        <>
          <View style={s.kpiRow}>
            <View style={s.kpiCell}><Text style={s.kpiVal}>{totals.total_appr}</Text><Text style={s.kpiLbl}>Appr. Received</Text></View>
            <View style={s.kpiCell}><Text style={s.kpiVal}>{givenAppr}</Text><Text style={s.kpiLbl}>Appr. Given</Text></View>
            <View style={s.kpiCell}><Text style={s.kpiVal}>{totals.total_fb}</Text><Text style={s.kpiLbl}>Fdbk Received</Text></View>
            <View style={s.kpiCell}><Text style={s.kpiVal}>{givenFb}</Text><Text style={s.kpiLbl}>Fdbk Given</Text></View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: TABLE_WIDTH }}>
            <View style={{ minWidth: TABLE_WIDTH }}>
              <View style={s.tableHead}>
                <Text style={[s.thName, { width: COL.name }]}>Employee</Text>
                <Text style={[s.thCol, { width: COL.stat }]}>Appr R/G</Text>
                <Text style={[s.thCol, { width: COL.stat }]}>Fdbk R/G</Text>
                <Text style={[s.thCol, { width: COL.date }]}>Last Appr{'\n'}Recv/Given</Text>
                <Text style={[s.thCol, { width: COL.date }]}>Last Fdbk{'\n'}Recv/Given</Text>
              </View>
              <ScrollView style={s.tableScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {members.map((m) => (
                  <View key={m.user_id} style={s.row}>
                    <Text style={[s.rowName, { width: COL.name }]} numberOfLines={1}>{m.name}</Text>
                    <Text style={[s.rowCol, { width: COL.stat }]} numberOfLines={1}>{m.appr_received}/{m.appr_given}</Text>
                    <Text style={[s.rowCol, { width: COL.stat }]} numberOfLines={1}>{m.fb_received}/{m.fb_given}</Text>
                    <View style={{ width: COL.date }}>
                      <Text style={[s.rowDate, { color: daysColor(m.appr_received_days_ago, colors) }]} numberOfLines={1}>{daysAgoLabel(m.appr_received_days_ago)}</Text>
                      <Text style={[s.rowDate, { color: daysColor(m.appr_given_days_ago, colors) }]} numberOfLines={1}>{daysAgoLabel(m.appr_given_days_ago)}</Text>
                    </View>
                    <View style={{ width: COL.date }}>
                      <Text style={[s.rowDate, { color: daysColor(m.fb_received_days_ago, colors) }]} numberOfLines={1}>{daysAgoLabel(m.fb_received_days_ago)}</Text>
                      <Text style={[s.rowDate, { color: daysColor(m.fb_given_days_ago, colors) }]} numberOfLines={1}>{daysAgoLabel(m.fb_given_days_ago)}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          </ScrollView>
        </>
      )}

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setPickerOpen(false)}>
          <View style={s.monthModalCard}>
            <Text style={s.monthModalTitle}>Select Month</Text>
            <FlatList
              data={monthOptions}
              keyExtractor={(o) => o.value}
              style={{ maxHeight: 340 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.monthOption, item.value === month && s.monthOptionActive]}
                  onPress={() => { setMonth(item.value); setPickerOpen(false); }}
                >
                  <Text style={[s.monthOptionTxt, item.value === month && s.monthOptionTxtActive]}>{item.label}</Text>
                  {item.value === month && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const COL = { name: 130, stat: 64, date: 90 };
const COL_GAP = 14;
const TABLE_WIDTH = COL.name + COL.stat * 2 + COL.date * 2 + 4 * COL_GAP;

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    card: { marginHorizontal: 16, marginTop: 12, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 16 },
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
    headTitle: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1 },
    monthBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 6,
    },
    monthBtnTxt: { fontSize: 11, fontWeight: '700', color: c.textPrimary },
    emptyTxt: { fontSize: 12, color: c.textMuted, textAlign: 'center', paddingVertical: 12 },
    kpiRow: { flexDirection: 'row', marginBottom: 14 },
    kpiCell: { flex: 1, alignItems: 'center' },
    kpiVal: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    kpiLbl: { fontSize: 8.5, color: c.textMuted, marginTop: 2, textAlign: 'center' },
    tableHead: { flexDirection: 'row', gap: COL_GAP, borderBottomWidth: 1, borderBottomColor: c.border, paddingBottom: 6, marginBottom: 4 },
    tableScroll: { maxHeight: 290 },
    thName: { fontSize: 10, fontWeight: '700', color: c.textMuted },
    thCol: { fontSize: 9.5, fontWeight: '700', color: c.textMuted, textAlign: 'right' },
    row: { flexDirection: 'row', alignItems: 'center', gap: COL_GAP, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border },
    rowName: { fontSize: 12, fontWeight: '600', color: c.textPrimary },
    rowCol: { fontSize: 12, color: c.textSecondary, textAlign: 'right' },
    rowDate: { fontSize: 10, textAlign: 'right' },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
    monthModalCard: { backgroundColor: c.surface, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: c.border },
    monthModalTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary, padding: 10 },
    monthOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10 },
    monthOptionActive: { backgroundColor: c.primaryLight },
    monthOptionTxt: { fontSize: 14, color: c.textPrimary },
    monthOptionTxtActive: { fontWeight: '700', color: c.primary },
  });
}
