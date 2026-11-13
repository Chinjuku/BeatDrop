'use client';

import React, { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Cookie, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import { Modal } from './Modal';
import { useConsent } from '../context/ConsentContext';
import { CONSENT_CATEGORIES, shouldBlockForConsent } from '../lib/consent';

type View = 'intro' | 'customize';

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--song-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--song-surface)]';

/** Full-width on mobile, auto-width in the desktop button row. */
const ACTION_BASE =
  `w-full sm:w-auto rounded-xl px-4 py-3 sm:py-2.5 text-[13px] font-extrabold transition ${FOCUS_RING}`;

function PrimaryAction({ className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`${ACTION_BASE} shadow-lg hover:brightness-110 ${className}`}
      style={{ backgroundColor: 'var(--song-accent)', color: 'var(--song-accent-on)' }}
    />
  );
}

function SecondaryAction({ className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`${ACTION_BASE} border hover:bg-white/5 ${className}`}
      style={{ borderColor: 'var(--song-border)', color: 'var(--song-text)' }}
    />
  );
}

/**
 * Consent gate.
 *
 * With no stored decision this is a blocking dialog: no backdrop dismiss, no Escape,
 * no close button. The only ways out are "accept all" and "necessary only", which are
 * given equal visual weight so refusing stays as easy as accepting.
 *
 * Reopened later from the footer it behaves like every other modal and is dismissible.
 */
