import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../common/Avatar';
import { showAlert } from '../common/AlertModal';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import { formatRelative } from '../../utils/format';

const EMOJIS = ['👍', '❤️', '🎉', '👏', '🔥'];

interface Post {
  id: number;
  content: string;
  post_type?: string;
  type?: string;
  author_name?: string;
  author?: { first_name?: string; last_name?: string; email?: string };
  created_at: string;
  reactions?: { emoji: string; count: number }[];
  reaction_count?: number;
  comment_count?: number;
  is_pinned?: boolean;
  my_reactions?: string[];
}

interface Props {
  post: Post;
  onPress: () => void;
  onReact: (emoji?: string) => void;
  onDelete?: () => void;
  onPin?: () => void;
  liked?: boolean;
}

function decodeHtml(str: string) {
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export default function PostCard({ post, onPress, onReact, onDelete, onPin, liked = false }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const postType = post.post_type ?? post.type ?? 'post';
  const authorName = post.author_name
    ?? ([post.author?.first_name, post.author?.last_name].filter(Boolean).join(' ') || post.author?.email || 'Unknown');

  const preview = decodeHtml(post.content ?? '').substring(0, 180);
  const reactionCount = post.reaction_count ?? post.reactions?.reduce((sum, r) => sum + r.count, 0) ?? 0;

  const typeLabel = postType === 'appreciation' ? '⭐ Appreciation'
    : postType === 'feedback' ? '💬 Feedback'
    : postType === 'announcement' ? '📢 Announcement'
    : 'Post';

  const typeLabelColor = postType === 'appreciation' ? '#c27803'
    : postType === 'feedback' ? colors.primary
    : postType === 'announcement' ? colors.info
    : colors.gray500;

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.9}>
      <View style={s.header}>
        <Avatar name={authorName} size={38} />
        <View style={s.info}>
          <View style={s.authorRow}>
            <Text style={s.author}>{authorName}</Text>
            {post.is_pinned && (
              <Ionicons name="pin" size={13} color={colors.primary} style={{ marginLeft: 4 }} />
            )}
          </View>
          <View style={s.metaRow}>
            <Text style={[s.typeLabel, { color: typeLabelColor }]}>{typeLabel}</Text>
            <Text style={s.dot}>·</Text>
            <Text style={s.time}>{formatRelative(post.created_at)}</Text>
          </View>
        </View>
        <TouchableOpacity
          hitSlop={12}
          style={s.moreBtn}
          onPress={(e) => {
            e.stopPropagation();
            showAlert('Post Options', undefined, [
              ...(onPin ? [{ text: post.is_pinned ? 'Unpin Post' : 'Pin Post', onPress: onPin }] : []),
              ...(onDelete ? [{ text: 'Delete Post', style: 'destructive' as const, onPress: () => {
                showAlert('Delete Post', 'Are you sure you want to delete this post?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: onDelete },
                ]);
              }}] : []),
              { text: 'Cancel', style: 'cancel' },
            ]);
          }}
        >
          <Ionicons name="ellipsis-vertical" size={16} color={colors.gray400} />
        </TouchableOpacity>
      </View>

      <Text style={s.content} numberOfLines={4}>{preview}</Text>

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
        <TouchableOpacity style={s.action} onPress={() => setShowEmojiPicker(!showEmojiPicker)}>
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
    moreBtn: { paddingTop: 2 },
    content: { fontSize: 14, color: c.gray700, lineHeight: 21, marginBottom: 12 },
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
  });
}
