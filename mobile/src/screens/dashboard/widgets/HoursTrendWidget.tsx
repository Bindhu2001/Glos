import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { AppColors } from '../../../utils/colors';

type Mode = 'daily' | 'weekly' | 'monthly';

interface TrendPoint { minutes: number; day?: string; week?: string; month?: string }

export default function HoursTrendWidget({
  daily, weekly, monthly, colors,
}: {
  daily: TrendPoint[];
  weekly: TrendPoint[];
  monthly: TrendPoint[];
  colors: AppColors;
}) {
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [mode, setMode] = useState<Mode>('daily');

  const data = mode === 'daily' ? daily : mode === 'weekly' ? weekly : monthly;
  const hours = data.map((d) => (d.minutes ?? 0) / 60);
  const maxHrs = Math.max(...hours, 8, 0.1);
  const avg = hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : 0;
  const peak = hours.length ? Math.max(...hours) : 0;
  const total = hours.reduce((a, b) => a + b, 0);

  function label(d: TrendPoint, i: number) {
    if (mode === 'daily' && d.day) return new Date(d.day).getDate().toString();
    if (mode === 'weekly' && d.week) return `W${d.week.split('-W')[1] ?? i + 1}`;
    if (mode === 'monthly' && d.month) return d.month.slice(5);
    return `${i + 1}`;
  }

  return (
    <View style={s.card}>
      <View style={s.headRow}>
        <Text style={s.headTitle}>HOURS LOGGED TREND</Text>
      </View>
      <View style={s.tabRow}>
        {(['daily', 'weekly', 'monthly'] as Mode[]).map((m) => (
          <TouchableOpacity key={m} style={[s.tab, mode === m && s.tabActive]} onPress={() => setMode(m)}>
            <Text style={[s.tabTxt, mode === m && s.tabTxtActive]}>{m === 'daily' ? '14 Days' : m === 'weekly' ? '8 Weeks' : '12 Months'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {data.length === 0 ? (
        <Text style={s.emptyTxt}>No hours logged yet</Text>
      ) : (
        <>
          <View style={s.chartArea}>
            {/* 8h target line */}
            <View style={[s.targetLine, { bottom: `${Math.min((8 / maxHrs) * 100, 100)}%` as any }]} />
            <View style={s.barsRow}>
              {data.map((d, i) => {
                const h = (d.minutes ?? 0) / 60;
                const pct = Math.max((h / maxHrs) * 100, 2);
                return (
                  <View key={i} style={s.barCol}>
                    <View style={s.barTrack}>
                      <View style={[s.barFill, { height: `${pct}%` as any, backgroundColor: h >= 8 ? colors.success : colors.primary }]} />
                    </View>
                    <Text style={s.barLabel} numberOfLines={1}>{label(d, i)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
          <View style={s.summaryRow}>
            <View style={s.summaryCell}><Text style={s.summaryVal}>{avg.toFixed(1)}h</Text><Text style={s.summaryLbl}>Avg</Text></View>
            <View style={s.summaryCell}><Text style={s.summaryVal}>{peak.toFixed(1)}h</Text><Text style={s.summaryLbl}>Peak</Text></View>
            <View style={s.summaryCell}><Text style={s.summaryVal}>{total.toFixed(1)}h</Text><Text style={s.summaryLbl}>Total</Text></View>
          </View>
        </>
      )}
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    card: { marginHorizontal: 16, marginTop: 12, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 16 },
    headRow: { marginBottom: 10 },
    headTitle: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1 },
    tabRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
    tab: { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center', backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border },
    tabActive: { backgroundColor: c.primary, borderColor: c.primary },
    tabTxt: { fontSize: 11, fontWeight: '700', color: c.textSecondary },
    tabTxtActive: { color: '#fff' },
    emptyTxt: { fontSize: 12, color: c.textMuted, textAlign: 'center', paddingVertical: 20 },
    chartArea: { height: 120, position: 'relative' },
    targetLine: { position: 'absolute', left: 0, right: 0, height: 1, borderTopWidth: 1, borderStyle: 'dashed', borderColor: c.warning },
    barsRow: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 3 },
    barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
    barTrack: { width: '70%', height: 100, justifyContent: 'flex-end' },
    barFill: { width: '100%', borderRadius: 3, minHeight: 2 },
    barLabel: { fontSize: 8, color: c.textMuted, marginTop: 4 },
    summaryRow: { flexDirection: 'row', marginTop: 12, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 },
    summaryCell: { flex: 1, alignItems: 'center' },
    summaryVal: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    summaryLbl: { fontSize: 10, color: c.textMuted, marginTop: 2 },
  });
}
