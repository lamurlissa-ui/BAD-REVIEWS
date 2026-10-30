/* BAD REVIEWS — world: hotel exterior, lobby, stairwell, floors 2–3, rooms */
'use strict';
let world, cam, hemi, moon;
const colliders = [], surfaces = [], rayTargets = [];
const doors = {}, containers = {}, rooms = [], wp = {};
const W = {}; // misc references used by the game
const VLIST = []; // virtual point lights; a small pool of real lights follows the nearest ones
function VPoint(color, intensity, distance, decay) { const v = { color: new T.Color(color), intensity, distance, decay, position: new T.Vector3() }; VLIST.push(v); return v; }

function solid(x0, z0, x1, z1, y0 = -50, y1 = 500) { const c = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1, on: true }; colliders.push(c); return c; }
function surf(x0, z0, x1, z1, y) { surfaces.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y }); }
function ramp(x0, x1, za, ya, zb, yb) { surfaces.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(za, zb), z1: Math.max(za, zb), ramp: true, za, ya, zb, yb }); }
function groundAt(x, z, feet) {
  let best = -1e9;
  for (const s of surfaces) {
    if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
    const y = s.ramp ? s.ya + (z - s.za) / (s.zb - s.za) * (s.yb - s.ya) : s.y;
    if (y <= feet + 0.55 && y > best) best = y;
  }
  return best === -1e9 ? 0 : best;
}
function resolveCollisions(p, r, feet) {
  const lo = feet + 0.3, hi = feet + 1.7;
  for (const c of colliders) {
    if (!c.on || c.y1 < lo || c.y0 > hi) continue;
    const nx = clamp(p.x, c.x0, c.x1), nz = clamp(p.z, c.z0, c.z1);
    const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-9) { const d = Math.sqrt(d2); p.x = nx + dx / d * r; p.z = nz + dz / d * r; }
      else { const pl = p.x - c.x0, pr = c.x1 - p.x, pb = p.z - c.z0, pf = c.z1 - p.z, m = Math.min(pl, pr, pb, pf); if (m === pl) p.x = c.x0 - r; else if (m === pr) p.x = c.x1 + r; else if (m === pb) p.z = c.z0 - r; else p.z = c.z1 + r; }
    }
  }
  p.x = clamp(p.x, -26, 26); p.z = clamp(p.z, -20, 40);
}
let curParent = null;
function box(w, h, d, mat, x, y, z, parent) { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); (parent || curParent || world).add(m); return m; }
function plane(w, h, mat, x, y, z, ry = 0, rx = 0, parent) { const m = new T.Mesh(new T.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ'); (parent || curParent || world).add(m); return m; }
function wallBox(x0, z0, x1, z1, y0, y1, mat, noCol) {
  const m = box(Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  rayTargets.push(m); if (!noCol) solid(x0, z0, x1, z1, y0, y1); return m;
}
function inter(meshes, label, action, range = 2.5) { [].concat(meshes).forEach(m => { m.userData.inter = { label, action, range }; if (!rayTargets.includes(m)) rayTargets.push(m); }); }
// a box's six faces: [+x, -x, +y, -y, +z, -z]
const faces = (px, nx, pz, nz, other) => [px, nx, other, other, pz, nz];

/* doors: pivot at the hinge, the leaf extends along the pivot's local +x */
function makeDoor(id, o) {
  const pivot = new T.Group(); pivot.position.set(o.x, o.y, o.z); pivot.rotation.y = o.rot || 0; (o.parent || curParent || world).add(pivot);
  const w = o.w || 1.0, hgt = o.h || 2.3;
  const mesh = box(w, hgt, 0.07, M(o.color || 0x3d1d18), w / 2, hgt / 2, 0, pivot);
  box(0.05, 0.05, 0.18, M(0xc9a24a), w - 0.12, 1.05, 0, pivot);
  const d = { id, pivot, mesh, w, base: o.rot || 0, dir: o.dir || 1, open: false, locked: !!o.locked, kind: o.kind, room: o.room || null, t: 0, cur: 0, col: o.col ? solid(o.col[0], o.col[1], o.col[2], o.col[3], o.y, o.y + hgt) : null, pos: o.soundPos || new T.Vector3(o.x, o.y + 1.2, o.z) };
  doors[id] = d; mesh.userData.door = d;
  inter(mesh, () => doorLabel(d), () => doorInteract(d), 2.4);
  return d;
}
function setDoorOpen(d, open, instant) {
  d.open = open; if (d.col) d.col.on = !open;
  d.target = open ? d.dir * 1.45 : 0; if (instant) { d.cur = d.target; d.pivot.rotation.y = d.base + d.cur; }
}
function updateDoors(dt) { for (const id in doors) { const d = doors[id]; if (d.target == null) continue; if (Math.abs(d.cur - d.target) > 0.001) { d.cur += clamp(d.target - d.cur, -dt * 3.2, dt * 3.2); d.pivot.rotation.y = d.base + d.cur; } } }

function makeContainer(id, meshes, kind, room, label, animFn) {
  const c = { id, kind, room, opened: false, loot: null, anim: animFn || null, label };
  containers[id] = c;
  inter(meshes, () => c.opened ? null : label, () => searchContainer(c), 2.2);
  return c;
}

/* ================= BUILD ================= */
function buildWorld(seed) {
  seedRng(seed);
  world = new T.Scene();
  world.background = new T.Color(0x0b0e17);
  world.fog = new T.FogExp2(0x0b0e17, 0.02);
  cam = new T.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 600); cam.rotation.order = 'YXZ'; world.add(cam);
  hemi = new T.HemisphereLight(0x4a5c84, 0x0d0b0a, 0.55); world.add(hemi);
  moon = new T.DirectionalLight(0x9fb2e0, 0.3); moon.position.set(-30, 60, 20); world.add(moon);
  buildExterior();
  buildLobby();
  buildStairwell();
  for (const L of [1, 2]) buildFloor(L);
  buildWaypoints();
}

function buildExterior() {
  plane(700, 700, M(0x151b16), 0, 0, 0, 0, -Math.PI / 2); surf(-400, -400, 400, 400, 0);
  plane(7, 240, M(0x1e1f24), 0, 0.015, 150, 0, -Math.PI / 2);
  const dash = M(0xb59a52); for (let z = 40; z < 270; z += 7) plane(0.18, 3, dash, 0, 0.02, z, 0, -Math.PI / 2);
  plane(38, 30, M(0x26262c), 0, 0.012, 21, 0, -Math.PI / 2);
  const lineM = M(0x8c8a84); for (let x = -16; x <= 16; x += 3.2) { if (Math.abs(x) < 2.5) continue; plane(0.12, 4.5, lineM, x, 0.022, 11, 0, -Math.PI / 2); }
  box(5, 0.12, 2.4, M(0x3a3634), 0, 0.06, 7.3);
  // trees
  const pts = [];
  for (let i = 0; i < 150; i++) { const s = Math.random() < .5 ? -1 : 1; pts.push([s * rand(7.5, 34), rand(42, 280)]); }
  while (pts.length < 300) { const x = rand(-90, 90), z = rand(-80, 60); if (x > -28 && x < 28 && z > -22 && z < 40) continue; if (z > 30 && Math.abs(x) < 8) continue; pts.push([x, z]); }
  const crown = new T.InstancedMesh(new T.ConeGeometry(1.7, 5.5, 6), M(0x101a14), pts.length), trunk = new T.InstancedMesh(cyl(0.18, 0.25, 1.6, 5), M(0x231a14), pts.length);
  const d = new T.Object3D();
  pts.forEach(([x, z], i) => { const s = rand(0.8, 1.6); d.position.set(x, 0.8 * s, z); d.rotation.set(0, rand(0, 6), 0); d.scale.setScalar(s); d.updateMatrix(); trunk.setMatrixAt(i, d.matrix); d.position.set(x, 4.2 * s, z); d.updateMatrix(); crown.setMatrixAt(i, d.matrix); });
  world.add(crown, trunk);
  // lamp posts (one real light)
  W.lamps = [];
  const post = (x, z, light, flick) => {
    box(0.16, 5, 0.16, M(0x2a2c30), x, 2.5, z); box(1.2, 0.08, 0.08, M(0x2a2c30), x + 0.55, 5, z);
    const head = box(0.5, 0.14, 0.3, B(0xffb066), x + 1.05, 4.92, z); solid(x - 0.15, z - 0.15, x + 0.15, z + 0.15);
    let L = null; if (light) { L = VPoint(0xff9b45, 1.3, 18, 1.4); L.position.set(x + 1.05, 4.6, z); }
    W.lamps.push({ L, head, flick, base: 1.3, t: 0 });
  };
  post(-13, 27, true, false); post(8.5, 14, false, true);
  // hotel shell: 13 floors
  const HT = 13 * H, plaster = M(0x6b5848), trim = M(0x2c211b);
  wallBox(-12, 5.85, -0.8, 6.15, 0, HT, plaster); wallBox(0.8, 5.85, 12, 6.15, 0, HT, plaster); wallBox(-0.8, 5.85, 0.8, 6.15, 2.4, HT, plaster);
  wallBox(-12.15, -12, -11.85, 6, 0, HT, plaster); wallBox(11.85, -12, 12.15, 6, 0, HT, plaster); wallBox(-12, -12.15, 12, -11.85, 0, HT, plaster);
  box(25.2, 0.6, 19, M(0x2a2420), 0, HT + 0.3, -3);
  W.extG = new T.Group(); world.add(W.extG); curParent = W.extG;
  for (let L = 1; L < 13; L++) box(24.4, 0.18, 0.12, trim, 0, L * H, 6.2);
  box(24.4, 0.5, 0.12, M(0x3a302a), 0, 0.25, 6.2);
  // windows
  const winM = { lit: B(0xffffff, { map: TX.winLit }), sil: B(0xffffff, { map: TX.winSil }), dark: M(0x0d1220, { shininess: 60, specular: 0x445577 }), red: B(0x4a0a0c) };
  W.winM = winM;
  const win = (x, y, st) => { box(1.5, 1.4, 0.1, trim, x, y, 6.12); return plane(1.25, 1.1, winM[st], x, y, 6.19); };
  { const B3 = typeof LOBBY3D !== 'undefined' && LOBBY3D.ready; for (const x of (B3 ? [-10.2, -5.3, 4.5, 10.2] : [-10.2, -4.6, 4.6, 10.2])) win(x, 1.7, x === 10.2 ? 'lit' : 'dark'); }
  const xs = [-10.2, -7.4, -4.6, -1.8, 1.8, 4.6, 7.4, 10.2];
  for (let L = 1; L < 13; L++) for (const x of xs) {
    if (L === 1 && x === 4.6) { W.silWin = win(x, L * H + 1.7, 'sil'); continue; }
    if (L === 12) { win(x, L * H + 1.7, x === -1.8 ? 'red' : 'dark'); continue; }
    win(x, L * H + 1.7, R() < 0.18 ? 'lit' : 'dark');
  }
  curParent = null;
  // porch + entrance
  box(3.4, 0.15, 1.9, trim, 0, 2.9, 7.0); for (const s of [-1, 1]) box(0.12, 2.85, 0.12, trim, s * 1.55, 1.43, 7.85);
  W.porchBulb = box(0.24, 0.3, 0.24, B(0xffd59a), 1.15, 2.45, 6.3);
  W.porchL = VPoint(0xffcf8f, 0.9, 8, 1.5); W.porchL.position.set(1.15, 2.3, 6.9); 
  plane(0.8, 0.4, M(0xffffff, { map: TX.doorRate }), 1.75, 1.55, 6.17);
  if (typeof LOBBY3D !== 'undefined' && LOBBY3D.ready) makeDoor('front', { x: -1.0, y: 0, z: 6.0, w: 2.0, h: 2.4, kind: 'front', col: [-1.0, 5.88, 1.0, 6.12], dir: 1, color: 0x3d1d18 }); else makeDoor('front', { x: -0.8, y: 0, z: 6.0, w: 1.6, h: 2.4, kind: 'front', col: [-0.8, 5.88, 0.8, 6.12], dir: 1, color: 0x3d1d18 });
  // neon: roof + canopy
  W.neonMat = B(0xffffff, { map: TX.neonBroken, transparent: true, depthWrite: false, fog: false });
  box(12.3, 2.5, 0.2, M(0x141114), 0, HT + 1.9, 5.6); plane(12, 2.35, W.neonMat, 0, HT + 1.9, 5.71);
  plane(3.1, 0.6, W.neonMat, 0, 3.2, 7.96);
  W.signL = VPoint(0xff2a45, 1.4, 14, 1.6); W.signL.position.set(0, 3.6, 9); 
  // road sign
  box(0.12, 2.6, 0.12, M(0x2a2c30), 4.6, 1.3, 70); box(0.12, 2.6, 0.12, M(0x2a2c30), 6.6, 1.3, 70.5);
  plane(2.8, 1.4, M(0xffffff, { map: TX.roadSign }), 5.6, 2.5, 70.3, -0.22);
  // car
  const car = new T.Group(); world.add(car); W.car = car;
  W.carBody = box(1.9, 0.65, 4.3, M(0x2f4c50), 0, 0.62, 0, car); W.carCab = box(1.7, 0.6, 2.1, M(0x24393c), 0, 1.24, -0.3, car);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const wh = new T.Mesh(cyl(0.36, 0.36, 0.25, 10), M(0x0d0d0f)); wh.rotation.z = Math.PI / 2; wh.position.set(sx * 0.95, 0.36, sz * 1.35); car.add(wh); }
  W.headlights = [];
  for (const s of [-1, 1]) {
    box(0.36, 0.18, 0.05, B(0xfff2c8), s * 0.6, 0.72, 2.16, car); box(0.34, 0.14, 0.05, B(0xff2030), s * 0.66, 0.76, -2.16, car);
    const sp = new T.SpotLight(0xfff0cc, 2.2, 45, 0.42, 0.5, 1.2); sp.position.set(s * 0.6, 0.8, 2.2); car.add(sp);
    const tg = new T.Object3D(); tg.position.set(s * 0.6, 0, 14); car.add(tg); sp.target = tg; W.headlights.push(sp);
  }
  car.position.set(0, 0, 250);
}

function buildLobby() {
  const __n0 = world.children.length;
  const wl = len => M(0xffffff, { map: repTex(TX.wallLobby, Math.max(1, len / 1.6), 2) });
  const wlMat = wl(10), plain = M(0x2a2420);
  wallBox(7, -4, 7.2, 1.4, 0, 3.2, wlMat); wallBox(7, 2.6, 7.2, 5.85, 0, 3.2, wlMat); wallBox(7, 1.4, 7.2, 2.6, 2.4, 3.2, wlMat);
  wallBox(-8.7, -4.2, -8.5, -1.0, 0, 3.2, faces(wl(3), plain, plain, plain, plain));
  wallBox(-8.5, -4.2, -5.5, -4, 0, 3.2, wl(3)); wallBox(-4.3, -4.2, 7, -4, 0, 3.2, wl(11)); wallBox(-5.5, -4.2, -4.3, -4, 2.4, 3.2, wl(1));
  plane(7.7, 3.2, wl(7.7), -4.65, 1.6, 5.84, Math.PI); plane(6.2, 3.2, wl(6.2), 3.9, 1.6, 5.84, Math.PI); plane(1.6, 0.8, wl(1.6), 0, 2.8, 5.84, Math.PI);
  for (const x of [-4.6, 4.6]) plane(1.25, 1.1, M(0x0f1626, { shininess: 80, specular: 0x334466 }), x, 1.7, 5.83, Math.PI);
  plane(15.5, 9.85, M(0xffffff, { map: repTex(TX.carpet, 8, 5) }), -0.75, 0.02, 0.925, 0, -Math.PI / 2);
  plane(1.7, 6, M(0x3d1216), 0, 0.03, 2.7, 0, -Math.PI / 2);
  plane(15.5, 9.85, plain, -0.75, 3.2, 0.925, 0, Math.PI / 2);
  // lobby lights
  W.lobbyLights = []; W.bulbs = [];
  [[-4.5, 1.8], [2.5, 2.6], [-0.3, -2.4]].forEach(([x, z]) => {
    box(0.02, 0.4, 0.02, M(0x111111), x, 3.0, z);
    const sh = new T.Mesh(new T.ConeGeometry(0.32, 0.26, 8, 1, true), M(0x6a5a3a, { side: T.DoubleSide })); sh.position.set(x, 2.72, z); world.add(sh);
    const b = new T.Mesh(sph(0.09), B(0x221d18)); b.position.set(x, 2.62, z); world.add(b); W.bulbs.push(b);
    const L = VPoint(0xffcf8a, 0, 11, 1.4); L.position.set(x, 2.5, z); W.lobbyLights.push(L);
  });
  // desk
  const wood = M(0x5a3a26), woodDark = M(0x3a2519);
  const desk = box(5.6, 1.05, 0.8, wood, -0.25, 0.525, -1.0), top = box(5.8, 0.07, 0.95, woodDark, -0.25, 1.085, -1.0);
  box(5.62, 0.1, 0.02, M(0xb08a3e), -0.25, 0.88, -0.59); rayTargets.push(top); solid(-1.85, -2.4, 1.85, -1.5, 0, 1.1);
  inter([desk, top], () => deskLabel(), () => deskInteract(), 2.6);
  // bell
  const bellG = new T.Group(); bellG.position.set(-1.25, 1.12, -0.78); world.add(bellG);
  const bb = new T.Mesh(cyl(0.09, 0.1, 0.03, 12), M(0x222222)); bellG.add(bb);
  W.bellDome = new T.Mesh(new T.SphereGeometry(0.075, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(0xd6a24a, { shininess: 60, specular: 0x886633 })); W.bellDome.position.y = 0.015; bellG.add(W.bellDome);
  inter([bb, W.bellDome], () => 'Позвонить в звонок', () => act({ a: 'bell' }));
  // note + phone + book + monitor
  const note = plane(0.22, 0.3, M(0xefe6d0), 0.25, 1.123, -0.78, 0.25, -Math.PI / 2); W.px = { note };
  inter(note, () => 'Прочитать записку', () => openNote('manager'));
  const phoneG = new T.Group(); phoneG.position.set(1.45, 1.12, -0.85); world.add(phoneG);
  const pb = new T.Mesh(new T.BoxGeometry(0.26, 0.08, 0.2), M(0x7a1e22)); pb.position.y = 0.04; phoneG.add(pb);
  W.handset = new T.Mesh(new T.BoxGeometry(0.32, 0.055, 0.07), M(0x5e161a)); W.handset.position.y = 0.11; phoneG.add(W.handset);
  inter([pb, W.handset], () => phoneLabel(), () => act({ a: 'phone' }));
  W.phonePos = new T.Vector3(1.45, 1.2, -0.85);
  const book = box(0.44, 0.04, 0.32, M(0x2a3a2a), -2.3, 1.14, -0.85); plane(0.4, 0.28, M(0xe9e0c8), -2.3, 1.163, -0.85, 0, -Math.PI / 2);
  W.px.book = book; inter(book, () => 'Книга гостей', () => toast('Последняя запись: «Спасибо за всё. Не уезжаю». Дата — через неделю от сегодняшней.', 5));
  const mon = box(0.46, 0.38, 0.4, M(0xcfc6b0), 2.15, 1.31, -1.15);
  W.px.mon = mon; inter(mon, () => 'Компьютер', () => toast('Архив броней открывается при заселении гостя: подойди к стойке, когда гость ждёт.', 4.5));
  // behind the desk
  const kb = plane(2.2, 1.1, M(0xffffff, { map: TX.keys }), -0.3, 1.85, -3.89);
  W.masterKey = box(0.12, 0.2, 0.03, M(0xd6a24a, { shininess: 60 }), 0.55, 1.6, -3.86);
  W.px.kb = kb; inter(kb, () => masterKeyLabel(), () => act({ a: 'masterkey' }));
  inter(W.masterKey, () => masterKeyLabel(), () => act({ a: 'masterkey' }));
  plane(0.9, 0.34, B(0xffffff, { map: TX.clock }), -0.3, 2.7, -3.89);
  const plaque = plane(1.4, 0.875, M(0xffffff, { map: TX.plaque }), -4.6, 1.9, -3.89);
  W.px.plaque = plaque; inter(plaque, () => 'Табличка с рейтингом', () => toast('«Рейтинг 1,2. Цель 4,5». Кто-то приписал карандашом: «удачи».', 4));
  // left wall: elevator + portrait + plants
  box(0.1, 2.55, 1.9, M(0x6b6560), -8.45, 1.27, 3.3);
  W.elevDoors = [box(0.06, 2.3, 0.84, M(0x8b8580, { shininess: 40 }), -8.38, 1.15, 2.87), box(0.06, 2.3, 0.84, M(0x8b8580, { shininess: 40 }), -8.38, 1.15, 3.73)];
  plane(0.6, 0.3, M(0xffffff, { map: TX.elev }), -8.34, 1.55, 3.3, Math.PI / 2);
  W.px.elev = W.elevDoors.slice(); inter(W.elevDoors, () => 'Лифт', () => elevatorInteract(W.elevPos || new T.Vector3(-8.3, 1.4, 3.3)));
  box(0.08, 1.16, 0.96, M(0xa07a32, { shininess: 30 }), -8.44, 1.95, -2.4);
  W.portraitMat = M(0xffffff, { map: TX.portraitA });
  const portrait = plane(0.78, 0.98, W.portraitMat, -8.39, 1.95, -2.4, Math.PI / 2);
  W.px.portrait = portrait; inter(portrait, () => 'Портрет', () => toast(W.portraitMat.map === TX.portraitA ? 'Портрет основателя отеля. Взгляд тяжёлый.' : '…У него было лицо. Точно было.', 3.5));
  const plant = (x, z) => { box(0.5, 0.5, 0.5, M(0x6a3a22), x, 0.25, z); for (let i = 0; i < 5; i++) { const c = new T.Mesh(new T.ConeGeometry(0.16, 0.9, 5), M(0x2a4a2c)); c.position.set(x + rand(-.15, .15), 0.85, z + rand(-.15, .15)); c.rotation.set(rand(-.5, .5), 0, rand(-.5, .5)); world.add(c); } solid(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0, 1.5); };
  plant(-7.9, 5.2); plant(-7.9, -3.4);
  // right wall: rules, sofa, table
  const rules = plane(0.9, 1.15, M(0xffffff, { map: TX.rules }), 6.89, 1.7, -1.6, -Math.PI / 2); box(0.04, 1.2, 0.95, M(0x2a1a10), 6.93, 1.7, -1.6);
  W.px.rules = rules; inter(rules, () => 'Прочитать правила', () => openNote('rules'));
  const sofaM = M(0x4d5a3a);
  const sofa = [box(0.9, 0.45, 2.2, sofaM, 6.35, 0.25, 2.5), box(0.25, 0.9, 2.2, sofaM, 6.8, 0.55, 2.5), box(0.9, 0.6, 0.2, sofaM, 6.35, 0.35, 1.3), box(0.9, 0.6, 0.2, sofaM, 6.35, 0.35, 3.7)];
  solid(-6.8, 0.8, -4.4, 1.85, 0, 1); W.px.sofa = sofa; inter(sofa, () => 'Диван', () => toast('Продавлен в форме человека. И ещё тёплый.', 3.5));
  box(0.7, 0.06, 1.1, woodDark, 4.9, 0.42, 2.5); for (const a of [-1, 1]) for (const b2 of [-1, 1]) box(0.05, 0.4, 0.05, woodDark, 4.9 + a * 0.3, 0.2, 2.5 + b2 * 0.48);
  solid(-6.15, 2.15, -5.05, 3.15, 0, 0.5);
  W.sofaSeat = new T.Vector3(6.3, 0, 2.5);
  if (typeof LOBBY3D !== 'undefined' && LOBBY3D.ready) { try { applyLobby3D(__n0); } catch (e) { console.warn('lobby3d apply failed', e); } }
  buildServiceWing();
}
function buildServiceWing() {
  // service door + corridor
  makeDoor('service', { x: 7.1, y: 0, z: 1.4, w: 1.2, rot: -Math.PI / 2, kind: 'service', col: [7.04, 1.4, 7.16, 2.6], dir: -1, color: 0x4b4f4a });
  makeDoor('st0', { x: -5.5, y: 0, z: -4.1, w: 1.2, rot: 0, kind: 'stair', col: [-5.5, -4.16, -4.3, -4.04], dir: 1, color: 0x4b4f4a });
  buildConnectors();
  const cw = M(0x5a5d55);
  wallBox(4.2, -11.2, 4.4, -4.2, 0, 2.8, cw); wallBox(6.6, -11.2, 6.8, -7.7, 0, 2.8, cw); wallBox(6.6, -6.9, 6.8, -4.2, 0, 2.8, cw); wallBox(6.6, -7.7, 6.8, -6.9, 2.1, 2.8, cw); wallBox(4.4, -4.4, 6.6, -4.2, 0, 2.8, cw); wallBox(4.4, -11.2, 6.6, -11, 0, 2.8, cw);
  plane(2.2, 7, M(0x2a2b28), 5.5, 2.8, -7.6, 0, Math.PI / 2); plane(2.2, 7, M(0x2e2f2b), 5.5, 0.025, -7.6, 0, -Math.PI / 2);
  W.corBulb = new T.Mesh(sph(0.07), B(0x221d18)); W.corBulb.position.set(5.5, 2.7, -7.5); world.add(W.corBulb);
  W.corL = VPoint(0xc8ffd0, 0, 7, 1.5); W.corL.position.set(5.5, 2.55, -7.5); 
  const fuse = box(0.7, 0.9, 0.18, M(0x6c7072), 5.5, 1.5, -10.9);
  W.lever = box(0.07, 0.26, 0.08, M(0x1d1d1d), 5.62, 1.48, -10.78); W.lever.rotation.z = 0.6;
  W.led = box(0.05, 0.05, 0.02, B(0xff2222), 5.3, 1.82, -10.8);
  inter([fuse, W.lever, W.led], () => fuseLabel(), () => act({ a: 'fuse' }), 2.2);
  plane(2.4, 1.2, M(0xffffff, { map: TX.graffiti, transparent: true }), 4.41, 1.4, -8.6, Math.PI / 2);
  // shelves: wrench + towels
  box(0.45, 1.6, 0.9, M(0x3a3226), 6.35, 0.8, -6.2); solid(6.1, -6.7, 6.6, -5.7, 0, 1.7);
  const wrench = box(0.3, 0.05, 0.08, M(0x9aa0a6, { shininess: 50 }), 6.3, 1.63, -6.0);
  inter(wrench, () => 'Взять гаечный ключ', () => takeItem('wrench'));
  const tw1 = box(0.35, 0.25, 0.5, M(0xefefe6), 6.3, 1.0, -6.3);
  inter(tw1, () => 'Взять полотенца', () => takeItem('towels'));
  box(0.36, 0.4, 0.36, M(0xb8952f), 6.2, 0.2, -8.5); solid(5.98, -8.7, 6.6, -8.3, 0, 0.5);
  surf(-8.5, -11.2, 7.2, 5.85, 0);
}

/* ---------- connectors: lobby N door → stairwell, lobby E door → service wing ---------- */
function buildConnectors() {
  const cw = M(0x5a5d55), fl = M(0x2a2b28), ce = M(0x2e2f2b);
  const pass = (x0, z0, x1, z1) => { // floor + ceiling of a passage
    plane(x1 - x0, z1 - z0, fl, (x0 + x1) / 2, 0.025, (z0 + z1) / 2, 0, -Math.PI / 2); plane(x1 - x0, z1 - z0, ce, (x0 + x1) / 2, 2.8, (z0 + z1) / 2, 0, Math.PI / 2); surf(x0, z0, x1, z1, 0);
  };
  // north-west: from the lobby door x -5.5..-4.3 west along z -6.2..-4.2, then south into the stair shaft
  pass(-10.8, -6.2, -4.3, -4.2); pass(-10.8, -4.2, -9.6, -1.2);
  wallBox(-11.0, -6.4, -4.1, -6.2, 0, 2.8, cw);       // north wall
  wallBox(-4.3, -6.4, -4.1, -4.2, 0, 2.8, cw);         // east end
  wallBox(-11.0, -6.4, -10.8, -1.2, 0, 2.8, cw);       // west wall
  wallBox(-9.6, -4.2, -9.4, -1.2, 0, 2.8, cw);         // east wall of the southern leg
  wallBox(-9.4, -4.4, -8.5, -4.2, 0, 2.8, cw);         // closes the gap to the lobby corner
  wallBox(-8.5, -4.4, -5.5, -4.2, 0, 2.8, cw);         // service side of the lobby north wall
  W.connLights = [];
  for (const [x, z] of [[-7.5, -5.2], [-10.2, -3.0]]) { const L = VPoint(0xffcf8a, 0, 6, 1.5); L.position.set(x, 2.5, z); W.connLights.push(L); const b = new T.Mesh(sph(0.07), B(0x221d18)); b.position.set(x, 2.7, z); world.add(b); (W.connBulbs = W.connBulbs || []).push(b); }
  // east: from the lobby door x=7.2 east, then north along x 6.8..8.6 and west into the wing
  pass(7.2, -7.9, 8.6, 3.0); pass(6.8, -7.9, 7.2, -4.2);
  wallBox(8.6, -8.1, 8.8, 3.2, 0, 2.8, cw);            // east wall
  wallBox(6.8, -8.1, 8.8, -7.9, 0, 2.8, cw);           // north cap
  wallBox(7.2, 3.0, 8.8, 3.2, 0, 2.8, cw);             // south cap
  wallBox(6.8, -4.2, 7.2, -4.0, 0, 2.8, cw);           // inner corner
  for (const [x, z] of [[7.9, -1.0], [7.9, -6.2]]) { const L = VPoint(0xc8ffd0, 0, 6, 1.5); L.position.set(x, 2.5, z); W.connLights.push(L); const b = new T.Mesh(sph(0.07), B(0x221d18)); b.position.set(x, 2.7, z); world.add(b); W.connBulbs.push(b); }
}

/* ---------- stairwell: 13 levels shown, 1–3 walkable ---------- */
const ST = { x0: -11.85, x1: -8.5, laneE: [-10.0, -8.5], laneW: [-11.85, -10.45], gap: [-10.45, -10.0] };
function buildStairwell() {
  const paint = M(0xffffff, { map: repTex(TX.wallStair, 2, 1) }), HT = 13 * H;
  const corrMat = M(0xffffff, { map: repTex(TX.wallCorr, 3, 2) }), lobbyMat = M(0xffffff, { map: repTex(TX.wallLobby, 3, 2) });
  wallBox(-11.85, -1.2, -10.8, -1.0, 0, HT, paint); wallBox(-9.6, -1.2, -8.5, -1.0, 0, HT, paint); wallBox(-10.8, -1.2, -9.6, -1.0, 2.4, HT, paint);
  W.stairDoors = [];
  for (let L = 0; L < 13; L++) {
    const y0 = L * H, side = L === 0 ? lobbyMat : (L <= 2 ? corrMat : paint);
    const mats = faces(side, paint, paint, paint, paint);
    if (L === 0) { const wm = wallBox(-8.7, -1.0, (typeof LOBBY3D !== 'undefined' && LOBBY3D.ready) ? -8.53 : -8.5, 5.85, y0, y0 + H, mats); wm.position.x = -8.6; if (typeof LOBBY3D !== 'undefined' && LOBBY3D.ready) { wm.scale.x = 0.17 / 0.2; wm.position.x = -8.615; } }
    else { wallBox(-8.7, -1.0, -8.5, -0.6, y0, y0 + H, mats); wallBox(-8.7, 0.6, -8.5, 5.85, y0, y0 + H, mats); wallBox(-8.7, -0.6, -8.5, 0.6, y0 + 2.4, y0 + H, mats); }
    if (L === 0) { /* lobby-level stair door lives in the lobby north wall */ } else if (L <= 2) W.stairDoors.push(makeDoor('st' + L, { x: -8.6, y: y0, z: -0.6, w: 1.2, rot: -Math.PI / 2, dir: 1, kind: 'stair', col: [-8.66, -0.6, -8.54, 0.6], color: 0x4b4f4a }));
    else { const dm = box(0.07, 2.3, 1.2, M(0x3a3e3a), -8.6, y0 + 1.15, 0); rayTargets.push(dm); solid(-8.66, -0.6, -8.54, 0.6, y0, y0 + 2.4); inter(dm, () => 'Дверь на этаж', () => toast('Заколочено. С той стороны играет музыка. Медленно.', 3.5)); for (const a of [-0.3, 0.3]) { const plank = box(0.05, 0.14, 1.5, M(0x6a4a2a), -8.5, y0 + 1.2 + a, 0); plank.rotation.x = a; } }
    // floor plate
    const lbl = L === 12 ? '14' : String(L + 1);
    plane(1.2, 1.2, B(0xffffff, { map: bigNumTex(lbl), transparent: true }), -11.83, y0 + 1.8, 0.3, Math.PI / 2);
  }
  // steps (instanced)
  const stepGeo = new T.BoxGeometry(1, 1, 1), stepMat = M(0x6e6a62);
  const N = 13 * 2 * 10 + 26; const steps = new T.InstancedMesh(stepGeo, stepMat, N); let k = 0; const d = new T.Object3D();
  const put = (cx, cy, cz, sx, sy, sz) => { d.position.set(cx, cy, cz); d.scale.set(sx, sy, sz); d.rotation.set(0, 0, 0); d.updateMatrix(); steps.setMatrixAt(k++, d.matrix); };
  const ew = ST.laneE[1] - ST.laneE[0], ww = ST.laneW[1] - ST.laneW[0], ec = (ST.laneE[0] + ST.laneE[1]) / 2, wc = (ST.laneW[0] + ST.laneW[1]) / 2;
  for (let L = 0; L < 13; L++) {
    const y = L * H;
    for (let i = 0; i < 10; i++) {
      put(ec, y + (i + 1) * 0.17 - 0.2, 1.6 + (i + 0.5) * 0.28, ew, 0.4, 0.28);
      put(wc, y + 1.7 + (i + 1) * 0.17 - 0.2, 4.4 - (i + 0.5) * 0.28, ww, 0.4, 0.28);
    }
    put(-10.175, y + 1.7 - 0.1, 5.125, 3.35, 0.2, 1.45); // mid landing
    if (L > 0) put(-10.175, y - 0.1, 0.3, 3.35, 0.2, 2.6); // floor landing
  }
  steps.count = k; world.add(steps);
  // rails + posts (instanced)
  const railM = M(0x2a2420), railI = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), railM, 13 * 10); let ri = 0;
  const putR = (x, y, z, sx, sy, sz, rx) => { d.position.set(x, y, z); d.scale.set(sx, sy, sz); d.rotation.set(rx, 0, 0); d.updateMatrix(); railI.setMatrixAt(ri++, d.matrix); };
  for (let L = 0; L < 13; L++) {
    const y = L * H;
    putR(-10.02, y + 0.85 + 0.95, 3.0, 0.06, 0.06, 3.3, -0.545); putR(-10.43, y + 2.55 + 0.95, 3.0, 0.06, 0.06, 3.3, 0.545);
    for (let i = 0; i < 4; i++) { const z = 1.9 + i * 0.75; putR(-10.02, y + (z - 1.6) / 2.8 * 1.7 + 0.48, z, 0.04, 0.95, 0.04, 0); putR(-10.43, y + 1.7 + (4.4 - z) / 2.8 * 1.7 + 0.48, z, 0.04, 0.95, 0.04, 0); }
  }
  railI.count = ri; world.add(railI);
  solid(ST.gap[0], 1.55, ST.gap[1], 4.45, -1, 500);
  // walkable surfaces: levels 0..2
  for (let L = 0; L <= 2; L++) {
    const y = L * H;
    surf(ST.x0, -1.0, ST.x1, 1.6, y);
    if (L <= 1) { ramp(ST.laneE[0], ST.laneE[1], 1.6, y, 4.4, y + 1.7); surf(ST.x0, 4.4, ST.x1, 5.85, y + 1.7); ramp(ST.laneW[0], ST.laneW[1], 4.4, y + 1.7, 1.6, y + 3.4); }
  }
  // barricade at floor 3 going up
  const by = 2 * H;
  solid(ST.laneE[0], 1.6, ST.laneE[1], 2.2, by, by + 3);
  const bar = plane(1.3, 0.65, M(0xffffff, { map: TX.barricade }), -9.25, by + 1.15, 1.95, Math.PI);
  inter(bar, () => 'Табличка', () => toast('«Закрыто до второй ночи». Сверху кто-то спускается. Или нет.', 3.5));
  for (const yy of [0.6, 1.0, 1.5]) { const t = box(1.5, 0.08, 0.02, M(0xd8c22a), -9.25, by + yy, 2.0); t.rotation.z = (yy - 1) * 0.3; }
  box(0.5, 0.5, 0.5, M(0x4a3a2a), -9.5, by + 0.25 + 0.17, 2.4);
  // basement door at ground west lane
  solid(ST.laneW[0], 1.6, ST.laneW[1], 1.95, 0, 1.75);
  makeDoor('basement', { x: -11.85, y: 0, z: 1.8, w: 1.4, h: 1.6, kind: 'basement', dir: -1, color: 0x2a2a28, locked: true });
  // stair lights for levels 0..2 (+ dark bulbs above)
  W.stairLights = []; W.stairBulbs = [];
  for (let L = 0; L < 13; L++) {
    const b = box(0.25, 0.1, 0.25, B(0x221d18), -10.2, L * H + 3.1, 0.3); W.stairBulbs.push(b);
    if (L <= 2) { const l = VPoint(0xd8e8d0, 0, 9, 1.5); l.position.set(-10.2, L * H + 2.8, 0.3); W.stairLights.push(l); }
  }
  W.stairPos = L => ({ landing: new T.Vector3(-9.3, L * H, 0.3), mid: new T.Vector3(-10.2, L * H + 1.7, 5.1) });
}

