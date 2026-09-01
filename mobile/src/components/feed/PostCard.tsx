import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../common/Avatar';
import { showAlert } from '../common/AlertModal';
import UserProfileModal, { ProfileUser } from '../common/UserProfileModal';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import { formatRelative } from '../../utils/format';
import { hasTable, stripNonContentElements, stripTags } from '../../utils/postContent';
import { stripMentionTokens } from '../../utils/mentions';
import { BADGE_META } from '../../utils/badges';
import AttachmentList from '../common/AttachmentList';
import { Attachment } from '../../utils/attachments';
import {
  RecipientNamesInline, RecipientsModal, toRecipients, Recipient,
} from './RecipientNames';

const EMOJIS = ['👍', '❤️', '🎉', '👏', '🔥'];

interface Post {
  id: number;
  content: string;
  post_type?: string;
  type?: string;
  author_name?: string;
  author_user_id?: number;
  author?: { first_name?: string; last_name?: string; email?: string; photo_url?: string | null };
  created_at: string;
  reactions?: { emoji: string; count: number; user_names?: string[] }[];
  reaction_count?: number;
  comment_count?: number;
  is_pinned?: boolean;
  my_reactions?: string[];
  audience_type?: 'all' | 'users' | 'departments' | 'roles' | null;
  audience_ids?: number[] | string | null;
  attachments?: Attachment[];
  appreciation?: {
    from_user?: { first_name?: string; last_name?: string; email?: string };
    to_user?: { first_name?: string; last_name?: string; email?: string };
    to_users?: { first_name?: string; last_name?: string; email?: string }[];
    badge?: string;
    message?: string;
  };
  poll?: {
    question: string;
    allow_multiple?: boolean;
    total_votes?: number;
    my_votes?: number[];
    options: { id: number; option_text: string; votes: number }[];
  };
  feedback?: {
    from_user?: { first_name?: string; last_name?: string; email?: string } | null;
    to_user?: { first_name?: string; last_name?: string; email?: string };
    to_users?: { first_name?: string; last_name?: string; email?: string }[];
    feedback_text?: string;
    is_anonymous?: boolean | number;
    attachments?: Attachment[];
  };
}

interface NamedOption { id: number; name: string }

interface Props {
  post: Post;
  onPress: () => void;
  onReact: (emoji?: string) => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onPin?: () => void;
  onVote?: (optionIds: number[]) => void;
  liked?: boolean;
  members?: NamedOption[];
  departments?: NamedOption[];
  roles?: NamedOption[];
}

function uname(u: any): string {
  if (!u) return 'Someone';
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Someone';
}

const AUDIENCE_ICON: Record<string, string> = { users: '👤', departments: '🏢', roles: '💼' };

// audience_ids comes back as a JSON string on some responses and an already-parsed
// array on others (same inconsistency as core_values) — normalize defensively.
function parseAudienceIds(raw: number[] | string | null | undefined): number[] {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; }
}

function resolveAudienceNames(post: Post, members: NamedOption[], departments: NamedOption[], roles: NamedOption[]): string[] {
  if (!post.audience_type || post.audience_type === 'all') return [];
  const ids = parseAudienceIds(post.audience_ids);
  if (ids.length === 0) return [];
  const list = post.audience_type === 'users' ? members : post.audience_type === 'departments' ? departments : roles;
  return ids.map((id) => list.find((x) => x.id === id)?.name ?? `#${id}`);
}

