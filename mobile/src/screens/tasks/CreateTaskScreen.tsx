import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { showAlert } from '../../components/common/AlertModal';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApi } from '../../hooks/useApi';
import { StatusColors, PriorityColors, AppColors } from '../../utils/colors';
import { useTheme } from '../../contexts/ThemeContext';
import { TasksStackParamList } from '../../navigation/types';
import ScreenHeader from '../../components/common/ScreenHeader';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import DatePickerField from '../../components/common/DatePickerField';

type Route = RouteProp<TasksStackParamList, 'CreateTask'>;

const STATUSES = ['open', 'in_progress', 'blocked', 'done', 'cancelled'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

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
  const [status, setStatus] = useState('open');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) {
      showAlert('Validation', 'Task title is required.');
      return;
    }
    if (!dueDate.trim()) {
      showAlert('Validation', 'Please select a deadline.');
      return;
    }
    setSaving(true);
    try {
      await api.tasks.create(appId, {
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        due_on: dueDate.trim(),
      });
      navigation.goBack();
    } catch {
      showAlert('Error', 'Could not create task.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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

          <Text style={s.fieldLabel}>Status</Text>
          <View style={s.chipRow}>
            {STATUSES.map((st) => {
              const c = StatusColors[st];
              return (
                <TouchableOpacity
                  key={st}
                  style={[s.selectorChip, { backgroundColor: status === st ? c.bg : colors.surface, borderColor: status === st ? c.text : colors.border }]}
                  onPress={() => setStatus(st)}
                >
                  <Text style={[s.selectorChipText, { color: status === st ? c.text : colors.gray500 }]}>
                    {st.replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

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
                    {p}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <DatePickerField label="Deadline *" value={dueDate} onChange={setDueDate} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 16, paddingBottom: 40 },
    saveBtn: { paddingVertical: 8, paddingHorizontal: 16 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: c.gray700, marginBottom: 8 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
    selectorChip: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
      borderWidth: 1.5,
    },
    selectorChipText: { fontSize: 13, fontWeight: '500', textTransform: 'capitalize' },
  });
}
