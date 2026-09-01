import React, { useMemo } from 'react';
import {
  View, Text, Modal, Pressable, FlatList, StyleSheet,
  TouchableOpacity, StyleProp, TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../common/Avatar';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';

// A multi-recipient "to" line ("Alice, Bob & +3 more") used across the Feed —
// on appreciation/feedback cards, the post detail screen, and the
// Appreciate/Feedback tabs. Previously every one of those rendered the
// "& +N more" tail as dead plain text, so the other recipients were
// unreachable. `RecipientNamesInline` now makes that tail tappable and the
// host screen shows every name (with avatars) in `RecipientsModal`.

export interface Recipient {
  name: string;
  photoUrl?: string | null;
}

export function recipientName(u: any): string {
  if (!u) return 'Someone';
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Someone';
}

// Normalises the assorted shapes the feed API returns for a recipient list:
// a `to_users` array (current), a flat `to_user_name` string, or a single
// `to_user` object (older records).
export function toRecipients(
  toUsers: any[] | undefined | null,
  flatSingleName?: string | null,
  singleObj?: any,
): Recipient[] {
  if (Array.isArray(toUsers) && toUsers.length) {
    return toUsers
      .filter(Boolean)
      .map((u) => ({ name: recipientName(u), photoUrl: u.photo_url ?? null }));
  }
  if (flatSingleName) return [{ name: flatSingleName, photoUrl: singleObj?.photo_url ?? null }];
  if (singleObj) return [{ name: recipientName(singleObj), photoUrl: singleObj.photo_url ?? null }];
  return [];
}

interface InlineProps {
  recipients: Recipient[];
  textStyle?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
  onExpand: (recipients: Recipient[]) => void;
}

// Safe to place inside a parent <Text> — renders only <Text> nodes. The
// "+N more" tail is a nested pressable <Text> that asks the host to open
// <RecipientsModal>.
export function RecipientNamesInline({ recipients, textStyle, linkStyle, onExpand }: InlineProps) {
  if (recipients.length === 0) return <Text style={textStyle}>Someone</Text>;
  if (recipients.length === 1) return <Text style={textStyle}>{recipients[0].name}</Text>;
  if (recipients.length === 2) {
    return <Text style={textStyle}>{recipients[0].name} & {recipients[1].name}</Text>;
  }
  return (
    <Text style={textStyle}>
      {recipients[0].name}, {recipients[1].name} &{' '}
      <Text
        style={linkStyle}
        onPress={(e) => { e.stopPropagation?.(); onExpand(recipients); }}
        suppressHighlighting
      >
        +{recipients.length - 2} more
      </Text>
    </Text>
  );
}

interface ModalProps {
  recipients: Recipient[] | null;
  onClose: () => void;
}

export function RecipientsModal({ recipients, onClose }: ModalProps) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal visible={!!recipients} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.card} onPress={(e) => e.stopPropagation()}>
          <View style={s.head}>
            <Text style={s.title}>
              Recipients{recipients ? ` (${recipients.length})` : ''}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={recipients ?? []}
            keyExtractor={(r, i) => `${r.name}-${i}`}
            style={{ maxHeight: 320 }}
            renderItem={({ item }) => (
              <View style={s.row}>
                <Avatar name={item.name} photoUrl={item.photoUrl} size={30} />
                <Text style={s.rowText}>{item.name}</Text>
              </View>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    },
    card: {
      width: '100%', maxWidth: 360, backgroundColor: c.surface, borderRadius: 16,
      padding: 18, borderWidth: 1, borderColor: c.border,
    },
    head: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', marginBottom: 12,
    },
    title: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    rowText: { fontSize: 13, fontWeight: '600', color: c.textPrimary },
  });
}
