import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator, TextInput, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { MoreStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'BusinessReviewDetail'>;
type Rt = RouteProp<MoreStackParamList, 'BusinessReviewDetail'>;

export default function BusinessReviewDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { colors } = useTheme();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [review, setReview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.businessReviews.get(params.appId, params.reviewId);
      setReview(res.data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [params.appId, params.reviewId]);

  useEffect(() => { load(); }, [load]);

  const postComment = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      await api.businessReviews.addMemberComment(params.appId, params.reviewId, newComment.trim());
      setNewComment('');
      await load();
    } catch {
    } finally {
      setPosting(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />;
  if (!review) return null;

  const actionItems = review.action_items ?? review.actionItems ?? [];

  return (
    <KeyboardAvoidingView style={[s.container, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{review.type ?? 'Business Review'}</Text>
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
          {review.manager ? (
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Manager</Text>
              <Text style={s.metaVal}>{review.manager?.name ?? review.manager}</Text>
            </View>
          ) : null}
        </View>

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
              <Text style={s.itemTitle}>{a.title ?? a.description}</Text>
            </View>
          ))
        )}
      </ScrollView>

      <View style={[s.commentBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={s.commentInput}
          placeholder="Add a comment..."
          placeholderTextColor={colors.textMuted}
          value={newComment}
          onChangeText={setNewComment}
        />
        <TouchableOpacity style={s.sendBtn} onPress={postComment} disabled={posting}>
          <Ionicons name="send" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
    sectionHead: { fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginTop: 8, marginBottom: 10 },
    emptyText: { fontSize: 13, color: c.textMuted, marginBottom: 12 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    itemTitle: { fontSize: 13, fontWeight: '600', color: c.textPrimary, flex: 1 },
    commentBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 16, paddingTop: 8,
      backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border,
    },
    commentInput: {
      flex: 1, backgroundColor: c.background, borderRadius: 20, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 14, paddingVertical: 9, fontSize: 13, color: c.textPrimary,
    },
    sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
  });
}
