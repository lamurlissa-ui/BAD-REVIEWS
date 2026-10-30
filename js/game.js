/* BAD REVIEWS — game: screens, player, events, host simulation, guests, tasks, monster, scares */
'use strict';
(async () => {
if (!T) { $('#loading').textContent = 'Не удалось загрузить 3D-движок. Обнови страницу.'; return; }
Net.local = /[?&]local\b/.test(location.search);
try {
  await Promise.race([Promise.all([document.fonts.load('900 64px Unbounded', 'ОТЕЛЬ УЮТ★'), document.fonts.load('400 32px "PT Mono"', 'ПРАВИЛА'), document.fonts.load('700 32px Caveat', 'НЕ ВЕРЬ')]), new Promise(r => setTimeout(r, 3000))]);
} catch (e) {}

/* ---------- renderer ---------- */
const canvas = $('#gl');
const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight, false);
maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
buildTextures();

/* ---------- character profile ---------- */
const NAMES = ['Новенький', 'Лиса', 'Гоша', 'Тоня', 'Сеня', 'Мира', 'Жора', 'Ника'];
const randomChar = () => ({ name: pick(NAMES), skin: pick(OPT.skin), hairColor: pick(OPT.hairColor), uniform: pick(OPT.uniform), hairStyle: pick(OPT.hairStyle), hat: pick(OPT.hat), eyes: pick(OPT.eyes) });
let C = null;
try { const s = localStorage.getItem('br-char'); if (s) C = JSON.parse(s); } catch (e) {}
if (!C || !C.name) C = randomChar();
const saveChar = () => { try { localStorage.setItem('br-char', JSON.stringify(C)); } catch (e) {} };

/* ---------- campaign save ---------- */
const SAVE_KEY = 'bad-reviews-save-v2';
const CLIENT_SESSION_KEY = 'bad-reviews-client-v1';
const SAVE_VERSION = 2;
const freshCampaign = mode => ({ version: SAVE_VERSION, mode, stage: 'ready', night: 1, completedNights: [], rating: 1.2, reviews: 318, money: 0, short: false, checkpoint: null, lastResult: null, updatedAt: Date.now() });
function readCampaign() {
  try {
    const x = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    return x && x.version === SAVE_VERSION && x.night >= 1 ? x : null;
  } catch (e) { return null; }
}
let campaign = readCampaign();
let clientSession = (() => { try { return JSON.parse(localStorage.getItem(CLIENT_SESSION_KEY) || 'null'); } catch (e) { return null; } })();
const clientToken = () => { try { let t = localStorage.getItem('bad-reviews-player-token'); if (!t) { t = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now(); localStorage.setItem('bad-reviews-player-token', t); } return t; } catch (e) { return Math.random().toString(36).slice(2); } };
function writeClientSession(pose) {
  if (Net.mode !== 'client' || !Net.code) return;
  clientSession = { code: Net.code, token: clientToken(), char: C, pose: pose || (S === 'play' ? myPose() : null), updatedAt: Date.now() };
  try { localStorage.setItem(CLIENT_SESSION_KEY, JSON.stringify(clientSession)); } catch (e) {}
  refreshMenuSave();
}
function clearClientSession() { clientSession = null; try { localStorage.removeItem(CLIENT_SESSION_KEY); } catch (e) {} refreshMenuSave(); }
let CURRENT_NIGHT = campaign ? campaign.night : 1;
let currentRating = campaign ? campaign.rating : 1.2;
let currentReviews = campaign ? campaign.reviews : 318;
let resumePending = false;
function writeCampaign() {
  if (!campaign || !Net.isHost) return;
  campaign.updatedAt = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(campaign)); } catch (e) { console.warn('Не удалось сохранить смену', e); }
  refreshMenuSave();
}
function clearCampaign() { campaign = null; try { localStorage.removeItem(SAVE_KEY); } catch (e) {} refreshMenuSave(); }
const ratingText = n => Number(n || 1.2).toFixed(2).replace('.', ',');
function refreshMenuSave() {
  const has = !!campaign;
  $('#bContinue').hidden = !has;
  $('#bContinue').textContent = campaign && campaign.stage === 'complete' ? 'Посмотреть итоги' : 'Продолжить';
  $('#saveNote').hidden = !has;
  $('#bReconnect').hidden = !clientSession;
  if (clientSession) $('#bReconnect').textContent = `Вернуться в комнату ${clientSession.code}`;
  if (!has) {
    $('#menuEyebrow').textContent = 'Кооперативный хоррор · ночь 1';
    $('#menuRating').textContent = '1,20';
    $('#demoNote').textContent = 'Ночь 1 · 1–5 игроков';
    return;
  }
  const inShift = campaign.stage === 'play' && campaign.checkpoint;
  $('#menuEyebrow').textContent = `Кооперативный хоррор · ночь ${campaign.night}`;
  $('#menuRating').textContent = ratingText(campaign.rating);
  $('#demoNote').textContent = `Ночь ${campaign.night} · 1–5 игроков`;
  $('#saveNote').textContent = inShift
    ? `Сохранение: ночь ${campaign.night}, ${campaign.checkpoint.clock || 'до полуночи'} · ${ratingText(campaign.rating)} ★`
    : campaign.stage === 'complete'
      ? `Ночь 1 пройдена · ${ratingText(campaign.rating)} ★ · продолжение в разработке`
      : `Сохранение готово · ночь ${campaign.night} · ${ratingText(campaign.rating)} ★`;
}

/* ================= STATE ================= */
let S = 'loading', SEED = 1, NIGHT_LEN = 840, worldBuilt = false;
let G = null; const Hs = {}; // G = shared state (same on every client), Hs = host-only
let players = {}; // id -> {id,name,char,idx}
const avatars = {}, npcs = {};
const P = { x: 0, z: 0, feet: 0, vy: 0 };
let SIT = null;
let yaw = 0, pitch = 0, crouch = false, flashOn = true, item = null, locked = false, myIdx = 0;
let gameTime = 0, timers = [], anims = [];
function later(s, fn) { timers.push({ t: gameTime + s, fn }); }
function anim(dur, fn, done) { anims.push({ t: 0, dur, fn, done }); }
function runTimers() { const due = timers.filter(t => gameTime >= t.t); timers = timers.filter(t => gameTime < t.t); due.forEach(t => t.fn()); }
function runAnims(dt) { for (let i = anims.length - 1; i >= 0; i--) { const a = anims[i]; a.t += dt; const k = Math.min(1, a.t / a.dur); a.fn(k); if (k >= 1) { anims.splice(i, 1); a.done && a.done(); } } }
function freshG() { return { started: false, phase: 'arrive', power: false, slammed: false, phone: 'idle', clockOn: false, clock: 0, money: 0, mkey: null, guests: {}, tasks: {}, corrDark: { 1: false, 2: false }, monster: false, monMode: 'roam', deskUser: null, outLights: true }; }
G = freshG();

/* ---------- UI helpers ---------- */
function show(id, on) { $(id).hidden = !on; }
function fade(to, ms = 900) { return new Promise(r => { const f = $('#fade'); f.style.transitionDuration = (reduced ? 200 : ms) + 'ms'; requestAnimationFrame(() => { f.style.opacity = to; setTimeout(r, (reduced ? 200 : ms) + 40); }); }); }
let toastTimer = 0;
function toast(t, sec = 4) { const el = $('#toast'); el.hidden = true; void el.offsetWidth; el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, sec * 1000); }
window.toast = toast;
let lastObj = '';
function setObjective(t) { if (t === lastObj) return; lastObj = t; const el = $('#objText'); el.textContent = t; el.classList.remove('new'); void el.offsetWidth; el.classList.add('new'); }
let subTimer = 0, subQueue = [], subBusy = false;
function typeSub(who, text, cb, nav) {
  clearTimeout(subTimer); show('#sub', true); $('#subWho').textContent = who; const el = $('#subText'); let n = 0;
  const step = () => { n++; el.textContent = text.slice(0, n); if (n % 2 === 0 && who) sfx.blip(nav); if (n < text.length) subTimer = setTimeout(step, 28); else cb && cb(); };
  step();
}
function hideSub() { clearTimeout(subTimer); show('#sub', false); }
function dialogue(lines, done) {
  let i = 0; subBusy = true;
  const next = () => { if (i >= lines.length) { hideSub(); subBusy = false; done && done(); return; } const [who, text, hold] = lines[i++]; typeSub(who, text, () => { subTimer = setTimeout(next, (hold || 1.6) * 1000); }); };
  next();
}
const pulseVig = (c = 'rgba(120,0,10,.55)') => { const v = $('#vig'); v.style.boxShadow = `inset 0 0 160px ${c}`; setTimeout(() => v.style.boxShadow = 'inset 0 0 160px rgba(120,0,10,0)', 700); };
const nameOf = id => (players[id] && players[id].name) || 'Кто-то';
const fmtClock = f => { const m = Math.floor(clamp(f, 0, 1) * 420); const hh = (23 + Math.floor(m / 60)) % 24, mm = m % 60; return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); };

/* ================= GUEST TYPES ================= */
const GTYPES = {
  wet: { name: 'Вера Ундинова', year: 1902, says: 'Добрый вечер. С дороги так хочется полежать в воде.', look: 'С пальто капает. Под ней уже лужа.', purpose: 'Отдохнуть. Я долго была на дне… рождения.', wish: 'Ванну. Обязательно ванну, не душ.', need: r => r.bath === 'ванна',
    char: { skin: 0x9fb8c0, uniform: 0x2f4f5f, hairStyle: 'Каре', hairColor: 0x1f3a3a, hat: 'Нет', eyes: 'Сонные', vest: false },
    good: 'Ванна — чудо. Пролежала в ней всю ночь, не дыша.', bad: 'Ванны нет. Пришлось лечь в раковину.', complaint: 'Гостья жалуется: «Где вода?!» С потолка коридора закапало.' },
  quiet: { name: 'Тихон Безмолвнов', year: 1931, says: '…Добрый вечер. Пожалуйста, тише.', look: 'Вздрагивает каждый раз, когда звенит звонок.', purpose: 'Выспаться. Сто лет не спал.', wish: 'Повыше. И чтобы мимо никто не ходил — подальше от лестницы.', need: r => r.floor === 3 && r.far,
    char: { skin: 0xe8dccc, uniform: 0x4a4a52, hairStyle: 'Без волос', hairColor: 0, hat: 'Котелок', eyes: 'Сонные', vest: false },
    good: 'Тихо, высоко, никто не ходит. Впервые за сто лет выспался.', bad: 'Всю ночь кто-то ходил. Я пожаловался — теперь ходит громче.', complaint: 'Тихий постоялец пожаловался на шум. Жалоба кого-то разбудила в подвале.' },
  moth: { name: 'Феликс Лампадов', year: 1968, says: 'Свет у вас… яркий. Красивый.', look: 'Над ним мигает лампа. Вокруг кружат мотыльки.', purpose: 'Проездом. Лечу на юг.', wish: 'Без окон, пожалуйста. Там фонари, я не удержусь.', need: r => !r.window,
    char: { skin: 0xd8d0b8, uniform: 0x6a5a3a, hairStyle: 'Ирокез', hairColor: 0x8a7a5a, hat: 'Нет', eyes: 'Круглые', vest: false }, moths: true,
    good: 'Темно и уютно. Ни одной лампы. Прилечу ещё.', bad: 'Фонарь за окном светил прямо в душу. Пришлось съесть все лампы на этаже.', complaint: 'Гость из-за окна не спит. На его этаже лопнули все лампы.' },
  business: { name: 'Семёнов Р. А.', year: 1956, says: 'Мне как в прошлый раз. Вы должны помнить.', look: 'Портфель в пыли. Галстук завязан очень старомодно.', purpose: 'Командировка. Отчёт сдать.', wish: 'Тот же номер, что и тогда. Посмотрите в архиве.', need: (r, g) => r.num === g.archiveRoom,
    char: { skin: 0xc9b8a0, uniform: 0x2a2a32, hairStyle: 'Короткие', hairColor: 0x9a9a9a, hat: 'Нет', eyes: 'Обычные', vest: true, briefcase: true },
    good: 'Тот же номер, что в 1979-м. Даже пятно на ковре моё.', bad: 'Номер не тот. Отчёт не сдан. Я вернусь.', complaint: 'Командировочный ищет «свой» номер. Ходит по этажу и стучит во все двери.' },
  twins: { name: 'Близнецов (×3)', year: 1977, says: 'Нам один номер. Нам один номер. Нам один номер.', look: 'Моргают по очереди. Бронь на одного человека.', purpose: 'Мы вместе. Всегда.', wish: 'Две кровати. Мы не толстые.', need: r => r.beds === 2,
    char: { skin: 0xe0c8a8, uniform: 0x7a5a2a, hairStyle: 'Короткие', hairColor: 0x5a3a22, hat: 'Нет', eyes: 'Круглые', vest: false }, triple: true,
    good: 'Две кровати на троих — как раз. Спасибо. Спасибо. Спасибо.', bad: 'Одна кровать на троих. Мы теперь не разговариваем.', complaint: 'Близнецам тесно. В холле их стало больше.' },
  normal: { name: 'Анна Иванова', year: 1988, says: 'Здравствуйте! Бронь на Иванову, на одну ночь.', look: 'Ничего странного. Совсем. Это и настораживает.', purpose: 'Свадьба подруги, тут недалеко.', wish: 'С окном, если можно. Люблю утром смотреть на лес.', need: r => r.window,
    char: { skin: 0xf0d0b0, uniform: 0x8a3a4a, hairStyle: 'Пучок', hairColor: 0x5a3a22, hat: 'Нет', eyes: 'Обычные', vest: false },
    good: 'Окно, лес, вежливый персонал. Подозрительно хорошо.', bad: 'Без окна. Как в гробу. Ой.', complaint: 'Анна Иванова пишет жалобу. Длинную.' },
};
const LORE = [
  'Администратор, смена 1979. Гость из 2-го этажа опять просил «как в прошлый раз». Какой прошлый раз? Он ещё не выезжал.',
  'Если на лестнице кто-то сидит — не здоровайся. Просто иди мимо.',
  'Лифт стучит трижды. Я открыл один раз. Не открывайте.',
  'Нас было четверо. Утром в журнале смены было записано пятеро.',
  'Отзыв гостя из 312: «Номер уютный, персонал вежливый, выхода нет». Поставил пять звёзд. Он всё ещё здесь.',
  'Тринадцатый этаж есть. Просто лестница не всегда помнит, что его надо пропускать.',
  'Управляющего никто не видел. Только записки и телефон.',
  'Печенье в холодильнике — правда не печенье.',
  'Журнал «Гостеприимство», апрель 1987: «„Уют“: пять звёзд, ноль жалоб». Статья на стр. 13 вырвана. Жалоб и правда не было. Жаловаться было некому.',
  'Табло над лифтом показывает этаж. Лифт стоит. Табло показывает 5, потом 13, потом прочерк. Тринадцатого этажа нет — это написано в правилах. Кнопка 13 в лифте перечёркнута, но иногда горит.',
  'На панели лифта есть кнопка вызова ремонтника. Ремонтник отвечает. Мы не вызывали ремонтника с 1987 года.',
  'Кроссворд на журнальном столике заполнен почерком управляющего. Все слова — один и тот же: ПОСТОЯЛЕЦ. Последняя клетка — не вписана. Её оставили для вас.',
];
let ARCHIVE = [];
function buildArchive(seed) {
  const r = mulberry32(seed + 99), pk = a => a[Math.floor(r() * a.length)];
  const fam = ['Кротов', 'Лебедева', 'Осипов', 'Гуськова', 'Петров', 'Зайцева', 'Мухин', 'Сорокина', 'Ершов', 'Белкина'];
  const nums = rooms.map(x => x.num);
  const list = [];
  for (let i = 0; i < 9; i++) list.push({ year: 1961 + Math.floor(r() * 38), name: pk(fam) + ' ' + 'АБВГДЕИКЛМНОП'[Math.floor(r() * 13)] + '.', room: pk(nums) });
  const busRoom = pk(nums); list.push({ year: 1979, name: 'Семёнов Р. А.', room: busRoom });
  list.sort((a, b) => a.year - b.year);
  ARCHIVE = list; return busRoom;
}
function assignLoot(seed) {
  const r = mulberry32(seed + 3); let lore = 0;
  for (const id of Object.keys(containers).sort()) {
    const c = containers[id], x = r();
    if (x < 0.42) c.loot = { kind: 'money', v: 50 + Math.floor(r() * 26) * 10 };
    else if (x < 0.62) c.loot = { kind: 'note', i: (lore++) % LORE.length };
    else if (x < 0.72) c.loot = { kind: 'scare' };
    else c.loot = { kind: 'empty' };
  }
}

