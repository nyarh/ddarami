(() => {
  'use strict';
  if (document.getElementById('ddarami-practice-panel')) return;
  const host = document.createElement('div');
  host.id = 'ddarami-practice-panel';
  const root = host.attachShadow({ mode: 'open' });
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fmt = GPHCore.formatTime;
  const parse = GPHCore.parseTime;
  const ratePresets = [0.25, 0.5, 0.75, 1];
  const defaults = () => ({ a: 0, b: 0, loop: false, rate: 1, bpm: 120, pattern: '8beat', volume: 0.5 });
  let state = defaults(), video = null, id = '', mode = 'video', token = 0;
  let raf, loopCount = 0, seekingLoop = false, loaded = false, ad = false;
  let lastTapTime = null;
  let resumedPastLoopEnd = false;
  const drums = new GPHDrums({
    onBeat: ({ beat }) => showBeat(beat),
    onState: value => {
      if (value !== 'playing') showBeat(0);
      if (value === 'suspended') status('오디오가 중단되었습니다. 드럼 시작을 다시 눌러주세요.', true);
      paint();
    }
  });
  root.innerHTML = `
  <style>
    :host { all:initial; --ddarami-width:min(320px,calc(100vw - 24px)); --ddarami-top:12px; position:fixed; width:var(--ddarami-width); right:12px; top:var(--ddarami-top); z-index:2147483646; color-scheme:dark; color:#f2f5f4; --muted:#bac5c4; --accent:#abebc0; --edge:#485352; --inset:#131a1b; font:14px/1.4 system-ui,sans-serif }
    :host([data-positioned]) { --ddarami-top:clamp(0px,var(--ddarami-y),calc(100vh - 140px)); left:clamp(0px,var(--ddarami-x),calc(100% - var(--ddarami-width))); right:auto; transform:translateY(clamp(min(0px,calc(100vh - 100%)),var(--ddarami-y),0px)) }
    :host([hidden]), [hidden] { display:none !important }
    * { box-sizing:border-box }
    .panel { background:#1b2324; border:1px solid var(--edge); border-radius:14px; box-shadow:0 4px 16px #0004; cursor:grab; user-select:none; touch-action:none }
    .panel[data-dragging],.panel[data-dragging] * { cursor:grabbing }
    .panel-header { display:flex; align-items:center; gap:6px; min-height:64px; padding:8px 12px; border-bottom:1px solid #364141 }
    .panel-header h2 { display:flex; align-items:center; gap:7px; margin:0 auto 0 0; font-size:26px; line-height:1.15; letter-spacing:-.05em; white-space:nowrap }
    .panel-header h2::before { content:""; display:block; width:8px; height:16px; background:radial-gradient(circle,#91a29b 1.3px,transparent 1.6px) 0 0 / 4px 5px }
    button,input,select { min-width:0; border:1px solid var(--edge); border-radius:7px; background:#293333; color:inherit; font:inherit; padding:6px 8px }
    button { min-height:44px; cursor:pointer; font-weight:550 }
    button:hover:not(:disabled),select:hover:not(:disabled) { border-color:#889d94; background:#34423d }
    button:active:not(:disabled) { background:#435348 }
    :focus-visible { outline:2px solid #c4f8d6; outline-offset:-2px }
    :disabled { opacity:.55; pointer-events:none }
    input { user-select:text; background:var(--inset) }
    input::placeholder { color:#a4b2af; opacity:1 }
    #resetPosition { padding-inline:4px; border-color:transparent; background:transparent; color:var(--muted); font-size:12px }
    .transport { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-width:86px; white-space:nowrap; border-color:var(--accent); background:var(--accent); color:#10251a }
    .transport:hover:not(:disabled),.transport:active:not(:disabled) { background:#c6f7d6; border-color:#c6f7d6 }
    .transport::before { content:""; width:0; height:0; border-block:5px solid transparent; border-left:8px solid currentColor }
    .transport[data-playing]::before { width:8px; height:10px; border:0; border-inline:3px solid currentColor; box-sizing:border-box }
    .transport[data-playing="drums"]::before { width:9px; height:9px; border:0; background:currentColor; border-radius:1px }
    .body { padding:8px 12px 10px }
    .row { display:flex; align-items:center; gap:6px; margin-top:6px }
    .row > * { min-width:0 }
    .grow { flex:1 }
    .modes,.presets { display:grid; gap:4px }
    .modes { grid-template-columns:repeat(2,minmax(0,1fr)); background:var(--inset); border-radius:9px; padding:3px }
    .modes button { color:var(--muted); background:transparent; border:1px solid transparent }
    .modes button[aria-pressed=true] { color:#f2faf5; background:#35443d; border-color:#596c60; font-weight:700 }
    .section { margin-top:8px; border-top:1px solid #394444; padding-top:8px }
    .section h3 { margin:0; font-size:15px; font-weight:700 }
    .section > .row:first-child { margin-top:0 }
    .stepper { display:grid; grid-template-columns:44px minmax(48px,auto) 44px; align-items:center; background:var(--inset); border-radius:7px }
    .stepper button { font-size:18px; line-height:1 }
    .speed,.reading,input,.time,.volume-value { font-variant-numeric:tabular-nums }
    .speed { text-align:center; font-weight:700 }
    .presets { grid-template-columns:repeat(4,minmax(0,1fr)); margin-top:5px }
    .presets button[aria-pressed=true] { background:#2c4034; border-color:var(--accent); box-shadow:inset 0 -2px var(--accent); color:var(--accent) }
    .loop-switch { display:inline-flex; align-items:center; justify-content:center; gap:7px; padding:5px 8px; border:0; background:transparent; color:var(--muted) }
    .loop-switch::before { content:""; width:28px; height:16px; border-radius:20px; background:radial-gradient(circle at 8px 50%,#f1f4f2 4px,transparent 5px),#53605b }
    .loop-switch[aria-checked=true] { color:var(--accent) }
    .loop-switch[aria-checked=true]::before { background:radial-gradient(circle at 20px 50%,#193024 4px,transparent 5px),var(--accent) }
    .boundary button { flex:0 0 84px; white-space:nowrap }
    .boundary input { height:44px; text-align:center }
    .caption,.time,.volume-value { font-size:12px; color:var(--muted) }
    .time { display:flex; justify-content:space-between; align-items:baseline; gap:5px; margin-top:8px }
    #position { text-align:right }
    .tempo-heading { display:flex; align-items:center; gap:6px; flex-wrap:wrap }
    .reading { margin-left:auto; white-space:nowrap; color:var(--accent); font-size:12px }
    .reading strong { font-size:19px; line-height:1.2 }
    #tempoBox .row > label { flex:0 0 54px }
    #tempoBox input,#tempoBox select { height:44px }
    #bpm { text-align:center }
    #tap { white-space:nowrap }
    input[type=range] { accent-color:var(--accent); padding:0; cursor:pointer }
    .volume-value { min-width:34px; text-align:right }
    .beat { display:inline-flex; gap:2px }
    .beat i { width:5px; height:7px; border-radius:2px; background:#55645d }
    .beat i.on { background:var(--accent) }
    .status:not(:empty),.notice { margin-top:6px; font-size:12px; color:var(--muted) }
    .status.error,.notice { color:#ffc7af }
    @media (max-width:300px) {
      .panel-header,.body { padding-inline:8px }
      .panel-header h2 { font-size:23px; gap:4px }
      .transport { min-width:70px }
    }
  </style>
  <section class="panel" tabindex="0" aria-label="따라미 연습 패널" aria-description="패널을 드래그하거나 패널에 초점을 두고 방향키를 눌러 이동할 수 있습니다.">
    <header class="panel-header">
      <h2 title="끌어서 패널 이동">따라미</h2>
      <button id="resetPosition" aria-label="패널 위치 초기화" title="오른쪽 위로 이동" hidden>위치 초기화</button>
      <button class="transport" id="play" aria-keyshortcuts="Space" title="현재 모드 시작/정지 ( 단축키: Space )">재생</button>
    </header>
    <div class="body" id="controls">
      <div class="modes" role="group" aria-label="연습 모드">
        <button id="videoMode" aria-pressed="true">영상 연습</button><button id="drumMode" aria-pressed="false">드럼만 연습</button>
      </div>
      <div id="adNotice" class="notice" hidden>광고 재생 중에는 연습이 잠시 멈춥니다.</div>
      <section class="section" aria-labelledby="speedTitle">
        <div class="row">
          <h3 id="speedTitle" class="grow">영상 속도</h3>
          <div class="stepper">
            <button id="slower" aria-label="배속 0.05 감소" aria-keyshortcuts="-" title="0.05× 느리게 ( 단축키: - )">−</button>
            <span class="speed"><span id="rate">1.00</span>×</span>
            <button id="faster" aria-label="배속 0.05 증가" aria-keyshortcuts="=" title="0.05× 빠르게 ( 단축키: = )">+</button>
          </div>
        </div>
        <div class="presets" role="group" aria-label="배속 프리셋">${ratePresets.map(rate => `<button data-rate="${rate}">${rate}×</button>`).join('')}</div>
      </section>
      <section class="section" id="videoTools" aria-labelledby="loopTitle">
        <div class="row"><h3 class="grow" id="loopTitle">구간 반복</h3><button id="loop" class="loop-switch" role="switch" aria-label="구간 반복" aria-checked="false" aria-keyshortcuts="&#92;">꺼짐</button></div>
        <div class="row boundary">
          <button id="setStart" aria-keyshortcuts="[" title="현재 재생 위치를 시작 지점으로 지정 ( 단축키: [ )">시작 지정</button>
          <input class="grow" id="a" aria-label="시작 시간" autocomplete="off" spellcheck="false" value="0:00.00">
        </div>
        <div class="row boundary">
          <button id="setEnd" aria-keyshortcuts="]" title="현재 재생 위치를 종료 지점으로 지정하고 반복 켜기 ( 단축키: ] )">종료 지정</button>
          <input class="grow" id="b" aria-label="종료 시간" placeholder="미지정" autocomplete="off" spellcheck="false">
        </div>
        <div class="time"><span>현재 위치</span><span id="position">영상 대기 중</span></div>
      </section>
      <section id="tempoBox" class="section" aria-labelledby="tempoTitle" hidden>
        <div class="tempo-heading">
          <h3 id="tempoTitle" class="grow">템포 · 드럼</h3>
          <span class="beat" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span class="reading">연습 <strong id="effective">120</strong> BPM</span>
        </div>
        <div class="row"><label class="caption" for="bpm">원곡 BPM</label><input class="grow" id="bpm" type="number" min="30" max="300" step="1" value="120"><button id="tap" title="현재 연습 템포에 맞춰 두 번 이상 누르세요">탭 템포</button></div>
        <div class="row"><label class="caption" for="pattern">스타일</label><select class="grow" id="pattern">${GPHCore.drumPresets.map(({id, label}) => `<option value="${id}">${label}</option>`).join('')}</select></div>
        <div class="row"><label class="caption" for="volume">볼륨</label><input class="grow" id="volume" type="range" min="0" max="100" value="50"><span id="volumeValue" class="volume-value" aria-hidden="true">50%</span></div>
      </section>
      <div id="status" class="status" role="status" aria-live="polite"></div>
    </div>
  </section>`;
  document.documentElement.append(host);
  const $ = (s) => root.querySelector(s);
  const beatLights = root.querySelectorAll('.beat i');
  function showBeat(beat) { beatLights.forEach((el, i) => el.classList.toggle('on', i + 1 === beat)); }
  function status(text, error = false) { $('#status').textContent = text; $('#status').classList.toggle('error', error); }
  function validLoop() { return Boolean(video && GPHCore.validateLoop(state.a, state.b, video.duration).valid); }
  function store() {
    if (!id || !loaded) return;
    const key = `video:${id}`, data = JSON.parse(JSON.stringify(state));
    chrome.storage.local.set({ [key]: data }).catch(() => status('저장하지 못했습니다. 확장을 다시 불러왔다면 탭을 새로고침하세요.', true));
  }
  function boundaryText(name) { return name === 'b' && state.b === 0 ? '' : fmt(state[name]); }
  function paint() {
    for (const name of ['a', 'b']) if (root.activeElement !== $('#' + name)) $('#' + name).value = boundaryText(name);
    $('#rate').textContent = state.rate.toFixed(2);
    if (root.activeElement !== $('#bpm')) $('#bpm').value = Math.round(state.bpm);
    $('#pattern').value = state.pattern; $('#volume').value = Math.round(state.volume * 100);
    showVolume();
    $('#effective').textContent = Math.round(GPHCore.effectiveBpm(state.bpm, state.rate));
    const canLoop = validLoop();
    $('#loop').textContent = state.loop ? '켜짐' : '꺼짐';
    $('#loop').setAttribute('aria-checked', String(state.loop));
    $('#loop').title = (canLoop ? '구간 반복 정지/재개' : '시작과 종료 지점을 지정하세요.') + ' ( 단축키: \\ )';
    $('#videoTools').hidden = mode === 'drums';
    $('#speedTitle').textContent = mode === 'video' ? '영상 속도' : '연습 속도';
    $('#tempoBox').hidden = mode !== 'drums';
    $('#videoMode').setAttribute('aria-pressed', String(mode === 'video')); $('#drumMode').setAttribute('aria-pressed', String(mode === 'drums'));
    $('#play').textContent = mode === 'drums' ? (drums.running ? '드럼 정지' : '드럼 시작') : video && !video.paused ? '일시정지' : '재생';
    const playing = mode === 'drums' ? drums.running : video && !video.paused;
    if (playing) $('#play').dataset.playing = mode;
    else $('#play').removeAttribute('data-playing');
    for (const el of root.querySelectorAll('button[data-rate]')) el.setAttribute('aria-pressed', String(Number(el.dataset.rate) === state.rate));
    const unavailable = !video || !loaded || ad;
    for (const el of $('#controls').querySelectorAll('button,input,select')) el.disabled = unavailable;
    $('#play').disabled = unavailable;
    $('#slower').disabled = unavailable || state.rate <= 0.25;
    $('#faster').disabled = unavailable || state.rate >= 2;
    $('#loop').disabled = unavailable || !canLoop;
    $('#adNotice').hidden = !ad;
    if (!video || !loaded) $('#position').textContent = '영상 대기 중';
  }
  function stop() { token++; drums.stop(); if (video) video.pause(); paint(); }
  function updateDrums() { drums.configure({ bpm: GPHCore.effectiveBpm(state.bpm, state.rate), pattern: state.pattern, volume: state.volume }); }
  async function start({ resumeHere = false } = {}) {
    if (!video || ad || !loaded) return;
    const request = ++token;
    try {
      if (mode === 'drums') {
        video.pause();
        updateDrums();
        await drums.start();
      } else {
        drums.stop();
        resumedPastLoopEnd = resumeHere && state.loop && validLoop() && video.currentTime >= state.b;
        if (!resumeHere && state.loop && validLoop() && (video.currentTime < state.a || video.currentTime >= state.b)) {
          video.currentTime = state.a;
        }
        await video.play();
      }
    } catch {
      if (request === token) status('재생이 차단되었습니다. 다시 재생 버튼을 눌러주세요.', true);
    }
    paint();
  }
  function togglePlay() {
    if (mode === 'drums' ? drums.running : video && !video.paused) stop();
    else start();
  }
  function changeMode(next) {
    if (next === mode || !video || ad || !loaded) return;
    stop();
    mode = next;
    lastTapTime = null;
    paint(); status('');
    start({ resumeHere: next === 'video' });
  }
  function setRate(rate) {
    if (!video || ad || !loaded) return;
    rate = Math.round(clamp(rate, 0.25, 2) * 100) / 100;
    if (rate !== state.rate) lastTapTime = null;
    try { video.preservesPitch = true; video.playbackRate = rate; state.rate = video.playbackRate; updateDrums(); store(); paint(); if (Math.abs(state.rate - rate) > 0.001) status('이 영상이 지원하는 배속으로 조정했습니다.'); }
    catch { status('이 영상에서 해당 배속을 사용할 수 없습니다.', true); }
  }
  function setBoundary(name, value, enableLoop = false) {
    if (!video || ad || mode === 'drums' || !loaded) return;
    if (!Number.isFinite(value) || !Number.isFinite(video.duration) || value < 0 || value > video.duration) { status('영상 길이 안의 시간(분:초 또는 초)을 입력하세요.', true); paint(); return; }
    state[name] = Math.round(value * 100) / 100;
    const range = GPHCore.validateLoop(state.a, state.b, video.duration);
    state.loop = range.valid && (state.loop || enableLoop);
    resumedPastLoopEnd = false;
    loopCount = 0;
    store(); paint();
    if (name === 'a' && !range.valid) status('종료할 위치에서 ‘종료 지정’을 누르세요.');
    else status(range.error, !range.valid);
  }
  function markBoundary(name) {
    if (video) setBoundary(name, video.currentTime, name === 'b');
  }
  function toggleLoop() {
    if (!video || ad || mode !== 'video' || !loaded) return;
    const range = GPHCore.validateLoop(state.a, state.b, video.duration);
    if (!range.valid) return status(range.error, true);
    state.loop = !state.loop;
    resumedPastLoopEnd = false;
    loopCount = 0;
    if (state.loop && (video.currentTime < state.a || video.currentTime >= state.b)) video.currentTime = state.a;
    store(); paint();
  }
  // Save the top-left corner as a fraction of the viewport, independent of panel size.
  let panelPosition = null, drag = null, positionEdited = false, suppressDragClick = false;
  let positionRequested = false;
  const panel = $('.panel');
  function setPanelPosition(position) {
    panelPosition = position;
    host.toggleAttribute('data-positioned', Boolean(position));
    $('#resetPosition').hidden = !position;
    if (position) {
      host.style.setProperty('--ddarami-x', `${position.left * 100}vw`);
      host.style.setProperty('--ddarami-y', `${position.top * 100}vh`);
    }
  }
  function movePanelTo(left, top) {
    const { width, height } = host.getBoundingClientRect();
    const viewport = document.documentElement;
    // A panel taller than the viewport can be dragged up to reach its last control.
    const freeHeight = viewport.clientHeight - height;
    setPanelPosition({
      left: clamp(left, 0, Math.max(0, viewport.clientWidth - width)) / window.innerWidth,
      top: clamp(top, Math.min(0, freeHeight), Math.max(0, freeHeight)) / window.innerHeight
    });
  }
  function savePosition() {
    positionEdited = true;
    chrome.storage.local.set({ panelPosition }).catch(() => status('패널 위치를 저장하지 못했습니다.', true));
  }
  async function restorePanelPosition() {
    positionRequested = true;
    try {
      const { panelPosition: saved } = await chrome.storage.local.get('panelPosition');
      if (!saved || positionEdited || drag?.moved) return;
      const fraction = n => Number.isFinite(n) && n >= 0 && n <= 1;
      if (fraction(saved.left) && Number.isFinite(saved.top) && saved.top <= 1) {
        setPanelPosition(saved);
      } else if (fraction(saved.x) && fraction(saved.y)) {
        // Older versions stored a fraction of the space left around the panel.
        if (host.hidden) { positionRequested = false; return; }
        const { width, height } = host.getBoundingClientRect();
        const viewport = document.documentElement;
        movePanelTo(saved.x * Math.max(0, viewport.clientWidth - width), saved.y * Math.max(0, viewport.clientHeight - height));
        savePosition();
      }
    } catch { /* The panel stays at its default position when storage is unavailable. */ }
  }

  panel.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    // The browser can consume pointer-up when a popup takes focus.
    finishDrag(false);
    suppressDragClick = false;
    const select = event.target.closest('select');
    if (select && event.pointerType !== 'touch') {
      if (!event.altKey) return;
      event.preventDefault(); // Alt-drag moves the panel from a native picker.
    }
    const rect = host.getBoundingClientRect();
    const action = event.target.closest('button, label');
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top,
      previous: panelPosition, moved: false, input: event.target.closest('input'), actionBounds: action?.getBoundingClientRect() };
  }, true);
  document.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    if (!(event.buttons & 1)) { finishDrag(false); return; }
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 10) return;
      const bounds = drag.actionBounds;
      if (bounds && event.clientX >= bounds.left && event.clientX < bounds.right &&
          event.clientY >= bounds.top && event.clientY < bounds.bottom) return;
      if (drag.input && Math.abs(dx) > Math.abs(dy)) {
        if (drag.input.type === 'range') applyVolume();
        drag = null; // Horizontal gestures edit text or adjust the slider.
        return;
      }
      drag.moved = true;
      suppressDragClick = true;
      panel.setAttribute('data-dragging', '');
      if (drag.input?.type === 'range') {
        // End the native thumb drag before moving its track under the pointer.
        drag.input.disabled = true;
        drag.input.value = state.volume * 100;
      }
    }
    event.preventDefault();
    movePanelTo(drag.left + dx, drag.top + dy);
    if (!panel.hasPointerCapture(event.pointerId)) panel.setPointerCapture(event.pointerId);
  }, true);
  function finishDrag(commit) {
    if (!drag) return;
    const { id, moved, previous, input } = drag;
    drag = null;
    if (input?.type === 'range') {
      input.disabled = false;
      if (commit && !moved) applyVolume();
      else input.value = state.volume * 100;
    }
    if (moved) {
      panel.removeAttribute('data-dragging');
      if (commit) savePosition();
      else setPanelPosition(previous);
    }
    if (panel.hasPointerCapture(id)) panel.releasePointerCapture(id);
  }
  document.addEventListener('pointerup', event => {
    if (drag?.id === event.pointerId) finishDrag(true);
  }, true);
  document.addEventListener('pointercancel', event => {
    if (drag?.id === event.pointerId) finishDrag(false);
  }, true);
  panel.addEventListener('focusin', event => {
    if (event.target === panel || drag || !event.target.matches(':focus-visible')) return;
    const field = event.target.getBoundingClientRect();
    const shift = field.top < 0 ? -field.top : Math.min(0, document.documentElement.clientHeight - field.bottom);
    if (shift) {
      const { left, top } = host.getBoundingClientRect();
      movePanelTo(left, top + shift);
    }
  });
  window.addEventListener('blur', () => finishDrag(false));
  panel.addEventListener('click', event => {
    if (suppressDragClick && event.detail) {
      suppressDragClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  // In fullscreen the panel is inside the player; its controls own these events.
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'dblclick', 'keydown', 'keyup']) {
    host.addEventListener(type, event => event.stopPropagation());
  }
  panel.onkeydown = event => {
    if (event.target !== panel) return;
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const direction = directions[event.key];
    if (!direction || event.altKey || event.ctrlKey || event.metaKey || drag) return;
    event.preventDefault();
    event.stopPropagation();
    const { left, top } = host.getBoundingClientRect();
    movePanelTo(left + direction[0] * 10, top + direction[1] * 10);
    panel.focus({ preventScroll: true });
    savePosition();
  };
  $('#resetPosition').onclick = () => {
    setPanelPosition(null);
    savePosition();
    panel.focus();
  };
  $('#videoMode').onclick=()=>changeMode('video'); $('#drumMode').onclick=()=>changeMode('drums'); $('#play').onclick=togglePlay;
  $('#setStart').onclick = () => markBoundary('a');
  $('#setEnd').onclick = () => markBoundary('b');
  for (const name of ['a', 'b']) {
    const field = $('#' + name);
    function commitTime() {
      if (field.value === boundaryText(name)) return;
      setBoundary(name, parse(field.value));
      field.value = boundaryText(name);
    }
    field.addEventListener('change', commitTime);
    field.addEventListener('keydown', event => {
      if (event.isComposing || (event.key !== 'Enter' && event.key !== 'Escape')) return;
      event.preventDefault();
      if (event.key === 'Enter') commitTime();
      else field.value = boundaryText(name);
      field.select();
    });
  }
  root.querySelectorAll('[data-rate]').forEach(el=>el.onclick=()=>setRate(Number(el.dataset.rate)));
  $('#slower').onclick=()=>setRate(state.rate-0.05);$('#faster').onclick=()=>setRate(state.rate+0.05);$('#loop').onclick=toggleLoop;
  $('#bpm').onchange = event => {
    const field = event.target;
    const bpm = field.valueAsNumber;
    if (!Number.isFinite(bpm) || bpm < 30 || bpm > 300) {
      status('원곡 BPM은 30–300 사이로 입력하세요.', true);
      field.value = Math.round(state.bpm);
      return;
    }
    lastTapTime = null;
    state.bpm = Math.round(bpm);
    field.value = state.bpm;
    status('');
    updateDrums(); store(); paint();
  };
  $('#tap').onclick = event => {
    const tapped = GPHCore.tapTempo([lastTapTime, event.timeStamp], state.rate);
    lastTapTime = event.timeStamp;
    if (tapped === null) return status('한 박 뒤에 한 번 더 눌러주세요.');
    const songBpm = tapped / state.rate;
    state.bpm = Math.round(clamp(songBpm, 30, 300) * 10) / 10;
    $('#bpm').value = Math.round(state.bpm);
    updateDrums();
    paint();
    store();
    status(songBpm < 30 || songBpm > 300 ? '원곡 BPM 범위(30–300)에 맞췄습니다.' : `탭 템포 · ${$('#effective').textContent} BPM`);
  };
  function showVolume() {
    const value = $('#volume').value + '%';
    $('#volumeValue').textContent = value;
    $('#volume').setAttribute('aria-valuetext', value);
  }
  function applyVolume() {
    showVolume();
    const volume = Number($('#volume').value) / 100;
    if (volume === state.volume) return;
    state.volume = volume; updateDrums(); store();
  }
  $('#volume').oninput = event => { if (drag?.input !== event.target) applyVolume(); };
  $('#pattern').onchange=e=>{state.pattern=e.target.value;updateDrums();store();};
  const shortcutButtons = new Map(
    Array.from(root.querySelectorAll('button[aria-keyshortcuts]'), button => [button.getAttribute('aria-keyshortcuts'), button])
  );
  let handledSpaceDown = false;
  function onKey(event) {
    const space = event.key === ' ' || event.code === 'Space';
    if (space && !event.repeat) handledSpaceDown = false;
    if (!host.isConnected || host.hidden || !loaded || ad || !video || event.defaultPrevented ||
        event.isComposing || event.keyCode === 229 || event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return;

    let shortcut = space ? 'Space' : event.key;
    if (shortcut === '₩' || shortcut === '￦') {
      shortcut = '\\';
    }
    const button = shortcutButtons.get(shortcut);
    if (!button || button.disabled || button.closest('[hidden]')) return;
    const editing = event.composedPath().some(node => node instanceof HTMLElement &&
      (node.isContentEditable || node.matches('input, textarea, select, [role="textbox"], [role="searchbox"], [role="combobox"]')));
    if (editing) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (space) handledSpaceDown = true;
    if (!event.repeat) button.click();
  }
  window.addEventListener('keydown', onKey, true);
  // The player and focused buttons can also act on Space release.
  window.addEventListener('keyup', event => {
    if (!handledSpaceDown || (event.key !== ' ' && event.code !== 'Space')) return;
    handledSpaceDown = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  function onPlay() {
    if (mode === 'drums') {
      token++;
      drums.stop();
      mode = 'video';
      resumedPastLoopEnd = state.loop && validLoop() && video.currentTime >= state.b;
      lastTapTime = null;
      status('영상 재생을 감지해 드럼을 멈췄습니다.');
    }
    paint();
  }
  function onRate() { if(!video||!loaded||ad)return;if(state.rate!==video.playbackRate)lastTapTime=null;state.rate=video.playbackRate;updateDrums();store();paint(); }
  function onEnded(){if(!resumedPastLoopEnd&&state.loop&&validLoop()&&mode==='video'&&!ad){video.currentTime=state.a;video.play().catch(()=>{});}paint();}
  function onSeeked(){seekingLoop=false;}
  function detach() { if(video){video.removeEventListener('play',onPlay);video.removeEventListener('pause',paint);video.removeEventListener('ratechange',onRate);video.removeEventListener('durationchange',paint);video.removeEventListener('ended',onEnded);video.removeEventListener('seeked',onSeeked);} }
  async function connect(nextId,nextVideo) {
    const oldId=id;
    finishDrag(false);
    token++;drums.stop();detach();mode='video';loopCount=0;seekingLoop=false;resumedPastLoopEnd=false;video=nextVideo;id=nextId;loaded=false;
    lastTapTime = null;
    if(oldId!==id) state=defaults();
    paint();
    const expectedVideo=video, expectedId=id;
    if(video){video.addEventListener('play',onPlay);video.addEventListener('pause',paint);video.addEventListener('ratechange',onRate);video.addEventListener('durationchange',paint);video.addEventListener('ended',onEnded);video.addEventListener('seeked',onSeeked);}
    try { const saved=(await chrome.storage.local.get(`video:${id}`))[`video:${id}`]; if(video!==expectedVideo||id!==expectedId)return;
      if(saved&&typeof saved==='object') {
        state=defaults();
        for (const key of Object.keys(state)) {
          if (Object.hasOwn(saved, key)) state[key] = saved[key];
        }
        state.a=Math.max(0,Number(state.a)||0);state.b=Math.max(0,Number(state.b)||0);state.rate=clamp(Number(state.rate)||1,.25,2);state.bpm=clamp(Number(state.bpm)||120,30,300);state.volume=clamp(Number(state.volume)||0,0,1);
        state.pattern=GPHCore.hasDrumPreset(state.pattern)?state.pattern:'8beat';
        state.loop=Boolean(state.loop);}
      loaded=true;if(video&&!ad){video.preservesPitch=true;video.playbackRate=state.rate;}paint();status('');
    }catch{if(video!==expectedVideo||id!==expectedId)return;loaded=true;paint();status('저장 공간에 접근하지 못했습니다. 탭을 새로고침해 주세요.',true);}
  }
  function inspect() {
    const url=new URL(location.href), nextId=url.pathname==='/watch'?url.searchParams.get('v'):null;
    const nextVideo=nextId?document.querySelector('#movie_player video.html5-main-video, video.html5-main-video, video'):null;
    host.hidden=!nextId; if(!nextId){if(id){finishDrag(false);stop();detach();video=null;id='';loaded=false;}return;}
    const nextAd=Boolean(document.querySelector('#movie_player.ad-showing, #movie_player.ad-interrupting'));
    if(nextAd!==ad){ad=nextAd;if(ad)stop();else if(video&&loaded){video.playbackRate=state.rate;}paint();}
    if(nextId!==id||nextVideo!==video)connect(nextId,nextVideo);
    mountPanel();
    if (!positionRequested) void restorePanelPosition();
  }
  function mountPanel() {
    const parent = document.fullscreenElement || document.documentElement;
    if (host.parentElement !== parent) parent.append(host);
  }
  function tick(){
    if(video&&loaded&&!ad){const t=video.currentTime,d=video.duration;
      if (mode === 'video') {
        const position = `${fmt(t)} / ${Number.isFinite(d)?fmt(d):'실시간'}${state.loop?` · 반복 ${loopCount}회`:''}`;
        if ($('#position').textContent !== position) $('#position').textContent = position;
      }
      if(state.loop&&video.readyState>0&&Number.isFinite(d)&&!validLoop()){state.loop=false;store();paint();status('영상 길이가 바뀌어 반복을 껐습니다. 구간을 다시 확인하세요.',true);}
      // After resuming beyond the loop, rearm it when playback returns below its end.
      if (t < state.b) resumedPastLoopEnd = false;
      if(mode==='video'&&!resumedPastLoopEnd&&state.loop&&validLoop()&&!video.paused&&!video.seeking&&!seekingLoop&&t>=state.b){seekingLoop=true;video.currentTime=state.a;loopCount++;paint();}

    }
    raf=requestAnimationFrame(tick);
  }
  const poll=setInterval(inspect,500);document.addEventListener('yt-navigate-finish',inspect);document.addEventListener('fullscreenchange',inspect);window.addEventListener('pagehide',(event)=>{stop();if(event.persisted)return;detach();clearInterval(poll);cancelAnimationFrame(raf);drums.dispose();});window.addEventListener('pageshow',(event)=>{if(event.persisted){inspect();paint();}});
  inspect();paint();tick();
})();
