/* BAD REVIEWS — heroes: races, roles, inflate, items in hand, emotes, dances, ragdoll (ported from the heroes lab) */
'use strict';
window.Heroes = (() => {
const rand = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)], clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/* ================= HEROES MODULE (portable into the game) ================= */
const _mf = new Map();
const Mf = c => { let m = _mf.get(c); if (!m) { m = new T.MeshPhongMaterial({ color: c, flatShading: true, shininess: 8, specular: 0x0c0c0c }); _mf.set(c, m); } return m; };
const Ms = c => new T.MeshPhongMaterial({ color: c, shininess: 70, specular: 0x555555 });
const Bm = c => new T.MeshBasicMaterial({ color: c });
const cyl = (a, b, h, s = 8) => new T.CylinderGeometry(a, b, h, s), sph = (r, w = 12, h = 10) => new T.SphereGeometry(r, w, h), bx = (a, b, c) => new T.BoxGeometry(a, b, c);
const mk = (geo, mat, x = 0, y = 0, z = 0, p) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); p.add(m); return m; };
function limb(parent, x, y, len, r, mat, endMat, endR, smooth) { const piv = new T.Group(); piv.position.set(x, y, 0); parent.add(piv); mk(cyl(r, r * 0.85, len, smooth ? 12 : 7), mat, 0, -len / 2, 0, piv); if (endMat) mk(sph(endR || r * 1.3, smooth ? 14 : 8, smooth ? 10 : 6), endMat, 0, -len, 0.02, piv); piv.userData.len = len; return piv; }
function eyes(p, y, z, r, sx, o = {}) {
  for (const s of [-1, 1]) { const k = o.same ? 1 : (s < 0 ? 1.12 : 0.94); const w = mk(sph(r * k), o.white || Mf(0xf4efe4), s * sx, y, z, p); mk(sph(r * 0.42 * k, 8, 6), o.pupil || Bm(0x0a0a0c), s * sx, y - 0.01, z + r * k * 0.82, p); if (o.sleepy) { const lid = mk(new T.SphereGeometry(r * k * 1.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), o.lid, s * sx, y, z, p); lid.rotation.x = 0.45; } }
}
const mouthMesh = (p, w, y, z, mat) => { const m = mk(bx(w, 0.03, 0.02), mat || Bm(0x1a0a0a), 0, y, z, p); m.userData.base = m.scale.clone(); return m; };

const SKINS = [0xf2d0b5, 0xe0ac88, 0xc68a62, 0x8d5a3b, 0x5b3a29, 0x9fc7a8];
const HAIRC = [0x1d1714, 0x5a3a22, 0xc79a52, 0xb8432f, 0xe8e2d4, 0x6b7fd1];
const UNI = [0x6e1f2a, 0xb8892a, 0x4a5a34, 0x232f4f, 0x5c3a6e, 0x2a2a30];
const FUR = { cat: [0xd88a3a, 0x3a3a3a, 0xe8e2d8], frog: [0x5a9a4a, 0x9ab04a, 0x4a7a9a], crow: [0x1d1d24, 0x55555e, 0xeeeeee], bear: [0x6a4a2e, 0xe8e2d4, 0x2a1d14], wolf: [0x7a7a80, 0x5a4330, 0xdedede] };

const RACES = {
  potato: { name: 'Клубни', desc: 'Тело — это голова. Падают и катятся.', fields: [
    { k: 'peel', l: 'Кожура', t: 'sw', o: [0xc9a26a, 0xa8503a, 0x6a3a6e, 0xd8843a] }, { k: 'shape', l: 'Форма', t: 'chip', o: ['Круглый', 'Груша', 'Длинный'] }, { k: 'eyes', l: 'Глаза', t: 'chip', o: ['Маленькие', 'Обычные', 'Огромные'] }, { k: 'spots', l: '«Глазки» на кожуре', t: 'chip', o: ['Мало', 'Много'] }] },
  noodle: { name: 'Лапша', desc: 'Длинные, тонкие, руки до колен. Свои пугаются.', fields: [
    { k: 'skin', l: 'Кожа', t: 'sw', o: SKINS }, { k: 'tall', l: 'Рост', t: 'chip', o: ['Длинный', 'Очень', 'Слишком'] }, { k: 'arms', l: 'Руки', t: 'chip', o: ['До колен', 'До пола'] }, { k: 'hair', l: 'Причёска', t: 'chip', o: ['Нет', 'Чёлка', 'Хвостик'] }, { k: 'hairC', l: 'Цвет волос', t: 'sw', o: HAIRC }] },
  animal: { name: 'Звери', desc: 'Тело в униформе, голова зверя.', fields: [
    { k: 'head', l: 'Голова', t: 'chip', o: ['Кот', 'Лягушка', 'Ворона', 'Медведь', 'Волк'] }, { k: 'fur', l: 'Окрас', t: 'fur' }] },
  mannequin: { name: 'Манекены', desc: 'Пустая голова. Лицо рисуешь сам.', fields: [
    { k: 'wood', l: 'Материал', t: 'sw', o: [0xc8a27a, 0x7a5232, 0x8a3a2a, 0xe8e4dc] }, { k: 'face', l: 'Лицо — нарисуй', t: 'pad' }] },
  people: { name: 'Люди', desc: 'Обычные люди. По приколу.', fields: [
    { k: 'skin', l: 'Кожа', t: 'sw', o: SKINS }, { k: 'hair', l: 'Причёска', t: 'chip', o: ['Короткие', 'Каре', 'Пучок', 'Ирокез', 'Без волос'] }, { k: 'hairC', l: 'Цвет волос', t: 'sw', o: HAIRC }, { k: 'eyes', l: 'Глаза', t: 'chip', o: ['Обычные', 'Круглые', 'Сонные'] }] },
};
const ROLES = {
  admin: { name: 'Администратор', tool: 'колокольчик', perk: 'У гостя на стойке сразу замечает одну деталь.' },
  maid: { name: 'Горничная', tool: 'фартук', perk: 'Убирает вдвое быстрее.' },
  tech: { name: 'Техник', tool: 'каска', perk: 'Чинит вдвое быстрее и слышит, где что сломалось.' },
  guard: { name: 'Охрана', tool: 'рация', perk: 'Бьёт сильнее: Шумоед оглушён дольше.' },
};
function defaults(race) {
  const p = {};
  for (const f of RACES[race].fields) { if (f.t === 'sw') p[f.k] = f.o[0]; else if (f.t === 'chip') p[f.k] = f.o[0]; else if (f.t === 'fur') p[f.k] = 0; }
  if (race === 'people') p.hair = 'Короткие';
  return p;
}
function randomParams(race) {
  const p = {};
  for (const f of RACES[race].fields) { if (f.t === 'sw' || f.t === 'chip') p[f.k] = pick(f.o); else if (f.t === 'fur') p[f.k] = Math.floor(Math.random() * 3); }
  return p;
}