export default function PostCard({ post, onPress, onReact, onDelete, onEdit, onPin, onVote, liked = false, members = [], departments = [], roles = [] }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showReactors, setShowReactors] = useState(false);
  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null);
  const [audienceModalOpen, setAudienceModalOpen] = useState(false);
  const [recipientsModal, setRecipientsModal] = useState<Recipient[] | null>(null);

  const audienceNames = resolveAudienceNames(post, members, departments, roles);

  const postType = post.post_type ?? post.type ?? 'post';
  const authorName = post.author_name
    ?? ([post.author?.first_name, post.author?.last_name].filter(Boolean).join(' ') || post.author?.email || 'Unknown');

  const contentHasTable = hasTable(post.content);
  // stripTags turns paragraph/list/br boundaries into real line breaks instead of
  // jamming adjacent blocks together — but a <table>'s cells would still come out
  // jumbled as a run of text, so it's cut from the preview entirely and shown as a
  // "Table" note instead; full content (with an actual rendered grid) is shown on
  // PostDetailScreen.
  const previewSource = contentHasTable
    ? (post.content ?? '').replace(/<table[\s\S]*?<\/table>/gi, '')
    : (post.content ?? '');
  const preview = stripMentionTokens(stripTags(stripNonContentElements(previewSource))).substring(0, 180);
  const reactionCount = post.reaction_count ?? post.reactions?.reduce((sum, r) => sum + r.count, 0) ?? 0;

  const typeLabel = postType === 'appreciation' ? '⭐ Appreciation'
    : postType === 'feedback' ? '💬 Feedback'
    : postType === 'announcement' ? '📢 Announcement'
    : postType === 'poll' ? '📊 Poll'
    : 'Post';

  const typeLabelColor = postType === 'appreciation' ? '#c27803'
    : postType === 'feedback' ? colors.primary
    : postType === 'announcement' ? colors.info
    : postType === 'poll' ? '#7c3aed'
    : colors.gray500;

  // feed_posts.content for a feedback row is just a short summary line
  // ("Alice gave feedback to Bob") — the actual message lives in
  // post.feedback.feedback_text, same as how appreciation's real message is
  // in post.appreciation.message rather than post.content.
  const fbText = post.feedback?.feedback_text ?? '';
  const fbHasTable = hasTable(fbText);
  const fbPreviewSource = fbHasTable ? fbText.replace(/<table[\s\S]*?<\/table>/gi, '') : fbText;
  const fbPreview = stripMentionTokens(stripTags(stripNonContentElements(fbPreviewSource))).substring(0, 180);
  const fbFromName = post.feedback?.is_anonymous ? null : uname(post.feedback?.from_user);
  const fbToRecipients = toRecipients(post.feedback?.to_users, null, post.feedback?.to_user);

  // Appreciation/feedback letter cards show their own from/to identity line —
  // the generic avatar+name header is not just redundant for these, it's a
  // real privacy leak for anonymous feedback: the backend nulls the resolved
  // `author` object when anonymous, but not the raw `author_user_id` on the
  // post itself, so a tappable avatar wired to that id would still open the
  // real sender's profile. Hiding the header entirely (matching web's
  // `isLetter` treatment) avoids ever surfacing that id in the UI.
  const isLetter = postType === 'appreciation' || postType === 'feedback';

  const myVotes = post.poll?.my_votes ?? [];
  const totalVotes = post.poll?.total_votes ?? 0;
  const handleVote = (optionId: number) => {
    if (!onVote || !post.poll) return;
    const allowMultiple = !!post.poll.allow_multiple;
    const next = allowMultiple
      ? (myVotes.includes(optionId) ? myVotes.filter((id) => id !== optionId) : [...myVotes, optionId])
      : (myVotes.includes(optionId) ? [] : [optionId]);
    onVote(next);
  };

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.9}>
      <View style={s.header}>
        {!isLetter && (
          <Avatar
            name={authorName}
            photoUrl={post.author?.photo_url}
            size={38}
            onPress={() => setProfileUser({
              id: post.author_user_id,
              name: authorName,
              photoUrl: post.author?.photo_url,
              email: post.author?.email,
            })}
          />
        )}
        <View style={s.info}>
          <View style={s.authorRow}>
            {!isLetter && <Text style={s.author}>{authorName}</Text>}
            {post.is_pinned && (
              <Text style={{ fontSize: 13, marginLeft: 4 }}>📌</Text>
            )}
          </View>
          <View style={s.metaRow}>
            <Text style={[s.typeLabel, { color: typeLabelColor }]}>{typeLabel}</Text>
            <Text style={s.dot}>·</Text>
            <Text style={s.time}>{formatRelative(post.created_at)}</Text>
          </View>
          {audienceNames.length > 0 && (
            <TouchableOpacity
              style={s.audienceBadge}
              onPress={(e) => { e.stopPropagation(); setAudienceModalOpen(true); }}
            >
              <Text style={s.audienceBadgeText} numberOfLines={1}>
                {AUDIENCE_ICON[post.audience_type as string] ?? '👤'} {audienceNames[0]}
                {audienceNames.length > 1 ? ` +${audienceNames.length - 1}` : ''}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {/* Hidden entirely when none of pin/edit/delete apply — otherwise it
            still showed on other people's posts and opened a menu with
            nothing in it but Cancel, since those are all owner/admin-gated
            by the caller (FeedScreen: onEdit/onDelete require authorship,
            onPin requires admin). */}
        {((onPin && postType !== 'feedback') || onEdit || onDelete) && (
          <TouchableOpacity
            hitSlop={12}
            style={s.moreBtn}
            onPress={(e) => {
              e.stopPropagation();
              showAlert('Post Options', undefined, [
                ...(onPin && postType !== 'feedback' ? [{
                  text: post.is_pinned ? 'Unpin Post' : 'Pin Post',
                  icon: (post.is_pinned ? 'pin-outline' : 'pin') as any,
                  onPress: onPin,
                }] : []),
                ...(onEdit ? [{
                  text: 'Edit Post',
                  icon: 'create-outline' as any,
                  onPress: onEdit,
                }] : []),
                ...(onDelete ? [{
                  text: 'Delete Post',
                  style: 'destructive' as const,
                  icon: 'trash-outline' as any,
                  onPress: () => {
                    showAlert('Delete Post', 'Are you sure you want to delete this post?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: onDelete },
                    ]);
                  },
                }] : []),
                { text: 'Cancel', style: 'cancel' },
              ]);
            }}
          >
            <Ionicons name="ellipsis-vertical" size={16} color={colors.gray400} />
          </TouchableOpacity>
        )}
      </View>

      {postType === 'appreciation' && post.appreciation ? (
        <View style={s.apprBlock}>
          {(() => {
            const meta = BADGE_META[post.appreciation.badge ?? ''];
            const fromName = [post.appreciation.from_user?.first_name, post.appreciation.from_user?.last_name].filter(Boolean).join(' ') || post.appreciation.from_user?.email || 'Someone';
            const toRecs = toRecipients(post.appreciation.to_users, null, post.appreciation.to_user);
            return (
              <>
                {meta && <Text style={s.apprEmoji}>{meta.emoji}</Text>}
                <View style={{ flex: 1 }}>
                  <View style={s.apprNameRow}>
                    <Text style={s.apprNames} numberOfLines={2}>
                      <Text style={s.apprBold}>{fromName}</Text>
                      {' → '}
                      <RecipientNamesInline
                        recipients={toRecs}
                        textStyle={s.apprBold}
                        linkStyle={s.recipientLink}
                        onExpand={setRecipientsModal}
                      />
                    </Text>
                    {meta && (
                      <View style={s.apprChip}>
                        <Text style={s.apprChipText}>{meta.label}</Text>
                      </View>
                    )}
                  </View>
                  {!!post.appreciation.message && (
                    <Text style={s.apprMsg}>"{stripTags(stripNonContentElements(post.appreciation.message))}"</Text>
                  )}
                </View>
              </>
            );
          })()}
        </View>
      ) : postType === 'feedback' && post.feedback ? (
        <View style={s.fbBlock}>
          <Text style={s.fbFromLine}>
            {fbFromName ? <Text style={s.apprBold}>{fbFromName}</Text> : <Text style={s.fbAnon}>Anonymous feedback</Text>}
            {' gave feedback to '}
            <RecipientNamesInline
              recipients={fbToRecipients}
              textStyle={s.apprBold}
              linkStyle={s.recipientLink}
              onExpand={setRecipientsModal}
            />
          </Text>
          {!!fbPreview && <Text style={s.content}>{fbPreview}</Text>}
          {!!post.feedback.attachments?.length && (
            <AttachmentList attachments={post.feedback.attachments} imageMaxWidth={220} imageMaxHeight={170} />
          )}
        </View>
      ) : postType === 'poll' && post.poll ? (
        <View style={s.pollBlock}>
          {/* post.content doubles as an optional note/context field on a poll
              post (same field the plain-post branch previews below) — it was
              never rendered here, so a note added on web was invisible on
              mobile. */}
          {!!preview && <Text style={[s.content, { marginBottom: 8 }]} numberOfLines={4}>{preview}</Text>}
          <Text style={s.pollQuestion}>{post.poll.question}</Text>
          {post.poll.options.map((opt) => {
            const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
            const mine = myVotes.includes(opt.id);
            return (
              <TouchableOpacity
                key={opt.id}
                style={[s.pollOption, mine && s.pollOptionMine]}
                onPress={(e) => { e.stopPropagation(); handleVote(opt.id); }}
                activeOpacity={0.8}
              >
                <View style={[s.pollOptionFill, { width: `${pct}%` }]} />
                <Text style={s.pollOptionText} numberOfLines={2}>{mine ? '✓ ' : ''}{opt.option_text}</Text>
                <Text style={s.pollOptionPct}>{opt.votes} · {pct}%</Text>
              </TouchableOpacity>
            );
          })}
          <Text style={s.pollMeta}>
            {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}{post.poll.allow_multiple ? ' · Multiple choice' : ''}
          </Text>
          {!!post.attachments?.length && (
            <AttachmentList attachments={post.attachments} imageMaxWidth={220} imageMaxHeight={170} />
          )}
        </View>
      ) : (
        <>
          {!!preview && <Text style={s.content} numberOfLines={4}>{preview}</Text>}
          {contentHasTable && (
            <View style={s.tableNote}>
              <Ionicons name="grid-outline" size={13} color={colors.primary} />
              <Text style={s.tableNoteText}>Contains a table · tap to view</Text>
            </View>
          )}
          {!!post.attachments?.length && (
            <AttachmentList attachments={post.attachments} imageMaxWidth={220} imageMaxHeight={170} />
          )}
        </>
      )}

      {/* Reactions/comments aren't applicable to feedback — private, no engagement, matching web. */}
      {postType !== 'feedback' && (
      <>
      {/* Emoji picker row */}
      {showEmojiPicker && (
        <View style={s.emojiPicker}>
          {EMOJIS.map((emoji) => {
            const isActive = post.my_reactions?.includes(emoji);
            return (
              <TouchableOpacity
                key={emoji}
                style={[s.emojiBtn, isActive && s.emojiBtnActive]}
                onPress={() => { onReact(emoji); setShowEmojiPicker(false); }}
              >
                <Text style={s.emojiText}>{emoji}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={s.actions}>
        <TouchableOpacity
          style={s.action}
          onPress={() => setShowEmojiPicker(!showEmojiPicker)}
          onLongPress={() => { if (post.reactions && post.reactions.length > 0) setShowReactors(true); }}
        >
          {post.reactions && post.reactions.length > 0 ? (
            <Text style={{ fontSize: 16, marginRight: -2 }}>
              {post.reactions.slice(0, 3).map(r => r.emoji).join('')}
            </Text>
          ) : (
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={16}
              color={liked ? '#ef4444' : colors.gray500}
            />
          )}
          <Text style={[s.actionText, (liked || (post.reactions && post.reactions.length > 0)) && { color: '#ef4444', fontWeight: '700' }]}>
            {reactionCount}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.action} onPress={onPress}>
          <Ionicons name="chatbubble-outline" size={16} color={colors.gray500} />
          <Text style={s.actionText}>{post.comment_count ?? 0}</Text>
        </TouchableOpacity>
      </View>
      </>
      )}
      <UserProfileModal user={profileUser} onClose={() => setProfileUser(null)} />
      <RecipientsModal recipients={recipientsModal} onClose={() => setRecipientsModal(null)} />
      <Modal visible={audienceModalOpen} transparent animationType="fade" onRequestClose={() => setAudienceModalOpen(false)}>
        {/* Pressable, not TouchableOpacity, for both layers: legacy Touchable
            claims the responder as soon as a touch starts (it needs to for its
            own press/opacity feedback), and once claimed it doesn't reliably
            hand off to the FlatList below when the touch turns into a scroll —
            the exact "opens fine but won't scroll" symptom, and flaky rather
            than constant because it depends on gesture timing. Pressable's
            default responder negotiation is more cooperative with a nested
            scrollable's own gesture claim. */}
        <Pressable style={s.audienceOverlay} onPress={() => setAudienceModalOpen(false)}>
          <Pressable style={s.audienceModalCard} onPress={(e) => e.stopPropagation()}>
            <View style={s.audienceModalHead}>
              <Text style={s.audienceModalTitle}>Shared with</Text>
              <TouchableOpacity onPress={() => setAudienceModalOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={audienceNames}
              keyExtractor={(name, i) => `${name}-${i}`}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => (
                <View style={s.audienceModalRow}>
                  <Avatar name={item} size={30} />
                  <Text style={s.audienceModalRowText}>{item}</Text>
                </View>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* "Who reacted" — matches web's FeedReactionPill hover tooltip, shown
          via long-press instead since mobile has no hover. Names come from
          reactions[].user_names, already returned by the API but previously
          unused on mobile. */}
      <Modal visible={showReactors} transparent animationType="fade" onRequestClose={() => setShowReactors(false)}>
        <Pressable style={s.audienceOverlay} onPress={() => setShowReactors(false)}>
          <Pressable style={s.audienceModalCard} onPress={(e) => e.stopPropagation()}>
            <View style={s.audienceModalHead}>
              <Text style={s.audienceModalTitle}>Reactions</Text>
              <TouchableOpacity onPress={() => setShowReactors(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={post.reactions ?? []}
              keyExtractor={(r) => r.emoji}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => (
                <View>
                  <View style={s.reactorGroupHead}>
                    <Text style={s.reactorGroupEmoji}>{item.emoji}</Text>
                    <Text style={s.reactorGroupCount}>{item.count} {item.count === 1 ? 'person' : 'people'}</Text>
                  </View>
                  {(item.user_names ?? []).map((name, i) => (
                    <View key={`${item.emoji}-${i}`} style={s.audienceModalRow}>
                      <Avatar name={name} size={26} />
                      <Text style={s.audienceModalRowText}>{name}</Text>
                    </View>
                  ))}
                </View>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </TouchableOpacity>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
    info: { flex: 1 },
    authorRow: { flexDirection: 'row', alignItems: 'center' },
    author: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    typeLabel: { fontSize: 12, fontWeight: '500' },
    dot: { color: c.gray400, fontSize: 12 },
    time: { fontSize: 12, color: c.gray400 },
    audienceBadge: {
      alignSelf: 'flex-start', marginTop: 5, paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: 8, backgroundColor: c.primaryLight,
    },
    audienceBadgeText: { fontSize: 11, fontWeight: '600', color: c.primary },
    audienceOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    audienceModalCard: {
      width: '100%', maxWidth: 360, backgroundColor: c.surface, borderRadius: 16,
      padding: 18, borderWidth: 1, borderColor: c.border,
    },
    audienceModalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    audienceModalTitle: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    audienceModalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    audienceModalRowText: { fontSize: 13, fontWeight: '600', color: c.textPrimary },
    reactorGroupHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingTop: 10, paddingBottom: 4 },
    reactorGroupEmoji: { fontSize: 16 },
    reactorGroupCount: { fontSize: 12, fontWeight: '700', color: c.textMuted },
    moreBtn: { paddingTop: 2 },
    content: { fontSize: 14, color: c.gray700, lineHeight: 21, marginBottom: 12 },
    tableNote: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: c.primaryLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
      marginBottom: 12, alignSelf: 'flex-start',
    },
    tableNoteText: { fontSize: 12, fontWeight: '600', color: c.primary },
    emojiPicker: {
      flexDirection: 'row', gap: 6, backgroundColor: c.gray100,
      borderRadius: 30, padding: 8, alignSelf: 'flex-start', marginBottom: 8,
    },
    emojiBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    emojiBtnActive: { backgroundColor: c.primaryLight },
    emojiText: { fontSize: 20 },
    actions: { flexDirection: 'row', gap: 20, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 },
    action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    actionText: { fontSize: 13, color: c.gray500 },
    // Appreciation block
    apprBlock: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      backgroundColor: c.primaryLight, borderRadius: 10, padding: 10, marginBottom: 12,
    },
    apprEmoji: { fontSize: 28, lineHeight: 34 },
    apprNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 },
    apprNames: { fontSize: 13, color: c.textSecondary, flex: 1 },
    apprBold: { fontWeight: '700', color: c.textPrimary },
    recipientLink: { fontWeight: '700', color: c.primary, textDecorationLine: 'underline' },
    apprChip: {
      backgroundColor: c.primary, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10,
    },
    apprChipText: { fontSize: 10, fontWeight: '700', color: '#fff' },
    apprMsg: { fontSize: 13, color: c.textPrimary, fontStyle: 'italic', lineHeight: 18 },
    // Feedback block (private — no reactions/comments)
    fbBlock: { marginBottom: 12, gap: 6 },
    fbFromLine: { fontSize: 13, color: c.textSecondary, lineHeight: 19 },
    fbAnon: { fontStyle: 'italic', color: c.textMuted },
    // Poll block
    pollBlock: { marginBottom: 12, gap: 8 },
    pollQuestion: { fontSize: 15, fontWeight: '700', color: c.textPrimary, marginBottom: 2 },
    pollOption: {
      borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
      overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.gray50, marginBottom: 8,
    },
    pollOptionMine: { borderColor: c.primary },
    pollOptionFill: {
      position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: c.primaryLight,
    },
    pollOptionText: { flex: 1, fontSize: 13, fontWeight: '600', color: c.textPrimary, marginRight: 8 },
    pollOptionPct: { fontSize: 12, fontWeight: '700', color: c.textSecondary },
    pollMeta: { fontSize: 11, color: c.textMuted, marginTop: 2 },
  });
}
