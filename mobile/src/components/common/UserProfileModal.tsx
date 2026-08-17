import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './Avatar';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';

export interface ProfileUser {
  id?: number | null;
  name: string;
  photoUrl?: string | null;
  email?: string | null;
  role?: string | null;
  department?: string | null;
}

interface Props {
  user: ProfileUser | null;
  onClose: () => void;
}

// Tap-any-avatar profile card: avatar on the left, name/role/department/email on
// the right. Role/department aren't always present on the object the caller
// already has in hand (e.g. a feed post author only carries name/photo/email),
// so when a user id is known we lazily fetch the role assignment to fill in
// what's missing rather than showing blank fields.
export default function UserProfileModal({ user, onClose }: Props) {
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const s = makeStyles(colors);

  const [role, setRole] = useState<string | null>(null);
  const [department, setDepartment] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState(false);

  useEffect(() => {
    setRole(user?.role ?? null);
    setDepartment(user?.department ?? null);
    if (!user?.id || !workspace?.id || (user.role && user.department)) return;
    setLoadingRole(true);
    api.roles.listAssignmentsForUser(workspace.id, user.id)
      .then((res: any) => {
        const items = res.data?.items ?? [];
        const first = items[0];
        if (first?.role?.title) setRole((r) => r ?? first.role.title);
        if (first?.role?.department_name) setDepartment((d) => d ?? first.role.department_name);
      })
      .catch(() => {})
      .finally(() => setLoadingRole(false));
  }, [user?.id, workspace?.id]);

  if (!user) return null;

  return (
    <Modal visible={!!user} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.card} onPress={(e) => e.stopPropagation()}>
          <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={s.row}>
            <Avatar name={user.name} photoUrl={user.photoUrl} size={64} />
            <View style={s.info}>
              <Text style={s.name} numberOfLines={2}>{user.name}</Text>
              {loadingRole ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 6, alignSelf: 'flex-start' }} />
              ) : (
                <>
                  {!!role && <Text style={s.line}>{role}</Text>}
                  {!!department && <Text style={s.line}>{department}</Text>}
                </>
              )}
              {!!user.email && <Text style={s.email} numberOfLines={1}>{user.email}</Text>}
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: {
      width: '100%', maxWidth: 360, backgroundColor: c.surface, borderRadius: 16,
      padding: 20, borderWidth: 1, borderColor: c.border,
    },
    closeBtn: { position: 'absolute', top: 10, right: 10, padding: 4, zIndex: 1 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    info: { flex: 1, minWidth: 0 },
    name: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    line: { fontSize: 13, color: c.textSecondary, marginTop: 3 },
    email: { fontSize: 12, color: c.textMuted, marginTop: 5 },
  });
}
