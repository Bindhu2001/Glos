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
  value: string;
  onChange: (dateStr: string) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
}

function toDate(str: string): Date {
  const d = new Date(str);
  return isNaN(d.getTime()) ? new Date() : d;
}

function toStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function DatePickerField({ label, value, onChange, placeholder = 'Select date', minDate, maxDate }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [show, setShow] = useState(false);
  const selected = value ? toDate(value) : new Date();

  const handleChange = (_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setShow(false);
      if (date) onChange(toStr(date));
    } else {
      if (date) onChange(toStr(date));
    }
  };

  const display = value || '';

  if (Platform.OS === 'android') {
    return (
      <View style={s.container}>
        {label && <Text style={s.label}>{label}</Text>}
        <TouchableOpacity style={s.trigger} onPress={() => setShow(true)} activeOpacity={0.7}>
          <Text style={[s.triggerText, !value && s.placeholder]}>
            {display || placeholder}
          </Text>
          <Ionicons name="calendar-outline" size={18} color={colors.gray400} />
        </TouchableOpacity>
        {show && (
          <DateTimePicker
            value={selected}
            mode="date"
            display="default"
            onChange={handleChange}
            minimumDate={minDate}
            maximumDate={maxDate}
          />
        )}
      </View>
    );
  }

  return (
    <View style={s.container}>
      {label && <Text style={s.label}>{label}</Text>}
      <TouchableOpacity style={s.trigger} onPress={() => setShow(true)} activeOpacity={0.7}>
        <Text style={[s.triggerText, !value && s.placeholder]}>
          {display || placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={18} color={colors.gray400} />
      </TouchableOpacity>

      <Modal visible={show} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShow(false)}>
          <View style={s.overlay} />
        </TouchableWithoutFeedback>
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{label || 'Select Date'}</Text>
            <TouchableOpacity onPress={() => setShow(false)} style={s.doneBtn}>
              <Text style={s.doneTxt}>Done</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={selected}
            mode="date"
            display="spinner"
            onChange={handleChange}
            minimumDate={minDate}
            maximumDate={maxDate}
            style={s.picker}
          />
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { marginBottom: 16 },
    label: { fontSize: 13, fontWeight: '600', color: c.gray700, marginBottom: 6 },
    trigger: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.gray50, borderWidth: 1.5, borderColor: c.border,
      borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    },
    triggerText: { fontSize: 15, color: c.textPrimary },
    placeholder: { color: c.gray400 },
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
