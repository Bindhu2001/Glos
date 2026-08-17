import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle, Path, Line } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../utils/colors';

const TEAL = '#2dd4bf';

function scoreColor(score: number | null, colors: AppColors) {
  if (score == null) return colors.gray400;
  if (score >= 4) return colors.success;
  if (score >= 3) return TEAL;
  if (score >= 2) return colors.warning;
  return colors.danger;
}

// Donut ring for the latest/average score — mirrors PerformanceHub.jsx's ScoreRing.
export function ScoreRing({ score, colors, size = 88 }: { score: number | null; colors: AppColors; size?: number }) {
  const r = (size - 12) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const stroke = 6;
  const circ = 2 * Math.PI * r;
  const pct = score != null ? Math.min(1, score / 5) : 0;
  const color = scoreColor(score, colors);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={cx} cy={cy} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
        {score != null && (
          <Circle
            cx={cx} cy={cy} r={r}
            stroke={color} strokeWidth={stroke} fill="none"
            strokeDasharray={`${circ * pct} ${circ}`}
            strokeDashoffset={circ * 0.25}
            strokeLinecap="round"
          />
        )}
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: score != null ? color : colors.textMuted }}>
          {score != null ? score.toFixed(2) : '—'}
        </Text>
        <Text style={{ fontSize: 9, color: colors.textMuted, marginTop: 1 }}>/ 5.0</Text>
      </View>
    </View>
  );
}

// Rating-trend line chart over the last N cycles — mirrors PerformanceHub.jsx's OvwSparkLine,
// simplified for a mobile-width canvas (no rotated axis labels).
export function RatingTrendChart({ data, colors }: { data: { label: string; score: number }[]; colors: AppColors }) {
  if (data.length === 0) {
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 30, gap: 8 }}>
        <Ionicons name="trending-up-outline" size={30} color={colors.gray300} />
        <Text style={{ fontSize: 12, color: colors.textMuted }}>No data yet</Text>
      </View>
    );
  }

  const n = data.length;
  const W = 300;
  const H = 160;
  const PAD = { t: 20, r: 16, b: 26, l: 24 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;
  const maxV = 5;

  const xOf = (i: number) => PAD.l + (n <= 1 ? chartW / 2 : (i / (n - 1)) * chartW);
  const yOf = (v: number) => PAD.t + chartH - (v / maxV) * chartH;

  const pts = data.map((d, i) => [xOf(i), yOf(d.score)] as const);
  const linePath = `M${pts[0][0]},${pts[0][1]} ` + pts.slice(1).map(([x, y]) => `L${x},${y}`).join(' ');
  const latestIdx = n - 1;

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      {[1, 2, 3, 4, 5].map((v) => (
        <Line key={v} x1={PAD.l} y1={yOf(v)} x2={W - PAD.r} y2={yOf(v)} stroke={colors.border} strokeWidth={1} />
      ))}
      <Path d={linePath} stroke={TEAL} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([x, y], i) => (
        <Circle
          key={i} cx={x} cy={y}
          r={i === latestIdx ? 5 : 3.5}
          fill={i === latestIdx ? TEAL : colors.surface}
          stroke={TEAL} strokeWidth={2}
        />
      ))}
    </Svg>
  );
}
