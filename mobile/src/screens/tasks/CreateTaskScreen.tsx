import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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
import LoadError from '../../components/common/LoadError';
import AttachmentChips from '../../components/common/AttachmentChips';
import AttachmentList from '../../components/common/AttachmentList';
import { pickAttachmentFiles, uploadAttachments, PickedFile, Attachment } from '../../utils/attachments';

type Route = RouteProp<TasksStackParamList, 'CreateTask'>;
type IconName = keyof typeof Ionicons.glyphMap;

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const PRIORITY_LABELS: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Critical' };
const TASK_TYPES = ['internal', 'project', 'contract'] as const;
const TASK_TYPE_LABELS: Record<string, string> = { internal: 'Internal', project: 'Project', contract: 'Agreement' };
const TASK_TYPE_ICONS: Record<string, IconName> = { internal: 'person-outline', project: 'folder-open-outline', contract: 'document-text-outline' };
const EST_PRESETS = [
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
  { value: 45, label: '45m' },
  { value: 60, label: '1h' },
  { value: 120, label: '2h' },
  { value: 240, label: '4h' },
  { value: 480, label: '8h' },
];

function FieldLabel({ icon, text, required, colors, s }: { icon: IconName; text: string; required?: boolean; colors: AppColors; s: any }) {
  return (
    <View style={s.fieldLabelRow}>
      <Ionicons name={icon} size={13} color={colors.textSecondary} />
      <Text style={s.fieldLabel}>{text}{required ? <Text style={{ color: colors.danger }}> *</Text> : null}</Text>
    </View>
  );
}