/* ---------- floors 2 and 3 ---------- */
const THEMES = ['soviet', 'velvet', 'hunter', 'kids', 'flood', 'upside'];
const THEME_NAME = { soviet: 'Советский', velvet: 'Бархатный люкс', hunter: 'Охотничий', kids: 'Детский', flood: 'Затопленный', upside: 'Перевёрнутый' };
const SLOTS = [{ k: 'A', cx: -4.5, side: 1 }, { k: 'B', cx: 3, side: 1 }, { k: 'C', cx: -4.5, side: -1 }, { k: 'D', cx: 3, side: -1 }];
function buildFloor(L) {
  const y = L * H;
  W.floorG = W.floorG || {}; const fg = new T.Group(); world.add(fg); W.floorG[L] = fg; curParent = fg;
  // room definitions for this floor
  const defs = SLOTS.map((s, i) => ({ num: (L + 1) * 100 + i + 1, level: L, floor: L + 1, cx: s.cx, side: s.side, zc: s.side * 1.2, window: s.side > 0, far: s.cx > 0, theme: null, bath: null, beds: null, light: false, occupant: null, unlocked: false }));
  defs.forEach(d => { d.theme = rpick(THEMES); d.bath = R() < 0.5 ? 'ванна' : 'душ'; d.beds = R() < 0.4 ? 2 : 1; });
  rooms.push(...defs);
  const corrMat = len => M(0xffffff, { map: repTex(TX.wallCorr, Math.max(1, len / 1.6), 2) });
  // corridor floor/ceiling
  const run = TX.runner.clone(); run.needsUpdate = true; run.wrapS = run.wrapT = T.RepeatWrapping; run.center.set(0.5, 0.5); run.rotation = Math.PI / 2; run.repeat.set(1, 8);
  plane(20.35, 2.4, M(0xffffff, { map: run }), 1.675, y + 0.012, 0, 0, -Math.PI / 2);
  plane(20.35, 2.4, M(0x2b2620), 1.675, y + 3.0, 0, 0, Math.PI / 2);
  surf(-8.5, -5.85, 11.85, 5.85, y);
  // corridor walls with door gaps
  const doorGap = d => d.side > 0 ? [d.cx - 1.9, d.cx - 0.9] : [d.cx + 0.9, d.cx + 1.9];
  const buildWall = (side, gaps) => {
    const z0 = side > 0 ? 1.2 : -1.35, z1 = side > 0 ? 1.35 : -1.2;
    const pts = [-8.5, 11.85]; gaps.forEach(g => pts.push(g[0], g[1]));
    defs.filter(d => d.side === side).forEach(d => pts.push(d.cx - 2.5, d.cx + 2.5));
    if (side < 0) pts.push(7, 10);
    const xsSorted = [...new Set(pts)].sort((a, b) => a - b);
    for (let i = 0; i < xsSorted.length - 1; i++) {
      const a = xsSorted[i], b = xsSorted[i + 1], mid = (a + b) / 2; if (b - a < 0.01) continue;
      const inGap = gaps.some(g => mid > g[0] && mid < g[1]);
      const room = defs.find(d => d.side === side && mid > d.cx - 2.5 && mid < d.cx + 2.5);
      const roomMat = room ? themeWallMat(room.theme, b - a) : corrMat(b - a), cm = corrMat(b - a), other = M(0x2a2420);
      const mats = side > 0 ? faces(other, other, roomMat, cm, other) : faces(other, other, cm, roomMat, other);
      if (inGap) wallBox(a, z0, b, z1, y + 2.3, y + 3.2, mats, true); else wallBox(a, z0, b, z1, y, y + 3.2, mats);
    }
  };
  const closetGap = [7.3, 8.3];
  buildWall(1, defs.filter(d => d.side > 0).map(doorGap));
  buildWall(-1, defs.filter(d => d.side < 0).map(doorGap).concat([closetGap]));
  // corridor end window + elevator + floor sign
  plane(1.3, 1.5, B(0xffffff, { map: TX.night }), 11.84, y + 1.7, 0, -Math.PI / 2);
  plane(2.4, 3.0, corrMat(2.4), 11.845, y + 1.5, 0, -Math.PI / 2);
  box(1.4, 2.5, 0.06, M(0x6b6560), -7.75, y + 1.25, -1.17);
  const ed = [box(0.6, 2.3, 0.04, M(0x8b8580, { shininess: 40 }), -8.05, y + 1.15, -1.13), box(0.6, 2.3, 0.04, M(0x8b8580, { shininess: 40 }), -7.45, y + 1.15, -1.13)];
  inter(ed, () => 'Лифт', () => elevatorInteract(new T.Vector3(-7.75, y + 1.4, -1)));
  plane(0.9, 0.45, M(0xffffff, { map: numTex((L + 1) + ' ЭТАЖ') }), -7.6, y + 1.7, 1.19, Math.PI);
  // corridor lights (2 real + 4 fixtures)
  W.corridorLights = W.corridorLights || {}; W.corridorBulbs = W.corridorBulbs || {};
  W.corridorLights[L] = []; W.corridorBulbs[L] = [];
  for (const x of [-6, -1, 4, 9]) { const b = box(0.5, 0.06, 0.3, B(0x221d18), x, y + 2.96, 0); W.corridorBulbs[L].push(b); }
  for (const x of [-3, 6]) { const l = VPoint(0xffd9a0, 0, 10, 1.5); l.position.set(x, y + 2.7, 0); W.corridorLights[L].push(l); }
  // linen closet
  const cm = M(0x4a4a44);
  wallBox(6.85, -3.6, 7.0, -1.35, y, y + 3.2, cm); wallBox(10.0, -3.6, 10.15, -1.35, y, y + 3.2, cm); wallBox(7.0, -3.75, 10.0, -3.6, y, y + 3.2, cm);
  plane(3, 2.25, M(0x2e2f2b), 8.5, y + 0.02, -2.47, 0, -Math.PI / 2);
  plane(0.9, 0.22, B(0xbbbbbb, { map: TX.closet }), 7.8, y + 2.55, -1.19);
  makeDoor('cl' + L, { x: 7.3, y, z: -1.27, w: 1.0, kind: 'closet', dir: 1, col: [7.3, -1.33, 8.3, -1.21], color: 0x4b4f4a });
  box(0.5, 1.6, 2.4, M(0x3a3226), 9.7, y + 0.8, -2.4); solid(9.45, -3.6, 10, -1.35, y, y + 1.7);
  for (const z of [-3.1, -2.4, -1.7]) { const t = box(0.4, 0.22, 0.5, M(0xefefe6), 9.65, y + 1.05, z); inter(t, () => 'Взять полотенца', () => takeItem('towels')); }
  // rooms
  defs.forEach(d => buildRoom(d));
  curParent = null;
}
function themeWallMat(theme, len) {
  const t = { soviet: TX.wallSoviet, velvet: TX.wallVelvet, hunter: TX.wallHunter, kids: TX.wallKids, flood: TX.wallFlood, upside: TX.wallSoviet }[theme];
  return M(0xffffff, { map: repTex(t, Math.max(1, len / 1.6), 2) });
}
function buildRoom(d) {
  const y = d.level * H, s = d.side;
  const g = new T.Group(); g.position.set(d.cx, y, d.zc); g.rotation.y = s < 0 ? Math.PI : 0; (curParent || world).add(g); d.group = g; d.center = new T.Vector3(d.cx, y + 1.5, d.zc + s * 2.3);
  const wx = (lx) => d.cx + s * lx, wz = (lz) => d.zc + s * lz;
  const lsolid = (lx0, lz0, lx1, lz1, ly0 = 0, ly1 = 3.2) => solid(wx(lx0), wz(lz0), wx(lx1), wz(lz1), y + ly0, y + ly1);
  const lbox = (w, h, dd, mat, x, yy, z) => { const m = box(w, h, dd, mat, x, yy, z, g); return m; };
  const wall = themeWallMat(d.theme, 4.65), other = M(0x2a2420);
  // side + back walls (inner faces themed)
  const wW = lbox(0.1, 3.2, 4.65, [wall, other, other, other, other, other], -2.55, 1.6, 2.325); rayTargets.push(wW); lsolid(-2.6, 0, -2.5, 4.65);
  const wE = lbox(0.1, 3.2, 4.65, [other, wall, other, other, other, other], 2.55, 1.6, 2.325); rayTargets.push(wE); lsolid(2.5, 0, 2.6, 4.65);
  const wB = lbox(5.0, 3.2, 0.1, [other, other, other, other, other, wall], 0, 1.6, 4.7); rayTargets.push(wB); lsolid(-2.5, 4.65, 2.5, 4.75);
  // floor + ceiling
  const floorTex = d.theme === 'kids' ? M(0x7a8a6a) : d.theme === 'velvet' ? M(0xffffff, { map: repTex(TX.carpet, 3, 3) }) : M(0xffffff, { map: repTex(TX.parquet, 3, 3) });
  plane(5, 4.65, floorTex, 0, 0.013, 2.325, 0, -Math.PI / 2, g);
  plane(5, 4.65, M(0x2b2620), 0, 3.2, 2.325, 0, Math.PI / 2, g);
  // door
  const door = makeDoor('r' + d.num, { x: -1.9, y: 0, z: 0, w: 1.0, kind: 'room', room: d, dir: -1, parent: g, col: [wx(-1.9), wz(-0.07), wx(-0.9), wz(0.07)], color: 0x4a2a1c, locked: true, soundPos: new T.Vector3(wx(-1.4), y + 1.2, wz(0)) });
  if (door.col) { door.col.y0 = y; door.col.y1 = y + 2.4; }
  d.door = door;
  const dnd = plane(0.12, 0.24, M(0xffffff, { map: TX.dnd }), 0.88, 0.95, -0.045, Math.PI, 0, door.pivot); dnd.visible = false; d.dnd = dnd;
  // number plate on the corridor side
  const plate = plane(0.36, 0.18, M(0xffffff, { map: numTex(String(d.num)) }), -0.5, 1.75, -0.012, Math.PI, 0, g);
  // bathroom
  const tiles = M(0xffffff, { map: repTex(TX.tiles, 3, 3) });
  lbox(0.1, 3.2, 0.6, [tiles, wall, other, other, other, other], 0.35, 1.6, 0.3); lsolid(0.3, 0, 0.4, 0.6);
  lbox(0.1, 3.2, 0.5, [tiles, wall, other, other, other, other], 0.35, 1.6, 1.65); lsolid(0.3, 1.4, 0.4, 1.9);
  lbox(0.1, 1.0, 0.8, [tiles, wall, other, other, other, other], 0.35, 2.7, 1.0);
  const bw = lbox(2.2, 3.2, 0.1, [other, other, other, other, wall, tiles], 1.45, 1.6, 1.95); rayTargets.push(bw); lsolid(0.4, 1.9, 2.5, 2.0);
  plane(2.1, 1.9, tiles, 1.45, 0.02, 0.95, 0, -Math.PI / 2, g);
  if (d.bath === 'ванна') { lbox(0.75, 0.55, 1.7, M(0xe8e4dc, { shininess: 40 }), 2.1, 0.275, 0.95); lbox(0.6, 0.02, 1.5, M(0x8ab0c0, { shininess: 80 }), 2.1, 0.5, 0.95); lsolid(1.72, 0.1, 2.5, 1.8, 0, 0.55); }
  else { lbox(0.9, 0.08, 0.9, M(0xe8e4dc), 2.0, 0.04, 1.4); const cur = plane(0.9, 2.0, M(0xc8d8d0, { side: T.DoubleSide, transparent: true, opacity: 0.85 }), 1.55, 1.2, 1.4, Math.PI / 2, 0, g); }
  lbox(0.4, 0.4, 0.5, M(0xe8e4dc), 0.65, 0.2, 1.6); lsolid(0.45, 1.35, 0.85, 1.85, 0, 0.5);
  const sink = lbox(0.5, 0.15, 0.35, M(0xe8e4dc, { shininess: 40 }), 1.15, 0.85, 0.22); lbox(0.08, 0.85, 0.08, M(0xd8d4cc), 1.15, 0.42, 0.22); lsolid(0.9, 0, 1.4, 0.4, 0, 1);
  plane(0.6, 0.7, M(0x9aa8b0, { shininess: 100, specular: 0xaaaaaa }), 1.15, 1.55, 0.01, 0, 0, g);
  inter(sink, () => sinkLabel(d), () => sinkInteract(d), 2);
  d.sinkPos = new T.Vector3(wx(1.15), y + 1, wz(0.3));
  const cab = lbox(0.5, 0.35, 0.12, M(0xd8d4cc), 1.8, 1.55, 0.08);
  makeContainer('cab' + d.num, cab, 'cabinet', d.num, 'Открыть шкафчик', k => { cab.rotation.y = -k * 1.2; });
  // wardrobe
  const wd = lbox(0.55, 2.1, 1.3, M(0x4a2e1c), -2.2, 1.05, 0.95); lsolid(-2.5, 0.3, -1.92, 1.6, 0, 2.1);
  lbox(0.02, 1.9, 0.01, M(0x1a1008), -1.92, 1.05, 0.95);
  makeContainer('wd' + d.num, wd, 'wardrobe', d.num, 'Открыть шкаф', null);
  // beds
  const bedCol = { soviet: 0x7a5a3a, velvet: 0x8a1a24, hunter: 0x3a5a3a, kids: 0xd89aa8, flood: 0x5a6a6a, upside: 0x6a5a7a }[d.theme];
  const bed = (x0, x1) => {
    const cx = (x0 + x1) / 2, w = x1 - x0;
    lbox(w, 0.4, 2.0, M(0x3a2519), cx, 0.2, 3.6); const mat = lbox(w - 0.06, 0.18, 1.95, M(bedCol), cx, 0.49, 3.58); lbox(w - 0.2, 0.12, 0.35, M(0xefe9dc), cx, 0.64, 4.35); lbox(w, 0.9, 0.08, M(0x3a2519), cx, 0.65, 4.62);
    lsolid(x0, 2.6, x1, 4.65, 0, 0.6); return mat;
  };
  let bedMeshes = [];
  if (d.beds === 2) { bedMeshes = [bed(-2.35, -1.45), bed(-0.6, 0.3)]; d.seat = [-1.9, 2.95]; }
  else { bedMeshes = [bed(-1.3, 0.5)]; d.seat = [-0.4, 2.9]; }
  makeContainer('ub' + d.num, bedMeshes, 'underbed', d.num, 'Заглянуть под кровать', null);
  d.seatWorld = new T.Vector3(wx(d.seat[0]), y, wz(d.seat[1])); d.seatYaw = s > 0 ? Math.PI : 0;
  // nightstand
  const nsx = d.beds === 2 ? -1.0 : 0.85;
  const ns = lbox(0.45, 0.5, 0.4, M(0x4a2e1c), nsx, 0.25, 4.38); lsolid(nsx - 0.23, 4.17, nsx + 0.23, 4.6, 0, 0.5);
  const drawer = lbox(0.38, 0.14, 0.04, M(0x5a3a26), nsx, 0.36, 4.17);
  makeContainer('ns' + d.num, [ns, drawer], 'nightstand', d.num, 'Открыть тумбочку', k => { drawer.position.z = 4.17 - k * 0.25; });
  // desk, chair, radio
  lbox(0.95, 0.06, 1.0, M(0x4a2e1c), 1.97, 0.75, 3.1); for (const a of [-1, 1]) for (const b2 of [-1, 1]) lbox(0.05, 0.75, 0.05, M(0x3a2519), 1.97 + a * 0.42, 0.375, 3.1 + b2 * 0.44);
  lsolid(1.5, 2.6, 2.45, 3.6, 0, 0.8);
  lbox(0.45, 0.05, 0.45, M(0x3a2519), 1.3, 0.45, 3.1); lbox(0.05, 0.5, 0.45, M(0x3a2519), 1.08, 0.7, 3.1);
  const radio = lbox(0.34, 0.2, 0.16, M(0x6a4a2a), 2.1, 0.88, 3.4); lbox(0.12, 0.12, 0.01, M(0x2a2a2a), 2.05, 0.88, 3.32);
  inter(radio, () => radioLabel(d), () => act({ a: 'radio', room: d.num }), 2);
  d.radioPos = new T.Vector3(wx(2.1), y + 0.9, wz(3.4));
  // window or painting on the back wall
  if (d.window) { plane(1.3, 1.3, B(0xffffff, { map: TX.night }), 1.5, 1.65, 4.64, Math.PI, 0, g); lbox(1.45, 0.08, 0.1, M(0x3a2519), 1.5, 0.98, 4.6); for (const a of [-1, 1]) plane(0.45, 1.8, M(0x6a2a24, { side: T.DoubleSide }), 1.5 + a * 0.85, 1.6, 4.6, Math.PI, 0, g); }
  else { lbox(1.0, 0.75, 0.04, M(0xa07a32), 1.5, 1.7, 4.63); plane(0.9, 0.65, M(0xffffff, { map: TX.painting }), 1.5, 1.7, 4.61, Math.PI, 0, g); }
  // ceiling lamp + switch
  const bulb = lbox(0.3, 0.08, 0.3, B(0x221d18), 0, 3.12, 2.6); d.bulb = bulb;
  d.lightPos = new T.Vector3(wx(0), y + 2.6, wz(2.6));
  const sw = lbox(0.08, 0.12, 0.02, M(0xe8e0cc), -0.5, 1.3, 0.04);
  inter(sw, () => d.light ? 'Выключить свет' : 'Включить свет', () => act({ a: 'roomlight', room: d.num }), 2);
  // theme decor
  decorate(d, g, lbox, lsolid, wall);
  // empty-room door interactions use the door; room lights go through the pool
}
function decorate(d, g, lbox, lsolid) {
  const t = d.theme;
  if (t === 'soviet' || t === 'upside') {
    plane(1.4, 2.0, M(0xffffff, { map: TX.rug }), -2.49, 1.6, 3.3, Math.PI / 2, 0, g);
    lbox(0.45, 1.6, 1.0, M(0x5a3a26), 2.25, 0.8, 4.15); lbox(0.02, 0.7, 0.9, M(0x9ab0c0, { shininess: 80, transparent: true, opacity: 0.6 }), 2.02, 1.2, 4.15);
    for (let i = 0; i < 3; i++) lbox(0.08, 0.16, 0.08, M(0xe8f0f8, { shininess: 100 }), 2.25, 1.15, 3.85 + i * 0.3);
    lsolid(2.0, 3.65, 2.5, 4.65, 0, 1.6);
  }
  if (t === 'upside') {
    // furniture on the ceiling
    const up = new T.Group(); up.position.set(0, 3.2, 0); up.rotation.z = Math.PI; g.add(up);
    box(1.6, 0.4, 2.0, M(0x3a2519), 0.4, 0.2, 3.6, up); box(1.55, 0.18, 1.95, M(0x6a5a7a), 0.4, 0.49, 3.58, up);
    box(0.95, 0.06, 1.0, M(0x4a2e1c), -1.97, 0.75, 3.1, up); box(0.45, 0.05, 0.45, M(0x3a2519), -1.3, 0.45, 3.1, up);
    box(0.4, 0.5, 0.4, M(0x4a2e1c), 0, 0.25, 1.5, up);
  }
  if (t === 'velvet') {
    lbox(0.06, 2.0, 1.2, M(0xc99a45, { shininess: 60 }), 2.47, 1.4, 3.9); plane(1.0, 1.8, M(0x8a9aa8, { shininess: 120, specular: 0xcccccc }), 2.43, 1.4, 3.9, -Math.PI / 2, 0, g);
    lbox(0.1, 0.5, 0.1, M(0xc99a45), 2.1, 1.05, 2.8);
  }
  if (t === 'hunter') {
    const hd = new T.Group(); hd.position.set(-2.4, 2.1, 3.3); g.add(hd);
    box(0.3, 0.3, 0.45, M(0x6a4a2a), 0.15, 0, 0, hd); box(0.22, 0.22, 0.3, M(0x5a3a1a), 0.38, -0.08, 0, hd); box(0.04, 0.6, 0.6, M(0x3a2519), -0.02, 0, 0, hd);
    for (const a of [-1, 1]) { const an = new T.Mesh(new T.ConeGeometry(0.03, 0.5, 4), M(0xd8c8a8)); an.position.set(0.2, 0.3, a * 0.18); an.rotation.x = a * 0.5; hd.add(an); const an2 = new T.Mesh(new T.ConeGeometry(0.02, 0.25, 4), M(0xd8c8a8)); an2.position.set(0.2, 0.45, a * 0.32); an2.rotation.x = a * 1.0; hd.add(an2); }
    d.headGroup = hd;
    lbox(1.2, 0.06, 0.06, M(0x2a1a0a), -0.4, 2.3, 4.6); lbox(0.5, 0.1, 0.06, M(0x4a2e1c), -0.8, 2.25, 4.6);
  }
  if (t === 'kids') {
    const bx = d.beds === 2 ? -1.9 : -0.4;
    const bear = new T.Group(); bear.position.set(bx, 0.62, 4.2); g.add(bear); d.bear = bear;
    box(0.001, 0.001, 0.001, M(0), 0, 0, 0, bear);
    const bm = M(0x8a5a2a); const b1 = new T.Mesh(sph(0.16), bm); b1.position.y = 0.16; bear.add(b1); const b2 = new T.Mesh(sph(0.12), bm); b2.position.y = 0.4; bear.add(b2);
    for (const a of [-1, 1]) { const e = new T.Mesh(sph(0.05), bm); e.position.set(a * 0.09, 0.5, 0); bear.add(e); }
    const cols = [0xc84a3a, 0x3a7ac8, 0xe0c03a, 0x4aa85a];
    for (let i = 0; i < 6; i++) lbox(0.18, 0.18, 0.18, M(cols[i % 4]), -1.5 + (i % 3) * 0.3 + rr(-0.1, 0.1), 0.09 + Math.floor(i / 3) * 0.18, 2.1 + rr(-0.2, 0.2));
    lbox(0.12, 0.12, 0.05, B(0xffd890), -2.45, 0.4, 4.0);
  }
  if (t === 'flood') {
    plane(5, 4.65, M(0x2a4a5a, { transparent: true, opacity: 0.7, shininess: 120, specular: 0x88aacc }), 0, 0.12, 2.325, 0, -Math.PI / 2, g);
    lbox(0.25, 0.06, 0.1, M(0xd8a8b8), 0.8, 0.14, 2.2);
    d.wet = true;
  }
}

