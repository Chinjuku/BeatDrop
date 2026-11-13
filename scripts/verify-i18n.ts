/**
 * i18n checks: every namespace has a th and en file, both have the same key tree,
 * no empty strings, and ICU placeholders match between languages.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MESSAGE_NAMESPACES } from '../i18n/namespaces';
import { routing } from '../i18n/routing';
import { localizedPath } from '../lib/i18nMetadata';

type Tree = { [key: string]: string | Tree };

function load(locale: string, ns: string): Tree {
  const file = path.resolve('messages', locale, `${ns}.json`);
  assert.ok(fs.existsSync(file), `missing ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Tree;
}

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const id = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(id, value);
    else for (const [k, v] of flatten(value, id)) out.set(k, v);
  }
  return out;
}

/** Top-level ICU argument names, e.g. {count}, {count, plural, ...}. */
function placeholders(message: string): string[] {
  const names = new Set<string>();
  let depth = 0;
  for (let i = 0; i < message.length; i++) {
    const ch = message[i];
    if (ch === '{') {
      if (depth === 0) {
        const m = /^\{\s*([A-Za-z_][\w]*)/.exec(message.slice(i));
        if (m) names.add(m[1]);
      }
      depth++;
    } else if (ch === '}') depth = Math.max(0, depth - 1);
  }
  return [...names].sort();
}

assert.deepEqual([...routing.locales], ['th', 'en']);
assert.equal(routing.defaultLocale, 'th');
assert.equal(localizedPath('/play', 'th'), '/play');
assert.equal(localizedPath('/play', 'en'), '/en/play');

let keyCount = 0;
for (const ns of MESSAGE_NAMESPACES) {
  const th = flatten(load('th', ns));
  const en = flatten(load('en', ns));
  const missingEn = [...th.keys()].filter((k) => !en.has(k));
  const missingTh = [...en.keys()].filter((k) => !th.has(k));
  assert.deepEqual(missingEn, [], `${ns}: keys missing in en`);
  assert.deepEqual(missingTh, [], `${ns}: keys missing in th`);
  for (const [key, thValue] of th) {
    const enValue = en.get(key)!;
    assert.ok(thValue.trim() && enValue.trim(), `${ns}.${key}: empty message`);
    assert.deepEqual(placeholders(thValue), placeholders(enValue), `${ns}.${key}: placeholder mismatch`);
    keyCount++;
  }
}

const extra = (dir: string) =>
  fs.readdirSync(path.resolve('messages', dir)).map((f) => f.replace(/\.json$/, '')).filter(
    (ns) => !(MESSAGE_NAMESPACES as readonly string[]).includes(ns)
  );
assert.deepEqual(extra('th'), [], 'unregistered namespace files in messages/th');
assert.deepEqual(extra('en'), [], 'unregistered namespace files in messages/en');

console.log(`i18n checks passed: ${MESSAGE_NAMESPACES.length} namespaces, ${keyCount} keys, th/en parity and placeholders.`);
