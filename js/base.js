/* BAD REVIEWS — base: helpers, random, audio, textures, characters */
'use strict';
const T = window.THREE;
const $ = s => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
const angLerp = (a, b, k) => { let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * k; };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = matchMedia('(pointer: coarse)').matches;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const H = 3.4; // storey height

/* seeded random (same world for every player) */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let R = mulberry32(1);
function seedRng(s) { R = mulberry32(s); }
const rr = (a, b) => a + R() * (b - a);
const rpick = a => a[Math.floor(R() * a.length)];
function rshuffle(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

const FD = '"Unbounded","Arial Black",sans-serif', FM = '"PT Mono",Menlo,monospace', FH = '"Caveat","Segoe Print",cursive';
let maxAniso = 4;
const _mcache = new Map();
const M = (c, o) => { if (!o) { let m = _mcache.get(c); if (!m) { m = new T.MeshPhongMaterial({ color: c, flatShading: true, shininess: 8, specular: 0x0c0c0c }); _mcache.set(c, m); } return m; } return new T.MeshPhongMaterial(Object.assign({ color: c, flatShading: true, shininess: 8, specular: 0x0c0c0c }, o)); };
const B = (c, o) => new T.MeshBasicMaterial(Object.assign({ color: c }, o || {}));
const cyl = (a, b, h, s = 8) => new T.CylinderGeometry(a, b, h, s);
const sph = (r, w = 10, h = 8) => new T.SphereGeometry(r, w, h);
function ctex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new T.CanvasTexture(c); t.anisotropy = maxAniso; return t; }
function repTex(base, rx, ry) { const t = base.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry); return t; }

/* ================= AUDIO (synthesized, positional) ================= */
const A = { ctx: null };
const amb = {};
function aInit() {
  if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  try { A.ctx = new AC(); } catch (e) { return; }
  A.out = A.ctx.createGain(); A.out.gain.value = 0.9;
  const comp = A.ctx.createDynamicsCompressor(); A.out.connect(comp); comp.connect(A.ctx.destination);
  const len = A.ctx.sampleRate * 2; A.nb = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
  const d = A.nb.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  startAmb();
}
const now = () => A.ctx.currentTime;
function setPannerPos(p, pos) {
  if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
}
function makePanner(pos, ref = 2.2) {
  const p = A.ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.maxDistance = 60; p.rolloffFactor = 1.4;
  setPannerPos(p, pos); p.connect(A.out); return p;
}
function updateListener(cam) {
  if (!A.ctx) return; const l = A.ctx.listener; const p = cam.getWorldPosition(new T.Vector3());
  const f = new T.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new T.Quaternion()));
  if (l.positionX) { l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z; l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; }
  else { l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
}
function tone(type, f, dur, vol, delay = 0, fEnd, pos) {
  if (!A.ctx) return; const t = now() + delay;
  const o = A.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
  const g = A.ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.015, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(pos ? makePanner(pos) : A.out); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, freq, q = 1, type = 'lowpass', delay = 0, att = 0.005, pos) {
  if (!A.ctx) return; const t = now() + delay;
  const s = A.ctx.createBufferSource(); s.buffer = A.nb;
  const f = A.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = A.ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(pos ? makePanner(pos) : A.out); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}
