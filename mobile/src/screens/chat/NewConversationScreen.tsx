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
  const [selected, setSelected] = useState<number[]>([]);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.members.list(params.appId)
      .then((res) => setMembers(res.data?.items ?? res.data ?? []))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, [params.appId]);

  const toggle = (userId: number) => {
    setSelected((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const isGroup = selected.length > 1;

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
      navigation.replace('ChatThread', { conversationId: conv.id, appId: params.appId, title: name });
    } catch {
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
    list: { padding: 16, gap: 4 },
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
