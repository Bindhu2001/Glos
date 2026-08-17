import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';
import { useApi } from '../hooks/useApi';
import { showAlert } from '../components/common/AlertModal';

// Mirrors backend's attachments.js ALLOWED_TYPES / 20MB limit exactly, so
// oversized or unsupported files get rejected client-side before an upload
// attempt instead of failing at the presign call.
export const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'image/tiff', 'image/heic', 'image/heif', 'image/bmp', 'image/x-ms-bmp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'text/tab-separated-values',
  'text/markdown', 'text/x-markdown',
  'application/json',
  'application/xml', 'text/xml',
  'application/x-yaml', 'text/yaml',
  'text/html',
  'application/sql', 'application/x-sql',
  'text/javascript', 'application/javascript',
  'text/css',
  'audio/wav', 'audio/x-wav', 'audio/mpeg',
  'video/mp4',
  'application/zip', 'application/x-zip-compressed',
  'application/octet-stream',
];
export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;

export type AttachmentContext = 'chat' | 'task_comment' | 'task_description' | 'feed';

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

// What the server expects in the create/attach call body — same shape for
// chat/task_comment/feed's `attachments: [...]` array and for
// task_description's single-object POST body. The index signature keeps this
// assignable to the api layer's generic Record<string, unknown> parameters.
export interface UploadedAttachment {
  [key: string]: unknown;
  file_name: string;
  file_key: string;
  file_url: string;
  file_size: number;
  content_type: string;
}

// What comes back embedded in read responses (message/comment/post/task).
export interface Attachment extends UploadedAttachment {
  id: number;
  uploaded_by: number;
  created_at: string;
}

export async function pickAttachmentFiles(): Promise<PickedFile[]> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ALLOWED_MIME_TYPES,
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (res.canceled) return [];

  const oversized = res.assets.filter((a) => !!a.size && a.size > MAX_ATTACHMENT_SIZE);
  if (oversized.length > 0) {
    showAlert('File too large', `${oversized.map((a) => a.name).join(', ')} exceed${oversized.length === 1 ? 's' : ''} the 20 MB limit and won't be attached.`);
  }

  return res.assets
    .filter((a) => !a.size || a.size <= MAX_ATTACHMENT_SIZE)
    .map((a) => ({
      uri: a.uri,
      name: a.name,
      mimeType: a.mimeType ?? 'application/octet-stream',
      size: a.size ?? 0,
    }));
}

// presign -> PUT the raw bytes to Spaces -> return the metadata the server
// expects when attaching this file to its parent record. Mirrors qa-production
// frontend's useSpacesUpload.js exactly (including the x-amz-acl header —
// required because it's part of what the presigned URL's signature covers).
export async function uploadAttachment(
  api: ReturnType<typeof useApi>,
  appId: number,
  context: AttachmentContext,
  file: PickedFile,
): Promise<UploadedAttachment> {
  const presignRes = await api.attachments.presign(appId, {
    file_name: file.name,
    content_type: file.mimeType,
    file_size: file.size,
    context,
  });
  const { upload_url, file_url, file_key } = presignRes.data;

  const fileResp = await fetch(file.uri);
  const blob = await fileResp.blob();
  await fetch(upload_url, {
    method: 'PUT',
    headers: {
      'Content-Type': file.mimeType,
      'x-amz-acl': 'public-read',
    },
    body: blob,
  });

  return {
    file_name: file.name,
    file_key,
    file_url,
    file_size: file.size,
    content_type: file.mimeType,
  };
}

// Wraps a locally-recorded file (e.g. a voice message, which never goes
// through DocumentPicker) into the same PickedFile shape as pickAttachmentFiles
// returns, so it can flow through the exact same upload/send pipeline as a
// manually attached document.
export function pickedFileFromLocalUri(uri: string, name: string, mimeType: string): PickedFile {
  return { uri, name, mimeType, size: new File(uri).size };
}

// Uploads sequentially (matches web) rather than in parallel — avoids
// hammering the presign endpoint and keeps upload order predictable.
export async function uploadAttachments(
  api: ReturnType<typeof useApi>,
  appId: number,
  context: AttachmentContext,
  files: PickedFile[],
): Promise<UploadedAttachment[]> {
  const out: UploadedAttachment[] = [];
  for (const file of files) {
    out.push(await uploadAttachment(api, appId, context, file));
  }
  return out;
}

