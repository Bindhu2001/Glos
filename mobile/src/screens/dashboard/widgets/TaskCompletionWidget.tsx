import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppColors } from '../../../utils/colors';

export default function TaskCompletionWidget({
  total, done, open, overdue, blocked, colors,
}: {
  total: number; done: number; open: number; overdue: number; blocked: number; colors: AppColors;
}) {
  const s = useMemo(() => makeStyles(colors), [colors]);
  const safeTotal = Math.max(total, 1);
  const donePct = (done / safeTotal) * 100;
  const openPct = (open / safeTotal) * 100;
  const overduePct = (overdue / safeTotal) * 100;
  const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <View style={s.card}>
      <Text style={s.headTitle}>TASK COMPLETION</Text>
      <View style={s.ringRow}>
        <View style={s.ringWrap}>
          <Text style={s.ringPct}>{completionRate}%</Text>
          <Text style={s.ringSub}>complete</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.stackBarBg}>
            {donePct > 0 && <View style={[s.stackSeg, { width: `${donePct}%` as any, backgroundColor: colors.success }]} />}
            {openPct > 0 && <View style={[s.stackSeg, { width: `${openPct}%` as any, backgroundColor: colors.primary }]} />}
            {overduePct > 0 && <View style={[s.stackSeg, { width: `${overduePct}%` as any, backgroundColor: colors.danger }]} />}
          </View>
          <View style={s.legendCol}>
            <View style={s.legendRow}><View style={[s.dot, { backgroundColor: colors.success }]} /><Text style={s.legendTxt}>Completed</Text><Text style={s.legendVal}>{done}</Text></View>
            <View style={s.legendRow}><View style={[s.dot, { backgroundColor: colors.primary }]} /><Text style={s.legendTxt}>Not Started</Text><Text style={s.legendVal}>{open}</Text></View>
            {overdue > 0 && <View style={s.legendRow}><View style={[s.dot, { backgroundColor: colors.danger }]} /><Text style={s.legendTxt}>Overdue</Text><Text style={s.legendVal}>{overdue}</Text></View>}
            {blocked > 0 && <View style={s.legendRow}><View style={[s.dot, { backgroundColor: colors.warning }]} /><Text style={s.legendTxt}>Blocked</Text><Text style={s.legendVal}>{blocked}</Text></View>}
          </View>
        </View>
      </View>
      {overdue > 0 && (
        <View style={s.overdueBanner}>
          <Text style={s.overdueBannerTxt}>{overdue} task{overdue > 1 ? 's are' : ' is'} overdue</Text>
        </View>
      )}
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    card: { marginHorizontal: 16, marginTop: 12, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 16 },
    headTitle: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginBottom: 14 },
    ringRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    ringWrap: {
      width: 72, height: 72, borderRadius: 36, borderWidth: 6, borderColor: c.success,
      alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface,
    },
    ringPct: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    ringSub: { fontSize: 9, color: c.textMuted },
    stackBarBg: { flexDirection: 'row', height: 8, borderRadius: 4, backgroundColor: c.gray100, overflow: 'hidden', marginBottom: 10 },
    stackSeg: { height: 8 },
    legendCol: { gap: 4 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    legendTxt: { flex: 1, fontSize: 11, color: c.textSecondary },
    legendVal: { fontSize: 11, fontWeight: '700', color: c.textPrimary },
    overdueBanner: { marginTop: 12, backgroundColor: c.dangerLight, borderRadius: 8, padding: 8 },
    overdueBannerTxt: { fontSize: 11, fontWeight: '700', color: c.danger, textAlign: 'center' },
  });
}
