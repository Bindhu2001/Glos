import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { ChatStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import { showAlert } from '../../components/common/AlertModal';
import LoadError from '../../components/common/LoadError';

type Nav = NativeStackNavigationProp<ChatStackParamList, 'NewConversation'>;
type Rt = RouteProp<ChatStackParamList, 'NewConversation'>;

function memberName(m: any) {
  const first = m.first_name ?? m.user?.first_name ?? '';
  const last = m.last_name ?? m.user?.last_name ?? '';
  return [first, last].filter(Boolean).join(' ') || m.email || m.user?.email || `User ${m.user_id}`;
}

export default function NewConversationScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { colors } = useTheme();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  // Matches web's explicit Direct/Group toggle in NewConvModal — mobile used
  // to infer type purely from selection count, so picking exactly one other
  // person always produced an unnamed direct chat with no way to force a
  // genuine named group of 2.
  const [forceGroup, setForceGroup] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.members.list(params.appId), api.me.getProfile()])
      .then(([membersRes, meRes]) => {
        const myId = meRes.data?.id ?? meRes.data?.user_id;
        const all = membersRes.data?.items ?? membersRes.data ?? [];
        // Exclude self — you can't start a direct/group chat with only yourself.
        setMembers(all.filter((m: any) => String(m.user_id) !== String(myId)));
        setError(null);
      })
      .catch((err) => setError(apiErrorMessage(err, 'Could not load members.')))
      .finally(() => setLoading(false));
  }, [params.appId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (userId: number) => {
    setSelected((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const isGroup = forceGroup || selected.length > 1;

  const create = async () => {
    if (selected.length === 0) return;
    if (isGroup && !groupName.trim()) return;
    setCreating(true);
    try {
      const res = await api.chat.createConversation(params.appId, {
        type: isGroup ? 'group' : 'direct',
        name: isGroup ? groupName.trim() : undefined,
        member_ids: selected,
      });
      const conv = res.data;
      const name = conv.display_name ?? conv.name ?? 'Conversation';
      navigation.replace('ChatThread', { conversationId: conv.id, appId: params.appId, title: name, type: conv.type ?? (isGroup ? 'group' : 'direct') });
    } catch (err) {
      showAlert('Could not start conversation', apiErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>New Conversation</Text>
        <View style={{ width: 36 }} />
      </View>

      {selected.length === 1 && (
        <TouchableOpacity style={s.groupToggleRow} onPress={() => setForceGroup((v) => !v)}>
          <Ionicons name={forceGroup ? 'checkbox' : 'square-outline'} size={20} color={forceGroup ? colors.primary : colors.gray400} />
          <Text style={s.groupToggleTxt}>Create as a named group instead of a direct chat</Text>
        </TouchableOpacity>
      )}

      {isGroup && (
        <TextInput
          style={s.groupInput}
          placeholder="Group name"
          placeholderTextColor={colors.textMuted}
          value={groupName}
          onChangeText={setGroupName}
        />
      )}

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : error ? (
        <LoadError message={error} onRetry={load} />
      ) : members.length === 0 ? (
        <Text style={s.emptyText}>No other members in this workspace yet.</Text>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {members.map((m) => {
            const isSelected = selected.includes(m.user_id);
            return (
              <TouchableOpacity key={m.user_id} style={s.row} onPress={() => toggle(m.user_id)}>
                <View style={[s.checkbox, isSelected && s.checkboxActive]}>
                  {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={s.rowName}>{memberName(m)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[s.createBtn, (selected.length === 0 || creating) && s.createBtnDisabled]}
          onPress={create}
          disabled={selected.length === 0 || creating}
        >
          {creating ? <ActivityIndicator color="#fff" /> : <Text style={s.createBtnText}>Start Conversation</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(c: AppColors) {
  const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 18, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700' },
    groupInput: {
      margin: 16, marginBottom: 0, backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: c.textPrimary,
    },
    groupToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 14 },
    groupToggleTxt: { flex: 1, fontSize: 13, color: c.textSecondary, fontWeight: '500' },
    list: { padding: 16, gap: 4 },
    emptyText: { textAlign: 'center', marginTop: 40, fontSize: 13, color: c.textMuted },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    checkboxActive: { backgroundColor: c.primary, borderColor: c.primary },
    rowName: { fontSize: 14, color: c.textPrimary },
    footer: { padding: 16, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
    createBtn: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
    createBtnDisabled: { opacity: 0.5 },
    createBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  });
}
