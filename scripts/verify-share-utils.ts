import assert from 'node:assert/strict';
import { copyToClipboard, shareOrCopy } from '../lib/shareUtils';

console.log('[Test] Running share & clipboard utility tests...');

// Mock environment for browser APIs
class MockElement {
  value = '';
  style: Record<string, string> = {};
  setAttribute(_k: string, _v: string) {}
  focus(_opts?: { preventScroll?: boolean }) {}
  select() {}
  setSelectionRange(_s: number, _e: number) {}
}

let execCommandCalled = false;
let execCommandResult = true;

const originalWindow = global.window;
const originalDocument = global.document;
const originalNavigator = global.navigator;

function setMockNavigator(mock: unknown) {
  Object.defineProperty(global, 'navigator', {
    value: mock,
    configurable: true,
    writable: true,
  });
}

function setupMockDom() {
  execCommandCalled = false;
  execCommandResult = true;

  Object.defineProperty(global, 'window', {
    value: {},
    configurable: true,
    writable: true,
  });

  Object.defineProperty(global, 'document', {
    value: {
      createElement: (_tag: string) => new MockElement(),
      body: {
        appendChild: (_el: unknown) => {},
        removeChild: (_el: unknown) => {},
      },
      execCommand: (_cmd: string) => {
        execCommandCalled = true;
        return execCommandResult;
      },
    },
    configurable: true,
    writable: true,
  });
}

function restoreMockDom() {
  Object.defineProperty(global, 'window', { value: originalWindow, configurable: true, writable: true });
  Object.defineProperty(global, 'document', { value: originalDocument, configurable: true, writable: true });
  Object.defineProperty(global, 'navigator', { value: originalNavigator, configurable: true, writable: true });
}

try {
  // Test 1: SSR safety (window undefined)
  // @ts-expect-error Simulating SSR
  delete global.window;
  const ssrResult = await copyToClipboard('test');
  assert.equal(ssrResult, false, 'copyToClipboard should return false on SSR');
  const ssrShare = await shareOrCopy({ title: 't', text: 't' });
  assert.equal(ssrShare, 'failed', 'shareOrCopy should return failed on SSR');

  // Test 2: Modern navigator.clipboard.writeText success
  setupMockDom();
  let writtenText = '';
  setMockNavigator({
    clipboard: {
      writeText: async (t: string) => {
        writtenText = t;
      },
    },
  });

  const res1 = await copyToClipboard('Hello BeatDrop');
  assert.equal(res1, true, 'copyToClipboard should succeed via Async Clipboard');
  assert.equal(writtenText, 'Hello BeatDrop');
  assert.equal(execCommandCalled, false, 'execCommand should not be called when writeText succeeds');

  // Test 3: navigator.clipboard.writeText failure -> fallback to execCommand('copy')
  writtenText = '';
  setMockNavigator({
    clipboard: {
      writeText: async () => {
        throw new Error('Permission Denied / In-app browser block');
      },
    },
  });

  const res2 = await copyToClipboard('Fallback Text');
  assert.equal(res2, true, 'copyToClipboard should succeed via execCommand fallback');
  assert.equal(execCommandCalled, true, 'execCommand should be called on clipboard rejection');

  // Test 4: Web Share API success
  let sharedPayload: ShareData | null = null;
  setMockNavigator({
    share: async (data: ShareData) => {
      sharedPayload = data;
    },
  });

  const shareRes1 = await shareOrCopy({
    title: 'Daily Result',
    text: '🟩🟩🟩🟩🟩',
    url: 'https://beatdrop.app/daily',
  });
  assert.equal(shareRes1, 'shared', 'shareOrCopy should return shared on Web Share success');
  assert.equal(sharedPayload?.title, 'Daily Result');
  assert.equal(sharedPayload?.text, '🟩🟩🟩🟩🟩');

  // Test 5: Web Share API user cancellation (AbortError)
  setMockNavigator({
    share: async () => {
      const err = new Error('Share canceled by user');
      err.name = 'AbortError';
      throw err;
    },
  });

  const shareRes2 = await shareOrCopy({
    title: 'Daily Result',
    text: '🟩🟩🟩🟩🟩',
  });
  assert.equal(shareRes2, 'cancelled', 'shareOrCopy should return cancelled without triggering copy');

  // Test 6: Web Share API unsupported/failing -> fallback to clipboard
  execCommandCalled = false;
  setMockNavigator({
    share: async () => {
      throw new Error('Not supported');
    },
    clipboard: {
      writeText: async (t: string) => {
        writtenText = t;
      },
    },
  });

  const shareRes3 = await shareOrCopy({
    title: 'Daily Result',
    text: '🟩🟩🟩🟩🟩',
    url: 'https://beatdrop.app/daily',
  });
  assert.equal(shareRes3, 'copied', 'shareOrCopy should fall back to copied when Web Share fails');
  assert.ok(writtenText.includes('https://beatdrop.app/daily'), 'full text should append url if missing');

  console.log('All share & clipboard utility tests passed successfully! ✓');
} finally {
  restoreMockDom();
}
