// Shared routing table for "where does tapping this notification go" — used
// by the in-app Notifications list (NotificationsScreen.tsx) and by push
// notification taps (src/lib/pushNotifications.ts), so the two never drift
// apart. Matches qa-production frontend's NotificationBell.jsx routing table.
//
// entity_id's meaning varies per type (e.g. for mention_feed_comment it's the
// *comment* id, not the post id), so — same as web — feed types land on the
// Feed tab generally rather than guessing a specific post to deep-link to.
const TASK_TYPES = ['mention_task_comment', 'task_assigned', 'task_commented', 'task_reassigned', 'task_overdue'];
const FEED_TYPES = ['mention_feed_comment', 'mention_feed_post', 'feed_post', 'appreciation', 'feedback_received', 'wish'];
const PERF_TYPES = ['review_started', 'review_rejected', 'review_approved'];
const PROJECT_TYPES = ['project_join_request', 'project_join_accepted', 'project_join_rejected', 'project_commented'];
// Push-only (chat has no persistent row in the `notifications` table — it's
// sent directly from the socket message-save path, see backend socket.js).
const CHAT_TYPES = ['chat_message'];

export interface RoutableNotif {
  type: string;
  task_id?: number | null;
  app_id?: number | null;
  conversation_id?: number | null;
}

// `navigation` is the root navigator ref — typed loosely (matches how
// NotificationsScreen.tsx already calls navigation.navigate with `as never`)
// since this needs to work from both a screen's own navigation prop and a
// module-level NavigationContainer ref (pushNotifications.ts has no screen
// context to receive one from).
export function navigateForNotification(navigation: { navigate: (...args: any[]) => void }, item: RoutableNotif) {
  if (!item.app_id) return;

  if (TASK_TYPES.includes(item.type) && item.task_id) {
    navigation.navigate('Main', {
      screen: 'TasksTab',
      params: { screen: 'TaskDetail', params: { taskId: item.task_id, appId: item.app_id }, initial: false },
    });
  } else if (FEED_TYPES.includes(item.type)) {
    const initialTab = item.type === 'feedback_received' ? 'feedback'
      : item.type === 'appreciation' ? 'appreciations'
      : 'feed';
    navigation.navigate('Main', {
      screen: 'FeedTab',
      params: { screen: 'FeedList', params: { initialTab }, initial: false },
    });
  } else if (PERF_TYPES.includes(item.type)) {
    navigation.navigate('Main', { screen: 'PerformanceTab' });
  } else if (PROJECT_TYPES.includes(item.type)) {
    navigation.navigate('Main', {
      screen: 'MoreTab',
      params: { screen: 'ProjectsList' },
    });
  } else if (CHAT_TYPES.includes(item.type) && item.conversation_id) {
    navigation.navigate('Main', {
      screen: 'ChatTab',
      params: { screen: 'ChatThread', params: { conversationId: item.conversation_id, appId: item.app_id }, initial: false },
    });
  }
}
