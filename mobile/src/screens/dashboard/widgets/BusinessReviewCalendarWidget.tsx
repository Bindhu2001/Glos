import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../../hooks/useApi';
import { AppColors } from '../../../utils/colors';

interface Review {
  id: number;
  review_date: string;
  status: 'open' | 'closed';
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export default function BusinessReviewCalendarWidget({
  appId, mode, hasReportees, meId, colors,
}: {
  appId: number;
  mode: 'my' | 'team';
  hasReportees?: boolean;
  meId?: number;
  colors: AppColors;
}) {
  const api = useApi();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [cursor, setCursor] = useState(() => new Date());
  const [reviews, setReviews] = useState<Review[]>([]);

  const load = useCallback(async () => {
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const params = { type: 'daily', from: ymd(from), to: ymd(to), per_page: 100 };
    try {
      if (mode === 'team') {
        const res = await api.businessReviews.list(appId, { ...params, manager_id: meId });
        setReviews(res.data?.reviews ?? res.data ?? []);
      } else {
        const calls = [api.businessReviews.list(appId, { ...params, attendee_only: 'true' })];
        if (hasReportees) calls.push(api.businessReviews.list(appId, { ...params, own_only: 'true' }));
        const results = await Promise.all(calls);
        const merged = new Map<number, Review>();
        for (const r of results) {
          const items: Review[] = r.data?.reviews ?? r.data ?? [];
          for (const item of items) merged.set(item.id, item);
        }
        setReviews(Array.from(merged.values()));
      }
    } catch {
      setReviews([]);
    }
  }, [appId, mode, hasReportees, meId, cursor.getFullYear(), cursor.getMonth()]);

  useEffect(() => { load(); }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, Review[]>();
    for (const r of reviews) {
      const key = (r.review_date ?? '').slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [reviews]);

  const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const startOffset = firstOfMonth.getDay();
  const cells: Array<{ day: number; key: string } | null> = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, key: `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(d)}` });
  }

  return (
    <View style={s.card}>
      <View style={s.headRow}>
        <Text style={s.headTitle}>BUSINESS REVIEW CALENDAR</Text>
      </View>
      <View style={s.navRow}>
        <TouchableOpacity onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
          <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={s.monthLabel}>{MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}</Text>
        <TouchableOpacity onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={s.dowRow}>
        {DOW.map((d, i) => <Text key={i} style={s.dowTxt}>{d}</Text>)}
      </View>
      <View style={s.grid}>
        {cells.map((c, i) => {
          if (!c) return <View key={i} style={s.cell} />;
          const dayReviews = byDay.get(c.key) ?? [];
          const hasOpen = dayReviews.some((r) => r.status === 'open');
          const hasClosed = dayReviews.some((r) => r.status === 'closed');
          const isToday = c.key === ymd(new Date());
          return (
            <View key={i} style={[s.cell, isToday && s.cellToday]}>
              <Text style={[s.dayTxt, isToday && s.dayTxtToday]}>{c.day}</Text>
              {(hasOpen || hasClosed) && (
                <View style={s.dotRow}>
                  {hasOpen && <View style={[s.dot, { backgroundColor: colors.warning }]} />}
                  {hasClosed && <View style={[s.dot, { backgroundColor: colors.success }]} />}
                </View>
              )}
            </View>
          );
        })}
      </View>
      <View style={s.legendRow}>
        <View style={s.legendItem}><View style={[s.dot, { backgroundColor: colors.warning }]} /><Text style={s.legendTxt}>Open</Text></View>
        <View style={s.legendItem}><View style={[s.dot, { backgroundColor: colors.success }]} /><Text style={s.legendTxt}>Completed</Text></View>
      </View>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    card: { marginHorizontal: 16, marginTop: 12, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 16 },
    headRow: { marginBottom: 10 },
    headTitle: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1 },
    navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    monthLabel: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    dowRow: { flexDirection: 'row' },
    dowTxt: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', color: c.textMuted, marginBottom: 4 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
    cellToday: { backgroundColor: c.primaryLight, borderRadius: 8 },
    dayTxt: { fontSize: 11, color: c.textSecondary },
    dayTxtToday: { color: c.primary, fontWeight: '800' },
    dotRow: { flexDirection: 'row', gap: 2, marginTop: 2 },
    dot: { width: 5, height: 5, borderRadius: 3 },
    legendRow: { flexDirection: 'row', gap: 16, marginTop: 10, justifyContent: 'center' },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendTxt: { fontSize: 11, color: c.textSecondary },
  });
}
