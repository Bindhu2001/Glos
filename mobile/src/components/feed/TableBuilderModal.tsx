import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  onInsert: (rows: string[][], hasHeaderRow: boolean) => void;
  initialRows?: string[][];
  title?: string;
  hint?: string;
  insertLabel?: string;
}

function emptyGrid(rowCount: number, colCount: number, prev: string[][]): string[][] {
  return Array.from({ length: rowCount }, (_, r) =>
    Array.from({ length: colCount }, (_, c) => prev[r]?.[c] ?? '')
  );
}

export default function TableBuilderModal({ visible, onClose, onInsert, initialRows, title: titleProp, hint, insertLabel }: Props) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const insets = useSafeAreaInsets();

  const initR = initialRows?.length ?? 3;
  const initC = initialRows?.[0]?.length ?? 3;
  const [rowCount, setRowCount] = useState(initR);
  const [colCount, setColCount] = useState(initC);
  const [hasHeaderRow, setHasHeaderRow] = useState(true);
  const [grid, setGrid] = useState<string[][]>(() => emptyGrid(initR, initC, initialRows ?? []));

  // Re-seed the grid whenever the modal is (re)opened with a fresh pasted table.
  useEffect(() => {
    if (!visible) return;
    const r = initialRows?.length ?? 3;
    const c = initialRows?.[0]?.length ?? 3;
    setRowCount(r);
    setColCount(c);
    setGrid(emptyGrid(r, c, initialRows ?? []));
    setHasHeaderRow(true);
  }, [visible, initialRows]);

  const resize = (nextRows: number, nextCols: number) => {
    const r = Math.max(1, Math.min(10, nextRows));
    const c = Math.max(1, Math.min(8, nextCols));
    setGrid((prev) => emptyGrid(r, c, prev));
    setRowCount(r);
    setColCount(c);
  };

  const setCell = (r: number, c: number, value: string) => {
    setGrid((prev) => prev.map((row, ri) => ri === r ? row.map((cell, ci) => ci === c ? value : cell) : row));
  };

  const reset = () => {
    setRowCount(3);
    setColCount(3);
    setHasHeaderRow(true);
    setGrid(emptyGrid(3, 3, []));
  };

  const title = titleProp ?? (initialRows ? 'Confirm Pasted Table' : 'Add Table');
  const hintText = hint ?? (initialRows && !titleProp ? 'We detected a pasted table — review it, then insert.' : null);

  const handleInsert = () => {
    onInsert(grid, hasHeaderRow);
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* KeyboardAvoidingView so the grid cell inputs aren't covered by the
          keyboard — Modal content sits outside the screen's own keyboard
          handling (separate native root). */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.overlay}>
        <View style={[s.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={s.header}>
            <Text style={s.title}>{title}</Text>
            <TouchableOpacity onPress={() => { reset(); onClose(); }} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          {!!hintText && (
            <Text style={s.pasteHint}>{hintText}</Text>
          )}

          <View style={s.sizeRow}>
            <View style={s.stepper}>
              <Text style={s.stepperLabel}>Rows</Text>
              <TouchableOpacity style={s.stepBtn} onPress={() => resize(rowCount - 1, colCount)}>
                <Ionicons name="remove" size={16} color={colors.primary} />
              </TouchableOpacity>
              <Text style={s.stepperVal}>{rowCount}</Text>
              <TouchableOpacity style={s.stepBtn} onPress={() => resize(rowCount + 1, colCount)}>
                <Ionicons name="add" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <View style={s.stepper}>
              <Text style={s.stepperLabel}>Columns</Text>
              <TouchableOpacity style={s.stepBtn} onPress={() => resize(rowCount, colCount - 1)}>
                <Ionicons name="remove" size={16} color={colors.primary} />
              </TouchableOpacity>
              <Text style={s.stepperVal}>{colCount}</Text>
              <TouchableOpacity style={s.stepBtn} onPress={() => resize(rowCount, colCount + 1)}>
                <Ionicons name="add" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={s.headerToggleRow}>
            <Text style={s.headerToggleLabel}>First row is a header</Text>
            <Switch value={hasHeaderRow} onValueChange={setHasHeaderRow} trackColor={{ true: colors.primary }} />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.gridScroll}>
            <View>
              {grid.map((row, ri) => (
                <View key={ri} style={s.gridRow}>
                  {row.map((cell, ci) => (
                    <TextInput
                      key={ci}
                      style={[s.cellInput, ri === 0 && hasHeaderRow && s.cellInputHeader]}
                      value={cell}
                      onChangeText={(v) => setCell(ri, ci, v)}
                      placeholder={ri === 0 && hasHeaderRow ? `Header ${ci + 1}` : ''}
                      placeholderTextColor={colors.gray400}
                    />
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>

          <TouchableOpacity style={s.insertBtn} onPress={handleInsert}>
            <Text style={s.insertBtnText}>{insertLabel ?? 'Insert Table'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    title: { fontSize: 17, fontWeight: '800', color: c.textPrimary },
    pasteHint: { fontSize: 12, color: c.textSecondary, marginBottom: 12 },
    sizeRow: { flexDirection: 'row', gap: 20, marginBottom: 14 },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    stepperLabel: { fontSize: 12, color: c.textSecondary, marginRight: 2 },
    stepBtn: {
      width: 28, height: 28, borderRadius: 8, backgroundColor: c.primaryLight,
      alignItems: 'center', justifyContent: 'center',
    },
    stepperVal: { fontSize: 14, fontWeight: '700', color: c.textPrimary, minWidth: 18, textAlign: 'center' },
    headerToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    headerToggleLabel: { fontSize: 13, color: c.textSecondary },
    gridScroll: { marginBottom: 16 },
    gridRow: { flexDirection: 'row' },
    cellInput: {
      width: 110, borderWidth: 1, borderColor: c.border, padding: 8, fontSize: 13,
      color: c.textPrimary, backgroundColor: c.background,
    },
    cellInputHeader: { backgroundColor: c.primaryLight, fontWeight: '700' },
    insertBtn: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    insertBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  });
}
