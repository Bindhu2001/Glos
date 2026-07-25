import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LightColors, DarkColors, AppColors } from '../utils/colors';

interface ThemeContextValue {
  isDark: boolean;
  toggleTheme: () => void;
  colors: AppColors;
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: false,
  toggleTheme: () => {},
  colors: LightColors,
});

const THEME_KEY = '@glos_theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Seed from the OS color scheme synchronously (matches the user's system
  // preference for the very first frame) — AsyncStorage is inherently async,
  // so without this the app always renders light-mode for a moment on cold
  // start before flipping to a saved dark preference, which reads as a flash.
  const [isDark, setIsDark] = useState(() => Appearance.getColorScheme() === 'dark');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((val) => {
        // Only an explicit saved preference overrides the OS-seeded guess —
        // no saved value (first launch) means "follow the system", which the
        // initial state already matches.
        if (val === 'dark') setIsDark(true);
        else if (val === 'light') setIsDark(false);
      })
      .catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light').catch(() => {});
      return next;
    });
  }, []);

  const colors = isDark ? DarkColors : LightColors;
  const value = useMemo(() => ({ isDark, toggleTheme, colors }), [isDark, toggleTheme, colors]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