/* each builder returns the rig: {g, lL, lR, aL, aR, body, head, mouth, hat:{p,y,r}, chest:{p,y,z}, belt:{p,y,r}, height, eye} */
function rigBase() { const g = new T.Group(), body = new T.Group(); g.add(body); return { g, body }; }
const BUILD = {
  people(p, u) {
    const r = rigBase(), skin = Mf(p.skin), uni = Mf(u), dark = Mf(0x1b1a20), hairM = Mf(p.hairC);
    [r.lL, r.lR] = [-1, 1].map(s => limb(r.g, s * 0.15, 0.62, 0.58, 0.11, dark, Mf(0x0d0c0e), 0.12));
    mk(cyl(0.3, 0.36, 0.8, 8), uni, 0, 0.98, 0, r.body); mk(cyl(0.34, 0.3, 0.14, 8), dark, 0, 0.6, 0, r.body);
    [r.aL, r.aR] = [-1, 1].map(s => { mk(sph(0.11, 8, 6), uni, s * 0.3, 1.3, 0, r.body); const a = limb(r.body, s * 0.31, 1.3, 0.6, 0.085, uni, skin, 0.095); a.userData.rz = s * 0.07; return a; });
    mk(cyl(0.09, 0.1, 0.19, 6), skin, 0, 1.41, 0, r.body);
    const h = new T.Group(); h.position.y = 1.77; r.body.add(h); r.head = h;
    const hd = mk(new T.IcosahedronGeometry(0.33, 1), skin, 0, 0, 0, h); hd.scale.set(1, 1.06, 0.96);
    for (const s of [-1, 1]) mk(sph(0.07, 6, 5), skin, s * 0.33, 0, 0, h);
    eyes(h, 0.05, 0.26, p.eyes === 'Круглые' ? 0.11 : 0.085, 0.125, { sleepy: p.eyes === 'Сонные', lid: skin });
    const n = mk(new T.ConeGeometry(0.055, 0.16, 5), skin, 0, -0.03, 0.34, h); n.rotation.x = Math.PI / 2;
    r.mouth = mouthMesh(h, 0.13, -0.16, 0.29);
    const cap = () => { const c = mk(new T.SphereGeometry(0.35, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), hairM, 0, 0.03, -0.02, h); c.rotation.x = -0.18; };
    if (p.hair === 'Короткие') cap();
    if (p.hair === 'Каре') { cap(); for (const s of [-1, 1]) mk(bx(0.1, 0.4, 0.5), hairM, s * 0.33, -0.07, -0.03, h); mk(bx(0.62, 0.42, 0.12), hairM, 0, -0.06, -0.28, h); }
    if (p.hair === 'Пучок') { cap(); mk(sph(0.16, 8, 6), hairM, 0, 0.38, -0.12, h); }
    if (p.hair === 'Ирокез') for (let i = 0; i < 5; i++) { const c = mk(new T.ConeGeometry(0.065, 0.28, 5), hairM, 0, 0.36 - Math.abs(i - 1.5) * 0.02, 0.2 - i * 0.11, h); c.rotation.x = -0.35 - i * 0.12; }
    Object.assign(r, { hat: { y: 0.3, r: 0.32 }, chest: { y: 1.12, z: 0.31 }, belt: { y: 0.72, r: 0.37 }, height: 2.2, eye: 1.62, palm: p.skin });
    return r;
  },
  potato(p, u) {
    const r = rigBase(), peel = Mf(p.peel), uni = Mf(u);
    const sc = { 'Круглый': [1, 1.08, 0.95], 'Груша': [0.92, 1.3, 0.9], 'Длинный': [0.76, 1.55, 0.8] }[p.shape];
    const hy = 0.52 * sc[1];
    [r.lL, r.lR] = [-1, 1].map(s => { const l = limb(r.g, s * 0.2, 0.5, 0.4, 0.1, Mf(0x1b1a20), null); const f = mk(sph(0.14, 10, 8), Mf(0x0d0c0e), 0, -0.42, 0.04, l); f.scale.set(1, 0.6, 1.35); return l; });
    const h = new T.Group(); h.position.y = 0.34 + hy; r.body.add(h); r.head = h;
    const b = mk(sph(0.52, 14, 12), peel, 0, 0, 0, h); b.scale.set(...sc);
    const ap = mk(new T.SphereGeometry(0.53, 14, 12, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4), uni, 0, 0, 0, h); ap.scale.set(...sc);
    const er = { 'Маленькие': 0.08, 'Обычные': 0.12, 'Огромные': 0.17 }[p.eyes];
    eyes(h, hy * 0.42, 0.47 * sc[2], er, 0.15 + er * 0.3, {});
    r.mouth = mouthMesh(h, 0.16, hy * 0.05, 0.5 * sc[2]);
    const n = p.spots === 'Много' ? 9 : 4;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.6, yy = (Math.sin(i * 2.3) * 0.5) * hy; const rr = 0.52 * Math.sqrt(Math.max(0.1, 1 - (yy / (0.52 * sc[1])) ** 2)); mk(sph(0.03, 6, 4), Mf(0x6a4a2a), Math.cos(a) * rr * sc[0], yy, Math.sin(a) * rr * sc[2] * (Math.sin(a) > 0 ? 0.6 : 1) - (Math.sin(a) > 0.6 ? 0.1 : 0), h); }
    [r.aL, r.aR] = [-1, 1].map(s => { const x = s * 0.46 * sc[0]; mk(sph(0.1, 8, 6), peel, x, -0.02, 0, h); const a = limb(h, x, -0.02, 0.32, 0.08, peel, peel, 0.1); a.userData.rz = s * 0.32; return a; });
    Object.assign(r, { hat: { y: hy, r: 0.3 }, chest: { y: 0.34 + hy * 0.55, z: 0.5 * sc[2], onHead: true }, belt: { y: 0.34 + hy * 0.6, r: 0.5 * sc[0] }, height: 0.34 + hy * 2 + 0.2, eye: 0.5 + hy, palm: p.peel, bounce: true });
    return r;
  },
  noodle(p, u) {
    const r = rigBase(), skin = Mf(p.skin), uni = Mf(u), hairM = Mf(p.hairC);
    const legL = { 'Длинный': 0.95, 'Очень': 1.2, 'Слишком': 1.45 }[p.tall], armL = p.arms === 'До пола' ? 1.5 : 1.05;
    [r.lL, r.lR] = [-1, 1].map(s => { const l = limb(r.g, s * 0.08, legL + 0.04, legL + 0.04, 0.06, Mf(0x1b1a20), null); mk(bx(0.16, 0.08, 0.36), Mf(0x0d0c0e), 0, -legL + 0.04, 0.08, l); return l; });
    const torso = new T.Group(); torso.position.y = legL; r.body.add(torso); r.torso = torso;
    mk(cyl(0.14, 0.15, 1.0, 8), uni, 0, 0.5, 0, torso); mk(cyl(0.15, 0.13, 0.12, 8), Mf(0x1b1a20), 0, 0.02, 0, torso);
    for (const s of [-1, 1]) mk(sph(0.065, 8, 6), uni, s * 0.15, 0.95, 0, torso);
    mk(cyl(0.045, 0.05, 0.42, 6), skin, 0, 1.2, 0, torso);
    const h = new T.Group(); h.position.y = 1.48; torso.add(h); r.head = h;
    mk(sph(0.17, 12, 10), skin, 0, 0, 0, h); eyes(h, 0.03, 0.12, 0.07, 0.075, {}); r.mouth = mouthMesh(h, 0.07, -0.08, 0.16);
    if (p.hair === 'Чёлка') { mk(new T.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.4), hairM, 0, 0.02, -0.01, h); mk(bx(0.26, 0.07, 0.06), hairM, 0, 0.1, 0.14, h); }
    if (p.hair === 'Хвостик') { mk(new T.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.4), hairM, 0, 0.02, -0.01, h); const t = mk(cyl(0.04, 0.015, 0.5, 6), hairM, 0, 0.05, -0.3, h); t.rotation.x = 1.0; }
    [r.aL, r.aR] = [-1, 1].map(s => { const a = limb(torso, s * 0.16, 0.95, armL, 0.05, uni, skin, 0.085); a.userData.rz = s * 0.04; return a; });
    Object.assign(r, { hat: { y: 0.16, r: 0.17 }, chest: { y: legL + 0.75, z: 0.14, inTorso: true }, belt: { y: legL + 0.15, r: 0.15 }, height: legL + 1.75, eye: legL + 1.25, palm: p.skin, sway: true });
    return r;
  },
  animal(p, u) {
    const r = rigBase(), uni = Mf(u), dark = Mf(0x1b1a20);
    const key = { 'Кот': 'cat', 'Лягушка': 'frog', 'Ворона': 'crow', 'Медведь': 'bear', 'Волк': 'wolf' }[p.head]; const fur = Mf(FUR[key][p.fur || 0]);
    [r.lL, r.lR] = [-1, 1].map(s => limb(r.g, s * 0.15, 0.62, 0.58, 0.11, dark, Mf(0x0d0c0e), 0.12));
    mk(cyl(0.29, 0.35, 0.8, 8), uni, 0, 0.98, 0, r.body); mk(cyl(0.33, 0.29, 0.14, 8), dark, 0, 0.6, 0, r.body);
    mk(cyl(0.1, 0.12, 0.2, 6), fur, 0, 1.43, 0, r.body);
    [r.aL, r.aR] = [-1, 1].map(s => { mk(sph(0.11, 8, 6), uni, s * 0.29, 1.3, 0, r.body); const a = limb(r.body, s * 0.3, 1.3, 0.6, 0.085, uni, fur, 0.1); a.userData.rz = s * 0.07; return a; });
    const h = new T.Group(); h.position.y = 1.72; r.body.add(h); r.head = h;
    const ANIM = {
      cat() { mk(sph(0.3), fur, 0, 0, 0, h); for (const s of [-1, 1]) { const e = mk(new T.ConeGeometry(0.1, 0.22, 4), fur, s * 0.17, 0.27, 0, h); e.rotation.z = -s * 0.3; } eyes(h, 0.04, 0.24, 0.07, 0.1, { white: Mf(0xd8e86a) }); mk(sph(0.04, 6, 4), Mf(0xd86a7a), 0, -0.06, 0.29, h); for (const s of [-1, 1]) for (const k of [-0.03, 0.02]) { const w = mk(bx(0.22, 0.008, 0.008), Bm(0xf4efe4), s * 0.22, -0.06 + k, 0.24, h); w.rotation.z = s * k * 4; } r.mouth = mouthMesh(h, 0.08, -0.13, 0.27); return { y: 0.3, r: 0.3 }; },
      frog() { const hd = mk(sph(0.32), fur, 0, -0.04, 0, h); hd.scale.set(1.3, 0.75, 1); for (const s of [-1, 1]) { mk(sph(0.12), fur, s * 0.2, 0.18, 0.08, h); mk(sph(0.08), Mf(0xf4efe4), s * 0.2, 0.22, 0.16, h); mk(sph(0.035), Bm(0x0a0a0c), s * 0.2, 0.22, 0.235, h); } r.mouth = mouthMesh(h, 0.48, -0.1, 0.31, Bm(0x2a1a1a)); return { y: 0.22, r: 0.36 }; },
      crow() { mk(sph(0.29), fur, 0, 0, 0, h); const bk = mk(new T.ConeGeometry(0.09, 0.36, 5), Mf(0x8a8478), 0, -0.02, 0.4, h); bk.rotation.x = Math.PI / 2; for (const s of [-1, 1]) { mk(sph(0.05), Bm(0xf2e6a0), s * 0.13, 0.08, 0.23, h); mk(sph(0.022), Bm(0x0a0a0c), s * 0.13, 0.08, 0.27, h); } const lower = mk(new T.ConeGeometry(0.06, 0.28, 5), Mf(0x6a6458), 0, -0.1, 0.36, h); lower.rotation.x = Math.PI / 2; r.mouth = lower; lower.userData.base = lower.scale.clone(); lower.userData.beak = true; return { y: 0.28, r: 0.29 }; },
      bear() { mk(sph(0.32), fur, 0, 0, 0, h); for (const s of [-1, 1]) mk(sph(0.1), fur, s * 0.24, 0.24, 0, h); const mz = mk(sph(0.14), Mf(0xc8a27a), 0, -0.08, 0.24, h); mz.scale.set(1.2, 0.8, 1); mk(sph(0.045), Bm(0x0a0a0c), 0, -0.03, 0.37, h); eyes(h, 0.08, 0.25, 0.05, 0.1, { same: true }); r.mouth = mouthMesh(h, 0.09, -0.16, 0.34); return { y: 0.3, r: 0.32 }; },
      wolf() { mk(sph(0.28), fur, 0, 0.02, 0, h); const sn = mk(bx(0.2, 0.16, 0.3), fur, 0, -0.08, 0.3, h); sn.rotation.x = 0.15; mk(bx(0.15, 0.06, 0.12), Mf(0xe8e2d4), 0, -0.15, 0.36, h); mk(sph(0.045, 6, 4), Bm(0x0a0a0c), 0, -0.03, 0.46, h); for (const s of [-1, 1]) { const e = mk(new T.ConeGeometry(0.08, 0.26, 4), fur, s * 0.15, 0.3, -0.02, h); e.rotation.z = -s * 0.15; } eyes(h, 0.08, 0.22, 0.055, 0.11, { white: Mf(0xf2c84a), same: true }); r.mouth = mouthMesh(h, 0.14, -0.17, 0.42); return { y: 0.3, r: 0.29 }; },
    };
    r.hat = ANIM[key](); r.animal = key;
    Object.assign(r, { chest: { y: 1.12, z: 0.3 }, belt: { y: 0.72, r: 0.35 }, height: 2.15, eye: 1.62, palm: FUR[key][p.fur || 0] });
    return r;
  },
  mannequin(p, u) {
    const r = rigBase(), wood = Mf(p.wood), joint = Mf(new T.Color(p.wood).multiplyScalar(0.8).getHex()), uni = Mf(u);
    [r.lL, r.lR] = [-1, 1].map(s => { const l = limb(r.g, s * 0.13, 0.95, 0.85, 0.07, wood, Mf(0x2a1d14), 0.1); mk(sph(0.085, 8, 6), joint, 0, -0.43, 0, l); return l; });
    for (const s of [-1, 1]) mk(sph(0.09, 8, 6), joint, s * 0.13, 0.95, 0, r.body);
    mk(cyl(0.2, 0.17, 0.75, 8), wood, 0, 1.35, 0, r.body);
    mk(cyl(0.215, 0.185, 0.55, 8), uni, 0, 1.42, 0, r.body);
    for (const s of [-1, 1]) mk(sph(0.08, 8, 6), joint, s * 0.27, 1.65, 0, r.body);
    [r.aL, r.aR] = [-1, 1].map(s => { const a = limb(r.body, s * 0.27, 1.65, 0.7, 0.055, wood, wood, 0.08); a.userData.rz = s * 0.12; mk(sph(0.065, 8, 6), joint, 0, -0.35, 0, a); return a; });
    mk(cyl(0.06, 0.07, 0.16, 6), wood, 0, 1.79, 0, r.body);
    const h = new T.Group(); h.position.y = 2.06; r.body.add(h); r.head = h;
    const hd = mk(sph(0.27, 16, 14), Mf(new T.Color(p.wood).lerp(new T.Color(0xffffff), 0.25).getHex()), 0, 0, 0, h); hd.scale.set(1, 1.12, 1);
    const patch = new T.Mesh(new T.SphereGeometry(0.275, 24, 18, Math.PI / 2 - 0.85, 1.7, Math.PI / 2 - 0.8, 1.6), new T.MeshPhongMaterial({ map: faceTexture(p.face), transparent: true, shininess: 4 }));
    patch.scale.set(1, 1.12, 1); h.add(patch); r.facePatch = patch;
    Object.assign(r, { hat: { y: 0.3, r: 0.28 }, chest: { y: 1.45, z: 0.22 }, belt: { y: 1.12, r: 0.2 }, height: 2.45, eye: 1.95, palm: p.wood });
    return r;
  },
  balloon(p, u) {
    const r = rigBase(), rub = Ms(p.col), uni = Ms(u);
    [r.lL, r.lR] = [-1, 1].map(s => limb(r.g, s * 0.17, 0.56, 0.44, 0.12, rub, rub, 0.14, true));
    const b = mk(sph(0.42, 24, 18), rub, 0, 0.86, 0, r.body); b.scale.set(1, 1.15, 0.95);
    const band = mk(cyl(0.43, 0.43, 0.22, 24), uni, 0, 0.72, 0, r.body); band.scale.set(1, 1, 0.95);
    [r.aL, r.aR] = [-1, 1].map(s => { mk(sph(0.1, 14, 10), rub, s * 0.33, 1.1, 0, r.body); const a = limb(r.body, s * 0.34, 1.1, 0.42, 0.085, rub, rub, 0.11, true); a.userData.rz = s * 0.22; return a; });
    const hr = p.headS === 'Огромная' ? 0.55 : 0.44;
    const spring = new T.Group(); spring.position.y = 1.32; r.body.add(spring); mk(cyl(0.06, 0.08, 0.16, 10), rub, 0, 0.06, 0, spring);
    const h = new T.Group(); h.position.y = 0.12 + hr; spring.add(h); r.head = h; r.spring = spring;
    mk(sph(hr, 28, 20), rub, 0, 0, 0, h);
    const ink = Bm(0x1a1018);
    if (p.look === 'Удивление') { for (const s of [-1, 1]) { mk(sph(hr * 0.16, 12, 10), Mf(0xffffff), s * hr * 0.35, hr * 0.12, hr * 0.9, h); mk(sph(hr * 0.07, 10, 8), ink, s * hr * 0.35, hr * 0.12, hr * 1.04, h); } const o = mk(new T.TorusGeometry(hr * 0.1, hr * 0.035, 8, 16), ink, 0, -hr * 0.3, hr * 0.94, h); r.mouth = o; o.userData.base = o.scale.clone(); }
    else { for (const s of [-1, 1]) mk(sph(hr * 0.08, 12, 10), ink, s * hr * 0.32, hr * 0.12, hr * 0.95, h); if (p.look === 'Улыбка') { const sm = mk(new T.TorusGeometry(hr * 0.22, hr * 0.03, 8, 20, Math.PI), ink, 0, -hr * 0.12, hr * 0.94, h); sm.rotation.z = Math.PI; r.mouth = sm; sm.userData.base = sm.scale.clone(); } else r.mouth = mouthMesh(h, hr * 0.2, -hr * 0.3, hr * 0.97, ink); for (const s of [-1, 1]) { const c = mk(sph(hr * 0.1, 10, 8), new T.MeshBasicMaterial({ color: 0xff6a8a, transparent: true, opacity: 0.35 }), s * hr * 0.55, -hr * 0.12, hr * 0.8, h); c.scale.z = 0.3; } }
    Object.assign(r, { hat: { y: hr * 0.92, r: hr * 0.85 }, chest: { y: 1.0, z: 0.4 }, belt: { y: 0.72, r: 0.44 }, height: 1.44 + hr * 2, eye: 1.4 + hr, palm: p.col, wobble: true, smooth: true });
    return r;
  },
};
const faceCache = new Map();
let padTexture = null;
function faceTexture(dataUrl) {
  if (padTexture && dataUrl === '__pad') return padTexture;
  if (!dataUrl) dataUrl = defaultFace();
  if (faceCache.has(dataUrl)) return faceCache.get(dataUrl);
  const img = new Image(); const t = new T.Texture(img); img.onload = () => { t.needsUpdate = true; }; img.src = dataUrl; faceCache.set(dataUrl, t); return t;
}
let _df = null;
function defaultFace() { if (_df) return _df; const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#141414'; g.beginPath(); g.arc(95, 110, 11, 0, 7); g.arc(161, 110, 11, 0, 7); g.fill(); g.lineWidth = 7; g.lineCap = 'round'; g.strokeStyle = '#141414'; g.beginPath(); g.arc(128, 140, 40, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); _df = c.toDataURL(); return _df; }

/* role accessories */
function addRole(r, role, u) {
  const head = r.head, hat = r.hat, gold = Mf(0xd6a24a);
  const hs = hat.r / 0.32;
  const top = new T.Group(); top.position.y = hat.y; top.scale.setScalar(hs); head.add(top);
  const chestP = r.chest.inTorso ? r.torso : (r.chest.onHead ? r.head : r.body);
  const chestY = r.chest.inTorso ? r.chest.y - r.torso.position.y : (r.chest.onHead ? r.chest.y - r.head.position.y - (r.body.position.y) : r.chest.y);
  const beltP = r.chest.inTorso ? r.torso : (r.chest.onHead ? r.head : r.body);
  const beltY = r.chest.inTorso ? r.belt.y - r.torso.position.y : (r.chest.onHead ? r.belt.y - r.head.position.y : r.belt.y);
  const br = r.belt.r;
  if (role === 'admin') {
    const cap = new T.Group(); cap.rotation.z = 0.18; top.add(cap);
    mk(cyl(0.25, 0.27, 0.2, 12), r.smooth ? Ms(u) : Mf(u), 0, 0.02, 0, cap); mk(cyl(0.277, 0.277, 0.05, 12), gold, 0, -0.04, 0, cap); mk(bx(0.24, 0.02, 0.14), Mf(0x111111), 0, -0.07, 0.26, cap);
    const bell = mk(new T.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), gold, br * 0.75, beltY - 0.02, br * 0.65, beltP); mk(sph(0.015), gold, br * 0.75, beltY + 0.06, br * 0.65, beltP);
    mk(bx(0.16, 0.07, 0.05), Mf(0x8a1c25), 0, chestY + 0.18, r.chest.z, chestP);
  }
  if (role === 'maid') {
    const band = mk(new T.TorusGeometry(0.3, 0.035, 6, 20, Math.PI), Mf(0xf4f0e6), 0, -0.02, 0, top); band.rotation.y = Math.PI / 2;
    for (let i = 0; i < 5; i++) mk(sph(0.04, 6, 4), Mf(0xf4f0e6), 0, 0.27 + Math.sin(i) * 0.01, -0.18 + i * 0.09, top);
    const apron = mk(bx(br * 1.1, 0.42, 0.03), Mf(0xf4f0e6), 0, beltY - 0.12, br * 0.95 + 0.02, beltP); apron.rotation.x = -0.12;
    mk(bx(br * 0.5, 0.12, 0.035), Mf(0xe0d8c8), 0, beltY - 0.14, br * 0.95 + 0.04, beltP);
  }
  if (role === 'tech') {
    const hh = mk(new T.SphereGeometry(0.32, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), Mf(0xf2c21a), 0, -0.04, 0, top); mk(cyl(0.38, 0.38, 0.03, 16), Mf(0xf2c21a), 0, -0.04, 0.03, top); mk(bx(0.05, 0.05, 0.4), Mf(0xd8a810), 0, 0.27, 0, top);
    const tb = mk(new T.TorusGeometry(br * 1.02, 0.04, 6, 20), Mf(0x5a3a1a), 0, beltY, 0, beltP); tb.rotation.x = Math.PI / 2;
    mk(bx(0.12, 0.16, 0.06), Mf(0x5a3a1a), -br * 0.7, beltY - 0.06, br * 0.72, beltP); mk(bx(0.03, 0.18, 0.02), Mf(0x9aa0a6), -br * 0.7, beltY + 0.05, br * 0.76, beltP);
  }
  if (role === 'guard') {
    mk(cyl(0.29, 0.27, 0.16, 14), Mf(0x1a2238), 0, 0.02, 0, top); mk(cyl(0.33, 0.33, 0.04, 14), Mf(0x1a2238), 0, 0.12, 0, top);
    const vis = mk(bx(0.32, 0.025, 0.16), Mf(0x0a0a0a), 0, -0.05, 0.3, top); vis.rotation.x = 0.2; mk(bx(0.08, 0.08, 0.02), gold, 0, 0.04, 0.29, top);
    mk(bx(0.1, 0.16, 0.06), Mf(0x141414), -0.12, chestY + 0.1, r.chest.z + 0.02, chestP); mk(cyl(0.008, 0.008, 0.2, 4), Mf(0x141414), -0.15, chestY + 0.26, r.chest.z + 0.02, chestP);
    mk(bx(0.07, 0.07, 0.02), gold, 0.12, chestY + 0.12, r.chest.z + 0.01, chestP);
  }
}
/* hand items: handle at the origin, the item extends along +y */
function makeItem(kind) {
  const g = new T.Group();
  if (kind === 'flash') { mk(cyl(0.035, 0.045, 0.24, 10), Mf(0x2a2a2e), 0, 0.08, 0, g); const lens = mk(cyl(0.05, 0.05, 0.015, 12), Bm(0xfff1cc), 0, 0.205, 0, g); g.userData.lens = lens; }
  if (kind === 'stick') { mk(cyl(0.03, 0.035, 0.8, 8), Mf(0x3a2618), 0, 0.3, 0, g); mk(cyl(0.04, 0.04, 0.12, 8), Mf(0x141414), 0, -0.04, 0, g); }
  if (kind === 'broom') { mk(cyl(0.022, 0.022, 0.95, 6), Mf(0x8a6a3a), 0, 0.35, 0, g); const br = mk(new T.ConeGeometry(0.13, 0.32, 8), Mf(0xd8b45a), 0, 0.92, 0, g); br.rotation.x = Math.PI; for (let i = 0; i < 2; i++) mk(cyl(0.06 + i * 0.02, 0.06 + i * 0.02, 0.02, 8), Mf(0x9b1f24), 0, 0.8 + i * 0.06, 0, g); }
  if (kind === 'umbrella') { mk(cyl(0.015, 0.015, 0.8, 6), Mf(0x141414), 0, 0.3, 0, g); const c = mk(new T.ConeGeometry(0.09, 0.62, 8), Mf(0x1a1a20), 0, 0.42, 0, g); c.rotation.x = Math.PI; const hook = mk(new T.TorusGeometry(0.06, 0.015, 6, 12, Math.PI), Mf(0x5a3a1a), 0.06, -0.08, 0, g); hook.rotation.z = Math.PI; }
  if (kind === 'towels') { for (let i = 0; i < 3; i++) mk(bx(0.32, 0.08, 0.24), Mf(i % 2 ? 0xefefe6 : 0xe0e8f0), 0, 0.1 + i * 0.085, 0, g); }
  if (kind === 'keys') { const ring = mk(new T.TorusGeometry(0.05, 0.01, 6, 14), Mf(0xb8b0a0), 0, 0.05, 0, g); for (let i = 0; i < 3; i++) { const k = mk(bx(0.025, 0.12, 0.01), Mf(i ? 0xc9a24a : 0x9aa0a6), Math.sin(i - 1) * 0.04, -0.03, 0, g); k.rotation.z = (i - 1) * 0.4; } mk(bx(0.07, 0.05, 0.01), Mf(0x7a1a1e), 0.05, -0.08, 0, g); }
  if (kind === 'wrench') { mk(bx(0.04, 0.32, 0.02), Mf(0x9aa0a6), 0, 0.14, 0, g); mk(bx(0.12, 0.05, 0.025), Mf(0x9aa0a6), 0, 0.31, 0, g); mk(bx(0.03, 0.06, 0.025), Mf(0x9aa0a6), 0.045, 0.34, 0, g); }
  return g;
}
/* inflate: any race becomes a smooth rubber toy with floppy parts */
const _ms = new Map();
const rubber = c => { const k = c.getHex(); let m = _ms.get(k); if (!m) { m = new T.MeshPhongMaterial({ color: k, shininess: 90, specular: 0x777777 }); _ms.set(k, m); } return m; };
function inflate(r) {
  r.g.traverse(o => {
    if (!o.isMesh) return; const g = o.geometry, pr = g.parameters || {};
    if (o.material && o.material.isMeshPhongMaterial && !o.material.map) o.material = rubber(o.material.color);
    if (g.type === 'IcosahedronGeometry') o.geometry = new T.SphereGeometry(pr.radius, 28, 20);
    else if (g.type === 'SphereGeometry') o.geometry = new T.SphereGeometry(pr.radius, 28, 20, pr.phiStart, pr.phiLength, pr.thetaStart, pr.thetaLength);
    else if (g.type === 'CylinderGeometry') { o.geometry = new T.CylinderGeometry(pr.radiusTop, pr.radiusBottom, pr.height, 20, 1, pr.openEnded); if (pr.radiusTop < 0.13) { o.scale.x *= 1.55; o.scale.z *= 1.55; } else { o.scale.x *= 1.1; o.scale.z *= 1.1; } }
    else if (g.type === 'ConeGeometry') o.geometry = new T.ConeGeometry(pr.radius, pr.height, 20);
    else if (g.type === 'TorusGeometry') o.geometry = new T.TorusGeometry(pr.radius, pr.tube, 12, 32, pr.arc);
  });
  if (r.race !== 'potato') r.head.scale.setScalar(1.22);
  r.headScale = r.race !== 'potato' ? 1.22 : 1; r.inflated = true; r.smooth = true; r.height *= 1.12;
}
/* complete hero */
function makeHero(o) {
  const r = BUILD[o.race](o.p, o.uniform);
  addRole(r, o.role, o.uniform); r.race = o.race; r.headScale = 1;
  if (o.inflated) inflate(r);
  r.hand = new T.Group(); r.hand.position.y = -r.aR.userData.len; r.aR.add(r.hand);
  r.state = { item: null, itemMesh: null, emote: null, et: 0, rag: 0, ragK: 0, talk: 0, phase: 0, spin: 0, spinV: 0, wob: 0, wobV: 0, lastMove: 'idle' };
  return r;
}
/* in the hand: the flashlight when it is out, otherwise the picked-up item, otherwise nothing */
function setHeld(r, flashOut, item) {
  const st = r.state; const show = flashOut ? 'flash' : (item || null);
  st.flashOut = flashOut; st.carry = item || null;
  if (st.item === show) return;
  if (st.itemMesh) r.hand.remove(st.itemMesh); st.item = show; st.itemMesh = null;
  if (show) { const m = makeItem(show); m.rotation.x = show === 'towels' ? 0 : Math.PI / 2; if (show === 'towels') m.position.set(0, -0.05, 0.12); st.itemMesh = m; r.hand.add(m); }
}
function emote(r, k) { r.state.emote = k; r.state.et = 0; if (k === 'fall') { r.state.rag = 3.0; } }
const EMOTE_LEN = { pick: 0.5, wave: 2.2, scream: 1.6, smile: 2.6, dance: 7.5, swing: 0.5, fall: 3.0 };
/* ---- dances: every race moves differently, 120 bpm ---- */
const BEAT = 0.5;
const ROBOT = [[-1.6, 0, 1.6, 0, 0.5, 0], [0, -1.5, -1.6, 0, -0.5, 0.4], [-1.6, -0.2, -1.6, 0.2, 0, 0], [0, -2.9, 0, 2.9, 0.3, -0.4], [-0.8, -1.2, 0.8, 1.2, -0.3, 0], [-2.8, 0, 0, 0.3, 0, 0.6]];
function DANCE(r, k, st) {
  const b = k / BEAT, s1 = Math.sin(k * Math.PI * 2 / BEAT), bounce = Math.abs(Math.sin(k * Math.PI / BEAT));
  const A = (a, x, z) => a.rotation.set(x, 0, z);
  if (r.race === 'potato') { // jumpy spin with arm flaps and squash
    r.body.position.y += bounce * 0.32; r.head.scale.set((1 + (1 - bounce) * 0.12) * (r.headScale || 1), (1 - (1 - bounce) * 0.16) * (r.headScale || 1), (1 + (1 - bounce) * 0.12) * (r.headScale || 1));
    r.body.rotation.y = Math.floor(b / 2) % 2 ? (b % 2) * Math.PI : -(b % 2) * Math.PI;
    const f = Math.abs(Math.sin(k * 14)); A(r.aL, 0, -0.4 - f * 1.3); A(r.aR, 0, 0.4 + f * 1.3);
    r.lL.rotation.x = Math.sin(k * 12) * 0.5; r.lR.rotation.x = -Math.sin(k * 12) * 0.5;
  } else if (r.race === 'noodle') { // inflatable tube man
    r.torso.rotation.set(Math.sin(k * 3.3) * 0.25, 0, Math.sin(k * 5) * 0.4);
    A(r.aL, Math.sin(k * 5) * 0.9, -1.2 - Math.sin(k * 7) * 1.3); A(r.aR, Math.sin(k * 5 + 2) * 0.9, 1.2 + Math.sin(k * 7 + 1.6) * 1.3);
    r.head.rotation.set(Math.sin(k * 4) * 0.3, 0, Math.sin(k * 6) * 0.6);
    r.lL.rotation.x = Math.sin(k * 8) * 0.35; r.lR.rotation.x = -Math.sin(k * 8) * 0.35; r.body.position.y += bounce * 0.05;
  } else if (r.race === 'mannequin') { // robot: snaps between poses on the beat
    const P = ROBOT[Math.floor(b) % ROBOT.length]; A(r.aL, P[0], P[1]); A(r.aR, P[2], P[3]); r.head.rotation.set(0, P[4], 0); r.body.rotation.y = P[5];
    const sq = Math.floor(b) % 2 ? 0.08 : 0; r.body.position.y -= sq; r.lL.rotation.x = sq * 4; r.lR.rotation.x = -sq * 4;
  } else if (r.race === 'balloon') { // floaty bounce, spinning head
    st.spinV = 12; r.body.position.y += bounce * 0.28; r.body.rotation.z = Math.sin(k * Math.PI / BEAT / 2) * 0.25;
    A(r.aL, Math.sin(k * 2) * 0.4, -1.4 - Math.sin(k * 3) * 0.8); A(r.aR, Math.sin(k * 2 + 1) * 0.4, 1.4 + Math.sin(k * 3 + 1) * 0.8);
    r.lL.rotation.set(0, 0, -bounce * 0.4); r.lR.rotation.set(0, 0, bounce * 0.4);
  } else if (r.race === 'animal') {
    const key = r.animal;
    if (key === 'cat') { // hip wiggle, jazz hands
      r.body.rotation.z = Math.sin(k * Math.PI * 2 / BEAT) * 0.14; r.body.position.x = Math.sin(k * Math.PI * 2 / BEAT) * 0.06;
      const sh = Math.sin(k * 45) * 0.12; A(r.aL, -1.7 + sh, -0.6); A(r.aR, -1.7 - sh, 0.6); r.head.rotation.z = Math.floor(b) % 2 ? 0.3 : -0.3;
      r.lL.rotation.x = Math.max(0, s1) * 0.4; r.lR.rotation.x = Math.max(0, -s1) * 0.4;
    } else if (key === 'frog') { // squat and leap
      const ph = (b % 2) / 2; const up = ph > 0.5 ? Math.sin((ph - 0.5) * 2 * Math.PI) : 0, sq = ph < 0.5 ? Math.sin(ph * 2 * Math.PI) : 0;
      r.body.position.y += up * 0.6 - sq * 0.22; r.lL.rotation.set(-sq * 0.9, 0, -0.3 - up * 0.4); r.lR.rotation.set(-sq * 0.9, 0, 0.3 + up * 0.4);
      A(r.aL, -0.3, -1.3 - up); A(r.aR, -0.3, 1.3 + up); r.head.rotation.x = -up * 0.3;
    } else if (key === 'crow') { // wing flaps and head pecks
      const fl = Math.sin(k * 16); A(r.aL, 0, -1.2 - fl * 0.9); A(r.aR, 0, 1.2 + fl * 0.9);
      r.head.rotation.x = Math.max(0, Math.sin(k * Math.PI * 2 / BEAT)) * 0.6; r.body.position.y += bounce * 0.08; r.body.rotation.y = Math.sin(k * 1.5) * 0.5;
    } else if (key === 'bear') { // side sway and clap
      r.body.position.x = Math.sin(k * Math.PI / BEAT) * 0.22; r.body.rotation.z = -Math.sin(k * Math.PI / BEAT) * 0.12;
      const c = Math.abs(Math.sin(k * Math.PI * 2 / BEAT)); A(r.aL, -1.3, -0.15 - c * 0.6); A(r.aR, -1.3, 0.15 + c * 0.6); r.head.rotation.z = Math.sin(k * Math.PI / BEAT) * 0.25;
    } else { // wolf: howl at the start of every bar, then fist pumps and stomps
      const bar = b % 4;
      if (bar < 1) { r.head.rotation.x = -0.9; A(r.aL, 0, -0.5); A(r.aR, 0, 0.5); r.body.rotation.x = -0.15; }
      else { A(r.aR, 0, 2.3 + Math.sin(k * Math.PI * 2 / BEAT) * 0.4); A(r.aL, 0.3, -0.4); r.lL.rotation.x = Math.max(0, s1) * 0.7; r.head.rotation.x = Math.max(0, s1) * 0.3; }
    }
  } else { // people: disco point
    const up = Math.floor(b) % 2 === 0; A(r.aR, up ? -0.2 : -0.7, up ? 2.5 : 0.3); A(r.aL, 0.4, -0.9);
    r.body.rotation.y = Math.sin(k * Math.PI / BEAT) * 0.35; r.body.position.y += bounce * 0.06; r.lL.rotation.x = Math.max(0, s1) * 0.35; r.lR.rotation.set(0, 0, 0.25);
    r.head.rotation.z = up ? 0.2 : -0.1;
  }
}
/* per-frame animation */
function animateHero(r, dt, move, t) {
  const st = r.state; st.phase += dt * (move === 'run' ? 11 : move === 'walk' ? 6.5 : 1.5);
  const ph = st.phase, amp = move === 'run' ? 0.95 : move === 'walk' ? 0.5 : 0;
  // base pose
  r.lL.rotation.set(Math.sin(ph) * amp, 0, 0); r.lR.rotation.set(-Math.sin(ph) * amp, 0, 0);
  r.aL.rotation.set(-Math.sin(ph) * amp * 0.9 + Math.sin(t * 1.3) * 0.04, 0, r.aL.userData.rz || 0); r.aR.rotation.set(Math.sin(ph) * amp * 0.9 + Math.sin(t * 1.4) * 0.04, 0, r.aR.userData.rz || 0);
  r.body.rotation.set(move === 'run' ? 0.22 : 0, 0, 0); r.body.position.set(0, (move !== 'idle' ? Math.abs(Math.cos(ph)) * (r.bounce ? 0.14 : 0.05) : Math.sin(t * 2) * 0.008), 0);
  r.head.rotation.set(0, 0, Math.sin(t * 0.8) * 0.04); r.head.scale.setScalar(r.headScale || 1);
  if (r.sway) r.torso.rotation.set(0, 0, Math.sin(ph * (move === 'idle' ? 0.6 : 0.5)) * (move === 'idle' ? 0.05 : 0.14));
  // holding something: the right arm points forward
  if (st.item) { r.aR.rotation.x = -0.75 + Math.sin(ph) * amp * 0.2; r.aR.rotation.z = (r.aR.userData.rz || 0) * 0.3; }
  // balloon head: spins while running, wobbles on a spring otherwise
  if (r.wobble) {
    if (move === 'run') st.spinV = Math.min(14, st.spinV + dt * 20); else st.spinV *= Math.pow(0.04, dt);
    st.spin += st.spinV * dt; if (move !== 'run') st.spin += (Math.round(st.spin / (Math.PI * 2)) * Math.PI * 2 - st.spin) * Math.min(1, dt * 3);
    const target = move === 'walk' ? Math.sin(ph) * 0.18 : 0; st.wobV += ((target - st.wob) * 60 - st.wobV * 4) * dt; st.wob += st.wobV * dt;
    r.spring.rotation.set(move === 'run' ? -0.3 : 0, st.spin, st.wob);
  }
  // talking
  const talk = st.talk;
  if (r.mouth) { const b = r.mouth.userData.base || new T.Vector3(1, 1, 1); if (r.mouth.userData.beak) r.mouth.rotation.x = Math.PI / 2 + talk * 0.5; else r.mouth.scale.set(b.x * (1 + talk * 0.3), b.y * (1 + talk * 4), b.z); }
  else r.head.rotation.x = -talk * 0.15;
  // emotes
  if (st.emote) {
    st.et += dt; const e = st.emote, k = st.et;
    if (e === 'pick') { const q = Math.sin(Math.min(1, k / 0.5) * Math.PI); r.aR.rotation.set(-1.3 * q, 0, 0); r.body.rotation.x = 0.25 * q; }
    if (e === 'wave') { r.aR.rotation.set(0, 0, 2.5 + Math.sin(k * 12) * 0.35); r.head.rotation.z = 0.12; }
    if (e === 'scream') { const sh = Math.sin(k * 60) * 0.06; r.aL.rotation.set(0, 0, -2.7 + sh); r.aR.rotation.set(0, 0, 2.7 - sh); r.body.position.x = sh * 0.5; r.head.rotation.x = -0.25; if (r.mouth) { const b = r.mouth.userData.base || new T.Vector3(1, 1, 1); if (r.mouth.userData.beak) r.mouth.rotation.x = Math.PI / 2 + 0.7; else r.mouth.scale.set(b.x * 1.4, b.y * 7, b.z); } }
    if (e === 'smile') { if (r.mouth && !r.mouth.userData.beak) { const b = r.mouth.userData.base || new T.Vector3(1, 1, 1); r.mouth.scale.set(b.x * 1.9, b.y * 1.6, b.z); } r.head.rotation.z = Math.sin(k * 3) * 0.15; r.body.position.y += Math.abs(Math.sin(k * 6)) * 0.03; }
    if (e === 'dance') DANCE(r, k, st);
    if (e === 'swing') { const s = k < 0.18 ? -2.6 * (k / 0.18) : -2.6 + (k - 0.18) / 0.32 * 3.4; r.aR.rotation.set(s, 0, 0); r.body.rotation.y = k < 0.18 ? 0.2 : -0.25; }
    if (k >= EMOTE_LEN[e]) st.emote = null;
  }
  // inflated: head and arms hang on springs — they lag behind turns, steps and stops, swinging left-right
  if (r.inflated) {
    const yaw = r.g.rotation.y, yv = st.py == null ? 0 : (yaw - st.py) / Math.max(dt, 1e-3); st.py = yaw;
    const ya = yv - (st.pyv || 0); st.pyv = yv;
    const mv = move === 'run' ? 2 : move === 'walk' ? 1 : 0, ch = mv - (st.pmv || 0); st.pmv = mv;
    st.wz = st.wz || 0; st.wzV = st.wzV || 0; st.wx = st.wx || 0; st.wxV = st.wxV || 0;
    st.wzV += -ya * 0.35 + Math.cos(st.phase) * dt * (mv === 2 ? 34 : mv === 1 ? 16 : 0);
    st.wxV += -ch * 2.2 + (mv ? Math.sin(st.phase * 2) * dt * 10 : 0);
    st.wzV += (-st.wz * 55 - st.wzV * 2.2) * dt; st.wxV += (-st.wx * 55 - st.wxV * 2.2) * dt;
    st.wz = clamp(st.wz + st.wzV * dt, -0.85, 0.85); st.wx = clamp(st.wx + st.wxV * dt, -0.7, 0.7);
    r.head.rotation.z += st.wz; r.head.rotation.x += st.wx;
    r.aL.rotation.z += st.wz * 0.9 - Math.abs(st.wx) * 0.4; r.aR.rotation.z += st.wz * 0.9 + Math.abs(st.wx) * 0.4; r.aL.rotation.x += st.wx * 0.7; r.aR.rotation.x += st.wx * 0.7;
    if (r.torso) r.torso.rotation.z += st.wz * 0.4;
  }
  // ragdoll: flop on the back, then get up
  if (st.rag > 0) {
    st.rag -= dt; const down = st.rag > 0.55; st.ragK += ((down ? 1 : 0) - st.ragK) * Math.min(1, dt * (down ? 9 : 5));
    const k = st.ragK, fl = Math.sin(t * 9) * 0.2 * (down && st.rag > 2.4 ? 1 : 0.2);
    r.g.rotation.x = -Math.PI / 2 * k; r.g.position.y = k * 0.25 * (r.bounce ? 2 : 1);
    r.lL.rotation.set(-0.4 * k, 0, -0.5 * k + fl); r.lR.rotation.set(-0.2 * k, 0, 0.6 * k - fl); r.aL.rotation.set(0.3 * k, 0, -1.9 * k + fl); r.aR.rotation.set(-0.2 * k, 0, 1.7 * k - fl); r.head.rotation.set(0.3 * k, 0, 0.4 * k);
    if (st.rag <= 0) { st.rag = 0; r.g.rotation.x = 0; r.g.position.y = 0; }
  }
}