export const CookieConsent: React.FC = () => {
  const {
    consent,
    needsDecision,
    preferencesOpen,
    closePreferences,
    acceptAll,
    rejectOptional,
    save,
  } = useConsent();

  const headingId = useId();
  const pathname = usePathname();

  // The dialog is required reading, and it links to the policies. Blocking those two
  // routes would make those links dead ends, so the gate stands down there — the
  // decision is still required everywhere the game is actually playable.
  // needsDecision is false during hydration too, so this also avoids a first-paint flash.
  const blocking = shouldBlockForConsent(pathname, !needsDecision);
  const open = blocking || preferencesOpen;

  const [view, setView] = useState<View>('intro');
  const [draftPreferences, setDraftPreferences] = useState(true);
  const [draftAnalytics, setDraftAnalytics] = useState(false);

  // Re-seed each time the dialog opens so "cancel" and "back" really revert.
  useEffect(() => {
    if (!open) return;
    setDraftPreferences(consent?.preferences ?? true);
    setDraftAnalytics(consent?.analytics ?? false);
    // Reopening from the footer means "let me adjust", so skip the intro.
    setView(blocking ? 'intro' : 'customize');
  }, [open, blocking, consent]);

  if (!open) return null;

  const draft: Record<string, boolean> = {
    necessary: true,
    preferences: draftPreferences,
    analytics: draftAnalytics,
  };

  const setDraft = (id: string, next: boolean) => {
    if (id === 'preferences') setDraftPreferences(next);
    if (id === 'analytics') setDraftAnalytics(next);
  };

  return (
    <Modal
      open={open}
      onClose={blocking ? () => {} : closePreferences}
      title="การตั้งค่าคุกกี้"
      labelledBy={headingId}
      placement="bottom"
      dismissOnBackdrop={!blocking}
      dismissOnEscape={!blocking}
      panelClassName="sm:!max-w-xl"
    >
      {/* Header — fixed, never scrolls away */}
      <div
        className="shrink-0 border-b px-4 py-3.5 sm:px-6 sm:py-4"
        style={{ borderColor: 'var(--song-border)' }}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--song-accent) 15%, transparent)',
              color: 'var(--song-accent-text)',
            }}
          >
            <Cookie className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={headingId} className="text-[15px] sm:text-lg font-extrabold leading-tight tracking-tight">
              {view === 'intro' ? 'คุกกี้และการจัดเก็บข้อมูล' : 'ตั้งค่าคุกกี้ของคุณ'}
            </h2>
            <p
              className="mt-1 text-[11px] sm:text-xs font-semibold leading-relaxed"
              style={{ color: 'var(--song-muted)' }}
            >
              {view === 'intro'
                ? 'เลือกก่อนเริ่มเล่น เปลี่ยนได้ทุกเมื่อจากด้านล่างของหน้า'
                : 'เปิดหรือปิดแต่ละหมวดได้ตามต้องการ'}
            </p>
          </div>
          {!blocking && (
            <button
              type="button"
              onClick={closePreferences}
              aria-label="ปิด"
              className={`-mr-1 shrink-0 rounded-full p-2 transition hover:bg-white/10 ${FOCUS_RING}`}
              style={{ color: 'var(--song-muted)' }}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Body — the only scrolling region, so the actions always stay reachable */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
        {view === 'intro' ? (
          <div className="space-y-3 text-xs sm:text-[13px] leading-relaxed" style={{ color: 'var(--song-muted)' }}>
            <p>
              BeatDrop ใช้ที่จัดเก็บข้อมูล<strong style={{ color: 'var(--song-text)' }}>ที่จำเป็น</strong>
              ต่อการเล่นเกมและความปลอดภัยของรอบเกมเสมอ
            </p>
            <p>
              ส่วนที่<strong style={{ color: 'var(--song-text)' }}>เป็นทางเลือก</strong> คือการจำการตั้งค่าของคุณ
              (ธีม ความยาวสนิปเพ็ต สตรีค) และสถิติการใช้งานแบบไม่ระบุตัวบุคคล
              เราจะใช้เฉพาะเมื่อคุณอนุญาตเท่านั้น
            </p>
            <ul className="space-y-1.5 pt-0.5">
              {CONSENT_CATEGORIES.map((category) => (
                <li key={category.id} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: 'var(--song-accent)' }}
                  />
                  <span className="font-bold" style={{ color: 'var(--song-text)' }}>
                    {category.titleTh}
                  </span>
                  {category.required && <span className="text-[10px] font-bold opacity-60">(เปิดอยู่เสมอ)</span>}
                </li>
              ))}
            </ul>
            <p className="pt-0.5">
              อ่านรายละเอียดได้ที่{' '}
              <Link
                href="/cookies"
                className="font-bold underline underline-offset-2"
                style={{ color: 'var(--song-accent-text)' }}
              >
                นโยบายคุกกี้
              </Link>{' '}
              และ{' '}
              <Link
                href="/privacy"
                className="font-bold underline underline-offset-2"
                style={{ color: 'var(--song-accent-text)' }}
              >
                นโยบายความเป็นส่วนตัว
              </Link>
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {CONSENT_CATEGORIES.map((category) => {
              const checked = category.required ? true : draft[category.id] === true;
              return (
                <div
                  key={category.id}
                  className="rounded-xl border p-3 sm:p-3.5"
                  style={{ borderColor: 'var(--song-border)', backgroundColor: 'var(--song-surface-soft)' }}
                >
                  <label className={`flex cursor-pointer items-start gap-3 ${category.required ? 'cursor-default' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={category.required}
                      onChange={(event) => setDraft(category.id, event.target.checked)}
                      aria-describedby={`consent-desc-${category.id}`}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-extrabold leading-tight">
                        <span>{category.titleTh}</span>
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider opacity-55"
                          style={{ color: 'var(--song-muted)' }}
                        >
                          {category.titleEn}
                        </span>
                        {category.required && (
                          <span
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold"
                            style={{
                              backgroundColor: 'color-mix(in srgb, var(--song-accent) 18%, transparent)',
                              color: 'var(--song-accent-text)',
                            }}
                          >
                            <ShieldCheck aria-hidden="true" className="h-3 w-3" />
                            เปิดอยู่เสมอ
                          </span>
                        )}
                      </span>
                      <span
                        id={`consent-desc-${category.id}`}
                        className="mt-1.5 block text-[11px] leading-relaxed"
                        style={{ color: 'var(--song-muted)' }}
                      >
                        {category.descriptionTh}
                      </span>
                    </span>
                  </label>
                </div>
              );
            })}
            <p className="pt-0.5 text-[11px] leading-relaxed" style={{ color: 'var(--song-muted)' }}>
              หากปิด &ldquo;การตั้งค่าและความชอบ&rdquo; ข้อมูลที่บันทึกไว้ในเครื่อง เช่น ธีม สตรีค และชื่อผู้เล่น
              จะถูกลบทันทีเมื่อกดบันทึก
            </p>
          </div>
        )}
      </div>

      {/* Actions — fixed, safe-area aware, stacked on mobile */}
      <div
        className="shrink-0 border-t px-4 py-3.5 sm:px-6 sm:py-4"
        style={{ borderColor: 'var(--song-border)' }}
      >
        {view === 'intro' ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SecondaryAction onClick={() => setView('customize')} className="sm:mr-auto sm:order-1">
              <span className="inline-flex items-center justify-center gap-1.5">
                <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
                ตั้งค่าเอง
              </span>
            </SecondaryAction>
            {/* Reject is a sibling of accept, same size — not a buried link. */}
            <SecondaryAction onClick={rejectOptional} className="sm:order-2">
              ใช้เฉพาะที่จำเป็น
            </SecondaryAction>
            <PrimaryAction onClick={acceptAll} className="sm:order-3">
              ยอมรับทั้งหมด
            </PrimaryAction>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {blocking ? (
              <SecondaryAction onClick={() => setView('intro')} className="sm:mr-auto sm:order-1">
                ย้อนกลับ
              </SecondaryAction>
            ) : (
              <SecondaryAction onClick={closePreferences} className="sm:mr-auto sm:order-1">
                ยกเลิก
              </SecondaryAction>
            )}
            <SecondaryAction onClick={rejectOptional} className="sm:order-2">
              ปฏิเสธทั้งหมด
            </SecondaryAction>
            <PrimaryAction
              onClick={() => save({ preferences: draftPreferences, analytics: draftAnalytics })}
              className="sm:order-3"
            >
              บันทึกการตั้งค่า
            </PrimaryAction>
          </div>
        )}
      </div>
    </Modal>
  );
};
