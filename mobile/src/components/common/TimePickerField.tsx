import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, Platform,
  StyleSheet, TouchableWithoutFeedback,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';

interface Props {
  label?: string;
  value: string; // "HH:MM"
  onChange: (timeStr: string) => void;
}

function toDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

function toStr(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export default function TimePickerField({ label, value, onChange }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [show, setShow] = useState(false);
  const selected = toDate(value);

  const handleChange = (_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setShow(false);
      if (date) onChange(toStr(date));
    } else if (date) {
      onChange(toStr(date));
    }
  };

  if (Platform.OS === 'android') {
    return (
      <View style={s.container}>
        {label && <Text style={s.label}>{label}</Text>}
        <TouchableOpacity style={s.trigger} onPress={() => setShow(true)} activeOpacity={0.7}>
          <Ionicons name="time-outline" size={16} color={colors.gray400} />
          <Text style={s.triggerText}>{value}</Text>
        </TouchableOpacity>
        {show && (
          <DateTimePicker value={selected} mode="time" display="default" onChange={handleChange} is24Hour />
        )}
      </View>
    );
  }

  return (
    <View style={s.container}>
      {label && <Text style={s.label}>{label}</Text>}
      <TouchableOpacity style={s.trigger} onPress={() => setShow(true)} activeOpacity={0.7}>
        <Ionicons name="time-outline" size={16} color={colors.gray400} />
        <Text style={s.triggerText}>{value}</Text>
      </TouchableOpacity>

      <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
        <TouchableWithoutFeedback onPress={() => setShow(false)}>
          <View style={s.overlay} />
        </TouchableWithoutFeedback>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{label || 'Select Time'}</Text>
            <TouchableOpacity onPress={() => setShow(false)} style={s.doneBtn}>
              <Text style={s.doneTxt}>Done</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={selected}
            mode="time"
            display="spinner"
            onChange={handleChange}
            is24Hour
            style={s.picker}
          />
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: {},
    label: { fontSize: 11, fontWeight: '600', color: c.textMuted, marginBottom: 4 },
    trigger: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border,
      borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9,
    },
    triggerText: { fontSize: 13, fontWeight: '600', color: c.textPrimary },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingBottom: 30,
    },
    sheetHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    sheetTitle: { fontSize: 16, fontWeight: '700', color: c.textPrimary },
    doneBtn: { paddingHorizontal: 12, paddingVertical: 6 },
    doneTxt: { fontSize: 15, fontWeight: '700', color: c.primary },
    picker: { width: '100%' },
  });
}