/* ================= WORLD (re)build ================= */
function resetWorld() {
  VLIST.length = 0; colliders.length = 0; surfaces.length = 0; rayTargets.length = 0; rooms.length = 0;
  for (const k in doors) delete doors[k]; for (const k in containers) delete containers[k]; for (const k in WPN) delete WPN[k];
  for (const k in avatars) delete avatars[k]; for (const k in npcs) delete npcs[k];
}
let hand, lensMat, flash, remoteFlashes = [], roomPool = [], lightPool = [];
const _vp = new T.Vector3();
function assignPool() {
  const cp = cam.position; const act = VLIST.filter(v => v.intensity > 0.01);
  act.forEach(v => { const dy = Math.abs(v.position.y - cp.y); v._d = v.position.distanceTo(cp) + (dy > 2.6 ? 25 : 0) - v.intensity * 2; });
  act.sort((a, b) => a._d - b._d);
  lightPool.forEach((l, i) => { const v = act[i]; if (!v) { l.intensity = 0; return; } l.position.copy(v.position); l.color.copy(v.color); l.intensity = v.intensity; l.distance = v.distance; l.decay = v.decay; });
}
function setupWorld(seed) {
  resetWorld(); buildWorld(seed); worldBuilt = true;
  Held.reset();   hand = new T.Group(); hand.position.set(0.3, -0.3, -0.5); cam.add(hand); hand.visible = false;
  lensMat = B(0xfff1cc);
  flash = new T.SpotLight(0xfff0d8, 0, 22, 0.45, 0.55, 1.3); flash.position.set(0.3, -0.27, -0.66); cam.add(flash); flash.target.position.set(0.1, -0.15, -6); cam.add(flash.target);
  remoteFlashes = [0, 1].map(() => { const s = new T.SpotLight(0xfff0d8, 0, 18, 0.45, 0.55, 1.3); world.add(s); world.add(s.target); return s; });
  roomPool = [0, 1].map(() => VPoint(0xffd9a0, 0, 8, 1.5));
  lightPool = [0, 1, 2, 3, 4, 5].map(() => { const l = new T.PointLight(0xffffff, 0, 10, 1.5); world.add(l); return l; });
  assignLoot(seed);
  // a couple of empty rooms are left unlocked for exploring
  const r = mulberry32(seed + 11); rooms.forEach(rm => { if (r() < 0.3) { rm.unlocked = true; } });
  car0Collider = null;
}
function buildHand() {
  while (hand.children.length) hand.remove(hand.children[0]);
  const sl = new T.Mesh(cyl(0.06, 0.07, 0.34, 7), M(C.uniform)); sl.rotation.x = Math.PI / 2; sl.position.set(0.02, -0.04, 0.2); hand.add(sl);
  hand.add(new T.Mesh(sph(0.055, 8, 6), M(C.skin)));
  const tr = new T.Mesh(cyl(0.03, 0.04, 0.2, 10), M(0x2a2a2e)); tr.rotation.x = Math.PI / 2; tr.position.set(0, 0.03, -0.06); hand.add(tr);
  const ln = new T.Mesh(cyl(0.042, 0.042, 0.01, 12), lensMat); ln.rotation.x = Math.PI / 2; ln.position.set(0, 0.03, -0.165); hand.add(ln);
}

/* ================= CREATOR ================= */
const cScene = new T.Scene(); cScene.background = new T.Color(0x0e0c10); cScene.fog = new T.Fog(0x0e0c10, 7, 16);
const cCam = new T.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 60);
cScene.add(new T.HemisphereLight(0x8a8090, 0x1a1010, 0.55));
{ const s = new T.SpotLight(0xffd7a0, 2.2, 14, 0.55, 0.6, 1); s.position.set(1.6, 4.6, 3.2); cScene.add(s, s.target); s.target.position.set(0, 1, 0);
  const rim = new T.PointLight(0xff3d55, 1.4, 8, 1.2); rim.position.set(-2, 2.2, -1.6); cScene.add(rim);
  const ped = new T.Mesh(cyl(1.1, 1.15, 0.1, 28), M(0x5b1b20)); ped.position.y = 0.05; cScene.add(ped);
  const bg = new T.Mesh(new T.PlaneGeometry(14, 7), M(0xffffff, { map: repTex(TX.wallLobby, 8, 4) })); bg.position.set(0, 3.4, -3); cScene.add(bg);
  const fl = new T.Mesh(new T.PlaneGeometry(30, 30), M(0x1c1012)); fl.rotation.x = -Math.PI / 2; cScene.add(fl); }
let cChar = null, cRot = 0.4, cDrag = null, creatorMode = 'solo';
function rebuildChar() { if (cChar) cScene.remove(cChar); cChar = makeCharacter(C); cChar.position.y = 0.1; cChar.rotation.y = cRot; cScene.add(cChar); }
function frameCreator() { cCam.aspect = innerWidth / innerHeight; if (innerWidth > 900) { cCam.position.set(1.15, 1.35, 4.8); cCam.lookAt(1.15, 1.05, 0); } else { cCam.position.set(0, 1.15, 7.2); cCam.lookAt(0, -0.1, 0); } cCam.updateProjectionMatrix(); }
function buildOptions() {
  const sw = (id, key, list) => { const el = $(id); el.innerHTML = ''; list.forEach(c => { const b = document.createElement('button'); b.type = 'button'; b.className = 'sw'; b.style.background = '#' + c.toString(16).padStart(6, '0'); b.setAttribute('aria-label', key); b.setAttribute('aria-pressed', String(C[key] === c)); b.onclick = () => { C[key] = c; sfx.ui(); buildOptions(); rebuildChar(); }; el.appendChild(b); }); };
  const ch = (id, key, list) => { const el = $(id); el.innerHTML = ''; list.forEach(v => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = v; b.setAttribute('aria-pressed', String(C[key] === v)); b.onclick = () => { C[key] = v; sfx.ui(); buildOptions(); rebuildChar(); }; el.appendChild(b); }); };
  sw('#optSkin', 'skin', OPT.skin); sw('#optHairColor', 'hairColor', OPT.hairColor); sw('#optUni', 'uniform', OPT.uniform);
  ch('#optHair', 'hairStyle', OPT.hairStyle); ch('#optHat', 'hat', OPT.hat); ch('#optEyes', 'eyes', OPT.eyes);
  $('#cName').value = C.name;
}
$('#cName').addEventListener('input', e => { C.name = e.target.value.trim().slice(0, 14) || 'Новенький'; clearTimeout(buildOptions.t); buildOptions.t = setTimeout(rebuildChar, 250); });
$('#bRand').onclick = () => { const n = C.name; C = randomChar(); C.name = n; sfx.ui(); buildOptions(); rebuildChar(); };
canvas.addEventListener('pointerdown', e => { if (S === 'creator') cDrag = e.clientX; });
addEventListener('pointermove', e => { if (S === 'creator' && cDrag != null) { cRot += (e.clientX - cDrag) * 0.012; cDrag = e.clientX; } });
addEventListener('pointerup', () => { cDrag = null; });
async function goCreator(mode) {
  aInit(); setAmb('wind', 0.12); sfx.ui(); creatorMode = mode;
  $('#bSign').textContent = mode === 'join' ? 'Подписать и войти' : mode === 'host' ? 'Подписать и создать' : 'Подписать';
  await fade(1, 400); show('#menu', false); buildOptions(); rebuildChar(); frameCreator(); show('#creator', true); S = 'creator'; fade(0, 400);
}
$('#cForm').addEventListener('submit', e => {
  e.preventDefault(); C.name = ($('#cName').value.trim() || 'Новенький').slice(0, 14); saveChar();
  $('#stamp').classList.add('on'); sfx.stamp();
  setTimeout(async () => { await fade(1, 500); show('#creator', false); $('#stamp').classList.remove('on'); enterLobby(creatorMode); fade(0, 400); }, 700);
});

