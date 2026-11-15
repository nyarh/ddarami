/* Original synthesized percussion. No samples, downloads, or microphone access. */
(function (root, factory) {
  const Core = typeof module === 'object' && module.exports ? require('./core.js') : root.GPHCore;
  const Engine = factory(root, Core);
  if (typeof module === 'object' && module.exports) module.exports = Engine;
  else root.GPHDrums = Engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, Core) {
  'use strict';
  return class GPHDrums {
    constructor({ onBeat = () => {}, onState = () => {} } = {}) {
      this.onBeat = onBeat;
      this.onState = onState;
      this.playing = false;
      this.bpm = 120;
      this.pattern = '8beat';
      this.volume = 0.5;
      this.context = null;
      this.master = null;
      this.noise = null;
      this.timer = null;
      this.generation = 0;
      this.nodes = new Set();
      this.beatTimers = new Set();
      this.disposed = false;
      this._rebuildPattern();
    }
    _rebuildPattern() {
      this.events = new Map();
      for (const event of Core.patternEvents(this.pattern)) {
        const tick = Math.round(event.beat * 12);
        if (!this.events.has(tick)) this.events.set(tick, []);
        this.events.get(tick).push(event);
      }
    }
    _ensureContext() {
      if (this.context && this.context.state !== 'closed') return;
      const AudioContext = root.AudioContext || root.webkitAudioContext;
      if (!AudioContext) throw new Error('이 브라우저에서 드럼 오디오를 지원하지 않습니다.');
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.master.gain.value = this.volume * 0.5;
      this.master.connect(this.context.destination);
      this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
      const channel = this.noise.getChannelData(0);
      for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
      this.context.onstatechange = () => {
        if (this.playing && this.context.state !== 'running') {
          this.stop();
          this.onState('suspended');
        }
      };
    }
    update(options = {}) {
      if (options.bpm !== undefined) {
        const bpm = Number(options.bpm);
        if (!Number.isFinite(bpm) || bpm < 5 || bpm > 1600) throw new RangeError('드럼 템포는 5~1600 BPM 범위여야 합니다.');
        if (this.playing && this.bpm !== bpm) {
          // Keep queued hits and retime the remaining fraction of the next tick.
          const anchor = Math.max(this.context.currentTime, this.lastTickTime);
          if (this.nextTickTime > anchor) this.nextTickTime = anchor + (this.nextTickTime - anchor) * this.bpm / bpm;
        }
        this.bpm = bpm;
      }
      if (options.pattern !== undefined && options.pattern !== this.pattern) {
        if (!Core.hasDrumPreset(options.pattern)) throw new RangeError('알 수 없는 드럼 패턴입니다.');
        this.pattern = options.pattern;
        this._rebuildPattern();
      }
      if (options.volume !== undefined) {
        const volume = Number(options.volume);
        if (!Number.isFinite(volume)) throw new RangeError('볼륨 값이 올바르지 않습니다.');
        this.volume = Math.max(0, Math.min(1, volume));
        if (this.master && this.context.state !== 'closed') this.master.gain.setTargetAtTime(this.volume * 0.5, this.context.currentTime, 0.01);
      }
    }
    get running() { return this.playing; }
    configure(options = {}) { this.update(options); return this; }
    async unlock() {
      if (this.disposed) throw new Error('종료된 드럼 엔진입니다.');
      if (this.playing) return true;
      const generation = ++this.generation;
      this._ensureContext();
      await this.context.resume();
      if (generation !== this.generation || this.disposed) return false;
      if (this.context.state !== 'running') throw new Error('드럼 소리를 시작할 수 없습니다. 시작 버튼을 다시 눌러 주세요.');
      return true;
    }
    async start(options = {}) {
      if (this.disposed) throw new Error('종료된 드럼 엔진입니다.');
      this.update(options);
      if (this.playing) return true;
      const generation = ++this.generation;
      this._ensureContext();
      await this.context.resume();
      if (generation !== this.generation || this.disposed) return false;
      if (this.context.state !== 'running') throw new Error('드럼 소리를 시작할 수 없습니다. 시작 버튼을 다시 눌러 주세요.');
      this.playing = true;
      this.tick = 0;
      this.nextTickTime = this.context.currentTime + 0.035;
      this._schedule();
      this.timer = setInterval(() => this._schedule(), 25);
      this.onState('playing');
      return true;
    }
    _schedule() {
      if (!this.playing || this.context.state !== 'running') return;
      const now = this.context.currentTime;
      // Never burst all missed notes after tab throttling or system sleep.
      if (this.nextTickTime < now - 0.15) this.nextTickTime = now + 0.025;
      while (this.nextTickTime < now + 0.10) {
        const tick = this.tick;
        const time = this.nextTickTime;
        for (const event of this.events.get(tick) || []) this._voice(event.voice, time, event.velocity);
        if (tick % 12 === 0) {
          const generation = this.generation;
          const id = setTimeout(() => {
            this.beatTimers.delete(id);
            if (this.playing && generation === this.generation) this.onBeat({ beat: tick / 12 + 1, time });
          }, Math.max(0, (time - this.context.currentTime) * 1000));
          this.beatTimers.add(id);
        }
        this.lastTickTime = time;
        this.nextTickTime += 60 / this.bpm / 12;
        this.tick = (tick + 1) % 48;
      }
    }
    _voice(voice, when, velocity) {
      const context = this.context;
      const envelope = context.createGain();
      envelope.connect(this.master);
      const source = voice === 'kick' ? context.createOscillator() : context.createBufferSource();
      let filter = null;
      let duration;
      if (voice === 'kick') {
        source.type = 'sine';
        source.frequency.setValueAtTime(145, when);
        source.frequency.exponentialRampToValueAtTime(43, when + 0.12);
        envelope.gain.setValueAtTime(velocity * 0.85, when);
        duration = 0.30;
        source.connect(envelope);
      } else {
        source.buffer = this.noise;
        filter = context.createBiquadFilter();
        filter.type = voice === 'hihat' ? 'highpass' : 'bandpass';
        filter.frequency.value = voice === 'hihat' ? 7200 : 1800;
        filter.Q.value = voice === 'hihat' ? 0.7 : 0.65;
        source.connect(filter);
        filter.connect(envelope);
        envelope.gain.setValueAtTime(velocity * (voice === 'hihat' ? 0.36 : 0.65), when);
        duration = voice === 'hihat' ? 0.055 : 0.16;
      }
      envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
      const node = { source, envelope, filter };
      this.nodes.add(node);
      source.onended = () => this._disconnect(node);
      source.start(when);
      source.stop(when + duration + 0.02);
    }
    _disconnect(node) {
      this.nodes.delete(node);
      node.source.disconnect();
      node.envelope.disconnect();
      if (node.filter) node.filter.disconnect();
    }
    stop() {
      const wasPlaying = this.playing;
      ++this.generation;
      this.playing = false;
      clearInterval(this.timer);
      this.timer = null;
      for (const timer of this.beatTimers) clearTimeout(timer);
      this.beatTimers.clear();
      for (const node of Array.from(this.nodes)) {
        try { node.source.stop(); } catch (_) { /* Already ended. */ }
        this._disconnect(node);
      }
      if (wasPlaying) this.onState('stopped');
    }
    dispose() {
      this.stop();
      this.disposed = true;
      if (this.context) {
        this.context.onstatechange = null;
        if (this.context.state !== 'closed') void this.context.close().catch(() => {});
      }
    }
  };
});
