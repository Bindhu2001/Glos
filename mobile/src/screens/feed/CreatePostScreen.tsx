import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, TextInput, ActivityIndicator,
} from 'react-native';
import { showAlert } from '../../components/common/AlertModal';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../hooks/useApi';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import { FeedStackParamList } from '../../navigation/types';
import ScreenHeader from '../../components/common/ScreenHeader';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Avatar from '../../components/common/Avatar';

type Route = RouteProp<FeedStackParamList, 'CreatePost'>;
type AudienceType = 'all' | 'users' | 'departments' | 'roles';

const AUDIENCE_OPTIONS: { value: AudienceType; label: string; icon: string }[] = [
  { value: 'all',         label: 'Everyone',        icon: '🌐' },
  { value: 'users',       label: 'Specific People', icon: '👤' },
  { value: 'departments', label: 'Department(s)',   icon: '🏢' },
  { value: 'roles',       label: 'Designation(s)',  icon: '💼' },
];

export default function CreatePostScreen() {
  const route = useRoute<Route>();
  const { appId } = route.params;
  const navigation = useNavigation();
  const api = useApi();
  const { workspace } = useWorkspace();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const isAdmin = workspace?.role === 'super_admin' || workspace?.role === 'admin';

  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<'post' | 'announcement'>('post');
  const [audienceType, setAudienceType] = useState<AudienceType>('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  // Lists for multi-select
  const [members, setMembers] = useState<{ id: number; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);
  const [roles, setRoles] = useState<{ id: number; name: string }[]>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (audienceType === 'all') return;
    setSelectedIds([]);
    setSearchQuery('');
    loadList(audienceType);
  }, [audienceType]);

  const loadList = async (type: AudienceType) => {
    if (!workspace) return;
    setListsLoading(true);
    try {
      if (type === 'users' && members.length === 0) {
        const r = await api.workspace.getMembers(workspace.id);
        const items: any[] = r.data?.items ?? r.data ?? [];
        setMembers(items.map((m: any) => ({
          id: m.user_id,
          name: `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email,
        })));
      } else if (type === 'departments' && departments.length === 0) {
        const r = await api.departments.list(workspace.id);
        const items: any[] = Array.isArray(r.data) ? r.data : (r.data?.items ?? []);
        setDepartments(items.map((d: any) => ({ id: d.id, name: d.name })));
      } else if (type === 'roles' && roles.length === 0) {
        const r = await api.roles.list(workspace.id);
        const items: any[] = Array.isArray(r.data) ? r.data : (r.data?.items ?? []);
        setRoles(items.map((r: any) => ({ id: r.id, name: r.name })));
      }
    } catch (err: any) {
      showAlert('Could not load list', err?.response?.data?.error ?? err?.message ?? 'Please try again.');
    }
    setListsLoading(false);
  };

  const toggleId = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const getActiveList = () => {
    const raw = audienceType === 'users' ? members : audienceType === 'departments' ? departments : roles;
    if (!searchQuery.trim()) return raw;
    return raw.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
  };

  const handleCreate = async () => {
    if (!content.trim()) {
      showAlert('Validation', 'Post content is required.');
      return;
    }
    if (audienceType !== 'all' && selectedIds.length === 0) {
      showAlert('Validation', 'Please select at least one audience member.');
      return;
    }
    setSaving(true);
    try {
      await api.feed.create(appId, {
        post_type: postType,
        content: content.trim(),
        audience_type: audienceType,
        audience_ids: audienceType === 'all' ? [] : selectedIds,
      });
      navigation.goBack();
    } catch {
      showAlert('Error', 'Could not create post.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <View style={[s.container, { paddingTop: insets.top }]}>
        <ScreenHeader
          title="New Post"
          showBack
          right={<Button label="Post" onPress={handleCreate} loading={saving} style={s.postBtn} />}
        />
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {isAdmin && (
            <>
              <Text style={s.sectionLabel}>POST TYPE</Text>
              <View style={s.chipRow}>
                <TouchableOpacity
                  style={[s.chip, postType === 'post' && s.chipActive]}
                  onPress={() => setPostType('post')}
                >
                  <Text style={[s.chipText, postType === 'post' && s.chipTextActive]}>Post</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.chip, postType === 'announcement' && s.chipActive]}
                  onPress={() => setPostType('announcement')}
                >
                  <Text style={[s.chipText, postType === 'announcement' && s.chipTextActive]}>📢 Announcement</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <Text style={s.sectionLabel}>AUDIENCE</Text>
          <View style={s.chipRow}>
            {AUDIENCE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[s.chip, audienceType === opt.value && s.chipActive]}
                onPress={() => setAudienceType(opt.value)}
              >
                <Text style={[s.chipText, audienceType === opt.value && s.chipTextActive]}>
                  {opt.icon} {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {audienceType !== 'all' && (
            <View style={s.selectBox}>
              <View style={s.searchBar}>
                <Ionicons name="search-outline" size={15} color={colors.gray400} />
                <TextInput
                  style={s.searchInput}
                  placeholder={`Search ${audienceType === 'users' ? 'people' : audienceType}...`}
                  placeholderTextColor={colors.gray400}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
              {listsLoading ? (
                <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} />
              ) : (
                getActiveList().map(item => {
                  const checked = selectedIds.includes(item.id);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={s.selectRow}
                      onPress={() => toggleId(item.id)}
                    >
                      {audienceType === 'users'
                        ? <Avatar name={item.name} size={30} />
                        : <View style={[s.iconCircle, checked && s.iconCircleActive]}>
                            <Ionicons
                              name={audienceType === 'departments' ? 'business-outline' : 'briefcase-outline'}
                              size={14}
                              color={checked ? '#fff' : colors.textSecondary}
                            />
                          </View>
                      }
                      <Text style={s.selectName}>{item.name}</Text>
                      <View style={[s.checkbox, checked && s.checkboxActive]}>
                        {checked && <Ionicons name="checkmark" size={13} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
              {!listsLoading && getActiveList().length === 0 && (
                <Text style={s.emptyHint}>No results found</Text>
              )}
              {selectedIds.length > 0 && (
                <Text style={s.selectedCount}>{selectedIds.length} selected</Text>
              )}
            </View>
          )}

          <Input
            label="What's on your mind?"
            value={content}
            onChangeText={setContent}
            placeholder={postType === 'announcement' ? 'Write an announcement for your team...' : 'Share an update with your team...'}
            multiline
            numberOfLines={6}
            maxLength={2000}
          />
          <Text style={s.charCount}>{content.length}/2000</Text>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 16, paddingBottom: 40 },
    postBtn: { paddingVertical: 8, paddingHorizontal: 16 },
    charCount: { fontSize: 12, color: c.gray400, textAlign: 'right', marginTop: 4 },
    sectionLabel: {
      fontSize: 10, fontWeight: '700', color: c.textMuted,
      letterSpacing: 1, marginBottom: 8, marginTop: 16,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    chip: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
      backgroundColor: c.gray100, borderWidth: 1.5, borderColor: c.border,
    },
    chipActive: { backgroundColor: c.primaryLight, borderColor: c.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: c.gray600 },
    chipTextActive: { color: c.primary, fontWeight: '700' },

    selectBox: {
      borderWidth: 1, borderColor: c.border, borderRadius: 12,
      overflow: 'hidden', marginBottom: 16, marginTop: 8,
    },
    searchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.gray100, paddingHorizontal: 12, paddingVertical: 9,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: c.textPrimary },
    selectRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 12, paddingVertical: 10,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    selectName: { flex: 1, fontSize: 14, color: c.textPrimary, fontWeight: '500' },
    iconCircle: {
      width: 30, height: 30, borderRadius: 15,
      backgroundColor: c.gray100, alignItems: 'center', justifyContent: 'center',
    },
    iconCircleActive: { backgroundColor: c.primary },
    checkbox: {
      width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface,
    },
    checkboxActive: { backgroundColor: c.primary, borderColor: c.primary },
    emptyHint: { fontSize: 14, color: c.gray400, textAlign: 'center', padding: 16 },
    selectedCount: {
      fontSize: 12, fontWeight: '600', color: c.primary,
      textAlign: 'center', paddingVertical: 8, backgroundColor: c.primaryLight,
    },
  });
}
