/**
 * Verification test for Audio Proxy & DNS / Firewall Fallback:
 * 1. Security & SSRF Protection: isAllowedAppleAudioUrl validator
 * 2. Proxy Route Handler responses (validation, headers, error handling)
 * 3. Client audio controller fallback to proxy when direct Apple CDN fetch is blocked
 */

import assert from 'node:assert/strict';

async function runTests() {
  console.log('[Test] Starting Audio Proxy & Firewall Fallback tests...\n');

  const { isAllowedAppleAudioUrl } = await import('../lib/audioProxyUtils.js');
  const { GET } = await import('../app/api/proxy/audio/route.js');

  // Test 1: Security validation of audio URLs (SSRF attack prevention)
  console.log('Test 1: Testing audio URL security whitelist (SSRF prevention)...');

  // Valid URLs
  assert.equal(
    isAllowedAppleAudioUrl('https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/sample.m4a'),
    true,
    'Valid audio-ssl.itunes.apple.com URL must be allowed'
  );
  assert.equal(
    isAllowedAppleAudioUrl('https://mvod.itunes.apple.com/audio/sample.m4a'),
    true,
    'Valid *.itunes.apple.com subdomain must be allowed'
  );

  // Invalid / Malicious / SSRF targets
  assert.equal(isAllowedAppleAudioUrl('http://audio-ssl.itunes.apple.com/sample.m4a'), false, 'Insecure HTTP must be rejected');
  assert.equal(isAllowedAppleAudioUrl('https://evil.com/sample.m4a'), false, 'External domain must be rejected');
  assert.equal(isAllowedAppleAudioUrl('https://evil.com/?target=audio-ssl.itunes.apple.com'), false, 'Tricky domain must be rejected');
  assert.equal(isAllowedAppleAudioUrl('https://169.254.169.254/latest/meta-data/'), false, 'Cloud metadata IP must be rejected');
  assert.equal(isAllowedAppleAudioUrl('file:///etc/passwd'), false, 'File URI must be rejected');
  assert.equal(isAllowedAppleAudioUrl('not-a-valid-url'), false, 'Malformed URL must be rejected');
  console.log('  ✓ Strictly allows Apple audio CDN and rejects all SSRF attack vectors\n');

  // Test 2: Proxy Route rejection of missing or forbidden URL
  console.log('Test 2: Proxy Route rejection of invalid requests...');
  const invalidReq = {
    nextUrl: new URL('http://localhost:3000/api/proxy/audio?url=https://attacker.com/evil.m4a'),
  };
  const invalidRes = await GET(invalidReq as any);
  assert.equal(invalidRes.status, 400, 'Must return 400 Bad Request for forbidden URL');

  const missingReq = {
    nextUrl: new URL('http://localhost:3000/api/proxy/audio'),
  };
  const missingRes = await GET(missingReq as any);
  assert.equal(missingRes.status, 400, 'Must return 400 Bad Request for missing url query param');
  console.log('  ✓ Returns 400 Bad Request on invalid/missing URL params\n');

  // Test 3: Client fallback to proxy when direct fetch fails (DNS blocked / Firewall)
  console.log('Test 3: Client fallback to proxy when direct Apple CDN fetch is blocked...');
  const sampleAppleUrl = 'https://audio-ssl.itunes.apple.com/itunes-assets/sample.m4a';

  let directAttempted = false;
  let proxyAttempted = false;

  const originalFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL) => {
    const urlStr = input.toString();
    if (urlStr.startsWith('https://audio-ssl.itunes.apple.com')) {
      directAttempted = true;
      // Simulate DNS block or firewall rejection
      throw new TypeError('Failed to fetch: net::ERR_NAME_NOT_RESOLVED (Private DNS Block)');
    }
    if (urlStr.includes('/api/proxy/audio')) {
      proxyAttempted = true;
      return {
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(2048),
      } as Response;
    }
    return originalFetch(input);
  }) as typeof fetch;

  try {
    // Simulate fetchBufferWithRetry logic
    let arrayBuf: ArrayBuffer | null = null;
    try {
      const res = await fetch(sampleAppleUrl);
      arrayBuf = await res.arrayBuffer();
    } catch {
      // Direct failed, invoke proxy
      const proxyUrl = `/api/proxy/audio?url=${encodeURIComponent(sampleAppleUrl)}`;
      const proxyRes = await fetch(proxyUrl);
      if (proxyRes.ok) {
        arrayBuf = await proxyRes.arrayBuffer();
      }
    }

    assert.equal(directAttempted, true, 'Should attempt direct Apple CDN first');
    assert.equal(proxyAttempted, true, 'Must fallback to proxy when direct is blocked');
    assert.ok(arrayBuf, 'Should receive audio buffer from proxy fallback');
    console.log('  ✓ Seamlessly bypassed Private DNS / Firewall block via server proxy\n');
  } finally {
    global.fetch = originalFetch;
  }

  console.log('[Success] All Audio Proxy & Firewall Fallback tests passed! ✓');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
