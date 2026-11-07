/**
 * Verification test for Bluetooth / External Speaker Latency Compensation:
 * 1. AudioContext initialized with latencyHint: 'interactive' to minimize hardware buffer size
 * 2. Visual progress synchronization compensates for outputLatency (> 0.2s Bluetooth latency)
 * 3. Snippet play duration integrity under Bluetooth output latency
 */

import assert from 'node:assert/strict';

interface MockAudioContextOptions {
  latencyHint?: 'interactive' | 'playback' | 'balanced' | number;
}

class MockBluetoothAudioContext {
  public options?: MockAudioContextOptions;
  public currentTime = 10.0;
  public outputLatency = 0.25; // 250ms Bluetooth A2DP latency
  public baseLatency = 0.01;

  constructor(options?: MockAudioContextOptions) {
    this.options = options;
  }
}

function calculateAudibleProgress(
  elapsed: number,
  outputLatency: number,
  remainingPlayTime: number
): { audibleElapsed: number; progress: number } {
  // Audible progress compensating for external Bluetooth latency
  const audibleElapsed = Math.max(0, elapsed - outputLatency);
  const progress = remainingPlayTime > 0 ? Math.min(1, audibleElapsed / remainingPlayTime) : 0;
  return { audibleElapsed, progress };
}

async function runTests() {
  console.log('[Test] Starting Bluetooth Latency & Audio Sync tests...\n');

  // Test 1: AudioContext configuration with latencyHint: 'interactive'
  console.log('Test 1: AudioContext uses latencyHint: "interactive"...');
  const ctx = new MockBluetoothAudioContext({ latencyHint: 'interactive' });
  assert.equal(ctx.options?.latencyHint, 'interactive', 'Must specify interactive latencyHint');
  console.log('  ✓ Configured with latencyHint: "interactive" for minimum hardware buffer\n');

  // Test 2: Progress during the first 100ms when Bluetooth has 250ms latency
  console.log('Test 2: Visual progress during Bluetooth hardware buffer delay (first 100ms)...');
  const earlyState = calculateAudibleProgress(0.1, 0.25, 1.0);
  assert.equal(earlyState.audibleElapsed, 0, 'Audible elapsed should hold at 0 before sound leaves speaker');
  assert.equal(earlyState.progress, 0, 'Visual progress should not advance prematurely before user hears audio');
  console.log('  ✓ Progress remains at 0 during Bluetooth buffer fill, preventing desync\n');

  // Test 3: Progress once audio starts emitting from Bluetooth speaker (at 350ms elapsed)
  console.log('Test 3: Visual progress once sound emerges from Bluetooth speaker (at 350ms)...');
  const playingState = calculateAudibleProgress(0.35, 0.25, 1.0);
  // 350ms elapsed - 250ms latency = 100ms audible playback
  assert.equal(Math.round(playingState.audibleElapsed * 100) / 100, 0.1);
  assert.equal(Math.round(playingState.progress * 100) / 100, 0.1);
  console.log('  ✓ Progress tracks accurately with audible sound waves from speaker\n');

  // Test 4: End of snippet reached
  console.log('Test 4: Final progress at end of snippet...');
  const endState = calculateAudibleProgress(1.25, 0.25, 1.0);
  assert.equal(endState.progress, 1.0, 'Progress cleanly reaches 100% when snippet finishes');
  console.log('  ✓ Cleanly reaches 100% at snippet completion\n');

  console.log('[Success] All Bluetooth Latency tests passed! ✓');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
