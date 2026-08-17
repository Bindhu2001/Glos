import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Line, Path, Circle, Rect, Text as SvgText } from 'react-native-svg';
import { AppColors } from '../../../utils/colors';

type Mode = 'daily' | 'weekly' | 'monthly';

interface TrendPoint { minutes: number; day?: string; week?: string; month?: string }

const TARGET_MIN = 8 * 60;

function fmtHours(minutes: number) {
  return (minutes / 60).toFixed(1);
}

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
  const total = hours.reduce((a, b) => a + b, 0);
  const nonZeroCount = hours.filter((h) => h > 0).length;
  const avg = nonZeroCount ? total / nonZeroCount : 0;
  const peak = hours.length ? Math.max(...hours) : 0;

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
          {/* Negative horizontal margin lets just the chart (not the header,
              tabs, or summary row) bleed past the card's normal padding, so it
              reads as noticeably wider without touching the card's edges. */}
          <View style={s.chartWrap}>
            <HoursAreaChart data={data} label={label} colors={colors} />
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

// Mirrors web's HoursAreaChart (MyDashboard.jsx): gradient line with point
// circles, dashed gridlines, an 8h target reference line, and a value callout
// bubble on the peak point — web's "hour indication" the bar chart lacked.
function HoursAreaChart({
  data, label, colors,
}: {
  data: TrendPoint[];
  label: (d: TrendPoint, i: number) => string;
  colors: AppColors;
}) {
  const W = 320;
  const H = 150;
  const PAD = { t: 26, r: 0, b: 22, l: 0 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;
  const n = data.length;

  const mins = data.map((d) => d.minutes ?? 0);
  const maxMin = Math.max(...mins, TARGET_MIN, 1);

  const xOf = (i: number) => PAD.l + (n <= 1 ? chartW / 2 : (i / (n - 1)) * chartW);
  const yOf = (v: number) => PAD.t + chartH - (v / maxMin) * chartH;

  const pts = data.map((d, i) => [xOf(i), yOf(d.minutes ?? 0)] as const);
  const linePath = `M${pts[0][0]},${pts[0][1]} ` + pts.slice(1).map(([x, y]) => `L${x},${y}`).join(' ');

  const targetY = yOf(TARGET_MIN);
  const peakIdx = mins.reduce((best, v, i) => (v > mins[best] ? i : best), 0);
  const peakVal = mins[peakIdx] ?? 0;
  const peakX = xOf(peakIdx);
  const peakY = yOf(peakVal);
  const peakLabel = `${fmtHours(peakVal)}h`;
  // A fixed 20px half-width fit "137.6h" but clipped shorter labels like
  // "38.8h" — bold digits at this font size render wider per-character than
  // that flat number assumed. Scale with the actual label length instead,
  // with the old value as a floor so short labels ("8.0h") don't get a
  // needlessly wide pill.
  const bubbleHalfW = Math.max(20, Math.ceil(peakLabel.length * 3.4) + 6);
  const peakBubbleCx = Math.min(Math.max(peakX, bubbleHalfW + 2), W - bubbleHalfW - 2);

  const xLabelIdxs = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <LinearGradient id="hoursLineGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.4} />
          <Stop offset="50%" stopColor={colors.primary} stopOpacity={1} />
          <Stop offset="100%" stopColor={colors.primary} stopOpacity={0.6} />
        </LinearGradient>
      </Defs>

      {[0.25, 0.5, 0.75, 1].map((f) => (
        <Line
          key={f}
          x1={PAD.l} y1={PAD.t + chartH * (1 - f)}
          x2={W - PAD.r} y2={PAD.t + chartH * (1 - f)}
          stroke={colors.border} strokeWidth={0.6} strokeDasharray="4,4"
        />
      ))}

      {TARGET_MIN <= maxMin && (
        <Line
          x1={PAD.l} y1={targetY} x2={W - PAD.r} y2={targetY}
          stroke={colors.warning} strokeWidth={1.2} strokeDasharray="5,4" opacity={0.65}
        />
      )}

      <Path d={linePath} stroke="url(#hoursLineGrad)" strokeWidth={2.2} fill="none" strokeLinejoin="round" strokeLinecap="round" />

      {pts.map(([x, y], i) => (
        (data[i].minutes ?? 0) > 0 && (
          <Circle key={i} cx={x} cy={y} r={3.2} fill={colors.surface} stroke={colors.primary} strokeWidth={2} />
        )
      ))}

      {peakVal > 0 && (
        <>
          <Rect x={peakBubbleCx - bubbleHalfW} y={peakY - 21} width={bubbleHalfW * 2} height={15} rx={4} fill={colors.primary} opacity={0.92} />
          <SvgText x={peakBubbleCx} y={peakY - 10} textAnchor="middle" fontSize={9} fill="#fff" fontWeight="700">
            {peakLabel}
          </SvgText>
        </>
      )}

      {xLabelIdxs.map((i, idx) => (
        <SvgText
          key={i} x={xOf(i)} y={H - 4} fontSize={9} fill={colors.textMuted}
          textAnchor={idx === 0 ? 'start' : idx === xLabelIdxs.length - 1 ? 'end' : 'middle'}
        >
          {label(data[i], i)}
        </SvgText>
      ))}
    </Svg>
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
    chartWrap: { marginHorizontal: -10 },
    summaryRow: { flexDirection: 'row', marginTop: 12, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 },
    summaryCell: { flex: 1, alignItems: 'center' },
    summaryVal: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    summaryLbl: { fontSize: 10, color: c.textMuted, marginTop: 2 },
  });
}
