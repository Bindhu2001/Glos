import React, { useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useHasTeam } from '../../contexts/HasTeamContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { MoreStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import LoadError from '../../components/common/LoadError';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'BusinessReviewsList'>;

const TYPE_LABELS: Record<string, string> = {
  daily: 'Daily Check-In',
  weekly: 'Weekly Review',
  monthly: 'Monthly Review',
  other: 'Custom Review',
};

const STATUS_COLORS: Record<string, string> = { open: '#d97706', closed: '#059669' };

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

type ViewMode = 'calendar' | 'list';

export default function BusinessReviewsListScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const { canSeeTeamContent } = useHasTeam();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [cursor, setCursor] = useState(() => new Date());

  const hasLoadedRef = useRef(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!workspace?.id) return;
    if (!isRefresh && !hasLoadedRef.current) setLoading(true);
    try {
      if (workspace.role === 'member') {
        // Non-admins can be a manager (own_only: reviews they conduct for their reportees)
        // AND an attendee/reportee of someone else's review at the same time — merge both,
        // matching web's DailyCalendarWidget (MyDashboard.jsx) which fetches both scopes.
        const [ownRes, attendeeRes] = await Promise.all([
          canSeeTeamContent
            ? api.businessReviews.list(workspace.id, { own_only: 'true' }).catch(() => ({ data: { reviews: [] } }))
            : Promise.resolve({ data: { reviews: [] } }),
          api.businessReviews.list(workspace.id, { attendee_only: 'true' }),
        ]);
        const merged = new Map<number, any>();
        for (const r of [...(ownRes.data?.reviews ?? []), ...(attendeeRes.data?.reviews ?? [])]) merged.set(r.id, r);
        setReviews([...merged.values()]);
      } else {
        const res = await api.businessReviews.list(workspace.id);
        setReviews(res.data?.reviews ?? res.data ?? []);
      }
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load business reviews.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedRef.current = true;
    }
  }, [workspace?.id, workspace?.role, canSeeTeamContent]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const dailyByDay = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of reviews) {
      if (r.type !== 'daily') continue;
      map.set((r.review_date ?? '').slice(0, 10), r);
    }
    return map;
  }, [reviews]);

  const nonDaily = reviews.filter((r) => r.type !== 'daily');

  const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const startOffset = firstOfMonth.getDay();
  const cells: Array<{ day: number; key: string } | null> = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, key: `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(d)}` });

  const onDayPress = (key: string) => {
    const existing = dailyByDay.get(key);
    if (existing) {
      navigation.navigate('BusinessReviewDetail', { reviewId: existing.id, appId: workspace!.id });
    } else if (canSeeTeamContent) {
      navigation.navigate('CreateBusinessReview', { appId: workspace!.id, date: key });
    }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Business Reviews</Text>
        {canSeeTeamContent ? (
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.navigate('CreateBusinessReview', { appId: workspace!.id })}>
            <Ionicons name="add" size={24} color={colors.primary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      <View style={s.toggleRow}>
        <TouchableOpacity style={[s.toggleBtn, viewMode === 'calendar' && s.toggleBtnActive]} onPress={() => setViewMode('calendar')}>
          <Text style={[s.toggleTxt, viewMode === 'calendar' && s.toggleTxtActive]}>Calendar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.toggleBtn, viewMode === 'list' && s.toggleBtnActive]} onPress={() => setViewMode('list')}>
          <Text style={[s.toggleTxt, viewMode === 'list' && s.toggleTxtActive]}>List</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : error ? (
        <LoadError message={error} onRetry={() => load()} />
      ) : (
        <ScrollView
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
        >
          {viewMode === 'calendar' && (
            <View style={s.calCard}>
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
                  const rev = dailyByDay.get(c.key);
                  const isToday = c.key === ymd(new Date());
                  const statusColor = rev ? (STATUS_COLORS[rev.status] ?? '#6b7280') : null;
                  return (
                    <TouchableOpacity key={i} style={s.cell} onPress={() => onDayPress(c.key)} activeOpacity={0.7}>
                      <Svg width={32} height={32}>
                        <Circle
                          cx={16} cy={16} r={16}
                          fill={statusColor ?? (isToday ? colors.primaryLight : 'transparent')}
                        />
                        <SvgText
                          x={16} y={21} textAnchor="middle" fontSize={12}
                          fontWeight={statusColor || isToday ? '800' : '400'}
                          fill={statusColor ? '#fff' : isToday ? colors.primary : colors.textSecondary}
                        >
                          {c.day}
                        </SvgText>
                      </Svg>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={s.legendRow}>
                <View style={s.legendItem}><View style={[s.dot, { backgroundColor: colors.warning }]} /><Text style={s.legendTxt}>Open</Text></View>
                <View style={s.legendItem}><View style={[s.dot, { backgroundColor: colors.success }]} /><Text style={s.legendTxt}>Completed</Text></View>
              </View>

              {nonDaily.length > 0 && (
                <>
                  <Text style={s.otherHead}>WEEKLY / MONTHLY / CUSTOM</Text>
                  {nonDaily.map((r) => {
                    const statusColor = STATUS_COLORS[r.status] ?? '#6b7280';
                    return (
                      <TouchableOpacity
                        key={r.id}
                        style={s.card}
                        activeOpacity={0.7}
                        onPress={() => navigation.navigate('BusinessReviewDetail', { reviewId: r.id, appId: workspace!.id })}
                      >
                        <View style={s.iconBox}>
                          <Ionicons name="bar-chart-outline" size={20} color="#d97706" />
                        </View>
                        <View style={s.cardBody}>
                          <Text style={s.cardTitle}>{TYPE_LABELS[r.type] ?? r.type ?? 'Review'} · {r.review_date ? new Date(r.review_date).toLocaleDateString() : ''}</Text>
                          <View style={s.metaRow}>
                            {r.manager?.name ?? r.manager ? <Text style={s.metaText}>{r.manager?.name ?? r.manager}</Text> : null}
                          </View>
                        </View>
                        <View style={[s.statusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
                          <Text style={[s.statusText, { color: statusColor }]}>{r.status ?? 'open'}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}
            </View>
          )}

          {viewMode === 'list' && (
            reviews.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="bar-chart-outline" size={40} color={colors.gray400} />
                <Text style={s.emptyText}>No business reviews yet</Text>
              </View>
            ) : (
              reviews.map((r) => {
                const statusColor = STATUS_COLORS[r.status] ?? '#6b7280';
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={s.card}
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('BusinessReviewDetail', { reviewId: r.id, appId: workspace!.id })}
                  >
                    <View style={s.iconBox}>
                      <Ionicons name="bar-chart-outline" size={20} color="#d97706" />
                    </View>
                    <View style={s.cardBody}>
                      <Text style={s.cardTitle}>{TYPE_LABELS[r.type] ?? r.type ?? 'Review'} · {r.review_date ? new Date(r.review_date).toLocaleDateString() : ''}</Text>
                      <View style={s.metaRow}>
                        {r.manager?.name ?? r.manager ? <Text style={s.metaText}>{r.manager?.name ?? r.manager}</Text> : null}
                      </View>
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
                      <Text style={[s.statusText, { color: statusColor }]}>{r.status ?? 'open'}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )
          )}
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(c: AppColors) {
  const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 20, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700' },
    toggleRow: {
      flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border },
    toggleBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    toggleTxt: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
    toggleTxtActive: { color: '#fff' },
    list: { padding: 16, gap: 10 },
    empty: { alignItems: 'center', gap: 12, paddingTop: 60 },
    emptyText: { fontSize: 14, color: c.textMuted },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: c.border, marginTop: 10,
    },
    iconBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#d9770614', alignItems: 'center', justifyContent: 'center' },
    cardBody: { flex: 1, gap: 4 },
    cardTitle: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    metaText: { fontSize: 11, color: c.textMuted },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
    statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },

    calCard: { backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 16 },
    navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    monthLabel: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    dowRow: { flexDirection: 'row' },
    dowTxt: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', color: c.textMuted, marginBottom: 4 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
    legendRow: { flexDirection: 'row', gap: 16, marginTop: 10, justifyContent: 'center' },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    legendTxt: { fontSize: 11, color: c.textSecondary },
    otherHead: { fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginTop: 18, marginBottom: 10 },
  });
}
