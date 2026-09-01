import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Image, ScrollView,
  ActivityIndicator, Platform, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as XLSX from 'xlsx';
import {
  Attachment, downloadAttachment, isImageAttachment, isVideoAttachment, isAudioAttachment,
  isPdfAttachment, isExcelAttachment, isTextPreviewAttachment,
} from '../../utils/attachments';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Matches qa-production web's AttachmentModal: tapping an attachment opens an
// in-app viewer instead of handing off to an external app/browser. Excel is
// parsed client-side with the same `xlsx` library web uses; PDF goes through
// Google's public viewer since — unlike a desktop browser's <iframe> — mobile
// WebViews (Android especially) have no built-in PDF renderer to fall back on.
export default function AttachmentViewerModal({ attachment, onClose }: { attachment: Attachment | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [downloading, setDownloading] = useState(false);

  if (!attachment) return null;
  const a = attachment;

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadAttachment(a);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[s.overlay, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <Text style={s.headerName} numberOfLines={1}>{a.file_name}</Text>
          <TouchableOpacity onPress={handleDownload} disabled={downloading} hitSlop={8} style={s.headerBtn}>
            {downloading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="download-outline" size={20} color="#fff" />}
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} hitSlop={8} style={s.headerBtn}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={s.content}>
          <ViewerContent attachment={a} />
        </View>
      </View>
    </Modal>
  );
}

function ViewerContent({ attachment: a }: { attachment: Attachment }) {
  if (isImageAttachment(a)) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.zoomContent}
        // Pinch-zoom on ScrollView is iOS-only in RN — Android just shows the
        // image statically, which is a fine degrade (still views correctly,
        // just not zoomable there).
        minimumZoomScale={1}
        maximumZoomScale={4}
        centerContent
      >
        <Image source={{ uri: a.file_url }} style={s.fullImage} resizeMode="contain" />
      </ScrollView>
    );
  }

  if (isVideoAttachment(a)) {
    return <VideoPlayerView url={a.file_url} />;
  }

  if (isAudioAttachment(a)) {
    return <AudioPlayerView url={a.file_url} name={a.file_name} />;
  }

  if (isPdfAttachment(a)) {
    // Android's WebView has no built-in PDF renderer (unlike a desktop
    // browser's <iframe>, which is what web uses directly) — routed through
    // Google's public viewer so both platforms can actually display it.
    const viewerUrl = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(a.file_url)}`;
    return (
      <WebView
        source={{ uri: viewerUrl }}
        style={{ flex: 1, backgroundColor: '#fff' }}
        startInLoadingState
        renderLoading={() => (
          <View style={[StyleSheet.absoluteFill, s.centerBox]}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
      />
    );
  }

  if (isExcelAttachment(a)) {
    return <ExcelViewer url={a.file_url} />;
  }

  if (isTextPreviewAttachment(a)) {
    return <TextPreview url={a.file_url} />;
  }

  return (
    <View style={s.centerBox}>
      <Ionicons name="document-outline" size={56} color="#888" />
      <Text style={s.noPreviewText}>Preview not available for this file type</Text>
    </View>
  );
}

function VideoPlayerView({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => { p.play(); });
  return <VideoView player={player} style={{ flex: 1 }} nativeControls contentFit="contain" />;
}

function AudioPlayerView({ url, name }: { url: string; name: string }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);

  // Matches web's <audio controls autoPlay> — starts playing as soon as the
  // viewer opens instead of waiting for an extra tap.
  useEffect(() => {
    player.play();
  }, [player]);

  const fmt = (secs: number) => {
    const total = Math.max(0, Math.floor(secs || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  };

  return (
    <View style={s.centerBox}>
      <Ionicons name="musical-notes" size={56} color="#888" />
      <Text style={s.audioName} numberOfLines={2}>{name}</Text>
      <TouchableOpacity
        style={s.playBtn}
        onPress={() => {
          if (status.playing) {
            player.pause();
            return;
          }
          // Playback halts at the end without resetting currentTime, so
          // play() on a finished track is a no-op unless we seek back first.
          if (status.duration > 0 && status.currentTime >= status.duration - 0.05) {
            player.seekTo(0);
          }
          player.play();
        }}
      >
        <Ionicons name={status.playing ? 'pause' : 'play'} size={28} color="#fff" />
      </TouchableOpacity>
      <Text style={s.audioTime}>{fmt(status.currentTime)} / {fmt(status.duration)}</Text>
    </View>
  );
}

// Matches web's ExcelViewer exactly: parse client-side with the same `xlsx`
// library and render each sheet via sheet_to_html — reused as-is here since
// WebView can render a raw HTML string just like a browser can, so there's no
// need to translate the table into native RN views by hand.
function ExcelViewer({ url }: { url: string }) {
  const [sheets, setSheets] = useState<{ name: string; html: string }[] | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSheets(null);
    setError(false);
    (async () => {
      try {
        const res = await fetch(url);
        const ab = await res.arrayBuffer();
        const wb = XLSX.read(ab, { type: 'array' });
        const parsed = wb.SheetNames.map((name) => ({
          name,
          html: XLSX.utils.sheet_to_html(wb.Sheets[name]),
        }));
        if (!cancelled) {
          setSheets(parsed);
          setActiveSheet(0);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  if (error) return <View style={s.centerBox}><Text style={s.noPreviewText}>Could not load spreadsheet.</Text></View>;
  if (!sheets) return <View style={s.centerBox}><ActivityIndicator color="#fff" /></View>;

  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { margin: 0; padding: 8px; background: #fff; }
      table { border-collapse: collapse; font-size: 12px; color: #111; font-family: sans-serif; }
      td, th { border: 1px solid #d1d5db; padding: 4px 8px; white-space: nowrap; }
      th { background: #f9fafb; font-weight: 600; }
    </style></head><body>${sheets[activeSheet].html}</body></html>`;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {sheets.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.sheetTabs}>
          {sheets.map((sh, i) => (
            <TouchableOpacity
              key={sh.name}
              style={[s.sheetTab, i === activeSheet && s.sheetTabActive]}
              onPress={() => setActiveSheet(i)}
            >
              <Text style={[s.sheetTabText, i === activeSheet && s.sheetTabTextActive]}>{sh.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <WebView source={{ html }} style={{ flex: 1 }} />
    </View>
  );
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => r.text())
      .then((t) => { if (!cancelled) setText(t); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [url]);

  if (error) return <View style={s.centerBox}><Text style={s.noPreviewText}>Could not load file.</Text></View>;
  if (text === null) return <View style={s.centerBox}><ActivityIndicator color="#fff" /></View>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#1a1a1a' }} contentContainerStyle={{ padding: 16 }}>
      <Text style={s.textPreview}>{text}</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  headerName: { flex: 1, color: '#fff', fontSize: 14 },
  headerBtn: { padding: 4 },
  content: { flex: 1 },
  zoomContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  fullImage: { width: SCREEN_W, height: SCREEN_H * 0.8 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
  noPreviewText: { color: '#ccc', fontSize: 14, textAlign: 'center' },
  audioName: { color: '#ccc', fontSize: 14, textAlign: 'center' },
  playBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  audioTime: { color: '#888', fontSize: 12 },
  textPreview: { color: '#e0e0e0', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, lineHeight: 20 },
  sheetTabs: { flexGrow: 0, backgroundColor: '#f3f4f6', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  sheetTab: { paddingHorizontal: 12, paddingVertical: 6 },
  sheetTabActive: { backgroundColor: '#1a5276' },
  sheetTabText: { fontSize: 12, color: '#374151' },
  sheetTabTextActive: { color: '#fff', fontWeight: '600' },
});
