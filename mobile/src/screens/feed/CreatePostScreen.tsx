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
import TableBuilderModal from '../../components/feed/TableBuilderModal';
import AttachmentChips from '../../components/common/AttachmentChips';
import { tableToHtml, detectPastedTable, guardedTextChange, CONTENT_MAX_LEN } from '../../utils/postContent';
import { pickAttachmentFiles, uploadAttachments, PickedFile } from '../../utils/attachments';

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
  const { appId, postId, initialContent, initialPostType, initialPoll } = route.params;
  const isEditMode = !!postId;
  const navigation = useNavigation();
  const api = useApi();
  const { workspace } = useWorkspace();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const isAdmin = workspace?.role === 'super_admin' || workspace?.role === 'admin';

  const [content, setContent] = useState(initialContent ?? '');
  const [tables, setTables] = useState<{ rows: string[][]; hasHeaderRow: boolean }[]>([]);
  const [showTableBuilder, setShowTableBuilder] = useState(false);
  const [pastedRows, setPastedRows] = useState<string[][] | null>(null);

  const handleContentChange = (newText: string) => {
    const detected = detectPastedTable(content, newText);
    if (detected) {
      setContent(detected.textWithoutPaste);
      setPastedRows(detected.rows);
      setShowTableBuilder(true);
      return;
    }
    const { text, blocked } = guardedTextChange(content, newText);
    if (blocked) {
      showAlert('Too Long to Paste', `That paste would exceed the ${CONTENT_MAX_LEN.toLocaleString()}-character limit, so it was not inserted.`);
      return;
    }
    setContent(text);
  };
  const [postType, setPostType] = useState<'post' | 'announcement' | 'poll'>(initialPostType ?? 'post');

  // Poll composer — each row tracks its backend option id (null for a
  // brand-new option) so an edit can reconcile against PATCH /feed/:id's
  // by-id matching, which keeps an unchanged option's votes instead of
  // deleting and recreating it.
  const [pollQuestion, setPollQuestion] = useState(initialPoll?.question ?? '');
  const [pollOptions, setPollOptions] = useState<{ id: number | null; text: string }[]>(
    initialPoll?.options?.length
      ? initialPoll.options.map((o) => ({ id: o.id, text: o.option_text }))
      : [{ id: null, text: '' }, { id: null, text: '' }]
  );
  const [pollMulti, setPollMulti] = useState(initialPoll?.allow_multiple ?? false);
  const updatePollOption = (i: number, v: string) => setPollOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, text: v } : o)));
  const addPollOption = () => setPollOptions((prev) => (prev.length < 10 ? [...prev, { id: null, text: '' }] : prev));
  const removePollOption = (i: number) => setPollOptions((prev) => (prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev));
  const [audienceType, setAudienceType] = useState<AudienceType>('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PickedFile[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Lists for multi-select
  const [members, setMembers] = useState<{ id: number; name: string; photoUrl?: string | null }[]>([]);
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
          photoUrl: m.photo_url,
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

  const toggleSelectAll = () => {
    const activeIds = getActiveList().map(i => i.id);
    const allSelected = activeIds.length > 0 && activeIds.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !activeIds.includes(id)));
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...activeIds])]);
    }
  };

  const pickFiles = async () => {
    try {
      const files = await pickAttachmentFiles();
      if (files.length) setPendingFiles((prev) => [...prev, ...files]);
    } catch {
      showAlert('Error', 'Could not pick file.');
    }
  };

  const removePendingFile = (i: number) => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i));

  // Web's EditPostModal fully supports editing poll question/options/multi
  // (PATCH /feed/:id reconciles poll_options by id) — mobile previously
  // forced isPoll false in edit mode, so there was no UI to change a poll
  // at all once posted, only its unrelated `content` note field.
  const isPoll = postType === 'poll';
  const trimmedPollOptions = pollOptions.map((o) => ({ id: o.id, text: o.text.trim() })).filter((o) => o.text);

  const handleCreate = async () => {
    if (isPoll) {
      if (!pollQuestion.trim()) { showAlert('Validation', 'Add a poll question.'); return; }
      if (trimmedPollOptions.length < 2) { showAlert('Validation', 'Add at least 2 options.'); return; }
    } else if (!content.trim() && tables.length === 0 && pendingFiles.length === 0) {
      showAlert('Validation', 'Post content is required.');
      return;
    }
    if (!isEditMode && audienceType !== 'all' && selectedIds.length === 0) {
      showAlert('Validation', 'Please select at least one audience member.');
      return;
    }
    setSaving(true);
    try {
      if (isEditMode && postId) {
        // The edit endpoint only accepts content (plus poll fields for a
        // poll post) — no audience/type/attachments, matching qa-production
        // web's edit scope.
        if (isPoll) {
          await api.feed.update(appId, postId, {
            content: content.trim(),
            poll_question: pollQuestion.trim(),
            poll_options: trimmedPollOptions.map((o) => ({ id: o.id, option_text: o.text })),
            poll_multi: pollMulti,
          });
        } else {
          await api.feed.update(appId, postId, content.trim());
        }
      } else {
        let attachments: Record<string, unknown>[] = [];
        if (pendingFiles.length > 0) {
          setUploadingFiles(true);
          attachments = await uploadAttachments(api, appId, 'feed', pendingFiles);
          setUploadingFiles(false);
        }
        const tablesHtml = tables.map((t) => tableToHtml(t.rows, t.hasHeaderRow)).join('');
        await api.feed.create(appId, {
          post_type: postType,
          content: content.trim() + tablesHtml,
          audience_type: audienceType,
          audience_ids: audienceType === 'all' ? [] : selectedIds,
          attachments,
          ...(isPoll ? {
            poll_question: pollQuestion.trim(),
            poll_options: trimmedPollOptions.map((o) => o.text),
            poll_multi: pollMulti,
          } : {}),
        });
      }
      navigation.goBack();
    } catch (err: any) {
      setUploadingFiles(false);
      showAlert('Error', isEditMode ? (err?.response?.data?.error ?? 'Could not update post.') : (err?.response?.data?.error ?? 'Could not create post.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.container, { paddingTop: insets.top }]}>
        <ScreenHeader
          title={isEditMode ? 'Edit Post' : 'New Post'}
          showBack
          right={<Button label={isEditMode ? 'Save' : 'Post'} onPress={handleCreate} loading={saving} style={s.postBtn} />}
        />
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {isEditMode && (
            <Text style={s.editHint}>
              {isPoll
                ? "Editing updates the poll's question and options — audience and attachments can't be changed here."
                : "Editing only updates the text — audience, type, and attachments can't be changed here."}
            </Text>
          )}

          {!isEditMode && (
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
                  style={[s.chip, postType === 'poll' && s.chipActive]}
                  onPress={() => setPostType('poll')}
                >
                  <Text style={[s.chipText, postType === 'poll' && s.chipTextActive]}>📊 Poll</Text>
                </TouchableOpacity>
                {isAdmin && (
                  <TouchableOpacity
                    style={[s.chip, postType === 'announcement' && s.chipActive]}
                    onPress={() => setPostType('announcement')}
                  >
                    <Text style={[s.chipText, postType === 'announcement' && s.chipTextActive]}>📢 Announcement</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {!isEditMode && (
          <>
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
                <>
                {getActiveList().length > 0 && (() => {
                  const activeIds = getActiveList().map(i => i.id);
                  const allSelected = activeIds.every(id => selectedIds.includes(id));
                  return (
                    <TouchableOpacity style={s.selectRow} onPress={toggleSelectAll}>
                      <View style={[s.iconCircle, allSelected && s.iconCircleActive]}>
                        <Ionicons name="checkmark-done-outline" size={14} color={allSelected ? '#fff' : colors.textSecondary} />
                      </View>
                      <Text style={[s.selectName, { fontWeight: '700' }]}>{allSelected ? 'Deselect All' : 'Select All'}</Text>
                      <View style={[s.checkbox, allSelected && s.checkboxActive]}>
                        {allSelected && <Ionicons name="checkmark" size={13} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  );
                })()}
                {/* Select All stays fixed above; only the picked-type list
                    scrolls, bounded to ~3 rows tall so a long list doesn't
                    push the post content/submit button far down the page. */}
                <ScrollView style={s.selectListScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  {getActiveList().map(item => {
                    const checked = selectedIds.includes(item.id);
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={s.selectRow}
                        onPress={() => toggleId(item.id)}
                      >
                        {audienceType === 'users'
                          ? <Avatar name={item.name} photoUrl={(item as any).photoUrl} size={30} />
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
                  })}
                </ScrollView>
                </>
              )}
              {!listsLoading && getActiveList().length === 0 && (
                <Text style={s.emptyHint}>No results found</Text>
              )}
              {selectedIds.length > 0 && (
                <Text style={s.selectedCount}>{selectedIds.length} selected</Text>
              )}
            </View>
          )}
          </>
          )}

          {isPoll ? (
            <>
              <Input
                label="Question"
                value={pollQuestion}
                onChangeText={setPollQuestion}
                placeholder="Ask your team something..."
                maxLength={300}
              />
              <Text style={s.sectionLabel}>OPTIONS</Text>
              {pollOptions.map((opt, i) => (
                <View key={opt.id ?? `new-${i}`} style={s.pollOptionRow}>
                  <View style={{ flex: 1 }}>
                    <Input
                      value={opt.text}
                      onChangeText={(v) => updatePollOption(i, v)}
                      placeholder={`Option ${i + 1}`}
                      maxLength={200}
                      containerStyle={{ marginBottom: 0 }}
                    />
                  </View>
                  {pollOptions.length > 2 && (
                    <TouchableOpacity onPress={() => removePollOption(i)} style={s.pollRemoveBtn} hitSlop={8}>
                      <Ionicons name="close-circle" size={20} color={colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {pollOptions.length < 10 && (
                <TouchableOpacity style={s.addTableBtn} onPress={addPollOption}>
                  <Ionicons name="add" size={16} color={colors.primary} />
                  <Text style={s.addTableBtnText}>Add option</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.pollMultiRow} onPress={() => setPollMulti((v) => !v)}>
                <Ionicons name={pollMulti ? 'checkbox' : 'square-outline'} size={20} color={pollMulti ? colors.primary : colors.gray400} />
                <Text style={s.pollMultiLabel}>Allow selecting multiple options</Text>
              </TouchableOpacity>

              {/* Matches web — polls get the same note+attachment fields as a
                  regular post (just relabeled/shorter), not none at all. Only
                  the table builder is post-only, matching web. */}
              <Input
                label="Add a note (optional)"
                value={content}
                onChangeText={(v) => handleContentChange(v.slice(0, 1000))}
                placeholder="Add context for your poll..."
                multiline
                numberOfLines={3}
                maxLength={1000}
              />
              <Text style={s.charCount}>{content.length.toLocaleString()}/1,000</Text>
            </>
          ) : (
            <>
              <Input
                label="What's on your mind?"
                value={content}
                onChangeText={handleContentChange}
                placeholder={postType === 'announcement' ? 'Write an announcement for your team...' : 'Share an update with your team...'}
                multiline
                numberOfLines={6}
                maxLength={CONTENT_MAX_LEN}
              />
              <Text style={s.charCount}>{content.length.toLocaleString()}/{CONTENT_MAX_LEN.toLocaleString()}</Text>
            </>
          )}

          {/* Attach File is available for polls too (matches web) — only the
              table builder is post-only, since web's poll composer has no
              table support at all. Both stay hidden in edit mode: the edit
              endpoint only accepts content(+poll fields), no attachments. */}
          {!isEditMode && (
          <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {!isPoll && (
              <TouchableOpacity style={s.addTableBtn} onPress={() => { setPastedRows(null); setShowTableBuilder(true); }}>
                <Ionicons name="grid-outline" size={16} color={colors.primary} />
                <Text style={s.addTableBtnText}>Add Table</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.addTableBtn} onPress={pickFiles} disabled={uploadingFiles}>
              <Ionicons name="attach" size={16} color={colors.primary} />
              <Text style={s.addTableBtnText}>Attach File</Text>
            </TouchableOpacity>
          </View>
          <AttachmentChips files={pendingFiles} onRemove={removePendingFile} uploading={uploadingFiles} containerStyle={{ paddingBottom: 8 }} />
          </>
          )}

          {!isPoll && tables.map((t, ti) => (
            <View key={ti} style={s.tablePreview}>
              <View style={s.tablePreviewHead}>
                <Text style={s.tablePreviewLabel}>Table {ti + 1} · {t.rows.length}×{t.rows[0]?.length ?? 0}</Text>
                <TouchableOpacity onPress={() => setTables((prev) => prev.filter((_, i) => i !== ti))} hitSlop={8}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  {t.rows.map((row, ri) => (
                    <View key={ri} style={{ flexDirection: 'row' }}>
                      {row.map((cell, ci) => (
                        <View key={ci} style={[s.previewCell, ri === 0 && t.hasHeaderRow && s.previewCellHeader]}>
                          <Text style={[s.previewCellText, ri === 0 && t.hasHeaderRow && s.previewCellTextHeader]} numberOfLines={1}>
                            {cell || ' '}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      </View>

      <TableBuilderModal
        visible={showTableBuilder}
        initialRows={pastedRows ?? undefined}
        onClose={() => { setShowTableBuilder(false); setPastedRows(null); }}
        onInsert={(rows, hasHeaderRow) => {
          setTables((prev) => [...prev, { rows, hasHeaderRow }]);
          setPastedRows(null);
        }}
      />
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 16, paddingBottom: 40 },
    postBtn: { paddingVertical: 8, paddingHorizontal: 16 },
    charCount: { fontSize: 12, color: c.gray400, textAlign: 'right', marginTop: 4 },
    editHint: {
      fontSize: 12, color: c.textMuted, backgroundColor: c.gray50, borderRadius: 8,
      padding: 10, marginBottom: 12,
    },
    addTableBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
      marginTop: 12, paddingHorizontal: 12, paddingVertical: 8,
      borderRadius: 8, backgroundColor: c.primaryLight,
    },
    addTableBtnText: { fontSize: 13, fontWeight: '700', color: c.primary },
    pollOptionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    pollRemoveBtn: { paddingTop: 22 },
    pollMultiRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
    pollMultiLabel: { fontSize: 13, color: c.textPrimary },
    tablePreview: {
      marginTop: 12, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 10,
    },
    tablePreviewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    tablePreviewLabel: { fontSize: 11, fontWeight: '700', color: c.textMuted },
    previewCell: {
      minWidth: 80, paddingHorizontal: 8, paddingVertical: 6,
      borderWidth: 1, borderColor: c.border,
    },
    previewCellHeader: { backgroundColor: c.primaryLight },
    previewCellText: { fontSize: 11, color: c.textSecondary },
    previewCellTextHeader: { fontWeight: '700', color: c.textPrimary },
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
    selectListScroll: { maxHeight: 155 },
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
