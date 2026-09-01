import { format, formatDistanceToNow, parseISO } from 'date-fns';

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = parseISO(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
    return format(d, 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

export function formatRelative(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const d = parseISO(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return dateStr;
  }
}

export function formatExact(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const d = parseISO(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
    return format(d, 'MMM d, yyyy · h:mm a');
  } catch {
    return dateStr;
  }
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatDurationSeconds(seconds: number): string {
  if (!seconds) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return s > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

export function formatTimerDisplay(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatLogEntry(createdAt: string | null | undefined): string {
  if (!createdAt) return '';
  try {
    const d = parseISO(createdAt.endsWith('Z') ? createdAt : createdAt + 'Z');
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const logStr = format(d, 'yyyy-MM-dd');
    return logStr === todayStr
      ? `Logged Today at ${format(d, 'h:mm a')}`
      : `Logged ${format(d, 'MMM d')} at ${format(d, 'h:mm a')}`;
  } catch {
    return '';
  }
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}

export function capitalize(s: string | null | undefined): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}