/* ================= MENU / LOBBY ================= */
const menuMsg = t => { const m = $('#menuMsg'); m.textContent = t || ''; m.hidden = !t; };
$('#bHow').onclick = () => { const h = $('#how'); h.hidden = !h.hidden; $('#bHow').setAttribute('aria-expanded', String(!h.hidden)); };
function confirmNewCampaign(mode) {
  if (campaign && !confirm('Начать новую кампанию? Текущее сохранение будет заменено.')) return false;
  campaign = freshCampaign(mode); resumePending = false; writeCampaign(); return true;
}
$('#bSolo').onclick = () => { if (confirmNewCampaign('solo')) goCreator('solo'); };
$('#bHost').onclick = () => {
  if (!Net.local && !netAvailable()) { menuMsg('Сетевая игра здесь недоступна. Открой игру на её сайте (GitHub Pages).'); return; }
  if (confirmNewCampaign('host')) goCreator('host');
};
$('#bJoin').onclick = () => { const c = $('#joinCode').value.trim(); if (c.length < 4) { menuMsg('Введи код из четырёх букв.'); return; } if (!Net.local && !netAvailable()) { menuMsg('Сетевая игра здесь недоступна. Открой игру на её сайте (GitHub Pages).'); return; } goCreator('join'); };
$('#bContinue').onclick = async () => {
  if (!campaign) return;
  aInit(); resumePending = true; C = campaign.character || C; saveChar();
  await fade(1, 350); show('#menu', false);
  if (campaign.stage === 'complete' && campaign.lastResult) {
    Net.mode = campaign.mode === 'host' ? 'host' : 'solo';
    showMorning(campaign.lastResult, true); fade(0, 350); return;
  }
  if (campaign.mode === 'host') enterLobby('host');
  else {
    Net.mode = 'solo'; Net.id = 'solo'; players = { solo: { id: 'solo', name: C.name, char: C, idx: 0 } };
    startGame(campaignConfig());
  }
  fade(0, 350);
};
$('#bReconnect').onclick = async () => {
  if (!clientSession) return;
  C = clientSession.char || C; saveChar(); $('#joinCode').value = clientSession.code;
  aInit(); await fade(1, 300); show('#menu', false); enterLobby('join'); fade(0, 300);
};
$('#joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('#bJoin').click(); });
function rosterList() { return Object.values(players).sort((a, b) => a.idx - b.idx); }
function renderLobby() {
  const ul = $('#lobbyList'); ul.innerHTML = '';
  rosterList().forEach(p => { const li = document.createElement('li'); li.innerHTML = `${esc(p.name)} <span>${p.id === Net.id ? 'это ты' : ''}${p.idx === 0 && Net.mode !== 'solo' ? ' · хост' : ''}</span>`; ul.appendChild(li); });
}
function enterLobby(mode) {
  S = 'lobby'; show('#lobby', true); $('#lobbyMsg').textContent = '';
  $('#bStart').hidden = mode === 'join'; $('#shortWrap').hidden = mode === 'join';
  $('#micBox').parentElement.hidden = mode === 'solo';
  if (mode === 'solo') {
    Net.mode = 'solo'; Net.id = 'solo'; players = { solo: { id: 'solo', name: C.name, char: C, idx: 0 } };
    $('#lobbyEyebrow').textContent = 'Одиночная смена'; $('#lobbyCode').textContent = 'СОЛО'; renderLobby(); return;
  }
  if (mode === 'host') {
    $('#lobbyEyebrow').textContent = 'Создаём комнату…'; $('#lobbyCode').textContent = '····'; $('#bStart').disabled = true;
    netHost((err, code) => {
      if (err) { $('#lobbyMsg').textContent = netErrorText(err); return; }
      $('#lobbyEyebrow').textContent = 'Код комнаты — продиктуй друзьям'; $('#lobbyCode').textContent = code; $('#bStart').disabled = false;
      if (campaign) { campaign.roomCode = code; writeCampaign(); }
      players = { [Net.id]: { id: Net.id, name: C.name, char: C, idx: 0 } }; renderLobby(); setupHostHandlers();
    }, resumePending && campaign ? campaign.roomCode : null);
    return;
  }
  $('#lobbyEyebrow').textContent = 'Подключаемся…'; $('#lobbyCode').textContent = $('#joinCode').value.trim().toUpperCase();
  netJoin($('#joinCode').value, err => {
    if (err) { $('#lobbyMsg').textContent = netErrorText(err); return; }
    $('#lobbyEyebrow').textContent = 'Ты в комнате. Ждём, когда хост начнёт смену'; setupClientHandlers();
    writeClientSession(clientSession && clientSession.code === Net.code ? clientSession.pose : null);
    Net.toHost('join', { name: C.name, char: C, token: clientToken(), pose: clientSession && clientSession.code === Net.code ? clientSession.pose : null });
  });
}
$('#bLeave').onclick = () => { if (Net.mode === 'client') clearClientSession(); location.reload(); };
$('#micBox').addEventListener('change', async e => {
  if (!e.target.checked) return;
  try { await voiceEnable(); $('#lobbyMsg').textContent = 'Микрофон включён. Во время игры V — выключить звук.'; }
  catch (err) { e.target.checked = false; $('#lobbyMsg').textContent = 'Не получилось включить микрофон. Разреши доступ в браузере.'; }
});
$('#bStart').onclick = () => {
  const cfg = resumePending ? campaignConfig(players) : newNightConfig(players, $('#shortBox').checked);
  resumePending = false;
  if (Net.mode === 'host') Net.broadcast('start', cfg);
  startGame(cfg);
};

function newNightConfig(ps, short = false) {
  if (!campaign) campaign = freshCampaign(Net.mode === 'host' ? 'host' : 'solo');
  campaign.mode = Net.mode === 'host' ? 'host' : 'solo'; campaign.short = !!short; campaign.character = C;
  campaign.stage = 'play'; campaign.checkpoint = null;
  return { seed: Math.floor(Math.random() * 1e9), short: campaign.short, players: ps || players, night: campaign.night, rating: campaign.rating, reviews: campaign.reviews, money: campaign.money };
}
function campaignConfig(ps) {
  const cp = campaign && campaign.checkpoint;
  return { seed: cp ? cp.seed : Math.floor(Math.random() * 1e9), short: campaign && campaign.short, players: ps || players, night: campaign ? campaign.night : 1, rating: campaign ? campaign.rating : 1.2, reviews: campaign ? campaign.reviews : 318, money: campaign ? campaign.money : 0, checkpoint: cp || null };
}

/* ---------- net handlers ---------- */
function setupHostHandlers() {
  Net.on('join', (d, id) => {
    const previous = d.token && (Object.values(players).find(p => p.token === d.token)
      || (campaign && campaign.checkpoint && (campaign.checkpoint.roster || []).find(p => p.token === d.token)));
    if (previous && previous.id && previous.id !== id) { delete players[previous.id]; delete Hs.poses[previous.id]; if (avatars[previous.id]) { world.remove(avatars[previous.id].g); delete avatars[previous.id]; } }
    const used = Object.values(players).map(p => p.idx); let idx = previous ? previous.idx : 1; while (!previous && used.includes(idx)) idx++;
    if (idx > 4) { Net.sendTo(id, 'full', {}); return; }
    players[id] = { id, name: String(d.name || 'Гость').slice(0, 14), char: d.char, idx, token: d.token || null };
    if (G.started && S === 'play') {
      if (d.pose) Hs.poses[id] = d.pose;
      makeAvatar(id); const checkpoint = makeCheckpoint();
      Net.sendTo(id, 'resume', { seed: SEED, short: NIGHT_LEN < 500, players, night: CURRENT_NIGHT, rating: currentRating, reviews: currentReviews, money: G.money, checkpoint });
      Net.broadcast('playerJoin', { player: players[id] }, id); dispatch({ e: 'toast', text: `${players[id].name} вернулся в смену.` }); return;
    }
    if (G.started) { delete players[id]; Net.sendTo(id, 'full', {}); return; }
    renderLobby(); Net.broadcast('roster', players);
    sfx.ui();
  });
  Net.on('leave', (d, id) => {
    if (!players[id]) return; const name = players[id].name; delete players[id];
    if (avatars[id]) { world.remove(avatars[id].g); delete avatars[id]; }
    if (S === 'lobby') { renderLobby(); Net.broadcast('roster', players); return; }
    dispatch({ e: 'leave', id, name });
    if (G.mkey === id) dispatch({ e: 'mkey', holder: null });
    if (G.deskUser === id) dispatch({ e: 'desk', by: null });
  });
  Net.on('pos', (d, id) => {
    Hs.poses = Hs.poses || {};
    Hs.poses[id] = d;
    // The host does not receive its own `poses` broadcast, so apply each
    // guest pose locally as soon as it arrives.
    poseIn(id, d);
  });
  Net.on('act', (d, id) => hostAct(id, d));
}
function setupClientHandlers() {
  Net.on('roster', d => { players = d; renderLobby(); });
  Net.on('full', () => { $('#lobbyMsg').textContent = 'Комната уже заполнена или смена началась.'; });
  Net.on('start', cfg => startGame(cfg));
  Net.on('resume', cfg => { writeClientSession(); startGame(cfg); });
  Net.on('playerJoin', d => { const p = d && d.player; if (!p) return; players[p.id] = p; if (S === 'play' && !avatars[p.id]) makeAvatar(p.id); });
  Net.on('ev', ev => applyEv(ev));
  Net.on('poses', d => { for (const id in d) if (id !== Net.id) poseIn(id, d[id]); });
  Net.on('st', d => stateIn(d));
  Net.on('hostgone', () => { writeClientSession(); toast('Хост отключился. Комната сохранена — можно вернуться, когда он снова её создаст.', 5); setTimeout(() => location.reload(), 4000); });
}

/* ================= START ================= */
function startGame(cfg) {
  SEED = cfg.seed; NIGHT_LEN = cfg.short ? 360 : 840; players = cfg.players;
  CURRENT_NIGHT = cfg.night || 1; currentRating = cfg.rating || 1.2; currentReviews = cfg.reviews || 318;
  myIdx = (players[Net.id] || { idx: 0 }).idx;
  G = freshG(); G.started = true; Hs.poses = {}; gameTime = 0; timers = []; anims = [];
  G.money = cfg.money || 0;
  setupWorld(SEED); seedRng(SEED + 7);
  Hs.busRoom = buildArchive(SEED);
  show('#lobby', false); show('#menu', false); show('#morning', false); show('#pause', false);
  $('#hudNight').textContent = `Ночь ${CURRENT_NIGHT}`; $('#hudRating').textContent = `★ ${ratingText(currentRating)}`;
  for (const id in players) if (id !== Net.id) makeAvatar(id);
  if (Net.online) voiceConnectAll(Object.keys(players));
  if (campaign && Net.isHost) {
    campaign.mode = Net.mode === 'host' ? 'host' : 'solo'; campaign.stage = 'play'; campaign.night = CURRENT_NIGHT;
    campaign.rating = currentRating; campaign.reviews = currentReviews; campaign.money = G.money; campaign.short = !!cfg.short; campaign.character = C;
  }
  if (cfg.checkpoint) restoreCheckpoint(cfg.checkpoint);
  else { if (Net.isHost) hostInit(); writeCampaign(); startIntro(); }
}

/* ---------- autosave / restore ---------- */
const plain = x => JSON.parse(JSON.stringify(x));
const vec = v => v ? [v.x, v.y, v.z] : null;
const fromVec = a => a ? V3(a[0], a[1], a[2]) : null;
let checkpointT = 0;
function makeCheckpoint() {
  const npcState = {};
  for (const id in Hs.npcs) {
    const n = Hs.npcs[id]; npcState[id] = {
      x: n.x, y: n.y, z: n.z, yaw: n.yaw, speed: n.speed, moving: n.moving,
      roomDoor: n.roomDoor || null, wander: n.wander == null ? null : n.wander, stare: !!n.stare,
      path: (n.path || []).map(vec),
    };
  }
  const mon = Hs.mon ? Object.assign({}, plain(Hs.mon), { goal: vec(Hs.mon.goal), path: (Hs.mon.path || []).map(vec) }) : null;
  return {
    version: SAVE_VERSION, seed: SEED, night: CURRENT_NIGHT, short: NIGHT_LEN < 500,
    clock: fmtClock(G.clock), gameTime, rating: currentRating, reviews: currentReviews,
    g: plain(G),
    roster: Object.values(players).map(p => ({ id: p.id, token: p.token || null, idx: p.idx, name: p.name, char: p.char })),
    playerByIndex: Object.fromEntries(Object.values(players).map(p => [p.idx, p.id === Net.id ? myPose() : (Hs.poses && Hs.poses[p.id])]).filter(x => x[1])),
    world: {
      doors: Object.fromEntries(Object.entries(doors).map(([id, d]) => [id, !!d.open])),
      rooms: rooms.map(r => ({ num: r.num, occupant: r.occupant || null, unlocked: !!r.unlocked, light: !!r.light, radio: !!r.radio })),
      containers: Object.fromEntries(Object.entries(containers).map(([id, c]) => [id, !!c.opened])),
    },
    host: Net.isHost ? {
      nightT: Hs.nightT || 0, calls: plain(Hs.calls || []), sched: plain(Hs.sched || []), complaints: plain(Hs.complaints || []),
      taskN: Hs.taskN || 0, dragged: Hs.dragged || 0, guestOrder: plain(Hs.guestOrder || []), npcs: npcState, mon,
    } : null,
  };
}
function saveCheckpoint(force = false) {
  if (!Net.isHost || S !== 'play' || !campaign) return;
  if (!force && checkpointT < 5) return;
  checkpointT = 0; campaign.stage = 'play'; campaign.money = G.money; campaign.checkpoint = makeCheckpoint(); writeCampaign();
}
function restoreNpcDone(id, n) {
  const g = G.guests[id]; if (!g) return null;
  if (g.state === 'arriving') return () => { dispatch({ e: 'guestState', id, state: 'waiting' }); n.yaw = Math.PI; };
  if (g.state === 'toRoom') return () => { const r = rooms.find(x => x.num === g.room); if (r && r.door.open) dispatch({ e: 'door', id: r.door.id, open: false }); dispatch({ e: 'guestState', id, state: 'inRoom' }); };
  if (g.state === 'toSofa') return () => dispatch({ e: 'guestState', id, state: 'sofa' });
  if (g.state === 'leaving') return () => dispatch({ e: 'guestState', id, state: 'outside' });
  return null;
}
function restoreCheckpoint(cp) {
  G = plain(cp.g); G.started = true; gameTime = cp.gameTime || 0; checkpointT = 0;
  currentRating = cp.rating || currentRating; currentReviews = cp.reviews || currentReviews;
  if (G.mkey && !players[G.mkey]) G.mkey = null;
  if (G.deskUser && !players[G.deskUser]) G.deskUser = null;
  for (const r0 of cp.world.rooms || []) { const r = rooms.find(x => x.num === r0.num); if (r) Object.assign(r, r0); }
  for (const id in cp.world.doors || {}) if (doors[id]) setDoorOpen(doors[id], cp.world.doors[id], true);
  for (const id in cp.world.containers || {}) if (containers[id]) { containers[id].opened = cp.world.containers[id]; if (containers[id].opened && containers[id].anim) containers[id].anim(1); }
  for (const g of Object.values(G.guests || {})) {
    makeNPC(g); const r = g.room && rooms.find(x => x.num === g.room);
    if (g.state === 'inRoom' && r) { r.occupant = g.id; r.dnd.visible = true; seatNPC(g, r); }
  }
  if (Net.isHost) {
    const h = cp.host || {}; Hs.nightT = h.nightT || G.clock * NIGHT_LEN; Hs.calls = h.calls || []; Hs.sched = h.sched || []; Hs.complaints = h.complaints || [];
    Hs.taskN = h.taskN || 0; Hs.dragged = h.dragged || 0; Hs.guestOrder = h.guestOrder || []; Hs.frontCloseAt = 0; Hs.stT = 0; Hs.poseT = 0; Hs.poses = {};
    Hs.npcs = {};
    for (const id in h.npcs || {}) { const x = h.npcs[id]; const n = Object.assign({}, x, { path: (x.path || []).map(fromVec), done: null }); n.done = restoreNpcDone(id, n); Hs.npcs[id] = n; const o = npcs[id]; if (o) { o.g.position.set(n.x, n.y, n.z); o.g.rotation.y = n.yaw; o.tx = n.x; o.ty = n.y; o.tz = n.z; o.tyaw = n.yaw; } }
    Hs.mon = h.mon ? Object.assign({}, h.mon, { goal: fromVec(h.mon.goal), path: (h.mon.path || []).map(fromVec) }) : null;
  }
  if (G.monster) { monObj = makeMonster(); const m = cp.host && cp.host.mon; monObj.position.set(m ? m.x : BLD.spawn.x, m ? m.y : BLD.spawn.y, m ? m.z : BLD.spawn.z); world.add(monObj); monSound = loopSound('breath', monObj.position); }
  setMK(G.mkey == null); if (G.power) W.lever.rotation.z = -0.6;
  const pos = cp.playerByIndex && cp.playerByIndex[myIdx];
  W.car.position.copy(drivePath.getPointAt(1)); W.car.lookAt(drivePath.getPointAt(0.99)); startPlay();
  if (pos) { P.x = pos[0]; P.feet = pos[1]; P.z = pos[2]; yaw = pos[3]; pitch = pos[4]; flashOn = !!(pos[5] & 1); crouch = !!(pos[5] & 2); }
  if (G.phone === 'ring') { G.phone = 'idle'; applyEv({ e: 'phone', state: 'ring' }); }
  toast(`Смена восстановлена · ночь ${CURRENT_NIGHT}, ${fmtClock(G.clock)}`, 4);
  writeCampaign();
}

/* ================= INTRO + DRIVE ================= */
let introCards = [], cardI = 0, cardAuto = 0;
function cardsForNight() {
  const chapter = () => `<div class="chapter"><p class="eyebrow">Ночь ${CURRENT_NIGHT}</p><h3>Смена</h3><p>22:41 · трасса · 214-й км</p></div>`;
  return [
    () => `<div class="ad"><p class="eyebrow">Объявления · Работа</p><h3>Требуется ночной персонал</h3><p>Отель «Уют», 214-й км. Проживание, питание, оплата наличными.</p><p>Опыт не нужен. Вопросов не задавать.</p><p class="tiny">Звонить после 23:00. Если ответят — не вешайте трубку.</p></div>`,
    () => `<div class="reviews"><p class="eyebrow">Отель «Уют» · 318 отзывов</p><p class="big">★ 1,2</p><ul><li><span class="st">★☆☆☆☆</span>Ночью кто-то стучал. Изнутри шкафа. <i>— Галина</i></li><li><span class="st">★☆☆☆☆</span>Администратор улыбался слишком широко. Слишком. <i>— Денис</i></li><li><span class="st">★★☆☆☆</span>Номер 13 очень уютный. Не могу найти выход. Пишу из номера. <i>— Олег</i></li></ul></div>`,
    () => `<div class="letter"><p>${Object.keys(players).length > 1 ? 'Команда' : esc(C.name)}, добро пожаловать.</p><p>Задача простая: за пять ночей поднять рейтинг до 4,5. Гости у нас… особенные. Селите их правильно.</p><p>Приезжайте к полуночи. Свет, скорее всего, будет выключен.</p><p class="sig">— Управляющий</p></div>`,
    chapter,
  ];
}
function startIntro() { S = 'intro'; show('#intro', true); introCards = cardsForNight(); cardI = -1; nextCard(); }
function nextCard() { if (S !== 'intro') return; clearTimeout(cardAuto); cardI++; if (cardI >= introCards.length) { endIntro(); return; } sfx.tick(); $('#introCard').innerHTML = introCards[cardI](); if (cardI === introCards.length - 1) { $('#introHint').textContent = ''; cardAuto = setTimeout(nextCard, 2400); } else $('#introHint').textContent = 'Клик или пробел — дальше'; }
async function endIntro() { S = 'wait'; await fade(1, 500); show('#intro', false); startDrive(); fade(0, 1300); }
$('#intro').onclick = () => nextCard();
$('#bSkip').onclick = e => { e.stopPropagation(); cardI = introCards.length; clearTimeout(cardAuto); endIntro(); };

const V3 = (x, y, z) => new T.Vector3(x, y, z);
const drivePath = new T.CatmullRomCurve3([V3(0, 0, 250), V3(0, 0, 120), V3(0, 0, 50), V3(-1.2, 0, 32), V3(-4, 0, 22), V3(-5.2, 0, 16.5)]);
const DRIVE_DUR = 13; let driveTime = 0, navI = 0, arrived = false;
const NAV = [[2.0, 'Через пятьсот метров — пункт назначения.'], [6.8, 'Вы прибыли.'], [9.2, 'Пожалуйста, развернитесь.'], [11.4, '…Пожалуйста.']];
const qFlip = new T.Quaternion().setFromAxisAngle(V3(0, 1, 0), Math.PI);
const SEATS = [V3(-0.36, 1.3, 0.05), V3(0.36, 1.3, 0.05), V3(-0.4, 1.25, -0.9), V3(0.4, 1.25, -0.9), V3(0, 1.25, -0.9)];
function startDrive() { S = 'drive'; driveTime = 0; navI = 0; arrived = false; setOutsideLights(true); hand.visible = false; setAmb('eng', 0.07); setAmb('wind', 0.1); }
function updateDrive(dt) {
  driveTime += dt; updateFlicker(dt); assignPool(); W.extG.visible = true; W.floorG[1].visible = W.floorG[2].visible = false;
  const t = clamp(driveTime / DRIVE_DUR, 0, 1), u = 1 - Math.pow(1 - t, 2.2);
  W.car.position.copy(drivePath.getPointAt(u)); if (u < 0.997) W.car.lookAt(drivePath.getPointAt(Math.min(1, u + 0.004)));
  W.car.updateMatrixWorld();
  cam.position.copy(SEATS[myIdx] || SEATS[0]).applyMatrix4(W.car.matrixWorld);
  cam.quaternion.copy(W.car.quaternion).multiply(qFlip); cam.rotateX(-0.03 + Math.sin(driveTime * 13) * 0.004 * (1 - t));
  if (A.ctx) amb.engF.setTargetAtTime(28 + (1 - t) * 26, now(), 0.2);
  if (navI < NAV.length && driveTime > NAV[navI][0]) { typeSub('НАВИГАТОР', NAV[navI][1], null, true); navI++; }
  if (t >= 1 && !arrived) { arrived = true; setAmb('eng', 0, 0.4); setTimeout(() => { hideSub(); sfx.carDoor(); fade(1, 600).then(startPlay); }, 900); }
}
function skipDrive() { if (driveTime < DRIVE_DUR - 0.5) driveTime = DRIVE_DUR - 0.5; }

/* ================= PLAY ================= */
let car0Collider = null;
function startPlay() {
  S = 'play';
  if (!car0Collider) { const b = new T.Box3().setFromObject(W.car); car0Collider = solid(b.min.x, b.min.z, b.max.x, b.max.z, 0, 1.6); }
  inter([W.carBody, W.carCab], () => 'Осмотреть машину', () => toast('Ключи остались в замке зажигания. Были. Сейчас их нет.'));
  P.x = W.car.position.x + 2.3; P.z = W.car.position.z - 1.6 + myIdx * 0.9; P.feet = 0; P.vy = 0;
  yaw = Math.atan2(-(0 - P.x), -(6 - P.z)); pitch = 0.05;
  buildHand(); hand.visible = true;
  show('#hud', true); if (isTouch) { show('#touch', true); show('#keysHint', false); }
  setAmb('wind', 0.2); hideSub(); fade(0, 1000);
  later(1.2, () => toast(isTouch ? 'Слева — идти, справа — смотреть.' : 'Кликни по экрану, чтобы смотреть мышью. F — фонарик, C — присесть.', 5));
}
function setOutsideLights(on) {
  G.outLights = on;
  W.lamps.forEach(l => { if (l.L) l.L.intensity = on ? l.base : 0; });
  W.porchL.intensity = on ? 0.9 : 0; W.signL.intensity = on ? 1.4 : 0;
  W.headlights.forEach(h => h.intensity = on ? 2.2 : 0);
}
const inLobbyArea = (x, z, y) => y > -0.5 && y < 1.5 && x > -8.5 && x < 7.2 && z > -11.2 && z < 5.8 && !inStairwell(x, z);
const insideBuilding = (x, z) => x > -11.9 && x < 11.9 && z > -11.9 && z < 5.9;
function roomAt(x, y, z) { for (const r of rooms) { if (Math.abs(y - r.level * H) > 1.2) continue; const x0 = r.cx - 2.5, x1 = r.cx + 2.5; const z0 = r.side > 0 ? 0.2 : -6.85, z1 = r.side > 0 ? 4.85 : -2.2; if (x > x0 && x < x1 && z > z0 && z < z1) return r; } return null; }
const inStairwell = (x, z) => x > BLD.core.x0 - 0.05 && x < BLD.core.x1 && z > BLD.core.z0 && z < BLD.core.z1;

/* ---------- player update ---------- */
const keys = {}; const stick = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
let curInter = null, bob = 0, lastSin = 0, uiOpen = null, shake = 0, noiseLevel = 0;
const ray = new T.Raycaster(), center = new T.Vector2(0, 0);
function updatePlayer(dt) {
  let ix = 0, iy = 0;
  if (!uiOpen && !G.frozen) {
    if (keys.KeyW || keys.ArrowUp) iy += 1; if (keys.KeyS || keys.ArrowDown) iy -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1; if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    ix += stick.x; iy += stick.y;
  }
  const len = Math.hypot(ix, iy); if (len > 1) { ix /= len; iy /= len; }
  if (SIT) { if (len > 0.3 || keys.Space) { standUp(); } else { ix = iy = 0; } }
  const crouching = crouch || keys.ControlLeft;
  const moving = len > 0.08, run = (keys.ShiftLeft || keys.ShiftRight) && !crouching;
  const sp = crouching ? 1.3 : run ? 4.3 : 2.5, sy = Math.sin(yaw), cy = Math.cos(yaw);
  if (!SIT) {
  P.x += (-sy * iy + cy * ix) * sp * dt; resolveCollisions(P, 0.28, P.feet);
  P.z += (-cy * iy - sy * ix) * sp * dt; resolveCollisions(P, 0.28, P.feet);
  }
  const gnd = groundAt(P.x, P.z, P.feet);
  if (P.feet - gnd > 0.6) { P.vy -= 18 * dt; P.feet = Math.max(gnd, P.feet + P.vy * dt); if (P.feet === gnd) { P.vy = 0; sfx.step('hard'); } }
  else { P.feet = gnd; P.vy = 0; }
  noiseLevel = moving ? (crouching ? 0 : run ? 2 : 1) : 0;
  const rm = roomAt(P.x, P.feet, P.z);
  if (moving) { bob += dt * (run ? 11 : crouching ? 5 : 7.5); const s = Math.sin(bob); if (lastSin > 0 && s <= 0) sfx.step(rm && rm.wet ? 'water' : crouching ? 'soft' : (inLobbyArea(P.x, P.z, P.feet) || rm) ? 'soft' : 'hard'); lastSin = s; }
  const eye = SIT ? SIT.eye : crouching ? 1.05 : 1.62;
  const bobY = moving ? Math.sin(bob) * 0.03 * (reduced ? 0.2 : 1) : 0;
  shake = Math.max(0, shake - dt * 2);
  cam.position.set(P.x + (Math.random() - .5) * shake * 0.08, P.feet + eye + bobY, P.z + (Math.random() - .5) * shake * 0.08);
  cam.rotation.set(pitch, yaw, 0);
  hand.position.y = -0.3 + bobY * 0.4;
  Held.bob(bobY * 0.4); Held.show(!uiOpen);
  // flashlight
  let fi = flashOn ? 1.7 : 0; if (flashOn && gameTime < (G.flickUntil || 0)) fi = Math.random() < 0.5 ? 0 : 0.5;
  flash.intensity = fi; lensMat.color.setHex(fi > 0 ? 0xfff1cc : 0x2a2a2a);
  // interaction
  curInter = null;
  if (!uiOpen && !G.frozen) {
    ray.setFromCamera(center, cam); ray.far = 3.2;
    const hits = ray.intersectObjects(rayTargets, false);
    if (hits.length) { const h = hits[0], it = h.object.userData.inter; if (it && h.distance <= it.range) { const l = it.label(); if (l) curInter = { action: it.action, l }; } }
  }
  const pr = $('#prompt');
  if (curInter) { const html = isTouch ? esc(curInter.l) : `<kbd>E</kbd> ${esc(curInter.l)}`; if (pr.innerHTML !== html) pr.innerHTML = html; pr.hidden = false; } else pr.hidden = true;
  show('#lockHint', !isTouch && !locked && !uiOpen);
}
function myPose() { return [+P.x.toFixed(2), +P.feet.toFixed(2), +P.z.toFixed(2), +yaw.toFixed(2), +pitch.toFixed(2), (flashOn ? 1 : 0) | ((crouch || keys.ControlLeft) ? 2 : 0) | (noiseLevel << 2)]; }

/* ================= ACTIONS → HOST → EVENTS ================= */
function act(a) { if (Net.isHost) hostAct(Net.id, a); else Net.toHost('act', a); }
function dispatch(ev) { applyEv(ev); if (Net.mode === 'host') Net.broadcast('ev', ev); }
window.act = act;
const poseOf = id => id === Net.id ? myPose() : (Hs.poses && Hs.poses[id]);

function hostAct(pid, a) {
  const pose = poseOf(pid) || [0, 0, 0];
  switch (a.a) {
    case 'door': {
      const d = doors[a.id]; if (!d) return;
      if (d.kind === 'front') {
        if (pose[2] < 5.9 && !d.open) { dispatch({ e: 'toast', to: pid, text: 'Заперто изнутри. Эту дверь открывают только снаружи.' }); dispatch({ e: 'locked', id: d.id }); return; }
        const opening = !d.open; dispatch({ e: 'door', id: d.id, open: opening }); if (opening) Hs.frontCloseAt = gameTime + 6; return;
      }
      if (d.kind === 'basement') { dispatch({ e: 'toast', to: pid, text: 'Подвал заперт. Снизу что-то сопит.' }); dispatch({ e: 'sniff', pos: [BLD.bdoor.x, 1, BLD.bdoor.z - 0.5] }); return; }
      if (d.kind === 'room' && !d.open) {
        const r = d.room, inside = roomAt(pose[0], pose[1], pose[2]) === r;
        if (!r.unlocked && G.mkey !== pid && !inside) { dispatch({ e: 'locked', id: d.id, by: pid }); return; }
        const g = r.occupant && G.guests[r.occupant];
        if (g && g.state === 'inRoom' && !inside && !Object.values(G.tasks).some(t => t.room === r.num && t.revealed && !t.done && !t.failed) && !g.intruded) {
          g.intruded = true; dispatch({ e: 'guestFlag', id: g.id, intruded: true }); dispatch({ e: 'toast', text: `Гость из ${r.num}: «Без стука?!» Минус звезда.` });
        }
      }
      dispatch({ e: 'door', id: d.id, open: !d.open }); return;
    }
    case 'search': { const c = containers[a.id]; if (!c || c.opened) return; const add = c.loot && c.loot.kind === 'money' ? c.loot.v : 0; dispatch({ e: 'search', id: c.id, by: pid, money: G.money + add }); return; }
    case 'bell': dispatch({ e: 'bell' }); return;
    case 'phone': if (G.phone === 'ring') answerPhone(pid); else dispatch({ e: 'toast', to: pid, text: G.phone === 'talk' ? 'Кто-то уже говорит по телефону.' : 'Гудки. Длинные, как коридор третьего этажа.' }); return;
    case 'fuse':
      if (!G.power) { powerOn(); return; }
      for (const L of [1, 2]) if (G.corrDark[L]) { dispatch({ e: 'corrDark', level: L, dark: false }); completeTasks(t => t.kind === 'light' && t.level === L, pid); dispatch({ e: 'toast', to: pid, text: `Автомат ${L + 1}-го этажа включён.` }); return; }
      dispatch({ e: 'toast', to: pid, text: 'Свет есть. Пока.' }); return;
    case 'masterkey':
      if (G.mkey == null) dispatch({ e: 'mkey', holder: pid }); else if (G.mkey === pid) dispatch({ e: 'mkey', holder: null }); else dispatch({ e: 'toast', to: pid, text: `Мастер-ключ сейчас у ${nameOf(G.mkey)}.` }); return;
    case 'desk': {
      if (G.deskUser && G.deskUser !== pid) { dispatch({ e: 'toast', to: pid, text: `За стойкой уже ${nameOf(G.deskUser)}.` }); return; }
      const g = Object.values(G.guests).find(x => x.state === 'waiting') || Object.values(G.guests).find(x => x.state === 'sofa');
      if (!g) { dispatch({ e: 'toast', to: pid, text: 'Гостей пока нет. Звонок молчит, телефон тоже.' }); return; }
      dispatch({ e: 'desk', by: pid, gid: g.id }); return;
    }
    case 'deskClose': if (G.deskUser === pid) dispatch({ e: 'desk', by: null }); return;
    case 'checkin': {
      const g = G.guests[a.gid], r = rooms.find(x => x.num === a.room); if (!g || !r || r.occupant || (g.state !== 'waiting' && g.state !== 'sofa')) return;
      const correct = !!GTYPES[g.type].need(r, g);
      r.occupant = g.id;
      dispatch({ e: 'guestState', id: g.id, state: 'toRoom', room: r.num, correct, by: pid });
      dispatch({ e: 'desk', by: null });
      if (correct) dispatch({ e: 'money', v: G.money + 100 });
      npcGoRoom(g, r);
      if (!correct) Hs.complaints.push({ at: Hs.nightT + NIGHT_LEN * rand(0.07, 0.12), gid: g.id });
      return;
    }
    case 'wait': { const g = G.guests[a.gid]; if (!g) return; dispatch({ e: 'guestState', id: g.id, state: 'toSofa', by: pid }); dispatch({ e: 'desk', by: null }); npcGo(g.id, [V3(3.5, 0, 1.5), V3(5.7, 0, 2.5)], () => dispatch({ e: 'guestState', id: g.id, state: 'sofa' })); return; }
    case 'refuse': { const g = G.guests[a.gid]; if (!g) return; dispatch({ e: 'guestState', id: g.id, state: 'leaving', by: pid }); dispatch({ e: 'desk', by: null }); npcGo(g.id, [V3(0, 0, 4.4), V3(0, 0, 7.6), V3(-6, 0, 18), V3(-11.6, 0, 25.6)], () => dispatch({ e: 'guestState', id: g.id, state: 'outside' })); return; }
    case 'roomlight': { const r = rooms.find(x => x.num === a.room); if (r) dispatch({ e: 'roomLight', room: r.num, on: !r.light }); return; }
    case 'radio': { const r = rooms.find(x => x.num === a.room); if (!r) return; if (r.radio) { dispatch({ e: 'radio', room: r.num, on: false }); completeTasks(t => t.kind === 'noise' && t.room === r.num, pid); } else dispatch({ e: 'toast', to: pid, text: 'Старое радио. Выключено. Ручка тёплая.' }); return; }
    case 'deliver': { const ok = completeTasks(t => t.kind === 'towels' && t.room === a.room, pid); if (!ok) dispatch({ e: 'toast', to: pid, text: 'Полотенца тут никто не заказывал.' }); return; }
    case 'fix': { const ok = completeTasks(t => t.kind === 'tap' && t.room === a.room, pid); if (!ok) dispatch({ e: 'toast', to: pid, text: 'Кран в порядке. Почти.' }); return; }
  }
}
function completeTasks(pred, pid) {
  let any = false;
  for (const t of Object.values(G.tasks)) if (t.revealed && !t.done && !t.failed && pred(t)) { any = true; dispatch({ e: 'task', t: Object.assign({}, t, { done: true, by: pid }) }); dispatch({ e: 'money', v: G.money + 50 }); }
  return any;
}

/* ---------- events (run on every client) ---------- */
let ringLoop = 0, radios = {}, monObj = null, monSound = null;
function applyEv(ev) {
  switch (ev.e) {
    case 'door': { const d = doors[ev.id]; if (!d) return; setDoorOpen(d, ev.open); (ev.open ? sfx.door : sfx.doorClose)(d.pos); return; }
    case 'locked': { const d = doors[ev.id]; if (d) sfx.locked(d.pos); if (ev.by === Net.id) toast('Заперто. Нужен мастер-ключ — он на доске за стойкой.', 3.5); return; }
    case 'slam': {
      G.slammed = true; const d = doors.front; setDoorOpen(d, false); sfx.slam(d.pos);
      if (insideBuilding(P.x, P.z)) { shake = 1; toast('Дверь захлопнулась. Изнутри не открывается.', 4); }
      return;
    }
    case 'power': {
      G.power = true; sfx.clunk(V3(5.5, 1.5, -10.8)); anim(0.2, k => W.lever.rotation.z = 0.6 - 1.2 * k);
      G.powerFlicker = gameTime; setAmb('hum', 0.04); setAmb('drone', 0.02);
      later(1.05, () => toast('Свет включился. Почти везде.', 3));
      return;
    }
    case 'bell': sfx.bell(W.bellPos || V3(-1.25, 1.2, -0.78)); anim(0.35, k => W.bellDome.position.y = 0.015 - Math.sin(k * Math.PI) * 0.01); return;
    case 'phone': {
      G.phone = ev.state; clearInterval(ringLoop);
      if (ev.state === 'ring') { const r = () => { sfx.ring(W.phonePos); anim(1.2, k => W.handset.position.y = 0.11 + (Math.sin(k * 60) > 0 ? 0.008 : 0) * (1 - k)); }; r(); ringLoop = setInterval(r, 3000); }
      if (ev.state === 'talk') anim(0.3, k => { W.handset.position.y = 0.11 + k * 0.25; W.handset.rotation.z = k * 0.6; });
      if (ev.state === 'idle') anim(0.3, k => { W.handset.position.y = 0.36 - k * 0.25; W.handset.rotation.z = 0.6 * (1 - k); });
      return;
    }
    case 'dialog': { if (ev.by) toast(`${nameOf(ev.by)} снял трубку`, 2); dialogue(ev.lines); return; }
    case 'clock': G.clockOn = true; G.phase = 'night'; return;
    case 'guestNew': { G.guests[ev.g.id] = ev.g; makeNPC(ev.g); return; }
    case 'guestState': {
      const g = G.guests[ev.id]; if (!g) return; g.state = ev.state;
      if (ev.room) { g.room = ev.room; g.correct = ev.correct; const r = rooms.find(x => x.num === ev.room); if (r) r.occupant = g.id; }
      if (['toRoom', 'leaving', 'wander'].includes(ev.state)) { const n = npcs[g.id]; if (n) { n.sit = false; n.seated = false; n.g.children.forEach(c => c.userData.limbs && standChar(c)); } }
      if (ev.state === 'waiting') { sfx.bell(W.bellPos || V3(-1.25, 1.2, -0.78)); toast(`У стойки гость: ${g.name}`, 3.5); }
      if (ev.state === 'toRoom' && ev.by === Net.id) { if (ev.correct) { sfx.good(); typeSub(g.name.toUpperCase(), 'Идеально. Спасибо.', () => setTimeout(hideSub, 1500)); } else { sfx.bad(); typeSub(g.name.toUpperCase(), '…Ну ладно. Раз так.', () => setTimeout(hideSub, 1500)); } }
      if (ev.state === 'toRoom' && ev.by !== Net.id) toast(`${nameOf(ev.by)} заселил гостя в ${ev.room}`, 3);
      if (ev.state === 'inRoom') { const r = rooms.find(x => x.num === g.room); if (r) { r.dnd.visible = true; seatNPC(g, r); } }
      if (ev.state === 'sofa') { const n = npcs[g.id]; if (n) { n.sit = true; n.g.children.forEach(c => c.userData.limbs && sitChar(c)); } }
      if (ev.state === 'leaving' && ev.by === Net.id) { sfx.bad(); typeSub(g.name.toUpperCase(), 'Понятно. Я подожду снаружи. Долго.', () => setTimeout(hideSub, 1500)); }
      return;
    }
    case 'guestFlag': { const g = G.guests[ev.id]; if (g) Object.assign(g, ev, { e: undefined, id: g.id }); return; }
    case 'desk': { const was = G.deskUser; G.deskUser = ev.by; if (ev.by === Net.id) openCheckin(ev.gid); else if (was === Net.id && uiOpen === 'checkin') closeCheckin(true); return; }
    case 'mkey': { const prev = G.mkey; G.mkey = ev.holder; setMK(ev.holder == null); sfx.coin(); if (ev.holder === Net.id) toast('Мастер-ключ у тебя. Открывает любой номер.', 3.5); else if (prev === Net.id) toast('Ты повесил мастер-ключ на доску.', 2.5); else if (ev.holder) toast(`${nameOf(ev.holder)} взял мастер-ключ.`, 2.5); return; }
    case 'task': {
      const old = G.tasks[ev.t.id]; G.tasks[ev.t.id] = ev.t; const t = ev.t;
      if (t.done && (!old || !old.done)) { sfx.good(); toast(`Заявка выполнена: ${t.short}${t.by ? ' — ' + nameOf(t.by) : ''}`, 3); if (t.by === Net.id && (t.kind === 'towels')) setItem(null); }
      if (t.failed && (!old || !old.failed)) { sfx.bad(); pulseVig(); toast(`Заявка провалена: ${t.short}`, 3.5); }
      return;
    }
    case 'roomLight': { const r = rooms.find(x => x.num === ev.room); if (r) { r.light = ev.on; r.bulb.material.color.setHex(ev.on ? 0xffe3a6 : 0x221d18); sfx.tick(); } return; }
    case 'radio': { const r = rooms.find(x => x.num === ev.room); if (!r) return; r.radio = ev.on; if (ev.on && !radios[r.num]) radios[r.num] = loopSound('radio', r.radioPos); if (!ev.on && radios[r.num]) { radios[r.num].stop(); delete radios[r.num]; sfx.clunk(r.radioPos); } return; }
    case 'unlock': { const r = rooms.find(x => x.num === ev.room); if (r) r.unlocked = true; return; }
    case 'corrDark': { G.corrDark[ev.level] = ev.dark; if (ev.dark) { sfx.zap(V3(0, ev.level * H + 2.8, 0)); sfx.zap(V3(6, ev.level * H + 2.8, 0)); } return; }
    case 'monster': {
      G.monster = ev.on;
      if (ev.on && !monObj) { monObj = makeMonster(); monObj.position.set(BLD.spawn.x, BLD.spawn.y, BLD.spawn.z); world.add(monObj); monSound = loopSound('breath', monObj.position); sfx.roar(V3(BLD.bdoor.x, 1, BLD.bdoor.z - 0.5)); toast('Снизу, из подвала, что-то вылезло. Не шумите.', 5); pulseVig(); }
      return;
    }
    case 'monMode': G.monMode = ev.mode; if (ev.mode === 'chase' && monObj) { sfx.roar(monObj.position.clone().add(V3(0, 2, 0))); if (monObj.position.distanceTo(cam.position) < 16) pulseVig(); } return;
    case 'dragged': {
      if (ev.pid === Net.id) {
        sfx.hit(); pulseVig('rgba(160,0,10,.9)'); G.frozen = true; fade(1, 250).then(() => { P.x = ev.pos[0]; P.feet = ev.pos[1]; P.z = ev.pos[2]; P.vy = 0; later(0.8, () => { G.frozen = false; fade(0, 900); toast(`Тебя утащили. Ты в номере ${ev.room}. Дверь открывается изнутри.`, 5); }); });
      } else toast(`Шумоед утащил ${nameOf(ev.pid)}!`, 4);
      return;
    }
    case 'money': G.money = ev.v; return;
    case 'toast': if (!ev.to || ev.to === Net.id) toast(ev.text, ev.sec || 4); return;
    case 'complaint': toast(ev.text, 5); pulseVig('rgba(200,120,0,.4)'); sfx.bad(); return;
    case 'sniff': sfx.sniff(V3(...ev.pos)); return;
    case 'knock': sfx.knock(3, V3(...ev.pos)); return;
    case 'npc': { if (!npcs[ev.n.id]) makeNPC(ev.n); return; }
    case 'search': {
      const c = containers[ev.id]; if (!c) return; c.opened = true; G.money = ev.money; if (c.anim) anim(0.5, k => c.anim(k));
      if (ev.by !== Net.id) return;
      sfx.drawer(cam.position);
      const L = c.loot || { kind: 'empty' };
      if (L.kind === 'money') { sfx.coin(); toast(`Чаевые прошлых гостей: +${L.v} ₽`, 3); }
      else if (L.kind === 'note') openNote('lore', L.i);
      else if (L.kind === 'scare') { sfx.sting(); shake = 0.8; pulseVig(); toast(c.kind === 'underbed' ? 'Под кроватью кто-то лежал. Открыл глаза. Закрыл.' : 'Внутри сидела фарфоровая кукла. Она смотрела на тебя.', 4); }
      else toast('Пусто. Только пыль и чей-то зуб.', 3);
      return;
    }
    case 'leave': delete players[ev.id]; if (avatars[ev.id]) { world.remove(avatars[ev.id].g); delete avatars[ev.id]; } toast(`${ev.name} отключился.`, 3); return;
    case 'morning': showMorning(ev.res); return;
  }
}

/* ================= HOST SIMULATION ================= */
function hostInit() {
  Hs.nightT = 0; Hs.calls = []; Hs.sched = []; Hs.complaints = []; Hs.npcs = {}; Hs.frontCloseAt = 0; Hs.stT = 0; Hs.poseT = 0; Hs.taskN = 0; Hs.slamAt = 0;
  const types = rshuffle(Object.keys(GTYPES)).slice(0, 3);
  Hs.guestOrder = types;
  [0.02, 0.2, 0.4].forEach((f, i) => Hs.sched.push({ f, kind: 'guest', type: types[i], index: i }));
  [0.13, 0.31, 0.5, 0.67].forEach((f, i) => Hs.sched.push({ f, kind: 'task', task: ['towels', 'tap', 'noise', 'towels'][i] }));
  Hs.sched.push({ f: 0.5, kind: 'monster' });
  Hs.mon = null;
}
function runScheduled(s) {
  if (s.kind === 'guest') spawnGuest(s.type, s.index);
  else if (s.kind === 'task') createTask(s.task);
  else if (s.kind === 'monster') spawnMonster();
}
const MANAGER_BRIEF = [
  ['УПРАВЛЯЮЩИЙ', 'Слушайте все. Это управляющий. Включили свет — молодцы.', 1.2],
  ['УПРАВЛЯЮЩИЙ', 'Гости приходят к стойке. Смотрите, кто они, и выдавайте правильный ключ.', 1.5],
  ['УПРАВЛЯЮЩИЙ', 'Номера на втором и третьем этажах. Выше не ходите. Лифт не работает. Вообще.', 1.5],
  ['УПРАВЛЯЮЩИЙ', 'Заявки звонят сюда, на этот телефон. Мастер-ключ на доске — один на всех.', 1.5],
  ['УПРАВЛЯЮЩИЙ', 'И не шумите на лестнице. Его это злит. Утром — отзывы.', 1.5],
  ['', '…короткие гудки.', 1.0],
];
function powerOn() {
  dispatch({ e: 'power' });
  later(3.5, () => dispatch({ e: 'bell' }));
  later(6, () => { Hs.calls.push({ kind: 'brief' }); if (G.phone === 'idle') dispatch({ e: 'phone', state: 'ring' }); });
}
function answerPhone(pid) {
  const call = Hs.calls.shift(); if (!call) { dispatch({ e: 'phone', state: 'idle' }); return; }
  dispatch({ e: 'phone', state: 'talk' });
  let lines, dur;
  if (call.kind === 'brief') { lines = MANAGER_BRIEF; }
  else { const t = G.tasks[call.id]; if (!t) { dispatch({ e: 'phone', state: 'idle' }); return; } const nt = Object.assign({}, t, { revealed: true, deadline: Hs.nightT + NIGHT_LEN * 0.18 }); dispatch({ e: 'task', t: nt }); lines = [[t.who, t.line, 1.6]]; }
  dur = lines.reduce((s, l) => s + l[1].length * 0.028 + (l[2] || 1.6), 0);
  dispatch({ e: 'dialog', lines, by: pid });
  later(dur + 0.3, () => {
    dispatch({ e: 'phone', state: 'idle' });
    if (call.kind === 'brief' && !G.clockOn) dispatch({ e: 'clock' });
    if (Hs.calls.length) later(2, () => { if (G.phone === 'idle') dispatch({ e: 'phone', state: 'ring' }); });
  });
}
function spawnGuest(type, i) {
  const def = GTYPES[type];
  const g = { id: 'g' + i, type, name: def.name, year: def.year, state: 'arriving', room: null, correct: null, intruded: false };
  if (type === 'business') g.archiveRoom = Hs.busRoom;
  dispatch({ e: 'guestNew', g });
  Hs.npcs[g.id] = { x: 0, y: 0, z: 18, yaw: Math.PI, path: [], speed: 1.5, done: null, moving: false };
  npcGo(g.id, [V3(0, 0, 9), V3(0, 0, 4.4), V3(-0.3, 0, 0.05)], () => { dispatch({ e: 'guestState', id: g.id, state: 'waiting' }); Hs.npcs[g.id].yaw = Math.PI; });
}
function npcGo(id, pts, done) { const n = Hs.npcs[id]; if (!n) return; n.path = pts.map(p => p.clone()); n.done = done; }
function npcGoRoom(g, r) {
  const n = Hs.npcs[g.id]; const y = r.level * H, s = r.side; n.roomDoor = r.door.id;
  const doorX = r.cx + s * -1.4, corZ = r.zc - s * 0.6;
  const start = nearestNode(V3(n.x, n.y, n.z)), goalNode = nearestNode(V3(doorX, y, BLD.corrZ));
  const pts = pathTo(start, goalNode).map(id => WPN[id].p.clone());
  pts.push(V3(doorX, y, corZ), V3(doorX, y, r.zc + s * 0.9), r.seatWorld.clone());
  npcGo(g.id, pts, () => { const d = r.door; if (d.open) dispatch({ e: 'door', id: d.id, open: false }); dispatch({ e: 'guestState', id: g.id, state: 'inRoom' }); });
}
function createTask(kind) {
  const occ = rooms.filter(r => r.occupant && G.guests[r.occupant] && G.guests[r.occupant].state === 'inRoom' && !Object.values(G.tasks).some(t => t.room === r.num && !t.done && !t.failed));
  let r, who, line, short;
  if (kind === 'noise') {
    const empty = rooms.filter(x => !x.occupant); if (!empty.length) return; r = pick(empty);
    const nb = rooms.find(x => x.level === r.level && x.occupant);
    who = nb ? 'НОМЕР ' + nb.num : 'ГОСТЬ'; line = `В номере ${r.num} кто-то включил радио. Там же никто не живёт?`; short = `№${r.num} · выключить радио`;
    dispatch({ e: 'radio', room: r.num, on: true }); dispatch({ e: 'unlock', room: r.num });
  } else {
    if (!occ.length) { Hs.sched.push({ f: Hs.nightT / NIGHT_LEN + 0.06, kind: 'task', task: kind }); return; }
    r = pick(occ); who = 'НОМЕР ' + r.num;
    if (kind === 'towels') { line = pick(['Принесите полотенца. Много полотенец.', 'Полотенца. Срочно. Не спрашивайте зачем.']); short = `№${r.num} · полотенца (кладовая на этаже)`; }
    else { line = 'У нас течёт кран. Вода… тёплая. И красноватая.'; short = `№${r.num} · кран (гаечный ключ в «Служебном»)`; }
  }
  const t = { id: 't' + (Hs.taskN++), kind, room: r.num, level: r.level, who, line, short, revealed: false, done: false, failed: false, deadline: 0 };
  dispatch({ e: 'task', t });
  Hs.calls.push({ kind: 'task', id: t.id }); if (G.phone === 'idle') dispatch({ e: 'phone', state: 'ring' });
}
function complaint(gid) {
  const g = G.guests[gid]; if (!g || g.state !== 'inRoom') return; const def = GTYPES[g.type]; const r = rooms.find(x => x.num === g.room);
  dispatch({ e: 'complaint', text: def.complaint });
  if (g.type === 'quiet') spawnMonster();
  if (g.type === 'moth' && r && r.level) { dispatch({ e: 'corrDark', level: r.level, dark: true }); const t = { id: 't' + (Hs.taskN++), kind: 'light', room: r.num, level: r.level, who: 'НОМЕР ' + r.num, line: 'У нас на этаже темно. Совсем.', short: `${r.level + 1} этаж · включить автомат на щитке`, revealed: true, done: false, failed: false, deadline: Hs.nightT + NIGHT_LEN * 0.2 }; dispatch({ e: 'task', t }); }
  if (g.type === 'twins') { for (let i = 0; i < 3; i++) { const n = { id: 'tw' + i, type: 'twins', name: 'Близнецов', state: 'stare', solo: true }; dispatch({ e: 'npc', n }); Hs.npcs[n.id] = { x: -3 + i * 0.8, y: 0, z: 3.2, yaw: 0, path: [], speed: 0, stare: true }; } }
  if (g.type === 'business' && r) { Hs.npcs[g.id].wander = r.level; dispatch({ e: 'guestState', id: g.id, state: 'wander' }); }
}
function spawnMonster() {
  if (Hs.mon) return;
  Hs.mon = { x: BLD.spawn.x, y: BLD.spawn.y, z: BLD.spawn.z, yaw: 0, mode: 'roam', path: [], goal: null, lastHeard: -99, cool: 4, catchCool: 0 };
  dispatch({ e: 'door', id: 'basement', open: true }); dispatch({ e: 'monster', on: true });
}
function hostUpdate(dt) {
  const poses = Hs.poses; poses[Net.id] = myPose();
  for (const id in poses) if (!players[id]) delete poses[id];
  // first entry slams the front door
  if (!G.slammed && !Hs.slamAt) for (const id in poses) { const p = poses[id]; if (p[2] < 4.4 && Math.abs(p[0]) < 7 && p[1] < 1) { Hs.slamAt = gameTime + 0.6; break; } }
  if (Hs.slamAt && gameTime > Hs.slamAt && !G.slammed) { Hs.slamAt = 0; dispatch({ e: 'slam' }); }
  if (Hs.frontCloseAt && gameTime > Hs.frontCloseAt && doors.front.open) { const blocked = Object.values(poses).some(p => Math.abs(p[0]) < 1.2 && Math.abs(p[2] - 6) < 1.2); const npcBlock = Object.values(Hs.npcs).some(n => Math.abs(n.x) < 1.2 && Math.abs(n.z - 6) < 2); if (!blocked && !npcBlock) { Hs.frontCloseAt = 0; dispatch({ e: 'door', id: 'front', open: false }); } }
  // clock + schedule
  if (G.clockOn && G.phase === 'night') {
    Hs.nightT += dt; G.clock = Hs.nightT / NIGHT_LEN;
    for (let i = Hs.sched.length - 1; i >= 0; i--) if (G.clock >= Hs.sched[i].f) runScheduled(Hs.sched.splice(i, 1)[0]);
    for (let i = Hs.complaints.length - 1; i >= 0; i--) if (Hs.nightT >= Hs.complaints[i].at) { const c = Hs.complaints.splice(i, 1)[0]; complaint(c.gid); }
    for (const t of Object.values(G.tasks)) if (t.revealed && !t.done && !t.failed && t.deadline && Hs.nightT > t.deadline) dispatch({ e: 'task', t: Object.assign({}, t, { failed: true }) });
    if (G.clock >= 1) { morning(); return; }
  }
  // npcs
  for (const id in Hs.npcs) {
    const n = Hs.npcs[id]; n.moving = false;
    if (n.stare) { const near = nearestPose(V3(n.x, 0, n.z)); if (near) n.yaw = Math.atan2(near[0] - n.x, near[2] - n.z); continue; }
    if (n.wander != null && !n.path.length) { const L = n.wander; const k = Math.floor(Math.random() * 6); n.path = [WPN[`c${L}_${k}`].p.clone()]; n.done = () => { if (Math.random() < 0.6) dispatch({ e: 'knock', pos: [n.x, n.y + 1.2, n.z + (Math.random() < .5 ? 1.1 : -1.1)] }); }; }
    if (!n.path.length) continue;
    const tgt = n.path[0], dx = tgt.x - n.x, dz = tgt.z - n.z, d = Math.hypot(dx, dz);
    const step = n.speed * dt;
    if (d <= step + 0.02) { n.x = tgt.x; n.z = tgt.z; n.y = groundAt(n.x, n.z, Math.max(n.y, tgt.y)); n.path.shift(); if (!n.path.length && n.done) { const f = n.done; n.done = null; f(); } }
    else { n.x += dx / d * step; n.z += dz / d * step; n.y = groundAt(n.x, n.z, n.y + 0.2); n.yaw = Math.atan2(dx, dz); n.moving = true; }
    for (const did in doors) { const dd = doors[did]; if (dd.open) continue; if (!(dd.kind === 'front' || dd.kind === 'stair' || dd.kind === 'service' || did === n.roomDoor)) continue; const dp = dd.pos; if (Math.abs(dp.y - 1.2 - n.y) < 1 && Math.hypot(dp.x - n.x, dp.z - n.z) < 1.4) { dispatch({ e: 'door', id: did, open: true }); if (did === 'front') Hs.frontCloseAt = gameTime + 5; } }
  }
  // monster
  if (Hs.mon) monsterUpdate(dt, poses);
  // network ticks
  Hs.stT += dt; Hs.poseT += dt;
  if (Net.mode === 'host' && Hs.poseT > 1 / 12) { Hs.poseT = 0; Net.broadcast('poses', poses); }
  if (Hs.stT > 1 / 8) { Hs.stT = 0; const st = stateOut(); if (Net.mode === 'host') Net.broadcast('st', st); stateIn(st); }
}
function nearestPose(p) { let best = null, bd = 1e9; for (const id in Hs.poses) { const q = Hs.poses[id]; const d = Math.hypot(q[0] - p.x, q[2] - p.z) + Math.abs(q[1] - p.y) * 3; if (d < bd) { bd = d; best = q; } } return best; }
function stateOut() {
  const n = []; for (const id in Hs.npcs) { const x = Hs.npcs[id]; n.push([id, +x.x.toFixed(2), +x.y.toFixed(2), +x.z.toFixed(2), +x.yaw.toFixed(2), x.moving ? 1 : 0]); }
  const m = Hs.mon ? [+Hs.mon.x.toFixed(2), +Hs.mon.y.toFixed(2), +Hs.mon.z.toFixed(2), +Hs.mon.yaw.toFixed(2), Hs.mon.mode === 'chase' ? 1 : 0] : null;
  return { c: +G.clock.toFixed(4), n, m };
}
function stateIn(d) {
  G.clock = d.c;
  for (const [id, x, y, z, yw, mv] of d.n) { const o = npcs[id]; if (!o) continue; o.tx = x; o.ty = y; o.tz = z; o.tyaw = yw; o.moving = mv; }
  if (d.m && monObj) { monObj.userData.t = d.m; }
}

/* ---------- monster ---------- */
function monsterUpdate(dt, poses) {
  const m = Hs.mon; m.cool = Math.max(0, m.cool - dt); m.catchCool = Math.max(0, m.catchCool - dt);
  const mp = V3(m.x, m.y, m.z);
  // hearing
  if (m.catchCool <= 0) for (const id in poses) {
    const p = poses[id], lvl = (p[5] >> 2) & 3; if (!lvl) continue;
    const radius = lvl === 2 ? 15 : 7; const same = Math.abs(p[1] - m.y) < 1.8 || (inStairwell(p[0], p[2]) && inStairwell(m.x, m.z));
    const d = Math.hypot(p[0] - m.x, p[2] - m.z) + Math.abs(p[1] - m.y) * 1.5;
    if (d < radius * (same ? 1 : 0.45)) { m.goal = V3(p[0], p[1], p[2]); m.lastHeard = gameTime; m.path = []; if (m.mode !== 'chase') { m.mode = 'chase'; dispatch({ e: 'monMode', mode: 'chase' }); } }
  }
  if (m.mode === 'chase' && gameTime - m.lastHeard > 6) { m.mode = 'roam'; m.goal = null; m.path = []; dispatch({ e: 'monMode', mode: 'roam' }); }
  if (!m.goal) { const ids = Object.keys(WPN).filter(k => k !== 'bs'); m.goal = WPN[pick(ids)].p.clone(); m.path = []; }
  // path planning
  if (!m.path.length) {
    const direct = Math.abs(m.goal.y - m.y) < 0.8 && mp.distanceTo(m.goal) < 5 && !(inStairwell(m.x, m.z) !== inStairwell(m.goal.x, m.goal.z));
    if (direct) m.path = [m.goal.clone()]; else { const a = nearestNode(mp), b = nearestNode(m.goal); m.path = pathTo(a, b).map(id => WPN[id].p.clone()); if (m.mode === 'chase') m.path.push(m.goal.clone()); }
  }
  const tgt = m.path[0]; const dx = tgt.x - m.x, dz = tgt.z - m.z, d = Math.hypot(dx, dz);
  const sp = (m.mode === 'chase' ? 3.4 : 1.3) * (m.cool > 0 ? 0 : 1) * dt;
  if (d <= sp + 0.05) { m.path.shift(); if (!m.path.length && m.mode === 'roam') m.goal = null; if (!m.path.length && m.mode === 'chase') m.goal = null; }
  else { m.x += dx / d * sp; m.z += dz / d * sp; m.yaw = Math.atan2(dx, dz); }
  m.y = groundAt(m.x, m.z, m.y + 0.3);
  for (const did of ['st0', 'st1', 'st2', 'service']) { const dd = doors[did]; if (!dd || dd.open) continue; if (Math.abs(dd.pos.y - 1.2 - m.y) < 1.2 && Math.hypot(dd.pos.x - m.x, dd.pos.z - m.z) < 1.5) dispatch({ e: 'door', id: did, open: true }); }
  // catch
  if (m.catchCool <= 0) for (const id in poses) {
    const p = poses[id]; if (Math.hypot(p[0] - m.x, p[2] - m.z) < 0.95 && Math.abs(p[1] - m.y) < 1.2) {
      const free = rooms.filter(r => !r.occupant); const r = pick(free.length ? free : rooms);
      const pos = [+(r.cx + r.side * 0.8).toFixed(2), r.level * H, +(r.zc + r.side * 3.2).toFixed(2)];
      Hs.dragged = (Hs.dragged || 0) + 1; dispatch({ e: 'dragged', pid: id, room: r.num, pos });
      m.catchCool = 9; m.cool = 2.5; m.mode = 'roam'; m.goal = null; m.path = []; dispatch({ e: 'monMode', mode: 'roam' }); break;
    }
  }
}
function makeMonster() {
  const g = makeCharacter({ skin: 0xcfd2c8, uniform: 0x3a3a40, legs: 0x2a2a30, hairStyle: 'Без волос', hairColor: 0, hat: 'Нет', eyes: 'Круглые', eyeWhite: 0xfff6c0, noPupils: true, noNose: true, mouth: 0.38, neck: 0.32, vest: false, bigEars: true, scale: 1.38 });
  g.userData.isMonster = true; return g;
}

/* ---------- morning ---------- */
function morning() {
  G.phase = 'morning';
  const res = { night: CURRENT_NIGHT, previousRating: currentRating, previousReviews: currentReviews, guests: [], dragged: Hs.dragged || 0, money: G.money, tasksDone: 0, tasksFailed: 0 };
  for (const t of Object.values(G.tasks)) { if (t.done) res.tasksDone++; if (t.failed) res.tasksFailed++; }
  for (const g of Object.values(G.guests)) {
    const def = GTYPES[g.type]; let stars, text;
    if (g.room) { stars = g.correct ? 5 : 2; text = g.correct ? def.good : def.bad; const ts = Object.values(G.tasks).filter(t => t.room === g.room); ts.forEach(t => { if (t.failed) { stars -= 1; text += ' Заявку так и не выполнили.'; } }); if (g.intruded) { stars -= 1; text += ' И зачем ко мне вламывались?'; } }
    else if (g.state === 'outside' || g.state === 'leaving') { stars = 1; text = 'Не пустили. Стою под фонарём. Буду стоять.'; }
    else { stars = 1; text = 'Никто меня так и не заселил. Сидел в холле до утра.'; }
    stars = clamp(Math.round(stars), 1, 5);
    res.guests.push({ name: def.name, stars, text, room: g.room });
  }
  const sum = res.guests.reduce((s, g) => s + g.stars, 0), n = res.guests.length;
  res.reviews = currentReviews + n;
  res.rating = (currentReviews * currentRating + sum) / Math.max(1, res.reviews);
  dispatch({ e: 'morning', res });
}
function showMorning(res, fromSave = false) {
  S = 'morning'; G.phase = 'morning'; clearInterval(ringLoop);
  currentRating = res.rating; currentReviews = res.reviews;
  if (Net.isHost && !fromSave) {
    if (!campaign) campaign = freshCampaign(Net.mode === 'host' ? 'host' : 'solo');
    campaign.stage = 'complete'; campaign.night = 1; campaign.completedNights = [1]; campaign.rating = res.rating; campaign.reviews = res.reviews;
    campaign.money = res.money; campaign.checkpoint = null; campaign.lastResult = res; campaign.character = C; writeCampaign();
  }
  if (document.exitPointerLock) try { document.exitPointerLock(); } catch (e) {}
  ['wind', 'hum', 'drone', 'eng'].forEach(k => setAmb(k, 0, 0.5)); if (monSound) monSound.stop(); for (const k in radios) radios[k].stop();
  fade(1, 1200).then(() => {
    show('#hud', false); show('#touch', false); hideSub();
    const star = n => '★'.repeat(n) + '☆'.repeat(5 - n);
    $('#moEyebrow').textContent = `06:00 · Отзывы за ночь ${res.night}`;
    $('#moReviews').innerHTML = res.guests.map(g => `<article class="review"><header><b>${esc(g.name)}</b><span class="rs">${star(g.stars)}</span></header><p>${esc(g.text)}</p><footer>${g.room ? 'Номер ' + g.room : 'Без номера'}</footer></article>`).join('');
    const r = res.rating.toFixed(2).replace('.', ',');
    $('#moStats').innerHTML = `<div><b>${r} ★</b>рейтинг (был ${ratingText(res.previousRating)})</div><div><b>${res.tasksDone}/${res.tasksDone + res.tasksFailed}</b>заявок выполнено</div><div><b>${res.money} ₽</b>чаевые и находки</div><div><b>${res.dragged}</b>раз утащили</div>`;
    $('#moNote').innerHTML = `<p>${res.rating > res.previousRating ? 'Рейтинг ползёт вверх. Медленно, но ползёт.' : 'Ну… вы пережили ночь.'} Следующая глава отеля ещё строится. Сохранение дождётся её вместе с вами. — У.</p>`;
    $('#bNextNight').hidden = false; $('#bNextNight').disabled = true; $('#bNextNight').textContent = 'Ночь 2 — в разработке';
    show('#morning', true); fade(0, 800); setTimeout(() => sfx.bell(), 700);
  });
}
$('#bNextNight').onclick = () => {};
$('#bMenu').onclick = () => { writeCampaign(); location.reload(); };

/* ================= NPCs + AVATARS ================= */
function makeNPC(g) {
  const def = GTYPES[g.type]; const root = new T.Group();
  const count = def.triple && !g.solo ? 3 : 1;
  for (let i = 0; i < count; i++) { const c = makeCharacter(Object.assign({ name: '' }, def.char)); c.position.x = (i - (count - 1) / 2) * 0.75; c.position.z = -Math.abs(i - 1) * 0.3; root.add(c); }
  if (def.moths) { const mg = new T.Group(); mg.position.y = 2.1; root.add(mg); for (let i = 0; i < 5; i++) { const m = new T.Mesh(new T.PlaneGeometry(0.08, 0.06), B(0xe8e0c0, { side: T.DoubleSide })); mg.add(m); } root.userData.moths = mg; }
  if (g.type === 'wet') { const pd = new T.Mesh(new T.CircleGeometry(0.45, 12), M(0x2a4a5a, { transparent: true, opacity: 0.6, shininess: 120 })); pd.rotation.x = -Math.PI / 2; pd.position.y = 0.03; root.add(pd); }
  root.position.set(g.solo ? -2 : 0, 0, g.solo ? 3 : 18); world.add(root);
  npcs[g.id] = { g: root, tx: root.position.x, ty: 0, tz: root.position.z, tyaw: Math.PI, moving: 0, sit: false };
}
function standChar(c) { const L = c.userData.limbs; c.userData.sitting = false; L.lL.rotation.x = L.lR.rotation.x = 0; L.lL.position.y = L.lR.position.y = 0.6; L.body.position.y = 0; L.aL.rotation.x = L.aR.rotation.x = 0; }
function seatNPC(g, r) { const n = npcs[g.id]; if (!n) return; n.seated = true; n.g.position.copy(r.seatWorld); n.g.rotation.y = r.seatYaw; n.g.children.forEach(c => c.userData.limbs && sitChar(c)); n.g.position.y += 0.05; }
function updateNPCs(dt) {
  for (const id in npcs) {
    const n = npcs[id]; const g = G.guests[id];
    if (n.seated && (!g || g.state === 'inRoom')) continue;
    if (n.seated && g && g.state !== 'inRoom') n.seated = false;
    const k = Math.min(1, dt * 8);
    n.g.position.x = lerp(n.g.position.x, n.tx, k); n.g.position.y = lerp(n.g.position.y, n.ty, k); n.g.position.z = lerp(n.g.position.z, n.tz, k); n.g.rotation.y = angLerp(n.g.rotation.y, n.tyaw, k);
    n.g.children.forEach(c => c.userData.limbs && !n.sit && animateChar(c, dt, n.moving ? 1.5 : 0));
    if (n.g.userData.moths) { const t = performance.now() / 300; n.g.userData.moths.children.forEach((m, i) => { m.position.set(Math.cos(t + i * 1.3) * 0.45, Math.sin(t * 1.7 + i) * 0.2, Math.sin(t + i * 1.3) * 0.45); m.rotation.y = t * 3 + i; }); }
  }
}
function makeAvatar(id) {
  const p = players[id]; if (!p) return;
  const g = makeCharacter(Object.assign({}, p.char, { name: p.name })); const s = nameSprite(p.name); s.position.y = 2.45; g.add(s);
  g.position.set(0, -50, 0); world.add(g);
  avatars[id] = { g, t: null, cur: null, flash: false, crouch: false, stepAcc: 0, last: null };
}
function poseIn(id, d) { const a = avatars[id]; if (!a) return; a.t = d; if (!a.cur) a.cur = d.slice(); }
function updateAvatars(dt) {
  for (const id in avatars) {
    const a = avatars[id]; if (!a.t) continue; const k = Math.min(1, dt * 10);
    const prev = [a.cur[0], a.cur[2]];
    a.cur[0] = lerp(a.cur[0], a.t[0], k); a.cur[1] = lerp(a.cur[1], a.t[1], k); a.cur[2] = lerp(a.cur[2], a.t[2], k); a.cur[3] = angLerp(a.cur[3], a.t[3], k); a.cur[4] = a.t[4];
    a.flash = !!(a.t[5] & 1); a.crouch = !!(a.t[5] & 2);
    a.g.position.set(a.cur[0], a.cur[1] - (a.crouch ? 0.35 : 0), a.cur[2]); a.g.rotation.y = a.cur[3] + Math.PI;
    const sp = Math.hypot(a.cur[0] - prev[0], a.cur[2] - prev[1]) / Math.max(dt, 1e-3);
    animateChar(a.g, dt, sp);
    a.stepAcc += sp * dt; if (a.stepAcc > (a.crouch ? 1.2 : 0.75)) { a.stepAcc = 0; if (!a.crouch) sfx.step('hard', V3(a.cur[0], a.cur[1] + 0.2, a.cur[2])); }
  }
}
function avatarHead(id) { const a = avatars[id]; if (!a || !a.cur) return null; return V3(a.cur[0], a.cur[1] + 1.6, a.cur[2]); }

/* ================= LIGHTS + FLICKER ================= */
const localMul = { stair: [1, 1, 1], corr: { 1: 1, 2: 1 } };
let neonT = 0;
function updateFlicker(dt) {
  neonT -= dt;
  if (neonT <= 0) { const r = Math.random(); if (r < 0.12) { W.neonMat.map = TX.neonFull; neonT = rand(0.05, 0.3); } else if (r < 0.2) { W.neonMat.color.setScalar(0.12); if (G.outLights) W.signL.intensity = 0.2; neonT = rand(0.05, 0.15); } else { W.neonMat.map = TX.neonBroken; W.neonMat.color.setScalar(1); if (G.outLights) W.signL.intensity = 1.4; neonT = rand(0.4, 2.6); } }
  W.lamps.forEach(l => { if (!l.flick) return; l.t -= dt; if (l.t <= 0) { const off = Math.random() < 0.35; l.head.material.color.setHex(off ? 0x3a2a1a : 0xffb066); l.t = off ? rand(0.04, 0.2) : rand(0.3, 2.5); } });
  W.led.material.color.setHex(!G.power && (performance.now() % 900) < 450 ? 0xff2222 : (G.power ? 0x22aa44 : 0x330808));
}
const tmpV = new T.Vector3();
function updateZones() {
  const cp = cam.position, inside = insideBuilding(cp.x, cp.z), inSt = inStairwell(cp.x, cp.z);
  W.extG.visible = !inside;
  for (const L of [1, 2]) { const fg = W.floorG[L]; fg.visible = inside && (Math.abs(cp.y - (L * H + 1.6)) < 4.2 || inSt); }
  for (const r of rooms) r.group.visible = W.floorG[r.level].visible && r.center.distanceTo(cp) < 14;
}
function updateLights() {
  updateZones();
  let pw = G.power ? 1 : 0;
  if (G.power && G.powerFlicker != null) { const t = gameTime - G.powerFlicker; const seq = [[0.3, 0], [0.42, 1], [0.6, 0], [0.66, 1], [1.05, 0]]; const st = seq.find(x => t < x[0]); pw = st ? st[1] : 1; }
  W.lobbyLights.forEach(L => L.intensity = (W.lm3d ? 0.2 : 0.95) * pw); if (W.lm3d) LOBBY3D.update(pw, 0.016); W.bulbs.forEach(b => b.material.color.setHex(pw ? 0xffe3a6 : 0x221d18));
  W.corL.intensity = 0.55 * pw; if (W.connLights) { W.connLights.forEach(l => l.intensity = 0.55 * pw); W.connBulbs.forEach(b => b.material.color.setHex(pw ? 0xffe3a6 : 0x221d18)); } W.corBulb.material.color.setHex(pw ? 0xd8ffe0 : 0x221d18);
  W.stairLights.forEach((l, i) => l.intensity = 0.6 * pw * localMul.stair[i]); if (W.basLight) W.basLight.intensity = 0.35 * pw;
  W.stairBulbs.forEach((b, i) => b.material.color.setHex(pw && i <= 2 && localMul.stair[i] > 0.5 ? 0xe8f0e0 : 0x221d18));
  for (const L of [1, 2]) { const on = pw && !G.corrDark[L] ? localMul.corr[L] : 0; W.corridorLights[L].forEach(l => l.intensity = 0.85 * on); W.corridorBulbs[L].forEach(b => b.material.color.setHex(on > 0.5 ? 0xffe9c0 : 0x221d18)); }
  hemi.intensity = !insideBuilding(cam.position.x, cam.position.z) ? 0.55 : pw ? 0.13 : 0.035;
  moon.intensity = insideBuilding(cam.position.x, cam.position.z) ? 0 : 0.3;
  const inside = insideBuilding(cam.position.x, cam.position.z);
  world.fog.color.setHex(inside ? (pw ? 0x120d0a : 0x030304) : 0x0b0e17); world.background.setHex(inside ? (pw ? 0x120d0a : 0x030304) : 0x0b0e17);
  world.fog.density = inside ? (pw ? 0.035 : 0.075) : 0.02;
  if (inside && G.slammed && G.outLights) setOutsideLights(false); else if (!inside && !G.outLights) setOutsideLights(true);
  // room light pool
  const lit = rooms.filter(r => r.light && pw).sort((a, b) => a.lightPos.distanceTo(cam.position) - b.lightPos.distanceTo(cam.position));
  roomPool.forEach((l, i) => { const r = lit[i]; if (r) { l.position.copy(r.lightPos); l.intensity = 0.9; } else l.intensity = 0; });
  // remote flashlights pool
  const fl = Object.keys(avatars).filter(id => avatars[id].flash && avatars[id].cur).sort((a, b) => avatarHead(a).distanceTo(cam.position) - avatarHead(b).distanceTo(cam.position));
  assignPool();
  remoteFlashes.forEach((s, i) => { const id = fl[i]; if (!id) { s.intensity = 0; return; } const a = avatars[id]; const hp = avatarHead(id); s.position.copy(hp); s.intensity = 1.5; const yw = a.cur[3], pt = a.cur[4]; s.target.position.set(hp.x - Math.sin(yw) * Math.cos(pt) * 5, hp.y + Math.sin(pt) * 5, hp.z - Math.cos(yw) * Math.cos(pt) * 5); });
}

/* ================= DIRECTOR OF FEAR (local scares) ================= */
const D = { tension: 0, cool: 40, last: '', fx: [] };
function directorUpdate(dt) {
  if (!G.clockOn || G.phase !== 'night' || uiOpen) return;
  D.cool -= dt; D.fx = D.fx.filter(f => f.update(dt) !== false);
  const inSt = inStairwell(P.x, P.z), lvl = Math.round(P.feet / H);
  const alone = !Object.values(avatars).some(a => a.cur && Math.hypot(a.cur[0] - P.x, a.cur[2] - P.z) < 8 && Math.abs(a.cur[1] - P.feet) < 2);
  const dark = !G.power || (lvl >= 1 && !inSt && G.corrDark[lvl]);
  let rate = 1 + (inSt ? 1.6 : 0) + (alone ? 0.8 : 0) + (dark ? 0.8 : 0) + (flashOn ? 0 : 0.6);
  if (inLobbyArea(P.x, P.z, P.feet) && G.power) rate *= 0.35;
  D.tension += rate * dt * (NIGHT_LEN < 500 ? 1.7 : 1);
  if (D.tension > 55 && D.cool <= 0) { D.tension = 0; D.cool = NIGHT_LEN < 500 ? 35 : 60; triggerScare(inSt, lvl); }
}
function triggerScare(inSt, lvl) {
  const rm = roomAt(P.x, P.feet, P.z);
  let pool;
  if (inSt) pool = ['fall', 'runner', 'sitter', 'ball', 'stairsOff', 'stepsAbove'];
  else if (rm) pool = ['knock', 'whisperRoom', rm.theme === 'kids' ? 'bear' : 'knock', rm.theme === 'hunter' ? 'head' : 'stepsCorr'];
  else if (lvl >= 1) pool = ['peek', 'slam', 'phoneRoom', 'corrFlicker'];
  else if (inLobbyArea(P.x, P.z, P.feet)) pool = ['elevator', 'portrait', 'bellSelf'];
  else return;
  pool = pool.filter(k => k !== D.last); const k = pick(pool); D.last = k; SCARES[k] && SCARES[k](lvl, rm);
}
const dark0 = () => B(0x050505);
function shadowFigure(sit) {
  const g = new T.Group(), m = dark0();
  const body = new T.Mesh(cyl(0.22, 0.3, sit ? 0.8 : 1.4, 7), m); body.position.y = sit ? 0.6 : 1.0; g.add(body);
  const head = new T.Mesh(sph(0.2), m); head.position.y = sit ? 1.15 : 1.9; g.add(head);
  for (const s of [-1, 1]) { const e = new T.Mesh(sph(0.03), B(0xd8d8c0)); e.position.set(s * 0.07, sit ? 1.18 : 1.93, 0.17); g.add(e); }
  world.add(g); return g;
}
const SCARES = {
  fall(lvl) {
    const kinds = [() => box(0.5, 0.5, 0.5, M(0x6a4a2a), 0, 0, 0), () => { const c = new T.Group(); box(0.45, 0.05, 0.45, M(0x3a2519), 0, 0.45, 0, c); box(0.05, 0.5, 0.45, M(0x3a2519), -0.2, 0.7, 0, c); world.add(c); return c; }, () => box(0.25, 0.12, 0.1, M(0x2a1a1a), 0, 0, 0)];
    const o = pick(kinds)(); const y0 = Math.min(42, P.feet + rand(6, 10)); o.position.set(-5.2, y0, rand(-6.0, -4.8)); let vy = 0, hit = false, t = 0;
    sfx.whoosh(V3(-5.2, P.feet + 3, -5.3));
    D.fx.push({ update(dt) { t += dt; if (!hit) { vy -= 14 * dt; o.position.y += vy * dt; o.rotation.x += dt * 3; o.rotation.z += dt * 2; if (o.position.y <= 0.25) { o.position.y = 0.25; hit = true; sfx.thud(V3(-5.2, 0.5, -5.3)); if (P.feet < 4) shake = 0.6; } } if (t > 9) { world.remove(o); return false; } } });
  },
  runner(lvl) {
    const y = (lvl + 1) * H; const f = shadowFigure(false); let t = 0; const a = V3(-10.8, y, -5.0), b = V3(-5.6, y, -5.4); f.position.copy(a); f.lookAt(b.x, y, b.z);
    sfx.run(V3(-8, y + 1, -5.2));
    D.fx.push({ update(dt) { t += dt / 0.8; f.position.lerpVectors(a, b, Math.min(1, t)); if (t >= 1) { world.remove(f); return false; } } });
  },
  sitter(lvl) {
    const onUp = P.z > -8.6; const f = shadowFigure(true); const y = lvl * H;
    if (onUp && lvl <= 1) { f.position.set(-6.9, y + 1.7, -11.3); f.rotation.y = 0; } else { f.position.set(-5.5, y + 0.35, -7.3); f.rotation.y = 0; }
    let t = 0, seen = 0;
    D.fx.push({ update(dt) { t += dt; const d = f.position.distanceTo(cam.position); tmpV.copy(f.position).add(V3(0, 1, 0)).sub(cam.position).normalize(); const look = tmpV.dot(cam.getWorldDirection(new T.Vector3())); if (look > 0.92) seen += dt; if (d < 4 || seen > 1.0 || t > 14) { G.flickUntil = gameTime + 0.45; later(0.2, () => world.remove(f)); if (d < 6) sfx.whoosh(f.position); return false; } } });
  },
  ball(lvl) {
    const y = lvl * H; const ball = new T.Mesh(sph(0.12, 10, 8), M(0xb8202a, { shininess: 40 })); world.add(ball);
    const pts = [V3(-5.5, y + 1.82, -11.2), V3(-5.5, y + 1.82, -10.8), V3(-5.5, y + 0.12, -6.4), V3(-5.2, y + 0.12, -5.0), V3(-5.0, y + 0.12, -3.0)];
    let i = 0, u = 0, acc = 0;
    D.fx.push({ update(dt) { if (i >= pts.length - 1) { if ((u += dt) > 6) { world.remove(ball); return false; } return; } const a = pts[i], b = pts[i + 1]; const len = a.distanceTo(b); u += dt * 2.2 / len; const bounce = i === 1 ? Math.abs(Math.sin(u * len / 0.28 * Math.PI)) * 0.12 : 0; ball.position.lerpVectors(a, b, Math.min(1, u)); ball.position.y += bounce; acc += dt * 2.2; if (i === 1 && acc > 0.28) { acc = 0; sfx.bounce(ball.position); } if (u >= 1) { u = 0; i++; } } });
  },
  stairsOff(lvl) { const i = clamp(lvl, 0, 2); localMul.stair[i] = 0; sfx.zap(V3(-6.5, lvl * H + 2.8, -6.8)); later(3.5, () => { localMul.stair[i] = 1; sfx.zap(V3(-6.5, lvl * H + 2.8, -6.8)); }); },
  stepsAbove(lvl) { const y = (lvl + 1) * H + 0.3; for (let i = 0; i < 7; i++) setTimeout(() => sfx.step('hard', V3(-5.5, y, -6.0)), i * 520); setTimeout(() => sfx.sniff(V3(-5.5, y + 1, -6.0)), 7 * 520 + 900); },
  stepsCorr(lvl) { for (let i = 0; i < 5; i++) setTimeout(() => sfx.step('soft', V3(P.x + 1, lvl * H + 0.3, 0)), i * 600); },
  peek(lvl) {
    const cands = rooms.filter(r => r.level === lvl).map(r => ({ r, x: r.cx + r.side * -1.4 })).filter(c => { const dx = c.x - P.x; const fwd = -Math.sin(yaw) * dx; return Math.abs(dx) > 4 && Math.abs(dx) < 11 && fwd > 0; });
    if (!cands.length) { SCARES.slam(lvl); return; }
    const c = pick(cands); const h = new T.Group(); const head = new T.Mesh(sph(0.2), M(0xd8d0c0)); h.add(head); for (const s of [-1, 1]) { const e = new T.Mesh(sph(0.05), B(0x050505)); e.position.set(s * 0.07, 0.03, 0.17); h.add(e); }
    h.position.set(c.x + 0.55, lvl * H + 1.55, c.r.zc - c.r.side * 0.12); h.lookAt(cam.position); world.add(h); sfx.whoosh(h.position);
    let t = 0; D.fx.push({ update(dt) { t += dt; if (t > 0.7) { world.remove(h); return false; } } });
  },
  slam(lvl) { const r = pick(rooms.filter(x => x.level === lvl)); if (!r) return; sfx.slam(r.door.pos); shake = 0.5; },
  phoneRoom(lvl) { const r = pick(rooms.filter(x => x.level === lvl && !x.occupant)) || pick(rooms); sfx.ring(r.radioPos); setTimeout(() => sfx.ring(r.radioPos), 3000); },
  corrFlicker(lvl) { if (!localMul.corr[lvl]) return; let n = 0; const iv = setInterval(() => { localMul.corr[lvl] = localMul.corr[lvl] ? 0 : 1; if (++n > 7) { clearInterval(iv); localMul.corr[lvl] = 1; } }, 160 + Math.random() * 200); sfx.zap(V3(P.x, lvl * H + 2.8, 0)); },
  knock(lvl, rm) { const r = rm || pick(rooms.filter(x => x.level === lvl)); if (!r) return; sfx.knock(3, r.door.pos); },
  whisperRoom(lvl, rm) { noise(1.6, 0.12, 2400, 4, 'bandpass', 0, 0.4, V3(P.x - Math.sin(yaw) * -1.5, P.feet + 1.6, P.z - Math.cos(yaw) * -1.5)); },
  bear(lvl, rm) { if (rm && rm.bear) { rm.bear.lookAt(V3(P.x, rm.bear.getWorldPosition(new T.Vector3()).y, P.z)); sfx.bounce(rm.bear.getWorldPosition(new T.Vector3())); } },
  head(lvl, rm) { if (rm && rm.headGroup) { anim(1.2, k => rm.headGroup.rotation.y = -k * 0.9); noise(0.5, 0.15, 500, 3, 'bandpass', 0, 0.1, rm.headGroup.getWorldPosition(new T.Vector3())); } },
  elevator() { const p = W.elevPos || V3(-8.3, 1.4, 3.3); sfx.ding(p); anim(2.6, k => { const o = Math.sin(Math.min(1, k * 2.5) * Math.PI) * 0.35; W.elevDoors[0].position.z = 2.87 - o; W.elevDoors[1].position.z = 3.73 + o; }); },
  portrait() { if (W.portraitMat.map !== TX.portraitB) W.portraitMat.map = TX.portraitB; else W.portraitMat.map = TX.portraitA; },
  bellSelf() { sfx.bell(W.bellPos || V3(-1.25, 1.2, -0.78)); },
};
let elevKnocked = false;
window.elevatorInteract = pos => { if (!elevKnocked) { elevKnocked = true; sfx.knock(3, pos); toast('«Не работает». Изнутри кто-то трижды постучал.', 4); } else toast('Тишина. Правило №3 говорит не открывать.', 3.5); };

/* ================= LABELS / ACTIONS used by the world ================= */
function hasTask(room, kind) { return Object.values(G.tasks).some(t => t.room === room && t.kind === kind && t.revealed && !t.done && !t.failed); }
window.doorLabel = d => {
  if (d.kind === 'front') return P.z < 5.9 ? 'Входная дверь' : d.open ? 'Закрыть дверь' : 'Открыть дверь';
  if (d.kind === 'basement') return 'Дверь в подвал';
  if (d.kind === 'room') { const r = d.room; if (!d.open && item === 'towels' && hasTask(r.num, 'towels')) return `Отдать полотенца в ${r.num}`; if (d.open) return 'Закрыть'; return r.occupant ? `Номер ${r.num} · гость внутри` : `Открыть номер ${r.num}`; }
  return d.open ? 'Закрыть' : 'Открыть';
};
window.doorInteract = d => { if (d.kind === 'room' && !d.open && item === 'towels' && hasTask(d.room.num, 'towels')) { act({ a: 'deliver', room: d.room.num }); setTimeout(() => { if (item === 'towels') setItem(null); }, 400); return; } act({ a: 'door', id: d.id }); };
window.deskLabel = () => Object.values(G.guests).some(g => g.state === 'waiting' || g.state === 'sofa') ? 'Заселить гостя' : 'Стойка ресепшена';
window.deskInteract = () => act({ a: 'desk' });
window.phoneLabel = () => G.phone === 'ring' ? 'Снять трубку' : 'Телефон';
window.masterKeyLabel = () => G.mkey == null ? 'Взять мастер-ключ' : G.mkey === Net.id ? 'Повесить мастер-ключ' : 'Доска с ключами';
window.fuseLabel = () => !G.power ? 'Включить свет' : G.corrDark[1] ? 'Включить автомат 2-го этажа' : G.corrDark[2] ? 'Включить автомат 3-го этажа' : 'Электрощиток';
window.sitDown = (x, z, face, eye, label) => {
  if (SIT) return; SIT = { eye: eye || 1.15, x: P.x, z: P.z, face }; P.x = x; P.z = z; yaw = face; pitch = 0; toast(label || 'Ты сел. Любая клавиша движения — встать.', 2.2);
};
function standUp() { if (!SIT) return; P.x = SIT.x; P.z = SIT.z; SIT = null; }
window.takeItem = kind => { setItem(kind); sfx.paper(); toast(kind === 'towels' ? 'Взял полотенца. Отнеси их к двери номера.' : 'Взял гаечный ключ.', 2.5); };
window.sinkLabel = r => item === 'wrench' && hasTask(r.num, 'tap') ? 'Починить кран' : 'Раковина';
window.sinkInteract = r => { if (item === 'wrench' && hasTask(r.num, 'tap')) { sfx.wrench(r.sinkPos); act({ a: 'fix', room: r.num }); } else toast(hasTask(r.num, 'tap') ? 'Кран течёт. Нужен гаечный ключ из «Служебного».' : 'Из крана капает. Медленно, как часы.', 3); };
window.radioLabel = r => r.radio ? 'Выключить радио' : 'Радио';
window.searchContainer = c => act({ a: 'search', id: c.id });
const setMK = v => { if (W.setMK) W.setMK(v); else W.masterKey.visible = v; };
function setItem(k) { item = k; renderInv(); }
function syncHeld() { try { Held.sync(cam, item, G && G.mkey === Net.id); } catch (e) {} }
function renderInv() { const out = []; if (item) out.push(`В руках: <span>${item === 'towels' ? 'полотенца' : 'гаечный ключ'}</span>`); if (G.mkey === Net.id) out.push('<span>Мастер-ключ у тебя</span>'); if (Voice.mic) out.push(Voice.muted ? 'Микрофон выключен (V)' : 'Микрофон включён (V)'); $('#inv').innerHTML = out.join('<br>'); syncHeld(); }

/* ---------- notes ---------- */
window.openNote = (kind, i) => {
  uiOpen = 'note'; const p = $('#notePaper');
  if (kind === 'manager') { p.className = 'paper hand'; p.innerHTML = `<p>Для ночной смены.</p><p>1. Сначала свет: щиток за дверью «Служебное».</p><p>2. Гостей селите по их нуждам. Не угадаете — пожалуются. Жалобы у нас… оживают.</p><p>3. Архив броней — в компьютере, откроется при заселении.</p><p>4. Мастер-ключ один. Не теряйте.</p><p>5. Услышите на лестнице дыхание — присядьте (C) и не шумите.</p><p style="text-align:right">— У.</p>`; }
  else if (kind === 'rules') { p.className = 'paper print'; p.innerHTML = `<h3>Правила отеля</h3><ol>${RULES.map(r => `<li>${r}</li>`).join('')}</ol>`; }
  else { p.className = 'paper hand'; p.innerHTML = `<p>${esc(LORE[i])}</p><p style="text-align:right">— записка прошлой смены</p>`; }
  $('#noteHint').textContent = isTouch ? 'Нажми, чтобы закрыть' : 'E или клик — закрыть';
  show('#note', true); sfx.paper();
};
function closeNote() { show('#note', false); uiOpen = null; }
$('#note').onclick = () => { if (uiOpen === 'note') closeNote(); };

/* ---------- pause menu ---------- */
function openPause() {
  if (S !== 'play' || uiOpen) return;
  uiOpen = 'pause'; saveCheckpoint(true);
  if (document.exitPointerLock) try { document.exitPointerLock(); } catch (e) {}
  $('#pauseNote').textContent = Net.mode === 'solo'
    ? 'Смена сохранена и поставлена на паузу. Можно закрыть вкладку и продолжить позже.'
    : Net.mode === 'host'
      ? 'Смена сохранена. В кооперативе общая смена продолжается, пока открыто меню.'
      : 'Общая смена хранится у хоста и продолжается, пока открыто меню.';
  show('#pause', true);
}
function closePause() { if (uiOpen !== 'pause') return; show('#pause', false); uiOpen = null; }
$('#bResume').onclick = closePause;
$('#bPauseMenu').onclick = () => { saveCheckpoint(true); writeClientSession(); location.reload(); };

/* ---------- check-in UI ---------- */
let ckGuest = null, ckRoom = null;
function openCheckin(gid) {
  const g = G.guests[gid]; if (!g) return; ckGuest = g; ckRoom = null; uiOpen = 'checkin';
  if (document.exitPointerLock) try { document.exitPointerLock(); } catch (e) {}
  const def = GTYPES[g.type];
  drawFace($('#ckFace'), def.char);
  $('#ckName').textContent = def.name;
  $('#ckDoc').innerHTML = `Год рождения: <b>${def.year}</b><br>Бронь: ${g.type === 'twins' ? 'на одного человека' : 'есть'}`;
  $('#ckSays').textContent = '«' + def.says + '»';
  $('#ckNotes').innerHTML = ''; document.querySelectorAll('.ck-ask button').forEach(b => b.disabled = false);
  $('#ckArchive').innerHTML = ARCHIVE.map(a => `<li>${a.year} · ${esc(a.name)} · номер ${a.room}</li>`).join('');
  setCkTab('rooms'); renderRooms(); $('#ckGive').disabled = true; $('#ckGive').textContent = 'Выдать ключ';
  show('#checkin', true); sfx.paper();
}
function renderRooms() {
  const box = $('#ckRooms'); box.innerHTML = '';
  rooms.forEach(r => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'rc'; b.disabled = !!r.occupant; b.setAttribute('aria-pressed', String(ckRoom === r.num));
    b.innerHTML = `<b>${r.num}</b><span>${r.floor} этаж · ${r.window ? 'окно' : 'без окна'} · ${r.bath}<br>${r.beds === 2 ? 'две кровати' : 'одна кровать'} · ${r.far ? 'дальний' : 'у лестницы'}</span><i>${r.occupant ? 'занят' : THEME_NAME[r.theme]}</i>`;
    b.onclick = () => { ckRoom = r.num; sfx.ui(); renderRooms(); $('#ckGive').disabled = false; $('#ckGive').textContent = 'Выдать ключ ' + r.num; };
    box.appendChild(b);
  });
}
function setCkTab(t) { document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === t))); show('#ckRooms', t === 'rooms'); show('#ckArchive', t === 'archive'); }
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { setCkTab(b.dataset.tab); sfx.ui(); });
document.querySelectorAll('.ck-ask button').forEach(b => b.onclick = () => {
  if (!ckGuest) return; const def = GTYPES[ckGuest.type]; const q = b.dataset.q; b.disabled = true; sfx.ui();
  const li = document.createElement('li'); li.textContent = q === 'look' ? def.look : q === 'purpose' ? '«' + def.purpose + '»' : '«' + def.wish + '»'; $('#ckNotes').appendChild(li);
});
function closeCheckin(remote) { show('#checkin', false); uiOpen = null; ckGuest = null; if (!remote) act({ a: 'deskClose' }); }
$('#ckClose').onclick = () => closeCheckin(false);
$('#ckGive').onclick = () => { if (!ckGuest || !ckRoom) return; act({ a: 'checkin', gid: ckGuest.id, room: ckRoom }); show('#checkin', false); uiOpen = null; ckGuest = null; };
$('#ckWait').onclick = () => { if (!ckGuest) return; act({ a: 'wait', gid: ckGuest.id }); show('#checkin', false); uiOpen = null; ckGuest = null; };
$('#ckRefuse').onclick = () => { if (!ckGuest) return; act({ a: 'refuse', gid: ckGuest.id }); show('#checkin', false); uiOpen = null; ckGuest = null; };