const sfx = {
  step(kind, pos) { if (kind === 'water') { noise(0.18, 0.18, 1400, 1.5, 'bandpass', 0, 0.01, pos); return; } const soft = kind === 'soft'; noise(0.09, soft ? 0.1 : 0.2, soft ? 380 : 700, 0.8, 'lowpass', 0, 0.005, pos); tone('sine', soft ? 60 : 85, 0.07, soft ? 0.07 : 0.11, 0, null, pos); },
  slam(pos) { noise(0.7, 1.0, 260, 0.7, 'lowpass', 0, 0.005, pos); tone('sine', 48, 0.8, 0.9, 0, 36, pos); noise(0.18, 0.5, 2200, 1.2, 'bandpass', 0, 0.005, pos); },
  door(pos) { noise(0.9, 0.14, 900, 6, 'bandpass', 0, 0.2, pos); tone('sawtooth', 160, 0.9, 0.025, 0, 110, pos); },
  doorClose(pos) { noise(0.25, 0.4, 400, 1, 'lowpass', 0, 0.005, pos); tone('sine', 70, 0.2, 0.25, 0, null, pos); },
  locked(pos) { tone('square', 140, 0.06, 0.08, 0, null, pos); tone('square', 120, 0.06, 0.08, 0.08, null, pos); noise(0.1, 0.2, 2000, 3, 'bandpass', 0, 0.005, pos); },
  creak(pos) { for (let i = 0; i < 6; i++) tone('sawtooth', 120 + Math.random() * 60, 0.55, 0.03, i * 0.45, 85 + Math.random() * 30, pos); noise(2.8, 0.09, 700, 5, 'bandpass', 0, 0.4, pos); },
  clunk(pos) { tone('square', 85, 0.18, 0.22, 0, null, pos); noise(0.12, 0.6, 1400, 2, 'bandpass', 0, 0.005, pos); noise(0.4, 0.3, 200, 1, 'lowpass', 0.02, 0.005, pos); },
  zap(pos) { noise(0.08, 0.22, 3000, 3, 'bandpass', 0, 0.005, pos); tone('square', 120, 0.06, 0.05, 0, null, pos); },
  bell(pos) { [[1, 0.2, 2.2], [2.76, 0.09, 1.2], [5.4, 0.04, 0.6]].forEach(([h, v, d]) => tone('sine', 1250 * h, d, v, 0, null, pos)); },
  ring(pos) { for (let k = 0; k < 2; k++) for (let i = 0; i < 14; i++) tone('square', i % 2 ? 480 : 440, 0.045, 0.05, k * 0.7 + i * 0.05, null, pos); },
  knock(n = 3, pos) { for (let i = 0; i < n; i++) { noise(0.12, 0.5, 320, 1, 'lowpass', i * 0.32, 0.005, pos); tone('sine', 90, 0.1, 0.22, i * 0.32, null, pos); } },
  blip(nav) { if (nav) tone('sine', 660 + Math.random() * 140, 0.06, 0.035); else tone('square', 150 + Math.random() * 130, 0.07, 0.03); },
  tick() { noise(0.03, 0.05, 4000, 1, 'highpass'); },
  sting() { [98, 103.8, 146.8, 207.6, 311].forEach((f, i) => tone('sawtooth', f, 3.2, 0.06, i * 0.02)); noise(1.5, 0.4, 500, 0.7); },
  hit() { tone('sawtooth', 110, 0.9, 0.12, 0, 55); noise(0.5, 0.5, 600, 0.8); tone('sawtooth', 233, 0.6, 0.06); },
  cut() { tone('sine', 60, 0.4, 0.4, 0, 30); noise(0.3, 0.4, 900, 1, 'bandpass'); },
  carDoor() { noise(0.25, 0.7, 500, 1); tone('sine', 70, 0.3, 0.5); },
  ui() { tone('triangle', 520, 0.08, 0.05); },
  good() { tone('triangle', 660, 0.12, 0.06); tone('triangle', 880, 0.18, 0.05, 0.1); },
  bad() { tone('triangle', 300, 0.18, 0.06); tone('triangle', 220, 0.25, 0.05, 0.12); },
  stamp() { noise(0.15, 0.7, 400, 1); tone('sine', 110, 0.15, 0.3); },
  coin() { tone('square', 1320, 0.06, 0.03); tone('square', 1760, 0.12, 0.03, 0.06); },
  paper() { noise(0.25, 0.12, 3000, 0.7, 'highpass', 0, 0.05); },
  drawer(pos) { noise(0.35, 0.18, 600, 2, 'bandpass', 0, 0.05, pos); tone('sine', 90, 0.12, 0.06, 0.28, null, pos); },
  thud(pos) { noise(0.5, 0.9, 220, 0.8, 'lowpass', 0, 0.005, pos); tone('sine', 55, 0.4, 0.6, 0, 40, pos); noise(0.2, 0.3, 1800, 2, 'bandpass', 0.05, 0.005, pos); },
  whoosh(pos) { noise(0.7, 0.25, 900, 0.8, 'bandpass', 0, 0.3, pos); },
  bounce(pos) { tone('sine', 220 + Math.random() * 30, 0.12, 0.18, 0, 120, pos); noise(0.05, 0.15, 900, 2, 'bandpass', 0, 0.005, pos); },
  run(pos) { for (let i = 0; i < 6; i++) { noise(0.07, 0.3, 600, 1, 'lowpass', i * 0.12, 0.005, pos); tone('sine', 80, 0.06, 0.12, i * 0.12, null, pos); } },
  sniff(pos) { for (let i = 0; i < 3; i++) noise(0.14, 0.35, 1200, 2, 'bandpass', i * 0.18, 0.02, pos); },
  roar(pos) { tone('sawtooth', 70, 1.4, 0.3, 0, 45, pos); noise(1.3, 0.5, 400, 0.8, 'lowpass', 0, 0.1, pos); tone('square', 140, 0.9, 0.08, 0.1, 90, pos); },
  splash(pos) { noise(0.4, 0.4, 1200, 1, 'bandpass', 0, 0.01, pos); },
  ding(pos) { tone('sine', 1046, 1.2, 0.12, 0, null, pos); tone('sine', 784, 1.4, 0.1, 0.25, null, pos); },
  wrench(pos) { for (let i = 0; i < 4; i++) { tone('square', 900 + i * 40, 0.05, 0.04, i * 0.15, null, pos); noise(0.06, 0.2, 3000, 3, 'bandpass', i * 0.15, 0.005, pos); } },
};
function startAmb() {
  const c = A.ctx;
  const n = c.createBufferSource(); n.buffer = A.nb; n.loop = true;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.6;
  const g = c.createGain(); g.gain.value = 0; n.connect(f); f.connect(g); g.connect(A.out); n.start();
  const l = c.createOscillator(); l.frequency.value = 0.11; const lg = c.createGain(); lg.gain.value = 220; l.connect(lg); lg.connect(f.frequency); l.start();
  amb.wind = g;
  const h = c.createOscillator(); h.type = 'sawtooth'; h.frequency.value = 50; const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 180;
  const hg = c.createGain(); hg.gain.value = 0; h.connect(hf); hf.connect(hg); hg.connect(A.out); h.start(); amb.hum = hg;
  const e = c.createOscillator(); e.type = 'sawtooth'; e.frequency.value = 34; const ef = c.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 260;
  const eg = c.createGain(); eg.gain.value = 0; e.connect(ef); ef.connect(eg); eg.connect(A.out); e.start(); amb.eng = eg; amb.engF = e.frequency;
  const d1 = c.createOscillator(); d1.frequency.value = 55; const d2 = c.createOscillator(); d2.frequency.value = 58.3;
  const dg = c.createGain(); dg.gain.value = 0; d1.connect(dg); d2.connect(dg); dg.connect(A.out); d1.start(); d2.start(); amb.drone = dg;
}
function setAmb(k, v, tc = 0.6) { if (!A.ctx || !amb[k]) return; amb[k].gain.setTargetAtTime(v, now(), tc / 3); }
/* a looping positional sound (radio static, monster breath) */
function loopSound(kind, pos) {
  if (!A.ctx) return { setPos() {}, stop() {}, setVol() {} };
  const c = A.ctx; const p = makePanner(pos, kind === 'radio' ? 1.5 : 2.5); const g = c.createGain(); g.gain.value = 0; g.connect(p);
  const nodes = [];
  if (kind === 'radio') {
    const s = c.createBufferSource(); s.buffer = A.nb; s.loop = true; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7;
    s.connect(f); f.connect(g); s.start(); nodes.push(s);
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 220; const og = c.createGain(); og.gain.value = 0.02; o.connect(og); og.connect(g); o.start(); nodes.push(o);
    const l = c.createOscillator(); l.frequency.value = 0.7; const lg = c.createGain(); lg.gain.value = 120; l.connect(lg); lg.connect(o.frequency); l.start(); nodes.push(l);
    g.gain.setTargetAtTime(0.35, now(), 0.1);
  } else {
    const s = c.createBufferSource(); s.buffer = A.nb; s.loop = true; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 1.2;
    const am = c.createGain(); am.gain.value = 0.3; s.connect(f); f.connect(am); am.connect(g); s.start(); nodes.push(s);
    const l = c.createOscillator(); l.frequency.value = 0.45; const lg = c.createGain(); lg.gain.value = 0.3; l.connect(lg); lg.connect(am.gain); l.start(); nodes.push(l);
    g.gain.setTargetAtTime(0.9, now(), 0.3);
  }
  return {
    setPos(v) { setPannerPos(p, v); },
    setVol(v) { g.gain.setTargetAtTime(v, now(), 0.2); },
    stop() { g.gain.setTargetAtTime(0, now(), 0.1); setTimeout(() => nodes.forEach(n => { try { n.stop(); } catch (e) {} }), 600); },
  };
}

