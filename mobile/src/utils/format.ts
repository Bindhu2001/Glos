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

export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}
