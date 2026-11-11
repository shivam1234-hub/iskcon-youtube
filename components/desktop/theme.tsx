import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Desktop look: YouTube's desktop site palette, light and dark, following
 * Windows' app mode unless the user picks one (You > Settings > Appearance).
 * Desktop-only: the phone app keeps its single dark palette (theme/colors.ts).
 */
export interface Palette {
  dark: boolean;
  bg: string;
  raised: string;
  menu: string;
  chip: string;
  chipHover: string;
  chipActiveBg: string;
  chipActiveText: string;
  hover: string;
  pressed: string;
  border: string;
  text: string;
  textDim: string;
  textMute: string;
  searchBg: string;
  searchBorder: string;
  searchBtn: string;
  brand: string;
  link: string;
  focus: string;
  overlay: string;
  skeleton: string;
}

const LIGHT: Palette = {
  dark: false,
  bg: '#ffffff',
  raised: '#f2f2f2',
  menu: '#ffffff',
  chip: 'rgba(0,0,0,0.05)',
  chipHover: 'rgba(0,0,0,0.1)',
  chipActiveBg: '#0f0f0f',
  chipActiveText: '#ffffff',
  hover: 'rgba(0,0,0,0.05)',
  pressed: 'rgba(0,0,0,0.1)',
  border: 'rgba(0,0,0,0.1)',
  text: '#0f0f0f',
  textDim: '#606060',
  textMute: '#909090',
  searchBg: '#ffffff',
  searchBorder: '#d3d3d3',
  searchBtn: '#f8f8f8',
  brand: '#ff0000',
  link: '#065fd4',
  focus: '#1c62b9',
  overlay: 'rgba(0,0,0,0.8)',
  skeleton: 'rgba(0,0,0,0.06)',
};

const DARK: Palette = {
  dark: true,
  bg: '#0f0f0f',
  raised: '#272727',
  menu: '#282828',
  chip: 'rgba(255,255,255,0.1)',
  chipHover: 'rgba(255,255,255,0.2)',
  chipActiveBg: '#f1f1f1',
  chipActiveText: '#0f0f0f',
  hover: 'rgba(255,255,255,0.1)',
  pressed: 'rgba(255,255,255,0.2)',
  border: 'rgba(255,255,255,0.2)',
  text: '#f1f1f1',
  textDim: '#aaaaaa',
  textMute: '#717171',
  searchBg: '#121212',
  searchBorder: '#303030',
  searchBtn: '#222222',
  brand: '#ff0000',
  link: '#3ea6ff',
  focus: '#3ea6ff',
  overlay: 'rgba(0,0,0,0.8)',
  skeleton: 'rgba(255,255,255,0.08)',
};

export const FONT = 'Roboto, "Segoe UI", Arial, sans-serif';

export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'desktop_theme_v1';

interface Ctx {
  t: Palette;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
}

const ThemeCtx = createContext<Ctx>({ t: DARK, mode: 'system', setMode: () => {} });

function systemDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function DesktopThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [sysDark, setSysDark] = useState(systemDark);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') setModeState(v);
      })
      .catch(() => {});
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const on = () => setSysDark(mq.matches);
    mq?.addEventListener?.('change', on);
    return () => mq?.removeEventListener?.('change', on);
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(KEY, m).catch(() => {});
  }, []);

  const dark = mode === 'system' ? sysDark : mode === 'dark';
  const value = useMemo(() => ({ t: dark ? DARK : LIGHT, mode, setMode }), [dark, mode, setMode]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
export const useT = () => useContext(ThemeCtx).t;
