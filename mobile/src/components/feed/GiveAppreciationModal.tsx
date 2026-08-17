import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../hooks/useApi';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import Avatar from '../common/Avatar';
import { showAlert } from '../common/AlertModal';

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
  const insets = useSafeAreaInsets();

  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any[]>([]);
  const [badge, setBadge] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setLoadingMembers(true);
    api.workspace.getMembers(appId)
      .then((r) => {
        const items: any[] = r.data?.items ?? r.data ?? [];
        setEmployees(items.map((m) => ({
          id: m.user_id,
          platform_user_id: m.user_id,
          full_name: `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email,
          role_title: m.role,
          photo_url: m.photo_url,
        })));
      })
      .catch(() => {})
      .finally(() => setLoadingMembers(false));
  }, [visible, appId]);

  const reset = () => {
    setSearch('');
    setSelected([]);
    setBadge(null);
    setMessage('');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (selected.length === 0) { showAlert('Select at least one person to appreciate'); return; }
    if (!message.trim()) { showAlert('Add a message'); return; }
    const recipientIds = selected.map((e) => e.platform_user_id).filter(Boolean);
    if (recipientIds.length === 0) { showAlert('None of the selected people have joined the app yet'); return; }
    setSubmitting(true);
    try {
      await api.appreciations.give(appId, {
        to_user_ids: recipientIds,
        message: message.trim(),
        ...(badge ? { badge } : {}),
      });
      reset();
      onSuccess();
      onClose();
    } catch (err: any) {
      showAlert('Failed', err?.response?.data?.error ?? 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedIds = new Set(selected.map((e) => e.id));
  const filtered = search.trim()
    ? employees.filter((e) => {
        const name = e.full_name ?? [e.first_name, e.last_name].filter(Boolean).join(' ');
        return name.toLowerCase().includes(search.toLowerCase());
      })
    : employees;
  const allFilteredSelected = filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id));

  const toggleOne = (e: any) => {
    setSelected((prev) => (prev.some((x) => x.id === e.id) ? prev.filter((x) => x.id !== e.id) : [...prev, e]));
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const filteredIds = new Set(filtered.map((e) => e.id));
      setSelected((prev) => prev.filter((e) => !filteredIds.has(e.id)));
    } else {
      setSelected((prev) => {
        const existingIds = new Set(prev.map((e) => e.id));
        return [...prev, ...filtered.filter((e) => !existingIds.has(e.id))];
      });
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      {/* iOS only: the app already runs Android with
          softwareKeyboardLayoutMode: "resize" (app.json), so the OS itself
          shrinks the window when the keyboard opens there. Also applying
          KeyboardAvoidingView's own bottom padding on Android double-
          compensates, and that manual padding can get stuck after the
          keyboard closes, leaving a permanent gap above the nav bar. */}
      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[s.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>⭐ Give Appreciation</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* flexShrink: 1 — RN defaults to flexShrink: 0, so without this the
              ScrollView never gets squeezed into a bounded viewport by the
              sheet's maxHeight: it just grows past it uncapped, and content
              past the visible edge is unreachable since there's nothing
              smaller-than-content to scroll within. Only shows up once the
              member list is long enough to actually exceed the sheet. */}
          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Recipients — multi-select with Select All, matching web's "Who are you appreciating?" list */}
            <Text style={s.label}>To</Text>
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
                {filtered.length > 0 && (
                  <TouchableOpacity style={s.selectAllRow} onPress={toggleSelectAll}>
                    <View style={[s.checkbox, allFilteredSelected && s.checkboxActive]}>
                      {allFilteredSelected && <Ionicons name="checkmark" size={13} color="#fff" />}
                    </View>
                    <Text style={s.selectAllText}>{allFilteredSelected ? 'Deselect All' : 'Select All'}</Text>
                    <Text style={s.selectedCount}>{selected.length}/{employees.length}</Text>
                  </TouchableOpacity>
                )}
                {/* Select All stays fixed above; only the member rows scroll,
                    bounded to ~3 rows tall so a long team doesn't push the
                    badge/message/submit controls below off screen. */}
                <ScrollView style={s.memberScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  {filtered.slice(0, 50).map((e) => {
                    const displayName = e.full_name ?? ([e.first_name, e.last_name].filter(Boolean).join(' ') || 'Unknown');
                    const checked = selectedIds.has(e.id);
                    return (
                    <TouchableOpacity
                      key={e.id}
                      style={s.memberRow}
                      onPress={() => toggleOne({ ...e, full_name: displayName })}
                    >
                      <Avatar name={displayName} photoUrl={e.photo_url} size={34} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.memberName}>{displayName}</Text>
                      </View>
                      {!e.platform_user_id && (
                        <Text style={s.notJoined}>Not joined</Text>
                      )}
                      <View style={[s.checkbox, checked && s.checkboxActive]}>
                        {checked && <Ionicons name="checkmark" size={13} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                    );
                  })}
                  {filtered.length === 0 && (
                    <Text style={s.emptyText}>No members found</Text>
                  )}
                </ScrollView>
              </View>
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
    searchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.gray100, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10,
      borderWidth: 1, borderColor: c.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: c.textPrimary },
    memberList: { marginTop: 8, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: c.border },
    selectAllRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
      backgroundColor: c.gray50, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    selectAllText: { fontSize: 13, fontWeight: '700', color: c.textPrimary },
    selectedCount: { marginLeft: 'auto', fontSize: 12, color: c.textMuted },
    memberScroll: { maxHeight: 180 },
    memberRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    memberName: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
    notJoined: { fontSize: 11, color: c.gray400, fontStyle: 'italic' },
    emptyText: { fontSize: 14, color: c.gray400, textAlign: 'center', padding: 16 },
    checkbox: {
      width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface, flexShrink: 0,
    },
    checkboxActive: { backgroundColor: c.primary, borderColor: c.primary },
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
