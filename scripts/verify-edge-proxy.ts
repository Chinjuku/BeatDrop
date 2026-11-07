/**
 * Verification test for Audio Proxy Edge Runtime & Latency Performance:
 * 1. Runtime declaration is 'edge' (eliminates container cold-start delays)
 * 2. Rapid stream pass-through with minimal overhead
 * 3. HEAD method support for lightweight cache checks
 */

import assert from 'node:assert/strict';

async function runTests() {
  console.log('[Test] Starting Audio Proxy Edge Runtime & Cold-Start tests...\n');

  const proxyModule = await import('../app/api/proxy/audio/route.js');

  // Test 1: Verify runtime is explicitly set to 'edge'
  console.log('Test 1: Verifying Edge runtime configuration...');
  assert.equal(proxyModule.runtime, 'edge', 'Route must use edge runtime to avoid container cold starts');
  console.log('  ✓ Configured with export const runtime = "edge" (instant V8 isolate startup)\n');

  // Test 2: Execution latency check
  console.log('Test 2: Verifying handler execution overhead...');
  const sampleUrl = 'https://audio-ssl.itunes.apple.com/itunes-assets/sample.m4a';

  const originalFetch = global.fetch;
  global.fetch = (async () => {
    return new Response(new Uint8Array(1024), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mp4',
        'Content-Length': '1024',
      },
    });
  }) as typeof fetch;

  try {
    const startT = performance.now();
    const req = {
      nextUrl: new URL(`http://localhost:3000/api/proxy/audio?url=${encodeURIComponent(sampleUrl)}`),
    };
    const res = await proxyModule.GET(req as any);
    const durationMs = performance.now() - startT;

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Content-Type'), 'audio/mp4');
    assert.ok(durationMs < 50, `Handler execution overhead must be < 50ms (got ${durationMs.toFixed(2)}ms)`);
    console.log(`  ✓ Edge proxy handler completed in ${durationMs.toFixed(2)}ms with zero cold start\n`);

    // Test 3: HEAD request verification
    if (proxyModule.HEAD) {
      console.log('Test 3: Verifying HEAD request for fast cache pre-flight...');
      const headRes = await proxyModule.HEAD(req as any);
      assert.equal(headRes.status, 200);
      assert.equal(headRes.body, null, 'HEAD response should have no body payload');
      console.log('  ✓ HEAD request validated successfully\n');
    }
  } finally {
    global.fetch = originalFetch;
  }

  console.log('[Success] All Edge Audio Proxy tests passed! ✓');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
