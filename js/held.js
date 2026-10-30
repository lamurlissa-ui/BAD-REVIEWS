/* ===== held items: first-person viewmodel (left hand) ===== */
const Held = (() => {
  let grp = null, cur = null, key = null, camRef = null;
  const mat = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.6, metalness: 0 }, o || {}));
  function towels() {
    const g = new T.Group(), w = mat(0xf0eee4, { roughness: 0.95 }), b = mat(0x3b6fa8, { roughness: 0.9 });
    for (let i = 0; i < 3; i++) { const t = new T.Mesh(new T.BoxGeometry(0.3, 0.07, 0.21), w); t.position.set((i - 1) * 0.004, i * 0.072, (i - 1) * 0.006); t.rotation.y = (i - 1) * 0.07; g.add(t); const s = new T.Mesh(new T.BoxGeometry(0.302, 0.014, 0.05), b); s.position.set(t.position.x, t.position.y + 0.0, t.position.z + 0.06); s.rotation.y = t.rotation.y; g.add(s); }
    g.position.set(-0.26, -0.3, -0.48); g.rotation.set(0.35, 0.5, 0); return g;
  }
  function wrench() {
    const g = new T.Group(), st = mat(0xb4bac0, { roughness: 0.28, metalness: 0.85 });
    const h = new T.Mesh(new T.BoxGeometry(0.036, 0.01, 0.34), st); g.add(h);
    const hd = new T.Mesh(new T.TorusGeometry(0.036, 0.014, 6, 14, 4.6), st); hd.rotation.set(Math.PI / 2, 0, 0.8); hd.position.z = -0.2; hd.scale.set(1, 1, 0.8); g.add(hd);
    const tl = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 0.011, 12), st); tl.position.z = 0.18; g.add(tl);
    const gr = new T.Mesh(new T.BoxGeometry(0.04, 0.012, 0.11), mat(0x7a1e22, { roughness: 0.7 })); gr.position.z = 0.08; g.add(gr);
    g.position.set(-0.24, -0.27, -0.5); g.rotation.set(-0.5, 0.25, 0.25); return g;
  }
  function masterKey() {
    const g = new T.Group(), br = mat(0xd9ad4e, { roughness: 0.3, metalness: 0.7 });
    const r = new T.Mesh(new T.TorusGeometry(0.035, 0.008, 8, 18), br); r.position.z = 0.12; g.add(r);
    const sh = new T.Mesh(new T.CylinderGeometry(0.007, 0.007, 0.2, 8), br); sh.rotation.x = Math.PI / 2; sh.position.z = -0.02; g.add(sh);
    for (const z of [-0.1, -0.075]) { const bt = new T.Mesh(new T.BoxGeometry(0.03, 0.012, 0.02), br); bt.position.set(0.016, 0, z); g.add(bt); }
    const tag = new T.Mesh(new T.BoxGeometry(0.05, 0.004, 0.07), mat(0xb4202a)); tag.position.set(0, 0, 0.19); g.add(tag);
    g.position.set(-0.1, -0.3, -0.42); g.rotation.set(-0.35, -0.3, 0.1); return g;
  }
  function ensure(c) { if (grp && camRef === c) return; camRef = c; grp = new T.Group(); c.add(grp); }
  return {
    sync(c, item, hasKey) {
      if (!c) return; ensure(c);
      if (cur && cur.kind !== item) { grp.remove(cur.obj); cur = null; }
      if (item && !cur) { const obj = item === 'towels' ? towels() : wrench(); cur = { kind: item, obj }; grp.add(obj); }
      if (hasKey && !key) { key = masterKey(); grp.add(key); } else if (!hasKey && key) { grp.remove(key); key = null; }
    },
    reset() { grp = null; cur = null; key = null; camRef = null; },
    bob(y) { if (grp) grp.position.y = y; },
    show(v) { if (grp) grp.visible = v; },
  };
})();
