/**
 * Verification test for Audio Controller Network Handover Recovery (Wi-Fi <-> Cellular)
 * Tests:
 * 1. Automatic fetch retry with backoff during network handover
 * 2. Recovery on browser 'online' event after network switch
 * 3. User play/tap recovery while in error state
 */

import assert from 'node:assert/strict';

type PlaybackState = 'idle' | 'loading' | 'ready' | 'playing' | 'error';

class MockAudioController {
  public state: PlaybackState = 'idle';
  public buffer: ArrayBuffer | null = null;
  public fetchAttempts = 0;
  public audioUrl: string | null = null;
  public pendingAutoPlay = false;

  // Mock fetch function with simulated handover behavior
  public mockFetch: (url: string) => Promise<ArrayBuffer> = async () => {
    return new ArrayBuffer(1024);
  };

  constructor(url: string | null) {
    this.audioUrl = url;
    if (url) {
      this.loadAudio();
    }
  }

  async loadAudio(autoPlayOnReady = false) {
    if (!this.audioUrl) {
      this.state = 'idle';
      this.buffer = null;
      return;
    }

    if (autoPlayOnReady) {
      this.pendingAutoPlay = true;
    }

    this.state = 'loading';

    // Retry with backoff: up to 2 retries (simulating Wi-Fi -> Cellular reconnection)
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        this.fetchAttempts++;
        const buf = await this.mockFetch(this.audioUrl);
        this.buffer = buf;
        this.state = 'ready';
        if (this.pendingAutoPlay) {
          this.pendingAutoPlay = false;
          this.state = 'playing';
        }
        return;
      } catch (err) {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 50 * Math.pow(1.5, attempt)));
        } else {
          this.state = 'error';
        }
      }
    }
  }

  // Simulated browser 'online' event
  handleOnline() {
    if (!this.buffer && this.audioUrl && (this.state === 'error' || this.state === 'loading')) {
      this.loadAudio();
    }
  }

  // User taps play
  play() {
    if (!this.buffer) {
      // In error or loading state, trigger reload with autoplay
      this.loadAudio(true);
      return;
    }
    this.state = 'playing';
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('[Test] Starting Audio Network Handover Recovery tests...\n');

  // Test 1: Network handover during fetch (First fetch fails as Wi-Fi disconnects, second fetch succeeds on Cellular)
  console.log('Test 1: Simulated Wi-Fi -> Cellular handover during initial audio fetch...');
  let attemptCount = 0;
  const controller1 = new MockAudioController(null);
  controller1.mockFetch = async () => {
    attemptCount++;
    if (attemptCount === 1) {
      throw new Error('TypeError: Failed to fetch (Wi-Fi dropped)');
    }
    return new ArrayBuffer(2048); // Cellular connection established
  };

  controller1.audioUrl = 'https://example.com/audio.m4a';
  await controller1.loadAudio();

  assert.equal(controller1.state, 'ready', 'Audio controller should be ready after retrying on Cellular');
  assert.equal(attemptCount, 2, 'Should have retried once after first failure');
  assert.ok(controller1.buffer, 'Audio buffer should be populated');
  console.log('  ✓ Automatically recovered on retry during handover without failing to error state\n');

  // Test 2: Extended offline switch, recovered via 'online' event
  console.log('Test 2: Extended offline gap recovered automatically via browser "online" event...');
  let onlineAttempt = 0;
  const controller2 = new MockAudioController(null);
  controller2.mockFetch = async () => {
    onlineAttempt++;
    if (onlineAttempt <= 3) {
      throw new Error('Network offline');
    }
    return new ArrayBuffer(2048);
  };

  controller2.audioUrl = 'https://example.com/audio2.m4a';
  await controller2.loadAudio();

  // All 3 initial attempts failed because network was completely down
  assert.equal(controller2.state, 'error', 'Should enter error state if all retries fail while offline');

  // Mobile OS switches to 5G / Wi-Fi and fires 'online' event
  console.log('  [Event] Emitting browser "online" event...');
  controller2.handleOnline();
  await sleep(100);

  assert.equal(controller2.state, 'ready', 'Should automatically transition from error to ready after online event');
  assert.ok(controller2.buffer, 'Audio buffer should be loaded after online recovery');
  console.log('  ✓ Successfully auto-healed on "online" event\n');

  // Test 3: User taps play button when audio was in error state
  console.log('Test 3: User taps play button while audio was in error state...');
  const controller3 = new MockAudioController(null);
  let userAttempt = 0;
  controller3.mockFetch = async () => {
    userAttempt++;
    if (userAttempt === 1) {
      throw new Error('Handover glitch');
    }
    return new ArrayBuffer(2048);
  };

  controller3.audioUrl = 'https://example.com/audio3.m4a';
  // Force state to error (mimicking a past failure)
  controller3.state = 'error';

  // User taps play
  controller3.play();
  assert.equal(controller3.state, 'loading', 'Should enter loading state when user taps play in error state');

  await sleep(150);
  assert.equal(controller3.state, 'playing', 'Should automatically start playing once reload succeeds');
  console.log('  ✓ Tapping play in error state reloaded audio and started playback seamlessly\n');

  console.log('[Success] All Audio Network Handover tests passed! ✓');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});

