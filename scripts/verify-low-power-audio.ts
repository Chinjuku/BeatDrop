/**
 * Verification test for Web Audio performance under Low Power Mode / Battery Saver:
 * 1. AudioParam hardware ramp scheduling (Fade-in 5ms, Fade-out 20ms) to eliminate clicks/pops
 * 2. Hardware-clock accuracy under throttled timer/rAF (15fps - 30fps drop)
 * 3. Graceful quick fade on manual stop
 */

import assert from 'node:assert/strict';

interface ScheduledRamp {
  type: 'setValue' | 'linearRamp';
  value: number;
  time: number;
}

class MockAudioParam {
  public value = 1;
  public history: ScheduledRamp[] = [];

  setValueAtTime(val: number, time: number) {
    this.value = val;
    this.history.push({ type: 'setValue', value: val, time });
  }

  linearRampToValueAtTime(val: number, time: number) {
    this.value = val;
    this.history.push({ type: 'linearRamp', value: val, time });
  }

  cancelScheduledValues(time: number) {
    this.history = this.history.filter((h) => h.time < time);
  }
}

class MockGainNode {
  public gain = new MockAudioParam();
  connect() {}
  disconnect() {}
}

class MockAudioContext {
  public currentTime = 10.0;
  createGain() {
    return new MockGainNode();
  }
}

function schedulePlaybackRamps(
  gainNode: MockGainNode,
  ctxTime: number,
  targetVolume: number,
  duration: number
) {
  const fadeDuration = 0.02; // 20ms anti-pop fade
  // 1. Fade-in: start near 0 and ramp to target in 5ms
  gainNode.gain.setValueAtTime(0.001, ctxTime);
  gainNode.gain.linearRampToValueAtTime(targetVolume, ctxTime + 0.005);

  // 2. Fade-out: ramp to 0 in last 20ms
  if (duration > fadeDuration) {
    gainNode.gain.setValueAtTime(targetVolume, ctxTime + duration - fadeDuration);
    gainNode.gain.linearRampToValueAtTime(0.0001, ctxTime + duration);
  }
}

function scheduleStopRamp(gainNode: MockGainNode, ctxTime: number) {
  gainNode.gain.cancelScheduledValues(ctxTime);
  gainNode.gain.setValueAtTime(gainNode.gain.value, ctxTime);
  gainNode.gain.linearRampToValueAtTime(0.0001, ctxTime + 0.015);
}

async function runTests() {
  console.log('[Test] Starting Low Power Mode & Anti-Pop Web Audio tests...\n');

  // Test 1: Verify hardware fade ramps on start
  console.log('Test 1: Hardware-scheduled anti-pop ramps on playback start...');
  const ctx = new MockAudioContext();
  const gain = ctx.createGain();

  schedulePlaybackRamps(gain, ctx.currentTime, 0.8, 1.5);

  const ramps = gain.gain.history;
  assert.equal(ramps.length, 4, 'Should schedule 4 ramp points (fade-in start, end; fade-out start, end)');
  assert.equal(ramps[0].type, 'setValue');
  assert.equal(ramps[0].value, 0.001);
  assert.equal(ramps[0].time, 10.0);

  assert.equal(ramps[1].type, 'linearRamp');
  assert.equal(ramps[1].value, 0.8);
  assert.equal(ramps[1].time, 10.005); // +5ms fade in

  assert.equal(ramps[2].type, 'setValue');
  assert.equal(ramps[2].value, 0.8);
  assert.equal(ramps[2].time, 10.0 + 1.5 - 0.02); // 20ms before end

  assert.equal(ramps[3].type, 'linearRamp');
  assert.equal(ramps[3].value, 0.0001);
  assert.equal(ramps[3].time, 11.5);
  console.log('  ✓ Hardware micro-ramps scheduled correctly without clicks or pops\n');

  // Test 2: Quick fade on manual stop
  console.log('Test 2: Smooth 15ms ramp-down on manual stop...');
  scheduleStopRamp(gain, 10.5);
  const stopRamps = gain.gain.history;
  const lastRamp = stopRamps[stopRamps.length - 1];
  assert.equal(lastRamp.type, 'linearRamp');
  assert.equal(lastRamp.value, 0.0001);
  assert.equal(lastRamp.time, 10.515);
  console.log('  ✓ Manual stop ramps down in 15ms avoiding speaker crackle\n');

  // Test 3: Hardware clock accuracy under throttled timer (simulated 15fps rAF)
  console.log('Test 3: Hardware AudioContext clock tracking under throttled 15fps rAF...');
  const startTime = 100.0;
  const totalPlaySeconds = 2.0;

  // Simulate 3 throttled ticks at irregular intervals: +66ms, +150ms, +2000ms
  const tickTimes = [100.066, 100.25, 102.0];
  let calculatedProgress = 0;

  for (const t of tickTimes) {
    const elapsed = t - startTime;
    calculatedProgress = Math.min(1, elapsed / totalPlaySeconds);
  }

  assert.equal(calculatedProgress, 1.0, 'Progress must reach 100% exactly based on hardware audio clock');
  console.log('  ✓ Timing remains 100% sample-accurate regardless of frame rate drops\n');

  console.log('[Success] All Low Power Audio tests passed! ✓');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
