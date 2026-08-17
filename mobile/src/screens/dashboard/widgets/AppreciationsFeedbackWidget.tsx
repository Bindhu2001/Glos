import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { AppColors } from '../../../utils/colors';

interface Member {
  user_id: number;
  name: string;
  appr_received: number;
  appr_given: number;
  fb_received: number;
  fb_given: number;
}

export default function AppreciationsFeedbackWidget({
  members, totalAppr, totalFb, colors,
}: {
  members: Member[];
  totalAppr: number;
  totalFb: number;
  colors: AppColors;
}) {
  const s = useMemo(() => makeStyles(colors), [colors]);
  if (members.length === 0) return null;

  const givenAppr = members.reduce((s2, m) => s2 + (m.appr_given ?? 0), 0);
  const givenFb = members.reduce((s2, m) => s2 + (m.fb_given ?? 0), 0);

  return (
    <View style={s.card}>
      <Text style={s.headTitle}>APPRECIATIONS &amp; FEEDBACK</Text>
      <View style={s.kpiRow}>
        <View style={s.kpiCell}><Text style={s.kpiVal}>{totalAppr}</Text><Text style={s.kpiLbl}>Appr. Received</Text></View>
        <View style={s.kpiCell}><Text style={s.kpiVal}>{givenAppr}</Text><Text style={s.kpiLbl}>Appr. Given</Text></View>
        <View style={s.kpiCell}><Text style={s.kpiVal}>{totalFb}</Text><Text style={s.kpiLbl}>Fdbk Received</Text></View>
        <View style={s.kpiCell}><Text style={s.kpiVal}>{givenFb}</Text><Text style={s.kpiLbl}>Fdbk Given</Text></View>
      </View>
      <View style={s.tableHead}>
        <Text style={[s.thName]}>Employee</Text>
        <Text style={s.thCol}>Appr R/G</Text>
        <Text style={s.thCol}>Fdbk R/G</Text>
      </View>
      {/* Fixed maxHeight so this scrolls within its own box (~10 rows) once
          the team is large, instead of growing the whole page. */}
      <ScrollView style={s.tableScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        {members.map((m) => (
          <View key={m.user_id} style={s.row}>
            <Text style={s.rowName} numberOfLines={1}>{m.name}</Text>
            <Text style={s.rowCol} numberOfLines={1}>{m.appr_received}/{m.appr_given}</Text>
            <Text style={s.rowCol} numberOfLines={1}>{m.fb_received}/{m.fb_given}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    card: { marginHorizontal: 16, marginTop: 12, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 16 },
    headTitle: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginBottom: 12 },
    kpiRow: { flexDirection: 'row', marginBottom: 14 },
    kpiCell: { flex: 1, alignItems: 'center' },
    kpiVal: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    kpiLbl: { fontSize: 8.5, color: c.textMuted, marginTop: 2, textAlign: 'center' },
    tableHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.border, paddingBottom: 6, marginBottom: 4 },
    tableScroll: { maxHeight: 290 },
    thName: { flex: 1, fontSize: 10, fontWeight: '700', color: c.textMuted },
    thCol: { width: 64, fontSize: 10, fontWeight: '700', color: c.textMuted, textAlign: 'right' },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border },
    rowName: { flex: 1, fontSize: 12, fontWeight: '600', color: c.textPrimary },
    rowCol: { width: 64, fontSize: 12, color: c.textSecondary, textAlign: 'right' },
  });
}
