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
  /**
   * Set false for a blocking dialog that must be resolved by an explicit choice
   * (e.g. the cookie consent gate). Combine with dismissOnBackdrop={false} and
   * omit any close affordance, otherwise keyboard users get trapped with no exit.
   */
  dismissOnEscape?: boolean;
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
let lockedScrollY = 0;

/** Phones and tablets get a bottom sheet instead of a centered dialog (Tailwind `lg` = 1024px). */
const SHEET_MEDIA_QUERY = '(max-width: 1023px)';
/** Drag distance (px) or release velocity (px/ms) that dismisses the sheet. */
const SHEET_CLOSE_DISTANCE = 110;
const SHEET_CLOSE_VELOCITY = 0.55;
const SHEET_EXIT_MS = 200;

function useIsSheetViewport(): boolean {
  const [isSheet, setIsSheet] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(SHEET_MEDIA_QUERY);
    const sync = () => setIsSheet(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return isSheet;
}

/** Nearest scrollable ancestor of `el` inside `boundary` (inclusive), or null. */
function findScrollable(el: Element | null, boundary: HTMLElement): HTMLElement | null {
  let node: Element | null = el;
  while (node && node instanceof HTMLElement) {
    const { overflowY } = window.getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) {
      return node;
    }
    if (node === boundary) break;
    node = node.parentElement;
  }
  return null;
}

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
  dismissOnEscape = true,
  labelledBy,
}: ModalProps) {
  const generatedId = useId();
  const titleId = labelledBy || `dialog-title-${generatedId}`;
  const descriptionId = description ? `dialog-description-${generatedId}` : undefined;
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const dismissOnEscapeRef = useRef(dismissOnEscape);
  const [mounted, setMounted] = useState(false);
  const isSheetViewport = useIsSheetViewport();
  // Centered and bottom dialogs become a swipeable bottom sheet on phones and tablets.
  // The fullscreen search and the side navigation drawer keep their own layouts.
  const sheet = isSheetViewport && (placement === 'center' || placement === 'bottom');
  // A blocking dialog (dismissOnEscape=false, e.g. the consent gate) can never be swiped
  // or tapped away. Every other dialog closes on swipe-down or a tap outside on mobile,
  // even when it opts out of backdrop dismissal on desktop.
  const sheetDismissible = sheet && dismissOnEscape;
  const sheetDismissibleRef = useRef(sheetDismissible);
  useEffect(() => { sheetDismissibleRef.current = sheetDismissible; }, [sheetDismissible]);
  const closingRef = useRef(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { dismissOnEscapeRef.current = dismissOnEscape; }, [dismissOnEscape]);

  useEffect(() => {
    if (!open || !mounted) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    activeModalsCount++;
    if (activeModalsCount === 1) {
      // iOS Safari ignores overflow:hidden on <body>, so pin the body in place instead;
      // otherwise the page behind scrolls while the user drags inside the dialog.
      lockedScrollY = window.scrollY;
      const body = document.body.style;
      body.overflow = 'hidden';
      body.position = 'fixed';
      body.top = `-${lockedScrollY}px`;
      body.left = '0';
      body.right = '0';
      body.width = '100%';
    }

    const focusables = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      .filter((el) => el.getAttribute('aria-hidden') !== 'true');
    const focusFirst = () => {
      // A field that focused itself (e.g. the search input opened from a tap) keeps focus,
      // otherwise the mobile keyboard would close again.
      if (panelRef.current?.contains(document.activeElement)) return;
      const preferred = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]');
      (preferred ?? focusables()[0] ?? panelRef.current)?.focus({ preventScroll: true });
    };
    const frame = window.requestAnimationFrame(focusFirst);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Always swallow the key so it cannot bubble to another handler, but only
        // close when this dialog is dismissible.
        event.preventDefault();
        if (dismissOnEscapeRef.current) onCloseRef.current();
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
        const body = document.body.style;
        body.overflow = '';
        body.position = '';
        body.top = '';
        body.left = '';
        body.right = '';
        body.width = '';
        window.scrollTo(0, lockedScrollY);
      }
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, [open, mounted]);

  /** Slide the sheet out, then close. Shared by swipe-down and backdrop tap. */
  const dismissSheet = () => {
    const panel = panelRef.current;
    if (closingRef.current) return;
    closingRef.current = true;
    if (panel && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      panel.style.transition = `transform ${SHEET_EXIT_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`;
      panel.style.transform = 'translateY(100%)';
      window.setTimeout(() => onCloseRef.current(), SHEET_EXIT_MS);
    } else {
      onCloseRef.current();
    }
  };
  const dismissSheetRef = useRef(dismissSheet);
  dismissSheetRef.current = dismissSheet;

  useEffect(() => {
    if (open) closingRef.current = false;
  }, [open]);

  // Swipe-down-to-dismiss. Native listeners so touchmove can be non-passive and stop the
  // page from rubber-banding while the sheet follows the finger.
  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !mounted || !sheet || !panel) return;

    let startY = 0;
    let startX = 0;
    let startTime = 0;
    let dy = 0;
    let tracking = false;
    let dragging = false;

    const reset = () => {
      panel.style.transition = 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)';
      panel.style.transform = '';
    };

    const onStart = (event: TouchEvent) => {
      if (!sheetDismissibleRef.current || event.touches.length !== 1) return;
      const target = event.target as Element | null;
      // Sliders and text fields need their own vertical gestures.
      if (target?.closest('input[type="range"], textarea, select, [data-sheet-no-drag]')) return;
      const scroller = findScrollable(target, panel);
      // Content scrolled down: let the finger scroll it back up first, like native sheets.
      if (scroller && scroller.scrollTop > 0) return;
      startY = event.touches[0].clientY;
      startX = event.touches[0].clientX;
      startTime = performance.now();
      dy = 0;
      tracking = true;
      dragging = false;
    };

    const onMove = (event: TouchEvent) => {
      if (!tracking) return;
      const deltaY = event.touches[0].clientY - startY;
      const deltaX = event.touches[0].clientX - startX;
      if (!dragging) {
        if (Math.abs(deltaX) > Math.abs(deltaY) || deltaY < 0) {
          // Horizontal swipe or scrolling content upward: not a dismiss gesture.
          if (Math.abs(deltaX) > 6 || deltaY < -6) tracking = false;
          return;
        }
        if (deltaY < 6) return;
        dragging = true;
        panel.style.transition = 'none';
      }
      dy = Math.max(0, deltaY);
      event.preventDefault();
      panel.style.transform = `translateY(${dy}px)`;
    };

    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      dragging = false;
      const elapsed = Math.max(1, performance.now() - startTime);
      if (dy > SHEET_CLOSE_DISTANCE || (dy > 40 && dy / elapsed > SHEET_CLOSE_VELOCITY)) {
        dismissSheetRef.current();
      } else {
        reset();
      }
    };

    panel.addEventListener('touchstart', onStart, { passive: true });
    panel.addEventListener('touchmove', onMove, { passive: false });
    panel.addEventListener('touchend', onEnd);
    panel.addEventListener('touchcancel', onEnd);
    return () => {
      panel.removeEventListener('touchstart', onStart);
      panel.removeEventListener('touchmove', onMove);
      panel.removeEventListener('touchend', onEnd);
      panel.removeEventListener('touchcancel', onEnd);
      panel.style.transition = '';
      panel.style.transform = '';
    };
  }, [open, mounted, sheet]);

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

  // Feature dialogs that draw their own card inside a transparent panel: the sheet styling
  // is applied to that inner card instead (see .bd-sheet--wrapped in globals.css).
  const wrapsOwnCard = panelClassName.includes('!bg-transparent');

  return createPortal(
    <div
      className={`fixed inset-0 z-[150] flex ${sheet ? 'bd-sheet-root items-end justify-center p-0' : rootPosition} bg-[var(--modal-backdrop)] backdrop-blur-sm ${className}`}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (sheet ? sheetDismissible : dismissOnBackdrop) {
          if (sheet) dismissSheet();
          else onCloseRef.current();
        }
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
        className={
          sheet
            ? `bd-sheet ${wrapsOwnCard ? 'bd-sheet--wrapped' : 'bd-sheet--panel'} relative flex flex-col outline-none ${panelClassName}`
            : `relative flex flex-col overflow-hidden border shadow-2xl outline-none ${panelPosition} ${panelClassName}`
        }
        style={{ backgroundColor: 'var(--modal-surface)', borderColor: 'var(--modal-border)', color: 'var(--modal-text)' }}
      >
        {sheetDismissible && (
          <div className="bd-sheet-handle" aria-hidden="true">
            <span />
          </div>
        )}
        <span id={titleId} className="sr-only">{title}</span>
        {description && <span id={descriptionId} className="sr-only">{description}</span>}
        {children}
      </div>
    </div>,
    document.body,
  );
}
