'use client';
/** Small presentational pieces shared by the room pages. No room state lives here. */
import React from 'react';

export function RoomCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`w-full rounded-2xl sm:rounded-3xl p-4 sm:p-6 border shadow-2xl ${className}`}
      style={{ backgroundColor: 'var(--song-surface)', borderColor: 'var(--song-border)' }}
    >
      {children}
    </section>
  );
}

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[11px] font-black uppercase tracking-wider mb-1.5"
      style={{ color: 'var(--song-muted)' }}
    >
      {children}
    </label>
  );
}

export const textInputClass =
  'w-full min-h-11 rounded-xl border px-3.5 text-base font-bold outline-none focus-visible:ring-2';

export const textInputStyle: React.CSSProperties = {
  backgroundColor: 'var(--song-surface-soft)',
  borderColor: 'var(--song-border)',
  color: 'var(--song-text)',
};

/** Single-choice row of buttons (radio group semantics). */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; hint?: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label}>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={`min-h-11 rounded-xl border px-3.5 py-2 text-left text-sm font-extrabold transition hover:brightness-110 ${o.hint ? 'flex-1 min-w-[9rem]' : ''}`}
              style={
                active
                  ? { backgroundColor: 'var(--song-accent)', borderColor: 'var(--song-accent)', color: 'var(--song-accent-on)' }
                  : { backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)', color: 'var(--song-text)' }
              }
            >
              <span className="block">{o.label}</span>
              {o.hint && (
                <span className="block text-xs font-semibold opacity-80 mt-0.5">{o.hint}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PrimaryButton({
  children,
  disabled,
  onClick,
  type = 'button',
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="w-full min-h-12 rounded-xl px-5 text-base font-extrabold transition hover:brightness-110 disabled:opacity-50"
      style={{ backgroundColor: 'var(--song-accent)', color: 'var(--song-accent-on)' }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 rounded-xl border px-4 text-sm font-bold transition hover:brightness-110"
      style={{ backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)', color: 'var(--song-text)' }}
    >
      {children}
    </button>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-sm font-bold" style={{ color: '#f87171' }}>
      {children}
    </p>
  );
}
