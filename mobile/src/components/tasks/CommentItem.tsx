import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../common/Avatar';
import AttachmentList from '../common/AttachmentList';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import { formatRelative } from '../../utils/format';
import { Attachment, stripAttachmentMarkers } from '../../utils/attachments';
import { renderMentionText } from '../../utils/mentions';

interface Comment {
  id: number;
  body: string;
  author_name: string;
  author_photo_url?: string | null;
  created_at: string;
  edited_at?: string | null;
  attachments?: Attachment[];
}

interface Props {
  comment: Comment;
  canDelete: boolean;
  onDelete: () => void;
  // Edit is only meaningful where the backend supports it (task comments) —
  // omit both to hide the edit affordance entirely (e.g. feed comments,
  // which have no edit endpoint).
  canEdit?: boolean;
  onEdit?: (newBody: string) => Promise<void> | void;
}

export default function CommentItem({ comment, canDelete, onDelete, canEdit, onEdit }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(stripAttachmentMarkers(comment.body));
  const [saving, setSaving] = useState(false);

  // Matches web ("strip [[att:N]] markers on edit") — mobile has no rich
  // compose UI to re-anchor an inline attachment marker at a specific
  // position, so editing here always drops back to the plain "attachments
  // below the text" layout rather than showing the raw [[att:N]] token.
  const startEdit = () => {
    setEditText(stripAttachmentMarkers(comment.body));
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditText(stripAttachmentMarkers(comment.body));
  };

  const saveEdit = async () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === stripAttachmentMarkers(comment.body) || !onEdit) { setEditing(false); return; }
    setSaving(true);
    try {
      await onEdit(trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={s.row}>
      <Avatar name={comment.author_name} photoUrl={comment.author_photo_url} size={32} />
      <View style={s.bubble}>
        <View style={s.meta}>
          <Text style={s.author} numberOfLines={1}>{comment.author_name}</Text>
          <Text style={s.time}>{formatRelative(comment.created_at)}</Text>
          {!!comment.edited_at && <Text style={s.editedTag}>edited</Text>}
          <View style={s.actions}>
            {canEdit && !editing && (
              <TouchableOpacity onPress={startEdit} hitSlop={8} style={s.actionBtn}>
                <Ionicons name="pencil-outline" size={14} color={colors.gray400} />
              </TouchableOpacity>
            )}
            {canDelete && !editing && (
              <TouchableOpacity onPress={onDelete} hitSlop={8} style={s.actionBtn}>
                <Ionicons name="trash-outline" size={14} color={colors.danger} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {editing ? (
          <View>
            <TextInput
              style={s.editInput}
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              editable={!saving}
            />
            <View style={s.editActions}>
              <TouchableOpacity onPress={cancelEdit} disabled={saving} style={s.editCancelBtn}>
                <Text style={s.editCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveEdit} disabled={saving || !editText.trim()} style={s.editSaveBtn}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.editSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {!!comment.body && <Text style={s.body}>{renderMentionText(stripAttachmentMarkers(comment.body), s.mention)}</Text>}
            {!!comment.attachments?.length && (
              <AttachmentList attachments={comment.attachments} imageMaxWidth={160} imageMaxHeight={120} />
            )}
          </>
        )}
      </View>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    bubble: { flex: 1, backgroundColor: c.gray50, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: c.border },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    author: { fontSize: 13, fontWeight: '600', color: c.textPrimary, flexShrink: 1 },
    time: { fontSize: 11, color: c.gray400, flexShrink: 0 },
    editedTag: { fontSize: 11, color: c.gray400, fontStyle: 'italic', flexShrink: 0 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 'auto', flexShrink: 0 },
    actionBtn: {},
    body: { fontSize: 13, color: c.gray700, lineHeight: 19 },
    mention: { fontWeight: '700', color: c.primary },
    editInput: {
      fontSize: 13, color: c.textPrimary, lineHeight: 19, minHeight: 60,
      backgroundColor: c.surface, borderRadius: 8, borderWidth: 1, borderColor: c.border,
      padding: 8, textAlignVertical: 'top',
    },
    editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
    editCancelBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: c.gray100 },
    editCancelText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
    editSaveBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: c.primary, minWidth: 56, alignItems: 'center' },
    editSaveText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  });
}
