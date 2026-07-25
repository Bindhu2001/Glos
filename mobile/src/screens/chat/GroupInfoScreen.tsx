import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator } from 'react-native';
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
import Avatar from '../../components/common/Avatar';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import MemberPickerModal, { PickOption } from '../../components/common/MemberPickerModal';

type Nav = NativeStackNavigationProp<ChatStackParamList, 'GroupInfo'>;
type Rt = RouteProp<ChatStackParamList, 'GroupInfo'>;

function memberLabel(m: any): string {
  return m.name ?? (`${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email || 'Member');
}

export default function GroupInfoScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { colors } = useTheme();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [conv, setConv] = useState<any>(null);
  const [myUserId, setMyUserId] = useState<number | null>(null);
  const [allMembers, setAllMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [addModal, setAddModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, convRes, membersRes] = await Promise.all([
        api.me.getProfile(),
        api.chat.listConversations(params.appId),
        api.workspace.getMembers(params.appId),
      ]);
      const meId = meRes.data?.id ?? meRes.data?.user_id ?? null;
      setMyUserId(meId);
      const thisConv = (convRes.data ?? []).find((c: any) => String(c.id) === String(params.conversationId)) ?? null;
      setConv(thisConv);
      setName(thisConv?.name ?? '');
      const list: any[] = membersRes.data?.members ?? membersRes.data?.items ?? membersRes.data ?? [];
      setAllMembers(list);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load group info.'));
    } finally {
      setLoading(false);
    }
  }, [params.appId, params.conversationId]);

  useEffect(() => { load(); }, [load]);

  const isAdmin = !!conv?.is_group_admin;
  const members: any[] = conv?.members ?? [];
  const memberIds = new Set(members.map((m: any) => String(m.id)));
  const addOptions: PickOption[] = allMembers
    .map((m: any) => ({ id: m.user_id ?? m.id, name: memberLabel(m), photoUrl: m.photo_url }))
    .filter((o) => !memberIds.has(String(o.id)));

  const saveName = async () => {
    if (!name.trim() || name.trim() === conv?.name) return;
    setSavingName(true);
    try {
      await api.chat.editGroup(params.appId, params.conversationId, { name: name.trim() });
      await load();
    } catch (err) {
      showAlert('Could not rename group', apiErrorMessage(err));
    } finally {
      setSavingName(false);
    }
  };

  const addMembers = async (ids: number[]) => {
    setAddModal(false);
    if (ids.length === 0) return;
    try {
      await api.chat.editGroup(params.appId, params.conversationId, { add_member_ids: ids });
      await load();
    } catch (err) {
      showAlert('Could not add members', apiErrorMessage(err));
    }
  };

  const removeMember = (userId: number, memberName: string) => {
    showAlert(
      'Remove Member',
      `Remove ${memberName} from this group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive', onPress: async () => {
            try {
              await api.chat.editGroup(params.appId, params.conversationId, { remove_member_ids: [userId] });
              await load();
            } catch (err) {
              showAlert('Could not remove member', apiErrorMessage(err));
            }
          },
        },
      ],
    );
  };

  const toggleAdmin = async (userId: number) => {
    try {
      await api.chat.toggleGroupAdmin(params.appId, params.conversationId, userId);
      await load();
    } catch (err) {
      showAlert('Could not update admin status', apiErrorMessage(err));
    }
  };

  const deleteGroup = () => {
    showAlert(
      'Delete Group',
      `Are you sure you want to delete "${conv?.name ?? 'this group'}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await api.chat.deleteGroup(params.appId, params.conversationId);
              navigation.navigate('ChatList');
            } catch (err) {
              showAlert('Could not delete group', apiErrorMessage(err));
            }
          },
        },
      ],
    );
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.background }}><ActivityIndicator style={{ flex: 1 }} color={colors.primary} /></View>;
  if (error) return <LoadError message={error} onRetry={load} />;
  if (!conv) return null;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Group Info</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <View style={s.avatarWrap}>
          <Avatar name={conv.display_name ?? conv.name ?? 'Group'} size={64} />
        </View>

        {isAdmin ? (
          <View style={s.renameRow}>
            <Input value={name} onChangeText={setName} placeholder="Group name" containerStyle={{ flex: 1, marginBottom: 0 }} />
            <TouchableOpacity style={s.saveNameBtn} onPress={saveName} disabled={savingName}>
              <Ionicons name="checkmark" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={s.groupName}>{conv.name ?? 'Group'}</Text>
        )}
        <Text style={s.memberCount}>{members.length} member{members.length === 1 ? '' : 's'}</Text>

        <View style={s.sectionHeadRow}>
          <Text style={s.sectionHead}>MEMBERS</Text>
          {isAdmin && (
            <TouchableOpacity onPress={() => setAddModal(true)}>
              <Ionicons name="person-add-outline" size={18} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {members.map((m: any) => {
          const isMe = String(m.id) === String(myUserId);
          return (
            <View key={m.id} style={s.memberRow}>
              <Avatar name={m.name} photoUrl={m.photo_url} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={s.memberName}>{m.name}{isMe ? ' (You)' : ''}</Text>
                {m.is_admin ? <Text style={s.adminTag}>Admin</Text> : null}
              </View>
              {isAdmin && !isMe && (
                <View style={s.memberActions}>
                  <TouchableOpacity style={s.memberActionBtn} onPress={() => toggleAdmin(m.id)}>
                    <Ionicons name="shield-outline" size={16} color={m.is_admin ? colors.warning : colors.gray400} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.memberActionBtn} onPress={() => removeMember(m.id, m.name)}>
                    <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        {isAdmin && (
          <Button label="Delete Group" variant="danger" onPress={deleteGroup} style={{ marginTop: 24 }} fullWidth />
        )}
      </ScrollView>

      <MemberPickerModal
        visible={addModal}
        title="Add Participants"
        options={addOptions}
        multi
        selected={[]}
        onChange={addMembers}
        onClose={() => setAddModal(false)}
        allowClear={false}
      />
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
    body: { padding: 16, paddingBottom: 40, alignItems: 'stretch' },
    avatarWrap: { alignItems: 'center', marginBottom: 12 },
    renameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    saveNameBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    groupName: { fontSize: 18, fontWeight: '800', color: c.textPrimary, textAlign: 'center' },
    memberCount: { fontSize: 12, color: c.textMuted, textAlign: 'center', marginBottom: 20 },
    sectionHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    sectionHead: { fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 1 },
    memberRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    memberName: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
    adminTag: { fontSize: 10, fontWeight: '700', color: c.warning, marginTop: 2 },
    memberActions: { flexDirection: 'row', gap: 10 },
    memberActionBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  });
}
