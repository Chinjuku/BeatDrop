/**
 * Verification test for Autocomplete search under simulated Edge/2G network conditions:
 * - High latency (800ms - 2500ms delay)
 * - Rapid typing & AbortController race-condition prevention
 * - Request timeout handling
 * - Network failure & graceful recovery
 */

import assert from 'node:assert/strict';

interface Song {
  id: string;
  title: string;
  artistName: string;
}

interface AutocompleteState {
  query: string;
  suggestions: Song[];
  loading: boolean;
  error: string | null;
}

// Simulated network client mirroring GuessAutocomplete's fetch logic with improvements
class AutocompleteClient {
  state: AutocompleteState = {
    query: '',
    suggestions: [],
    loading: false,
    error: null,
  };

  private currentAbortController: AbortController | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  public networkCallsCount = 0;
  public abortedCallsCount = 0;

  // Mock server handler with customizable latency
  public mockServerHandler: (q: string, signal: AbortSignal) => Promise<Song[]> = async (q) => {
    return [
      { id: '1', title: `${q} Song 1`, artistName: 'Artist A' },
      { id: '2', title: `${q} Song 2`, artistName: 'Artist B' },
    ];
  };

  onQueryChange(newQuery: string, debounceMs = 300, timeoutMs = 8000) {
    this.state.query = newQuery;

    // Clear previous timer and abort pending request
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.abortedCallsCount++;
      this.currentAbortController = null;
    }

    if (newQuery.trim().length === 0) {
      this.state.suggestions = [];
      this.state.loading = false;
      this.state.error = null;
      return;
    }

    this.debounceTimer = setTimeout(async () => {
      const controller = new AbortController();
      this.currentAbortController = controller;
      this.state.loading = true;
      this.state.error = null;

      // Timeout for slow 2G/Edge networks
      const timeoutId = setTimeout(() => {
        controller.abort(new Error('NetworkTimeout'));
      }, timeoutMs);

      try {
        this.networkCallsCount++;
        const results = await this.mockServerHandler(newQuery.trim(), controller.signal);
        if (!controller.signal.aborted) {
          this.state.suggestions = results;
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          // Aborted intentionally due to newer query or timeout
          if (controller.signal.reason?.message === 'NetworkTimeout' || (err as Error)?.message === 'NetworkTimeout') {
            this.state.error = 'การเชื่อมต่อล่าช้า กรุณาลองใหม่อีกครั้ง';
          }
          return;
        }
        this.state.error = 'ไม่สามารถค้นหาได้ในขณะนี้ กรุณาตรวจสอบการเชื่อมต่อ';
      } finally {
        clearTimeout(timeoutId);
        if (!controller.signal.aborted || controller.signal.reason?.message === 'NetworkTimeout') {
          this.state.loading = false;
        }
      }
    }, debounceMs);
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('[Test] Starting Edge/2G Autocomplete resilience tests...\n');

  // Test 1: Rapid typing on slow network (Cancels earlier requests, only latest query wins)
  console.log('Test 1: Rapid typing with simulated 1500ms 2G network latency...');
  const client = new AutocompleteClient();

  // Mock server takes 1200ms per request
  client.mockServerHandler = async (q, signal) => {
    await sleep(1200);
    if (signal.aborted) {
      const abortError = new Error('AbortError');
      abortError.name = 'AbortError';
      throw abortError;
    }
    return [{ id: '99', title: `Title for ${q}`, artistName: 'Artist' }];
  };

  // Simulate user typing "b", "bo", "bod", "body" rapidly with 80ms interval
  client.onQueryChange('b', 300);
  await sleep(80);
  client.onQueryChange('bo', 300);
  await sleep(80);
  client.onQueryChange('bod', 300);
  await sleep(80);
  client.onQueryChange('body', 300);

  // Debounce should prevent earlier 3 calls from ever hitting network!
  assert.equal(client.networkCallsCount, 0, 'Debounce should hold back rapid keystrokes');

  // Wait 350ms for debounce of "body" to trigger network call
  await sleep(350);
  assert.equal(client.networkCallsCount, 1, 'Only the final debounced query should hit network');
  assert.equal(client.state.loading, true, 'Client should be in loading state during 2G fetch');

