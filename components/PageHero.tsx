import React from 'react';

/**
 * Shared page hero for the game surfaces (/play, /guesser, /daily, /categories).
 *
 * Every mode keeps its own accent — it is passed in as `gradient` / `taglineColor`
 * — but the wordmark size, tagline treatment, spacing and badge row are defined
 * once here so the pages read as one product. Presentation only: this component
 * holds no game state and makes no decisions.
 */
export type PageHeroProps = {
  /** Large italic wordmark. */
  title: string;
  /** Short uppercase line under the wordmark. */
  tagline: string;
  /**
   * Tailwind gradient classes for the wordmark, e.g.
   * "from-white via-neutral-200 to-neutral-400".
   */
  gradient: string;
  /** CSS color for the tagline; defaults to the muted token. */
  taglineColor?: string;
  /** Badge / stat pills rendered in the row under the tagline. */
  children?: React.ReactNode;
};

export function PageHero({ title, tagline, gradient, taglineColor, children }: PageHeroProps) {
  return (
    <header className="mb-3 text-center overflow-visible">
      <h1
        className={`songspot-wordmark px-4 pb-0.5 italic bg-gradient-to-b ${gradient} bg-clip-text text-transparent`}
      >
        {title}
      </h1>
      <p
        className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.24em] mt-0.5"
        style={{ color: taglineColor ?? 'var(--song-muted)' }}
      >
        {tagline}
      </p>
      {children && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 mt-2">
          {children}
        </div>
      )}
    </header>
  );
}

/**
 * One badge in a PageHero row. `tone` picks the surface treatment; `accent`
 * lets a page override the filled colour without inventing new paddings.
 */
export type HeroPillProps = {
  tone?: 'surface' | 'accent' | 'outline';
  /** Background and border colour for tone="accent" (defaults to the theme accent). */
  accent?: string;
  /** Border colour override, e.g. to mark an active filter on a surface pill. */
  borderColor?: string;
  /** Text colour; defaults per tone. */
  color?: string;
  title?: string;
  className?: string;
  children: React.ReactNode;
};

export function HeroPill({
  tone = 'surface',
  accent,
  borderColor,
  color,
  title,
  className = '',
  children,
}: HeroPillProps) {
  const base =
    'inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full border ' +
    'text-[11px] sm:text-xs font-bold shadow-sm whitespace-nowrap';

  const style: React.CSSProperties =
    tone === 'accent'
      ? {
          backgroundColor: accent ?? 'var(--song-accent)',
          borderColor: accent ?? 'var(--song-accent)',
          color: color ?? 'var(--song-accent-on)',
        }
      : tone === 'outline'
        ? {
            backgroundColor: 'transparent',
            borderColor: accent ?? 'var(--song-border)',
            color: color ?? 'var(--song-muted)',
          }
        : {
            backgroundColor: 'var(--song-surface)',
            borderColor: borderColor ?? 'var(--song-border)',
            color: color ?? 'var(--song-text)',
          };

  return (
    <span className={`${base} ${className}`} style={style} title={title}>
      {children}
    </span>
  );
}

/**
 * A HeroPill that is actually actionable. Same geometry as HeroPill so a row can
 * mix static badges and buttons without the sizes drifting apart.
 */
export function HeroPillButton({
  onClick,
  tone = 'surface',
  accent,
  borderColor,
  background,
  color,
  title,
  className = '',
  children,
}: HeroPillProps & { onClick: () => void; background?: string }) {
  const base =
    'inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full border ' +
    'text-[11px] sm:text-xs font-bold shadow-sm whitespace-nowrap cursor-pointer ' +
    'transition hover:brightness-110 active:scale-95';

  const style: React.CSSProperties =
    tone === 'accent'
      ? {
          backgroundColor: background ?? accent ?? 'var(--song-accent)',
          borderColor: borderColor ?? accent ?? 'var(--song-accent)',
          color: color ?? 'var(--song-accent-on)',
        }
      : {
          backgroundColor: background ?? 'var(--song-surface)',
          borderColor: borderColor ?? 'var(--song-border)',
          color: color ?? 'var(--song-text)',
        };

  return (
    <button type="button" onClick={onClick} className={`${base} ${className}`} style={style} title={title}>
      {children}
    </button>
  );
}

/** Thin separator used inside a multi-stat HeroPill. */
export function HeroPillDivider() {
  return <span className="opacity-30">|</span>;
}
