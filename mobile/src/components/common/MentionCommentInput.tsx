import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import Avatar from './Avatar';

const EMOJIS = ['👍', '❤️', '😂', '🎉', '👏', '🔥', '😮', '🙏', '💯', '👀'];

interface MemberOpt { id: number; name: string; photoUrl?: string | null }

// Matches web's MentionTextarea (@ to mention) + emoji picker on the Feed
// comment box — mobile's comment box was a plain TextInput with neither.
// Inserts the same `@[id:Name]` token format the rest of the app already
// parses for display (see utils/mentions.tsx).
export default function MentionCommentInput({
  appId, value, onChangeText, onSelectionChange, placeholder, style, showEmojiPicker = true,
}: {
  appId: number;
  value: string;
  onChangeText: (text: string) => void;
  onSelectionChange?: (sel: { start: number; end: number }) => void;
  placeholder?: string;
  style?: any;
  showEmojiPicker?: boolean;
}) {
  const { colors } = useTheme();
  const api = useApi();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [members, setMembers] = useState<MemberOpt[]>([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [showEmojis, setShowEmojis] = useState(false);

  const loadMembers = () => {
    if (membersLoaded) return;
    setMembersLoaded(true);
    api.workspace.getMembers(appId).then((r: any) => {
      const items: any[] = r.data?.items ?? r.data ?? [];
      setMembers(items.map((m) => ({
        id: m.user_id ?? m.id,
        name: `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email || 'Member',
        photoUrl: m.photo_url,
      })));
    }).catch(() => {});
  };

  // Active mention search: text between the last "@" before the cursor and
  // the cursor itself, only while that span has no space in it.
  const mentionQuery = useMemo(() => {
    const upToCursor = value.slice(0, selection.start);
    const at = upToCursor.lastIndexOf('@');
    if (at === -1) return null;
    const between = upToCursor.slice(at + 1);
    if (/\s/.test(between)) return null;
    return between;
  }, [value, selection]);

  useEffect(() => { if (mentionQuery != null) loadMembers(); }, [mentionQuery != null]); // eslint-disable-line react-hooks/exhaustive-deps

  const mentionMatches = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery.toLowerCase();
    return members.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, members]);

  const insertAtCursor = (text: string) => {
    const before = value.slice(0, selection.start);
    const after = value.slice(selection.end);
    const next = before + text + after;
    onChangeText(next);
    const newPos = before.length + text.length;
    setSelection({ start: newPos, end: newPos });
    onSelectionChange?.({ start: newPos, end: newPos });
  };

  const pickMention = (m: MemberOpt) => {
    const upToCursor = value.slice(0, selection.start);
    const at = upToCursor.lastIndexOf('@');
    const before = value.slice(0, at);
    const after = value.slice(selection.start);
    const token = `@[${m.id}:${m.name}] `;
    const next = before + token + after;
    onChangeText(next);
    const newPos = before.length + token.length;
    setSelection({ start: newPos, end: newPos });
    onSelectionChange?.({ start: newPos, end: newPos });
  };

  return (
    <View style={{ flex: 1 }}>
      {mentionQuery != null && mentionMatches.length > 0 && (
        <View style={s.mentionDropdown}>
          <FlatList
            data={mentionMatches}
            keyExtractor={(m) => String(m.id)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={s.mentionRow} onPress={() => pickMention(item)}>
                <Avatar name={item.name} photoUrl={item.photoUrl} size={22} />
                <Text style={s.mentionRowText} numberOfLines={1}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
      {showEmojiPicker && showEmojis && (
        <View style={s.emojiRow}>
          {EMOJIS.map((e) => (
            <TouchableOpacity key={e} onPress={() => insertAtCursor(e)} hitSlop={4}>
              <Text style={s.emoji}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={[s.inputRow, style]}>
        {showEmojiPicker && (
          <TouchableOpacity onPress={() => setShowEmojis((v) => !v)} hitSlop={8} style={s.emojiToggle}>
            <Text style={[s.emojiToggleGlyph, showEmojis && { opacity: 1 }]}>😊</Text>
          </TouchableOpacity>
        )}
        <TextInput
          style={s.input}
          placeholder={placeholder}
          placeholderTextColor={colors.gray400}
          value={value}
          onChangeText={onChangeText}
          onSelectionChange={(e) => {
            setSelection(e.nativeEvent.selection);
            onSelectionChange?.(e.nativeEvent.selection);
          }}
          onFocus={loadMembers}
          multiline
        />
      </View>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, flex: 1 },
    emojiToggle: { paddingBottom: 8 },
    emojiToggleGlyph: { fontSize: 18, opacity: 0.55 },
    // Explicit color + vertical alignment — a bare multiline TextInput with
    // no minHeight can, on Android, lay its single line of text out above
    // the row's visible clipped bounds, which reads as invisible text even
    // though the color itself was always correct.
    input: { flex: 1, fontSize: 14, color: c.textPrimary, maxHeight: 100, textAlignVertical: 'center', paddingVertical: 0 },
    mentionDropdown: {
      position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 6,
      backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      maxHeight: 190, overflow: 'hidden',
    },
    mentionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
    mentionRowText: { fontSize: 13, fontWeight: '600', color: c.textPrimary },
    emojiRow: {
      flexDirection: 'row', gap: 10, paddingHorizontal: 10, paddingVertical: 8,
      backgroundColor: c.gray50, borderRadius: 10, marginBottom: 6, flexWrap: 'wrap',
    },
    emoji: { fontSize: 20 },
  });
}