/* ---------- waypoint graph for the monster ---------- */
const WPN = {};
function N(id, x, y, z) { WPN[id] = { id, p: new T.Vector3(x, y, z), n: [] }; }
function E(a, b) { WPN[a].n.push(b); WPN[b].n.push(a); }
function buildWaypoints() {
  N('lb_st', -4.9, 0, -3.0); N('cn1', -4.9, 0, -5.2); N('cn2', -10.2, 0, -5.2); N('cn3', -10.2, 0, -2.0); N('lb_a', -4, 0, 0.2); N('lb_b', 0, 0, 0.5); N('lb_c', 4, 0, 0.3); N('lb_door', 0, 0, 4.6); N('lb_srv', 6.3, 0, 2.0); N('e1', 7.9, 0, 2.0); N('e2', 7.9, 0, -7.3); N('e3', 5.7, 0, -7.3); N('sv1', 5.5, 0, -6.5); N('sv2', 5.5, 0, -10);
  E('lb_st', 'lb_a'); E('lb_a', 'lb_b'); E('lb_b', 'lb_c'); E('lb_b', 'lb_door'); E('lb_c', 'lb_srv'); E('lb_srv', 'e1'); E('e1', 'e2'); E('e2', 'e3'); E('e3', 'sv1'); E('sv1', 'sv2'); E('lb_st', 'cn1'); E('cn1', 'cn2'); E('cn2', 'cn3');
  N('bs', -11.15, 0, 1.2);
  for (let L = 0; L <= 2; L++) {
    const y = L * H; N('ld' + L, -9.3, y, 0.2);
    if (L <= 1) { N('f1' + L, -9.25, y + 0.85, 3.0); N('ml' + L, -10.2, y + 1.7, 5.1); N('f2' + L, -11.15, y + 2.55, 3.0); E('ld' + L, 'f1' + L); E('f1' + L, 'ml' + L); E('ml' + L, 'f2' + L); }
    if (L >= 1) E('f2' + (L - 1), 'ld' + L);
  }
  E('bs', 'ld0'); E('ld0', 'cn3');
  for (const L of [1, 2]) {
    const y = L * H, xs = [-7.6, -4.5, -1, 3, 7.8, 11]; xs.forEach((x, i) => { N(`c${L}_${i}`, x, y, 0); if (i) E(`c${L}_${i - 1}`, `c${L}_${i}`); });
    E('ld' + L, `c${L}_0`);
  }
}
function nearestNode(p) { let best = null, bd = 1e9; for (const id in WPN) { const n = WPN[id]; const dy = Math.abs(n.p.y - p.y); const d = n.p.distanceTo(p) + dy * 2; if (d < bd) { bd = d; best = id; } } return best; }
function pathTo(a, b) {
  if (a === b) return [a]; const prev = { [a]: null }, q = [a];
  while (q.length) { const c = q.shift(); if (c === b) break; for (const n of WPN[c].n) if (!(n in prev)) { prev[n] = c; q.push(n); } }
  if (!(b in prev)) return [a]; const out = []; let c = b; while (c) { out.unshift(c); c = prev[c]; } return out;
}
