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

  // Unified forward targets: every existing conversation (direct/group/note)
  // PLUS every workspace member who doesn't already have a direct
  // conversation listed above — previously only existing conversations were
  // shown, so you couldn't forward to someone you'd never messaged yet.
  type Target =
    | { key: string; kind: 'conversation'; conversationId: number; name: string; photoUrl: string | null }
    | { key: string; kind: 'member'; userId: number; name: string; photoUrl: string | null };

  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [convRes, membersRes, meRes] = await Promise.all([
        api.chat.listConversations(params.appId),
        api.members.list(params.appId),
        api.me.getProfile(),
      ]);
      const conversations: any[] = convRes.data ?? [];
      const myId = meRes.data?.id ?? meRes.data?.user_id;
      const allMembers: any[] = membersRes.data?.items ?? membersRes.data ?? [];

      const convTargets: Target[] = conversations.map((c) => ({
        key: `conv-${c.id}`,
        kind: 'conversation',
        conversationId: c.id,
        name: c.display_name ?? c.name ?? (c.type === 'note' ? 'My Notes' : 'Conversation'),
        photoUrl: c.type === 'direct'
          ? c.members?.find((m: any) => String(m.id) === String(c.other_user_id))?.photo_url ?? null
          : null,
      }));

      const directUserIds = new Set(
        conversations.filter((c) => c.type === 'direct').map((c: any) => String(c.other_user_id))
      );
      const memberTargets: Target[] = allMembers
        .filter((m: any) => String(m.user_id) !== String(myId) && !directUserIds.has(String(m.user_id)))
        .map((m: any) => ({
          key: `member-${m.user_id}`,
          kind: 'member',
          userId: m.user_id,
          name: [m.first_name, m.last_name].filter(Boolean).join(' ') || m.email || `User ${m.user_id}`,
          photoUrl: m.photo_url ?? null,
        }));

      setTargets([...convTargets, ...memberTargets]);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load conversations.'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.appId]);

  useEffect(() => { load(); }, [load]);

  const filtered = targets.filter((t) => !search.trim() || t.name.toLowerCase().includes(search.trim().toLowerCase()));

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const doForward = async () => {
    if (selected.size === 0 || sending) return;
    const socket = getSocket(async () => (await getTokenRef.current()) ?? '');
    if (!socket?.connected) {
      showAlert('Not Connected', 'Chat connection is not ready yet. Please wait a moment and try again.');
      return;
    }
    setSending(true);
    const selectedTargets = targets.filter((t) => selected.has(t.key));
    try {
      // Members without an existing conversation need one created first —
      // createConversation is idempotent for type:'direct' (returns the
      // existing one if it's somehow already there), so this is safe to call
      // even in a race with another forward/new-chat action.
      const conversationIds = await Promise.all(selectedTargets.map(async (t) => {
        if (t.kind === 'conversation') return t.conversationId;
        const res = await api.chat.createConversation(params.appId, { type: 'direct', member_ids: [t.userId] });
        return res.data.id;
      }));
      conversationIds.forEach((conversationId) => {
        socket.emit('send_message', {
          conversation_id: conversationId,
          body: params.body ?? '',
          reply_to_id: null,
          attachments: params.attachments ?? [],
          forwarded: true,
        });
      });
      navigation.goBack();
    } catch (err) {
      showAlert('Could Not Forward', apiErrorMessage(err));
    } finally {
      setSending(false);
    }
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
          placeholder="Search people or conversations..."
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
              <Text style={s.emptyText}>No people or conversations found</Text>
            </View>
          ) : (
            filtered.map((t) => {
              const isSelected = selected.has(t.key);
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[s.row, isSelected && s.rowSelected]}
                  activeOpacity={0.7}
                  onPress={() => toggle(t.key)}
                >
                  <Avatar name={t.name} photoUrl={t.photoUrl} size={40} />
                  <Text style={s.rowName} numberOfLines={1}>{t.name}</Text>
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
