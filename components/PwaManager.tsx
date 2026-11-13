'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getPreference, setPreference } from '../lib/preferenceStorage';

const STORAGE_INSTALL_DISMISSED = 'songspot:install-dismissed';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(
        `/sw.js?v=${encodeURIComponent(process.env.NEXT_PUBLIC_PWA_BUILD_VERSION || 'dev')}`,
        { scope: '/' }
      )
      .catch((error) => {
        console.warn('[BeatDrop PWA] Service Worker registration failed:', error);
        registrationPromise = null;
        return null;
      });
  }
  return registrationPromise;
}

interface PwaManagerProps {
  /** Only offer installation once the player has engaged (e.g. finished a round). */
  canOfferInstall?: boolean;
}

export function PwaManager({ canOfferInstall = false }: PwaManagerProps) {
  const t = useTranslations('Pwa');
  const [online, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [updateWaiting, setUpdateWaiting] = useState(false);
  const [iosHelpOpen, setIosHelpOpen] = useState(false);
  const [iosInstallAvailable, setIosInstallAvailable] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const updateRequestedRef = useRef(false);
  const reloadStartedRef = useRef(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    setInstallDismissed(getPreference(STORAGE_INSTALL_DISMISSED) === 'true');
    const updateOnline = () => setOnline(true);
    const updateOffline = () => setOnline(false);
    const checkStandalone = () => {
      setStandalone(
        window.matchMedia('(display-mode: standalone)').matches ||
          Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
      );
    };
    checkStandalone();
    const displayMode = window.matchMedia('(display-mode: standalone)');
    displayMode.addEventListener?.('change', checkStandalone);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOffline);

    const userAgent = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS/.test(userAgent);
    setIosInstallAvailable(isIos && isSafari);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);

    let cancelled = false;
    let registration: ServiceWorkerRegistration | null = null;
    let onUpdateFound: (() => void) | null = null;
    const onControllerChange = () => {
      if (updateRequestedRef.current && !reloadStartedRef.current) {
        reloadStartedRef.current = true;
        window.location.reload();
      }
    };
    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'BEATDROP_UPDATE_ACTIVATED' && !reloadStartedRef.current) {
        reloadStartedRef.current = true;
        window.location.reload();
      }
    };
    navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange);
    navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage);

    registerServiceWorker().then((value) => {
      if (cancelled || !value) return;
      registration = value;
      if (value.waiting && navigator.serviceWorker.controller) setUpdateWaiting(true);
      onUpdateFound = () => {
        const installing = value.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateWaiting(true);
          }
        });
      };
      value.addEventListener('updatefound', onUpdateFound);
      void value.update().catch(() => {});
    });

    return () => {
      cancelled = true;
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOffline);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      displayMode.removeEventListener?.('change', checkStandalone);
      navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
      navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage);
      if (registration && onUpdateFound) {
        registration.removeEventListener('updatefound', onUpdateFound);
      }
    };
  }, []);

  const applyUpdate = useCallback(async () => {
    const registration = await registerServiceWorker();
    if (!registration?.waiting) return;
    updateRequestedRef.current = true;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) {
      if (iosInstallAvailable) setIosHelpOpen((open) => !open);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstallPrompt(null);
  }, [installPrompt, iosInstallAvailable]);

  const dismissInstall = useCallback(() => {
    setInstallDismissed(true);
    setIosHelpOpen(false);
    setPreference(STORAGE_INSTALL_DISMISSED, 'true');
  }, []);

  const showInstall =
    canOfferInstall &&
    !installDismissed &&
    !standalone &&
    (installPrompt !== null || iosInstallAvailable);

  return (
    <>
      {(!online || updateWaiting) && (
        <div className="pwa-status" role="status" aria-live="polite">
          {!online && (
            <span>{t('offline')}</span>
          )}
          {updateWaiting && online && (
            <>
              <span>{t('updateAvailable')}</span>
              <button type="button" onClick={applyUpdate}>{t('refreshToUpdate')}</button>
            </>
          )}
        </div>
      )}
      {showInstall && (
        <div className="pwa-install-help">
          <button type="button" onClick={install} aria-expanded={iosHelpOpen}>
            {iosInstallAvailable ? t('addToHomeScreen') : t('install')}
          </button>
          <button
            type="button"
            className="pwa-install-dismiss"
            onClick={dismissInstall}
            aria-label={t('dismissInstall')}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
          {iosHelpOpen && iosInstallAvailable && (
            <p>{t('iosHelp')}</p>
          )}
        </div>
      )}
    </>
  );
}
