import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
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
import LoadError from '../../components/common/LoadError';
import { useLoadWithTimeout } from '../../hooks/useLoadWithTimeout';
import PostContentView from '../../components/feed/PostContentView';
import MentionCommentInput from '../../components/common/MentionCommentInput';
import AttachmentList from '../../components/common/AttachmentList';
import { stripTags, stripNonContentElements } from '../../utils/postContent';
import { stripMentionTokens } from '../../utils/mentions';
import { BADGE_META } from '../../utils/badges';
import {
  RecipientNamesInline, RecipientsModal, toRecipients, recipientName as uname, Recipient,
} from '../../components/feed/RecipientNames';

type Route = RouteProp<FeedStackParamList, 'PostDetail'>;

const REACTIONS = ['❤️', '👍', '🎉', '👏', '🔥'];

export default function PostDetailScreen() {
  const route = useRoute<Route>();
  const { postId, appId } = route.params;
  const navigation = useNavigation<any>();
  const api = useApi();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    navigation.navigate('FeedList');
  };

  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [saving, setSaving] = useState(false);
  const [meId, setMeId] = useState<number | null>(null);
  const [recipientsModal, setRecipientsModal] = useState<Recipient[] | null>(null);
  const { loading, loadError, run } = useLoadWithTimeout();

  const load = useCallback(async () => {
    // Don't null post/comments before the fetch — on pull-to-refresh this
    // would flash "Post not found" while the request is still in flight.
    // The new data just overwrites the old once it arrives.
    const [posts, cmts] = await Promise.all([
      api.feed.list(appId),
      api.feed.getComments(appId, postId),
    ]);
    const d = posts.data;
    const allPosts = Array.isArray(d) ? d : (d?.items ?? d?.posts ?? []);
    const found = allPosts.find((p: any) => p.id === postId);
    setPost(found);
    setComments(cmts.data?.items ?? cmts.data?.comments ?? []);
  }, [postId, appId, api]);

  useEffect(() => {
    run(load);
    api.me.getProfile().then((r: any) => setMeId(r.data?.id ?? r.data?.user?.id ?? null)).catch(() => {});
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await run(load, true);
    setRefreshing(false);
  };

  // Backend toggles a single (post, user, emoji) row independently — a user
  // can hold several simultaneous reactions on one post (matches web's
  // Feed.jsx handleReact / FeedScreen's own handleReact, fixed the same way).
  // `myReaction` used to be a lone value never even initialized from the
  // fetched post, so a post you'd already reacted to on the Feed list showed
  // as unreacted here until tapped again, and reaction_count never moved
  // with the tap since it was tracked separately from the toggle.
  const handleReact = async (emoji: string) => {
    setPost((prev: any) => {
      if (!prev) return prev;
      const myReactions: string[] = prev.my_reactions ?? [];
      const alreadyReacted = myReactions.includes(emoji);
      const newMyReactions = alreadyReacted ? myReactions.filter((e: string) => e !== emoji) : [...myReactions, emoji];
      const newCount = Math.max(0, (prev.reaction_count ?? 0) + (alreadyReacted ? -1 : 1));
      return { ...prev, my_reactions: newMyReactions, reaction_count: newCount };
    });
    try { await api.feed.addReaction(appId, postId, emoji); } catch {}
  };

  const handleVote = async (optionIds: number[]) => {
    if (!post?.poll) return;
    const originalPost = post;
    setPost((prev: any) => {
      if (!prev?.poll) return prev;
      const myVotes: number[] = prev.poll.my_votes ?? [];
      const options = prev.poll.options.map((opt: any) => {
        const wasMine = myVotes.includes(opt.id);
        const isMine = optionIds.includes(opt.id);
        const delta = isMine && !wasMine ? 1 : !isMine && wasMine ? -1 : 0;
        return { ...opt, votes: Math.max(0, opt.votes + delta) };
      });
      const total = options.reduce((sum: number, o: any) => sum + o.votes, 0);
      return { ...prev, poll: { ...prev.poll, options, my_votes: optionIds, total_votes: total } };
    });
    try {
      await api.feed.votePoll(appId, postId, optionIds);
    } catch {
      setPost(originalPost);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    try {
      await api.feed.deleteComment(appId, postId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      Alert.alert('Error', 'Could not delete comment.');
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
  if (loadError) return <LoadError onRetry={() => run(load)} />;
  if (!post) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#6b7280' }}>Post not found.</Text>
    </View>
  );

  const postType = post.post_type ?? post.type ?? 'post';
  const authorName = post.author_name
    ?? ([post.author?.first_name, post.author?.last_name].filter(Boolean).join(' ') || post.author?.email || 'Unknown');

  // Appreciation/feedback show their own from/to identity line instead of
  // the generic avatar+name header — for anonymous feedback this isn't just
  // cosmetic: the backend nulls the resolved `author` object but not the raw
  // `author_user_id` on the post, so a tappable avatar wired to that id
  // would still leak the real sender's identity (see PostCard.tsx).
  const isLetter = postType === 'appreciation' || postType === 'feedback';

  const fbText = post.feedback?.feedback_text ?? '';
  const fbPreview = stripMentionTokens(stripTags(stripNonContentElements(fbText)));
  const fbFromName = post.feedback?.is_anonymous ? null : uname(post.feedback?.from_user);
  const fbToRecipients = toRecipients(post.feedback?.to_users, null, post.feedback?.to_user);

  const apprMeta = BADGE_META[post.appreciation?.badge ?? ''];
  const apprFromName = uname(post.appreciation?.from_user);
  const apprToRecipients = toRecipients(post.appreciation?.to_users, null, post.appreciation?.to_user);

  const myVotes: number[] = post.poll?.my_votes ?? [];
  const totalVotes: number = post.poll?.total_votes ?? 0;
  const handlePollOptionPress = (optionId: number) => {
    if (!post.poll) return;
    const allowMultiple = !!post.poll.allow_multiple;
    const next = allowMultiple
      ? (myVotes.includes(optionId) ? myVotes.filter((id) => id !== optionId) : [...myVotes, optionId])
      : (myVotes.includes(optionId) ? [] : [optionId]);
    handleVote(next);
  };

  // Mirrors the backend's own rule (author-only, within 15 minutes of
  // posting) — same check as FeedScreen's list view. Appreciation/feedback
  // are excluded: their real content lives in post.appreciation.message /
  // post.feedback.feedback_text, not post.content, so the generic text
  // editor below (which only ever touches post.content) would silently
  // overwrite the auto-generated summary line instead of the real message.
  const canEdit = meId !== null && post.author_user_id === meId && !isLetter
    && (Date.now() - new Date(post.created_at).getTime()) <= 15 * 60 * 1000;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={[s.container, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Post"
        showBack
        onBack={handleBack}
        right={canEdit ? (
          <TouchableOpacity onPress={() => navigation.navigate('CreatePost', {
            appId, postId: post.id, initialContent: post.content,
            initialPostType: post.post_type, initialPoll: post.post_type === 'poll' ? post.poll : undefined,
          })}>
            <Ionicons name="create-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        ) : undefined}
      />
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={s.postCard}>
          {!isLetter && (
            <View style={s.postHeader}>
              <Avatar name={authorName} photoUrl={post.author?.photo_url} size={42} />
              <View style={s.postMeta}>
                <Text style={s.authorName}>{authorName}</Text>
                <Text style={s.postTime}>{formatRelative(post.created_at)}</Text>
              </View>
            </View>
          )}

          {postType === 'feedback' && post.feedback ? (
            <View style={s.letterBlock}>
              <Text style={s.letterFromLine}>
                {fbFromName ? <Text style={s.letterBold}>{fbFromName}</Text> : <Text style={s.letterAnon}>Anonymous feedback</Text>}
                {' gave feedback to '}
                <RecipientNamesInline
                  recipients={fbToRecipients}
                  textStyle={s.letterBold}
                  linkStyle={s.recipientLink}
                  onExpand={setRecipientsModal}
                />
                <Text style={s.postTime}>  ·  {formatRelative(post.created_at)}</Text>
              </Text>
              {!!fbPreview && <PostContentView content={fbText} colors={colors} textStyle={s.postContent} />}
              {!!post.feedback.attachments?.length && (
                <AttachmentList attachments={post.feedback.attachments} imageMaxWidth={240} imageMaxHeight={180} />
              )}
            </View>
          ) : postType === 'appreciation' && post.appreciation ? (
            <View style={s.letterBlock}>
              <Text style={s.letterFromLine}>
                {apprMeta ? `${apprMeta.emoji} ` : ''}
                <Text style={s.letterBold}>{apprFromName}</Text>
                {' → '}
                <RecipientNamesInline
                  recipients={apprToRecipients}
                  textStyle={s.letterBold}
                  linkStyle={s.recipientLink}
                  onExpand={setRecipientsModal}
                />
                <Text style={s.postTime}>  ·  {formatRelative(post.created_at)}</Text>
              </Text>
              {!!post.appreciation.message && (
                <Text style={[s.postContent, { fontStyle: 'italic' }]}>"{stripTags(stripNonContentElements(post.appreciation.message))}"</Text>
              )}
              {!!post.attachments?.length && (
                <AttachmentList attachments={post.attachments} imageMaxWidth={240} imageMaxHeight={180} />
              )}
            </View>
          ) : postType === 'poll' && post.poll ? (
            <View style={s.letterBlock}>
              {/* post.content doubles as an optional note/context field on a
                  poll post — was never rendered here. */}
              {!!post.content && <PostContentView content={post.content} colors={colors} textStyle={[s.postContent, { marginBottom: 8 }]} />}
              <Text style={s.pollQuestion}>{post.poll.question}</Text>
              {post.poll.options.map((opt: any) => {
                const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
                const mine = myVotes.includes(opt.id);
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[s.pollOption, mine && s.pollOptionMine]}
                    onPress={() => handlePollOptionPress(opt.id)}
                    activeOpacity={0.8}
                  >
                    <View style={[s.pollOptionFill, { width: `${pct}%` }]} />
                    <Text style={s.pollOptionText} numberOfLines={2}>{mine ? '✓ ' : ''}{opt.option_text}</Text>
                    <Text style={s.pollOptionPct}>{opt.votes} · {pct}%</Text>
                  </TouchableOpacity>
                );
              })}
              <Text style={s.postTime}>
                {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}{post.poll.allow_multiple ? ' · Multiple choice' : ''}
              </Text>
              {!!post.attachments?.length && (
                <AttachmentList attachments={post.attachments} imageMaxWidth={240} imageMaxHeight={180} />
              )}
            </View>
          ) : (
            <>
              <PostContentView content={post.content ?? ''} colors={colors} textStyle={s.postContent} />
              {!!post.attachments?.length && (
                <AttachmentList attachments={post.attachments} imageMaxWidth={240} imageMaxHeight={180} />
              )}
            </>
          )}

          {/* Reactions aren't applicable to feedback — private, no engagement, matching web. */}
          {postType !== 'feedback' && (
            <View style={s.reactionsRow}>
              {REACTIONS.map((emoji) => {
                const selected = (post.my_reactions ?? []).includes(emoji);
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
          )}
        </View>

        {/* Comments aren't applicable to feedback — private, no discussion thread, matching web. */}
        {postType !== 'feedback' && (
          <>
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
                canDelete={meId !== null && (c.user_id === meId || c.author_user_id === meId)}
                onDelete={() => handleDeleteComment(c.id)}
              />
            ))}
            {comments.length === 0 && (
              <Text style={s.noComments}>No comments yet. Start the conversation!</Text>
            )}
          </>
        )}
      </ScrollView>

      {/* No insets.bottom — this screen sits inside the tab navigator, whose
          tabBarStyle already reserves the device's bottom safe area below it. */}
      {postType !== 'feedback' && (
        <View style={[s.inputBar, { paddingBottom: 8 }]}>
          <MentionCommentInput
            appId={appId}
            value={commentText}
            onChangeText={setCommentText}
            placeholder="Write a comment..."
            style={s.inputField}
            showEmojiPicker={false}
          />
          <TouchableOpacity onPress={handleComment} style={s.sendBtn} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="send" size={18} color="#ffffff" />}
          </TouchableOpacity>
        </View>
      )}
      <RecipientsModal recipients={recipientsModal} onClose={() => setRecipientsModal(null)} />
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
    letterBlock: { marginBottom: 14, gap: 8 },
    letterFromLine: { fontSize: 14, color: c.textSecondary, lineHeight: 20 },
    letterBold: { fontWeight: '700', color: c.textPrimary },
    recipientLink: { fontWeight: '700', color: c.primary, textDecorationLine: 'underline' },
    letterAnon: { fontStyle: 'italic', color: c.textMuted },
    pollQuestion: { fontSize: 17, fontWeight: '700', color: c.textPrimary, marginBottom: 4 },
    pollOption: {
      borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
      overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.gray50, marginBottom: 8,
    },
    pollOptionMine: { borderColor: c.primary },
    pollOptionFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: c.primaryLight },
    pollOptionText: { flex: 1, fontSize: 14, fontWeight: '600', color: c.textPrimary, marginRight: 8 },
    pollOptionPct: { fontSize: 12, fontWeight: '700', color: c.textSecondary },
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
