// ============================================================================
// POWER — Sector 1 map (approved Codex art, 2026-10-21; handoff notes in art/map-s1/CLAUDE_HANDOFF.md)
//
// A canvas view the journey map (journeymap.js) shows for Sector 1. It draws one finite plate of the
// neighbourhood (map1/background_off.webp, 724 x 2172) bent over a cylinder (radius 1000 logical units), the
// ten poles with their raised hexagonal level markers, the cables between them, and ten cut-out compound
// lighting layers (map1/lighting/*.webp) drawn with NORMAL source-over at an animated opacity, never additive.
// Base + lit layers are composed once into a cached plate and only recomposed while a light is changing.
//
// Rules stay in progress.js: journeymap.js passes a state function { done, lit, current } per pole.
//   open(container, opts)       show the view; opts: { poles (Sector 1 route poles), state(p), focus(p), onPlay(p) }
//   beat(poles, opts)           a new connection: the cable runs 1450 ms, then the compound fades in over 650 ms;
//                               a run of several poles cascades faster; opts.finale adds the sector-complete scene
//   skip(), close(), focus(p), offFocus()
// ============================================================================
const Sector1Map = (function () {
  // ---- data (anchors.json, lighting_manifest.json) ---------------------------------------------------------
  const WORLD_H = 1560, LW = 420, R = 1000, CABLE_MS = 1450, FADE_MS = 650, STEPS = 24, SRC_W = 724, SRC_H = 2172;
  const ANCHORS = [[0.48, 0.94, "left"], [0.69, 0.846, "right"], [0.47, 0.751, "left"], [0.59, 0.657, "right"], [0.44, 0.562, "left"],
    [0.65, 0.468, "right"], [0.45, 0.373, "left"], [0.68, 0.279, "right"], [0.47, 0.184, "left"], [0.75, 0.09, "right"]];
  const RECTS = [[0, 1716, 442, 423], [0, 1444, 391, 320], [405, 1303, 319, 315], [0, 1032, 398, 326], [398, 901, 326, 326],
    [0, 641, 398, 343], [405, 521, 319, 293], [0, 304, 398, 293], [413, 54, 311, 359], [0, 4, 413, 246]];
  const NODES = ANCHORS.map(([x, y, side], i) => ({ n: i + 1, x: 210 + (x - 0.5) * 520, y: y * WORLD_H, side, wireDy: i === 9 ? 95 : 120 }));
  const srcToLogical = (px, py) => ({ x: 210 + (px / SRC_W - 0.5) * 520, y: (py / SRC_H) * WORLD_H });

  // ---- assets: loaded once, kept ------------------------------------------------------------------------
  let bg = null, layers = [], loading = null, ok = false, failed = false;
  const img = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("map1: " + src)); i.src = src; });
  function load() {
    if (loading) return loading;
    loading = Promise.all([img("map1/background_off.webp"), ...RECTS.map((_, i) => img(`map1/lighting/compound_${String(i + 1).padStart(2, "0")}.webp`))])
      .then(([b, ...ls]) => { bg = b; layers = ls; ok = true; }).catch((e) => { console.error(e); ok = false; failed = true; });
    return loading;
  }
  const plate = document.createElement("canvas"), pctx = plate.getContext("2d");
  let plateKey = "";
  function composePlate(alphas) {
    const key = alphas.join(",");
    if (key === plateKey) return;
    if (plate.width !== SRC_W) { plate.width = SRC_W; plate.height = SRC_H; }
    pctx.globalCompositeOperation = "source-over"; pctx.globalAlpha = 1; pctx.drawImage(bg, 0, 0);
    layers.forEach((l, i) => { if (alphas[i] > 0) { pctx.globalAlpha = alphas[i]; pctx.drawImage(l, RECTS[i][0], RECTS[i][1]); } });
    pctx.globalAlpha = 1; plateKey = key;
  }

  // ---- view state ----------------------------------------------------------------------------------------
  let host = null, canvas = null, ctx = null, W = 0, H = 0, k = 1, open_ = false, raf = 0, last = 0;
  let center = WORLD_H - 275, target = center, velocity = 0, dragging = false, lastY = 0, down = null;
  let opts = null, run = null; // run: an animation in progress
  const light = Array(10).fill(0), fx = [], shakeAt = {};
  const reduce = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  function mount(container) {
    if (canvas) return;
    host = container; canvas = document.createElement("canvas"); canvas.className = "jm-s1";
    canvas.setAttribute("aria-label", "Sector 1 map. Drag or scroll; tap a level marker to play.");
    host.insertBefore(canvas, host.firstChild); ctx = canvas.getContext("2d");
    canvas.addEventListener("wheel", (e) => { e.preventDefault(); target += e.deltaY * 0.7 / k; velocity = 0; }, { passive: false });
    canvas.addEventListener("pointerdown", (e) => { dragging = true; lastY = e.clientY; velocity = 0; down = { x: e.clientX, y: e.clientY }; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} });
    canvas.addEventListener("pointermove", (e) => { if (!dragging) return; const dy = (e.clientY - lastY) / k; center -= dy; target = center; velocity = -dy * 0.7; lastY = e.clientY; });
    const up = (e) => {
      dragging = false;
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 9) { down = null; return; }
      down = null; tap(e);
    };
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", () => { dragging = false; down = null; });
    window.addEventListener("resize", () => { if (open_) resize(); });
  }
  function resize() {
    const r = host.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height; k = W / LW;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // cylindrical projection: the same transform for the plate, lighting, poles, markers and cables
  function project(x, y) { const a = (y - center) / R, s = Math.cos(a); return { x: W / 2 + (x - 210) * k * s, y: H * 0.52 + Math.sin(a) * R * k, s }; }
  const visible = (y) => Math.abs(y - center) < R * 1.32;
  const limits = () => { const top = R * Math.asin(Math.min(0.95, (H * 0.52) / k / R)) + 3, bot = R * Math.asin(Math.min(0.95, (H * 0.48) / k / R)) + 3; return [top, WORLD_H - bot]; };
  const clampC = (c) => { const [a, b] = limits(); return Math.max(a, Math.min(b, c)); };
  const node = (p) => NODES[p.slot - 1];

  // state of a pole, with an animation's pending poles held dark until they are reached
  function st(p) {
    const s = opts.state(p);
    if (run && run.pending.has(p.slot)) return { done: false, lit: false, current: false };
    if (run && !run.showCurrent) return { done: s.done, lit: s.lit, current: false };
    return s;
  }

  // ---- drawing -------------------------------------------------------------------------------------------
  function strokeLine(pts, color, lw, glow, frac) {
    const end = Math.max(1, Math.ceil(pts.length * (frac === undefined ? 1 : frac)));
    ctx.beginPath(); for (let i = 0; i < end; i++) { const p = pts[i]; i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.shadowColor = color; ctx.shadowBlur = glow || 0; ctx.stroke(); ctx.shadowBlur = 0;
  }
  function cable(a, b) { // pole a -> pole b, attached at the crossarms, 13 units of sag
    const pts = [];
    for (let i = 0; i <= 64; i++) { const t = i / 64; pts.push(project(a.x * (1 - t) + b.x * t, (a.y - a.wireDy) * (1 - t) + (b.y - b.wireDy) * t + Math.sin(t * Math.PI) * 13)); }
    return pts;
  }
  function label(s, x, y, size, color, outline) {
    ctx.font = `700 ${size}px ${TXT.FAMILY}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    if (outline) { ctx.strokeStyle = "#08132b"; ctx.lineWidth = outline; ctx.strokeText(s, x, y); }
    ctx.fillStyle = color; ctx.fillText(s, x, y);
  }
  function pill(x, y, w, h, r, fill, stroke) { ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, r); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); } }
  function hex(x, y, w, h, fill) { // rounded hexagon
    const P = [[-0.31, -0.5], [0.31, -0.5], [0.5, 0], [0.31, 0.5], [-0.31, 0.5], [-0.5, 0]].map(([a, b]) => [x + a * w, y + b * h]);
    const mix = (a, b, t) => [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t];
    ctx.beginPath(); ctx.moveTo(...mix(P[5], P[0], 0.77));
    for (let i = 0; i < 6; i++) { const nx = mix(P[i], P[(i + 1) % 6], 0.23); ctx.quadraticCurveTo(P[i][0], P[i][1], nx[0], nx[1]); ctx.lineTo(...mix(P[i], P[(i + 1) % 6], 0.77)); }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  function bolt(x, y, s, color) { ctx.beginPath(); ctx.moveTo(x + 1 * s, y - 9 * s); ctx.lineTo(x - 5 * s, y + 1 * s); ctx.lineTo(x - 0.5 * s, y + 1 * s); ctx.lineTo(x - 2 * s, y + 9 * s); ctx.lineTo(x + 5 * s, y - 2 * s); ctx.lineTo(x + 0.5 * s, y - 2 * s); ctx.closePath(); ctx.fillStyle = color; ctx.fill(); }

  function drawPole(p, t) {
    const nd = node(p); if (!visible(nd.y)) return;
    const s = st(p), warm = s.done || s.current, lamp = s.lit || s.current;
    const q = project(nd.x, nd.y), sc = Math.max(0.25, q.s) * k;
    let shake = 0; if (shakeAt[p.slot] !== undefined) { const e = (t - shakeAt[p.slot]) / 380; if (e < 1) shake = Math.sin(e * 30) * 5 * (1 - e); else delete shakeAt[p.slot]; }
    ctx.save(); ctx.translate(q.x + shake * sc, q.y); ctx.scale(sc, sc);
    ctx.fillStyle = "#040a2055"; ctx.beginPath(); ctx.ellipse(0, 2, 14, 6, 0, 0, 7); ctx.fill();
    const top = project(nd.x, nd.y - nd.wireDy), tx = (top.x - q.x) / sc, ty = (top.y - q.y) / sc; // the cable endpoint, same projection
    const shaft = ctx.createLinearGradient(-6, 0, 6, 0); shaft.addColorStop(0, "#3b4966"); shaft.addColorStop(0.5, s.lit ? "#9a836e" : "#737e99"); shaft.addColorStop(1, "#4f5a74");
    ctx.strokeStyle = shaft; ctx.lineWidth = 10; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(tx, ty + 4); ctx.stroke();
    pill(tx, ty + 5, 32, 7, 3, "#62718c", "#354561"); for (const ox of [-12, 0, 12]) pill(tx + ox, ty, 6, 10, 3, "#b9c9dd", "#526987");
    pill(tx + 9, ty + 25, 13, 10, 4, "#33465f"); pill(tx + 9, ty + 31, 11, 9, 4, lamp ? "#ffce79" : "#7a90b0"); pill(tx * 0.35, ty * 0.35, 12, 20, 4, "#74829a", "#4b5a74");
    if (lamp) { const g = ctx.createRadialGradient(tx + 9, ty + 33, 0, tx + 9, ty + 33, 24); g.addColorStop(0, "#ffc45a99"); g.addColorStop(1, "#ffb23300"); ctx.fillStyle = g; ctx.fillRect(tx - 20, ty + 5, 55, 55); }
    if (p.slot === 10) { pill(tx, ty + 34, 42, 45, 8, s.lit ? "#ae9563" : "#546b8d", "#a3b8d3"); bolt(tx, ty + 34, 1.25, s.lit ? "#ffe4a1" : "#b5c5df"); } // the transformer
    const x = nd.side === "left" ? 44 : -44;
    if (warm) { const g = ctx.createRadialGradient(x, 16, 12, x, 16, 70); g.addColorStop(0, s.current ? "#ffb53177" : "#ffb53144"); g.addColorStop(1, "#ffb53100"); ctx.fillStyle = g; ctx.fillRect(x - 75, -60, 150, 150); }
    hex(x, 24, 88, 59, warm ? "#a26c32" : "#324672");
    const rim = ctx.createLinearGradient(0, -18, 0, 48);
    rim.addColorStop(0, warm ? "#fff0a8" : "#a3b7ee"); rim.addColorStop(0.42, warm ? "#ffd571" : "#718cc8"); rim.addColorStop(1, warm ? "#e3952f" : "#435b94");
    ctx.shadowColor = warm ? "#ffb32d" : "#11223d"; ctx.shadowBlur = warm ? 14 : 0; hex(x, 15, 88, 59, rim); ctx.shadowBlur = 0;
    const face = ctx.createLinearGradient(0, -10, 0, 40); face.addColorStop(0, "#354774"); face.addColorStop(1, "#182747"); hex(x, 11, 74, 46, face);
    ctx.strokeStyle = warm ? "#fff1bb" : "#b5c9ef"; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x - 23, -11); ctx.lineTo(x + 23, -11); ctx.stroke();
    label(String(p.slot), x, 12, 34, "#fff0cd", 2);
    if (s.done) { pill(x + 32, 36, 23, 23, 11, "#ffd16a", "#fff0b1"); ctx.beginPath(); ctx.moveTo(x + 26, 36); ctx.lineTo(x + 31, 41); ctx.lineTo(x + 39, 31); ctx.strokeStyle = "#7b4c20"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.stroke(); }
    if (s.current) { pill(x, 61, 65, 27, 12, "#ffd075", "#ffe7ac"); label("Play", x, 61, 18, "#102344", 0); }
    ctx.restore();
  }

  function frame(now) {
    raf = 0; if (!open_) return;
    const dt = Math.min(32, now - last || 16); last = now;
    if (run) run.tick(now);
    // lighting: each compound eases toward what it should show (an animating pole ramps in, with a short tail)
    for (let i = 0; i < 10; i++) {
      const p = opts.poles[i]; let want = p && st(p).lit ? 1 : 0;
      if (run && run.fade[i + 1] !== undefined) want = Math.max(0, Math.min(1, (now - run.fade[i + 1]) / FADE_MS));
      light[i] += (want - light[i]) * Math.min(1, dt * 0.016);
      if (Math.abs(want - light[i]) < 0.002) light[i] = want;
    }
    composePlate(light.map((a) => Math.round(a * STEPS) / STEPS));
    // camera
    if (!dragging) { center += (target - center) * Math.min(1, dt * 0.012); target += (velocity * dt) / 16; velocity *= 0.93; }
    target = clampC(target); center = clampC(center);
    // plate, in thin bands through the projection
    ctx.fillStyle = "#142744"; ctx.fillRect(0, 0, W, H);
    const step = 2, span = R * Math.asin(Math.min(0.99, (H * 0.55) / k / R)) + 8;
    for (let wy = Math.max(0, Math.floor((center - span) / step) * step); wy < Math.min(WORLD_H, center + span); wy += step) {
      const p0 = project(210, wy), p1 = project(210, wy + step), sw = 520 * k * Math.max(0.2, p0.s), sy = (wy / WORLD_H) * SRC_H;
      ctx.drawImage(plate, 0, sy, SRC_W, Math.min(SRC_H - sy, (step / WORLD_H) * SRC_H + 0.6), (W - sw) / 2, p0.y, sw, Math.max(1, p1.y - p0.y + 0.6));
    }
    // finale pulse: a soft warm glow passing over each compound (local, transient)
    fx.filter((f) => f.kind === "glow").forEach((f) => {
      const e = (now - f.t0) / f.ms; if (e < 0 || e > 1) return;
      const q = project(f.x, f.y), a = Math.sin(e * Math.PI) * 0.32, r = 150 * k * q.s;
      ctx.save(); ctx.globalCompositeOperation = "lighter"; const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
      g.addColorStop(0, `rgba(255,190,90,${a})`); g.addColorStop(1, "rgba(255,190,90,0)"); ctx.fillStyle = g; ctx.fillRect(q.x - r, q.y - r, 2 * r, 2 * r); ctx.restore();
    });
    // cables
    for (let i = 1; i < 10; i++) {
      const pa = opts.poles[i - 1], pb = opts.poles[i], a = NODES[i - 1], b = NODES[i];
      if (!visible(a.y) && !visible(b.y)) continue;
      const pts = cable(a, b); strokeLine(pts, "#101a32", 7); strokeLine(pts, "#66749a", 3);
      const c = run && run.cable && run.cable.to === pb.slot ? run.cable : null;
      if (c) {
        const prog = Math.max(0, Math.min(1, (now - c.t0) / c.ms));
        strokeLine(pts, "#ffb83e", 5, 16, prog); strokeLine(pts, "#fff0b8", 2, 0, prog);
        const h = pts[Math.min(64, Math.floor(prog * 64))]; ctx.fillStyle = "#fff0bb"; ctx.shadowColor = "#ffb938"; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(h.x, h.y, 4, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      } else if (st(pb).lit && st(pa).lit) { strokeLine(pts, "#ffb83e", 5, 12); strokeLine(pts, "#ffe5a3", 2); }
    }
    for (let i = 9; i >= 0; i--) if (opts.poles[i]) drawPole(opts.poles[i], now);
    // rings and sparks
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i], e = (now - f.t0) / f.ms; if (e > 1) { fx.splice(i, 1); continue; } if (e < 0 || f.kind === "glow") continue;
      const q = project(f.x, f.y), sc = k * q.s;
      if (f.kind === "ring") { ctx.globalAlpha = 1 - e; ctx.strokeStyle = "#ffd88a"; ctx.lineWidth = 3 * (1 - e) + 1; ctx.beginPath(); ctx.arc(q.x, q.y, f.r * sc * (1 - Math.pow(1 - e, 3)), 0, 7); ctx.stroke(); }
      else { ctx.globalAlpha = 1 - e; ctx.fillStyle = "#ffe3a0"; ctx.beginPath(); ctx.arc(q.x + Math.cos(f.a) * f.d * e * sc, q.y + Math.sin(f.a) * f.d * e * sc, 2.6, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    const fog = ctx.createLinearGradient(0, 0, 0, H); fog.addColorStop(0, "#08132a99"); fog.addColorStop(0.2, "#08132a00"); fog.addColorStop(0.8, "#08132a00"); fog.addColorStop(1, "#08132a88");
    ctx.fillStyle = fog; ctx.fillRect(0, 0, W, H);
    if (opts.onFrame) opts.onFrame();
    raf = requestAnimationFrame(frame);
  }

  function markerAt(x, y) {
    for (const p of opts.poles) {
      const nd = node(p), q = project(nd.x, nd.y), sc = q.s * k, off = nd.side === "left" ? 44 : -44;
      if (Math.hypot(x - q.x - off * sc, y - q.y - 15 * sc) < 49 * sc) return p;
    }
    return null;
  }
  function tap(e) {
    if (run) { if (opts.onSkip) opts.onSkip(); return; } // a tap during an animation skips it
    const r = canvas.getBoundingClientRect(), p = markerAt(e.clientX - r.left, e.clientY - r.top);
    if (!p) return;
    const s = st(p);
    if (s.done || s.current) { if (opts.onPlay) opts.onPlay(p); }
    else shakeAt[p.slot] = performance.now();
  }

  // ---- public ----------------------------------------------------------------------------------------------
  function open(container, o) {
    mount(container); opts = o; run = null; fx.length = 0; open_ = true; canvas.style.display = "block"; resize();
    for (let i = 0; i < 10; i++) { const p = opts.poles[i]; light[i] = p && st(p).lit ? 1 : 0; } // restore saved lighting, no fade
    plateKey = "";
    if (o.focus) focus(o.focus, true);
    last = performance.now(); if (!raf) raf = requestAnimationFrame(frame);
  }
  function close() { open_ = false; run = null; if (raf) cancelAnimationFrame(raf); raf = 0; if (canvas) canvas.style.display = "none"; }
  function focus(p, instant) { const nd = node(p); target = clampC(nd.y - 120); velocity = 0; if (instant) center = target; }
  const offFocus = (p) => !!p && Math.abs(center - clampC(node(p).y - 120)) > 420;

  // a new connection. poles: the Sector 1 poles it lights, in order. o: { finale, sfx(kind), onDone() }
  function beat(poles, o) {
    const cascade = poles.length > 1, t0 = performance.now() + 120;
    const r = { pending: new Set(poles.map((p) => p.slot)), fade: {}, cable: null, showCurrent: false, steps: [], done: false };
    poles.forEach((p) => { light[p.slot - 1] = 0; }); plateKey = ""; // the poles about to light start dark
    let t = t0;
    poles.forEach((p, i) => {
      const cableMs = cascade ? 380 : CABLE_MS, fadeMs = cascade ? 260 : FADE_MS;
      r.steps.push({ at: t, fn: () => { if (p.slot > 1) r.cable = { to: p.slot, t0: t, ms: cableMs }; target = clampC(node(p).y - 120); } });
      const arriveAt = t + cableMs;
      r.steps.push({ at: arriveAt, fn: () => {
        r.cable = null; r.pending.delete(p.slot); r.fade[p.slot] = arriveAt;
        const nd = node(p), off = nd.side === "left" ? 44 : -44;
        fx.push({ kind: "ring", x: nd.x + off, y: nd.y + 15, r: p.slot === 10 ? 80 : 46, t0: arriveAt, ms: 700 });
        for (let j = 0; j < (p.slot === 10 ? 14 : 8); j++) fx.push({ kind: "spark", x: nd.x, y: nd.y - nd.wireDy, a: (j / 8) * Math.PI * 2, d: p.slot === 10 ? 70 : 40, t0: arriveAt, ms: 600 });
        if (o.sfx && !cascade) o.sfx(o.finale && p.slot === 10 ? "milestone" : "level");
      } });
      t = arriveAt + (cascade ? 90 : 0);
    });
    let end = t + (cascade ? 260 : FADE_MS) + 200;
    if (o.finale) { // transformer flare, a warm pulse running back down the street, then back up to the transformer
      const top = NODES[9];
      r.steps.push({ at: end, fn: () => { for (let j = 0; j < 3; j++) fx.push({ kind: "ring", x: top.x, y: top.y - 40, r: 120 + j * 60, t0: end + j * 260, ms: 1200 }); } });
      const pulseAt = end + 500;
      for (let i = 9; i >= 0; i--) {
        const c = RECTS[i], at = pulseAt + (9 - i) * 230, g = srcToLogical(c[0] + c[2] / 2, c[1] + c[3] / 2);
        r.steps.push({ at, fn: () => { fx.push({ kind: "glow", x: g.x, y: g.y, t0: at, ms: 900 }); target = clampC(g.y - 60); } });
      }
      const back = pulseAt + 10 * 230 + 500;
      r.steps.push({ at: back, fn: () => { target = clampC(NODES[9].y - 120); } });
      end = back + 1200;
    }
    r.steps.push({ at: end, fn: () => { r.showCurrent = true; if (o.next) target = clampC(node(o.next).y - 120); } });
    r.steps.push({ at: end + (o.next && !o.finale ? 650 : 100), fn: () => finish() });
    r.tick = (now) => { while (r.steps.length && r.steps[0].at <= now) r.steps.shift().fn(); };
    function finish() { if (r.done) return; r.done = true; r.steps.length = 0; r.pending.clear(); r.cable = null; r.fade = {}; run = null; if (o.onDone) o.onDone(); }
    r.finish = finish;
    run = r;
    if (reduce()) finish();
    else if (!raf) raf = requestAnimationFrame(frame);
  }
  function skip() { if (run) run.finish(); }
  const busy = () => !!run;

  // read-only snapshot for automated checks (lighting per compound, camera, animation)
  const debug = () => ({ open: open_, light: light.map((a) => +a.toFixed(2)), center: Math.round(center), busy: !!run, size: [W, H] });
  // draw one frame now (automated checks in a background tab, where animation frames do not fire)
  const pump = () => { if (!open_) return; if (raf) cancelAnimationFrame(raf); raf = 0; frame(performance.now()); };

  return { load, ready: () => ok, failed: () => failed, open, close, focus, offFocus, beat, skip, busy, debug, pump };
})();
