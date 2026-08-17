import AsyncStorage from '@react-native-async-storage/async-storage';

// Persists not-yet-confirmed outgoing messages per conversation, so a message
// composed while offline (or one whose send silently dies mid-flight — app
// killed, network drop) survives an app restart instead of vanishing. Mirrors
// web's outbox (Chat.jsx) so both clients guarantee the same thing: a message
// that made it into the outbox is never lost, only ever pending or failed.
const OUTBOX_PREFIX = '@glos_chat_outbox_';

export interface OutboxItem {
  tempId: string;
  body: string;
  replyToId: number | null;
  attachments: Record<string, unknown>[];
  createdAt: string;
}

export async function loadOutbox(conversationId: number): Promise<OutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_PREFIX + conversationId);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addToOutbox(conversationId: number, item: OutboxItem): Promise<void> {
  try {
    const existing = await loadOutbox(conversationId);
    const next = [...existing.filter((i) => i.tempId !== item.tempId), item];
    await AsyncStorage.setItem(OUTBOX_PREFIX + conversationId, JSON.stringify(next));
  } catch {
    // non-critical — worst case this one message doesn't survive an app kill
  }
}

export async function removeFromOutbox(conversationId: number, tempId: string): Promise<void> {
  try {
    const existing = await loadOutbox(conversationId);
    const next = existing.filter((i) => i.tempId !== tempId);
    if (next.length) {
      await AsyncStorage.setItem(OUTBOX_PREFIX + conversationId, JSON.stringify(next));
    } else {
      await AsyncStorage.removeItem(OUTBOX_PREFIX + conversationId);
    }
  } catch {}
}
