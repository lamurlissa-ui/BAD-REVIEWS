/* BAD REVIEWS — networking: PeerJS rooms by code (host-authoritative), local tab test, proximity voice */
'use strict';
const PREFIX = 'badreviews-uyut-';
const Net = {
  mode: 'solo', id: 'solo', code: '', peer: null, conns: new Map(), host: null, handlers: {}, local: false, bc: null,
  on(t, f) { this.handlers[t] = f; },
  _recv(from, msg) { const h = this.handlers[msg.t]; if (h) try { h(msg.d, from); } catch (e) { console.error(e); } },
  _send(conn, t, d) { try { conn.send({ t, d }); } catch (e) {} },
  broadcast(t, d, except) { for (const [id, c] of this.conns) if (id !== except) this._send(c, t, d); },
  toHost(t, d) { if (this.host) this._send(this.host, t, d); },
  sendTo(id, t, d) { const c = this.conns.get(id); if (c) this._send(c, t, d); },
  get isHost() { return this.mode === 'host' || this.mode === 'solo'; },
  get online() { return this.mode === 'host' || this.mode === 'client'; },
};
const netAvailable = () => typeof window.Peer === 'function' && typeof RTCPeerConnection !== 'undefined';
function makeCode() { const a = 'АБВГДЕЖИКЛМНПРСТУФХЦЧШ'; const l = 'ABVGDEZIKLMNPRSTUFHCQW'; let c = ''; for (let i = 0; i < 4; i++) c += l[Math.floor(Math.random() * l.length)]; return c; }

function netHost(cb) {
  const code = makeCode(); Net.code = code;
  if (Net.local) {
    const id = PREFIX + code; Net.id = id; Net.mode = 'host';
    const bc = new BroadcastChannel('br-' + code); Net.bc = bc;
    bc.onmessage = e => {
      const m = e.data; if (m.to !== id) return;
      if (m.t === '__hello') { Net.conns.set(m.from, { send: x => bc.postMessage(Object.assign({ from: id, to: m.from }, x)) }); return; }
      if (m.t === '__bye') { Net.conns.delete(m.from); Net._recv(m.from, { t: 'leave', d: {} }); return; }
      Net._recv(m.from, m);
    };
    addEventListener('beforeunload', () => Net.broadcast('hostgone', {}));
    setTimeout(() => cb(null, code), 50); return;
  }
  const peer = new Peer(PREFIX + code, { debug: 1 }); Net.peer = peer;
  peer.on('open', id => { Net.id = id; Net.mode = 'host'; cb(null, code); });
  peer.on('connection', conn => {
    conn.on('open', () => { Net.conns.set(conn.peer, conn); });
    conn.on('data', m => Net._recv(conn.peer, m));
    conn.on('close', () => { Net.conns.delete(conn.peer); Net._recv(conn.peer, { t: 'leave', d: {} }); });
  });
  peer.on('call', voiceAnswer);
  peer.on('error', e => { if (Net.mode !== 'host') cb(e); else console.warn(e); });
  peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
}
function netJoin(code, cb) {
  code = code.trim().toUpperCase(); Net.code = code; const hostId = PREFIX + code;
  if (Net.local) {
    const id = 'p' + Math.random().toString(36).slice(2, 8); Net.id = id; Net.mode = 'client';
    const bc = new BroadcastChannel('br-' + code); Net.bc = bc;
    Net.host = { send: x => bc.postMessage(Object.assign({ from: id, to: hostId }, x)) };
    bc.onmessage = e => { const m = e.data; if (m.to !== id) return; Net._recv('host', m); };
    Net.host.send({ t: '__hello' }); addEventListener('beforeunload', () => Net.host.send({ t: '__bye' }));
    setTimeout(() => cb(null), 50); return;
  }
  const peer = new Peer({ debug: 1 }); Net.peer = peer; let done = false;
  const fail = e => { if (!done) { done = true; cb(e); } };
  peer.on('open', id => {
    Net.id = id;
    const conn = peer.connect(hostId, { reliable: true });
    const to = setTimeout(() => fail({ type: 'timeout' }), 15000);
    conn.on('open', () => { clearTimeout(to); Net.mode = 'client'; Net.host = conn; done = true; cb(null); });
    conn.on('data', m => Net._recv('host', m));
    conn.on('close', () => Net._recv('host', { t: 'hostgone', d: {} }));
  });
  peer.on('call', voiceAnswer);
  peer.on('error', e => { if (Net.mode !== 'client') fail(e); else console.warn(e); });
}
function netErrorText(e) {
  const t = e && e.type;
  if (t === 'peer-unavailable' || t === 'timeout') return 'Комната не найдена. Проверь код и что хост не закрыл вкладку.';
  if (t === 'unavailable-id') return 'Такой код уже занят. Попробуй ещё раз.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Нет связи с сервером комнат. Сетевая игра работает только на сайте игры (GitHub Pages), не в превью.';
  if (t === 'browser-incompatible') return 'Этот браузер не поддерживает игру по сети. Попробуй Chrome.';
  return 'Не получилось подключиться' + (t ? ` (${t})` : '') + '.';
}

/* ---------- proximity voice (PeerJS media calls, full mesh) ---------- */
const Voice = { stream: null, calls: {}, nodes: {}, mic: false, muted: false };
async function voiceEnable() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nomedia');
  Voice.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  Voice.mic = true; return true;
}
function voiceToggleMute() { if (!Voice.stream) return null; Voice.muted = !Voice.muted; Voice.stream.getAudioTracks().forEach(t => t.enabled = !Voice.muted); return Voice.muted; }
function silentStream() { aInit(); if (!A.ctx) return null; const d = A.ctx.createMediaStreamDestination(); return d.stream; }
function voiceConnectAll(ids) {
  if (!Net.peer || Net.local) return;
  const out = Voice.stream || silentStream(); if (!out) return;
  for (const id of ids) { if (id === Net.id || Voice.calls[id] || !(Net.id < id)) continue; try { const call = Net.peer.call(id, out); if (call) setupCall(call); } catch (e) { console.warn(e); } }
}
function voiceAnswer(call) { try { call.answer(Voice.stream || silentStream()); setupCall(call); } catch (e) { console.warn(e); } }
function setupCall(call) {
  Voice.calls[call.peer] = call;
  call.on('stream', rs => attachRemoteVoice(call.peer, rs));
  call.on('close', () => { delete Voice.calls[call.peer]; const n = Voice.nodes[call.peer]; if (n) { try { n.src.disconnect(); } catch (e) {} delete Voice.nodes[call.peer]; } });
}
function attachRemoteVoice(id, rs) {
  aInit(); if (!A.ctx || Voice.nodes[id]) return;
  const el = new Audio(); el.srcObject = rs; el.muted = true; el.play().catch(() => {});
  const src = A.ctx.createMediaStreamSource(rs); const g = A.ctx.createGain(); g.gain.value = 1.6;
  const p = A.ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'linear'; p.refDistance = 1.5; p.maxDistance = 26; p.rolloffFactor = 1;
  src.connect(g); g.connect(p); p.connect(A.out);
  Voice.nodes[id] = { src, g, p, el };
}
function voiceUpdate(getPos) { for (const id in Voice.nodes) { const pos = getPos(id); if (pos) setPannerPos(Voice.nodes[id].p, pos); } }