/* ---------- HUD ---------- */
let hudT = 0;
function updateHUD(dt) {
  hudT += dt; if (hudT < 0.25) return; hudT = 0;
  $('#clock').textContent = G.clockOn ? fmtClock(G.clock) : '22:58';
  $('#money').textContent = G.money + ' ₽';
  const nowT = G.clock * NIGHT_LEN;
  const list = Object.values(G.tasks).filter(t => t.revealed).slice(-5);
  $('#tasks').innerHTML = list.map(t => { const left = Math.max(0, Math.round(t.deadline - nowT)); const tm = t.done ? '✓' : t.failed ? '✗' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; return `<li class="${t.done ? 'done' : t.failed ? 'fail' : ''}">${esc(t.short)} <b>${tm}</b></li>`; }).join('');
  renderInv();
  let o;
  const anyInside = insideBuilding(P.x, P.z);
  if (!anyInside && !G.slammed) o = 'Зайди в отель';
  else if (!G.power) o = 'Включите свет: щиток в конце коридора «Служебное»';
  else if (G.phone === 'ring') o = 'Звонит телефон на стойке — ответь';
  else if (Object.values(G.guests).some(g => g.state === 'waiting')) o = 'Гость ждёт у стойки — заселите его';
  else if (list.some(t => !t.done && !t.failed)) o = 'Выполните заявки (справа)';
  else if (G.monster) o = 'Не шумите. Шумоед слушает. Присесть — C';
  else if (!G.clockOn) o = 'Дождись звонка управляющего';
  else o = 'Обходите этажи. Ждите гостей и звонков';
  setObjective(o);
}

