/**
 * Cookie / local-storage consent model.
 *
 * BeatDrop stores gameplay state locally and has no third-party trackers today, so the
 * categories below describe *client-side storage* as well as cookies. The consent record
 * itself is strictly necessary and is always written.
 *
 * Shared by server and client code; contains no browser-only APIs at module scope.
 */

export const CONSENT_COOKIE_NAME = 'beatdrop_consent';
export const CONSENT_STORAGE_KEY = 'beatdrop_consent';
export const CONSENT_VERSION = 1;
/** 180 days, in seconds. Re-prompt after expiry per common EU guidance. */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
export const CONSENT_CHANGE_EVENT = 'beatdrop:consent-change';

export type ConsentCategory = 'necessary' | 'preferences' | 'analytics';

export type ConsentChoices = {
  /** Always true. Session integrity, anti-cheat round tokens, consent record itself. */
  necessary: true;
  /** Theme, snippet duration, selected mode, streaks kept in localStorage. */
  preferences: boolean;
  /** Aggregate, non-identifying usage measurement. Off until opted in. */
  analytics: boolean;
};

export type ConsentRecord = ConsentChoices & {
  version: number;
  /** ISO-8601 timestamp of the decision. */
  decidedAt: string;
};

export const CONSENT_CATEGORIES: ReadonlyArray<{
  id: ConsentCategory;
  required: boolean;
  titleTh: string;
  titleEn: string;
  descriptionTh: string;
}> = [
  {
    id: 'necessary',
    required: true,
    titleTh: 'จำเป็นต่อการใช้งาน',
    titleEn: 'Strictly necessary',
    descriptionTh:
      'ใช้สำหรับความปลอดภัยของรอบเกม (round token), การจำกัดอัตราการเรียก API และการบันทึกตัวเลือกความยินยอมนี้ ' +
      'ไม่สามารถปิดได้เพราะเกมจะทำงานไม่ถูกต้อง',
  },
  {
    id: 'preferences',
    required: false,
    titleTh: 'การตั้งค่าและความชอบ',
    titleEn: 'Preferences',
    descriptionTh:
      'จำธีม ความยาวสนิปเพ็ต โหมดที่เลือกไว้ สถิติสตรีคและเวลาที่ดีที่สุดไว้ในอุปกรณ์ของคุณ ' +
      'หากปิด การตั้งค่าจะรีเซ็ตทุกครั้งที่เปิดเกมใหม่',
  },
  {
    id: 'analytics',
    required: false,
    titleTh: 'สถิติการใช้งาน',
    titleEn: 'Analytics',
    descriptionTh:
      'ช่วยให้เราเข้าใจภาพรวมว่าโหมดใดถูกเล่นมากที่สุดและหน้าไหนมีปัญหา โดยเก็บแบบรวมและไม่ระบุตัวบุคคล ' +
      'ปิดเป็นค่าเริ่มต้น',
  },
];

export const CONSENT_DENIED: ConsentChoices = {
  necessary: true,
  preferences: false,
  analytics: false,
};

export const CONSENT_GRANTED: ConsentChoices = {
  necessary: true,
  preferences: true,
  analytics: true,
};

/** Runtime validation — consent arrives from an untrusted cookie / storage string. */
export function parseConsent(raw: string | null | undefined): ConsentRecord | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== CONSENT_VERSION) return null;
  if (typeof record.decidedAt !== 'string') return null;
  const decidedAt = Date.parse(record.decidedAt);
  if (Number.isNaN(decidedAt)) return null;
  if (Date.now() - decidedAt > CONSENT_MAX_AGE_SECONDS * 1000) return null;
  return {
    necessary: true,
    preferences: record.preferences === true,
    analytics: record.analytics === true,
    version: CONSENT_VERSION,
    decidedAt: record.decidedAt,
  };
}

export function serializeConsent(choices: ConsentChoices): string {
  const record: ConsentRecord = {
    ...choices,
    necessary: true,
    version: CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
  };
  return JSON.stringify(record);
}

/**
 * Prefix used by every optional preference/stat key BeatDrop writes to localStorage
 * (theme, snippet preset, streaks, played-ids, player name, daily selections).
 * Withdrawing the `preferences` category purges exactly these keys.
 */
export const PREFERENCE_STORAGE_PREFIX = 'songspot:';

/** Removes all optional preference storage. Safe to call in any browser state. */
export function purgePreferenceStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(PREFERENCE_STORAGE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    /* storage blocked (private mode / disabled site data) — nothing to purge */
  }
}

export function readConsentCookie(): ConsentRecord | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${CONSENT_COOKIE_NAME}=`));
  if (!match) return null;
  try {
    return parseConsent(decodeURIComponent(match.slice(CONSENT_COOKIE_NAME.length + 1)));
  } catch {
    return null;
  }
}

export function writeConsentCookie(choices: ConsentChoices): ConsentRecord | null {
  if (typeof document === 'undefined') return null;
  const payload = serializeConsent(choices);
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie =
    `${CONSENT_COOKIE_NAME}=${encodeURIComponent(payload)}` +
    `; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, payload);
  } catch {
    /* mirror is best-effort; the cookie is authoritative */
  }
  return parseConsent(payload);
}
