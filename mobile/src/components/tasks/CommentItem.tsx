import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../common/Avatar';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import { formatRelative } from '../../utils/format';

interface Comment {
  id: number;
  body: string;
  author_name: string;
  created_at: string;
}

interface Props {
  comment: Comment;
  canDelete: boolean;
  onDelete: () => void;
}

export default function CommentItem({ comment, canDelete, onDelete }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={s.row}>
      <Avatar name={comment.author_name} size={32} />
      <View style={s.bubble}>
        <View style={s.meta}>
          <Text style={s.author}>{comment.author_name}</Text>
          <Text style={s.time}>{formatRelative(comment.created_at)}</Text>
          {canDelete && (
            <TouchableOpacity onPress={onDelete} hitSlop={8} style={s.deleteBtn}>
              <Ionicons name="trash-outline" size={14} color={colors.danger} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={s.body}>{comment.body}</Text>
      </View>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    bubble: { flex: 1, backgroundColor: c.gray50, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: c.border },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    author: { fontSize: 13, fontWeight: '600', color: c.textPrimary },
    time: { fontSize: 11, color: c.gray400, flex: 1 },
    deleteBtn: { marginLeft: 'auto' },
    body: { fontSize: 13, color: c.gray700, lineHeight: 19 },
  });
}
