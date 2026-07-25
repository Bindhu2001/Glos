import React, { useMemo, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, FlatList, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import Avatar from './Avatar';

export interface PickOption { id: number; name: string; sub?: string; photoUrl?: string | null }

interface Props {
  visible: boolean;
  title: string;
  options: PickOption[];
  multi?: boolean;
  selected: number[];
  onChange: (ids: number[]) => void;
  onClose: () => void;
  allowClear?: boolean;
}

export default function MemberPickerModal({ visible, title, options, multi = false, selected, onChange, onClose, allowClear = true }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');

  const filtered = options.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()));

  const toggle = (id: number) => {
    if (multi) {
      onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    } else {
      onChange([id]);
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]} onStartShouldSetResponder={() => true}>
          <View style={s.handle} />
          <View style={s.headRow}>
            <Text style={s.title}>{title}</Text>
            {multi && (
              <TouchableOpacity onPress={onClose}>
                <Text style={s.doneTxt}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
          <TextInput
            style={s.search}
            placeholder="Search..."
            placeholderTextColor={colors.gray400}
            value={search}
            onChangeText={setSearch}
          />
          {allowClear && !multi && (
            <TouchableOpacity style={s.option} onPress={() => { onChange([]); onClose(); }}>
              <Ionicons name="close-circle-outline" size={18} color={colors.gray400} />
              <Text style={[s.optionText, { color: colors.gray500 }]}>None</Text>
            </TouchableOpacity>
          )}
          <FlatList
            data={filtered}
            keyExtractor={(o) => String(o.id)}
            style={{ maxHeight: 360 }}
            renderItem={({ item }) => {
              const isActive = selected.includes(item.id);
              return (
                <TouchableOpacity style={[s.option, isActive && s.optionActive]} onPress={() => toggle(item.id)}>
                  <Avatar name={item.name} photoUrl={item.photoUrl} size={28} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.optionText, isActive && { color: colors.primary, fontWeight: '700' }]}>{item.name}</Text>
                    {item.sub ? <Text style={s.optionSub}>{item.sub}</Text> : null}
                  </View>
                  {isActive && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingTop: 12, maxHeight: '85%' },
    handle: { width: 40, height: 4, backgroundColor: c.gray200, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    title: { fontSize: 16, fontWeight: '700', color: c.textPrimary },
    doneTxt: { fontSize: 14, fontWeight: '700', color: c.primary },
    search: {
      backgroundColor: c.gray50, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: c.textPrimary, marginBottom: 8,
    },
    option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 10 },
    optionActive: { backgroundColor: c.primaryLight },
    optionText: { fontSize: 14, color: c.textPrimary },
    optionSub: { fontSize: 11, color: c.textMuted, marginTop: 1 },
  });
}
