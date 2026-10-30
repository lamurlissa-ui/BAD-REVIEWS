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
    if (s.hole && x > s.hole[0] && x < s.hole[2] && z > s.hole[1] && z < s.hole[3]) continue;
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
  const dcol = o.color || 0x3d1d18, dm = M(dcol), dd = M(new T.Color(dcol).multiplyScalar(0.72).getHex()), brass = M(0xc9a24a, { shininess: 60 });
  const mesh = box(w - 0.01, hgt - 0.01, 0.045, dm, w / 2, hgt / 2, 0, pivot);
  const pw = (w - 0.3) / 2;
  for (const [py, ph] of [[hgt * 0.7, hgt * 0.34], [hgt * 0.3, hgt * 0.34]]) box(w - 0.3, ph, 0.052, dd, w / 2, py, 0, pivot);   // raised panels (visible both sides)
  for (const sd of [-1, 1]) { box(0.05, 0.05, 0.012, brass, w - 0.1, 1.02, sd * 0.03, pivot); box(0.012, 0.02, 0.1, brass, w - 0.1, 1.02, sd * 0.07, pivot); box(0.1, 0.02, 0.02, brass, w - 0.16, 1.02, sd * 0.1, pivot); }
  if (o.kind !== 'front') {
    const fm = M(0x2c211b), fg = new T.Group(); fg.position.set(o.x, o.y, o.z); fg.rotation.y = o.rot || 0; (o.parent || curParent || world).add(fg);
    box(0.07, hgt + 0.07, 0.2, fm, -0.035, (hgt + 0.07) / 2, 0, fg); box(0.07, hgt + 0.07, 0.2, fm, w + 0.035, (hgt + 0.07) / 2, 0, fg); box(w + 0.14, 0.07, 0.2, fm, w / 2, hgt + 0.035, 0, fg);
  }
  const d = { id, pivot, mesh, w, base: o.rot || 0, dir: o.dir || 1, open: false, locked: !!o.locked, kind: o.kind, room: o.room || null, t: 0, cur: 0, col: o.col ? solid(o.col[0], o.col[1], o.col[2], o.col[3], o.y, o.y + hgt) : null, pos: o.soundPos || new T.Vector3(o.x, o.y + 1.2, o.z) };
  doors[id] = d; mesh.userData.door = d;
  inter(mesh, () => doorLabel(d), () => doorInteract(d), 2.4);
  return d;
}
function setDoorOpen(d, open, instant) {
  d.open = open; if (d.col) d.col.on = !open;
  d.target = open ? d.dir * 1.55 : 0; if (instant) { d.cur = d.target; d.pivot.rotation.y = d.base + d.cur; }
}
function updateDoors(dt) { for (const id in doors) { const d = doors[id]; if (d.target == null) continue; const df = d.target - d.cur; if (Math.abs(df) > 0.001) { d.cur += Math.sign(df) * Math.min(Math.abs(df), Math.max(0.15 * dt, Math.abs(df) * dt * 6)); d.pivot.rotation.y = d.base + d.cur; } } }

function makeContainer(id, meshes, kind, room, label, animFn) {
  const c = { id, kind, room, opened: false, loot: null, anim: animFn || null, label };
  containers[id] = c;
  inter(meshes, () => c.opened ? null : label, () => searchContainer(c), 2.2);
  return c;
}

/* ================= BUILD ================= */
/* ================= BUILDING LAYOUT: one place for the numbers (north is -z) =================
   lobby (baked, never changes): x -8.5..7.0, z -4..5.85.  Stair core sits right behind the lobby «Выход» door. */
const BLD = {
  core: { x0: -11.85, x1: -4.1, z0: -12, z1: -4.2 },
  landZ: -6.4,                                  // entry landing: z landZ .. core.z1
  fA: { x0: -6.8, x1: -4.3 },                   // east flight, goes north (z -6.4 -> -10.8)
  fB: { x0: -9.2, x1: -7.0 },                   // west flight, comes back south (z -10.8 -> -6.4)
  midZ: -10.8,                                  // mid landing z -12 .. -10.8
  bas: { y: -3.0, rampX0: -11.5, rampX1: -9.7, rampZ0: -6.3, rampZ1: -11.4 },   // basement stairs go down along the west wall
  hall: { x0: -9.2, x1: 4.2, z0: -12, z1: -8.2 },                               // basement hall under the core and staff area
  corrZ: -1.0, corrHalf: 1.2,                   // upper floors: corridor z -2.2..0.2 (elevator doors z -1.8..-0.2 line up with the lobby's)
  spawn: { x: -3.0, y: -3.0, z: -10.0 },        // where Шумоед lives
  bdoor: { x: -10.6, z: -6.4 }                  // basement door
};
BLD.landPos = L => new T.Vector3(-4.9, L * H, -5.3);
BLD.midPos = L => new T.Vector3(-6.9, L * H + 1.7, -11.4);

