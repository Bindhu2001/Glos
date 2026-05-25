import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
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
      flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center', justifyContent: 'center', padding: 32,
    },
    container: {
      backgroundColor: c.surface, borderRadius: 18, padding: 22,
      width: '100%', maxWidth: 340,
      shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2, shadowRadius: 20, elevation: 12,
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
  });
}

export default AlertModal;
