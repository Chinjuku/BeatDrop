/**
 * Consent model + gated preference storage regression checks.
 * Run: npm run test:consent
 */
import assert from 'node:assert/strict';

import {
  CONSENT_CATEGORIES,
  CONSENT_DENIED,
  CONSENT_GRANTED,
  CONSENT_MAX_AGE_SECONDS,
  CONSENT_VERSION,
  PREFERENCE_STORAGE_PREFIX,
  parseConsent,
  purgePreferenceStorage,
  readConsentCookie,
  serializeConsent,
  writeConsentCookie,
} from '../lib/consent';

class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }
  getItem(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

const storage = new MemoryStorage();
let cookieJar = '';

// Minimal DOM surface the consent helpers touch.
(globalThis as any).window = {
  localStorage: storage,
  location: { protocol: 'https:' },
};
(globalThis as any).document = {
  get cookie() {
    return cookieJar;
  },
  set cookie(value: string) {
    const [pair] = value.split(';');
    const name = pair.slice(0, pair.indexOf('='));
    const others = cookieJar
      .split('; ')
      .filter((part) => part && !part.startsWith(`${name}=`));
    others.push(pair);
    cookieJar = others.join('; ');
  },
};

// --- parseConsent: untrusted input -----------------------------------------
assert.equal(parseConsent(null), null, 'null input rejected');
assert.equal(parseConsent(''), null, 'empty input rejected');
assert.equal(parseConsent('not json'), null, 'malformed JSON rejected');
assert.equal(parseConsent('"a string"'), null, 'non-object rejected');
assert.equal(parseConsent('[]') , null, 'array rejected');
assert.equal(
  parseConsent(JSON.stringify({ version: CONSENT_VERSION + 1, preferences: true, decidedAt: new Date().toISOString() })),
  null,
  'stale schema version rejected'
);
assert.equal(
  parseConsent(JSON.stringify({ version: CONSENT_VERSION, preferences: true })),
  null,
  'missing decidedAt rejected'
);
assert.equal(
  parseConsent(JSON.stringify({ version: CONSENT_VERSION, preferences: true, decidedAt: 'nope' })),
  null,
  'unparseable decidedAt rejected'
);

const expired = new Date(Date.now() - (CONSENT_MAX_AGE_SECONDS + 60) * 1000).toISOString();
assert.equal(
  parseConsent(JSON.stringify({ version: CONSENT_VERSION, preferences: true, analytics: true, decidedAt: expired })),
  null,
  'expired decision re-prompts'
);

// Truthy-but-not-true values must not grant consent.
const coerced = parseConsent(
  JSON.stringify({ version: CONSENT_VERSION, preferences: 'yes', analytics: 1, decidedAt: new Date().toISOString() })
);
assert.ok(coerced, 'valid envelope parsed');
assert.equal(coerced.preferences, false, 'non-boolean preferences denied');
assert.equal(coerced.analytics, false, 'non-boolean analytics denied');
assert.equal(coerced.necessary, true, 'necessary always granted');

const roundTrip = parseConsent(serializeConsent(CONSENT_GRANTED));
assert.ok(roundTrip, 'serialize/parse round trip');
assert.deepEqual(
  { necessary: roundTrip.necessary, preferences: roundTrip.preferences, analytics: roundTrip.analytics },
  CONSENT_GRANTED,
  'granted choices survive the round trip'
);

// --- cookie read/write ------------------------------------------------------
assert.equal(readConsentCookie(), null, 'no cookie means no decision');
writeConsentCookie(CONSENT_DENIED);
const denied = readConsentCookie();
assert.ok(denied, 'denied decision stored');
assert.equal(denied.preferences, false, 'denied preferences persisted');
assert.equal(denied.analytics, false, 'denied analytics persisted');
assert.ok(cookieJar.includes('beatdrop_consent='), 'cookie name used');

writeConsentCookie(CONSENT_GRANTED);
const granted = readConsentCookie();
assert.ok(granted?.preferences && granted?.analytics, 'granted decision overwrites denied');

// --- purge ------------------------------------------------------------------
storage.setItem(`${PREFERENCE_STORAGE_PREFIX}streak`, '7');
storage.setItem(`${PREFERENCE_STORAGE_PREFIX}theme-id`, 'emerald');
storage.setItem('beatdrop_admin_key', 'necessary-keep-me');
purgePreferenceStorage();
assert.equal(storage.getItem(`${PREFERENCE_STORAGE_PREFIX}streak`), null, 'preference key purged');
assert.equal(storage.getItem(`${PREFERENCE_STORAGE_PREFIX}theme-id`), null, 'theme key purged');
assert.equal(storage.getItem('beatdrop_admin_key'), 'necessary-keep-me', 'necessary key preserved');

// --- gated storage facade ---------------------------------------------------
const { getPreference, setPreference, removePreference, setPreferenceStorageAllowed, isPreferenceStorageAllowed } =
  await import('../lib/preferenceStorage');

const KEY = `${PREFERENCE_STORAGE_PREFIX}time-range-preset`;

setPreferenceStorageAllowed(false);
assert.equal(isPreferenceStorageAllowed(), false, 'gate closed by default');
setPreference(KEY, 'songspot');
assert.equal(storage.getItem(KEY), null, 'write blocked without consent');
storage.setItem(KEY, 'standard');
assert.equal(getPreference(KEY), null, 'read blocked without consent');
removePreference(KEY);
assert.equal(storage.getItem(KEY), null, 'removal works even without consent');

setPreferenceStorageAllowed(true);
setPreference(KEY, 'songspot');
assert.equal(getPreference(KEY), 'songspot', 'read/write allowed with consent');

// Non-prefixed keys must never route through the consent gate.
setPreference('beatdrop_admin_key', 'nope');
assert.notEqual(storage.getItem('beatdrop_admin_key'), 'nope', 'unprefixed key refused by the facade');

// --- category metadata ------------------------------------------------------
const ids = CONSENT_CATEGORIES.map((category) => category.id);
assert.deepEqual(ids, ['necessary', 'preferences', 'analytics'], 'category order is stable');
assert.equal(
  CONSENT_CATEGORIES.filter((category) => category.required).length,
  1,
  'exactly one category is non-optional'
);
assert.equal(
  CONSENT_CATEGORIES.find((category) => category.id === 'necessary')?.required,
  true,
  'necessary category is required'
);

console.log(
  'Consent checks passed: untrusted-input validation, expiry re-prompt, boolean coercion, ' +
    'cookie round trip, preference purge scoped to songspot:, and consent-gated storage reads/writes.'
);
