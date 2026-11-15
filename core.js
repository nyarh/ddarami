/* Shared, dependency-free timing helpers. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GPHCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function parseTime(value) {
    const text = String(value ?? '').trim();
    if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(text)) return NaN;
    const parts = text.split(':').map(Number);
    if (parts.slice(1).some(part => part >= 60)) return NaN;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }
  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00.00';
    const hundredths = Math.round(seconds * 100);
    const minutes = Math.floor(hundredths / 6000);
    const remainder = (hundredths % 6000) / 100;
    return `${minutes}:${remainder.toFixed(2).padStart(5, '0')}`;
  }
  function validateLoop(a, b, duration) {
    if (![a, b, duration].every(Number.isFinite) || duration <= 0) {
      return { valid: false, error: '영상 길이를 확인한 뒤 구간을 설정해 주세요.' };
    }
    if (a < 0 || b > duration) return { valid: false, error: '구간은 영상 길이 안에 있어야 합니다.' };
    if (b - a < 0.2 - Number.EPSILON * 8) return { valid: false, error: '종료 시간은 시작 시간보다 최소 0.2초 뒤여야 합니다.' };
    return { valid: true, error: '' };
  }
  function effectiveBpm(bpm, rate) {
    return Number.isFinite(bpm) && bpm > 0 && Number.isFinite(rate) && rate > 0 ? bpm * rate : NaN;
  }
  function tapTempo(timestamps, rate = 1) {
    if (!Array.isArray(timestamps) || timestamps.length < 2 || !Number.isFinite(rate) || rate <= 0) return null;
    const [previous, current] = timestamps.slice(-2);
    if (!Number.isFinite(previous) || !Number.isFinite(current)) return null;
    const interval = current - previous;
    if (interval * rate < 120 || interval * rate > 3000) return null;
    return 60000 / interval;
  }
  // Each hit is [beat, velocity]. Kick and snare span a 4/4 bar;
  // the hi-hat phrase repeats on each quarter note.
  const basicKick = [[0, 1], [2, 0.9]];
  const backbeat = [[1, 0.82], [3, 0.9]];
  const eighthHats = [[0, 0.48], [0.5, 0.30]];
  const patterns = {
    '8beat': { label: '기본 8비트', kick: basicKick, snare: backbeat, hats: eighthHats },
    rock: {
      label: '록', kick: [[0, 1], [2, 0.95], [2.5, 0.82]],
      snare: [[1, 0.95], [3, 1]], hats: [[0, 0.62], [0.5, 0.38]]
    },
    shuffle: {
      label: '셔플', kick: basicKick, snare: backbeat, hats: [[0, 0.48], [2 / 3, 0.30]]
    },
    groove: {
      label: '그루브', kick: [[0, 1], [1.5, 0.78], [2.75, 0.88]],
      snare: [[1, 0.82], [2.5, 0.24], [3, 0.9]], hats: eighthHats
    },
    funk: {
      label: '펑크', kick: [[0, 1], [0.75, 0.72], [1.5, 0.84], [2.5, 0.9], [3.75, 0.68]],
      snare: [[1, 0.9], [1.75, 0.22], [2.25, 0.28], [3, 0.96]],
      hats: [[0, 0.48], [0.25, 0.22], [0.5, 0.58], [0.75, 0.26]]
    },
    '16beat': {
      label: '스트레이트 16비트', kick: basicKick, snare: backbeat,
      hats: [[0, 0.48], [0.25, 0.30], [0.5, 0.30], [0.75, 0.30]]
    }
  };
  const drumPresets = Object.freeze(Object.entries(patterns).map(([id, { label }]) => Object.freeze({ id, label })));
  function hasDrumPreset(id) {
    return typeof id === 'string' && Object.hasOwn(patterns, id);
  }
  function patternEvents(name = '8beat') {
    const pattern = hasDrumPreset(name) ? patterns[name] : patterns['8beat'];
    const events = [];
    for (const voice of ['kick', 'snare']) {
      for (const [beat, velocity] of pattern[voice]) events.push({ beat, voice, velocity });
    }
    for (let beat = 0; beat < 4; beat++) {
      for (const [offset, velocity] of pattern.hats) events.push({ beat: beat + offset, voice: 'hihat', velocity });
    }
    return events.sort((a, b) => a.beat - b.beat);
  }
  return Object.freeze({ parseTime, formatTime, validateLoop, effectiveBpm, tapTempo, drumPresets, hasDrumPreset, patternEvents });
});