/* ================= MAIN LOOP ================= */
let menuT = 0, poseSendT = 0;
function updateMenu(dt) { assignPool(); if (W.extG) { W.extG.visible = true; W.floorG[1].visible = W.floorG[2].visible = false; } menuT += dt; const a = Math.sin(menuT * 0.06) * 0.75; cam.position.set(Math.sin(a) * 30, 5.5 + Math.sin(menuT * 0.2) * 0.3, 9 + Math.cos(a) * 30); cam.lookAt(0, 9, 0); updateFlicker(dt); }
function updatePlay(dt) {
  gameTime += dt; checkpointT += dt; runTimers(); runAnims(dt); updateDoors(dt); updateFlicker(dt);
  updatePlayer(dt);
  if (Net.isHost) hostUpdate(dt);
  else { poseSendT += dt; if (poseSendT > 1 / 12) { poseSendT = 0; Net.toHost('pos', myPose()); } }
  updateAvatars(dt); updateNPCs(dt); updateMonsterView(dt); updateLights(); directorUpdate(dt); updateHUD(dt);
  updateListener(cam); voiceUpdate(avatarHead);
  saveCheckpoint();
  if (G.silOnce !== true && Math.hypot(P.x - 4.6, P.z - 6) < 15 && !insideBuilding(P.x, P.z)) { G.silOnce = true; later(0.5, () => W.silWin.material = W.winM.dark); }
}
function updateMonsterView(dt) {
  if (!monObj) return; const t = monObj.userData.t; if (!t) return;
  const k = Math.min(1, dt * 8); const prev = monObj.position.clone();
  monObj.position.x = lerp(monObj.position.x, t[0], k); monObj.position.y = lerp(monObj.position.y, t[1], k); monObj.position.z = lerp(monObj.position.z, t[2], k); monObj.rotation.y = angLerp(monObj.rotation.y, t[3], k);
  const sp = prev.distanceTo(monObj.position) / Math.max(dt, 1e-3); animateChar(monObj, dt, sp * 0.8);
  if (monSound) { monSound.setPos(V3(monObj.position.x, monObj.position.y + 2, monObj.position.z)); monSound.setVol(t[4] ? 1.6 : 0.8); }
  const L = monObj.userData.limbs; if (L) L.head.rotation.z = Math.sin(performance.now() / 400) * 0.15;
  setAmb('drone', monObj.position.distanceTo(cam.position) < 12 ? 0.08 : 0.02, 1);
}
let last = performance.now();
function loop(t) {
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  try {
    if (S === 'menu') { updateMenu(dt); renderer.render(world, cam); }
    else if (S === 'creator') { if (cDrag == null) cRot += dt * 0.25; if (cChar) cChar.rotation.y = cRot; renderer.render(cScene, cCam); }
    else if (S === 'lobby') { updateMenu(dt); renderer.render(world, cam); }
    else if (S === 'drive') { updateDrive(dt); renderer.render(world, cam); }
    else if (S === 'play') { if (!(uiOpen === 'pause' && Net.mode === 'solo')) updatePlay(dt); renderer.render(world, cam); }
  } catch (e) { console.error(e); }
  requestAnimationFrame(loop);
}

