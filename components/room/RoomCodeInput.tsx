'use client';
/**
 * Room code entry drawn as one box per character, backed by a single real <input> laid over
 * the boxes. Typing, paste, autofill, backspace and screen readers all work as for one field;
 * the boxes are only the look.
 */
import React, { useState } from 'react';

export function RoomCodeInput({
  id,
  value,
  onChange,
  length,
  ariaLabel,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  length: number;
  ariaLabel?: string;
  invalid?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const activeIndex = Math.min(value.length, length - 1);

  return (
    <div className="relative w-full">
      <div className="grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }} aria-hidden="true">
        {Array.from({ length }, (_, i) => {
          const char = value[i] ?? '';
          const active = focused && i === activeIndex;
          return (
            <div
              key={i}
              className="h-12 sm:h-14 rounded-xl border-2 flex items-center justify-center text-xl sm:text-2xl font-black font-mono uppercase transition-colors"
              style={{
                backgroundColor: 'var(--song-surface-soft)',
                borderColor: invalid ? '#ef4444' : active ? 'var(--song-accent)' : char ? 'var(--song-text)' : 'var(--song-border)',
                color: 'var(--song-text)',
                boxShadow: active ? '0 0 0 3px color-mix(in srgb, var(--song-accent) 30%, transparent)' : undefined,
              }}
            >
              {char || (active ? <span className="w-0.5 h-6 animate-pulse" style={{ backgroundColor: 'var(--song-accent)' }} /> : '')}
            </div>
          );
        })}
      </div>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, length))}
        onFocus={(e) => {
          setFocused(true);
          // Keep the caret at the end so typing always fills the next box.
          const el = e.currentTarget;
          requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
        }}
        onBlur={() => setFocused(false)}
        autoCapitalize="characters"
        autoComplete="one-time-code"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className="absolute inset-0 w-full h-full opacity-0 cursor-text text-[16px]"
      />
    </div>
  );
}
