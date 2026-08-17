import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, ActivityIndicator } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApi } from '../../../hooks/useApi';
import { AppColors } from '../../../utils/colors';
import { formatDuration } from '../../../utils/format';

interface Review {
  id: number;
  review_date: string;
  status: 'open' | 'closed';
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const TYPE_LABELS: Record<string, string> = {
  daily: 'Daily Check-In', weekly: 'Weekly Review', monthly: 'Monthly Review', other: 'Custom Review',
};

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
  const navigation = useNavigation<any>();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [cursor, setCursor] = useState(() => new Date());
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailActionItems, setDetailActionItems] = useState<any[]>([]);
  const [detailReporteeData, setDetailReporteeData] = useState<Record<string, any>>({});
  const [collapsedMembers, setCollapsedMembers] = useState<Record<string, boolean>>({});
  // taskId -> planned minutes, per reportee uid — mirrors web's DailyCheckinView,
  // which loads planner blocks separately from the review/reportee data itself.
  const [plannerBlocks, setPlannerBlocks] = useState<Record<string, { taskId: number; endMinutes: number; startMinutes: number }[]>>({});

  const openReview = useCallback(async (reviewId: number) => {
    setModalOpen(true);
    setModalLoading(true);
    setModalError(null);
    setDetail(null);
    setPlannerBlocks({});
    try {
      const res = await api.businessReviews.get(appId, reviewId);
      const review = res.data?.review ?? null;
      const reporteeData = res.data?.reporteeData ?? {};
      setDetail(review);
      setDetailActionItems(res.data?.actionItems ?? []);
      setDetailReporteeData(reporteeData);

      if (review?.type === 'daily' && review?.review_date) {
        const dateKey = String(review.review_date).slice(0, 10);
        const uids = Object.keys(reporteeData);
        uids.forEach((uid) => {
          api.taskPlanner.getBlocks(appId, { user_id: uid, date: dateKey })
            .then((r: any) => setPlannerBlocks((prev) => ({ ...prev, [uid]: r.data ?? [] })))
            .catch(() => {});
        });
      }
    } catch {
      setModalError('Could not load this review.');
    } finally {
      setModalLoading(false);
    }
  }, [api, appId]);

  const plannedMinsForTask = useCallback((taskId: number, uid: string) => {
    const blocks = plannerBlocks[uid] ?? [];
    return blocks
      .filter((b) => String(b.taskId) === String(taskId))
      .reduce((sum, b) => sum + (b.endMinutes - b.startMinutes), 0);
  }, [plannerBlocks]);

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
      setLoadFailed(false);
    } catch {
      setReviews([]);
      setLoadFailed(true);
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
          const closedReview = dayReviews.find((r) => r.status === 'closed');
          const openStatusReview = dayReviews.find((r) => r.status === 'open');
          const review = closedReview ?? openStatusReview;
          const isToday = c.key === ymd(new Date());
          const circleColor = review ? (review.status === 'closed' ? colors.success : colors.warning) : null;
          return (
            <TouchableOpacity
              key={i}
              style={s.cell}
              disabled={!review}
              activeOpacity={review ? 0.7 : 1}
              onPress={() => review && openReview(review.id)}
            >
              <Svg width={26} height={26}>
                <Circle
                  cx={13} cy={13} r={13}
                  fill={circleColor ?? (isToday ? colors.primaryLight : 'transparent')}
                />
                <SvgText
                  x={13} y={17.5} textAnchor="middle" fontSize={11}
                  fontWeight={circleColor || isToday ? '800' : '400'}
                  fill={circleColor ? '#fff' : isToday ? colors.primary : colors.textSecondary}
                >
                  {c.day}
                </SvgText>
              </Svg>
            </TouchableOpacity>
          );
        })}
      </View>
      {loadFailed ? (
        <TouchableOpacity onPress={load}>
          <Text style={s.emptyText}>Could not load reviews for this month. Tap to retry.</Text>
        </TouchableOpacity>
      ) : (
        <View style={s.legendRow}>
          <View style={s.legendItem}><View style={[s.dot, { backgroundColor: colors.warning }]} /><Text style={s.legendTxt}>Open</Text></View>
          <View style={s.legendItem}><View style={[s.dot, { backgroundColor: colors.success }]} /><Text style={s.legendTxt}>Completed</Text></View>
        </View>
      )}

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>{detail ? (TYPE_LABELS[detail.type] ?? detail.type ?? 'Business Review') : 'Business Review'}</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {modalLoading ? (
              <ActivityIndicator color={colors.primary} style={{ paddingVertical: 30 }} />
            ) : modalError ? (
              <Text style={s.emptyText}>{modalError}</Text>
            ) : detail ? (
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                <View style={s.metaCard}>
                  <View style={s.metaRow}>
                    <Text style={s.metaLabel}>Status</Text>
                    <Text style={[s.metaVal, { color: detail.status === 'closed' ? colors.success : colors.warning }]}>{detail.status ?? '—'}</Text>
                  </View>
                  {detail.review_date ? (
                    <View style={s.metaRow}>
                      <Text style={s.metaLabel}>Review Date</Text>
                      <Text style={s.metaVal}>{new Date(detail.review_date).toLocaleDateString()}</Text>
                    </View>
                  ) : null}
                </View>

                {detail.type === 'daily' && Object.keys(detailReporteeData).length > 0 && (() => {
                  const memberCount = Object.keys(detailReporteeData).length;
                  return (
                    <>
                      <Text style={s.sectionHead}>DAILY TASK SUMMARY</Text>
                      {Object.entries(detailReporteeData).map(([uid, rd]: [string, any]) => {
                        const tasks: any[] = rd.tasks ?? [];
                        const completedTasks: any[] = rd.completed_tasks ?? [];
                        const loggedMins = tasks.reduce((sum, t) => sum + (Number(t.today_minutes) || 0), 0);
                        const plannedMins = tasks.reduce((sum, t) => sum + plannedMinsForTask(t.id, uid), 0);
                        const isCollapsed = memberCount > 1 ? collapsedMembers[uid] !== false : collapsedMembers[uid] === true;
                        return (
                          <View key={uid} style={s.checkinCard}>
                            <TouchableOpacity
                              style={s.checkinHead}
                              activeOpacity={0.7}
                              onPress={() => setCollapsedMembers((prev) => ({ ...prev, [uid]: !isCollapsed }))}
                            >
                              <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={16} color={colors.textMuted} />
                              <Text style={s.checkinName}>{rd.user?.name ?? `User ${uid}`}</Text>
                            </TouchableOpacity>
                            <View style={s.checkinStatsRow}>
                              <Text style={s.checkinStat}>Planned: <Text style={s.checkinStatVal}>{plannedMins > 0 ? formatDuration(plannedMins) : '—'}</Text></Text>
                              <Text style={s.checkinStat}>Logged: <Text style={s.checkinStatVal}>{loggedMins > 0 ? formatDuration(loggedMins) : '—'}</Text></Text>
                              <Text style={s.checkinStat}>Active: <Text style={s.checkinStatVal}>{tasks.length}</Text></Text>
                              <Text style={[s.checkinStat, { color: colors.success }]}>Completed: <Text style={s.checkinStatVal}>{completedTasks.length}</Text></Text>
                              <Text style={[s.checkinStat, rd.overdue_count > 0 && { color: colors.danger }]}>
                                Overdue: <Text style={s.checkinStatVal}>{rd.overdue_count ?? 0}</Text>
                              </Text>
                            </View>

                            {!isCollapsed && (
                              <>
                                {tasks.length === 0 ? (
                                  <Text style={s.emptyText}>No pending tasks</Text>
                                ) : (
                                  tasks.map((t, ti) => {
                                    const taskPlannedMins = plannedMinsForTask(t.id, uid);
                                    return (
                                      <View key={t.id} style={s.dailyTaskCard}>
                                        <View style={s.dailyTaskRow}>
                                          <Text style={s.dailyTaskSno}>{ti + 1}</Text>
                                          <Text style={s.dailyTaskTitle} numberOfLines={2}>{t.title}</Text>
                                        </View>
                                        <View style={s.dailyTaskStatsRow}>
                                          <View style={s.dailyStatItem}>
                                            <Text style={s.dailyStatLabel}>Planned</Text>
                                            <Text style={s.dailyStatValue}>{taskPlannedMins > 0 ? formatDuration(taskPlannedMins) : '—'}</Text>
                                          </View>
                                          <View style={s.dailyStatItem}>
                                            <Text style={s.dailyStatLabel}>Log Hrs</Text>
                                            <Text style={s.dailyStatValue}>{t.today_minutes > 0 ? formatDuration(t.today_minutes) : '—'}</Text>
                                          </View>
                                          <View style={s.dailyStatItem}>
                                            <Text style={s.dailyStatLabel}>Actual / Est</Text>
                                            <Text style={s.dailyStatValue}>
                                              {t.actual_minutes > 0 ? formatDuration(t.actual_minutes) : '0h'} / {t.estimated_minutes > 0 ? formatDuration(t.estimated_minutes) : '—'}
                                            </Text>
                                          </View>
                                        </View>
                                      </View>
                                    );
                                  })
                                )}

                                {completedTasks.length > 0 && (
                                  <>
                                    <Text style={s.completedLabel}>COMPLETED TODAY ({completedTasks.length})</Text>
                                    {completedTasks.map((t, ti) => (
                                      <View key={t.id} style={[s.dailyTaskCard, s.dailyTaskCardDone]}>
                                        <View style={s.dailyTaskRow}>
                                          <Text style={[s.dailyTaskSno, { color: colors.success }]}>{ti + 1}</Text>
                                          <Text style={s.dailyTaskTitle} numberOfLines={2}>{t.title}</Text>
                                          {t.completed_at ? (
                                            <Text style={s.dailyTaskTime}>
                                              {new Date(t.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </Text>
                                          ) : null}
                                        </View>
                                      </View>
                                    ))}
                                  </>
                                )}
                              </>
                            )}
                          </View>
                        );
                      })}
                    </>
                  );
                })()}

                {detail.meeting_notes ? (<><Text style={s.sectionHead}>{detail.type === 'daily' ? 'REMARKS' : 'MEETING NOTES'}</Text><Text style={s.paragraph}>{detail.meeting_notes}</Text></>) : null}
                {detail.summary ? (<><Text style={s.sectionHead}>SUMMARY</Text><Text style={s.paragraph}>{detail.summary}</Text></>) : null}
                {detail.achievements ? (<><Text style={s.sectionHead}>ACHIEVEMENTS</Text><Text style={s.paragraph}>{detail.achievements}</Text></>) : null}
                {detail.key_risks ? (<><Text style={s.sectionHead}>KEY RISKS</Text><Text style={s.paragraph}>{detail.key_risks}</Text></>) : null}
                {detail.improvement_plans ? (<><Text style={s.sectionHead}>IMPROVEMENT PLANS</Text><Text style={s.paragraph}>{detail.improvement_plans}</Text></>) : null}

                <Text style={s.sectionHead}>ACTION ITEMS</Text>
                {detailActionItems.length === 0 ? (
                  <Text style={s.emptyText}>No action items</Text>
                ) : (
                  detailActionItems.map((a: any) => (
                    <View key={a.id} style={s.itemRow}>
                      <Ionicons
                        name={a.status === 'done' ? 'checkmark-circle' : 'ellipse-outline'}
                        size={16}
                        color={a.status === 'done' ? colors.success : colors.gray400}
                      />
                      <Text style={s.itemTitle}>{a.title ?? a.description}</Text>
                    </View>
                  ))
                )}

                <TouchableOpacity
                  style={s.fullDetailsBtn}
                  onPress={() => {
                    setModalOpen(false);
                    // Single atomic navigate with initial:false seeds the nested
                    // stack's default route (MoreHome) and pushes the target on top,
                    // so back lands on MoreHome instead of bouncing to Home — two
                    // separate navigate() calls race against RN's state batching
                    // and can silently act as if only the target screen was pushed.
                    navigation.navigate('MoreTab', { screen: 'BusinessReviewDetail', params: { reviewId: detail.id, appId }, initial: false } as never);
                  }}
                >
                  <Text style={s.fullDetailsBtnTxt}>Open full details →</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
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
    dot: { width: 8, height: 8, borderRadius: 4 },
    legendRow: { flexDirection: 'row', gap: 16, marginTop: 10, justifyContent: 'center' },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendTxt: { fontSize: 11, color: c.textSecondary },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalCard: { backgroundColor: c.surface, borderRadius: 16, padding: 18, maxHeight: '85%' },
    modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    modalTitle: { fontSize: 17, fontWeight: '800', color: c.textPrimary, flex: 1, marginRight: 8 },
    metaCard: {
      backgroundColor: c.background, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      padding: 12, marginBottom: 14, gap: 8,
    },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
    metaLabel: { fontSize: 12, color: c.textMuted },
    metaVal: { fontSize: 12, fontWeight: '700', color: c.textPrimary, textTransform: 'capitalize' },
    sectionHead: { fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginTop: 8, marginBottom: 8 },
    paragraph: { fontSize: 13, color: c.textSecondary, lineHeight: 19, marginBottom: 8 },
    emptyText: { fontSize: 13, color: c.textMuted, marginBottom: 12 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    itemTitle: { fontSize: 13, fontWeight: '600', color: c.textPrimary, flex: 1 },
    fullDetailsBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
    fullDetailsBtnTxt: { fontSize: 13, fontWeight: '700', color: c.primary },

    checkinCard: {
      backgroundColor: c.background, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      padding: 12, marginBottom: 10,
    },
    checkinHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    checkinName: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    checkinStatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
    checkinStat: { fontSize: 11, color: c.textMuted },
    checkinStatVal: { fontWeight: '700', color: c.textPrimary },
    dailyTaskCard: {
      backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      padding: 10, marginTop: 8,
    },
    dailyTaskCardDone: { opacity: 0.85 },
    dailyTaskRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dailyTaskSno: { fontSize: 12, fontWeight: '700', color: c.textMuted, width: 16 },
    dailyTaskTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: c.textPrimary },
    dailyTaskTime: { fontSize: 10, color: c.textMuted },
    dailyTaskStatsRow: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, columnGap: 16, marginTop: 8, paddingLeft: 24 },
    dailyStatItem: { gap: 2 },
    dailyStatLabel: { fontSize: 9, color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    dailyStatValue: { fontSize: 12, fontWeight: '700', color: c.textPrimary },
    completedLabel: {
      fontSize: 10, fontWeight: '700', color: c.success, letterSpacing: 0.5,
      marginTop: 14, marginBottom: 2,
    },
  });
}
