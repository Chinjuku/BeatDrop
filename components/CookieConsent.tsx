'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cookie, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { Modal } from './Modal';
import { useConsent } from '../context/ConsentContext';
import { CONSENT_CATEGORIES } from '../lib/consent';

const buttonBase =
  'rounded-xl px-4 py-2.5 text-xs sm:text-[13px] font-extrabold transition focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black';

function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props;
  return (
    <button
      type="button"
      {...rest}
      className={`${buttonBase} hover:brightness-110 shadow-lg ${className}`}
      style={{
        backgroundColor: 'var(--song-accent)',
        color: 'var(--song-accent-on)',
        ...(props.style || {}),
      }}
    />
  );
}

function GhostButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props;
  return (
    <button
      type="button"
      {...rest}
      className={`${buttonBase} border hover:bg-white/5 ${className}`}
      style={{
        borderColor: 'var(--song-border)',
        color: 'var(--song-text)',
        ...(props.style || {}),
      }}
    />
  );
}

/** Banner + preference centre. Rendered once from the app shell. */
export const CookieConsent: React.FC = () => {
  const {
    consent,
    needsDecision,
    preferencesOpen,
    openPreferences,
    closePreferences,
    acceptAll,
    rejectOptional,
    save,
  } = useConsent();

  const [draftPreferences, setDraftPreferences] = useState(false);
  const [draftAnalytics, setDraftAnalytics] = useState(false);

  // Re-seed the draft each time the dialog opens so Cancel really cancels.
  useEffect(() => {
    if (!preferencesOpen) return;
    setDraftPreferences(consent?.preferences ?? true);
    setDraftAnalytics(consent?.analytics ?? false);
  }, [preferencesOpen, consent]);

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
    <>
      {needsDecision && (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby="cookie-banner-title"
          aria-describedby="cookie-banner-desc"
          className="fixed inset-x-0 bottom-0 z-[70] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 sm:px-6 sm:pb-6"
        >
          <div
            className="mx-auto w-full max-w-3xl rounded-2xl border p-4 sm:p-5 shadow-2xl backdrop-blur-xl"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--song-surface) 92%, transparent)',
              borderColor: 'var(--song-border)',
              color: 'var(--song-text)',
            }}
          >
            <div className="flex items-start gap-3">
              <Cookie
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0"
                style={{ color: 'var(--song-accent)' }}
              />
              <div className="min-w-0 flex-1">
                <h2 id="cookie-banner-title" className="text-sm sm:text-base font-extrabold tracking-tight">
                  คุกกี้และการจัดเก็บข้อมูลในเครื่อง
                </h2>
                <p
                  id="cookie-banner-desc"
                  className="mt-1.5 text-[11px] sm:text-xs leading-relaxed"
                  style={{ color: 'var(--song-muted)' }}
                >
                  BeatDrop ใช้ที่จัดเก็บข้อมูลที่จำเป็นต่อการเล่นเกมเสมอ และจะใช้ส่วนที่เป็นทางเลือก
                  (การจำการตั้งค่า และสถิติการใช้งานแบบไม่ระบุตัวบุคคล) เฉพาะเมื่อคุณอนุญาต{' '}
                  <Link
                    href="/cookies"
                    className="font-bold underline underline-offset-2 hover:brightness-125"
                    style={{ color: 'var(--song-accent-text)' }}
                  >
                    นโยบายคุกกี้
                  </Link>{' '}
                  ·{' '}
                  <Link
                    href="/privacy"
                    className="font-bold underline underline-offset-2 hover:brightness-125"
                    style={{ color: 'var(--song-accent-text)' }}
                  >
                    นโยบายความเป็นส่วนตัว
                  </Link>
                </p>
                <div className="mt-3.5 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <PrimaryButton onClick={acceptAll} className="sm:order-3">
                    ยอมรับทั้งหมด
                  </PrimaryButton>
                  <GhostButton onClick={rejectOptional} className="sm:order-2">
                    ใช้เฉพาะที่จำเป็น
                  </GhostButton>
                  <GhostButton onClick={openPreferences} className="sm:order-1 sm:mr-auto">
                    <span className="inline-flex items-center gap-1.5">
                      <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
                      ตั้งค่าเอง
                    </span>
                  </GhostButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={preferencesOpen}
        onClose={closePreferences}
        title="การตั้งค่าคุกกี้"
        description="เลือกประเภทข้อมูลที่ให้ BeatDrop จัดเก็บในอุปกรณ์ของคุณ เปลี่ยนแปลงได้ทุกเมื่อจากลิงก์ด้านล่างของหน้า"
        placement="center"
      >
        <div className="space-y-3">
          {CONSENT_CATEGORIES.map((category) => {
            const checked = category.required ? true : draft[category.id] === true;
            return (
              <div
                key={category.id}
                className="rounded-xl border p-3.5"
                style={{ borderColor: 'var(--song-border)', backgroundColor: 'var(--song-surface-soft)' }}
              >
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={category.required}
                    onChange={(event) => setDraft(category.id, event.target.checked)}
                    aria-describedby={`consent-desc-${category.id}`}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-xs sm:text-sm font-extrabold">
                      {category.titleTh}
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider opacity-60"
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

          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--song-muted)' }}>
            หากปิด &ldquo;การตั้งค่าและความชอบ&rdquo; ข้อมูลที่บันทึกไว้ในเครื่อง เช่น ธีม สตรีค และชื่อผู้เล่น
            จะถูกลบทันทีเมื่อกดบันทึก
          </p>

          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
            <GhostButton onClick={closePreferences}>ยกเลิก</GhostButton>
            <GhostButton onClick={rejectOptional}>ปฏิเสธทั้งหมด</GhostButton>
            <PrimaryButton
              onClick={() => save({ preferences: draftPreferences, analytics: draftAnalytics })}
            >
              บันทึกการตั้งค่า
            </PrimaryButton>
          </div>
        </div>
      </Modal>
    </>
  );
};
