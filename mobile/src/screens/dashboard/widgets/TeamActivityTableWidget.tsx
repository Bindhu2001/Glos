import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { AppColors } from '../../../utils/colors';
import { useApi } from '../../../hooks/useApi';

interface ActivityMember {
  user_id: number;
  name: string;
  role?: string;
  created: number;
  completed: number;
  hours: number;
  on_time_pct: number | null;
}

type Period = 'today' | 'yesterday' | 'week' | 'month';

export default function TeamActivityTableWidget({
  appId, isAdmin, scope, viewAs, colors,
}: {
  appId: number;
  isAdmin: boolean;
  scope: 'direct' | 'all' | 'admin';
  viewAs: number | null;
  colors: AppColors;
}) {
  const api = useApi();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [period, setPeriod] = useState<Period>('month');
  const [members, setMembers] = useState<ActivityMember[]>([]);

  const load = useCallback(async () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const params: Record<string, unknown> = { period, ...(period === 'month' ? { month } : {}) };
    try {
      const res = await api.dashboard.getManagerActivityByMember(appId, { ...params, scope, view_as: viewAs ?? undefined });
      setMembers(res.data?.members ?? []);
    } catch {
      setMembers([]);
    }
  }, [appId, scope, viewAs, period]);

  useEffect(() => { load(); }, [load]);

  const totalCreated = members.reduce((a, m) => a + (m.created ?? 0), 0);
  const totalCompleted = members.reduce((a, m) => a + (m.completed ?? 0), 0);
  const totalHours = members.reduce((a, m) => a + (m.hours ?? 0), 0);
  const otRates = members.map((m) => m.on_time_pct).filter((x): x is number => x != null);
  const avgOnTime = otRates.length ? Math.round(otRates.reduce((a, b) => a + b, 0) / otRates.length) : null;

  return (
    <View style={s.card}>
      <Text style={s.headTitle}>TEAM ACTIVITY</Text>
      <View style={s.periodRow}>
        {(['today', 'yesterday', 'week', 'month'] as Period[]).map((p) => (
          <TouchableOpacity key={p} style={[s.periodBtn, period === p && s.periodBtnActive]} onPress={() => setPeriod(p)}>
            <Text style={[s.periodTxt, period === p && s.periodTxtActive]}>{p[0].toUpperCase() + p.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={s.kpiRow}>
        <View style={s.kpiCell}><Text style={s.kpiVal}>{totalCreated}</Text><Text style={s.kpiLbl}>Assigned</Text></View>
        <View style={s.kpiCell}><Text style={s.kpiVal}>{totalCompleted}</Text><Text style={s.kpiLbl}>Completed</Text></View>
        <View style={s.kpiCell}><Text style={s.kpiVal}>{totalHours.toFixed(1)}h</Text><Text style={s.kpiLbl}>Hours</Text></View>
        <View style={s.kpiCell}><Text style={s.kpiVal}>{avgOnTime != null ? `${avgOnTime}%` : '—'}</Text><Text style={s.kpiLbl}>On Time</Text></View>
      </View>
      {members.length === 0 ? (
        <Text style={s.emptyTxt}>No activity for this period</Text>
      ) : (
        <>
          <View style={s.tableHead}>
            <Text style={s.thName}>Employee</Text>
            <Text style={s.thCol}>Done</Text>
            <Text style={s.thCol}>Hrs</Text>
            <Text style={s.thCol}>OT%</Text>
          </View>
          {members.map((m) => {
            const otColor = m.on_time_pct == null ? colors.textMuted : m.on_time_pct >= 80 ? colors.success : m.on_time_pct >= 50 ? colors.warning : colors.danger;
            return (
              <View key={m.user_id} style={s.row}>
                <Text style={s.rowName} numberOfLines={1}>{m.name}</Text>
                <Text style={s.rowCol}>{m.completed}</Text>
                <Text style={s.rowCol}>{(m.hours ?? 0).toFixed(1)}</Text>
                <Text style={[s.rowCol, { color: otColor, fontWeight: '700' }]}>{m.on_time_pct != null ? `${m.on_time_pct}%` : '—'}</Text>
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    card: { marginHorizontal: 16, marginTop: 12, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 16 },
    headTitle: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginBottom: 12 },
    periodRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
    periodBtn: { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center', backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border },
    periodBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    periodTxt: { fontSize: 10.5, fontWeight: '700', color: c.textSecondary },
    periodTxtActive: { color: '#fff' },
    kpiRow: { flexDirection: 'row', marginBottom: 12 },
    kpiCell: { flex: 1, alignItems: 'center' },
    kpiVal: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    kpiLbl: { fontSize: 9, color: c.textMuted, marginTop: 2 },
    emptyTxt: { fontSize: 12, color: c.textMuted, textAlign: 'center', paddingVertical: 12 },
    tableHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.border, paddingBottom: 6, marginBottom: 4 },
    thName: { flex: 1, fontSize: 10, fontWeight: '700', color: c.textMuted },
    thCol: { width: 44, fontSize: 10, fontWeight: '700', color: c.textMuted, textAlign: 'right' },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border },
    rowName: { flex: 1, fontSize: 12, fontWeight: '600', color: c.textPrimary },
    rowCol: { width: 44, fontSize: 12, color: c.textSecondary, textAlign: 'right' },
  });
}
