'use client';

import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useConsent } from '../context/ConsentContext';

type Props = {
  className?: string;
  variant?: 'button' | 'link';
  label?: string;
};

/** Re-opens the consent preference centre. Required for a withdrawable consent flow. */
export const CookiePreferencesButton: React.FC<Props> = ({
  className = '',
  variant = 'button',
  label,
}) => {
  const t = useTranslations('Consent');
  const text = label ?? t('preferencesButton');
  const { openPreferences } = useConsent();

  if (variant === 'link') {
    return (
      <button
        type="button"
        onClick={openPreferences}
        className={`font-semibold underline underline-offset-2 transition hover:brightness-125 ${className}`}
      >
        {text}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openPreferences}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-extrabold shadow-lg transition hover:brightness-110 ${className}`}
      style={{ backgroundColor: 'var(--song-accent)', color: 'var(--song-accent-on)' }}
    >
      <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
      {text}
    </button>
  );
};