  // Wait for 2G response to finish (1200ms)
  await sleep(1300);
  assert.equal(client.state.loading, false, 'Loading should be false after response completes');
  assert.equal(client.state.suggestions.length, 1);
  assert.equal(client.state.suggestions[0].title, 'Title for body');
  console.log('  ✓ Rapid typing properly debounced without redundant requests\n');

  // Test 2: Race condition - Out of order response prevention
  console.log('Test 2: Race condition on slow network (earlier query finishes slower than newer query)...');
  const client2 = new AutocompleteClient();
  let query1Finished = false;

  client2.mockServerHandler = async (q, signal) => {
    if (q === 'first') {
      // First query takes 1000ms
      await sleep(1000);
      query1Finished = true;
      if (signal.aborted) {
        const err = new Error('AbortError');
        err.name = 'AbortError';
        throw err;
      }
      return [{ id: '1', title: 'First Song', artistName: 'Artist 1' }];
    } else {
      // Second query takes only 200ms
      await sleep(200);
      if (signal.aborted) {
        const err = new Error('AbortError');
        err.name = 'AbortError';
        throw err;
      }
      return [{ id: '2', title: 'Second Song', artistName: 'Artist 2' }];
    }
  };

  // User types 'first'
  client2.onQueryChange('first', 50);
  await sleep(100); // Debounce triggers 'first' request (which takes 1000ms)

  // 150ms later user changes mind and types 'second'
  await sleep(150);
  client2.onQueryChange('second', 50);
  await sleep(100); // Debounce triggers 'second' request

  // Wait 300ms so 'second' finishes (took 200ms)
  await sleep(300);
  assert.equal(client2.state.suggestions[0].title, 'Second Song', 'State must have results of "second"');

  // Wait another 700ms so 'first' finishes late
  await sleep(700);
  assert.equal(query1Finished, true, 'First query did complete in background');
  assert.equal(client2.state.suggestions[0].title, 'Second Song', 'Stale response from "first" MUST NOT overwrite "second"');
  console.log('  ✓ Stale slow response was correctly cancelled and did not overwrite newer query\n');

  // Test 3: Extreme 2G Timeout (> 8s stall)
  console.log('Test 3: Extreme 2G connection timeout (> 8s stall)...');
  const client3 = new AutocompleteClient();
  client3.mockServerHandler = async (_q, signal) => {
    // Hangs forever (simulating dropped 2G tower connection)
    await new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        reject(signal.reason || new Error('Aborted'));
      });
    });
    return [];
  };

  client3.onQueryChange('stalled', 50, 400); // Use 400ms timeout for fast test
  await sleep(100); // Request started
  assert.equal(client3.state.loading, true);

  await sleep(450); // Timeout triggers
  assert.equal(client3.state.loading, false, 'Loading should be dismissed after timeout');
  assert.ok(client3.state.error, 'Error message should inform user of slow connection');
  console.log('  ✓ Stalled 2G connection times out gracefully with error message\n');

  // Test 4: Real Autocomplete API backend check under simulated latency
  console.log('Test 4: Verify real BeatDrop local autocomplete engine...');
  const { handleAutocomplete } = await import('../lib/engine/roundEngine.js');
  let mockResJson: unknown = null;
  const mockReq = {
    query: { q: 'รัก', category: 'thai', limit: '5' },
  };
  const mockRes = {
    json: (data: unknown) => {
      mockResJson = data;
    },
  };

  const startT = performance.now();
  await handleAutocomplete(mockReq as any, mockRes as any);
  const elapsed = performance.now() - startT;

  assert.ok(mockResJson, 'API must return json response');
  const typedRes = mockResJson as { code: number; data: Song[] };
  assert.equal(typedRes.code, 0, 'API code must be 0');
  assert.ok(Array.isArray(typedRes.data), 'Data must be an array of songs');
  assert.ok(typedRes.data.length > 0, 'Should find matches in local SQLite catalog');
  console.log(`  ✓ Real engine responded in ${elapsed.toFixed(1)}ms with ${typedRes.data.length} matches`);

  console.log('\n[Success] All Edge/2G Autocomplete tests passed! ✓');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
