import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
  StyleProp, ViewStyle, Image, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import { PickedFile } from '../../utils/attachments';

// Pending-attachments row shown above a composer (chat input / comment box /
// post editor) before send — a chip per picked file with an X to remove it.
// No horizontal padding by default — callers already inside a padded
// container (a form's ScrollView) get correct alignment for free; callers
// with an unpadded container (a chat/comment input bar) should pass
// `containerStyle={{ paddingHorizontal: <matching value> }}`.
export default function AttachmentChips({
  files, onRemove, uploading, containerStyle,
}: {
  files: PickedFile[];
  onRemove: (index: number) => void;
  uploading?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  if (files.length === 0) return null;

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[s.row, containerStyle]} contentContainerStyle={{ gap: 8 }}>
        {files.map((f, i) => {
          // Excludes SVG — RN's <Image> can't rasterize SVG XML, so it'd
          // just render a broken thumbnail; see isImageAttachment in
          // utils/attachments.ts for the same exclusion on the uploaded side.
          const isImage = f.mimeType.startsWith('image/') && f.mimeType !== 'image/svg+xml';
          const isAudio = f.mimeType.startsWith('audio/');
          return (
            <View key={`${f.uri}-${i}`} style={s.chip}>
              <TouchableOpacity
                style={s.chipTouchable}
                activeOpacity={isImage ? 0.7 : 1}
                disabled={!isImage}
                onPress={() => setPreviewUri(f.uri)}
              >
                {isImage ? (
                  <Image source={{ uri: f.uri }} style={s.thumb} />
                ) : (
                  <Ionicons name={isAudio ? 'mic-outline' : 'document-attach-outline'} size={13} color={colors.primary} />
                )}
                {/* No numberOfLines/maxWidth cap — the row scrolls horizontally,
                    so there's no reason to truncate the name; a long file name
                    just makes its chip wider instead of hiding the tail of it. */}
                <Text style={s.chipText}>{f.name}</Text>
              </TouchableOpacity>
              {uploading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <TouchableOpacity onPress={() => onRemove(i)} hitSlop={6}>
                  <Ionicons name="close-circle" size={16} color={colors.gray400} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Full-size preview — works from the local picked-file URI, so it's
          available immediately, even while the file is still uploading. */}
      <Modal visible={!!previewUri} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
        <TouchableOpacity style={s.previewBackdrop} activeOpacity={1} onPress={() => setPreviewUri(null)}>
          {previewUri && (
            <Image source={{ uri: previewUri }} style={s.previewImage} resizeMode="contain" />
          )}
          <TouchableOpacity style={s.previewCloseBtn} onPress={() => setPreviewUri(null)} hitSlop={10}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    row: { flexGrow: 0, flexShrink: 0, paddingTop: 8 },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: c.primaryLight, borderRadius: 16,
      paddingHorizontal: 10, paddingVertical: 6,
    },
    chipTouchable: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    thumb: { width: 18, height: 18, borderRadius: 4 },
    chipText: { fontSize: 12, color: c.textPrimary },
    previewBackdrop: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.9)',
      alignItems: 'center', justifyContent: 'center',
    },
    previewImage: { width: '100%', height: '80%' },
    previewCloseBtn: {
      position: 'absolute', top: 50, right: 20,
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
    },
  });
}