/* curtains: parts = [{m, x0, x1, s0, s1}] — position.x and scale.x lerp between open (0) and closed (1) */
function regCurtain(key, parts) { W.curt[key] = { parts, closed: false, t: 0 }; }
function setCurtain(key, closed) { const c = W.curt[key]; if (c) c.closed = closed; }
function updateCurtains(dt) {
  for (const k in W.curt) { const c = W.curt[k], tg = c.closed ? 1 : 0, df = tg - c.t; if (Math.abs(df) < 0.001) continue; c.t += Math.sign(df) * Math.min(Math.abs(df), dt * 1.4); const e = c.t * c.t * (3 - 2 * c.t); for (const p of c.parts) { p.m.position.x = p.x0 + (p.x1 - p.x0) * e; p.m.scale.x = p.s0 + (p.s1 - p.s0) * e; } }
}
function curtainInter(key, meshes, range) { inter(meshes, () => W.curt[key] && W.curt[key].closed ? 'Открыть шторы' : 'Закрыть шторы', () => act({ a: 'curtain', key }), range || 2.4); }
function buildWorld(seed) {
  seedRng(seed); W.curt = {};
  world = new T.Scene();
  world.background = new T.Color(0x0b0e17);
  world.fog = new T.FogExp2(0x0b0e17, 0.02);
  cam = new T.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 600); cam.rotation.order = 'YXZ'; world.add(cam);
  hemi = new T.HemisphereLight(0x4a5c84, 0x0d0b0a, 0.55); world.add(hemi);
  moon = new T.DirectionalLight(0x9fb2e0, 0.3); moon.position.set(-30, 60, 20); world.add(moon);
  buildExterior();
  buildLobby();
  buildStairCore();
  for (const L of (window.TOUR ? [1,2,3,4,5,6,7,8,9,10,11,12] : [1, 2])) buildFloor(L);
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
  const B3 = typeof LOBBY3D !== 'undefined' && LOBBY3D.ready;
  if (B3) {
    // the baked lobby owns its south wall (single-sided, at z 5.85): outside skin sits behind it at z 6.10..6.15, with holes for the windows and the door
    const sk = (x0, x1, y0, y1) => { if (x1 - x0 < 0.01 || y1 - y0 < 0.01) return; box(x1 - x0, y1 - y0, 0.05, plaster, (x0 + x1) / 2, (y0 + y1) / 2, 6.125); solid(x0, 5.85, x1, 6.15, y0, y1); };
    wallBox(-12, 5.85, -8.5, 6.15, 0, HT, plaster); wallBox(7.0, 5.85, 12, 6.15, 0, HT, plaster); W.winX = [-3.0, 4.5];
    { const hs = W.winX.map(x => [x - 0.65, x + 0.65]);
      for (let L = 0; L <= 12; L++) {
        const yb = L === 0 ? 3.2 : L * H, yt = L === 12 ? HT : (L + 1) * H;
        if (L === 0) { wallBox(-8.5, 5.85, 7.0, 6.15, 3.2, H, plaster); continue; }
        let xa = -8.5; for (const h of hs) { wallBox(xa, 5.85, h[0], 6.15, yb, yt, plaster); wallBox(h[0], 5.85, h[1], 6.15, yb, yb + 0.95, plaster); wallBox(h[0], 5.85, h[1], 6.15, yb + 2.35, yt, plaster); xa = h[1]; }
        wallBox(xa, 5.85, 7.0, 6.15, yb, yt, plaster);
      } }
    sk(-8.5, -6.2, 0, 3.2); sk(-6.2, -4.4, 0, 0.95); sk(-6.2, -4.4, 2.55, 3.2); sk(-4.4, -1, 0, 3.2); sk(-1, 1, 2.5, 3.2); sk(1, 3.6, 0, 3.2); sk(3.6, 5.4, 0, 0.95); sk(3.6, 5.4, 2.55, 3.2); sk(5.4, 7.0, 0, 3.2);
  } else {
    wallBox(-12, 5.85, -0.8, 6.15, 0, HT, plaster); wallBox(0.8, 5.85, 12, 6.15, 0, HT, plaster); wallBox(-0.8, 5.85, 0.8, 6.15, 2.4, HT, plaster);
  }
  wallBox(-12.15, -12, -11.85, 6, 0, HT, plaster); { // east wall: a real window at the end of every upper corridor
    const cz0 = BLD.corrZ - 0.65, cz1 = BLD.corrZ + 0.65;
    wallBox(11.85, -12, 12.15, 6, 0, H, plaster);
    for (let L = 1; L <= 12; L++) { const yb = L * H, yt = L === 12 ? HT : yb + H;
      wallBox(11.85, -12, 12.15, cz0, yb, yt, plaster); wallBox(11.85, cz1, 12.15, 6, yb, yt, plaster); wallBox(11.85, cz0, 12.15, cz1, yb, yb + 0.9, plaster); wallBox(11.85, cz0, 12.15, cz1, yb + 2.4, yt, plaster);
      solid(11.85, cz0, 12.0, cz1, yb + 0.9, yb + 2.4); } } wallBox(-12, -12.15, 12, -11.85, 0, HT, plaster);
  box(25.2, 0.6, 19, M(0x2a2420), 0, HT + 0.3, -3);
  W.extG = new T.Group(); world.add(W.extG); curParent = W.extG;
  for (let L = 1; L < 13; L++) box(24.4, 0.18, 0.12, trim, 0, L * H, 6.2);
  box(24.4, 0.5, 0.12, M(0x3a302a), 0, 0.25, 6.2);
  // windows
  const winM = { lit: B(0xffffff, { map: TX.winLit }), sil: B(0xffffff, { map: TX.winSil }), dark: M(0x0d1220, { shininess: 60, specular: 0x445577 }), red: B(0x4a0a0c) };
  W.winM = winM;
  const win = (x, y, st) => { box(1.5, 1.4, 0.1, trim, x, y, 6.12); return plane(1.25, 1.1, winM[st], x, y, 6.19); };
  for (const x of (B3 ? [-10.2, 10.2] : [-10.2, -4.6, 4.6, 10.2])) win(x, 1.7, x === 10.2 ? 'lit' : 'dark');
  const xs = [-10.2, -7.4, -0.5, 7.4, 10.2];
  for (let L = 1; L < 13; L++) {
    for (const x of xs) { if (L === 12) { win(x, L * H + 1.7, x === -0.5 ? 'red' : 'dark'); continue; } win(x, L * H + 1.7, R() < 0.18 ? 'lit' : 'dark'); }
    // real windows (they match the rooms behind): frame + glass
    for (const x of W.winX) {
      const yy = L * H + 1.65, fm = M(0x2c211b);
      box(1.5, 0.08, 0.1, fm, x, yy - 0.74, 6.2); box(1.5, 0.08, 0.1, fm, x, yy + 0.74, 6.2); box(0.08, 1.4, 0.1, fm, x - 0.7, yy, 6.2); box(0.08, 1.4, 0.1, fm, x + 0.7, yy, 6.2); box(0.04, 1.4, 0.06, fm, x, yy, 6.2);
      const gl = plane(1.3, 1.4, L === 1 && x === 4.5 ? winM.sil : M(0x9fb4d0, { transparent: true, opacity: 0.1, depthWrite: false }), x, yy, 6.0); if (L === 1 && x === 4.5) W.silWin = gl;
    }
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
  wallBox(7, -4, 7.2, 5.85, 0, 3.2, wlMat);
  wallBox(-8.7, -4.2, -8.5, -1.0, 0, 3.2, faces(wl(3), plain, plain, plain, plain));
  wallBox(-8.5, -4.2, -5.5, -4, 0, 3.2, wl(3)); wallBox(-4.3, -4.2, 4.9, -4, 0, 3.2, wl(9)); wallBox(6.1, -4.2, 7, -4, 0, 3.2, wl(1)); wallBox(-5.5, -4.2, -4.3, -4, 2.4, 3.2, wl(1)); wallBox(4.9, -4.2, 6.1, -4, 2.4, 3.2, wl(1));
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
  makeDoor('service', { x: 4.9, y: 0, z: -4.1, w: 1.2, kind: 'service', col: [4.9, -4.16, 6.1, -4.04], dir: 1, color: 0x4b4f4a });
  makeDoor('st0', { x: -5.5, y: 0, z: -4.1, w: 1.2, rot: 0, kind: 'stair', col: [-5.5, -4.16, -4.3, -4.04], dir: 1, color: 0x4b4f4a });
  lobbyBackSkin();
  { const cr = M(0xc2b48f); for (const [a, b] of [[4.9, 6.1], [-5.5, -4.3]]) box(b - a, 0.14, 0.09, cr, (a + b) / 2, 3.14, -3.955); }   // cornice over the door gaps (baked trim is missing there)
  const cw = M(0x5a5d55);
  wallBox(4.2, -11.2, 4.4, -4.2, 0, 2.8, cw); wallBox(6.6, -11.2, 6.8, -4.2, 0, 2.8, cw); wallBox(4.4, -11.2, 6.6, -11, 0, 2.8, cw);
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

/* ---------- the wall behind the lobby's service door (the baked lobby wall is single-sided, so the back needs its own skin) ---------- */
function lobbyBackSkin() {
  const m = M(0x5a5d55), s = (x0, x1, y0, y1) => { const b = box(x1 - x0, y1 - y0, 0.19, m, (x0 + x1) / 2, (y0 + y1) / 2, -4.115); rayTargets.push(b); };
  s(4.4, 4.9, 0, 2.8); s(4.9, 6.1, 2.2, 2.8); s(6.1, 6.6, 0, 2.8);
}

/* ---------- stair core: right behind the lobby «Выход» door; 13 levels drawn, levels 1–3 walkable; basement below ---------- */
function buildStairCore() {
  const LW = window.TOUR ? 12 : 2, c = BLD.core, HT = 13 * H, bs = BLD.bas, hl = BLD.hall, fA = BLD.fA, fB = BLD.fB;
  const paint = M(0xffffff, { map: repTex(TX.wallStair, 2, 1) }), conc = M(0x4a4a46), floorM = M(0x2a2b28), ceilM = M(0x2b2620);
  const dbl = M(0x1f201d, { side: T.DoubleSide });
  const cx = (a, b) => (a + b) / 2;
  // outer walls, whole height
  wallBox(c.x0, c.z0, c.x0 + 0.15, c.z1, 0, HT, paint);
  wallBox(c.x0 + 0.15, c.z0 + 0.15, c.x1, c.z0 + 0.2, 0, HT, paint);   // inset 15 cm: the building shell's north wall already fills z -12.15..-11.85 (coplanar faces flickered)
  wallBox(-4.3, c.z0 + 0.15, c.x1, c.z1, 0, HT, paint);
  // south wall, level 0: skin behind the baked lobby wall, door gap x -5.5..-4.3
  const skin = (x0, x1, y0, y1, col) => { const m = box(x1 - x0, y1 - y0, 0.19, paint, cx(x0, x1), cx(y0, y1), -4.115); rayTargets.push(m); if (col) solid(x0, -4.2, x1, -4.0, y0, y1); };
  skin(c.x0, -8.6, 0, H, true); skin(-8.6, -5.5, 0, H, false); skin(-5.5, -4.3, 2.2, H, false); skin(-4.3, c.x1, 0, H, false);
  // "ВЫХОД" lettering on the baked sign (the baked texture shows only a green glow)
  const exTex = ctex(256, 80, (g, w, h) => { g.fillStyle = '#0a2a14'; g.fillRect(0, 0, w, h); g.fillStyle = '#8dffa8'; g.font = `700 54px ${FD}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ВЫХОД', w / 2, h / 2 + 2); });
  W.exitTex = exTex; plane(0.46, 0.144, B(0xffffff, { map: exTex }), -4.9, 2.5, -3.94, 0);
  // levels
  W.stairDoors = [];
  for (let L = 0; L < 13; L++) {
    const y0 = L * H;
    if (L > 0) {
      const g = M(0xffffff, { map: repTex(TX.wallCorr, 3, 2) });
      if (L <= LW) { wallBox(c.x0 + 0.15, -4.2, -8.65, -4.0, y0, y0 + H, paint); wallBox(-4.3, -4.2, c.x1, -4.0, y0, y0 + H, paint); }
      else {
        wallBox(c.x0 + 0.15, -4.2, c.x1, -4.0, y0, y0 + H, paint);
        const dm = box(1.2, 2.3, 0.07, M(0x3a3e3a), -4.9, y0 + 1.15, -4.18); rayTargets.push(dm);
        inter(dm, () => 'Дверь на этаж', () => toast('Заколочено. С той стороны играет музыка. Медленно.', 3.5));
        for (const a of [-0.3, 0.3]) { const pk = box(1.5, 0.14, 0.05, M(0x6a4a2a), -4.9, y0 + 1.2 + a, -4.14); pk.rotation.z = a; }
      }
    }
    // partition of the basement stair room (door only on the ground level)
    if (L === 0) { wallBox(c.x0 + 0.15, -6.5, -11.3, -6.3, 0, H, conc); wallBox(-9.9, -6.5, -9.4, -6.3, 0, H, conc); wallBox(-11.3, -6.5, -9.9, -6.3, 2.2, H, conc, true); }
    else wallBox(c.x0 + 0.15, -6.5, -9.4, -6.3, y0, y0 + H, conc);
    wallBox(-9.4, c.z0 + 0.15, -9.2, -6.5, y0, y0 + H, conc);   // east wall of the basement stair room (and its continuation above)
    // landing slab (visual) for levels above ground; ground has a floor plane
    if (L > 0) box(-4.3 - c.x0 - 0.15, 0.2, -4.2 - BLD.landZ, M(0x55524a), cx(c.x0 + 0.15, -4.3), y0 - 0.1, cx(BLD.landZ, -4.2));
    // floor plate on the west wall
    const lbl = L === 12 ? '14' : String(L + 1);
    plane(1.2, 1.2, B(0xffffff, { map: bigNumTex(lbl), transparent: true }), c.x0 + 0.16, y0 + 1.8, -5.3, Math.PI / 2);
  }
  plane(-4.3 - c.x0 - 0.15, -4.2 - BLD.landZ, floorM, cx(c.x0 + 0.15, -4.3), 0.02, cx(BLD.landZ, -4.2), 0, -Math.PI / 2);
  plane(-4.3 - fB.x0, BLD.landZ - hl.z1, floorM, cx(fB.x0, -4.3), 0.02, cx(BLD.landZ, hl.z1), 0, -Math.PI / 2);
  // divider between the two flights
  wallBox(-7.0, BLD.midZ, -6.8, BLD.landZ, 0, HT, paint);
  // steps (instanced)
  const stepM = M(0x6e6a62), N0 = 13 * 23 + 20; const steps = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), stepM, N0); let k = 0; const d = new T.Object3D();
  const put = (x, y, z, sx, sy, sz) => { d.position.set(x, y, z); d.scale.set(sx, sy, sz); d.rotation.set(0, 0, 0); d.updateMatrix(); steps.setMatrixAt(k++, d.matrix); };
  const aw = fA.x1 - fA.x0, bw = fB.x1 - fB.x0, ac = cx(fA.x0, fA.x1), bc = cx(fB.x0, fB.x1);
  for (let L = 0; L < 13; L++) {
    const y = L * H;
    for (let i = 0; i < 10; i++) {
      put(ac, y + (i + 1) * 0.17 - 0.2, BLD.landZ - (i + 0.5) * 0.44, aw - 0.03, 0.4, 0.42);
      put(bc, y + 1.7 + (i + 1) * 0.17 - 0.2, BLD.midZ + (i + 0.5) * 0.44, bw - 0.03, 0.4, 0.42);
    }
    put(cx(fB.x0, fA.x1), y + 1.6, cx(c.z0, BLD.midZ), fA.x1 - fB.x0, 0.2, BLD.midZ - c.z0);   // mid landing
  }
  const n = bs.rampZ0 - bs.rampZ1, cnt = 17;
  for (let i = 0; i < cnt; i++) put(cx(bs.rampX0, bs.rampX1), -(i / cnt) * 3.0 - 0.2, bs.rampZ0 - (i + 0.5) * (n / cnt), bs.rampX1 - bs.rampX0, 0.4, n / cnt - 0.01);
  steps.count = k; world.add(steps);
  // walkable surfaces: levels 0..2
  for (let L = 0; L <= LW; L++) {
    const y = L * H;
    surf(c.x0, BLD.landZ, c.x1, c.z1, y);
    if (L <= LW - 1) { ramp(fA.x0, fA.x1, BLD.landZ, y, BLD.midZ, y + 1.7); surf(fB.x0, c.z0, fA.x1, BLD.midZ, y + 1.7); ramp(fB.x0, fB.x1, BLD.midZ, y + 1.7, BLD.landZ, y + 3.4); }
  }
  // barricade at the foot of the east flight on level 3 (going up)
  const by = 2 * H;
  if (!window.TOUR) solid(fA.x0, BLD.landZ - 0.6, fA.x1, BLD.landZ, by, by + 3);
  const bar = window.TOUR ? { visible: false } : plane(1.3, 0.65, M(0xffffff, { map: TX.barricade }), cx(fA.x0, fA.x1), by + 1.15, BLD.landZ + 0.05, 0);
  if (!window.TOUR) inter(bar, () => 'Табличка', () => toast('«Закрыто до второй ночи». Сверху кто-то спускается. Или нет.', 3.5));
  if (!window.TOUR) for (const yy of [0.6, 1.0, 1.5]) { const t = box(2.3, 0.08, 0.02, M(0xd8c22a), cx(fA.x0, fA.x1), by + yy, BLD.landZ + 0.02); t.rotation.z = (yy - 1) * 0.3; }
  box(0.5, 0.5, 0.5, M(0x4a3a2a), -5.0, by + 0.42, BLD.landZ - 0.35);
  // basement: door, ramp, hall
  makeDoor('basement', { x: -11.3, y: 0, z: BLD.bdoor.z, w: 1.4, h: 2.2, rot: 0, kind: 'basement', dir: -1, color: 0x2a2a28, locked: true, col: [-11.3, BLD.bdoor.z - 0.06, -9.9, BLD.bdoor.z + 0.06] });
  ramp(bs.rampX0, bs.rampX1, bs.rampZ0, 0, bs.rampZ1, bs.y);
  { const g0 = surfaces.find(q => q.x0 === -400 && q.y === 0); if (g0) g0.hole = [c.x0, c.z0, -9.4, BLD.landZ]; }   // the outdoor ground has a hole over the basement stairs
  surf(c.x0, c.z0, -9.4, bs.rampZ1, bs.y); surf(c.x0, bs.rampZ1, -9.4, -6.4, bs.y); surf(-9.4, hl.z0, hl.x1, hl.z1, bs.y);
  const bb = bs.y - 0.4, bt = -0.15;
  wallBox(c.x0 - 0.3, c.z0 - 0.3, c.x0, -6.3, bb, 0, conc);                 // west
  wallBox(c.x0, c.z0 - 0.3, hl.x1 + 0.2, c.z0, bb, 0, conc);                // north
  wallBox(c.x0, -6.5, -9.4, -6.3, bb, 0, conc);                              // partition under the door
  wallBox(-9.4, -10.6, -9.2, -6.5, bb, 0, conc); wallBox(-9.4, c.z0, -9.2, -10.6, -0.95, 0, conc, true);  // east wall of the stair room, opening z -12..-10.6
  wallBox(hl.x0, hl.z1, hl.x1 + 0.2, hl.z1 + 0.2, bb, 0, conc); wallBox(hl.x1, hl.z0, hl.x1 + 0.2, hl.z1, bb, 0, conc);
  plane(-9.4 - c.x0, -6.4 - c.z0, ceilM, cx(c.x0, -9.4), 3.38, cx(c.z0, -6.4), 0, Math.PI / 2);
  plane(hl.x1 - hl.x0, hl.z1 - hl.z0, dbl, cx(hl.x0, hl.x1), bt, cx(hl.z0, hl.z1), 0, Math.PI / 2);
  plane(hl.x1 - hl.x0, hl.z1 - hl.z0, M(0x2e2d2a), cx(hl.x0, hl.x1), bs.y + 0.02, cx(hl.z0, hl.z1), 0, -Math.PI / 2);
  plane(-9.4 - c.x0, -6.4 - c.z0, M(0x2e2d2a), cx(c.x0, -9.4), bs.y + 0.02, cx(c.z0, -6.4), 0, -Math.PI / 2);
  box(13, 0.16, 0.16, M(0x5a5048), cx(hl.x0, hl.x1), -0.8, hl.z0 + 0.3); box(0.16, 0.16, 3.2, M(0x5a5048), -4, -1.0, cx(hl.z0, hl.z1));
  const boiler = new T.Mesh(cyl(0.7, 0.7, 2.0, 12), M(0x4a3a30)); boiler.position.set(2.8, bs.y + 1.0, -10.2); world.add(boiler); solid(2.1, -10.9, 3.5, -9.5, bs.y, bs.y + 2);
  // lights: one per walkable level + the basement
  W.stairLights = []; W.stairBulbs = [];
  for (let L = 0; L < 13; L++) {
    const b = box(0.25, 0.1, 0.25, B(0x221d18), -5.5, L * H + 3.05, -5.3); W.stairBulbs.push(b);
    const b2 = box(0.25, 0.1, 0.25, B(0x221d18), -6.9, L * H + 3.7, -11.3); W.stairBulbs.push(b2);   // above the mid landing
    const l = VPoint(0xd8e8d0, 0, 9, 1.5); l.position.set(-6.5, L * H + 2.7, -6.8); W.stairLights.push(l);
    const l2 = VPoint(0xd8e8d0, 0, 8, 1.5); l2.position.set(-6.9, L * H + 3.3, -11.0); W.stairLights.push(l2);
  }
  W.basLight = VPoint(0xb8c8b8, 0, 10, 1.5); W.basLight.position.set(-3, bs.y + 2.3, -10);
  W.stairPos = L => ({ landing: BLD.landPos(L), mid: BLD.midPos(L) });
}

/* ---------- floors 2 and 3 ---------- */
const THEMES = ['soviet', 'velvet', 'hunter', 'kids', 'flood', 'upside'];
const THEME_NAME = { soviet: 'Советский', velvet: 'Бархатный люкс', hunter: 'Охотничий', kids: 'Детский', flood: 'Затопленный', upside: 'Перевёрнутый' };
const SLOTS = [{ k: 'A', cx: -4.5, side: 1 }, { k: 'B', cx: 3, side: 1 }, { k: 'C', cx: 0.5, side: -1 }, { k: 'D', cx: 5.5, side: -1 }];
function buildFloor(L) {
  const y = L * H, cz = BLD.corrZ, ch = BLD.corrHalf, zS = cz + ch, zN = cz - ch;   // south / north edge of the corridor
  W.floorG = W.floorG || {}; const fg = new T.Group(); world.add(fg); W.floorG[L] = fg; curParent = fg;
  const defs = SLOTS.map((s, i) => ({ num: (L + 1) * 100 + i + 1, level: L, floor: L + 1, cx: s.cx, side: s.side, zc: s.side > 0 ? zS : zN, window: s.side > 0, far: s.cx > 0, theme: null, bath: null, beds: null, light: false, occupant: null, unlocked: false }));
  defs.forEach(d => { d.theme = rpick(THEMES); d.bath = R() < 0.5 ? 'ванна' : 'душ'; d.beds = R() < 0.4 ? 2 : 1; });
  rooms.push(...defs);
  const corrMat = len => M(0xffffff, { map: repTex(TX.wallCorr, Math.max(1, len / 1.6), 2) });
  // corridor floor/ceiling
  const run = TX.runner.clone(); run.needsUpdate = true; run.wrapS = run.wrapT = T.RepeatWrapping; run.center.set(0.5, 0.5); run.rotation = Math.PI / 2; run.repeat.set(1, 8);
  plane(20.35, 2.4, M(0xffffff, { map: run }), 1.675, y + 0.012, cz, 0, -Math.PI / 2);
  plane(20.35, 2.4, M(0x2b2620), 1.675, y + 3.0, cz, 0, Math.PI / 2);
  surf(-8.5, -6.85, 11.85, 4.85, y);
  // corridor walls with door gaps
  const doorGap = d => d.side > 0 ? [d.cx - 1.9, d.cx - 0.9] : [d.cx + 0.9, d.cx + 1.9];
  const hallM = M(0xffffff, { map: repTex(TX.wallStair, 2, 1) });
  const buildWall = (side, gaps) => {
    const z0 = side > 0 ? zS : zN - 0.15, z1 = side > 0 ? zS + 0.15 : zN;
    const pts = [-8.5, 11.85]; gaps.forEach(g => pts.push(g[0], g[1]));
    defs.filter(d => d.side === side).forEach(d => pts.push(d.cx - 2.5, d.cx + 2.5));
    if (side < 0) pts.push(8.4, 11.6);
    const xsSorted = [...new Set(pts)].sort((a, b) => a - b);
    for (let i = 0; i < xsSorted.length - 1; i++) {
      const a = xsSorted[i], b = xsSorted[i + 1], mid = (a + b) / 2; if (b - a < 0.01) continue;
      const inGap = gaps.some(g => mid > g[0] && mid < g[1]);
      const room = defs.find(d => d.side === side && mid > d.cx - 2.5 && mid < d.cx + 2.5);
      const roomMat = room ? themeWallMat(room.theme, b - a) : (side < 0 && mid < -4.2 ? hallM : corrMat(b - a)), cm = corrMat(b - a), other = M(0x2a2420);
      const mats = side > 0 ? faces(other, other, roomMat, cm, other) : faces(other, other, cm, roomMat, other);
      if (inGap) wallBox(a, z0, b, z1, y + 2.3, y + 3.2, mats, true); else wallBox(a, z0, b, z1, y, y + 3.2, mats);
      { const yb0 = inGap ? y + 2.3 : y; box(b - a + 0.06, y + 3.2 - yb0, 0.05, M(0x5a4d40), (a + b) / 2, (yb0 + y + 3.2) / 2, (z0 + z1) / 2); }   // hidden backing: a hairline crack shows wall colour, not the void
    }
  };
  const closetGap = [8.9, 9.9], stairGap = [-5.5, -4.3];
  buildWall(1, defs.filter(d => d.side > 0).map(doorGap));
  buildWall(-1, defs.filter(d => d.side < 0).map(doorGap).concat([closetGap, stairGap]));
  // corridor end window: wallpaper skin with a real hole, sill, frame and glass
  { const cm2 = corrMat(2.4), yb = y, wz0 = cz - 0.65, wz1 = cz + 0.65;
    for (const [z0, z1, y0, y1] of [[cz - 1.2, wz0, 0, 3.2], [wz1, cz + 1.2, 0, 3.2], [wz0, wz1, 0, 0.9], [wz0, wz1, 2.4, 3.2]]) { const m = box(0.02, y1 - y0, z1 - z0, [cm2, cm2, cm2, cm2, cm2, cm2], 11.83, yb + (y0 + y1) / 2, (z0 + z1) / 2); }
    const fm = M(0x2c211b); box(0.2, 0.05, 1.5, fm, 11.76, yb + 0.9, cz); box(0.06, 1.5, 0.06, fm, 11.97, yb + 1.65, wz0); box(0.06, 1.5, 0.06, fm, 11.97, yb + 1.65, wz1); box(0.06, 0.06, 1.3, fm, 11.97, yb + 2.4, cz); box(0.06, 0.06, 1.3, fm, 11.97, yb + 0.9, cz); box(0.04, 1.5, 0.04, fm, 11.97, yb + 1.65, cz);
    plane(1.3, 1.5, M(0x9fb4d0, { transparent: true, opacity: 0.1, depthWrite: false }), 12.0, yb + 1.65, cz, -Math.PI / 2); }
  // elevator: west end of the corridor, directly above the lobby elevator (doors z -1.8..-0.2)
  wallBox(-8.7, zN - 0.15, -8.5, zS + 0.15, y, y + 3.2, M(0x6b6560));
  const ed = [box(0.04, 2.3, 0.72, M(0x8b8580, { shininess: 40 }), -8.47, y + 1.15, cz - 0.4), box(0.04, 2.3, 0.72, M(0x8b8580, { shininess: 40 }), -8.47, y + 1.15, cz + 0.4)];
  inter(ed, () => 'Лифт', () => elevatorInteract(new T.Vector3(-8.2, y + 1.4, cz)));
  { const fm = M(0x3a3835); box(0.1, 0.12, 1.7, fm, -8.45, y + 2.36, cz); box(0.1, 2.36, 0.1, fm, -8.45, y + 1.18, cz - 0.82); box(0.1, 2.36, 0.1, fm, -8.45, y + 1.18, cz + 0.82);
    const it = ctex(128, 80, (g, w, h) => { g.fillStyle = '#120d08'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffb347'; g.font = `700 54px ${FD}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(L + 1), w / 2 - 14, h / 2 + 3); g.beginPath(); g.moveTo(w - 30, h / 2 + 10); g.lineTo(w - 14, h / 2 + 10); g.lineTo(w - 22, h / 2 - 8); g.fill(); });
    box(0.06, 0.3, 0.5, M(0x1a1815), -8.44, y + 2.66, cz); plane(0.4, 0.25, B(0xffffff, { map: it }), -8.405, y + 2.66, cz, Math.PI / 2); }
  // stair hall: the landing opens straight to the corridor; the fire door sits in the corridor wall
  const pz0 = BLD.core.z1, pz1 = zN - 0.15, hm = M(0xffffff, { map: repTex(TX.wallStair, 2, 1) });
  wallBox(-8.65, pz0 - 0.2, -8.5, pz1, y, y + 3.2, hm); wallBox(-4.3, pz0, -4.1, pz1, y, y + 3.2, hm);
  plane(4.2, pz1 - pz0, M(0x2a2b28), -6.4, y + 0.02, (pz0 + pz1) / 2, 0, -Math.PI / 2); box(4.4, 0.12, pz1 - pz0 + 0.5, M(0x2b2620), -6.4, y + 3.14, (pz0 + pz1) / 2 - 0.25);
  surf(-8.5, pz0, -4.3, zN, y);
  makeDoor('st' + L, { x: -5.5, y, z: (zN - 0.15 + zN) / 2, w: 1.2, rot: 0, kind: 'stair', col: [-5.5, zN - 0.15 + 0.01, -4.3, zN - 0.01], dir: 1, color: 0x4b4f4a });
  { const ex = plane(0.46, 0.144, B(0xffffff, { map: W.exitTex }), -4.9, y + 2.5, zN + 0.01, 0); }
  // cosy nook in the stair hall: bench + table with a lamp + one armchair (the way from the landing to the door stays free)
  { const wd = M(0x6a4a2c), wd2 = M(0x3a2a1c), fab = M(0x7a3a2a), sh = B(0xffe3a8), zc0 = -3.35;
    const bench = [box(0.5, 0.06, 1.6, wd, -8.2, y + 0.45, zc0), box(0.06, 0.4, 1.6, wd, -8.43, y + 0.7, zc0), box(0.06, 0.45, 0.06, wd2, -8.0, y + 0.22, zc0 - 0.7), box(0.06, 0.45, 0.06, wd2, -8.0, y + 0.22, zc0 + 0.7), box(0.06, 0.45, 0.06, wd2, -8.4, y + 0.22, zc0 - 0.7), box(0.06, 0.45, 0.06, wd2, -8.4, y + 0.22, zc0 + 0.7)];
    solid(-8.5, zc0 - 0.8, -7.9, zc0 + 0.8, y, y + 0.9);
    const tb = [box(0.6, 0.05, 0.6, wd, -7.2, y + 0.55, zc0), box(0.06, 0.55, 0.06, wd2, -7.2, y + 0.27, zc0)];
    box(0.35, 0.02, 0.35, wd2, -7.2, y + 0.03, zc0); box(0.12, 0.2, 0.12, sh, -7.2, y + 0.7, zc0 + 0.1); box(0.04, 0.12, 0.04, wd2, -7.2, y + 0.59, zc0 + 0.1);
    solid(-7.5, zc0 - 0.3, -6.9, zc0 + 0.3, y, y + 0.8);
    const ac = [box(0.7, 0.4, 0.7, fab, -6.35, y + 0.3, zc0), box(0.14, 0.55, 0.7, fab, -6.04, y + 0.75, zc0), box(0.7, 0.3, 0.12, fab, -6.35, y + 0.5, zc0 - 0.35), box(0.7, 0.3, 0.12, fab, -6.35, y + 0.5, zc0 + 0.35)];
    solid(-6.75, zc0 - 0.38, -5.95, zc0 + 0.38, y, y + 0.9);
    inter(bench.slice(0, 2), () => (window.isSitting && window.isSitting()) ? null : 'Сесть на скамью', () => sitDown(-7.95, zc0, -Math.PI / 2, 1.1), 2.4);
    inter(ac, () => (window.isSitting && window.isSitting()) ? null : 'Сесть в кресло', () => sitDown(-6.35, zc0, Math.PI / 2, 1.18), 2.4); }
  // corridor lights (2 real + 4 fixtures)
  W.corridorLights = W.corridorLights || {}; W.corridorBulbs = W.corridorBulbs || {};
  W.corridorLights[L] = []; W.corridorBulbs[L] = [];
  for (const x of [-6, -1, 4, 9]) { const b = box(0.5, 0.06, 0.3, B(0x221d18), x, y + 2.96, cz); W.corridorBulbs[L].push(b); }
  for (const x of [-3, 6]) { const l = VPoint(0xffd9a0, 0, 10, 1.5); l.position.set(x, y + 2.7, cz); W.corridorLights[L].push(l); }
  // linen closet (north side, east end)
  const cm = M(0x4a4a44), cx0 = 8.4, cx1 = 11.6, cb = -5.9;
  wallBox(cx0, cb, cx0 + 0.15, zN - 0.15, y, y + 3.2, cm); wallBox(cx1 - 0.15, cb, cx1, zN - 0.15, y, y + 3.2, cm); wallBox(cx0 + 0.15, cb - 0.15, cx1 - 0.15, cb, y, y + 3.2, cm);
  plane(cx1 - cx0 - 0.3, zN - 0.15 - cb, M(0x2e2f2b), (cx0 + cx1) / 2, y + 0.02, (cb + zN - 0.15) / 2, 0, -Math.PI / 2);
  plane(0.9, 0.22, B(0xbbbbbb, { map: TX.closet }), 9.4, y + 2.55, zN + 0.01, 0);
  makeDoor('cl' + L, { x: 8.9, y, z: (zN - 0.15 + zN) / 2, w: 1.0, kind: 'closet', dir: 1, col: [8.9, zN - 0.14, 9.9, zN - 0.01], color: 0x4b4f4a });
  box(0.5, 1.6, 2.4, M(0x3a3226), cx1 - 0.45, y + 0.8, -4.2); solid(cx1 - 0.7, -5.4, cx1 - 0.15, -3.0, y, y + 1.7);
  for (const z of [-4.9, -4.2, -3.5]) { const t = box(0.4, 0.22, 0.5, M(0xefefe6), cx1 - 0.5, y + 1.05, z); inter(t, () => 'Взять полотенца', () => takeItem('towels')); }
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
  const D = d.window ? 5.55 : 4.65, wall = themeWallMat(d.theme, D), other = M(0x2a2420);
  // side + back walls (inner faces themed)
  const wW = lbox(0.1, 3.2, D, [wall, other, other, other, other, other], -2.55, 1.6, D / 2); rayTargets.push(wW); lsolid(-2.6, 0, -2.5, D);
  const wE = lbox(0.1, 3.2, D, [other, wall, other, other, other, other], 2.55, 1.6, D / 2); rayTargets.push(wE); lsolid(2.5, 0, 2.6, D);
  const bm = [other, other, other, other, other, wall];
  if (d.window) {
    // the facade (0.3 m, z 5.85..6.15) is the room's back wall: wallpaper skin on its inner face with a window hole, a deep sill for flowers
    const zs = D + 0.09;
    for (const [bw, bh, bx, by] of [[3.35, 3.2, -0.825, 1.6], [0.35, 3.2, 2.325, 1.6], [1.3, 0.95, 1.5, 0.475], [1.3, 0.85, 1.5, 2.775]]) rayTargets.push(lbox(bw, bh, 0.02, bm, bx, by, zs));
    const sill = M(0x3a2519); lbox(1.5, 0.05, 0.34, sill, 1.5, 0.95, zs - 0.17); lbox(1.5, 0.08, 0.06, sill, 1.5, 0.89, zs - 0.03);
    const pot = M(0x8a4a2a), leaf = M(0x3f7a3a); lbox(0.16, 0.14, 0.16, pot, 1.15, 1.04, zs - 0.15); lbox(0.22, 0.2, 0.22, leaf, 1.15, 1.2, zs - 0.15); lbox(0.12, 0.12, 0.12, pot, 1.95, 1.0, zs - 0.15); lbox(0.1, 0.22, 0.1, leaf, 1.95, 1.17, zs - 0.15);
    lbox(1.9, 0.03, 0.03, M(0x2a2018), 1.5, 2.55, zs - 0.08);   // curtain rod
    const cm = [-1, 1].map(a => plane(0.55, 1.75, M(0x6a2a24, { side: T.DoubleSide }), 1.5 + a * 0.72, 1.66, zs - 0.09, Math.PI, 0, g));
    regCurtain('r' + d.num, cm.map((m, i) => ({ m, x0: 1.5 + (i ? 1 : -1) * 0.72, x1: 1.5 + (i ? 1 : -1) * 0.475, s0: 1, s1: 1.75 }))); curtainInter('r' + d.num, cm, 2.6);
  } else { const wB = lbox(5.0, 3.2, 0.1, bm, 0, 1.6, 4.7); rayTargets.push(wB); }
  lsolid(-2.5, D, 2.5, D + 0.1);
  // floor + ceiling
  const floorTex = d.theme === 'kids' ? M(0x7a8a6a) : d.theme === 'velvet' ? M(0xffffff, { map: repTex(TX.carpet, 3, 3) }) : M(0xffffff, { map: repTex(TX.parquet, 3, 3) });
  plane(5, D, floorTex, 0, 0.013, D / 2, 0, -Math.PI / 2, g);
  plane(5, D, M(0x2b2620), 0, 3.2, D / 2, 0, Math.PI / 2, g);
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
  if (!d.window) { lbox(1.0, 0.75, 0.04, M(0xa07a32), 1.5, 1.7, 4.63); plane(0.9, 0.65, M(0xffffff, { map: TX.paintings[d.num % TX.paintings.length] }), 1.5, 1.7, 4.61, Math.PI, 0, g); }
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
  N('lb_door', 0, 0, 4.6); N('lb_a', -4, 0, 0.2); N('lb_b', 0, 0, 0.5); N('lb_c', 4, 0, 0.3); N('lb_st', -4.9, 0, -3.0); N('lb_srv', 5.5, 0, -3.0); N('sv1', 5.5, 0, -6.5); N('sv2', 5.5, 0, -10);
  E('lb_st', 'lb_a'); E('lb_a', 'lb_b'); E('lb_b', 'lb_c'); E('lb_b', 'lb_door'); E('lb_c', 'lb_srv'); E('lb_srv', 'sv1'); E('sv1', 'sv2');
  // stair core: landing, east flight (north), mid landing, west flight (south)
  for (let L = 0; L <= 2; L++) {
    const y = L * H;
    N('ld' + L, -4.9, y, -5.3);
    if (L <= 1) { N('fa' + L, -5.55, y + 0.85, -8.6); N('ml' + L, -6.9, y + 1.7, -11.4); N('fb' + L, -8.1, y + 2.55, -8.6); E('ld' + L, 'fa' + L); E('fa' + L, 'ml' + L); E('ml' + L, 'fb' + L); }
    if (L >= 1) { N('ft' + L, -8.1, y, -6.0); E('fb' + (L - 1), 'ft' + L); E('ft' + L, 'ld' + L); }
  }
  E('lb_st', 'ld0');
  // basement: hall -> opening -> bottom of ramp -> up to the door -> landing
  N('bs', -3, BLD.bas.y, -10); N('bo', -9.3, BLD.bas.y, -11.2); N('br1', -10.6, BLD.bas.y, -11.6); N('br2', -10.6, BLD.bas.y / 2, -8.9); N('bd', -10.6, 0, -5.6);
  E('bs', 'bo'); E('bo', 'br1'); E('br1', 'br2'); E('br2', 'bd'); E('bd', 'ld0');
  // upper floors: corridor nodes at z = corrZ, a passage from the stair landing
  for (const L of [1, 2]) {
    const y = L * H, xs = [-7.6, -4.5, -1, 3, 7.8, 11]; xs.forEach((x, i) => { N(`c${L}_${i}`, x, y, BLD.corrZ); if (i) E(`c${L}_${i - 1}`, `c${L}_${i}`); });
    N('pc' + L, -4.9, y, -3.2); E('ld' + L, 'pc' + L); E('pc' + L, `c${L}_1`);
  }
}

function nearestNode(p) { let best = null, bd = 1e9; for (const id in WPN) { const n = WPN[id]; const dy = Math.abs(n.p.y - p.y); const d = n.p.distanceTo(p) + dy * 2; if (d < bd) { bd = d; best = id; } } return best; }
function pathTo(a, b) {
  if (a === b) return [a]; const prev = { [a]: null }, q = [a];
  while (q.length) { const c = q.shift(); if (c === b) break; for (const n of WPN[c].n) if (!(n in prev)) { prev[n] = c; q.push(n); } }
  if (!(b in prev)) return [a]; const out = []; let c = b; while (c) { out.unshift(c); c = prev[c]; } return out;
}
