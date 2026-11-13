'use client';
import React, { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { DIFFICULTY_PRESETS, DifficultyLevel, TimeRangePresetId } from '../types';

const TIME_PRESET_NAMES: Record<TimeRangePresetId, string> = {
  relaxed: 'Relaxed',
  standard: 'Standard',
  songspot: 'Songspot',
  custom: 'Custom',
};

/** Short one-line summary of the round setup, e.g. "Easy · Standard · Pop". */
export function describeSetup(parts: {
  difficulty: DifficultyLevel;
  timeRangePreset?: TimeRangePresetId;
  extras?: Array<string | undefined | null>;
}): string {
  const items: string[] = [DIFFICULTY_PRESETS[parts.difficulty]?.label || parts.difficulty];
  if (parts.timeRangePreset) items.push(TIME_PRESET_NAMES[parts.timeRangePreset]);
  for (const extra of parts.extras || []) {
    if (extra && extra !== 'any') items.push(extra);
  }
  return items.join(' · ');
}

interface SetupDisclosureProps {
  summary: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * On phones (< 640px) the round setup collapses behind a single summary button so the
 * play controls stay in the first screen. From 640px up the toggle is hidden and the
 * setup is always shown, exactly as before.
 */
export const SetupDisclosure: React.FC<SetupDisclosureProps> = ({ summary, children, className }) => {
  const t = useTranslations('Setup');
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  return (
    <div className={`setup-disclosure ${className || ''}`} data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className="setup-disclosure-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontal className="w-4 h-4 shrink-0" style={{ color: 'var(--song-accent-text)' }} aria-hidden="true" />
        <span className="font-bold shrink-0">{t('roundSetup')}</span>
        <span className="setup-disclosure-summary">{summary}</span>
        <ChevronDown className="setup-disclosure-chevron w-4 h-4 shrink-0" aria-hidden="true" />
      </button>
      <div id={bodyId} className="setup-disclosure-body">
        {children}
      </div>
    </div>
  );
};
