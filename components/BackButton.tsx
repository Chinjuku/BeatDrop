'use client';
/**
 * The one "back" control used across pages, so every back button looks and behaves the same:
 * a pill with a left arrow, 40px tall for touch. Pass `href` to navigate with a Link, or
 * `onClick` for in-page back (e.g. leaving a game view).
 */
import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from '../i18n/navigation';

const className =
  'inline-flex items-center gap-1.5 min-h-10 px-3.5 rounded-full border text-xs sm:text-sm font-bold ' +
  'whitespace-nowrap shadow-sm transition hover:brightness-110 active:scale-95 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--song-accent)]';

const style: React.CSSProperties = {
  backgroundColor: 'var(--song-surface)',
  borderColor: 'var(--song-border)',
  color: 'var(--song-text)',
};

type Props = { label: string; ariaLabel?: string; className?: string } & (
  | { href: string; onClick?: never }
  | { onClick: () => void; href?: never }
);

export function BackButton({ label, ariaLabel, className: extra = '', ...rest }: Props) {
  const content = (
    <>
      <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </>
  );
  if ('href' in rest && rest.href) {
    return (
      <Link href={rest.href} className={`${className} ${extra}`} style={style} aria-label={ariaLabel}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={rest.onClick} className={`${className} ${extra}`} style={style} aria-label={ariaLabel}>
      {content}
    </button>
  );
}