/* ================= TEXTURES ================= */
const TX = {};
function buildTextures() {
  const neon = broken => ctex(1024, 200, (g, w, h) => {
    g.font = `900 112px ${FD}`; g.textBaseline = 'middle';
    const L = [...'ОТЕЛЬ УЮТ']; const ws = L.map(l => g.measureText(l).width + (l === ' ' ? 0 : 6));
    let x = (w - ws.reduce((a, b) => a + b, 0)) / 2;
    L.forEach((l, i) => {
      if (broken && l === 'Ю') { g.shadowBlur = 0; g.fillStyle = '#3b1a20'; g.fillText(l, x, h / 2 + 6); }
      else { g.shadowColor = '#ff2a48'; g.shadowBlur = 34; g.fillStyle = '#ff4a62'; g.fillText(l, x, h / 2 + 6); g.shadowBlur = 10; g.fillStyle = '#ffd6dc'; g.fillText(l, x, h / 2 + 6); }
      x += ws[i];
    });
  });
  TX.neonFull = neon(false); TX.neonBroken = neon(true);
  const paper = (base, stripe, dot, stains) => ctex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 64) { g.fillStyle = stripe; g.fillRect(x, 0, 22, h); }
    g.fillStyle = dot; for (let y = 16; y < h; y += 64) for (let x = 48; x < w; x += 64) { g.beginPath(); g.ellipse(x, y, 7, 11, 0, 0, 7); g.fill(); }
    for (let i = 0; i < stains; i++) { const x = rand(0, w), y = rand(0, h), r = rand(20, 60); const gr = g.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, 'rgba(25,18,8,.3)'); gr.addColorStop(1, 'rgba(25,18,8,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  });
  TX.wallLobby = paper('#3e4a36', '#48563f', '#2f3a29', 4);
  TX.wallCorr = paper('#5a4632', '#634e38', '#4a3a28', 5);
  TX.wallSoviet = ctex(256, 256, (g, w, h) => { g.fillStyle = '#b9a47c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8a7350'; g.lineWidth = 3; for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) { g.beginPath(); g.arc(x + 16, y + 16, 9, 0, 7); g.stroke(); } });
  TX.wallVelvet = paper('#5a0f1a', '#6a1622', '#7e2a1a', 2);
  TX.wallHunter = ctex(256, 256, (g, w, h) => { g.fillStyle = '#3a2a1a'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 32) { g.fillStyle = x % 64 ? '#41301d' : '#33251a'; g.fillRect(x, 0, 30, h); } g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 150, w, 6); });
  TX.wallKids = ctex(256, 256, (g, w, h) => {
    g.fillStyle = '#a9c4d6'; g.fillRect(0, 0, w, h);
    for (let y = 30; y < h; y += 90) for (let x = 30; x < w; x += 90) { const ox = (y / 90 | 0) % 2 ? 45 : 0; g.fillStyle = '#eef3f6'; g.beginPath(); g.ellipse(x + ox, y + 14, 14, 16, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(x + ox - 6, y - 10, 4, 14, -0.2, 0, 7); g.ellipse(x + ox + 6, y - 10, 4, 14, 0.2, 0, 7); g.fill(); g.fillStyle = '#2a2a2a'; g.fillRect(x + ox - 6, y + 10, 3, 3); g.fillRect(x + ox + 3, y + 10, 3, 3); }
  });
  TX.wallFlood = paper('#4a5a52', '#536359', '#3d4c45', 9);
  TX.wallStair = ctex(256, 256, (g, w, h) => { g.fillStyle = '#5b675f'; g.fillRect(0, 0, w, h); g.fillStyle = '#3a4640'; g.fillRect(0, 150, w, 106); g.fillStyle = '#2a332e'; g.fillRect(0, 148, w, 4); for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(20,20,10,${rand(.08, .2)})`; g.fillRect(rand(0, w), rand(0, h), rand(10, 60), rand(4, 30)); } });
  TX.carpet = ctex(256, 256, (g, w, h) => {
    g.fillStyle = '#5b1b20'; g.fillRect(0, 0, w, h); g.strokeStyle = '#74272c'; g.lineWidth = 5;
    for (let i = -w; i < w * 2; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
    g.fillStyle = '#a07a34'; for (let y = 0; y <= h; y += 64) for (let x = 0; x <= w; x += 64) { g.beginPath(); g.arc(x + 32, y, 3, 0, 7); g.fill(); }
  });
  TX.runner = ctex(128, 256, (g, w, h) => { g.fillStyle = '#4a1416'; g.fillRect(0, 0, w, h); g.fillStyle = '#8a6a2a'; g.fillRect(8, 0, 6, h); g.fillRect(w - 14, 0, 6, h); g.fillStyle = '#5e1c1f'; for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 + 22, y + 16); g.lineTo(w / 2, y + 32); g.lineTo(w / 2 - 22, y + 16); g.fill(); } });
  TX.parquet = ctex(256, 256, (g, w, h) => { for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 64) { const o = (y / 32) % 2 ? 32 : 0; g.fillStyle = `hsl(28,${30 + Math.random() * 10}%,${22 + Math.random() * 6}%)`; g.fillRect(x + o - 64, y, 63, 31); g.fillRect(x + o, y, 63, 31); } });
  TX.tiles = ctex(128, 128, (g, w, h) => { g.fillStyle = '#9aa8a2'; g.fillRect(0, 0, w, h); g.strokeStyle = '#6a7872'; g.lineWidth = 2; for (let i = 0; i <= w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } });
  TX.rug = ctex(256, 384, (g, w, h) => {
    g.fillStyle = '#7a1e1e'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d8b46a'; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = '#1e2a4a'; g.beginPath(); g.moveTo(w / 2, 60); g.lineTo(w - 50, h / 2); g.lineTo(w / 2, h - 60); g.lineTo(50, h / 2); g.fill();
    g.fillStyle = '#d8b46a'; g.beginPath(); g.moveTo(w / 2, 120); g.lineTo(w - 100, h / 2); g.lineTo(w / 2, h - 120); g.lineTo(100, h / 2); g.fill();
    for (let i = 0; i < 40; i++) { g.fillStyle = pick(['#2a6a4a', '#e0c890', '#1e2a4a']); g.fillRect(rand(20, w - 30), rand(20, h - 30), 6, 6); }
  });
  TX.plaque = ctex(512, 320, (g, w, h) => {
    g.fillStyle = '#1d1612'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c99a45'; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, h - 28);
    g.textAlign = 'center'; g.fillStyle = '#e7c77d'; g.font = `700 34px ${FM}`; g.fillText('ОТЕЛЬ «УЮТ»', w / 2, 72);
    g.font = `900 92px ${FD}`; g.fillStyle = '#f0d9a0'; g.fillText('★ 1,2', w / 2, 182); g.font = `400 26px ${FM}`; g.fillStyle = '#c9b48a'; g.fillText('ЦЕЛЬ: 4,5 ЗА 5 НОЧЕЙ', w / 2, 252);
  });
  TX.keys = ctex(512, 256, (g, w, h) => {
    g.fillStyle = '#4a3020'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2a1a10'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
    const nums = ['201', '202', '203', '204', '301', '302', '303', '304'];
    nums.forEach((n, i) => {
      const x = 50 + (i % 4) * 100, y = 44 + Math.floor(i / 4) * 100;
      g.fillStyle = '#b8b0a0'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.fillStyle = '#c9a24a'; g.fillRect(x - 3, y + 6, 6, 26);
      g.fillStyle = '#e8dfc8'; g.fillRect(x - 22, y + 34, 44, 28); g.fillStyle = '#2a221c'; g.font = `700 18px ${FM}`; g.textAlign = 'center'; g.fillText(n, x, y + 54);
    });
    g.save(); g.translate(462, 70); g.rotate(0.25); g.fillStyle = '#7a1a1e'; g.fillRect(-15, 34, 30, 28); g.fillStyle = '#f1d9c0'; g.font = `700 18px ${FM}`; g.textAlign = 'center'; g.fillText('13', 0, 54); g.restore();
    g.fillStyle = '#d6a24a'; g.font = `700 16px ${FM}`; g.textAlign = 'center'; g.fillText('МАСТЕР', 462, 190);
  });
  TX.clock = ctex(256, 96, (g, w, h) => { g.fillStyle = '#070505'; g.fillRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 64px ${FM}`; g.shadowColor = '#ff2020'; g.shadowBlur = 16; g.fillStyle = '#ff4a3a'; g.fillText('23:58', w / 2, h / 2 + 3); });
  const portrait = faceless => ctex(256, 320, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#2e2b22'); bg.addColorStop(1, '#14120e'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = '#16181c'; g.beginPath(); g.ellipse(128, 330, 122, 112, 0, 0, 7); g.fill();
    g.fillStyle = '#b9967a'; g.fillRect(108, 186, 40, 40); g.beginPath(); g.ellipse(128, 138, 60, 76, 0, 0, 7); g.fill();
    g.fillStyle = '#2a201a'; g.beginPath(); g.ellipse(128, 90, 64, 36, 0, Math.PI, 0); g.fill();
    if (!faceless) {
      g.fillStyle = '#f2ead8'; g.beginPath(); g.ellipse(104, 136, 10, 6, 0, 0, 7); g.ellipse(152, 136, 10, 6, 0, 0, 7); g.fill();
      g.fillStyle = '#120e0c'; g.beginPath(); g.arc(108, 137, 4, 0, 7); g.arc(156, 137, 4, 0, 7); g.fill();
      g.fillStyle = '#2a201a'; g.beginPath(); g.ellipse(128, 180, 26, 8, 0, 0, 7); g.fill();
    }
  });
  TX.portraitA = portrait(false); TX.portraitB = portrait(true);
  TX.rules = ctex(400, 512, (g, w, h) => {
    g.fillStyle = '#ddd3bb'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a221c'; g.font = `900 32px ${FD}`; g.textAlign = 'center'; g.fillText('ПРАВИЛА', w / 2, 60);
    g.textAlign = 'left'; g.font = `400 19px ${FM}`; let y = 110;
    RULES.forEach((r, i) => { const words = (i + 1 + '. ' + r).split(' '); let line = ''; words.forEach(wd => { const t = line ? line + ' ' + wd : wd; if (g.measureText(t).width > w - 60) { g.fillText(line, 30, y); y += 26; line = wd; } else line = t; }); g.fillText(line, 30, y); y += 38; });
  });
  TX.graffiti = ctex(512, 256, (g, w, h) => { g.textAlign = 'center'; g.font = `700 92px ${FH}`; for (let k = 0; k < 3; k++) { g.fillStyle = `rgba(225,218,200,${0.22 + k * 0.08})`; g.fillText('НЕ ВЕРЬ', w / 2 + rand(-3, 3), 100); g.fillText('ВИКТОРУ', w / 2 + rand(-3, 3), 200); } });
  TX.elev = ctex(256, 128, (g, w, h) => { g.fillStyle = '#efe7d4'; g.fillRect(0, 0, w, h); g.fillStyle = '#9b1f24'; g.font = `700 50px ${FH}`; g.textAlign = 'center'; g.fillText('НЕ РАБОТАЕТ', w / 2, 80); });
  TX.service = ctex(512, 128, (g, w, h) => { g.fillStyle = '#1e2422'; g.fillRect(0, 0, w, h); g.strokeStyle = '#9aa39a'; g.lineWidth = 4; g.strokeRect(8, 8, w - 16, h - 16); g.fillStyle = '#d7dcd2'; g.font = `700 52px ${FM}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('СЛУЖЕБНОЕ', w / 2, h / 2 + 2); });
  TX.closet = ctex(512, 128, (g, w, h) => { g.fillStyle = '#1e2422'; g.fillRect(0, 0, w, h); g.fillStyle = '#d7dcd2'; g.font = `700 52px ${FM}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('КЛАДОВАЯ', w / 2, h / 2 + 2); });
  TX.barricade = ctex(512, 256, (g, w, h) => { g.fillStyle = '#efe7d4'; g.fillRect(0, 0, w, h); g.fillStyle = '#9b1f24'; g.textAlign = 'center'; g.font = `900 46px ${FD}`; g.fillText('ЗАКРЫТО', w / 2, 96); g.font = `700 44px ${FH}`; g.fillStyle = '#2a2a3a'; g.fillText('до второй ночи', w / 2, 160); g.font = `400 26px ${FM}`; g.fillText('— Управляющий', w / 2, 214); });
  const win = sil => ctex(128, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#d39b4c'); gr.addColorStop(1, '#8a4f22'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(80,30,20,.55)'; g.fillRect(0, 0, 22, h); g.fillRect(w - 22, 0, 22, h);
    if (sil) { g.fillStyle = '#140a06'; g.beginPath(); g.arc(64, 52, 15, 0, 7); g.fill(); g.beginPath(); g.ellipse(64, 128, 34, 56, 0, 0, 7); g.fill(); }
  });
  TX.winLit = win(false); TX.winSil = win(true);
  TX.night = ctex(256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0a1020'); gr.addColorStop(1, '#141a28'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8e4d0'; g.beginPath(); g.arc(180, 70, 20, 0, 7); g.fill(); g.fillStyle = '#0d1422'; g.beginPath(); g.arc(188, 64, 18, 0, 7); g.fill();
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(255,255,255,${rand(.2, .7)})`; g.fillRect(rand(0, w), rand(0, h * 0.6), 1.5, 1.5); }
    g.fillStyle = '#05080e'; for (let x = 0; x < w; x += 18) { const th = rand(40, 90); g.beginPath(); g.moveTo(x - 12, h); g.lineTo(x, h - th); g.lineTo(x + 12, h); g.fill(); }
    g.strokeStyle = '#2a2018'; g.lineWidth = 10; g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
  });
  TX.roadSign = ctex(512, 256, (g, w, h) => {
    g.fillStyle = '#d9d2c0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3a1a1a'; g.lineWidth = 10; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#3a1a1a'; g.textAlign = 'center'; g.font = `900 46px ${FD}`; g.fillText('ОТЕЛЬ «УЮТ»', w / 2, 82); g.font = `700 34px ${FM}`; g.fillText('500 м  →', w / 2, 136);
    g.font = `400 24px ${FM}`; g.fillText('СВОБОДНЫЕ НОМЕРА ЕСТЬ', w / 2, 188); g.font = `400 20px ${FM}`; g.fillStyle = '#7a3030'; g.fillText('(всегда)', w / 2, 220);
  });
  TX.doorRate = ctex(256, 128, (g, w, h) => { g.fillStyle = '#efe6d0'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a2a3a'; g.textAlign = 'center'; g.font = `700 34px ${FH}`; g.fillText('Наш рейтинг', w / 2, 46); g.font = `900 40px ${FD}`; g.fillStyle = '#9b1f24'; g.fillText('★ 1,2', w / 2, 100); });
  TX.dnd = ctex(128, 256, (g, w, h) => { g.fillStyle = '#9b1f24'; g.fillRect(0, 0, w, h); g.fillStyle = '#05080e'; g.beginPath(); g.arc(w / 2, 36, 18, 0, 7); g.fill(); g.fillStyle = '#efe6d0'; g.textAlign = 'center'; g.font = `700 22px ${FM}`; ['НЕ', 'БЕСПО-', 'КОИТЬ'].forEach((t, i) => g.fillText(t, w / 2, 110 + i * 34)); });
  TX.painting = ctex(256, 192, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3a4a5a'); gr.addColorStop(1, '#1a2018'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#0e140e'; g.beginPath(); g.moveTo(0, h); g.lineTo(80, 90); g.lineTo(150, 130); g.lineTo(256, 70); g.lineTo(256, h); g.fill(); g.fillStyle = '#d8b46a'; g.fillRect(120, 120, 10, 8); });
}
function numTex(text, sub) { return ctex(256, 128, (g, w, h) => { g.fillStyle = '#c9a24a'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a1d0e'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${sub ? 54 : 68}px ${FD}`; g.fillText(text, w / 2, sub ? 52 : h / 2 + 4); if (sub) { g.font = `400 22px ${FM}`; g.fillText(sub, w / 2, 100); } }); }
function bigNumTex(text) { return ctex(256, 256, (g, w, h) => { g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(230,226,210,.7)'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 170px ${FD}`; g.fillText(text, w / 2, h / 2 + 10); }); }
function tagTex(name) { return ctex(256, 96, (g, w, h) => { g.fillStyle = '#d6a24a'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a1d0e'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${name.length > 9 ? 34 : 44}px ${FM}`; g.fillText(name.toUpperCase(), w / 2, h / 2 + 2); }); }
function nameSprite(name) {
  const t = ctex(512, 96, (g, w, h) => { g.font = `700 44px ${FM}`; const tw = Math.min(w - 8, g.measureText(name).width + 40); g.fillStyle = 'rgba(9,8,11,.6)'; g.fillRect((w - tw) / 2, 10, tw, 70); g.fillStyle = '#ece2cc'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, w / 2, 47); });
  const s = new T.Sprite(new T.SpriteMaterial({ map: t, depthTest: true, transparent: true, fog: false })); s.scale.set(1.5, 0.28, 1); return s;
}
const RULES = ['Завтрак с 7:00 до 7:05.', 'Не открывайте дверь, если стучат дважды.', 'Если стучат трижды — тоже не открывайте.', 'Номера 13 в отеле нет.', 'Жалобы принимает администратор.', 'Администратор оставляет их себе.'];

/* ================= CHARACTERS ================= */
const OPT = {
  skin: [0xf2d0b5, 0xe0ac88, 0xc68a62, 0x8d5a3b, 0x5b3a29, 0x9fc7a8],
  hairColor: [0x1d1714, 0x5a3a22, 0xc79a52, 0xb8432f, 0xe8e2d4, 0x6b7fd1],
  uniform: [0x6e1f2a, 0xb8892a, 0x4a5a34, 0x232f4f, 0x5c3a6e],
  hairStyle: ['Короткие', 'Каре', 'Пучок', 'Ирокез', 'Без волос'],
  hat: ['Нет', 'Фуражка', 'Шапка', 'Котелок'],
  eyes: ['Обычные', 'Круглые', 'Сонные'],
};
function makeCharacter(o) {
  const g = new T.Group();
  const mesh = (geo, mat, x = 0, y = 0, z = 0, p = g) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); p.add(m); return m; };
  const skin = M(o.skin), uni = M(o.uniform), dark = M(o.legs || 0x1b1a20), shoe = M(0x0d0c0e), white = M(0xf1ece2), black = B(0x0a0a0c), gold = M(0xd6a24a), hairM = M(o.hairColor || 0);
  const neck = o.neck != null ? o.neck : 0.07, mw = o.mouth || 0.13;
  const limbs = {};
  for (const s of [-1, 1]) {
    const hip = new T.Group(); hip.position.set(s * 0.14, 0.6, 0); g.add(hip);
    mesh(cyl(0.1, 0.09, 0.58, 7), dark, 0, -0.28, 0, hip); mesh(new T.BoxGeometry(0.19, 0.1, 0.32), shoe, 0, -0.55, 0.05, hip);
    limbs[s < 0 ? 'lL' : 'lR'] = hip;
  }
  const body = new T.Group(); g.add(body); limbs.body = body;
  mesh(cyl(0.3, 0.38, 0.78, 7), uni, 0, 0.98, 0, body);
  if (o.vest !== false) {
    const v = mesh(new T.BoxGeometry(0.2, 0.56, 0.06), white, 0, 1.02, 0.31, body); v.rotation.x = -0.1;
    [0.86, 0.98, 1.1].forEach(y => mesh(sph(0.022, 6, 4), gold, 0, y, 0.35, body));
    mesh(new T.BoxGeometry(0.17, 0.07, 0.05), M(0x8a1c25), 0, 1.3, 0.3, body);
  }
  for (const s of [-1, 1]) {
    const sh = new T.Group(); sh.position.set(s * 0.38, 1.3, 0); sh.rotation.z = s * 0.16; body.add(sh);
    mesh(cyl(0.075, 0.065, 0.62, 6), uni, 0, -0.3, 0, sh); mesh(sph(0.085, 8, 6), skin, 0, -0.64, 0.02, sh);
    limbs[s < 0 ? 'aL' : 'aR'] = sh;
  }
  if (o.briefcase) { const bc = new T.Group(); bc.position.set(0, -0.72, 0.02); limbs.aR.add(bc); mesh(new T.BoxGeometry(0.1, 0.32, 0.42), M(0x3a2414), 0, -0.12, 0, bc); }
  mesh(cyl(0.09, 0.1, neck + 0.12, 6), skin, 0, 1.37 + neck / 2, 0, body);
  const hy = 1.42 + neck + 0.28;
  const headG = new T.Group(); headG.position.y = hy; body.add(headG); limbs.head = headG;
  const head = mesh(new T.IcosahedronGeometry(0.33, 1), skin, 0, 0, 0, headG); head.scale.set(1, 1.06, 0.96);
  for (const s of [-1, 1]) { const e = mesh(sph(o.bigEars ? 0.16 : 0.07, 6, 5), skin, s * (o.bigEars ? 0.4 : 0.33), o.bigEars ? 0.12 : 0, 0, headG); if (o.bigEars) e.scale.set(0.4, 1.6, 1); }
  const er = o.eyes === 'Круглые' ? 0.11 : 0.085;
  for (const s of [-1, 1]) {
    const sz = s < 0 ? 1.12 : 0.94, r = er * sz;
    mesh(sph(r, 10, 8), o.eyeWhite ? B(o.eyeWhite) : white, s * 0.125, 0.05, 0.26, headG);
    if (!o.noPupils) mesh(sph(r * 0.42, 8, 6), black, s * 0.125 + (o.eyes === 'Круглые' ? 0 : s * 0.012), 0.04, 0.26 + r * 0.82, headG);
    if (o.eyes === 'Сонные') { const lid = mesh(new T.SphereGeometry(r * 1.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), skin, s * 0.125, 0.05, 0.26, headG); lid.rotation.x = 0.45; }
  }
  if (!o.noNose) { const nose = mesh(new T.ConeGeometry(0.055, 0.16, 5), skin, 0, -0.03, 0.34, headG); nose.rotation.x = Math.PI / 2; }
  const mouth = mesh(new T.BoxGeometry(mw, 0.028, 0.02), black, 0, -0.16, 0.29, headG); mouth.rotation.z = 0.07;
  const cap = () => { const c = mesh(new T.SphereGeometry(0.35, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), hairM, 0, 0.03, -0.02, headG); c.rotation.x = -0.18; c.scale.set(1, 1.05, 1.02); };
  switch (o.hairStyle) {
    case 'Короткие': cap(); break;
    case 'Каре': cap(); for (const s of [-1, 1]) mesh(new T.BoxGeometry(0.1, 0.4, 0.5), hairM, s * 0.33, -0.07, -0.03, headG); mesh(new T.BoxGeometry(0.62, 0.42, 0.12), hairM, 0, -0.06, -0.28, headG); break;
    case 'Пучок': cap(); mesh(sph(0.16, 8, 6), hairM, 0, 0.38, -0.12, headG); break;
    case 'Ирокез': for (let i = 0; i < 5; i++) { const c = mesh(new T.ConeGeometry(0.065, 0.28, 5), hairM, 0, 0.36 - Math.abs(i - 1.5) * 0.02, 0.2 - i * 0.11, headG); c.rotation.x = -0.35 - i * 0.12; } break;
    default: break;
  }
  if (o.hat === 'Фуражка') {
    const hg = new T.Group(); hg.position.set(0, 0.3, 0); hg.rotation.z = 0.18; headG.add(hg);
    mesh(cyl(0.25, 0.27, 0.2, 12), M(o.uniform), 0, 0, 0, hg); mesh(cyl(0.277, 0.277, 0.05, 12), gold, 0, -0.06, 0, hg); mesh(new T.BoxGeometry(0.24, 0.02, 0.14), M(0x111111), 0, -0.09, 0.26, hg);
  } else if (o.hat === 'Шапка') {
    const hm = M(o.hatColor || 0xc9962c); const c = mesh(new T.SphereGeometry(0.36, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), hm, 0, 0.02, 0, headG); c.scale.y = 1.12;
    mesh(cyl(0.37, 0.37, 0.1, 12), hm, 0, 0.04, 0, headG); mesh(sph(0.1, 8, 6), M(0xe8e2d4), 0, 0.44, 0, headG);
  } else if (o.hat === 'Котелок') {
    const hm = M(0x18161a); mesh(new T.SphereGeometry(0.29, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), hm, 0, 0.2, 0, headG);
    mesh(cyl(0.44, 0.44, 0.03, 14), hm, 0, 0.2, 0, headG); mesh(cyl(0.295, 0.295, 0.05, 14), M(0x5a1a20), 0, 0.23, 0, headG);
  }
  if (o.name) { const t = mesh(new T.PlaneGeometry(0.2, 0.075), M(0xffffff, { map: tagTex(o.name) }), 0.16, 1.17, 0.322, body); t.rotation.y = 0.22; }
  g.scale.setScalar(o.scale || 1);
  g.userData.limbs = limbs; g.userData.walk = 0;
  return g;
}
function animateChar(g, dt, speed) {
  const L = g.userData.limbs; if (!L) return;
  if (g.userData.sitting) return;
  g.userData.walk += dt * speed * 3.2;
  const a = Math.sin(g.userData.walk) * Math.min(1, speed / 2) * 0.55;
  L.lL.rotation.x = a; L.lR.rotation.x = -a; L.aL.rotation.x = -a * 0.8; L.aR.rotation.x = a * 0.8;
  L.body.position.y = Math.abs(Math.cos(g.userData.walk)) * 0.03 * Math.min(1, speed);
}
function sitChar(g) {
  const L = g.userData.limbs; g.userData.sitting = true;
  L.lL.rotation.x = L.lR.rotation.x = -Math.PI / 2; L.body.position.y = -0.12; L.lL.position.y = L.lR.position.y = 0.48;
  L.aL.rotation.x = L.aR.rotation.x = -0.5;
}
/* 2D portrait for the guest card */
function drawFace(cv, o) {
  const g = cv.getContext('2d'), w = cv.width, h = cv.height; const hex = c => '#' + (c >>> 0).toString(16).padStart(6, '0');
  g.fillStyle = '#d8ccb0'; g.fillRect(0, 0, w, h);
  g.fillStyle = hex(o.uniform); g.beginPath(); g.ellipse(w / 2, h + 20, w * 0.48, h * 0.42, 0, 0, 7); g.fill();
  g.fillStyle = hex(o.skin); g.fillRect(w / 2 - 12, h * 0.55, 24, h * 0.2);
  g.beginPath(); g.ellipse(w / 2, h * 0.42, w * 0.27, h * 0.27, 0, 0, 7); g.fill();
  const er = o.eyes === 'Круглые' ? 13 : 10;
  for (const s of [-1, 1]) { const r = er * (s < 0 ? 1.12 : 0.94); g.fillStyle = '#f4efe4'; g.beginPath(); g.arc(w / 2 + s * 18, h * 0.4, r, 0, 7); g.fill(); if (!o.noPupils) { g.fillStyle = '#111'; g.beginPath(); g.arc(w / 2 + s * 18, h * 0.4 + 1, r * 0.42, 0, 7); g.fill(); } if (o.eyes === 'Сонные') { g.fillStyle = hex(o.skin); g.fillRect(w / 2 + s * 18 - r - 1, h * 0.4 - r - 1, r * 2 + 2, r + 1); } }
  g.fillStyle = '#111'; g.fillRect(w / 2 - (o.mouth || 0.13) * 80, h * 0.53, (o.mouth || 0.13) * 160, 3);
  if (o.hairStyle && o.hairStyle !== 'Без волос') { g.fillStyle = hex(o.hairColor || 0); g.beginPath(); g.ellipse(w / 2, h * 0.28, w * 0.28, h * 0.13, 0, Math.PI, 0); g.fill(); }
  if (o.hat === 'Котелок') { g.fillStyle = '#18161a'; g.fillRect(w / 2 - 50, h * 0.2, 100, 6); g.beginPath(); g.ellipse(w / 2, h * 0.2, 32, 26, 0, Math.PI, 0); g.fill(); }
  if (o.hat === 'Шапка') { g.fillStyle = hex(o.hatColor || 0xc9962c); g.beginPath(); g.ellipse(w / 2, h * 0.26, w * 0.29, h * 0.17, 0, Math.PI, 0); g.fill(); }
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 6; g.strokeRect(0, 0, w, h);
}
