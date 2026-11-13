'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  CONSENT_CHANGE_EVENT,
  CONSENT_DENIED,
  CONSENT_GRANTED,
  CONSENT_STORAGE_KEY,
  purgePreferenceStorage,
  readConsentCookie,
  writeConsentCookie,
  type ConsentCategory,
  type ConsentChoices,
  type ConsentRecord,
} from '../lib/consent';
import { setPreferenceStorageAllowed } from '../lib/preferenceStorage';

type ConsentContextValue = {
  /** null until hydrated on the client, or when no valid decision is stored. */
  consent: ConsentRecord | null;
  /** True once the client has read storage — use to avoid SSR/first-paint flashes. */
  ready: boolean;
  /** True when a decision is still needed (show the banner). */
  needsDecision: boolean;
  /** True while the preference centre is open. */
  preferencesOpen: boolean;
  openPreferences: () => void;
  closePreferences: () => void;
  acceptAll: () => void;
  rejectOptional: () => void;
  save: (choices: Omit<ConsentChoices, 'necessary'>) => void;
  hasConsent: (category: ConsentCategory) => boolean;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

export const ConsentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Read the cookie during render, not in an effect: child effects run BEFORE parent
  // effects, so the storage gate must already be set when GameContext/ThemeContext
  // hydrate their saved preferences on mount. Returns null on the server.
  const [consent, setConsent] = useState<ConsentRecord | null>(() => {
    const stored = readConsentCookie();
    setPreferenceStorageAllowed(stored?.preferences === true);
    return stored;
  });
  // `ready` stays false through hydration so the banner never causes a markup mismatch.
  const [ready, setReady] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => {
    // The cookie is authoritative. If it is gone the decision expired or was cleared,
    // so drop the stale localStorage mirror and re-prompt.
    if (!readConsentCookie()) {
      try {
        window.localStorage.removeItem(CONSENT_STORAGE_KEY);
      } catch {
        /* storage blocked */
      }
    }
    setReady(true);
  }, []);

  // Keep every open tab in sync.
  useEffect(() => {
    const sync = () => {
      const next = readConsentCookie();
      setPreferenceStorageAllowed(next?.preferences === true);
      setConsent(next);
    };
    window.addEventListener(CONSENT_CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CONSENT_CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const commit = useCallback((choices: ConsentChoices) => {
    const record = writeConsentCookie(choices);
    setPreferenceStorageAllowed(choices.preferences === true);
    if (!choices.preferences) purgePreferenceStorage();
    setConsent(record);
    setPreferencesOpen(false);
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
  }, []);

  const value = useMemo<ConsentContextValue>(
    () => ({
      consent,
      ready,
      needsDecision: ready && consent === null,
      preferencesOpen,
      openPreferences: () => setPreferencesOpen(true),
      closePreferences: () => setPreferencesOpen(false),
      acceptAll: () => commit(CONSENT_GRANTED),
      rejectOptional: () => commit(CONSENT_DENIED),
      save: (choices) =>
        commit({
          necessary: true,
          preferences: choices.preferences === true,
          analytics: choices.analytics === true,
        }),
      hasConsent: (category) => {
        if (category === 'necessary') return true;
        return consent ? consent[category] === true : false;
      },
    }),
    [commit, consent, preferencesOpen, ready]
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
};

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error('useConsent must be used within a ConsentProvider');
  return ctx;
}
