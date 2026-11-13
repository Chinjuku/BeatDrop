import { Link } from '../i18n/navigation';
import React from 'react';
import { getLocale, getTranslations } from 'next-intl/server';

type LegalPageProps = {
  title: string;
  subtitle?: string;
  updated: string;
  children: React.ReactNode;
};

/** Shared, readable shell for legal/policy documents. Server-rendered for SEO. */
export async function LegalPage({ title, subtitle, updated, children }: LegalPageProps) {
  const [t, locale] = await Promise.all([getTranslations('Legal'), getLocale()]);
  return (
    <article className="w-full max-w-3xl mx-auto text-left">
      <nav aria-label={t('breadcrumb')} className="mb-4 text-[11px] font-bold" style={{ color: 'var(--song-muted)' }}>
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/play" className="hover:underline underline-offset-2">
              BeatDrop
            </Link>
          </li>
          <li aria-hidden="true" className="opacity-40">
            /
          </li>
          <li aria-current="page" className="opacity-80">
            {title}
          </li>
        </ol>
      </nav>

      <header className="mb-6 border-b pb-5" style={{ borderColor: 'var(--song-border)' }}>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-2 text-xs sm:text-sm leading-relaxed" style={{ color: 'var(--song-muted)' }}>
            {subtitle}
          </p>
        )}
        <p className="mt-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
          {t('lastUpdated')}:{' '}
          <time dateTime={updated}>
            {new Date(`${updated}T00:00:00Z`).toLocaleDateString(locale === 'en' ? 'en-US' : 'th-TH', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </time>
        </p>
      </header>

      <div className="legal-prose space-y-7 text-sm leading-relaxed">{children}</div>
    </article>
  );
}

export function LegalSection({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="space-y-2.5">
      <h2 id={`${id}-heading`} className="text-base sm:text-lg font-extrabold tracking-tight">
        {heading}
      </h2>
      {children}
    </section>
  );
}

/**
 * Keeps wide policy tables usable on narrow screens: the table scrolls inside its
 * own focusable region instead of forcing the whole page to scroll sideways.
 */
export function LegalTable({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="legal-table-scroll -mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0"
    >
      {children}
    </div>
  );
}
