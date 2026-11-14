'use client';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { clampActiveIndex, filterArtistNames } from '../../shared/roomForm';
import { FieldLabel, textInputClass, textInputStyle } from './RoomControls';

const MAX_OPTIONS = 40;

/** Searchable combobox over the catalog artists. Index 0 is always "Any artist" (clears the filter). */
export function RoomArtistPicker({ value, onChange }: { value?: string; onChange: (name?: string) => void }) {
  const t = useTranslations('Room');
  const { artists } = useGame();
  const uid = useId();
  const inputId = `${uid}-input`;
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-opt-${i}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const names = useMemo(() => artists.map((a) => a.name).filter(Boolean), [artists]);
  const matches = useMemo(() => filterArtistNames(names, query, MAX_OPTIONS), [names, query]);
  // Option 0 = any artist, then the matches.
  const options: Array<string | undefined> = [undefined, ...matches];
  const activeIndex = clampActiveIndex(active, options.length);

  // Keep the highlighted option visible in the scrollable list.
  useEffect(() => {
    if (open) document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  const choose = (name?: string) => {
    onChange(name);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
      } else setActive(Math.min(activeIndex + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (open) setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === 'Enter') {
      if (open) {
        e.preventDefault(); // never submit the create form from the combobox
        if (activeIndex < options.length) choose(options[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setQuery('');
      }
    }
  };

  return (
    <div className="relative">
      <FieldLabel htmlFor={inputId}>{t('create.artist')}</FieldLabel>
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? optionId(activeIndex) : undefined}
          autoComplete="off"
          spellCheck={false}
          value={open ? query : value ?? ''}
          placeholder={t('create.artistAny')}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(1); // first real match; clamped when there are none
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            setQuery('');
          }}
          onKeyDown={onKeyDown}
          className={`${textInputClass} pr-10`}
          style={textInputStyle}
        />
        <ChevronDown
          className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--song-muted)' }}
          aria-hidden="true"
        />
      </div>
      {open && value && (
        <p className="mt-1 text-xs font-bold" style={{ color: 'var(--song-muted)' }}>
          {t('create.artistSelected', { name: value })}
        </p>
      )}
      <ul
        id={listId}
        role="listbox"
        aria-label={t('create.artist')}
        hidden={!open}
        className="absolute z-20 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl border shadow-2xl py-1"
        style={{ backgroundColor: 'var(--song-surface)', borderColor: 'var(--song-border)' }}
      >
        {options.map((name, i) => {
          const selected = name === value;
          return (
            <li
              key={name ?? '__any'}
              id={optionId(i)}
              role="option"
              aria-selected={selected}
              // mousedown (not click) so the input keeps focus and blur does not close the list first
              onMouseDown={(e) => {
                e.preventDefault();
                choose(name);
              }}
              onMouseMove={() => setActive(i)}
              className="flex items-center gap-2 min-h-11 px-3.5 text-sm font-bold cursor-pointer"
              style={{
                backgroundColor: i === activeIndex ? 'var(--song-surface-soft)' : 'transparent',
                color: name === undefined ? 'var(--song-accent-text)' : 'var(--song-text)',
              }}
            >
              <span className="flex-1 truncate">{name ?? t('create.artistAny')}</span>
              {(name === undefined ? value === undefined : selected) && <Check className="w-4 h-4 shrink-0" aria-hidden="true" />}
            </li>
          );
        })}
        {matches.length === 0 && (
          <li role="presentation" className="px-3.5 py-2 text-sm font-semibold" style={{ color: 'var(--song-muted)' }}>
            {artists.length === 0 ? t('create.artistEmpty') : t('create.artistNone')}
          </li>
        )}
      </ul>
      <p className="mt-1 text-xs font-semibold" style={{ color: 'var(--song-muted)' }}>{t('create.artistHint')}</p>
    </div>
  );
}
