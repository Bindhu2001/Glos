import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { MoreStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import LoadError from '../../components/common/LoadError';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'BusinessReviewDetail'>;
type Rt = RouteProp<MoreStackParamList, 'BusinessReviewDetail'>;

const TYPE_LABELS: Record<string, string> = {
  daily: 'Daily Check-In',
  weekly: 'Weekly Review',
  monthly: 'Monthly Review',
};

// Backend GET /:id (routes/hr/business_reviews.js) returns
// { review, manager, reportees, attendees, assessments, actionItems, reporteeData, projects, routineCompletion }
// — NOT a flat review object, so this must be destructured accordingly.
export default function BusinessReviewDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { colors } = useTheme();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [review, setReview] = useState<any>(null);
  const [manager, setManager] = useState<any>(null);
  const [actionItems, setActionItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.businessReviews.get(params.appId, params.reviewId);
      setReview(res.data?.review ?? null);
      setManager(res.data?.manager ?? null);
      setActionItems(res.data?.actionItems ?? []);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load this review.'));
    } finally {
      setLoading(false);
    }
  }, [params.appId, params.reviewId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />;
  if (error) return <LoadError message={error} onRetry={load} />;
  if (!review) return null;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{TYPE_LABELS[review.type] ?? review.type ?? 'Business Review'}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <View style={s.metaCard}>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Status</Text>
            <Text style={s.metaVal}>{review.status ?? '—'}</Text>
          </View>
          {review.review_date ? (
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Review Date</Text>
              <Text style={s.metaVal}>{new Date(review.review_date).toLocaleDateString()}</Text>
            </View>
          ) : null}
          {review.period_start && review.period_end ? (
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Period</Text>
              <Text style={s.metaVal}>{new Date(review.period_start).toLocaleDateString()} – {new Date(review.period_end).toLocaleDateString()}</Text>
            </View>
          ) : null}
          {manager?.name ? (
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Manager</Text>
              <Text style={s.metaVal}>{manager.name}</Text>
            </View>
          ) : null}
        </View>

        {review.meeting_notes ? (
          <>
            <Text style={s.sectionHead}>MEETING NOTES</Text>
            <Text style={s.paragraph}>{review.meeting_notes}</Text>
          </>
        ) : null}
        {review.summary ? (
          <>
            <Text style={s.sectionHead}>SUMMARY</Text>
            <Text style={s.paragraph}>{review.summary}</Text>
          </>
        ) : null}
        {review.achievements ? (
          <>
            <Text style={s.sectionHead}>ACHIEVEMENTS</Text>
            <Text style={s.paragraph}>{review.achievements}</Text>
          </>
        ) : null}
        {review.key_risks ? (
          <>
            <Text style={s.sectionHead}>KEY RISKS</Text>
            <Text style={s.paragraph}>{review.key_risks}</Text>
          </>
        ) : null}
        {review.improvement_plans ? (
          <>
            <Text style={s.sectionHead}>IMPROVEMENT PLANS</Text>
            <Text style={s.paragraph}>{review.improvement_plans}</Text>
          </>
        ) : null}

        <Text style={s.sectionHead}>ACTION ITEMS</Text>
        {actionItems.length === 0 ? (
          <Text style={s.emptyText}>No action items</Text>
        ) : (
          actionItems.map((a: any) => (
            <View key={a.id} style={s.itemRow}>
              <Ionicons
                name={a.status === 'done' ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={a.status === 'done' ? colors.success : colors.gray400}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.itemTitle}>{a.title ?? a.description}</Text>
                {a.assigned_to_user_id_name ? <Text style={s.metaLabel}>{a.assigned_to_user_id_name}</Text> : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(c: AppColors) {
  const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12, gap: 8,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 18, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700', textAlign: 'center' },
    body: { padding: 16, paddingBottom: 32 },
    metaCard: {
      backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border,
      padding: 14, marginBottom: 16, gap: 8,
    },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
    metaLabel: { fontSize: 12, color: c.textMuted },
    metaVal: { fontSize: 12, fontWeight: '700', color: c.textPrimary, textTransform: 'capitalize' },
    sectionHead: { fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginTop: 8, marginBottom: 8 },
    paragraph: { fontSize: 13, color: c.textSecondary, lineHeight: 19, marginBottom: 8 },
    emptyText: { fontSize: 13, color: c.textMuted, marginBottom: 12 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    itemTitle: { fontSize: 13, fontWeight: '600', color: c.textPrimary, flex: 1 },
  });
}
