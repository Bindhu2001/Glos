import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../utils/colors';
import { useApi } from '../../../hooks/useApi';

interface TypeCount {
  open: number;
  closed: number;
  total: number;
}

interface ManagerStat {
  manager_user_id: number;
  name: string;
  daily: TypeCount;
  weekly: TypeCount;
  monthly: TypeCount;
}

// Matches web's TeamDashboard.jsx last12MonthOptions().
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

const AVATAR_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#0891b2', '#ef4444', '#0d9488', '#d946ef'];
function avatarColor(userId: number) {
  return AVATAR_COLORS[userId % AVATAR_COLORS.length];
}
function initials(name?: string) {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

const COL = { sno: 36, name: 148, stat: 84 };
// Gap between columns — matches TeamActivityTableWidget's spacing so the two
// Team Dashboard tables read consistently rather than looking smashed together.
const COL_GAP = 16;
// sno, name, Daily, Weekly, Monthly = 5 columns, 4 gaps.
const TABLE_WIDTH = COL.sno + COL.name + COL.stat * 3 + 4 * COL_GAP;

// Matches web's TeamDashboard.jsx <BizReviewsTable /> — per-manager rollup of
// daily/weekly/monthly Business Review check-ins, only shown on the Team
// Dashboard (mobile has no separate "manager mode" — this widget is gated
// the same way the rest of the Team tab already is, by the caller).
export default function BusinessReviewsTableWidget({
  appId, mgrScope, viewAs, meId, colors,
}: {
  appId: number;
  mgrScope: 'direct' | 'all' | 'admin';
  viewAs: number | null;
  meId: number;
  colors: AppColors;
}) {
  const api = useApi();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const monthOptions = useMemo(buildMonthOptions, []);
  const [month, setMonth] = useState(monthOptions[0].value);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stats, setStats] = useState<ManagerStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, unknown> = { month };
    if (mgrScope === 'direct') params.manager_id = meId;
    else if (mgrScope === 'all' && viewAs != null) params.manager_id = viewAs;
    try {
      const res = await api.businessReviews.dashboard(appId, params);
      setStats(res.data?.manager_stats ?? []);
      setError(false);
    } catch {
      setStats([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [appId, mgrScope, viewAs, meId, month]);

  useEffect(() => { load(); }, [load]);

  const monthLabel = month === monthOptions[0].value
    ? 'This Month'
    : monthOptions.find((o) => o.value === month)?.label ?? month;

  return (
    <View style={s.card}>
      <View style={s.headRow}>
        <Text style={s.headTitle}>BUSINESS REVIEWS</Text>
        <TouchableOpacity style={s.monthBtn} onPress={() => setPickerOpen(true)}>
          <Text style={s.monthBtnTxt} numberOfLines={1}>{monthLabel}</Text>
          <Ionicons name="chevron-down" size={13} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {error ? (
        <TouchableOpacity onPress={load}>
          <Text style={s.emptyTxt}>Could not load business reviews. Tap to retry.</Text>
        </TouchableOpacity>
      ) : loading ? (
        <Text style={s.emptyTxt}>Loading…</Text>
      ) : stats.length === 0 ? (
        <Text style={s.emptyTxt}>No reviews found for this month.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: TABLE_WIDTH }}>
          <View style={{ minWidth: TABLE_WIDTH }}>
            <View style={s.tableHead}>
              <Text style={[s.th, { width: COL.sno }]}>S.No</Text>
              <Text style={[s.th, s.alignLeft, { width: COL.name }]}>Manager</Text>
              <Text style={[s.th, { width: COL.stat }]}>Daily{'\n'}Check-ins</Text>
              <Text style={[s.th, { width: COL.stat }]}>Weekly</Text>
              <Text style={[s.th, { width: COL.stat }]}>Monthly</Text>
            </View>
            <ScrollView style={s.tableScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {stats.map((m, idx) => (
                <View key={m.manager_user_id} style={s.row}>
                  <Text style={[s.rowCell, { width: COL.sno }]}>{idx + 1}</Text>
                  <View style={[s.nameCell, { width: COL.name }]}>
                    <View style={[s.avatar, { backgroundColor: avatarColor(m.manager_user_id) }]}>
                      <Text style={s.avatarTxt}>{initials(m.name)}</Text>
                    </View>
                    <Text style={s.rowName} numberOfLines={1}>{m.name}</Text>
                  </View>
                  <TypeCounts data={m.daily} width={COL.stat} s={s} />
                  <TypeCounts data={m.weekly} width={COL.stat} s={s} />
                  <TypeCounts data={m.monthly} width={COL.stat} s={s} />
                </View>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
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

function TypeCounts({ data, width, s }: { data: TypeCount; width: number; s: ReturnType<typeof makeStyles> }) {
  return (
    <View style={{ width, alignItems: 'flex-end' }}>
      <Text style={s.countCreated}>{data.total} created</Text>
      <Text style={s.countDone}>{data.closed} done</Text>
    </View>
  );
}

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
    tableHead: { flexDirection: 'row', gap: COL_GAP, borderBottomWidth: 1, borderBottomColor: c.border, paddingBottom: 6, marginBottom: 4 },
    tableScroll: { maxHeight: 280 },
    th: { fontSize: 9.5, fontWeight: '700', color: c.textMuted, textAlign: 'right' },
    alignLeft: { textAlign: 'left' },
    row: { flexDirection: 'row', alignItems: 'center', gap: COL_GAP, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    rowCell: { fontSize: 12, color: c.textSecondary, textAlign: 'right' },
    nameCell: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    avatar: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    avatarTxt: { fontSize: 10, fontWeight: '800', color: '#fff' },
    rowName: { flex: 1, fontSize: 12, fontWeight: '600', color: c.textPrimary },
    countCreated: { fontSize: 11.5, fontWeight: '600', color: c.primary },
    countDone: { fontSize: 11, color: c.success, marginTop: 1 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
    monthModalCard: { backgroundColor: c.surface, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: c.border },
    monthModalTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary, padding: 10 },
    monthOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10 },
    monthOptionActive: { backgroundColor: c.primaryLight },
    monthOptionTxt: { fontSize: 14, color: c.textPrimary },
    monthOptionTxtActive: { fontWeight: '700', color: c.primary },
  });
}
