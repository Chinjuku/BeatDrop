'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  panelClassName?: string;
  placement?: 'center' | 'bottom' | 'right' | 'fullscreen';
  dismissOnBackdrop?: boolean;
  labelledBy?: string;
};

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let activeModalsCount = 0;

/** Shared accessible overlay behavior. Content remains owned by each feature. */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className = '',
  panelClassName = '',
  placement = 'center',
  dismissOnBackdrop = true,
  labelledBy,
}: ModalProps) {
  const generatedId = useId();
  const titleId = labelledBy || `dialog-title-${generatedId}`;
  const descriptionId = description ? `dialog-description-${generatedId}` : undefined;
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open || !mounted) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    activeModalsCount++;
    if (activeModalsCount === 1) {
      document.body.style.overflow = 'hidden';
    }

    const focusables = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      .filter((el) => el.getAttribute('aria-hidden') !== 'true');
    const focusFirst = () => (focusables()[0] ?? panelRef.current)?.focus();
    const frame = window.requestAnimationFrame(focusFirst);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      } else if (event.key === 'Tab') {
        const elements = focusables();
        if (!elements.length) {
          event.preventDefault();
          panelRef.current?.focus();
          return;
        }
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && (
          document.activeElement === first ||
          document.activeElement === panelRef.current ||
          !panelRef.current?.contains(document.activeElement)
        )) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (
          document.activeElement === last ||
          document.activeElement === panelRef.current ||
          !panelRef.current?.contains(document.activeElement)
        )) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      activeModalsCount = Math.max(0, activeModalsCount - 1);
      if (activeModalsCount === 0) {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
      }
      previousFocusRef.current?.focus();
    };
  }, [open, mounted]);

  if (!open || !mounted) return null;

  const rootPosition = {
    center: 'items-center justify-center p-2 sm:p-6',
    bottom: 'items-end justify-center p-0 sm:items-center sm:p-6',
    right: 'items-stretch justify-end p-0',
    fullscreen: 'items-stretch justify-center p-0',
  }[placement];
  const panelPosition = {
    center: 'w-[calc(100vw-16px)] sm:w-full max-h-[92dvh] rounded-2xl sm:rounded-3xl',
    bottom: 'w-full max-h-[92dvh] rounded-t-3xl sm:w-full sm:max-w-2xl sm:rounded-3xl pb-[env(safe-area-inset-bottom,0px)]',
    right: 'w-[min(88vw,380px)] h-full max-h-[100dvh] rounded-l-3xl pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]',
    fullscreen: 'w-full h-full max-h-[100dvh] rounded-none pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]',
  }[placement];

  return createPortal(
    <div
      className={`fixed inset-0 z-[150] flex ${rootPosition} bg-[var(--modal-backdrop)] backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150 ${className}`}
      onMouseDown={(event) => {
        if (dismissOnBackdrop && event.target === event.currentTarget) onCloseRef.current();
      }}
      data-modal-root="true"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={`relative flex flex-col overflow-hidden border shadow-2xl outline-none ${panelPosition} ${panelClassName}`}
        style={{ backgroundColor: 'var(--modal-surface)', borderColor: 'var(--modal-border)', color: 'var(--modal-text)' }}
      >
        <span id={titleId} className="sr-only">{title}</span>
        {description && <span id={descriptionId} className="sr-only">{description}</span>}
        {children}
      </div>
    </div>,
    document.body,
  );
}
