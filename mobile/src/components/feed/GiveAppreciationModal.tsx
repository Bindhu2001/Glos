import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../hooks/useApi';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import Avatar from '../common/Avatar';

const BADGES = [
  { key: 'teamwork', label: 'Teamwork', emoji: '🤝' },
  { key: 'innovation', label: 'Innovation', emoji: '💡' },
  { key: 'leadership', label: 'Leadership', emoji: '👑' },
  { key: 'excellence', label: 'Excellence', emoji: '⭐' },
  { key: 'mentorship', label: 'Mentorship', emoji: '🎓' },
  { key: 'customer_focus', label: 'Customer', emoji: '🎯' },
  { key: 'problem_solving', label: 'Problem Solving', emoji: '🔧' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  appId: number;
}

export default function GiveAppreciationModal({ visible, onClose, onSuccess, appId }: Props) {
  const api = useApi();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [badge, setBadge] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setLoadingMembers(true);
    api.employees.list(appId)
      .then((r) => setEmployees(r.data?.items ?? []))
      .catch(() => {})
      .finally(() => setLoadingMembers(false));
  }, [visible, appId]);

  const reset = () => {
    setSearch('');
    setSelected(null);
    setBadge(null);
    setMessage('');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!selected) { Alert.alert('Select someone to appreciate'); return; }
    if (!message.trim()) { Alert.alert('Add a message'); return; }
    const recipientId = selected.platform_user_id;
    if (!recipientId) { Alert.alert('This person has not joined the app yet'); return; }
    setSubmitting(true);
    try {
      await api.appreciations.give(appId, {
        to_user_id: recipientId,
        message: message.trim(),
        ...(badge ? { badge } : {}),
      });
      reset();
      onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert('Failed', err?.response?.data?.error ?? 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = employees.filter((e) =>
    !search || e.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>⭐ Give Appreciation</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Recipient */}
            <Text style={s.label}>To</Text>
            {selected ? (
              <TouchableOpacity style={s.selectedRow} onPress={() => setSelected(null)}>
                <Avatar name={selected.full_name ?? 'Unknown'} size={32} />
                <Text style={s.selectedName}>{selected.full_name}</Text>
                <Ionicons name="close-circle" size={18} color={colors.gray400} />
              </TouchableOpacity>
            ) : (
              <>
                <View style={s.searchBar}>
                  <Ionicons name="search-outline" size={15} color={colors.gray400} />
                  <TextInput
                    style={s.searchInput}
                    placeholder="Search team members..."
                    placeholderTextColor={colors.gray400}
                    value={search}
                    onChangeText={setSearch}
                  />
                </View>
                {loadingMembers ? (
                  <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} />
                ) : (
                  <View style={s.memberList}>
                    {filtered.slice(0, 8).map((e) => (
                      <TouchableOpacity
                        key={e.id}
                        style={s.memberRow}
                        onPress={() => { setSelected(e); setSearch(''); }}
                      >
                        <Avatar name={e.full_name ?? 'Unknown'} size={34} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.memberName}>{e.full_name}</Text>
                          {e.role_title ? <Text style={s.memberRole}>{e.role_title}</Text> : null}
                        </View>
                        {!e.platform_user_id && (
                          <Text style={s.notJoined}>Not joined</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                    {filtered.length === 0 && (
                      <Text style={s.emptyText}>No members found</Text>
                    )}
                  </View>
                )}
              </>
            )}

            {/* Badge */}
            <Text style={s.label}>Badge (optional)</Text>
            <View style={s.badgeWrap}>
              {BADGES.map((b) => (
                <TouchableOpacity
                  key={b.key}
                  style={[s.badgeChip, badge === b.key && s.badgeChipActive]}
                  onPress={() => setBadge(badge === b.key ? null : b.key)}
                >
                  <Text style={s.badgeEmoji}>{b.emoji}</Text>
                  <Text style={[s.badgeLabel, badge === b.key && s.badgeLabelActive]}>
                    {b.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Message */}
            <Text style={s.label}>Message</Text>
            <TextInput
              style={s.messageInput}
              placeholder="Write something kind..."
              placeholderTextColor={colors.gray400}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[s.submitBtn, submitting && s.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color="#ffffff" size="small" />
                : <Text style={s.submitText}>Give Appreciation</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: {
      backgroundColor: c.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22,
      padding: 20, maxHeight: '90%',
    },
    sheetHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: 4, paddingBottom: 16,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    sheetTitle: { fontSize: 17, fontWeight: '700', color: c.textPrimary },
    label: { fontSize: 12, fontWeight: '700', color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
    selectedRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.primaryLight, borderRadius: 12, padding: 12,
    },
    selectedName: { flex: 1, fontSize: 14, fontWeight: '600', color: c.textPrimary },
    searchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.gray100, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10,
      borderWidth: 1, borderColor: c.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: c.textPrimary },
    memberList: { marginTop: 8, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: c.border },
    memberRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    memberName: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
    memberRole: { fontSize: 12, color: c.textSecondary, marginTop: 1 },
    notJoined: { fontSize: 11, color: c.gray400, fontStyle: 'italic' },
    emptyText: { fontSize: 14, color: c.gray400, textAlign: 'center', padding: 16 },
    badgeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    badgeChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
      backgroundColor: c.gray100, borderWidth: 1.5, borderColor: c.border,
    },
    badgeChipActive: { backgroundColor: c.primaryLight, borderColor: c.primary },
    badgeEmoji: { fontSize: 14 },
    badgeLabel: { fontSize: 12, fontWeight: '500', color: c.gray600 },
    badgeLabelActive: { color: c.primary, fontWeight: '700' },
    messageInput: {
      backgroundColor: c.gray100, borderRadius: 12, padding: 12,
      fontSize: 14, color: c.textPrimary, minHeight: 100,
      borderWidth: 1, borderColor: c.border,
    },
    submitBtn: {
      backgroundColor: c.primary, borderRadius: 12, padding: 16,
      alignItems: 'center', marginTop: 20, marginBottom: 8,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  });
}
