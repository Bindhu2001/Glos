export const LightColors = {
  primary: '#4f46e5',
  primaryLight: '#ede9fe',
  primaryDark: '#3730a3',

  secondary: '#7c3aed',

  success: '#16a34a',
  successLight: '#e1fced',
  warning: '#d97706',
  warningLight: '#fef3c7',
  danger: '#dc2626',
  dangerLight: '#fee2e2',
  info: '#0891b2',
  infoLight: '#e0f7fe',

  white: '#ffffff',
  black: '#1e1b4b',
  gray50: '#f4f5ff',
  gray100: '#ede9fe',
  gray200: '#e0e7ff',
  gray300: '#c7d2fe',
  gray400: '#a5b4fc',
  gray500: '#818cf8',
  gray600: '#6b7280',
  gray700: '#374151',
  gray800: '#1f2937',
  gray900: '#1e1b4b',

  background: '#f4f5ff',
  surface: '#ffffff',
  border: '#e0e7ff',
  textPrimary: '#1e1b4b',
  textSecondary: '#6b7280',
  textMuted: '#a5b4fc',
};

export const DarkColors: typeof LightColors = {
  primary: '#818cf8',
  primaryLight: '#1e1b4b',
  primaryDark: '#4f46e5',

  secondary: '#a78bfa',

  success: '#10b981',
  successLight: '#064e3b',
  warning: '#f59e0b',
  warningLight: '#451a03',
  danger: '#f87171',
  dangerLight: '#450a0a',
  info: '#22d3ee',
  infoLight: '#083344',

  white: '#ffffff',
  black: '#f1f5f9',
  gray50: '#1e293b',
  gray100: '#293548',
  gray200: '#334155',
  gray300: '#475569',
  gray400: '#64748b',
  gray500: '#94a3b8',
  gray600: '#cbd5e1',
  gray700: '#e2e8f0',
  gray800: '#f1f5f9',
  gray900: '#f8fafc',

  background: '#0f172a',
  surface: '#1e293b',
  border: '#334155',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
};

export type AppColors = typeof LightColors;

export const Colors = LightColors;

export const StatusColors: Record<string, { bg: string; text: string }> = {
  open:        { bg: '#ede9fe', text: '#4f46e5' },
  todo:        { bg: '#ede9fe', text: '#4f46e5' },
  in_progress: { bg: '#dbeafe', text: '#2563eb' },
  in_review:   { bg: '#fef3c7', text: '#d97706' },
  blocked:     { bg: '#fee2e2', text: '#dc2626' },
  done:        { bg: '#e1fced', text: '#16a34a' },
  cancelled:   { bg: '#fef3c7', text: '#d97706' },
};

export const PriorityColors: Record<string, { bg: string; text: string }> = {
  low:    { bg: '#e1fced', text: '#16a34a' },
  medium: { bg: '#fef3c7', text: '#d97706' },
  high:   { bg: '#fee2e2', text: '#dc2626' },
  urgent: { bg: '#dc2626', text: '#ffffff' },
};
