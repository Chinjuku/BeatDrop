/**
 * Consent-gated facade over `localStorage` for optional preference/stat keys.
 *
 * Every key BeatDrop persists for convenience uses the `songspot:` prefix and must go
 * through this module so that denying the `preferences` consent category actually stops
 * reads and writes, not just purges once. Strictly necessary storage (round tokens,
 * `beatdrop_admin_key`, the consent cookie) bypasses this module on purpose.
 *
 * The gate is a module-level flag kept in sync by ConsentProvider, so call sites stay
 * synchronous and usable from inside `useState` initialisers and effects.
 */

import { PREFERENCE_STORAGE_PREFIX } from './consent';

let preferencesAllowed = false;

/** Called by ConsentProvider on hydration and on every consent change. */
export function setPreferenceStorageAllowed(allowed: boolean): void {
  preferencesAllowed = allowed;
}

export function isPreferenceStorageAllowed(): boolean {
  return preferencesAllowed;
}

function usable(key: string): boolean {
  if (typeof window === 'undefined') return false;
  if (!preferencesAllowed) return false;
  if (!key.startsWith(PREFERENCE_STORAGE_PREFIX)) {
    // Programmer error: a non-preference key must not be gated by consent.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[preferenceStorage] key "${key}" is missing the "${PREFERENCE_STORAGE_PREFIX}" prefix`);
    }
    return false;
  }
  return true;
}

/** Returns null when consent is absent, storage is blocked, or the key is unset. */
export function getPreference(key: string): string | null {
  if (!usable(key)) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** No-op when consent is absent or storage is blocked. */
export function setPreference(key: string, value: string): void {
  if (!usable(key)) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* quota exceeded or site data blocked */
  }
}

/** Always attempts removal, even without consent, so cleanup is never blocked. */
export function removePreference(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* site data blocked */
  }
}