// Only formats RN's <Image> can actually decode render as an image bubble —
// everything else (SVG, TIFF, HEIC/HEIF, BMP) falls back to the generic
// file-pill treatment instead of a broken/blank thumbnail. HEIC in particular
// matters on iOS: it's the default photo format for the on-device camera, so
// without this a "recent photo" attached via the file picker (rather than
// the photo library, which re-encodes on pick) would silently fail to render.
const NON_RENDERABLE_IMAGE_TYPES = new Set([
  'image/svg+xml', 'image/tiff', 'image/heic', 'image/heif', 'image/bmp', 'image/x-ms-bmp',
]);
export function isImageAttachment(a: { content_type: string }): boolean {
  return a.content_type.startsWith('image/') && !NON_RENDERABLE_IMAGE_TYPES.has(a.content_type);
}

export function isVideoAttachment(a: { content_type: string }): boolean {
  return a.content_type.startsWith('video/');
}

export function isAudioAttachment(a: { content_type: string }): boolean {
  return a.content_type.startsWith('audio/');
}

export function isPdfAttachment(a: { content_type: string; file_name: string }): boolean {
  return a.content_type === 'application/pdf' || a.file_name.toLowerCase().endsWith('.pdf');
}

export function isExcelAttachment(a: { content_type: string; file_name: string }): boolean {
  const ct = a.content_type;
  const name = a.file_name.toLowerCase();
  return ct.includes('spreadsheet') || ct.includes('excel') || name.endsWith('.xlsx') || name.endsWith('.xls');
}

export function isTextPreviewAttachment(a: { content_type: string; file_name: string }): boolean {
  const ct = a.content_type;
  const name = a.file_name.toLowerCase();
  return ct === 'text/csv' || ct === 'text/plain' || name.endsWith('.csv') || name.endsWith('.txt');
}

// Web's compose box can insert a `[[att:N]]` token into the message body at
// the cursor position so an attachment renders inline at that exact spot
// (AttachmentComponents.jsx's renderMixedContent). Mobile doesn't build that
// same inline layout — it always lists attachments below the text via
// AttachmentList — so without this, a message composed on web with an inline
// attachment would show the raw "[[att:0]]" token as literal text here.
export function stripAttachmentMarkers(body: string): string {
  return body.replace(/\[\[att:\d+\]\]/g, '').replace(/[ \t]+\n/g, '\n').trim();
}

// Web has no forward-message feature at all, so there's no backend column to
// persist "this message was forwarded" — forwarding is mobile-only and reuses
// the plain send_message event with the original body/attachments verbatim.
// To still show a WhatsApp-style "Forwarded" tag without a backend/migration
// change, a distinctive zero-width character sequence is prepended to the body
// on send and detected on display. It renders as nothing if some other client
// (web, or a future version) doesn't know about it — unlike a visible token
// like "[[att:N]]", there's no raw text to leak if it isn't stripped.
// Zero-width space + zero-width non-joiner + word joiner, built via character
// codes rather than pasted literally so the source file has no invisible
// characters of its own that could be silently mangled by an editor/tool.
const FORWARD_MARKER = String.fromCharCode(0x200b, 0x200c, 0x2060);

export function withForwardMarker(body: string): string {
  return FORWARD_MARKER + body;
}

export function isForwardedBody(body: string): boolean {
  return body.startsWith(FORWARD_MARKER);
}

export function stripForwardMarker(body: string): string {
  return body.startsWith(FORWARD_MARKER) ? body.slice(FORWARD_MARKER.length) : body;
}

// Downloading (saving locally) is a separate action from viewing — this pulls
// the file into local storage and hands it to the native share sheet, which
// is what lets the user save it to Photos/Files. Shared by AttachmentList's
// download icon/long-press and the chat message's "Download" menu option, so
// both go through one implementation.
export async function downloadAttachment(a: Attachment | UploadedAttachment): Promise<void> {
  try {
    const destination = new File(Paths.cache, a.file_name);
    const file = await File.downloadFileAsync(a.file_url, destination, { idempotent: true });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri);
    } else {
      await Linking.openURL(a.file_url);
    }
  } catch {
    showAlert('Download Failed', `Could not download ${a.file_name}. Please try again.`);
  }
}
