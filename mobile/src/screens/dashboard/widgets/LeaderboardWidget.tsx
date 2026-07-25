import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../utils/colors';

export interface LeaderboardEntry {
  id: number;
  name: string;
  score: number;
  categories?: Array<{ key: string; label: string; score: number; max: number | null; detail?: string }>;
}

const PODIUM_ICONS = ['🥇', '🥈', '🥉'];
const CAT_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#0891b2', '#ef4444'];

function levelFor(total: number) {
  if (total >= 150) return { label: 'Top Performer', emoji: '🏆', color: '#10b981' };
  if (total >= 100) return { label: 'High Performer', emoji: '🌟', color: '#3b82f6' };
  if (total >= 50) return { label: 'Active', emoji: '⚡', color: '#f59e0b' };
  if (total >= 20) return { label: 'Building', emoji: '📈', color: '#f97316' };
  return { label: 'Getting Started', emoji: '🌱', color: '#9ca3af' };
}

function initials(name?: string) {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function LeaderboardWidget({
  title, entries, meId, colors,
}: {
  title: string;
  entries: LeaderboardEntry[];
  meId?: number;
  colors: AppColors;
}) {
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [modalOpen, setModalOpen] = useState(false);

  const sorted = [...entries].sort((a, b) => b.score - a.score);
  const me = sorted.find((e) => e.id === meId);

  if (sorted.length === 0) return null;

  return (
    <View style={s.card}>
      <View style={s.headRow}>
        <Text style={s.headTitle}>{title}</Text>
        {me && (
          <TouchableOpacity onPress={() => setModalOpen(true)}>
            <Text style={s.viewScoreLink}>View my score →</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 4 }}>
        {sorted.map((m, idx) => {
          const isMe = m.id === meId;
          const avColor = idx === 0 ? colors.success : idx === 1 ? colors.primary : idx === 2 ? colors.secondary : colors.gray300;
          return (
            <View key={m.id} style={[s.lbCard, isMe && s.lbCardMe]}>
              {idx < 3 ? <Text style={s.lbMedal}>{PODIUM_ICONS[idx]}</Text> : <Text style={s.lbRankNum}>{`#${idx + 1}`}</Text>}
              <View style={[s.lbAvatar, { backgroundColor: avColor }]}>
                <Text style={s.lbAvatarTxt}>{initials(m.name)}</Text>
              </View>
              <Text style={s.lbName} numberOfLines={1}>{isMe ? 'YOU' : m.name.split(' ')[0]}</Text>
              <Text style={s.lbPts}>{m.score} pts</Text>
            </View>
          );
        })}
      </ScrollView>

      {me && (
        <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
          <View style={s.modalBackdrop}>
            <View style={s.modalCard}>
              <View style={s.modalHead}>
                <Text style={s.modalTitle}>My GLOS Score</Text>
                <TouchableOpacity onPress={() => setModalOpen(false)}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              {(() => {
                const lvl = levelFor(me.score);
                return (
                  <View style={s.levelRow}>
                    <Text style={s.levelEmoji}>{lvl.emoji}</Text>
                    <View>
                      <Text style={[s.levelLabel, { color: lvl.color }]}>{lvl.label}</Text>
                      <Text style={s.levelScore}>{me.score} total points</Text>
                    </View>
                  </View>
                );
              })()}
              <ScrollView style={{ maxHeight: 300 }}>
                {(me.categories ?? []).map((cat, i) => {
                  const max = cat.max ?? Math.max(cat.score, 1);
                  const pct = Math.min((cat.score / max) * 100, 100);
                  return (
                    <View key={cat.key} style={s.catRow}>
                      <View style={s.catHead}>
                        <Text style={s.catLabel}>{cat.label}</Text>
                        <Text style={s.catScore}>{cat.score}{cat.max ? `/${cat.max}` : ''}</Text>
                      </View>
                      <View style={s.catBarBg}>
                        <View style={[s.catBarFill, { width: `${pct}%` as any, backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }]} />
                      </View>
                      {cat.detail ? <Text style={s.catDetail}>{cat.detail}</Text> : null}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    card: { marginHorizontal: 16, marginTop: 12, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 16 },
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    headTitle: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1 },
    viewScoreLink: { fontSize: 11, fontWeight: '700', color: c.primary },
    lbCard: { alignItems: 'center', width: 80, paddingVertical: 6, borderRadius: 10 },
    lbCardMe: { backgroundColor: c.primaryLight },
    lbMedal: { fontSize: 20, marginBottom: 6 },
    lbRankNum: { fontSize: 12, fontWeight: '700', color: c.textMuted, marginBottom: 6 },
    lbAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    lbAvatarTxt: { fontSize: 20, fontWeight: '900', color: '#fff' },
    lbName: { fontSize: 12, fontWeight: '700', color: c.textPrimary, textAlign: 'center' },
    lbPts: { fontSize: 11, fontWeight: '700', color: c.secondary, marginTop: 2 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalCard: { backgroundColor: c.surface, borderRadius: 16, padding: 18, maxHeight: '80%' },
    modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    modalTitle: { fontSize: 17, fontWeight: '800', color: c.textPrimary },
    levelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, backgroundColor: c.gray50, borderRadius: 12, padding: 12 },
    levelEmoji: { fontSize: 30 },
    levelLabel: { fontSize: 15, fontWeight: '800' },
    levelScore: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
    catRow: { marginBottom: 14 },
    catHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    catLabel: { fontSize: 13, fontWeight: '700', color: c.textPrimary },
    catScore: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
    catBarBg: { height: 8, backgroundColor: c.gray100, borderRadius: 4, overflow: 'hidden' },
    catBarFill: { height: 8, borderRadius: 4 },
    catDetail: { fontSize: 10, color: c.textMuted, marginTop: 4 },
  });
}
