export const LightColors = {
  primary: '#2563eb',
  primaryLight: '#dbeafe',
  primaryDark: '#1d4ed8',

  secondary: '#0891b2',

  success: '#10b981',
  successLight: '#d1fae5',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  danger: '#ef4444',
  dangerLight: '#fee2e2',
  info: '#0891b2',
  infoLight: '#cffafe',

  white: '#ffffff',
  black: '#111827',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  gray900: '#111827',

  background: '#f9fafb',
  surface: '#ffffff',
  border: '#e5e7eb',
  textPrimary: '#111827',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
};

export const DarkColors: typeof LightColors = {
  primary: '#3b82f6',
  primaryLight: 'rgba(59,130,246,0.15)',
  primaryDark: '#2563eb',

  secondary: '#22d3ee',

  success: '#10b981',
  successLight: 'rgba(16,185,129,0.15)',
  warning: '#f59e0b',
  warningLight: 'rgba(245,158,11,0.15)',
  danger: '#ef4444',
  dangerLight: 'rgba(239,68,68,0.15)',
  info: '#22d3ee',
  infoLight: 'rgba(34,211,238,0.15)',

  white: '#ffffff',
  black: '#f8fafc',
  gray50: '#0a0e14',
  gray100: '#0d1117',
  gray200: '#111827',
  gray300: '#1e2a3a',
  gray400: '#374151',
  gray500: '#6b7280',
  gray600: '#9ca3af',
  gray700: '#d1d5db',
  gray800: '#e5e7eb',
  gray900: '#f9fafb',

  background: '#07090c',
  surface: '#0d1117',
  border: 'rgba(255,255,255,0.08)',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#475569',
};

export type AppColors = typeof LightColors;

export const Colors = LightColors;

export const StatusColors: Record<string, { bg: string; text: string }> = {
  open:        { bg: '#dbeafe', text: '#2563eb' },
  todo:        { bg: '#dbeafe', text: '#2563eb' },
  in_progress: { bg: '#cffafe', text: '#0891b2' },
  in_review:   { bg: '#fef3c7', text: '#f59e0b' },
  blocked:     { bg: '#fee2e2', text: '#ef4444' },
  done:        { bg: '#d1fae5', text: '#10b981' },
  cancelled:   { bg: '#f3f4f6', text: '#6b7280' },
};

export const PriorityColors: Record<string, { bg: string; text: string }> = {
  low:    { bg: '#d1fae5', text: '#10b981' },
  medium: { bg: '#fef3c7', text: '#f59e0b' },
  high:   { bg: '#fee2e2', text: '#ef4444' },
  urgent: { bg: '#ef4444', text: '#ffffff' },
};
