import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, Modal, FlatList, TextInput,
} from 'react-native';
import { showAlert } from '../../components/common/AlertModal';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../hooks/useApi';
import { PriorityColors, AppColors } from '../../utils/colors';
import { useTheme } from '../../contexts/ThemeContext';
import { TasksStackParamList } from '../../navigation/types';
import ScreenHeader from '../../components/common/ScreenHeader';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import DatePickerField from '../../components/common/DatePickerField';
import Avatar from '../../components/common/Avatar';
import LoadingSpinner from '../../components/common/LoadingSpinner';

type Route = RouteProp<TasksStackParamList, 'CreateTask'>;

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const PRIORITY_LABELS: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Critical' };
const TASK_TYPES = ['internal', 'project'] as const;
const TASK_TYPE_LABELS: Record<string, string> = { internal: 'Internal', project: 'Project' };

export default function CreateTaskScreen() {
  const route = useRoute<Route>();
  const { appId } = route.params;
  const navigation = useNavigation();
  const api = useApi();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  // New fields
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [areaId, setAreaId] = useState<number | null>(null);
  const [estHours, setEstHours] = useState('');
  const [taskType, setTaskType] = useState<'internal' | 'project'>('internal');
  const [projectId, setProjectId] = useState<number | null>(null);
  const [milestoneId, setMilestoneId] = useState<number | null>(null);
  const [routineId, setRoutineId] = useState<number | null>(null);

  // Data
  const [members, setMembers] = useState<any[]>([]);
  const [areas, setAreas] = useState<{ id: number; name: string; roleTitle: string }[]>([]);
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [routines, setRoutines] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Modals
  const [assigneeModal, setAssigneeModal] = useState(false);
  const [areaModal, setAreaModal] = useState(false);
  const [projectModal, setProjectModal] = useState(false);
  const [milestoneModal, setMilestoneModal] = useState(false);
  const [routineModal, setRoutineModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const [meRes, membersRes, rolesRes, projRes] = await Promise.all([
        api.me.getProfile(),
        api.workspace.getMembers(appId),
        api.roles.list(appId),
        api.projects.listSimple(appId).catch(() => ({ data: [] })),
      ]);
      const projRows: any[] = projRes.data?.items ?? projRes.data ?? [];
      setProjects(projRows.map((p: any) => ({ id: p.id, name: p.name })));
      const me = meRes.data;
      const meId = me?.id ?? me?.user?.id ?? null;
      const membersList: any[] = membersRes.data?.members ?? membersRes.data?.items ?? membersRes.data ?? [];
      setMembers(membersList);

      // Default assignee to current user
      const meInMembers = membersList.find((m: any) => (m.user_id ?? m.id) === meId);
      setAssigneeId(meInMembers ? (meInMembers.user_id ?? meInMembers.id) : (membersList[0]?.user_id ?? membersList[0]?.id ?? null));

      // Load areas for all roles in parallel
      const rolesList: any[] = rolesRes.data?.items ?? rolesRes.data?.roles ?? rolesRes.data ?? [];
      const areaResults = await Promise.all(
        rolesList.map((r: any) =>
          api.roles.listAreas(appId, r.id)
            .then((res: any) => ({ role: r, items: res.data?.items ?? res.data?.areas ?? res.data ?? [] }))
            .catch(() => ({ role: r, items: [] }))
        )
      );
      const flatAreas: { id: number; name: string; roleTitle: string }[] = [];
      areaResults.forEach(({ role, items }) => {
        items.forEach((a: any) => flatAreas.push({ id: a.id, name: a.name, roleTitle: role.title }));
      });
      setAreas(flatAreas);
    } catch {} finally {
      setDataLoading(false);
    }
  }, [appId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (taskType !== 'project' || !projectId) { setMilestones([]); return; }
    api.projects.listMilestones(appId, projectId)
      .then((res: any) => {
        const items: any[] = res.data?.items ?? res.data ?? [];
        setMilestones(items.filter((m) => !m.is_completed));
      })
      .catch(() => setMilestones([]));
  }, [taskType, projectId, appId]);

  useEffect(() => {
    if (!assigneeId) { setRoutines([]); return; }
    api.routines.getAvailable(appId, assigneeId)
      .then((res: any) => setRoutines(res.data?.routines ?? res.data ?? []))
      .catch(() => setRoutines([]));
  }, [assigneeId, appId]);

  const getMemberName = (uid: number | null) => {
    if (!uid) return 'Unassigned';
    const m = members.find((mb) => (mb.user_id ?? mb.id) === uid);
    return m ? (m.name ?? (`${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email)) : 'Unknown';
  };

  const getAreaName = (aid: number | null) => {
    if (!aid) return 'None (General)';
    const a = areas.find((ar) => ar.id === aid);
    return a ? `${a.roleTitle} › ${a.name}` : 'Unknown';
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      showAlert('Validation', 'Task title is required.');
      return;
    }
    if (!dueDate.trim()) {
      showAlert('Validation', 'Please select a deadline.');
      return;
    }
    if (taskType === 'project' && projectId && !milestoneId) {
      showAlert('Validation', 'Select a milestone for this project task.');
      return;
    }
    setSaving(true);
    try {
      const estMinutes = estHours !== '' ? Math.round(parseFloat(estHours) * 60) : 0;
      await api.tasks.create(appId, {
        title: title.trim(),
        description: description.trim() || undefined,
        status: 'open',
        priority,
        due_on: dueDate.trim(),
        assigned_to_user_id: assigneeId ?? null,
        area_id: areaId ?? null,
        estimated_minutes: estMinutes || 0,
        project_id: taskType === 'project' ? (projectId ?? undefined) : undefined,
        milestone_id: taskType === 'project' ? (milestoneId ?? undefined) : undefined,
        routine_id: routineId ?? undefined,
      });
      navigation.goBack();
    } catch {
      showAlert('Error', 'Could not create task.');
    } finally {
      setSaving(false);
    }
  };

  if (dataLoading) return <LoadingSpinner />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <View style={[s.container, { paddingTop: insets.top }]}>
        <ScreenHeader
          title="New Task"
          showBack
          right={<Button label="Create" onPress={handleCreate} loading={saving} style={s.saveBtn} />}
        />
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Input label="Title *" value={title} onChangeText={setTitle} placeholder="Task title" />
          <Input label="Description" value={description} onChangeText={setDescription}
            placeholder="Describe the task..." multiline numberOfLines={4} />

          <Text style={s.fieldLabel}>Priority</Text>
          <View style={s.chipRow}>
            {PRIORITIES.map((p) => {
              const c = PriorityColors[p];
              return (
                <TouchableOpacity
                  key={p}
                  style={[s.selectorChip, { backgroundColor: priority === p ? c.bg : colors.surface, borderColor: priority === p ? c.text : colors.border }]}
                  onPress={() => setPriority(p)}
                >
                  <Text style={[s.selectorChipText, { color: priority === p ? c.text : colors.gray500 }]}>
                    {PRIORITY_LABELS[p]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <DatePickerField label="Deadline *" value={dueDate} onChange={setDueDate} />

          {/* Assigned To */}
          <Text style={s.fieldLabel}>Assigned To</Text>
          <TouchableOpacity style={s.pickerRow} onPress={() => setAssigneeModal(true)}>
            {assigneeId ? (
              <>
                <Avatar name={getMemberName(assigneeId)} size={26} />
                <Text style={s.pickerValue}>{getMemberName(assigneeId)}</Text>
              </>
            ) : (
              <Text style={s.pickerPlaceholder}>Tap to assign</Text>
            )}
            <Ionicons name="chevron-forward" size={16} color={colors.gray400} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>

          {/* Area */}
          <Text style={s.fieldLabel}>Area</Text>
          <TouchableOpacity style={s.pickerRow} onPress={() => setAreaModal(true)}>
            <Ionicons name="layers-outline" size={16} color={colors.gray400} />
            <Text style={areaId ? s.pickerValue : s.pickerPlaceholder}>
              {getAreaName(areaId)}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.gray400} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
          <Text style={s.helpText}>Align to a role's area, or leave as None for general work.</Text>

          {/* Task Type */}
          <Text style={s.fieldLabel}>Task Type</Text>
          <View style={s.chipRow}>
            {TASK_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[s.selectorChip, { backgroundColor: taskType === t ? colors.primaryLight : colors.surface, borderColor: taskType === t ? colors.primary : colors.border }]}
                onPress={() => { setTaskType(t); if (t === 'internal') { setProjectId(null); setMilestoneId(null); } }}
              >
                <Text style={[s.selectorChipText, { color: taskType === t ? colors.primary : colors.gray500 }]}>
                  {TASK_TYPE_LABELS[t]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {taskType === 'project' && (
            <>
              <Text style={s.fieldLabel}>Project *</Text>
              <TouchableOpacity style={s.pickerRow} onPress={() => setProjectModal(true)}>
                <Ionicons name="folder-open-outline" size={16} color={colors.gray400} />
                <Text style={projectId ? s.pickerValue : s.pickerPlaceholder}>
                  {projectId ? (projects.find((p) => p.id === projectId)?.name ?? 'Selected') : 'Tap to select a project'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.gray400} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>

              {projectId && (
                <>
                  <Text style={s.fieldLabel}>Milestone *</Text>
                  <TouchableOpacity style={s.pickerRow} onPress={() => setMilestoneModal(true)}>
                    <Ionicons name="flag-outline" size={16} color={colors.gray400} />
                    <Text style={milestoneId ? s.pickerValue : s.pickerPlaceholder}>
                      {milestoneId ? (milestones.find((m) => m.id === milestoneId)?.title ?? 'Selected') : 'Tap to select a milestone'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.gray400} style={{ marginLeft: 'auto' }} />
                  </TouchableOpacity>
                </>
              )}
            </>
          )}

          {/* Routine Activity */}
          {routines.length > 0 && (
            <>
              <Text style={s.fieldLabel}>Routine Activity</Text>
              <TouchableOpacity style={s.pickerRow} onPress={() => setRoutineModal(true)}>
                <Ionicons name="repeat-outline" size={16} color={colors.gray400} />
                <Text style={routineId ? s.pickerValue : s.pickerPlaceholder}>
                  {routineId ? (routines.find((r) => r.id === routineId)?.description ?? 'Selected') : 'None'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.gray400} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
              <Text style={s.helpText}>Optional — link this task to a recurring routine.</Text>
            </>
          )}

          {/* Estimated Hours */}
          <Text style={s.fieldLabel}>Estimated Hours</Text>
          <View style={s.inputRow}>
            <TextInput
              style={[s.numInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.gray50 }]}
              placeholder="e.g. 4"
              placeholderTextColor={colors.gray400}
              value={estHours}
              onChangeText={setEstHours}
              keyboardType="decimal-pad"
            />
            <Text style={s.unitText}>hours</Text>
          </View>
          <Text style={s.helpText}>Optional.</Text>
        </ScrollView>
      </View>

      {/* Assignee Picker Modal */}
      <Modal visible={assigneeModal} transparent animationType="slide" onRequestClose={() => setAssigneeModal(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setAssigneeModal(false)}>
          <View style={[s.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Assign To</Text>
            <TouchableOpacity style={s.modalOption} onPress={() => { setAssigneeId(null); setAssigneeModal(false); }}>
              <Ionicons name="person-remove-outline" size={18} color={colors.gray400} />
              <Text style={[s.modalOptionText, { color: colors.gray500 }]}>Unassigned</Text>
            </TouchableOpacity>
            <FlatList
              data={members}
              keyExtractor={(m) => String(m.user_id ?? m.id)}
              scrollEnabled={false}
              renderItem={({ item: m }) => {
                const uid = m.user_id ?? m.id;
                const name = m.name ?? (`${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email);
                const isActive = assigneeId === uid;
                return (
                  <TouchableOpacity
                    style={[s.modalOption, isActive && s.modalOptionActive]}
                    onPress={() => { setAssigneeId(uid); setAssigneeModal(false); }}
                  >
                    <Avatar name={name} size={28} />
                    <Text style={[s.modalOptionText, isActive && { color: colors.primary, fontWeight: '700' }]}>{name}</Text>
                    {isActive && <Ionicons name="checkmark" size={18} color={colors.primary} style={{ marginLeft: 'auto' }} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Area Picker Modal */}
      <Modal visible={areaModal} transparent animationType="slide" onRequestClose={() => setAreaModal(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setAreaModal(false)}>
          <View style={[s.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Select Area</Text>
            <ScrollView>
              <TouchableOpacity style={s.modalOption} onPress={() => { setAreaId(null); setAreaModal(false); }}>
                <Ionicons name="layers-outline" size={18} color={colors.gray400} />
                <Text style={[s.modalOptionText, { color: colors.gray500 }]}>None (General)</Text>
                {!areaId && <Ionicons name="checkmark" size={18} color={colors.primary} style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
              {areas.map((a) => {
                const isActive = areaId === a.id;
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={[s.modalOption, isActive && s.modalOptionActive]}
                    onPress={() => { setAreaId(a.id); setAreaModal(false); }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.modalOptionText, isActive && { color: colors.primary, fontWeight: '700' }]}>{a.name}</Text>
                      <Text style={s.areaRoleText}>{a.roleTitle}</Text>
                    </View>
                    {isActive && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Project Picker Modal */}
      <Modal visible={projectModal} transparent animationType="slide" onRequestClose={() => setProjectModal(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setProjectModal(false)}>
          <View style={[s.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Select Project</Text>
            <ScrollView>
              {projects.map((p) => {
                const isActive = projectId === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[s.modalOption, isActive && s.modalOptionActive]}
                    onPress={() => { setProjectId(p.id); setMilestoneId(null); setProjectModal(false); }}
                  >
                    <Ionicons name="folder-open-outline" size={18} color={colors.gray400} />
                    <Text style={[s.modalOptionText, isActive && { color: colors.primary, fontWeight: '700' }]}>{p.name}</Text>
                    {isActive && <Ionicons name="checkmark" size={18} color={colors.primary} style={{ marginLeft: 'auto' }} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Milestone Picker Modal */}
      <Modal visible={milestoneModal} transparent animationType="slide" onRequestClose={() => setMilestoneModal(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setMilestoneModal(false)}>
          <View style={[s.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Select Milestone</Text>
            <ScrollView>
              {milestones.length === 0 ? (
                <Text style={s.helpText}>No incomplete milestones on this project.</Text>
              ) : (
                milestones.map((m) => {
                  const isActive = milestoneId === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[s.modalOption, isActive && s.modalOptionActive]}
                      onPress={() => { setMilestoneId(m.id); setMilestoneModal(false); }}
                    >
                      <Ionicons name="flag-outline" size={18} color={colors.gray400} />
                      <Text style={[s.modalOptionText, isActive && { color: colors.primary, fontWeight: '700' }]}>{m.title}</Text>
                      {isActive && <Ionicons name="checkmark" size={18} color={colors.primary} style={{ marginLeft: 'auto' }} />}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Routine Picker Modal */}
      <Modal visible={routineModal} transparent animationType="slide" onRequestClose={() => setRoutineModal(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setRoutineModal(false)}>
          <View style={[s.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Select Routine Activity</Text>
            <ScrollView>
              <TouchableOpacity style={s.modalOption} onPress={() => { setRoutineId(null); setRoutineModal(false); }}>
                <Ionicons name="close-circle-outline" size={18} color={colors.gray400} />
                <Text style={[s.modalOptionText, { color: colors.gray500 }]}>None</Text>
                {!routineId && <Ionicons name="checkmark" size={18} color={colors.primary} style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
              {routines.map((r) => {
                const isActive = routineId === r.id;
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={[s.modalOption, isActive && s.modalOptionActive]}
                    onPress={() => { setRoutineId(r.id); setRoutineModal(false); }}
                  >
                    <Ionicons name="repeat-outline" size={18} color={colors.gray400} />
                    <Text style={[s.modalOptionText, isActive && { color: colors.primary, fontWeight: '700' }]}>{r.description}</Text>
                    {isActive && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 16, paddingBottom: 40 },
    saveBtn: { paddingVertical: 8, paddingHorizontal: 16 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: c.gray700, marginBottom: 8, marginTop: 4 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
    selectorChip: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5,
    },
    selectorChipText: { fontSize: 13, fontWeight: '500', textTransform: 'capitalize' },
    pickerRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.gray50, borderRadius: 10, padding: 12,
      borderWidth: 1, borderColor: c.border, marginBottom: 6,
    },
    pickerValue: { fontSize: 14, color: c.textPrimary, fontWeight: '500', flex: 1 },
    pickerPlaceholder: { fontSize: 14, color: c.gray400, flex: 1 },
    helpText: { fontSize: 11, color: c.gray400, marginBottom: 16, marginTop: -2 },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
    numInput: {
      width: 100, borderWidth: 1, borderRadius: 8,
      paddingHorizontal: 12, paddingVertical: 9, fontSize: 14,
    },
    unitText: { fontSize: 14, color: c.gray500 },
    // Modals
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 20, paddingTop: 12, maxHeight: '80%',
    },
    modalHandle: { width: 40, height: 4, backgroundColor: c.gray200, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
    modalTitle: { fontSize: 16, fontWeight: '700', color: c.textPrimary, marginBottom: 12 },
    modalOption: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10,
    },
    modalOptionActive: { backgroundColor: c.primaryLight },
    modalOptionText: { fontSize: 15, color: c.textPrimary },
    areaRoleText: { fontSize: 11, color: c.gray400, marginTop: 1 },
  });
}