/* dance beat: 7.5 s, a different groove per race; plays into the given audio node */
let NB = null;
function music(ctx, dest, race) {
  if (!ctx) return;
  if (!NB) { NB = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = NB.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t0 = ctx.currentTime + 0.05, out = ctx.createGain(); out.gain.value = 0.45; out.connect(dest);
  const GROOVE = { potato: [55, 55, 65, 49], noodle: [49, 58, 65, 73], animal: [41, 41, 49, 55], mannequin: [55, 55, 55, 82], people: [55, 65, 73, 65] }[race] || [55, 65, 49, 55];
  const tone = (type, f, t, dur, vol, fEnd) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02); };
  const nz = (t, v, type, freq, dur) => { const n = ctx.createBufferSource(); n.buffer = NB; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); n.connect(f); f.connect(g); g.connect(out); n.start(t); n.stop(t + dur + 0.01); };
  for (let i = 0; i < 15; i++) {
    const t = t0 + i * BEAT; tone('sine', 140, t, 0.22, 0.6, 42); nz(t + BEAT / 2, 0.18, 'highpass', 7000, 0.05);
    if (race === 'mannequin') tone('square', 880, t + BEAT * 0.75, 0.05, 0.04);
    if (i % 2) nz(t, 0.25, 'bandpass', 1800, 0.14);
    const root = GROOVE[Math.floor(i / 4) % 4]; tone('sawtooth', root, t, BEAT * 0.45, 0.09); tone('sawtooth', root * 2, t + BEAT / 2, BEAT * 0.3, 0.05);
  }
}
function setPadTexture(t) { padTexture = t; }
function migrate(c) {
  if (!c) return null;
  if (c.race && RACES[c.race]) { if (!ROLES[c.role]) c.role = 'admin'; if (!c.p) c.p = defaults(c.race); return c; }
  if (c.race === 'balloon') return { name: c.name || 'Новенький', race: 'potato', role: ROLES[c.role] ? c.role : 'admin', uniform: c.uniform || UNI[0], inflated: true, p: defaults('potato') };
  // old format (people with skin/hair) -> people
  return { name: c.name || 'Новенький', race: 'people', role: 'admin', uniform: c.uniform || UNI[0], inflated: false, p: { skin: c.skin || SKINS[1], hair: c.hairStyle || 'Короткие', hairC: c.hairColor || HAIRC[0], eyes: c.eyes || 'Обычные' } };
}
function randomHero(name) { const race = pick(Object.keys(RACES).filter(r => r !== 'people')); return { name: name || 'Новенький', race, role: pick(Object.keys(ROLES)), uniform: pick(UNI), inflated: Math.random() < 0.3, p: randomParams(race) }; }
function palmColor(r) { return r.palm; }
return { RACES, ROLES, UNI, FUR, makeHero, setHeld, makeItem, emote, animateHero, defaults, randomParams, music, setPadTexture, migrate, randomHero, faceTexture, EMOTE_LEN, palmColor };
})();
