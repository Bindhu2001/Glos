import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../common/Avatar';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import { formatRelative } from '../../utils/format';

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
}

interface Props {
  post: Post;
  onPress: () => void;
  onReact: () => void;
}

export default function PostCard({ post, onPress, onReact }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const postType = post.post_type ?? post.type ?? 'post';
  const authorName = post.author_name
    ?? ([post.author?.first_name, post.author?.last_name].filter(Boolean).join(' ') || post.author?.email || 'Unknown');

  const preview = (post.content ?? '').replace(/<[^>]*>/g, '').substring(0, 180);
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
          <Text style={s.author}>{authorName}</Text>
          <View style={s.metaRow}>
            <Text style={[s.typeLabel, { color: typeLabelColor }]}>{typeLabel}</Text>
            <Text style={s.dot}>·</Text>
            <Text style={s.time}>{formatRelative(post.created_at)}</Text>
          </View>
        </View>
        <TouchableOpacity hitSlop={12} style={s.moreBtn}>
          <Ionicons name="ellipsis-vertical" size={16} color={colors.gray400} />
        </TouchableOpacity>
      </View>

      <Text style={s.content} numberOfLines={4}>{preview}</Text>

      <View style={s.actions}>
        <TouchableOpacity style={s.action} onPress={onReact}>
          <Ionicons name="heart-outline" size={16} color={colors.gray500} />
          <Text style={s.actionText}>{reactionCount}</Text>
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
    author: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    typeLabel: { fontSize: 12, fontWeight: '500' },
    dot: { color: c.gray400, fontSize: 12 },
    time: { fontSize: 12, color: c.gray400 },
    moreBtn: { paddingTop: 2 },
    content: { fontSize: 14, color: c.gray700, lineHeight: 21, marginBottom: 12 },
    actions: { flexDirection: 'row', gap: 20, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 },
    action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    actionText: { fontSize: 13, color: c.gray500 },
  });
}
