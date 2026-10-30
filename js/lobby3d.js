/* ===== baked lobby (Blender → GLB + lightmap). Falls back to the old procedural lobby if anything fails. ===== */
'use strict';
const LOBBY3D = { ready: false, root: null, LM: 1 / 0.42, mats: [], emis: [], basics: [], dial: null };
LOBBY3D.promise = new Promise(res => {
  if (!T.GLTFLoader || /[?&]oldlobby/.test(location.search)) { res(false); return; }
  const done = ok => res(ok);
  try {
    const lm = new T.TextureLoader().load('assets/lightmap.png?v=20261030', () => {
      new T.GLTFLoader().load('assets/lobby.glb?v=20261030', g => { try { LOBBY3D.root = g.scene; LOBBY3D.lm = lm; prep(g.scene); LOBBY3D.ready = true; done(true); } catch (e) { console.warn('lobby3d prep', e); done(false); } }, undefined, e => { console.warn('lobby3d glb', e); done(false); });
    }, undefined, () => done(false));
    lm.flipY = false; lm.encoding = T.sRGBEncoding; lm.anisotropy = 4; LOBBY3D.lm = lm;
  } catch (e) { console.warn(e); done(false); }
});
// the game renders in linear output; bake colours are authored in sRGB, so encode at the end of the shader
function srgbOut(m) { const prev = m.onBeforeCompile; m.onBeforeCompile = sh => { if (prev) prev(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <encodings_fragment>', '{ vec3 x_ = gl_FragColor.rgb * 1.5; x_ = clamp((x_ * (2.51 * x_ + .03)) / (x_ * (2.43 * x_ + .59) + .14), 0., 1.); gl_FragColor.rgb = pow(x_, vec3(1. / 2.2)); }'); }; m.customProgramCacheKey = () => 'srgbout2'; return m; }
function prep(root) {
  const dialC = document.createElement('canvas'); dialC.width = 128; dialC.height = 64; const dialT = new T.CanvasTexture(dialC); dialT.flipY = false;
  LOBBY3D.dial = { c: dialC, t: dialT };
  root.traverse(o => {
    if (!o.isMesh) return;
    const base = o.name.replace(/\.?00\d$/, ''), m = o.material, mn = m.name || '';
    o.frustumCulled = false;
    if (mn === 'mirror') { m.color.setHex(0x232b2d); m.roughness = 0.15; m.metalness = 0; }
    if (mn === 'elevdial') { const bm = srgbOut(new T.MeshBasicMaterial({ map: dialT })); o.material = bm; return; }
    if (mn.indexOf('night') === 0) { m.transparent = true; m.opacity = 0.0; m.depthWrite = false; o.visible = false; return; } // game draws its own street
    if (['elevDoorA', 'elevDoorB', 'elevSign'].includes(base)) { if (!m.userData.bas) { const bm = srgbOut(new T.MeshBasicMaterial({ map: m.map || null, color: m.color.clone().multiplyScalar(base === 'elevSign' ? 0.5 : 0.62) })); m.userData.bas = bm; LOBBY3D.basics.push({ m: bm, c: bm.color.clone() }); } o.material = m.userData.bas; return; }
    // cheap per-vertex lighting (the baked lightmap does the real work): far lighter than MeshStandardMaterial on phones
    if (!m.userData.lam) { const lm = new T.MeshLambertMaterial({ name: m.name, color: m.color.clone(), map: m.map || null, emissive: m.emissive ? m.emissive.clone() : new T.Color(0), emissiveMap: m.emissiveMap || null, side: m.side, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest }); if (m.map) m.map.anisotropy = 2; m.userData.lam = lm; }
    o.material = m.userData.lam; const m0 = m; const m1 = o.material;
    return finish(o, m1, mn);
  });
  drawDial('--', true);
}
function finish(o, m, mn) {
  if (m.userData.reg) return; m.userData.reg = 1;
  {
    const em = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.01;
    m.lightMap = LOBBY3D.lm; m.lightMapIntensity = LOBBY3D.LM;
    if (['elevator_sign', 'service_sign', 'rules', 'plaque', 'keys', 'clock'].includes(mn) && m.color) m.color.multiplyScalar(mn === 'elevator_sign' ? 0.32 : 0.6);
    
    if (em) { m.emissiveIntensity = mn === 'bulb' ? 3.5 : mn === 'shade' ? 1.3 : mn === 'exit' ? 0.12 : mn === 'screen' ? 1.5 : mn === 'clock' ? 2 : mn === 'neon' ? 4 : 1; m.userData.e = m.emissiveIntensity; LOBBY3D.emis.push({ m, e: null, base: m.emissiveIntensity, keep: mn === 'exit' || mn === 'neon' }); }
    srgbOut(m); LOBBY3D.mats.push(m);
  }
}
function drawDial(txt, glitch) {
  const d = LOBBY3D.dial; if (!d) return; const g = d.c.getContext('2d'); g.fillStyle = '#0a0606'; g.fillRect(0, 0, 128, 64);
  g.font = 'bold 46px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#ff3a2a'; g.shadowBlur = 10; g.fillStyle = glitch ? '#ff7a5a' : '#ff3a2a'; g.fillText(txt, 64, 34); g.shadowBlur = 0;
  if (glitch) for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(0, Math.random() * 64, 128, 2); }
  d.t.needsUpdate = true;
}
let _dialT = 0;
// called every frame from updateLights(pw = 0..1 power state)
LOBBY3D.update = function (pw, dt) {
  if (!LOBBY3D.ready) return;
  for (const m of LOBBY3D.mats) m.lightMapIntensity = LOBBY3D.LM * pw;
  for (const e of LOBBY3D.emis) { if (e.e) { e.m.emissive.copy(e.e).multiplyScalar(pw); } else if (!e.keep) e.m.emissiveIntensity = e.base * pw; }
  for (const b of LOBBY3D.basics) b.m.color.copy(b.c).multiplyScalar(0.1 + 0.9 * pw);
  _dialT -= dt || 0.016;
  if (_dialT <= 0) { _dialT = 0.25 + Math.random() * 0.9; if (pw > 0.5) { const r = Math.random(); drawDial(r < 0.12 ? '13' : r < 0.2 ? '--' : r < 0.3 ? '*' : String(1 + Math.floor(Math.random() * 12)), true); } else drawDial('', false); }
};

/* ---- wiring into the game world (called from buildLobby after the old lobby has been built) ---- */
function applyLobby3D(n0) {
  const root = LOBBY3D.root;
  // 1) hide the old visuals; they stay in the scene as invisible ray/collision proxies (raycasting ignores .visible)
  world.children.slice(n0).forEach(c => { if (c.isMesh || c.isGroup) c.visible = false; });
  W.lm3d = true;
  const inst = root.clone(true); // fresh copy per world build
  // clone() shares materials – keep them shared on purpose (one set of lightmapped materials)
  inst.position.y = 0.012; world.add(inst); LOBBY3D.inst = inst;
  const node = {}; inst.traverse(o => { if (o.isMesh) node[o.name.replace(/\.?00\d$/, '')] = o; });
  const box = (o) => new T.Box3().setFromObject(o);
  const ctr = (o) => box(o).getCenter(new T.Vector3());
  const P3 = (x, y, z) => new T.Vector3(x, y, z);
  // 2) proxies follow the new furniture positions
  const moveTo = (m, x, y, z) => m && m.position.set(x, y, z);
  const bellC = node.bell ? ctr(node.bell) : P3(0.6, 1.2, -1.75);
  const bg = W.bellDome && W.bellDome.parent; if (bg) bg.position.set(bellC.x, bellC.y - 0.06, bellC.z);
  W.bellPos = bellC.clone();
  const ph = node.phoneHandset ? ctr(node.phoneHandset) : P3(0.55, 1.28, -1.95);
  const pg = W.handset && W.handset.parent; if (pg) pg.position.set(ph.x, ph.y - 0.17, ph.z);
  W.phonePos = ph.clone();
  const nc = node.papers ? ctr(node.papers) : P3(-0.5, 0.83, -2.2); moveTo(W.px.note, nc.x, nc.y + 0.05, nc.z); W.px.note.rotation.set(-Math.PI / 2, 0, 0, 'YXZ'); W.px.note.scale.set(1.3, 1.3, 1.3);
  const lc = node.ledger ? ctr(node.ledger) : P3(0.1, 1.17, -2.07); moveTo(W.px.book, lc.x, lc.y, lc.z);
  moveTo(W.px.mon, 1.3, 1.31, -2.0); W.px.mon.scale.set(1.1, 1, 1);
  moveTo(W.px.kb, 0, 1.75, -3.88); W.px.kb.scale.set(1.05, 1.3, 1);
  moveTo(W.px.plaque, -0.62, 1.35, -1.7); W.px.plaque.scale.set(0.45, 0.35, 1); W.px.plaque.rotation.y = Math.PI;
  moveTo(W.px.rules, 1.65, 1.85, -3.87); W.px.rules.scale.set(0.62, 0.62, 1);
  moveTo(W.px.portrait, -2.9, 1.9, -3.87); W.px.portrait.scale.set(1, 1, 1); W.px.portrait.rotation.set(0, 0, 0);
  const mkNodes = ['mkRing', 'mkShaft', 'mkBitA', 'mkBitB', 'mkCard', 'mkCardLegL'].map(n => node[n]).filter(Boolean);
  const mkC = node.mkRing ? ctr(node.mkRing) : P3(0.8, 0.85, -2.18);
  if (W.masterKey) { W.masterKey.position.set(mkC.x, mkC.y, mkC.z); W.masterKey.scale.set(2.2, 1.5, 6); }
  W.setMK = v => mkNodes.forEach(n => n.visible = v);
  const bell = node.bell, btn = node.bellBtn;
  if (bell) W.bellDome = { position: { get y() { return 0.015; }, set y(v) { bell.position.y = v - 0.015; if (btn) btn.position.y = v - 0.015; } } };
  const hs = node.phoneHandset;
  if (hs) W.handset = { position: { get y() { return 0.11; }, set y(v) { hs.position.y = v - 0.11; } }, rotation: { set z(v) {} } };
  const dA = node.elevDoorA, dB = node.elevDoorB;
  if (dA && dB) {
    const cA = ctr(dA), cB = ctr(dB), dirA = cA.z < cB.z ? -1 : 1;
    W.elevPos = cA.clone().add(cB).multiplyScalar(0.5); W.elevPos.x += 0.3; W.elevPos.y = 1.4;
    W.elevDoors = [{ position: { set z(v) { dA.position.z = dirA * (2.87 - v); } } }, { position: { set z(v) { dB.position.z = -dirA * (v - 3.73); } } }];
    W.px.elev.forEach((m, i) => m.position.set(W.elevPos.x - 0.2, 1.15, W.elevPos.z + (i ? 0.43 : -0.43)));
  }
  let pm = null; inst.traverse(o => { if (o.isMesh && o.material.name === 'portrait') pm = o.material; });
  if (pm) {
    const mapA = pm.map; let mapB = null;
    W.portraitMat = { get map() { return pm.map === mapA ? TX.portraitA : TX.portraitB; }, set map(v) { if (v === TX.portraitB) { if (!mapB) { mapB = new T.CanvasTexture(TX.portraitB.image); mapB.flipY = false; mapB.encoding = T.sRGBEncoding; } pm.map = mapB; } else pm.map = mapA; } };
  }
  // furniture colliders: columns, luggage cart, floor lamp
  solid(-2.85, 1.35, -2.35, 1.85, 0, 3.2); solid(2.15, 1.35, 2.65, 1.85, 0, 3.2);
  solid(-8.05, 4.35, -7.15, 5.25, 0, 1.0); solid(-7.4, 0.9, -7.0, 1.3, 0, 1.6);
  // sit on the sofa (E): it stands against the north-west area facing the lobby
  const seat = (cx, cy, cz, sx, sy, sz, label, x, z, face) => {
    const m = new T.Mesh(new T.BoxGeometry(sx, sy, sz), new T.MeshBasicMaterial()); m.position.set(cx, cy, cz); m.visible = false; world.add(m);
    inter(m, () => SIT ? null : label, () => sitDown(x, z, face, 1.18), 2.4);
  };
  seat(-5.6, 0.55, 1.3, 2.3, 0.9, 1.1, 'Сесть на диван', -5.6, 1.35, Math.PI);
  // 7) papers to read: guest ledger and the magazines
  if (node.ledger) inter(W.px.book, () => 'Книга гостей', () => toast('Последняя запись: «Спасибо за всё. Не уезжаю». Дата — через неделю от сегодняшней.', 5));
  const mg = (n, label, text) => { if (!node[n]) return; const c = ctr(node[n]); const m = new T.Mesh(new T.BoxGeometry(0.36, 0.1, 0.42), new T.MeshBasicMaterial()); m.position.copy(c); m.visible = false; world.add(m); inter(m, () => label, () => toast(text, 4.5), 2.4); };
  mg('magazine', 'Журнал', '«Отдых без хлопот». Кроссворд заполнен ручкой. Все ответы — одно слово.');
  mg('magazine2', 'Журнал', 'Журнал «Тихий отель». Страница с отзывами вырвана.');
}
