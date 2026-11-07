/**
 * Verification test for Data Saver / Save-Data network optimization
 * Tests:
 * 1. isSaveDataEnabled detection via navigator.connection
 * 2. prefetchAudio respects Data Saver mode (skips background quota consumption)
 * 3. prefetchAudio works normally when Data Saver is off
 */

import assert from 'node:assert/strict';

interface MockConnection {
  saveData?: boolean;
  effectiveType?: string;
}

function mockNavigatorConnection(conn: MockConnection | undefined) {
  const nav = global.navigator || {};
  Object.defineProperty(global, 'navigator', {
    value: {
      ...nav,
      connection: conn,
    },
    configurable: true,
    writable: true,
  });
}

async function runTests() {
  console.log('[Test] Starting Data Saver (Save-Data) compliance tests...\n');

  // Mock window and AudioContext for Node.js test environment
  if (typeof (global as any).window === 'undefined') {
    (global as any).window = {
      AudioContext: class {
        decodeAudioData() {
          return Promise.resolve({
            duration: 30,
            sampleRate: 44100,
            length: 44100 * 30,
            getChannelData: () => new Float32Array(100),
          });
        }
      },
    };
  }

  const { isSaveDataEnabled, prefetchAudio } = await import('../hooks/useAudioController.js');

  // Test 1: Detection when saveData = true
  console.log('Test 1: Detecting saveData = true...');
  mockNavigatorConnection({ saveData: true, effectiveType: '4g' });
  assert.equal(isSaveDataEnabled(), true, 'Should detect saveData flag');
  console.log('  ✓ Detected saveData = true\n');

  // Test 2: Detection when slow-2g
  console.log('Test 2: Detecting slow-2g network...');
  mockNavigatorConnection({ saveData: false, effectiveType: 'slow-2g' });
  assert.equal(isSaveDataEnabled(), true, 'Should detect slow-2g as data saving mode');
  console.log('  ✓ Detected slow-2g as data saver\n');

  // Test 3: Detection when normal 4g without saveData
  console.log('Test 3: Normal 4G without saveData...');
  mockNavigatorConnection({ saveData: false, effectiveType: '4g' });
  assert.equal(isSaveDataEnabled(), false, 'Should be false on normal 4G connection');
  console.log('  ✓ Normal network identified correctly\n');

  // Test 4: prefetchAudio skips fetching when saveData is on
  console.log('Test 4: prefetchAudio behavior with Data Saver enabled...');
  mockNavigatorConnection({ saveData: true });

  let fetchCalled = false;
  const originalFetch = global.fetch;
  global.fetch = (async () => {
    fetchCalled = true;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(512) } as Response;
  }) as typeof fetch;

  try {
    await prefetchAudio('https://example.com/test-audio-datasaver.m4a');
    assert.equal(fetchCalled, false, 'prefetchAudio MUST NOT trigger fetch when Data Saver is active');
    console.log('  ✓ Skipped background prefetch to protect mobile cellular quota\n');
  } finally {
    global.fetch = originalFetch;
  }

  // Test 5: prefetchAudio triggers fetch when saveData is OFF
  console.log('Test 5: prefetchAudio behavior with Data Saver disabled...');
  mockNavigatorConnection({ saveData: false });

  let normalFetchCalled = false;
  global.fetch = (async () => {
    normalFetchCalled = true;
    return { ok: false } as Response; // Mock fail or succeed, we just verify fetch is called
  }) as typeof fetch;

  try {
    await prefetchAudio('https://example.com/test-audio-normal.m4a');
    assert.equal(normalFetchCalled, true, 'prefetchAudio SHOULD trigger fetch when Data Saver is inactive');
    console.log('  ✓ Normal prefetch allowed when Data Saver is inactive\n');
  } finally {
    global.fetch = originalFetch;
  }

  console.log('[Success] All Data Saver tests passed! ✓');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
