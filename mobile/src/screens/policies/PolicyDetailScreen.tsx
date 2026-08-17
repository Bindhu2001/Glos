import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
  ActivityIndicator, TextInput, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { MoreStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import { showAlert } from '../../components/common/AlertModal';
import LoadError from '../../components/common/LoadError';
import DatePickerField from '../../components/common/DatePickerField';
import TableBuilderModal from '../../components/feed/TableBuilderModal';
import PostContentView from '../../components/feed/PostContentView';
import { parsePostContent, tableToHtml, detectPastedTable } from '../../utils/postContent';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'PolicyDetail'>;
type Rt = RouteProp<MoreStackParamList, 'PolicyDetail'>;

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'retired', label: 'Retired' },
];
const STATUS_COLOR: Record<string, string> = { active: '#059669', draft: '#d97706', retired: '#6b7280' };

export default function PolicyDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const isAdmin = workspace?.role === 'super_admin' || workspace?.role === 'admin';

  const [policy, setPolicy] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [version, setVersion] = useState('1');
  const [status, setStatus] = useState('draft');
  const [bodyText, setBodyText] = useState('');
  const [bodyTables, setBodyTables] = useState<{ rows: string[][]; hasHeaderRow: boolean }[]>([]);

  const [showTableBuilder, setShowTableBuilder] = useState(false);
  const [pastedRows, setPastedRows] = useState<string[][] | null>(null);
  const [editingTableIndex, setEditingTableIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.policies.get(params.appId, params.policyId);
      const p = res.data;
      setPolicy(p);
      setTitle(p.title ?? '');
      setCategory(p.category ?? '');
      setEffectiveFrom(p.effective_from ?? '');
      setVersion(String(p.version ?? 1));
      setStatus(p.status ?? 'draft');

      // Split existing body_md (HTML) into editable plain text + table blocks —
      // first-class tables get their own editable grid, everything else is one
      // plain-text box (mobile has no rich-text formatting to preserve beyond that).
      const blocks = parsePostContent(p.body_md ?? '');
      const texts = blocks.filter((b) => b.type === 'text').map((b: any) => b.text);
      const tables = blocks.filter((b) => b.type === 'table').map((b: any) => ({ rows: b.rows, hasHeaderRow: true }));
      setBodyText(texts.join('\n\n'));
      setBodyTables(tables);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load this policy.'));
    } finally {
      setLoading(false);
    }
  }, [params.appId, params.policyId]);

  useEffect(() => { load(); }, [load]);

  const dirty = policy && (
    title !== (policy.title ?? '') ||
    category !== (policy.category ?? '') ||
    effectiveFrom !== (policy.effective_from ?? '') ||
    Number(version) !== Number(policy.version ?? 1) ||
    status !== (policy.status ?? 'draft') ||
    bodyText.trim() + bodyTables.map((t) => tableToHtml(t.rows, t.hasHeaderRow)).join('') !== (policy.body_md ?? '')
  );

  const handleContentChange = (newText: string) => {
    const detected = detectPastedTable(bodyText, newText);
    if (detected) {
      setBodyText(detected.textWithoutPaste);
      setPastedRows(detected.rows);
      setEditingTableIndex(null);
      setShowTableBuilder(true);
      return;
    }
    setBodyText(newText);
  };

  const handleSave = async () => {
    if (!title.trim()) { showAlert('Title required', 'Please enter a policy title.'); return; }
    setSaving(true);
    try {
      const bodyMd = bodyText.trim() + bodyTables.map((t) => tableToHtml(t.rows, t.hasHeaderRow)).join('');
      const res = await api.policies.update(params.appId, params.policyId, {
        title: title.trim(),
        category: category.trim() || null,
        body_md: bodyMd || null,
        effective_from: effectiveFrom || null,
        version: Number(version) || 1,
        status,
      });
      setPolicy(res.data);
      setSavedAt(new Date());
    } catch (err) {
      showAlert('Save failed', apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSetStatus = async (newStatus: string) => {
    try {
      const res = await api.policies.update(params.appId, params.policyId, { status: newStatus });
      setPolicy(res.data);
      setStatus(res.data.status);
    } catch (err) {
      showAlert('Could not update status', apiErrorMessage(err));
    }
  };

  const handleDelete = async () => {
    try {
      await api.policies.remove(params.appId, params.policyId);
      navigation.goBack();
    } catch (err) {
      showAlert('Could not delete policy', apiErrorMessage(err));
    }
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.background }}><ActivityIndicator style={{ flex: 1 }} color={colors.primary} /></View>;
  if (error) return <LoadError message={error} onRetry={load} />;
  if (!policy) return null;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{isAdmin ? 'Edit Policy' : policy.title}</Text>
        {isAdmin ? (
          <TouchableOpacity
            style={[s.saveBtn, (!dirty || saving) && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={!dirty || saving}
          >
            {saving ? <ActivityIndicator size="small" color={colors.primary} /> : (
              <Text style={s.saveBtnText}>{dirty ? 'Save' : 'Saved'}</Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <View style={s.pillRow}>
          <View style={[s.statusPill, { backgroundColor: STATUS_COLOR[status] + '18' }]}>
            <Text style={[s.statusPillText, { color: STATUS_COLOR[status] }]}>{STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status}</Text>
          </View>
          {!!category && <Text style={s.categoryTag}>{category}</Text>}
          <Text style={s.versionTag}>v{version}</Text>
        </View>

        {isAdmin ? (
          <TextInput style={s.titleInput} value={title} onChangeText={setTitle} placeholder="Policy title" placeholderTextColor={colors.gray400} maxLength={200} />
        ) : (
          <Text style={s.titleReadonly}>{policy.title}</Text>
        )}

        {isAdmin && (
          <View style={s.metaGrid}>
            <TouchableOpacity style={s.metaField} onPress={() => setShowStatusPicker(true)}>
              <Text style={s.metaLabel}>Status</Text>
              <Text style={s.metaValue}>{STATUS_OPTIONS.find((o) => o.value === status)?.label}</Text>
            </TouchableOpacity>
            <View style={s.metaField}>
              <Text style={s.metaLabel}>Category</Text>
              <TextInput style={s.metaInput} value={category} onChangeText={setCategory} placeholder="e.g. leave, conduct" placeholderTextColor={colors.gray400} maxLength={100} />
            </View>
            <View style={s.metaField}>
              <Text style={s.metaLabel}>Version</Text>
              <TextInput style={s.metaInput} value={version} onChangeText={setVersion} keyboardType="number-pad" maxLength={4} />
            </View>
            <View style={s.metaField}>
              <DatePickerField label="Effective from" value={effectiveFrom} onChange={setEffectiveFrom} />
            </View>
          </View>
        )}

        <Text style={s.sectionHead}>POLICY TEXT</Text>
        {isAdmin ? (
          <>
            <TextInput
              style={s.bodyInput}
              value={bodyText}
              onChangeText={handleContentChange}
              placeholder="Write your policy content here..."
              placeholderTextColor={colors.gray400}
              multiline
              numberOfLines={10}
              textAlignVertical="top"
            />
            <TouchableOpacity style={s.addTableBtn} onPress={() => { setPastedRows(null); setEditingTableIndex(null); setShowTableBuilder(true); }}>
              <Ionicons name="grid-outline" size={16} color={colors.primary} />
              <Text style={s.addTableBtnText}>Add Table</Text>
            </TouchableOpacity>

            {bodyTables.map((t, ti) => (
              <View key={ti} style={s.tablePreview}>
                <View style={s.tablePreviewHead}>
                  <Text style={s.tablePreviewLabel}>Table {ti + 1} · {t.rows.length}×{t.rows[0]?.length ?? 0}</Text>
                  <View style={{ flexDirection: 'row', gap: 14 }}>
                    <TouchableOpacity onPress={() => { setPastedRows(null); setEditingTableIndex(ti); setShowTableBuilder(true); }} hitSlop={8}>
                      <Ionicons name="create-outline" size={16} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setBodyTables((prev) => prev.filter((_, i) => i !== ti))} hitSlop={8}>
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
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
          </>
        ) : policy.body_md ? (
          <PostContentView content={policy.body_md} colors={colors} textStyle={s.paragraph} />
        ) : (
          <Text style={s.emptyText}>No content yet.</Text>
        )}

        {isAdmin && (
          <>
            <Text style={[s.sectionHead, { marginTop: 20 }]}>QUICK ACTIONS</Text>
            <View style={s.workflowRow}>
              {status !== 'active' && (
                <TouchableOpacity style={s.workflowBtn} onPress={() => handleSetStatus('active')}>
                  <Text style={s.workflowBtnText}>Mark Active</Text>
                </TouchableOpacity>
              )}
              {status !== 'draft' && (
                <TouchableOpacity style={s.workflowBtn} onPress={() => handleSetStatus('draft')}>
                  <Text style={s.workflowBtnText}>Move to Draft</Text>
                </TouchableOpacity>
              )}
              {status !== 'retired' && (
                <TouchableOpacity style={s.workflowBtn} onPress={() => handleSetStatus('retired')}>
                  <Text style={s.workflowBtnText}>Retire</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity style={s.deleteBtn} onPress={() => setDeleteConfirm(true)}>
              <Text style={s.deleteBtnText}>Delete this policy</Text>
            </TouchableOpacity>
          </>
        )}
        {savedAt && !dirty && <Text style={s.savedHint}>Saved at {savedAt.toLocaleTimeString()}</Text>}
      </ScrollView>

      {/* Status picker */}
      <Modal visible={showStatusPicker} transparent animationType="slide" onRequestClose={() => setShowStatusPicker(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowStatusPicker(false)}>
          <View style={[s.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            {STATUS_OPTIONS.map((o) => (
              <TouchableOpacity key={o.value} style={[s.pickerRow, status === o.value && s.pickerRowSel]} onPress={() => { setStatus(o.value); setShowStatusPicker(false); }}>
                <Text style={[s.pickerRowText, status === o.value && s.pickerRowTextSel]}>{o.label}</Text>
                {status === o.value && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Delete confirm */}
      <Modal visible={deleteConfirm} transparent animationType="fade" onRequestClose={() => setDeleteConfirm(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.confirmCard}>
            <Text style={s.confirmTitle}>Delete "{policy.title}"?</Text>
            <Text style={s.confirmMsg}>The policy will be permanently removed.</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: colors.gray100 }]} onPress={() => setDeleteConfirm(false)}>
                <Text style={[s.confirmBtnText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: colors.danger }]} onPress={() => { setDeleteConfirm(false); handleDelete(); }}>
                <Text style={[s.confirmBtnText, { color: '#fff' }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <TableBuilderModal
        visible={showTableBuilder}
        initialRows={editingTableIndex != null ? bodyTables[editingTableIndex].rows : (pastedRows ?? undefined)}
        title={editingTableIndex != null ? 'Edit Table' : undefined}
        insertLabel={editingTableIndex != null ? 'Save Table' : undefined}
        onClose={() => { setShowTableBuilder(false); setPastedRows(null); setEditingTableIndex(null); }}
        onInsert={(rows, hasHeaderRow) => {
          if (editingTableIndex != null) {
            setBodyTables((prev) => prev.map((t, i) => i === editingTableIndex ? { rows, hasHeaderRow } : t));
          } else {
            setBodyTables((prev) => [...prev, { rows, hasHeaderRow }]);
          }
          setPastedRows(null);
          setEditingTableIndex(null);
        }}
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
      paddingHorizontal: 16, paddingVertical: 12, gap: 8,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, fontSize: 17, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700', textAlign: 'center' },
    saveBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: c.primaryLight, minWidth: 60, alignItems: 'center' },
    saveBtnText: { fontSize: 13, fontWeight: '700', color: c.primary },
    body: { padding: 16, paddingBottom: 40 },

    pillRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    statusPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 },
    statusPillText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
    categoryTag: { fontSize: 12, color: c.textMuted },
    versionTag: { fontSize: 12, color: c.textMuted, marginLeft: 'auto' },

    titleInput: { fontSize: 20, fontWeight: '800', color: c.textPrimary, paddingVertical: 6, marginBottom: 12 },
    titleReadonly: { fontSize: 20, fontWeight: '800', color: c.textPrimary, marginBottom: 12 },

    metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
    metaField: { width: '47%' },
    metaLabel: { fontSize: 11, color: c.textMuted, marginBottom: 4 },
    metaValue: { fontSize: 14, fontWeight: '600', color: c.textPrimary, textTransform: 'capitalize' },
    metaInput: {
      borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
      fontSize: 13, color: c.textPrimary,
    },

    sectionHead: { fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginBottom: 8 },
    bodyInput: {
      borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12,
      fontSize: 14, color: c.textPrimary, minHeight: 160, marginBottom: 10,
    },
    paragraph: { fontSize: 14, color: c.textPrimary, lineHeight: 21 },
    emptyText: { fontSize: 13, color: c.textMuted, fontStyle: 'italic' },

    addTableBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: c.primaryLight,
    },
    addTableBtnText: { fontSize: 13, fontWeight: '700', color: c.primary },
    tablePreview: { marginTop: 12, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 10 },
    tablePreviewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    tablePreviewLabel: { fontSize: 11, fontWeight: '700', color: c.textMuted },
    previewCell: { minWidth: 80, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: c.border },
    previewCellHeader: { backgroundColor: c.primaryLight },
    previewCellText: { fontSize: 11, color: c.textSecondary },
    previewCellTextHeader: { fontWeight: '700', color: c.textPrimary },

    workflowRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    workflowBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: c.gray100, borderWidth: 1, borderColor: c.border },
    workflowBtnText: { fontSize: 12, fontWeight: '600', color: c.textPrimary },
    deleteBtn: { alignSelf: 'flex-start' },
    deleteBtnText: { fontSize: 13, fontWeight: '600', color: c.danger },
    savedHint: { fontSize: 11, color: c.textMuted, textAlign: 'center', marginTop: 12 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 12, paddingBottom: 24 },
    pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 12 },
    pickerRowSel: { backgroundColor: c.primaryLight, borderRadius: 10 },
    pickerRowText: { fontSize: 15, color: c.textPrimary, textTransform: 'capitalize' },
    pickerRowTextSel: { color: c.primary, fontWeight: '700' },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
    confirmCard: { backgroundColor: c.surface, borderRadius: 16, padding: 20 },
    confirmTitle: { fontSize: 16, fontWeight: '800', color: c.textPrimary, marginBottom: 6 },
    confirmMsg: { fontSize: 13, color: c.textSecondary },
    confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
    confirmBtnText: { fontSize: 14, fontWeight: '700' },
  });
}
