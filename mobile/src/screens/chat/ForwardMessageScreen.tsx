import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '@clerk/clerk-expo';
import { useTheme } from '../../contexts/ThemeContext';
import { useApi } from '../../hooks/useApi';
import { getSocket } from '../../lib/socket';
import { AppColors } from '../../utils/colors';
import { ChatStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import { showAlert } from '../../components/common/AlertModal';
import LoadError from '../../components/common/LoadError';
import Avatar from '../../components/common/Avatar';
import { withForwardMarker } from '../../utils/attachments';

type Nav = NativeStackNavigationProp<ChatStackParamList, 'ForwardMessage'>;
type Rt = RouteProp<ChatStackParamList, 'ForwardMessage'>;

export default function ForwardMessageScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const params = route.params;
  const { colors } = useTheme();
  const api = useApi();
  const { getToken } = useAuth();
  // Same reasoning as ChatListScreen/ChatThreadScreen: getToken isn't
  // reference-stable across renders, so it's read via a ref instead of being
  // a dependency of anything.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.chat.listConversations(params.appId);
      setConversations(res.data ?? []);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load conversations.'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.appId]);

  useEffect(() => { load(); }, [load]);

  const filtered = conversations.filter((c) => {
    if (!search.trim()) return true;
    const name = (c.display_name ?? c.name ?? (c.type === 'note' ? 'My Notes' : 'Conversation')).toLowerCase();
    return name.includes(search.trim().toLowerCase());
  });

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const doForward = () => {
    if (selected.size === 0 || sending) return;
    const socket = getSocket(async () => (await getTokenRef.current()) ?? '');
    if (!socket?.connected) {
      showAlert('Not Connected', 'Chat connection is not ready yet. Please wait a moment and try again.');
      return;
    }
    setSending(true);
    const targets = Array.from(selected);
    const forwardedBody = withForwardMarker(params.body ?? '');
    targets.forEach((conversationId) => {
      socket.emit('send_message', {
        conversation_id: conversationId,
        body: forwardedBody,
        reply_to_id: null,
        attachments: params.attachments ?? [],
      });
    });
    setSending(false);
    const count = targets.length;
    navigation.goBack();
    setTimeout(() => showAlert('Forwarded', `Message forwarded to ${count} conversation${count === 1 ? '' : 's'}.`), 300);
  };

  const previewText = params.body?.trim()
    || (params.attachments?.length ? `${params.attachments.length} attachment${params.attachments.length === 1 ? '' : 's'}` : 'Message');

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerBtn} hitSlop={8}>
          <Text style={s.headerBtnText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Forward to...</Text>
        <TouchableOpacity onPress={doForward} disabled={selected.size === 0 || sending} style={s.headerBtn} hitSlop={8}>
          {sending ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[s.headerBtnText, s.headerBtnPrimary, selected.size === 0 && s.headerBtnDisabled]}>
              Forward{selected.size > 0 ? ` (${selected.size})` : ''}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={s.previewBar}>
        <Ionicons name="arrow-redo-outline" size={14} color={colors.textMuted} />
        <Text style={s.previewText} numberOfLines={1}>{previewText}</Text>
      </View>

      <View style={s.searchRow}>
        <Ionicons name="search" size={15} color={colors.gray400} />
        <TextInput
          style={s.searchInput}
          placeholder="Search conversations..."
          placeholderTextColor={colors.gray400}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : error ? (
        <LoadError message={error} onRetry={load} />
      ) : (
        <ScrollView contentContainerStyle={[s.list, { paddingBottom: 16 + insets.bottom }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {filtered.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.gray400} />
              <Text style={s.emptyText}>No conversations found</Text>
            </View>
          ) : (
            filtered.map((c) => {
              const name = c.display_name ?? c.name ?? (c.type === 'note' ? 'My Notes' : 'Conversation');
              const isSelected = selected.has(c.id);
              const otherPhotoUrl = c.type === 'direct'
                ? c.members?.find((m: any) => String(m.id) === String(c.other_user_id))?.photo_url ?? null
                : null;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[s.row, isSelected && s.rowSelected]}
                  activeOpacity={0.7}
                  onPress={() => toggle(c.id)}
                >
                  <Avatar name={name} photoUrl={otherPhotoUrl} size={40} />
                  <Text style={s.rowName} numberOfLines={1}>{name}</Text>
                  <Ionicons
                    name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={isSelected ? colors.primary : colors.gray400}
                  />
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    headerBtn: { minWidth: 60, paddingVertical: 4 },
    headerBtnText: { fontSize: 14, color: c.textSecondary },
    headerBtnPrimary: { color: c.primary, fontWeight: '700', textAlign: 'right' },
    headerBtnDisabled: { color: c.gray400 },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700', color: c.textPrimary },
    previewBar: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 16, paddingVertical: 8,
      backgroundColor: c.primaryLight, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    previewText: { flex: 1, flexShrink: 1, fontSize: 12, color: c.textSecondary },
    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginTop: 12, marginBottom: 4,
      backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 12, paddingVertical: 8,
    },
    searchInput: { flex: 1, fontSize: 13, color: c.textPrimary },
    list: { padding: 16, gap: 8 },
    empty: { alignItems: 'center', gap: 12, paddingTop: 60 },
    emptyText: { fontSize: 14, color: c.textMuted },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 14, padding: 12,
      borderWidth: 1, borderColor: c.border,
    },
    rowSelected: { borderColor: c.primary + '55', backgroundColor: c.primaryLight },
    rowName: { flex: 1, flexShrink: 1, fontSize: 14, fontWeight: '600', color: c.textPrimary },
  });
}
