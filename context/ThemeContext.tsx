'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  DIFFICULTY_PRESETS,
  DifficultyLevel,
  THEME_PRESETS,
  ThemeConfig,
  ThemeId,
} from '../types';

interface ThemeContextValue {
  themeId: ThemeId;
  theme: ThemeConfig;
  setThemeId: (id: ThemeId) => void;
  syncDifficultyAccent: boolean;
  setSyncDifficultyAccent: (val: boolean) => void;
  activeDifficulty: DifficultyLevel;
  setActiveDifficulty: (diff: DifficultyLevel) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_THEME_KEY = 'songspot:theme-id';
const STORAGE_SYNC_DIFF_KEY = 'songspot:sync-difficulty-accent';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeId, setThemeIdState] = useState<ThemeId>('songspot-dark');
  const [syncDifficultyAccent, setSyncDifficultyAccentState] = useState<boolean>(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_THEME_KEY) as ThemeId | null;
      if (saved && THEME_PRESETS[saved]) setThemeIdState(saved);
      const syncSaved = localStorage.getItem(STORAGE_SYNC_DIFF_KEY);
      if (syncSaved) setSyncDifficultyAccentState(syncSaved === 'true');
    } catch {}
  }, []);

  const [activeDifficulty, setActiveDifficulty] = useState<DifficultyLevel>('medium');

  const setThemeId = (id: ThemeId) => {
    setThemeIdState(id);
    try {
      localStorage.setItem(STORAGE_THEME_KEY, id);
    } catch {}
  };

  const setSyncDifficultyAccent = (val: boolean) => {
    setSyncDifficultyAccentState(val);
    try {
      localStorage.setItem(STORAGE_SYNC_DIFF_KEY, String(val));
    } catch {}
  };

  const baseTheme = THEME_PRESETS[themeId] || THEME_PRESETS['songspot-dark'];
  const diffPreset = DIFFICULTY_PRESETS[activeDifficulty];

  // If syncDifficultyAccent is on and using songspot-dark, adapt accent colors to difficulty like Songspot GI
  const effectiveTheme: ThemeConfig =
    syncDifficultyAccent && themeId === 'songspot-dark'
      ? {
          ...baseTheme,
          accent: diffPreset.accent,
          accentText: diffPreset.accentText,
          accentOn: diffPreset.accentOn,
          rgb: diffPreset.rgb,
          page: diffPreset.page || baseTheme.page,
          stage: diffPreset.stage || baseTheme.stage,
          surface: diffPreset.surface || baseTheme.surface,
          surfaceSoft: diffPreset.surfaceSoft || baseTheme.surfaceSoft,
          timeline: diffPreset.timeline || baseTheme.timeline,
        }
      : baseTheme;

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--song-accent', effectiveTheme.accent);
    root.style.setProperty('--song-accent-text', effectiveTheme.accentText);
    root.style.setProperty('--song-accent-on', effectiveTheme.accentOn);
    root.style.setProperty('--song-accent-rgb', effectiveTheme.rgb);
    root.style.setProperty('--song-page', effectiveTheme.page);
    root.style.setProperty('--song-stage', effectiveTheme.stage);
    root.style.setProperty('--song-surface', effectiveTheme.surface);
    root.style.setProperty('--song-surface-soft', effectiveTheme.surfaceSoft);
    root.style.setProperty('--song-timeline', effectiveTheme.timeline);
    root.style.setProperty('--song-text', effectiveTheme.textMain);
    root.style.setProperty('--song-muted', effectiveTheme.textMuted);
    root.style.setProperty('--song-border', effectiveTheme.border);

    if (effectiveTheme.isLight) {
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
    }
  }, [effectiveTheme]);

  return (
    <ThemeContext.Provider
      value={{
        themeId,
        theme: effectiveTheme,
        setThemeId,
        syncDifficultyAccent,
        setSyncDifficultyAccent,
        activeDifficulty,
        setActiveDifficulty,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

