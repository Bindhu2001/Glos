import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFT_PREFIX = '@glos_chat_draft_';

export async function getDraft(conversationId: number): Promise<string> {
  try {
    return (await AsyncStorage.getItem(DRAFT_PREFIX + conversationId)) ?? '';
  } catch {
    return '';
  }
}

// Empty/whitespace-only text clears the draft rather than storing a blank
// entry, so a sent or emptied-out compose box doesn't leave a stale "Draft:"
// label behind in the chat list.
export async function setDraft(conversationId: number, text: string): Promise<void> {
  try {
    if (text.trim()) {
      await AsyncStorage.setItem(DRAFT_PREFIX + conversationId, text);
    } else {
      await AsyncStorage.removeItem(DRAFT_PREFIX + conversationId);
    }
  } catch {
    // non-critical — losing a draft on a storage error isn't worth surfacing
  }
}

export async function clearDraft(conversationId: number): Promise<void> {
  try {
    await AsyncStorage.removeItem(DRAFT_PREFIX + conversationId);
  } catch {}
}

// Used by the chat list to show a "Draft: ..." preview per conversation
// without opening each thread — one multiGet instead of N getItem calls.
export async function getAllDrafts(): Promise<Record<number, string>> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const draftKeys = keys.filter((k) => k.startsWith(DRAFT_PREFIX));
    if (draftKeys.length === 0) return {};
    const pairs = await AsyncStorage.multiGet(draftKeys);
    const result: Record<number, string> = {};
    for (const [key, value] of pairs) {
      if (!value) continue;
      const id = Number(key.slice(DRAFT_PREFIX.length));
      if (!Number.isNaN(id)) result[id] = value;
    }
    return result;
  } catch {
    return {};
  }
}
