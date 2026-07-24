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

type Nav = NativeStackNavigationProp<MoreStackParamList, 'ProjectDetail'>;
type Rt = RouteProp<MoreStackParamList, 'ProjectDetail'>;

export default function ProjectDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { colors } = useTheme();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [project, setProject] = useState<any>(null);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [pRes, mRes, cRes] = await Promise.all([
        api.projects.get(params.appId, params.projectId),
        api.projects.listMilestones(params.appId, params.projectId),
        api.projects.listComments(params.appId, params.projectId),
      ]);
      setProject(pRes.data);
      setMilestones(mRes.data?.items ?? mRes.data ?? []);
      setComments(cRes.data?.items ?? cRes.data ?? []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [params.appId, params.projectId]);

  useEffect(() => { load(); }, [load]);

  const postComment = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      await api.projects.createComment(params.appId, params.projectId, newComment.trim());
      setNewComment('');
      await load();
    } catch {
    } finally {
      setPosting(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />;
  if (!project) return null;

  return (
    <KeyboardAvoidingView style={[s.container, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{project.name}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        {project.client_name ? <Text style={s.client}>{project.client_name}</Text> : null}
        {project.description ? <Text style={s.desc}>{project.description}</Text> : null}

        <View style={s.statsRow}>
          <View style={s.statCell}>
            <Text style={s.statVal}>{project.done_tasks ?? 0}/{project.total_tasks ?? 0}</Text>
            <Text style={s.statLbl}>TASKS</Text>
          </View>
          <View style={s.statCell}>
            <Text style={s.statVal}>{project.completed_milestones ?? 0}/{project.total_milestones ?? 0}</Text>
            <Text style={s.statLbl}>MILESTONES</Text>
          </View>
          <View style={s.statCell}>
            <Text style={s.statVal}>{(project.computed_status ?? '—').replace('_', ' ')}</Text>
            <Text style={s.statLbl}>STATUS</Text>
          </View>
        </View>

        <Text style={s.sectionHead}>MILESTONES</Text>
        {milestones.length === 0 ? (
          <Text style={s.emptyText}>No milestones yet</Text>
        ) : (
          milestones.map((m) => (
            <View key={m.id} style={s.msRow}>
              <Ionicons
                name={m.is_completed ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={m.is_completed ? colors.success : colors.gray400}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.msTitle}>{m.title}</Text>
                {m.start_date ? <Text style={s.msDate}>{new Date(m.start_date).toLocaleDateString()}</Text> : null}
              </View>
            </View>
          ))
        )}

        <Text style={s.sectionHead}>COMMENTS</Text>
        {comments.length === 0 ? (
          <Text style={s.emptyText}>No comments yet</Text>
        ) : (
          comments.map((c) => (
            <View key={c.id} style={s.commentRow}>
              <Text style={s.commentAuthor}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'User'}</Text>
              <Text style={s.commentBody}>{c.content}</Text>
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
    client: { fontSize: 13, color: c.primary, fontWeight: '700', marginBottom: 4 },
    desc: { fontSize: 13, color: c.textSecondary, marginBottom: 14 },
    statsRow: {
      flexDirection: 'row', backgroundColor: c.surface, borderRadius: 14,
      borderWidth: 1, borderColor: c.border, paddingVertical: 12, marginBottom: 16,
    },
    statCell: { flex: 1, alignItems: 'center' },
    statVal: { fontSize: 14, fontWeight: '800', color: c.textPrimary, textTransform: 'capitalize' },
    statLbl: { fontSize: 9, fontWeight: '700', color: c.textMuted, marginTop: 4, letterSpacing: 0.5 },
    sectionHead: { fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginTop: 8, marginBottom: 10 },
    emptyText: { fontSize: 13, color: c.textMuted, marginBottom: 12 },
    msRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    msTitle: { fontSize: 13, fontWeight: '600', color: c.textPrimary },
    msDate: { fontSize: 11, color: c.textMuted, marginTop: 2 },
    commentRow: { marginBottom: 12, backgroundColor: c.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: c.border },
    commentAuthor: { fontSize: 12, fontWeight: '700', color: c.textPrimary, marginBottom: 2 },
    commentBody: { fontSize: 13, color: c.textSecondary },
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