/* ================= INPUT ================= */
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (S === 'intro' && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); nextCard(); return; }
  if (S === 'drive' && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); skipDrive(); return; }
  if (S !== 'play') return;
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.code === 'KeyE') { if (SIT && !uiOpen) { standUp(); return; } if (uiOpen === 'note') closeNote(); else if (!uiOpen && curInter) curInter.action(); }
  else if (e.code === 'KeyF' && !uiOpen) { flashOn = !flashOn; sfx.tick(); }
  else if (e.code === 'KeyC' && !uiOpen) { crouch = !crouch; }
  else if (e.code === 'KeyV') { const m = voiceToggleMute(); if (m !== null) toast(m ? 'Микрофон выключен' : 'Микрофон включён', 1.5); }
  else if (e.code === 'Escape') {
    if (uiOpen === 'note') closeNote();
    else if (uiOpen === 'checkin') closeCheckin(false);
    else if (uiOpen === 'pause') closePause();
    else if (!uiOpen) openPause();
  }
  if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'ControlLeft') e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
addEventListener('beforeunload', () => { saveCheckpoint(true); writeClientSession(); });
canvas.addEventListener('click', () => {
  if (S === 'drive') { skipDrive(); return; }
  if (S === 'play' && !isTouch && !locked && !uiOpen && canvas.requestPointerLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
});
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; });
addEventListener('mousedown', () => { if (S === 'play' && uiOpen === 'note' && locked) closeNote(); });
addEventListener('mousemove', e => { if (S !== 'play' || uiOpen) return; if (locked || (e.buttons & 1)) { yaw -= e.movementX * 0.0022; pitch = clamp(pitch - e.movementY * 0.0022, -1.4, 1.4); } });
// touch
const lookTouches = {};
const sz = $('#stickZone'), knob = $('#stick i');
function moveStick(t) { let dx = t.clientX - stick.ox, dy = t.clientY - stick.oy; const d = Math.hypot(dx, dy), m = 50; if (d > m) { dx *= m / d; dy *= m / d; } stick.x = dx / m; stick.y = -dy / m; knob.style.transform = `translate(${dx}px,${dy}px)`; }
sz.addEventListener('touchstart', e => { e.preventDefault(); const t = e.changedTouches[0]; stick.id = t.identifier; const r = $('#stick').getBoundingClientRect(); stick.ox = r.left + r.width / 2; stick.oy = r.top + r.height / 2; moveStick(t); }, { passive: false });
sz.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === stick.id) moveStick(t); }, { passive: false });
const endStick = e => { for (const t of e.changedTouches) if (t.identifier === stick.id) { stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; } };
sz.addEventListener('touchend', endStick); sz.addEventListener('touchcancel', endStick);
canvas.addEventListener('touchstart', e => { if (S !== 'play') return; for (const t of e.changedTouches) lookTouches[t.identifier] = { x: t.clientX, y: t.clientY }; }, { passive: true });
canvas.addEventListener('touchmove', e => { if (S !== 'play') return; e.preventDefault(); for (const t of e.changedTouches) { const p = lookTouches[t.identifier]; if (!p) continue; yaw -= (t.clientX - p.x) * 0.0055; pitch = clamp(pitch - (t.clientY - p.y) * 0.0055, -1.4, 1.4); p.x = t.clientX; p.y = t.clientY; } }, { passive: false });
const endLook = e => { for (const t of e.changedTouches) delete lookTouches[t.identifier]; };
canvas.addEventListener('touchend', endLook); canvas.addEventListener('touchcancel', endLook);
$('#tE').onclick = () => { if (uiOpen === 'note') closeNote(); else if (!uiOpen && curInter) curInter.action(); };
$('#tF').onclick = () => { if (!uiOpen) flashOn = !flashOn; };
$('#tC').onclick = () => { crouch = !crouch; };
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); if (cam) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); } frameCreator(); });

/* ================= BOOT ================= */
Promise.race([LOBBY3D.promise, new Promise(r => setTimeout(r, 15000))]).catch(() => {}).then(() => {
setupWorld(1);
refreshMenuSave(); show('#loading', false); show('#menu', true); S = 'menu';
requestAnimationFrame(loop);
});
window.__br = { spawnMon: () => spawnMonster(), sim(sec) { const n = Math.round(sec / 0.05); for (let i = 0; i < n; i++) { if (S === "play") updatePlay(0.05); else if (S === "drive") updateDrive(0.05); } }, get S() { return S; }, info: () => renderer.info.render, scene: () => world, G: () => G, P, rooms, act, Net, players: () => players, get uiOpen() { return uiOpen; }, set yaw(v) { yaw = v; }, set pitch(v) { pitch = v; }, keys, teleport(x, y, z) { P.x = x; P.feet = y; P.z = z; }, hs: Hs, guests: () => G.guests };
})();