export default function CreateTaskScreen() {
  const route = useRoute<Route>();
  const { appId, taskId, presetContractId, presetAgreementServiceId, lockContractType } = route.params;
  const isEditMode = !!taskId;
  const navigation = useNavigation();
  const api = useApi();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  // Create-mode-only checklist seeding — matches web's CreateTaskModal
  // (checklistItems local list, submitted right after the task itself is
  // created). Edit mode already has a full live-backed Checklist tab on
  // TaskDetailScreen, so this doesn't need its own edit-mode variant.
  const [checklistDraft, setChecklistDraft] = useState<string[]>([]);
  const [checklistInput, setChecklistInput] = useState('');
  const [description, setDescription] = useState('');
  const [descAttachments, setDescAttachments] = useState<Attachment[]>([]);
  const [descPendingFiles, setDescPendingFiles] = useState<PickedFile[]>([]);
  const [uploadingDescFiles, setUploadingDescFiles] = useState(false);
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [roleId, setRoleId] = useState<number | null>(null);
  const [areaId, setAreaId] = useState<number | null>(null);
  const [estMinutes, setEstMinutes] = useState(45);
  const [customEst, setCustomEst] = useState(false);
  const [customEstInput, setCustomEstInput] = useState('');
  const [taskType, setTaskType] = useState<'internal' | 'project' | 'contract'>(
    lockContractType || presetContractId ? 'contract' : 'internal',
  );
  const [projectId, setProjectId] = useState<number | null>(null);
  const [milestoneId, setMilestoneId] = useState<number | null>(null);
  const [routineId, setRoutineId] = useState<number | null>(null);
  const [contractId, setContractId] = useState<number | null>(presetContractId ?? null);
  const [agreementServiceId, setAgreementServiceId] = useState<number | null>(presetAgreementServiceId ?? null);
  const [agreementServices, setAgreementServices] = useState<any[]>([]);
  const [serviceModal, setServiceModal] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');
  // Seeded once from the preset service on open (create mode) so it isn't
  // re-seeded every render; also guards the edit-mode load.
  const serviceSeededRef = useRef(false);

  // Data
  const [members, setMembers] = useState<any[]>([]);
  const [roles, setRoles] = useState<{ id: number; title: string }[]>([]);
  const [areas, setAreas] = useState<{ id: number; name: string; roleId: number; roleTitle: string }[]>([]);
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [routines, setRoutines] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [assigneeRoleIds, setAssigneeRoleIds] = useState<Set<number>>(new Set());
  const [assigneeWorkload, setAssigneeWorkload] = useState<{ pending_minutes: number; min_hours_per_day: number } | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Web (CreateTaskModal.jsx) skips role/area auto-select in edit mode as
  // long as the assignee hasn't actually been changed from the task's
  // original one — otherwise reopening a task to edit something unrelated
  // would silently overwrite its already-correct role/area. Auto-select only
  // kicks in once the user picks a different assignee.
  const originalAssigneeIdRef = useRef<number | null>(null);

  // Modals
  const [assigneeModal, setAssigneeModal] = useState(false);
  const [projectModal, setProjectModal] = useState(false);
  const [milestoneModal, setMilestoneModal] = useState(false);
  const [routineModal, setRoutineModal] = useState(false);
  const [contractModal, setContractModal] = useState(false);
  const [contractSearch, setContractSearch] = useState('');

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      // taskRes doesn't depend on any of the other calls (or on the areas
      // step below) — fire it alongside everything else instead of waiting
      // for two prior round-trips to finish first.
      const [meRes, membersRes, rolesRes, projRes, taskRes] = await Promise.all([
        api.me.getProfile(),
        api.workspace.getMembers(appId),
        api.roles.list(appId),
        api.projects.listSimple(appId).catch(() => ({ data: [] })),
        isEditMode && taskId ? api.tasks.get(appId, taskId) : Promise.resolve(null),
      ]);
      const projRows: any[] = projRes.data?.items ?? projRes.data ?? [];
      setProjects(projRows.map((p: any) => ({ id: p.id, name: p.name })));
      const me = meRes.data;
      const meId = me?.id ?? me?.user?.id ?? null;
      const membersList: any[] = membersRes.data?.members ?? membersRes.data?.items ?? membersRes.data ?? [];
      setMembers(membersList);

      const rolesList: any[] = rolesRes.data?.items ?? rolesRes.data?.roles ?? rolesRes.data ?? [];
      setRoles(rolesList.map((r: any) => ({ id: r.id, title: r.title })));

      const areaResults = await Promise.all(
        rolesList.map((r: any) =>
          api.roles.listAreas(appId, r.id)
            .then((res: any) => ({ role: r, items: res.data?.items ?? res.data?.areas ?? res.data ?? [] }))
            .catch(() => ({ role: r, items: [] }))
        )
      );
      const flatAreas: { id: number; name: string; roleId: number; roleTitle: string }[] = [];
      areaResults.forEach(({ role, items }) => {
        items.forEach((a: any) => flatAreas.push({ id: a.id, name: a.name, roleId: role.id, roleTitle: role.title }));
      });
      setAreas(flatAreas);

      if (isEditMode && taskId && taskRes) {
        const task = taskRes.data?.task ?? taskRes.data;
        setTitle(task.title ?? '');
        setDescription(task.description ?? '');
        setDescAttachments(task.description_attachments ?? []);
        setPriority(task.priority ?? 'medium');
        setDueDate(task.due_on ?? '');
        const em = task.estimated_minutes ?? 0;
        setEstMinutes(em);
        const preset = EST_PRESETS.find((p) => p.value === em);
        setCustomEst(!preset && em > 0);
        setCustomEstInput(!preset && em > 0 ? String(em) : '');
        setAssigneeId(task.assigned_to_user_id ?? null);
        originalAssigneeIdRef.current = task.assigned_to_user_id ?? null;
        setAreaId(task.area_id ?? null);
        const areaEntry = flatAreas.find((a) => a.id === task.area_id);
        setRoleId(areaEntry ? areaEntry.roleId : null);
        setRoutineId(task.routine_id ?? null);
        if (task.project_id) {
          setTaskType('project');
          setProjectId(task.project_id);
          setMilestoneId(task.milestone_id ?? null);
        } else if (task.contract_id) {
          // Preserve the agreement + service link on edit — dropping these
          // (as an unconditional `internal` fallback would) silently unlinks
          // the task from its agreement/service on save.
          setTaskType('contract');
          setContractId(task.contract_id);
          setAgreementServiceId(task.agreement_service_id ?? null);
        } else {
          setTaskType('internal');
        }
      } else {
        // Default assignee to current user
        const meInMembers = membersList.find((m: any) => (m.user_id ?? m.id) === meId);
        setAssigneeId(meInMembers ? (meInMembers.user_id ?? meInMembers.id) : (membersList[0]?.user_id ?? membersList[0]?.id ?? null));

        // Default deadline to 3 days out — pre-filled but still changeable
        // via the date picker below, same as any other field default here.
        const d = new Date();
        d.setDate(d.getDate() + 3);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        setDueDate(`${y}-${m}-${day}`);
      }
    } catch {
      setLoadError(true);
    } finally {
      setDataLoading(false);
    }
  }, [appId, isEditMode, taskId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (taskType !== 'project' || !projectId) { setMilestones([]); return; }
    api.projects.listMilestones(appId, projectId)
      .then((res: any) => {
        const items: any[] = res.data?.items ?? res.data ?? [];
        setMilestones(items.filter((m) => !m.is_completed || m.id === milestoneId));
      })
      .catch(() => setMilestones([]));
  }, [taskType, projectId, appId]);

  useEffect(() => {
    if (taskType !== 'contract') { setContracts([]); return; }
    api.contracts.listAgreements(appId, { per_page: 100 })
      .then((res: any) => setContracts(res.data?.agreements ?? res.data?.items ?? res.data ?? []))
      .catch(() => setContracts([]));
  }, [taskType, appId]);

  // Services attached to the selected agreement — matches web's CreateTaskModal
  // service dropdown. Fetched fresh from the agreement (the list payload's
  // services array can be trimmed), so the Compliance Board's preset service
  // and its checklist seeding always resolve.
  useEffect(() => {
    if (taskType !== 'contract' || !contractId) { setAgreementServices([]); return; }
    let alive = true;
    api.contracts.getAgreement(appId, contractId)
      .then((res: any) => {
        if (!alive) return;
        const svcs: any[] = res.data?.services ?? res.data?.agreement?.services ?? [];
        setAgreementServices(svcs);
        // Seed the checklist from the preset service once, in create mode,
        // exactly like web's selectAgreementService (deliverables then
        // major_activities, de-duped).
        if (!isEditMode && !serviceSeededRef.current && presetAgreementServiceId) {
          const match = svcs.find((x) => x.id === presetAgreementServiceId);
          if (match) {
            serviceSeededRef.current = true;
            const auto = [...(match.deliverables ?? []), ...(match.major_activities ?? [])];
            setChecklistDraft((prev) => {
              const merged = [...prev];
              auto.forEach((t: string) => { if (t && !merged.includes(t)) merged.push(t); });
              return merged;
            });
          }
        }
      })
      .catch(() => { if (alive) setAgreementServices([]); });
    return () => { alive = false; };
  }, [taskType, contractId, appId, isEditMode, presetAgreementServiceId]);

  // Pick a service by hand — reseeds checklist items from the newly chosen
  // service, dropping ones auto-added from a previously selected service but
  // keeping hand-typed ones (mirrors web's selectAgreementService).
  const selectService = useCallback((svc: any) => {
    setAgreementServiceId(svc.id);
    setServiceModal(false);
    setServiceSearch('');
    const auto: string[] = [...(svc.deliverables ?? []), ...(svc.major_activities ?? [])];
    setChecklistDraft((prev) => {
      const priorAuto = new Set(
        agreementServices
          .filter((x) => x.id !== svc.id)
          .flatMap((x) => [...(x.deliverables ?? []), ...(x.major_activities ?? [])]),
      );
      const handTyped = prev.filter((t) => !priorAuto.has(t));
      const merged = [...handTyped];
      auto.forEach((t) => { if (t && !merged.includes(t)) merged.push(t); });
      return merged;
    });
  }, [agreementServices]);

  useEffect(() => {
    if (!assigneeId) { setRoutines([]); return; }
    api.routines.getAvailable(appId, assigneeId)
      .then((res: any) => setRoutines(res.data?.routines ?? res.data ?? []))
      .catch(() => setRoutines([]));
  }, [assigneeId, appId]);

  // Same default-something-sensible-instead-of-empty pattern as the deadline
  // field: for a new task, default to the first available routine (still
  // changeable in the picker below) rather than "None". Skipped in edit mode
  // so an existing task's own routine_id (set in load() above) isn't
  // clobbered, and re-runs whenever the assignee changes the routines list.
  useEffect(() => {
    if (isEditMode) return;
    setRoutineId(routines[0]?.id ?? null);
  }, [routines, isEditMode]);

  useEffect(() => {
    if (!assigneeId) { setAssigneeRoleIds(new Set()); return; }
    api.roles.listAssignmentsForUser(appId, assigneeId)
      .then((res: any) => {
        const items: any[] = res.data?.items ?? res.data ?? [];
        const roleIdSet = new Set<number>(items.map((i: any) => i.role_id));
        setAssigneeRoleIds(roleIdSet);

        const keepingOriginalAssignee = isEditMode && originalAssigneeIdRef.current != null
          && assigneeId === originalAssigneeIdRef.current;
        if (keepingOriginalAssignee) return;

        const validRoles = roles.filter((r) => roleIdSet.has(r.id));
        const firstRole = validRoles[0] ?? roles[0] ?? null;
        setRoleId(firstRole ? firstRole.id : null);
      })
      .catch(() => setAssigneeRoleIds(new Set()));
  }, [assigneeId, appId]);

  // Auto-select an area once a role is picked (matches web's CreateTaskModal)
  // — keeps the current area if it's still valid for the new role, otherwise
  // falls back to the role's first area rather than leaving it on "None".
  useEffect(() => {
    if (areasForRole.some((a) => a.id === areaId)) return;
    setAreaId(areasForRole.length > 0 ? areasForRole[0].id : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleId]);

  useEffect(() => {
    if (!assigneeId) { setAssigneeWorkload(null); return; }
    api.tasks.getWorkload(appId, assigneeId)
      .then((res: any) => setAssigneeWorkload(res.data ?? null))
      .catch(() => setAssigneeWorkload(null));
  }, [assigneeId, appId]);

  const getMemberName = (uid: number | null) => {
    if (!uid) return 'Unassigned';
    const m = members.find((mb) => (mb.user_id ?? mb.id) === uid);
    return m ? (m.name ?? (`${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email)) : 'Unknown';
  };

  const getMemberPhoto = (uid: number | null): string | null => {
    if (!uid) return null;
    const m = members.find((mb) => (mb.user_id ?? mb.id) === uid);
    return m?.photo_url ?? null;
  };

  const rolesForUser = assigneeId && assigneeRoleIds.size > 0
    ? roles.filter((r) => assigneeRoleIds.has(r.id))
    : roles;
  const areasForRole = roleId ? areas.filter((a) => a.roleId === roleId) : [];

  const probableDeadline = useMemo(() => {
    if (!assigneeWorkload) return null;
    const minHrsDay = assigneeWorkload.min_hours_per_day || 0;
    if (minHrsDay <= 0) return null;
    const totalPendingMins = (assigneeWorkload.pending_minutes || 0) + (estMinutes || 0);
    const daysNeeded = Math.ceil(totalPendingMins / (minHrsDay * 60));
    if (daysNeeded <= 0) return null;
    const d = new Date();
    d.setDate(d.getDate() + daysNeeded);
    return d.toISOString().slice(0, 10);
  }, [assigneeWorkload, estMinutes]);
  const deadlineTooEarly = !!(probableDeadline && dueDate && dueDate < probableDeadline);

  const pickDescFiles = async () => {
    try {
      const files = await pickAttachmentFiles();
      if (files.length) setDescPendingFiles((prev) => [...prev, ...files]);
    } catch {
      showAlert('Error', 'Could not pick file.');
    }
  };

  const removeDescPendingFile = (i: number) =>
    setDescPendingFiles((prev) => prev.filter((_, idx) => idx !== i));

  const deleteDescAttachment = (attachmentId: number) => {
    if (!isEditMode || !taskId) return;
    showAlert('Delete Attachment', 'Delete this file?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.tasks.removeDescriptionAttachment(appId, taskId, attachmentId);
            setDescAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
          } catch {
            showAlert('Error', 'Could not delete attachment.');
          }
        },
      },
    ]);
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
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        due_on: dueDate.trim(),
        assigned_to_user_id: assigneeId ?? null,
        area_id: areaId ?? null,
        estimated_minutes: estMinutes || 0,
        project_id: taskType === 'project' ? (projectId ?? undefined) : undefined,
        milestone_id: taskType === 'project' ? (milestoneId ?? undefined) : undefined,
        // Contract link — was never sent, so a contract task created/edited on
        // mobile silently lost its agreement (and service). Matches web's
        // CreateTaskModal payload.
        contract_id: taskType === 'contract' ? (contractId ?? null) : null,
        agreement_service_id: taskType === 'contract' && contractId ? (agreementServiceId ?? null) : null,
        routine_id: routineId ?? undefined,
      };
      if (isEditMode && taskId) {
        await api.tasks.update(appId, taskId, payload);
        if (descPendingFiles.length > 0) {
          setUploadingDescFiles(true);
          const uploaded = await uploadAttachments(api, appId, 'task_description', descPendingFiles);
          for (const att of uploaded) {
            await api.tasks.addDescriptionAttachment(appId, taskId, att);
          }
          setUploadingDescFiles(false);
        }
      } else {
        const created = await api.tasks.create(appId, { ...payload, status: 'open' });
        const newTaskId = created.data?.id;
        if (newTaskId && checklistDraft.length > 0) {
          await Promise.all(checklistDraft.map((label) => api.tasks.addChecklistItem(appId, newTaskId, label)));
        }
      }
      navigation.goBack();
    } catch {
      setUploadingDescFiles(false);
      showAlert('Error', isEditMode ? 'Could not save task.' : 'Could not create task.');
    } finally {
      setSaving(false);
    }
  };

  if (dataLoading) return <LoadingSpinner />;
  if (loadError) return <LoadError onRetry={load} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.container, { paddingTop: insets.top }]}>
        <ScreenHeader
          title={isEditMode ? 'Edit Task' : 'New Task'}
          showBack
          right={<Button label={isEditMode ? 'Save' : 'Create'} onPress={handleCreate} loading={saving} style={s.saveBtn} />}
        />
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <FieldLabel icon="document-text-outline" text="Task Name" required colors={colors} s={s} />
          <Input value={title} onChangeText={(v) => setTitle(v.slice(0, 120))} placeholder="What needs to be done?" />
          <Text style={s.charCount}>{title.length}/120</Text>

          <FieldLabel icon="reader-outline" text="Description" colors={colors} s={s} />
          <Input value={description} onChangeText={(v) => setDescription(v.slice(0, 1000))}
            placeholder="Optional details..." multiline numberOfLines={3} />
          <Text style={s.charCount}>{description.length}/1000</Text>

          {!isEditMode && (
            <>
              <FieldLabel icon="checkbox-outline" text="Checklist" colors={colors} s={s} />
              {checklistDraft.map((item, i) => (
                <View key={i} style={s.checklistDraftRow}>
                  <Ionicons name="square-outline" size={16} color={colors.gray400} />
                  <Text style={s.checklistDraftTxt} numberOfLines={1}>{item}</Text>
                  <TouchableOpacity onPress={() => setChecklistDraft((prev) => prev.filter((_, idx) => idx !== i))} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={colors.gray400} />
                  </TouchableOpacity>
                </View>
              ))}
              <View style={s.checklistAddRow}>
                <TextInput
                  style={s.checklistInput}
                  placeholder="Add a checklist item"
                  placeholderTextColor={colors.gray400}
                  value={checklistInput}
                  onChangeText={setChecklistInput}
                  onSubmitEditing={() => {
                    if (checklistInput.trim()) { setChecklistDraft((prev) => [...prev, checklistInput.trim()]); setChecklistInput(''); }
                  }}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  onPress={() => {
                    if (checklistInput.trim()) { setChecklistDraft((prev) => [...prev, checklistInput.trim()]); setChecklistInput(''); }
                  }}
                  disabled={!checklistInput.trim()}
                  hitSlop={8}
                >
                  <Ionicons name="add-circle" size={26} color={checklistInput.trim() ? colors.primary : colors.gray300} />
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Attaching requires an existing task_id, so this is edit-mode-only — matches web. */}
          {isEditMode && (
            <>
              {descAttachments.length > 0 && (
                <AttachmentList attachments={descAttachments} onDelete={(a) => deleteDescAttachment(a.id)} imageMaxWidth={140} imageMaxHeight={100} />
              )}
              <TouchableOpacity style={s.descAttachBtn} onPress={pickDescFiles} disabled={uploadingDescFiles}>
                <Ionicons name="attach" size={16} color={colors.primary} />
                <Text style={s.descAttachBtnText}>Attach file</Text>
              </TouchableOpacity>
              <AttachmentChips files={descPendingFiles} onRemove={removeDescPendingFile} uploading={uploadingDescFiles} containerStyle={{ paddingBottom: 8 }} />
            </>
          )}

          <FieldLabel icon="flag-outline" text="Priority" colors={colors} s={s} />
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

          <FieldLabel icon="calendar-outline" text="Deadline" required colors={colors} s={s} />
          <DatePickerField value={dueDate} onChange={setDueDate} />
          {probableDeadline && (
            <Text style={s.suggestionText}>
              {deadlineTooEarly ? '⚠ Earliest realistic deadline: ' : 'Suggested deadline: '}
              <Text style={s.suggestionLink} onPress={() => setDueDate(probableDeadline)}>{probableDeadline}</Text>
              {deadlineTooEarly ? ' (based on workload)' : ''}
            </Text>
          )}

          {/* Assigned To */}
          <FieldLabel icon="person-outline" text="Assigned To" required colors={colors} s={s} />
          <TouchableOpacity style={s.pickerRow} onPress={() => setAssigneeModal(true)}>
            {assigneeId ? (
              <>
                <Avatar name={getMemberName(assigneeId)} photoUrl={getMemberPhoto(assigneeId)} size={26} />
                <Text style={s.pickerValue}>{getMemberName(assigneeId)}</Text>
              </>
            ) : (
              <Text style={s.pickerPlaceholder}>Tap to assign</Text>
            )}
            <Ionicons name="chevron-forward" size={16} color={colors.gray400} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>

          {/* Estimation */}
          <FieldLabel icon="time-outline" text="Estimation" colors={colors} s={s} />
          <View style={s.chipRow}>
            {EST_PRESETS.map((e) => (
              <TouchableOpacity
                key={e.value}
                style={[s.selectorChip, { backgroundColor: !customEst && estMinutes === e.value ? colors.primaryLight : colors.surface, borderColor: !customEst && estMinutes === e.value ? colors.primary : colors.border }]}
                onPress={() => { setEstMinutes(e.value); setCustomEst(false); }}
              >
                <Text style={[s.selectorChipText, { color: !customEst && estMinutes === e.value ? colors.primary : colors.gray500 }]}>{e.label}</Text>
              </TouchableOpacity>
            ))}
            {customEst ? (
              <View style={s.customEstBox}>
                <TextInput
                  style={[s.customEstInput, { color: colors.textPrimary, borderColor: colors.primary }]}
                  placeholder="min"
                  placeholderTextColor={colors.gray400}
                  value={customEstInput}
                  onChangeText={(v) => { setCustomEstInput(v); setEstMinutes(Number(v) || 0); }}
                  keyboardType="number-pad"
                  autoFocus
                />
                <Text style={s.unitText}>min</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[s.selectorChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => { setCustomEst(true); setCustomEstInput(String(estMinutes)); }}
              >
                <Text style={[s.selectorChipText, { color: colors.gray500 }]}>Custom </Text>
                <Ionicons name="pencil-outline" size={11} color={colors.gray500} />
              </TouchableOpacity>
            )}
          </View>

          {/* Task Type — hidden when opened from the Compliance Board, which
              locks the type to Agreement (matches web's lockTaskType). */}
          {!lockContractType && (
            <>
              <FieldLabel icon="grid-outline" text="Task Type" colors={colors} s={s} />
              <View style={s.chipRow}>
                {TASK_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[s.selectorChip, { backgroundColor: taskType === t ? colors.primaryLight : colors.surface, borderColor: taskType === t ? colors.primary : colors.border }]}
                    onPress={() => {
                      setTaskType(t);
                      if (t !== 'project') { setProjectId(null); setMilestoneId(null); }
                      if (t !== 'contract') { setContractId(null); setContractSearch(''); setAgreementServiceId(null); }
                    }}
                  >
                    <Ionicons name={TASK_TYPE_ICONS[t]} size={13} color={taskType === t ? colors.primary : colors.gray500} />
                    <Text style={[s.selectorChipText, { color: taskType === t ? colors.primary : colors.gray500 }]}>
                      {TASK_TYPE_LABELS[t]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {taskType === 'project' && (
            <>
              <FieldLabel icon="folder-open-outline" text="Project" required colors={colors} s={s} />
              <TouchableOpacity style={s.pickerRow} onPress={() => setProjectModal(true)}>
                <Ionicons name="folder-open-outline" size={16} color={colors.gray400} />
                <Text style={projectId ? s.pickerValue : s.pickerPlaceholder}>
                  {projectId ? (projects.find((p) => p.id === projectId)?.name ?? 'Selected') : 'Tap to select a project'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.gray400} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>

              {projectId && (
                <>
                  <FieldLabel icon="flag-outline" text="Milestone" required colors={colors} s={s} />
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

          {taskType === 'contract' && (
            <>
              <FieldLabel icon="document-text-outline" text="Agreement" colors={colors} s={s} />
              <TouchableOpacity
                style={[s.pickerRow, lockContractType && { opacity: 0.6 }]}
                onPress={() => { if (!lockContractType) setContractModal(true); }}
                disabled={lockContractType}
              >
                <Ionicons name="document-text-outline" size={16} color={colors.gray400} />
                <Text style={contractId ? s.pickerValue : s.pickerPlaceholder}>
                  {contractId ? (contracts.find((c) => c.id === contractId)?.agreement_name ?? contracts.find((c) => c.id === contractId)?.title ?? contracts.find((c) => c.id === contractId)?.agreement_number ?? 'Selected') : 'Tap to select an agreement'}
                </Text>
                {!lockContractType && <Ionicons name="chevron-forward" size={16} color={colors.gray400} style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>

              {contractId && (
                <>
                  <FieldLabel icon="construct-outline" text="Service" colors={colors} s={s} />
                  <TouchableOpacity
                    style={[s.pickerRow, lockContractType && !!presetAgreementServiceId && { opacity: 0.6 }]}
                    onPress={() => { if (!(lockContractType && presetAgreementServiceId)) setServiceModal(true); }}
                    disabled={lockContractType && !!presetAgreementServiceId}
                  >
                    <Ionicons name="construct-outline" size={16} color={colors.gray400} />
                    <Text style={agreementServiceId ? s.pickerValue : s.pickerPlaceholder}>
                      {agreementServiceId
                        ? (agreementServices.find((x) => x.id === agreementServiceId)?.service_name ?? 'Selected')
                        : (agreementServices.length === 0 ? 'No services on this agreement' : 'Tap to select a service')}
                    </Text>
                    {!(lockContractType && presetAgreementServiceId) && <Ionicons name="chevron-forward" size={16} color={colors.gray400} style={{ marginLeft: 'auto' }} />}
                  </TouchableOpacity>
                </>
              )}
            </>
          )}

          {/* Role */}
          <FieldLabel icon="id-card-outline" text="Role" colors={colors} s={s} />
          {!assigneeId ? (
            <Text style={s.helpText}>Select an assignee first.</Text>
          ) : (
            <View style={s.chipRow}>
              <TouchableOpacity
                style={[s.selectorChip, { backgroundColor: !roleId ? colors.primaryLight : colors.surface, borderColor: !roleId ? colors.primary : colors.border }]}
                onPress={() => { setRoleId(null); setAreaId(null); }}
              >
                <Text style={[s.selectorChipText, { color: !roleId ? colors.primary : colors.gray500 }]}>None</Text>
              </TouchableOpacity>
              {rolesForUser.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={[s.selectorChip, { backgroundColor: roleId === r.id ? colors.primaryLight : colors.surface, borderColor: roleId === r.id ? colors.primary : colors.border }]}
                  onPress={() => { setRoleId(r.id); setAreaId(null); }}
                >
                  <Text style={[s.selectorChipText, { color: roleId === r.id ? colors.primary : colors.gray500 }]}>{r.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Area */}
          <FieldLabel icon="apps-outline" text="Area" colors={colors} s={s} />
          {!roleId ? (
            <Text style={s.helpText}>Select a role first, or leave as None for general work.</Text>
          ) : areasForRole.length === 0 ? (
            <Text style={s.helpText}>No areas for this role.</Text>
          ) : (
            <View style={s.chipRow}>
              <TouchableOpacity
                style={[s.selectorChip, { backgroundColor: !areaId ? colors.primaryLight : colors.surface, borderColor: !areaId ? colors.primary : colors.border }]}
                onPress={() => setAreaId(null)}
              >
                <Text style={[s.selectorChipText, { color: !areaId ? colors.primary : colors.gray500 }]}>None</Text>
              </TouchableOpacity>
              {areasForRole.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  style={[s.selectorChip, { backgroundColor: areaId === a.id ? colors.primaryLight : colors.surface, borderColor: areaId === a.id ? colors.primary : colors.border }]}
                  onPress={() => setAreaId(a.id)}
                >
                  <Text style={[s.selectorChipText, { color: areaId === a.id ? colors.primary : colors.gray500 }]}>{a.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Routine Activity */}
          {routines.length > 0 && (
            <>
              <FieldLabel icon="repeat-outline" text="Routine Activity" colors={colors} s={s} />
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
                    <Avatar name={name} photoUrl={m.photo_url} size={28} />
                    <Text style={[s.modalOptionText, isActive && { color: colors.primary, fontWeight: '700' }]} numberOfLines={1}>{name}</Text>
                    {isActive && <Ionicons name="checkmark" size={18} color={colors.primary} style={{ marginLeft: 'auto' }} />}
                  </TouchableOpacity>
                );
              }}
            />
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

      {/* Agreement Picker Modal */}
      <Modal visible={contractModal} transparent animationType="slide" onRequestClose={() => setContractModal(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setContractModal(false)}>
          {/* The search input below needs the sheet lifted above the keyboard —
              a plain View here left it pinned to the bottom, so the keyboard
              covered the input and the results (Modal content sits outside the
              screen's own KeyboardAvoidingView, so that one doesn't reach it). */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
            <View style={[s.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={s.modalHandle} />
              <Text style={s.modalTitle}>Select Agreement</Text>
              <TextInput
                style={[s.searchInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.gray50 }]}
                placeholder="Search agreements..."
                placeholderTextColor={colors.gray400}
                value={contractSearch}
                onChangeText={setContractSearch}
              />
              <ScrollView keyboardShouldPersistTaps="handled">
                {contracts
                  .filter((c) => !contractSearch || (c.title ?? c.agreement_number ?? '').toLowerCase().includes(contractSearch.toLowerCase()))
                  .map((c) => {
                    const isActive = contractId === c.id;
                    const label = c.title || c.agreement_number || `Agreement #${c.id}`;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[s.modalOption, isActive && s.modalOptionActive]}
                        onPress={() => { if (c.id !== contractId) setAgreementServiceId(null); setContractId(c.id); setContractModal(false); }}
                      >
                        <Ionicons name="document-text-outline" size={18} color={colors.gray400} />
                        <Text style={[s.modalOptionText, isActive && { color: colors.primary, fontWeight: '700' }]}>{label}</Text>
                        {isActive && <Ionicons name="checkmark" size={18} color={colors.primary} style={{ marginLeft: 'auto' }} />}
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      {/* Service Picker Modal */}
      <Modal visible={serviceModal} transparent animationType="slide" onRequestClose={() => setServiceModal(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setServiceModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
            <View style={[s.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={s.modalHandle} />
              <Text style={s.modalTitle}>Select Service</Text>
              <TextInput
                style={[s.searchInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.gray50 }]}
                placeholder="Search services..."
                placeholderTextColor={colors.gray400}
                value={serviceSearch}
                onChangeText={setServiceSearch}
              />
              <ScrollView keyboardShouldPersistTaps="handled">
                {agreementServices.length === 0 && (
                  <Text style={{ padding: 14, fontSize: 13, color: colors.textMuted }}>No services on this agreement</Text>
                )}
                {agreementServices
                  .filter((x) => !serviceSearch || (x.service_name ?? '').toLowerCase().includes(serviceSearch.toLowerCase()))
                  .map((x) => {
                    const isActive = agreementServiceId === x.id;
                    return (
                      <TouchableOpacity
                        key={x.id}
                        style={[s.modalOption, isActive && s.modalOptionActive]}
                        onPress={() => selectService(x)}
                      >
                        <Ionicons name="construct-outline" size={18} color={colors.gray400} />
                        <Text style={[s.modalOptionText, isActive && { color: colors.primary, fontWeight: '700' }]}>{x.service_name ?? `Service #${x.id}`}</Text>
                        {isActive && <Ionicons name="checkmark" size={18} color={colors.primary} style={{ marginLeft: 'auto' }} />}
                      </TouchableOpacity>
                    );
                  })}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
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
    fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 4 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: c.gray700 },
    charCount: { fontSize: 11, color: c.gray400, textAlign: 'right', marginTop: -10, marginBottom: 12 },
    descAttachBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginBottom: 12,
      backgroundColor: c.primaryLight,
    },
    descAttachBtnText: { fontSize: 12, fontWeight: '600', color: c.primary },
    checklistDraftRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6,
    },
    checklistDraftTxt: { flex: 1, fontSize: 13, color: c.textPrimary },
    checklistAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, marginBottom: 8 },
    checklistInput: {
      flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: c.textPrimary,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20, alignItems: 'center' },
    selectorChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5,
    },
    selectorChipText: { fontSize: 13, fontWeight: '500' },
    suggestionText: { fontSize: 11, color: c.gray500, marginTop: -12, marginBottom: 16 },
    suggestionLink: { fontWeight: '700', color: c.primary, textDecorationLine: 'underline' },
    pickerRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.gray50, borderRadius: 10, padding: 12,
      borderWidth: 1, borderColor: c.border, marginBottom: 6,
    },
    pickerValue: { fontSize: 14, color: c.textPrimary, fontWeight: '500', flex: 1 },
    pickerPlaceholder: { fontSize: 14, color: c.gray400, flex: 1 },
    helpText: { fontSize: 11, color: c.gray400, marginBottom: 16, marginTop: -2 },
    customEstBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    customEstInput: {
      width: 64, borderWidth: 1.5, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 6, fontSize: 13,
    },
    unitText: { fontSize: 12, color: c.gray500 },
    searchInput: {
      borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9,
      fontSize: 14, marginBottom: 10,
    },
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
    modalOptionText: { fontSize: 15, color: c.textPrimary, flex: 1 },
    areaRoleText: { fontSize: 11, color: c.gray400, marginTop: 1 },
  });
}
