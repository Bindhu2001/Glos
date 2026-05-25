import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../hooks/useApi';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import { formatRelative } from '../../utils/format';
import { FeedStackParamList } from '../../navigation/types';
import ScreenHeader from '../../components/common/ScreenHeader';
import Avatar from '../../components/common/Avatar';
import CommentItem from '../../components/tasks/CommentItem';
import LoadingSpinner from '../../components/common/LoadingSpinner';

type Route = RouteProp<FeedStackParamList, 'PostDetail'>;

const REACTIONS = ['❤️', '👍', '🎉', '👏', '🔥'];

function decodeHtml(str: string) {
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export default function PostDetailScreen() {
  const route = useRoute<Route>();
  const { postId, appId } = route.params;
  const api = useApi();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [saving, setSaving] = useState(false);
  const [myReaction, setMyReaction] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setPost(null);
    setComments([]);
    try {
      const [posts, cmts] = await Promise.all([
        api.feed.list(appId),
        api.feed.getComments(appId, postId),
      ]);
      const d = posts.data;
      const allPosts = Array.isArray(d) ? d : (d?.items ?? d?.posts ?? []);
      const found = allPosts.find((p: any) => p.id === postId);
      setPost(found);
      setComments(cmts.data?.items ?? cmts.data?.comments ?? []);
    } catch {} finally {
      setLoading(false);
    }
  }, [postId, appId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleReact = async (emoji: string) => {
    const toggling = myReaction === emoji;
    setMyReaction(toggling ? null : emoji);
    if (!toggling) {
      try { await api.feed.addReaction(appId, postId, emoji); } catch {}
    }
  };

  const handleComment = async () => {
    if (!commentText.trim()) return;
    setSaving(true);
    try {
      await api.feed.addComment(appId, postId, commentText.trim());
      setCommentText('');
      const r = await api.feed.getComments(appId, postId);
      setComments(r.data?.items ?? r.data?.comments ?? []);
    } catch {
      Alert.alert('Error', 'Could not post comment.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!post) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#6b7280' }}>Post not found.</Text>
    </View>
  );

  const preview = decodeHtml(post.content ?? '');
  const authorName = post.author_name
    ?? ([post.author?.first_name, post.author?.last_name].filter(Boolean).join(' ') || post.author?.email || 'Unknown');

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={[s.container, { paddingTop: insets.top }]}>
      <ScreenHeader title="Post" showBack />
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={s.postCard}>
          <View style={s.postHeader}>
            <Avatar name={authorName} size={42} />
            <View style={s.postMeta}>
              <Text style={s.authorName}>{authorName}</Text>
              <Text style={s.postTime}>{formatRelative(post.created_at)}</Text>
            </View>
          </View>
          <Text style={s.postContent}>{preview}</Text>

          <View style={s.reactionsRow}>
            {REACTIONS.map((emoji) => {
              const selected = myReaction === emoji;
              return (
                <TouchableOpacity
                  key={emoji}
                  style={[s.emojiBtn, selected && s.emojiBtnSelected]}
                  onPress={() => handleReact(emoji)}
                >
                  <Text style={[s.emoji, selected && s.emojiSelected]}>{emoji}</Text>
                </TouchableOpacity>
              );
            })}
            {post.reaction_count > 0 && (
              <Text style={s.reactionCount}>{post.reaction_count} reactions</Text>
            )}
          </View>
        </View>

        <Text style={s.commentsHeader}>Comments ({comments.length})</Text>
        {comments.map((c) => (
          <CommentItem
            key={c.id}
            comment={{
              ...c,
              body: c.content ?? c.body,
              author_name: c.author_name
                ?? ([c.user?.first_name, c.user?.last_name].filter(Boolean).join(' ')
                  || c.user?.email
                  || 'Unknown'),
            }}
            canDelete={false}
            onDelete={() => {}}
          />
        ))}
        {comments.length === 0 && (
          <Text style={s.noComments}>No comments yet. Start the conversation!</Text>
        )}
      </ScrollView>

      <View style={[s.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={s.inputField}
          placeholder="Write a comment..."
          placeholderTextColor={colors.gray400}
          value={commentText}
          onChangeText={setCommentText}
          multiline
        />
        <TouchableOpacity onPress={handleComment} style={s.sendBtn} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="send" size={18} color="#ffffff" />}
        </TouchableOpacity>
      </View>
    </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 16, paddingBottom: 100 },
    postCard: {
      backgroundColor: c.surface, borderRadius: 14, padding: 16, marginBottom: 16,
      borderWidth: 1, borderColor: c.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    },
    postHeader: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    postMeta: { flex: 1 },
    authorName: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    postTime: { fontSize: 12, color: c.gray400, marginTop: 2 },
    postContent: { fontSize: 15, color: c.gray700, lineHeight: 23, marginBottom: 14 },
    reactionsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 },
    emojiBtn: { padding: 4, borderRadius: 8 },
    emojiBtnSelected: { backgroundColor: '#fee2e2', borderWidth: 1.5, borderColor: '#ef4444' },
    emoji: { fontSize: 20 },
    emojiSelected: { transform: [{ scale: 1.25 }] },
    reactionCount: { fontSize: 13, color: c.gray500, marginLeft: 4 },
    commentsHeader: { fontSize: 14, fontWeight: '700', color: c.textSecondary, marginBottom: 12 },
    noComments: { fontSize: 14, color: c.gray400, textAlign: 'center', marginTop: 20 },
    inputBar: {
      flexDirection: 'row', alignItems: 'flex-end', gap: 10,
      backgroundColor: c.surface, paddingHorizontal: 16, paddingTop: 10,
      borderTopWidth: 1, borderTopColor: c.border,
    },
    inputField: {
      flex: 1, backgroundColor: c.gray50, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
      fontSize: 14, color: c.textPrimary, maxHeight: 80, borderWidth: 1, borderColor: c.border,
    },
    sendBtn: {
      width: 38, height: 38, borderRadius: 19, backgroundColor: c.primary,
      alignItems: 'center', justifyContent: 'center',
    },
  });
}
