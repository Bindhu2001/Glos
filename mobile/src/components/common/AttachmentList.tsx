import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import {
  Attachment, isImageAttachment, isVideoAttachment, isAudioAttachment, downloadAttachment,
} from '../../utils/attachments';
import AttachmentViewerModal from './AttachmentViewerModal';

// Renders already-uploaded attachments — matches qa-production web's
// AttachmentDisplay: images/video/audio play inline, everything else is a
// filename pill, and tapping opens an in-app viewer (AttachmentViewerModal)
// instead of handing off to an external app/browser. Downloading (saving to
// Photos/Files) is a separate, explicit action — the download icon, or
// long-press on images/pills.
export default function AttachmentList({
  attachments, onDelete, canDelete, imageMaxWidth = 200, imageMaxHeight = 150,
}: {
  attachments: Attachment[];
  onDelete?: (attachment: Attachment) => void;
  // Per-attachment gate for the delete button — defaults to "show whenever
  // onDelete is passed" if omitted. Needed wherever permission depends on
  // who uploaded a specific file (e.g. uploader-or-admin), not the list as a whole.
  canDelete?: (attachment: Attachment) => boolean;
  imageMaxWidth?: number;
  imageMaxHeight?: number;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [viewerAttachment, setViewerAttachment] = useState<Attachment | null>(null);

  if (!attachments || attachments.length === 0) return null;

  const handleDownload = async (a: Attachment) => {
    if (downloadingId != null) return;
    setDownloadingId(a.id);
    try {
      await downloadAttachment(a);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <View style={s.wrap}>
      <AttachmentViewerModal attachment={viewerAttachment} onClose={() => setViewerAttachment(null)} />
      {attachments.map((a) => {
        const showDelete = !!onDelete && (canDelete ? canDelete(a) : true);
        const downloading = downloadingId === a.id;

        if (isImageAttachment(a)) {
          return (
            <View key={a.id} style={s.imageItem}>
              <TouchableOpacity activeOpacity={0.85} onPress={() => setViewerAttachment(a)} onLongPress={() => handleDownload(a)}>
                <Image
                  source={{ uri: a.file_url }}
                  style={{ width: imageMaxWidth, height: imageMaxHeight, borderRadius: 10 }}
                  resizeMode="cover"
                />
                {downloading && (
                  <View style={[s.imageDownloadOverlay, { width: imageMaxWidth, height: imageMaxHeight }]}>
                    <ActivityIndicator color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
              {!downloading && (
                <TouchableOpacity style={s.imageDownloadBtn} onPress={() => handleDownload(a)} hitSlop={8}>
                  <Ionicons name="download-outline" size={13} color="#fff" />
                </TouchableOpacity>
              )}
              {showDelete && (
                <TouchableOpacity style={s.imageDeleteBtn} onPress={() => onDelete!(a)} hitSlop={8}>
                  <Ionicons name="close" size={13} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          );
        }

        if (isVideoAttachment(a)) {
          return (
            <InlineVideo
              key={a.id}
              attachment={a}
              width={imageMaxWidth}
              height={imageMaxHeight}
              downloading={downloading}
              onExpand={() => setViewerAttachment(a)}
              onDownload={() => handleDownload(a)}
              onDelete={showDelete ? () => onDelete!(a) : undefined}
              s={s}
            />
          );
        }

        if (isAudioAttachment(a)) {
          return (
            <InlineAudio
              key={a.id}
              attachment={a}
              maxWidth={imageMaxWidth}
              downloading={downloading}
              onDownload={() => handleDownload(a)}
              onDelete={showDelete ? () => onDelete!(a) : undefined}
              colors={colors}
              s={s}
            />
          );
        }

        return (
          <TouchableOpacity
            key={a.id}
            activeOpacity={0.8}
            onPress={() => setViewerAttachment(a)}
            onLongPress={() => handleDownload(a)}
            style={s.filePill}
          >
            <Ionicons name="document-text-outline" size={15} color={colors.primary} />
            <Text style={s.fileName} numberOfLines={1}>{a.file_name}</Text>
            {downloading ? (
              <ActivityIndicator size="small" color={colors.primary} style={s.filePillDeleteBtn} />
            ) : (
              <TouchableOpacity onPress={() => handleDownload(a)} hitSlop={8} style={s.filePillDeleteBtn}>
                <Ionicons name="download-outline" size={15} color={colors.primary} />
              </TouchableOpacity>
            )}
            {showDelete && (
              <TouchableOpacity onPress={() => onDelete!(a)} hitSlop={8} style={s.filePillDeleteBtn}>
                <Ionicons name="close-circle" size={15} color={colors.gray400} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Compact inline video player, matching web's inline <video controls>. A
// small expand icon opens the full-screen viewer (VideoView's own native
// controls already handle play/pause/scrub at this size).
function InlineVideo({
  attachment: a, width, height, downloading, onExpand, onDownload, onDelete, s,
}: {
  attachment: Attachment; width: number; height: number; downloading: boolean;
  onExpand: () => void; onDownload: () => void; onDelete?: () => void; s: ReturnType<typeof makeStyles>;
}) {
  const player = useVideoPlayer(a.file_url);
  return (
    <View style={s.imageItem}>
      <VideoView player={player} style={{ width, height, borderRadius: 10 }} nativeControls contentFit="cover" />
      <TouchableOpacity style={s.imageExpandBtn} onPress={onExpand} hitSlop={8}>
        <Ionicons name="expand-outline" size={13} color="#fff" />
      </TouchableOpacity>
      {downloading ? (
        <View style={s.imageDownloadBtn}><ActivityIndicator size="small" color="#fff" /></View>
      ) : (
        <TouchableOpacity style={s.imageDownloadBtn} onPress={onDownload} hitSlop={8}>
          <Ionicons name="download-outline" size={13} color="#fff" />
        </TouchableOpacity>
      )}
      {onDelete && (
        <TouchableOpacity style={s.imageDeleteBtn} onPress={onDelete} hitSlop={8}>
          <Ionicons name="close" size={13} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// Compact inline audio row, matching web's inline <audio controls> — no
// bigger view to expand to, so this doesn't open the full-screen viewer.
// Capped at the caller's imageMaxWidth (not a fixed width of its own) so it
// doesn't overflow narrower contexts — a hardcoded width here previously
// could exceed a chat bubble's maxWidth (74% of screen) on narrow phones.
function InlineAudio({
  attachment: a, maxWidth, downloading, onDownload, onDelete, colors, s,
}: {
  attachment: Attachment; maxWidth: number; downloading: boolean; onDownload: () => void; onDelete?: () => void;
  colors: AppColors; s: ReturnType<typeof makeStyles>;
}) {
  const player = useAudioPlayer(a.file_url);
  const status = useAudioPlayerStatus(player);
  const fmt = (secs: number) => {
    const total = Math.max(0, Math.floor(secs || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  };

  return (
    <View style={[s.audioRow, { width: maxWidth }]}>
      <TouchableOpacity onPress={() => (status.playing ? player.pause() : player.play())} style={s.audioPlayBtn}>
        <Ionicons name={status.playing ? 'pause' : 'play'} size={14} color="#fff" />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={s.fileName} numberOfLines={1}>{a.file_name}</Text>
        <Text style={s.audioTime}>{fmt(status.currentTime)} / {fmt(status.duration)}</Text>
      </View>
      {downloading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <TouchableOpacity onPress={onDownload} hitSlop={8}>
          <Ionicons name="download-outline" size={15} color={colors.primary} />
        </TouchableOpacity>
      )}
      {onDelete && (
        <TouchableOpacity onPress={onDelete} hitSlop={8}>
          <Ionicons name="close-circle" size={15} color={colors.gray400} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    imageItem: { position: 'relative' },
    imageDownloadOverlay: {
      position: 'absolute', top: 0, left: 0, borderRadius: 10,
      backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center',
    },
    imageDeleteBtn: {
      position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10,
      backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
    },
    imageDownloadBtn: {
      position: 'absolute', bottom: 6, right: 6, width: 22, height: 22, borderRadius: 11,
      backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
    },
    imageExpandBtn: {
      position: 'absolute', bottom: 6, left: 6, width: 22, height: 22, borderRadius: 11,
      backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
    },
    filePill: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border,
      borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, maxWidth: 220,
    },
    fileName: { fontSize: 12, color: c.textPrimary, flexShrink: 1 },
    filePillDeleteBtn: { marginLeft: 2 },
    audioRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border,
      borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
    },
    audioPlayBtn: {
      width: 28, height: 28, borderRadius: 14, backgroundColor: c.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    audioTime: { fontSize: 10, color: c.textMuted, marginTop: 1 },
  });
}
