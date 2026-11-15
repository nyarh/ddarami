'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../core.js');
const Drums = require('../drums.js');

test('parse time supports seconds and clock notation; rejects malformed input', () => {
  assert.equal(core.parseTime('1:02.25'), 62.25);
  assert.equal(core.parseTime('1:02:03.5'), 3723.5);
  assert.equal(core.parseTime(' 12.5 '), 12.5);
  for (const value of ['', '-1', '1:60', '1:2:60', '1e3', 'NaN', '1:']) assert.ok(Number.isNaN(core.parseTime(value)));
});
test('time formatting rounds across minute boundary', () => {
  assert.equal(core.formatTime(59.999), '1:00.00');
  assert.equal(core.formatTime(62.25), '1:02.25');
  assert.equal(core.formatTime(NaN), '0:00.00');
});
test('loop validity rejects out-of-range, reversed, tiny and live-video loops', () => {
  assert.equal(core.validateLoop(2, 8, 10).valid, true);
  for (const args of [[-1, 8, 10], [2, 11, 10], [8, 2, 10], [2, 2.01, 10], [0, 1, Infinity], [0, 1, NaN]]) assert.equal(core.validateLoop(...args).valid, false);
});
test('tap tempo follows the latest interval from the second tap at every practice speed', () => {
  assert.ok(Math.abs(core.effectiveBpm(123, 0.8) - 98.4) < 0.00001);
  assert.equal(core.tapTempo([0, 500, 1000, 1520, 2020]), 120);
  assert.equal(core.tapTempo([0, 500]), 120);
  assert.equal(core.tapTempo([0, 500, 1000, 1500, 2000, 2600]), 100);
  assert.equal(core.tapTempo([0, 8000], 0.25), 7.5);
  assert.equal(core.tapTempo([0, 100], 2), 600);
  assert.equal(core.tapTempo([null, 500]), null);
  assert.equal(core.tapTempo([0]), null);
  assert.equal(core.tapTempo([0, 5000]), null);
  assert.equal(core.tapTempo([10, 0]), null);
});
test('patterns provide correct hat subdivisions and backbeat', () => {
  const straight = core.patternEvents('8beat');
  assert.equal(straight.filter(e => e.voice === 'hihat').length, 8);
  assert.equal(core.patternEvents('16beat').filter(e => e.voice === 'hihat').length, 16);
  assert.deepEqual(straight.filter(e => e.voice === 'snare').map(e => e.beat), [1, 3]);
  assert.ok(core.patternEvents('shuffle').some(e => Math.abs(e.beat - 2 / 3) < 0.0001));
});

function mockAudio() {
  const nodes = [];
  let releaseResume;
  class Node {
    constructor() {
      nodes.push(this);
      this.gain = this.frequency = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} };
      this.Q = { value: 0 };
    }
    connect() {} disconnect() { this.disconnected = true; }
    start(when) { this.started = when; }
    stop() { this.stopped = true; }
  }
  class Context {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 48000; this.destination = {}; }
    createGain() { return new Node(); }
    createOscillator() { return new Node(); }
    createBufferSource() { return new Node(); }
    createBiquadFilter() { return new Node(); }
    createBuffer() { return { getChannelData: () => new Float32Array(48000) }; }
    resume() { return new Promise(resolve => { releaseResume = () => { this.state = 'running'; resolve(); }; }); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  return { Context, nodes, release: () => releaseResume() };
}
test('stop during async AudioContext resume cannot restart sound', async () => {
  const audio = mockAudio(); global.AudioContext = audio.Context;
  const engine = new Drums();
  const start = engine.start({ bpm: 98.4, pattern: 'shuffle', volume: 0.4 });
  engine.stop(); audio.release();
  assert.equal(await start, false); assert.equal(engine.playing, false);
  assert.equal(engine.nodes.size, 0); engine.dispose(); delete global.AudioContext;
});
test('repeated start is idempotent; stop cancels scheduled nodes and timers', async () => {
  const audio = mockAudio(); global.AudioContext = audio.Context;
  const engine = new Drums();
  const first = engine.start(); audio.release(); await first;
  const timer = engine.timer;
  assert.equal(await engine.start({ bpm: 100 }), true);
  assert.equal(engine.timer, timer); assert.equal(engine.bpm, 100);
  assert.ok(engine.nodes.size > 0);
  engine.stop(); engine.stop();
  assert.equal(engine.nodes.size, 0); assert.equal(engine.beatTimers.size, 0); assert.equal(engine.timer, null);
  engine.dispose(); delete global.AudioContext;
});
test('style changes keep the running clock and schedule each preset on its own subdivisions', async () => {
  const audio = mockAudio(); global.AudioContext = audio.Context;
  const engine = new Drums();
  try {
    const start = engine.start({ bpm: 90 });
    audio.release(); await start;
    const { tick, nextTickTime, timer } = engine;
    const kicks = {
      '8beat': [0, 24], rock: [0, 24, 30], shuffle: [0, 24],
      groove: [0, 18, 33], funk: [0, 9, 18, 30, 45], '16beat': [0, 24]
    };
    assert.deepEqual(core.drumPresets.map(preset => preset.id).sort(), Object.keys(kicks).sort());
    for (const [id, expected] of Object.entries(kicks)) {
      engine.configure({ pattern: id });
      const ticksFor = voice => [...engine.events].filter(([, hits]) => hits.some(hit => hit.voice === voice)).map(([t]) => t);
      assert.deepEqual(ticksFor('kick'), expected, id);
      const hats = id === 'shuffle' ? [0, 8] : ['funk', '16beat'].includes(id) ? [0, 3, 6, 9] : [0, 6];
      assert.deepEqual(ticksFor('hihat'), [0, 12, 24, 36].flatMap(t => hats.map(h => t + h)), id);
      const ghosts = core.patternEvents(id).filter(hit => hit.voice === 'snare' && hit.velocity < 0.4);
      assert.equal(ghosts.length, id === 'funk' ? 2 : id === 'groove' ? 1 : 0, id);
      assert.equal(engine.running, true);
      assert.equal(engine.tick, tick);
      assert.equal(engine.nextTickTime, nextTickTime);
      assert.equal(engine.timer, timer);
      assert.equal(engine.bpm, 90);
    }
  } finally {
    engine.dispose(); delete global.AudioContext;
  }
});
test('invalid drum settings are rejected', () => {
  const engine = new Drums();
  assert.throws(() => engine.update({ bpm: NaN }), RangeError);
  assert.throws(() => engine.update({ pattern: 'unknown' }), RangeError);
  assert.throws(() => engine.update({ volume: NaN }), RangeError);
  engine.update({ volume: 5 }); assert.equal(engine.volume, 1);
  engine.dispose();
});

