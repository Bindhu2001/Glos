import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
  icon?: keyof typeof Ionicons.glyphMap;
}

export interface AlertHandle {
  show: (title: string, message?: string, buttons?: AlertButton[]) => void;
}

export const alertRef = React.createRef<AlertHandle>();

export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  alertRef.current?.show(title, message, buttons);
}

const AlertModal = forwardRef<AlertHandle>((_, ref) => {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [buttons, setButtons] = useState<AlertButton[]>([{ text: 'OK' }]);

  useImperativeHandle(ref, () => ({
    show: (t, m, btns) => {
      setTitle(t);
      setMessage(m ?? '');
      setButtons(btns?.length ? btns : [{ text: 'OK' }]);
      setVisible(true);
    },
  }));

  const handleButton = (btn: AlertButton) => {
    setVisible(false);
    btn.onPress?.();
  };

  // Use action-sheet vertical layout when 3+ buttons or when any button has an icon
  const useSheet = buttons.length >= 3 || buttons.some(b => b.icon);

  if (useSheet) {
    const cancelBtn = buttons.find(b => b.style === 'cancel');
    const actionBtns = buttons.filter(b => b.style !== 'cancel');

    return (
      <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setVisible(false)}>
        <TouchableOpacity style={s.sheetOverlay} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={s.sheetWrap}>
            <View style={s.sheetContainer}>
              <View style={s.sheetHeader}>
                <Text style={s.sheetTitle}>{title}</Text>
                {!!message && <Text style={s.sheetMsg}>{message}</Text>}
              </View>
              {actionBtns.map((btn, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <View style={s.separator} />}
                  <TouchableOpacity
                    style={s.sheetBtn}
                    onPress={() => handleButton(btn)}
                    activeOpacity={0.7}
                  >
                    {btn.icon && (
                      <View style={[
                        s.sheetIconWrap,
                        btn.style === 'destructive' && s.sheetIconWrapDanger,
                      ]}>
                        <Ionicons
                          name={btn.icon}
                          size={18}
                          color={btn.style === 'destructive' ? '#ef4444' : colors.primary}
                        />
                      </View>
                    )}
                    <Text style={[
                      s.sheetBtnText,
                      btn.style === 'destructive' && s.sheetBtnTextDanger,
                    ]}>
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                </React.Fragment>
              ))}
            </View>

            {cancelBtn && (
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => handleButton(cancelBtn)}
                activeOpacity={0.7}
              >
                <Text style={s.cancelBtnText}>{cancelBtn.text}</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setVisible(false)}>
      <View style={s.overlay}>
        <View style={s.container}>
          <Text style={s.title}>{title}</Text>
          {!!message && <Text style={s.message}>{message}</Text>}
          <View style={[s.btnsRow, buttons.length === 1 && s.btnsCenter]}>
            {buttons.map((btn, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  s.btn,
                  buttons.length > 1 && s.btnFlex,
                  btn.style === 'destructive' && s.btnDestructive,
                  btn.style === 'cancel' && s.btnCancel,
                ]}
                onPress={() => handleButton(btn)}
                activeOpacity={0.8}
              >
                <Text style={[
                  s.btnText,
                  btn.style === 'destructive' && s.btnTextDestructive,
                  btn.style === 'cancel' && s.btnTextCancel,
                ]}>
                  {btn.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
});

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    },
    // ── Dialog (2-button confirm style) ──────────────────────────────────────
    container: {
      backgroundColor: c.surface, borderRadius: 18, padding: 22,
      width: '100%', maxWidth: 340,
      shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.18, shadowRadius: 20, elevation: 12,
      borderWidth: 1, borderColor: c.border,
    },
    title: { fontSize: 17, fontWeight: '700', color: c.textPrimary, marginBottom: 4 },
    message: { fontSize: 14, color: c.textSecondary, lineHeight: 20, marginTop: 4, marginBottom: 2 },
    btnsRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
    btnsCenter: { justifyContent: 'center' },
    btn: {
      paddingVertical: 11, paddingHorizontal: 20, borderRadius: 10,
      backgroundColor: c.primary, alignItems: 'center', minWidth: 90,
    },
    btnFlex: { flex: 1 },
    btnDestructive: { backgroundColor: c.danger },
    btnCancel: { backgroundColor: c.gray100, borderWidth: 1, borderColor: c.border },
    btnText: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
    btnTextDestructive: { color: '#ffffff' },
    btnTextCancel: { color: c.textPrimary },
    // ── Action sheet style ────────────────────────────────────────────────────
    sheetOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    sheetWrap: {
      padding: 12, paddingBottom: 28,
    },
    sheetContainer: {
      backgroundColor: c.surface, borderRadius: 16,
      overflow: 'hidden',
      shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.12, shadowRadius: 16, elevation: 12,
    },
    sheetHeader: {
      paddingVertical: 14, paddingHorizontal: 20,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    sheetTitle: { fontSize: 13, fontWeight: '600', color: c.textSecondary, textAlign: 'center' },
    sheetMsg: { fontSize: 12, color: c.gray400, textAlign: 'center', marginTop: 2 },
    separator: { height: 1, backgroundColor: c.border, marginHorizontal: 16 },
    sheetBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      paddingVertical: 16, paddingHorizontal: 20,
    },
    sheetIconWrap: {
      width: 36, height: 36, borderRadius: 10,
      backgroundColor: c.primaryLight,
      alignItems: 'center', justifyContent: 'center',
    },
    sheetIconWrapDanger: { backgroundColor: '#fef2f2' },
    sheetBtnText: { fontSize: 15, fontWeight: '500', color: c.textPrimary },
    sheetBtnTextDanger: { color: '#ef4444', fontWeight: '600' },
    cancelBtn: {
      backgroundColor: c.surface, borderRadius: 14, marginTop: 8,
      paddingVertical: 16, alignItems: 'center',
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06, shadowRadius: 4, elevation: 4,
    },
    cancelBtnText: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
  });
}

export default AlertModal;
