'use client';
import React, { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ROOM_LIMITS } from '../../shared/roomTypes';
import { normalizeClipInput } from '../../shared/roomForm';
import { MAX_SNIPPET_DURATION, MIN_SNIPPET_DURATION } from '../../shared/types';
import { FieldLabel, textInputClass, textInputStyle } from './RoomControls';

const chipClass =
  'min-h-11 rounded-xl border px-3.5 py-2 text-sm font-extrabold transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--song-accent)]';

/** Preset chips plus a custom number input; the value it reports is always within the snippet bounds. */
export function ClipLengthPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const t = useTranslations('Room');
  const uid = useId();
  const presets = ROOM_LIMITS.clipPresets as readonly number[];
  const isPreset = presets.includes(value);
  const [customMode, setCustomMode] = useState(!isPreset);
  const [draft, setDraft] = useState<string | null>(null); // text while typing; null = show `value`
  const custom = customMode || !isPreset;

  const commit = (raw: string) => {
    const next = normalizeClipInput(raw, value);
    setDraft(null);
    onChange(next);
    if (presets.includes(next)) setCustomMode(false);
  };

  const chip = (active: boolean): React.CSSProperties =>
    active
      ? { backgroundColor: 'var(--song-accent)', borderColor: 'var(--song-accent)', color: 'var(--song-accent-on)' }
      : { backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)', color: 'var(--song-text)' };

  return (
    <div>
      <div role="radiogroup" aria-label={t('create.clip')}>
        <FieldLabel>{t('create.clip')}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {presets.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={!custom && s === value}
              onClick={() => {
                setCustomMode(false);
                setDraft(null);
                onChange(s);
              }}
              className={chipClass}
              style={chip(!custom && s === value)}
            >
              {t('create.seconds', { seconds: s })}
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={custom}
            onClick={() => setCustomMode(true)}
            className={chipClass}
            style={chip(custom)}
          >
            {t('create.clipCustom')}
          </button>
        </div>
      </div>
      {custom && (
        <div className="mt-2 flex items-center gap-2">
          <input
            id={`${uid}-custom`}
            type="number"
            inputMode="decimal"
            step={0.1}
            min={MIN_SNIPPET_DURATION}
            max={MAX_SNIPPET_DURATION}
            aria-label={t('create.clipCustomLabel')}
            aria-describedby={`${uid}-hint`}
            value={draft ?? String(value)}
            onChange={(e) => {
              setDraft(e.target.value);
              // Keep the reported value valid while typing, without rewriting the field text.
              const n = Number(e.target.value);
              if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(normalizeClipInput(e.target.value, value));
            }}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit(e.currentTarget.value);
              }
            }}
            className={`${textInputClass} max-w-[7rem]`}
            style={textInputStyle}
          />
          <span className="text-sm font-bold" style={{ color: 'var(--song-muted)' }}>{t('create.secondsUnit')}</span>
        </div>
      )}
      <p id={`${uid}-hint`} className="mt-1 text-xs font-semibold" style={{ color: 'var(--song-muted)' }}>
        {t('create.clipRange', { min: MIN_SNIPPET_DURATION, max: MAX_SNIPPET_DURATION })}
      </p>
    </div>
  );
}