test('changing tempo during a slow beat retimes upcoming audio without restarting the bar', async () => {
  const audio = mockAudio(); global.AudioContext = audio.Context;
  const engine = new Drums();
  try {
    const start = engine.start({ bpm: 7.5 });
    audio.release(); await start;
    const { timer, tick, nextTickTime } = engine;
    engine.context.currentTime = 0.2;
    engine.configure({ bpm: 75 });
    const expected = 0.2 + (nextTickTime - 0.2) / 10;
    assert.ok(Math.abs(engine.nextTickTime - expected) < 1e-9);
    assert.equal(engine.tick, tick);
    assert.equal(engine.timer, timer);
    const hats = [];
    engine._voice = (voice, when) => { if (voice === 'hihat') hats.push(when); };
    for (let i = 0; i < 60; i++) {
      engine.context.currentTime += 0.025;
      engine._schedule();
    }
    assert.ok(hats.length >= 3);
    for (let i = 1; i < hats.length; i++) assert.ok(Math.abs(hats[i] - hats[i-1] - 0.4) < 1e-9);
  } finally {
    engine.dispose(); delete global.AudioContext;
  }
});

test('compatibility configure and running aliases; unlock resumes without scheduling', async () => {
  const audio = mockAudio(); global.AudioContext = audio.Context;
  const engine = new Drums();
  assert.equal(engine.configure({ bpm: 98.4, pattern: 'shuffle', volume: 0.4 }), engine);
  const unlocked = engine.unlock(); audio.release();
  assert.equal(await unlocked, true);
  assert.equal(engine.running, false);
  assert.equal(engine.bpm, 98.4);
  assert.equal(engine.nodes.size, 0);
  assert.equal(engine.timer, null);
  engine.dispose(); delete global.AudioContext;
});
test('unlock reports cancellation when stop happens during resume', async () => {
  const audio = mockAudio(); global.AudioContext = audio.Context;
  const engine = new Drums();
  const unlocked = engine.unlock(); engine.stop(); audio.release();
  assert.equal(await unlocked, false);
  assert.equal(engine.running, false);
  engine.dispose(); delete global.AudioContext;
});

test('boundary regression: 0.2-second loop minimum and minute rounding round-trip', () => {
  assert.equal(core.validateLoop(5, 5.1, 10).valid, false);
  assert.equal(core.validateLoop(5, 5.2, 10).valid, true);
  for (const value of [59.999, 119.999, 3599.999]) {
    const formatted = core.formatTime(value);
    assert.ok(!formatted.includes(':60'));
    assert.ok(Number.isFinite(core.parseTime(formatted)));
  }
});
