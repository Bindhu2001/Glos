export const LightColors = {
  primary: '#4F6EF7',
  primaryLight: '#EEF2FF',
  primaryDark: '#3B56D9',

  success: '#0e9f6e',
  successLight: '#def7ec',
  warning: '#c27803',
  warningLight: '#fdf6b2',
  danger: '#e02424',
  dangerLight: '#fde8e8',
  info: '#0694a2',
  infoLight: '#e0f7fa',

  white: '#ffffff',
  black: '#111928',
  gray50: '#f8fafc',
  gray100: '#f1f5f9',
  gray200: '#e2e8f0',
  gray300: '#cbd5e1',
  gray400: '#94a3b8',
  gray500: '#64748b',
  gray600: '#475569',
  gray700: '#334155',
  gray800: '#1e293b',
  gray900: '#0f172a',

  background: '#f1f5f9',
  surface: '#ffffff',
  border: '#e2e8f0',
  textPrimary: '#0f172a',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
};

export const DarkColors: typeof LightColors = {
  primary: '#6B82FF',
  primaryLight: '#1e1b4b',
  primaryDark: '#4F6EF7',

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

// Backward-compat alias (light theme for static references)
export const Colors = LightColors;

export const StatusColors: Record<string, { bg: string; text: string }> = {
  open: { bg: '#f3f4f6', text: '#374151' },
  todo: { bg: '#f3f4f6', text: '#374151' },
  in_progress: { bg: '#EEF2FF', text: '#4F6EF7' },
  in_review: { bg: '#fdf6b2', text: '#c27803' },
  blocked: { bg: '#fde8e8', text: '#e02424' },
  done: { bg: '#def7ec', text: '#0e9f6e' },
  cancelled: { bg: '#fdf6b2', text: '#c27803' },
};

export const PriorityColors: Record<string, { bg: string; text: string }> = {
  low: { bg: '#def7ec', text: '#0e9f6e' },
  medium: { bg: '#fdf6b2', text: '#c27803' },
  high: { bg: '#fde8e8', text: '#e02424' },
  urgent: { bg: '#e02424', text: '#ffffff' },
};
