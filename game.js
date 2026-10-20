// ============================================================================
// POWER — prototype renderer + feel. Everything is drawn on one canvas.
//
// Question under test: is steering limited power through switches satisfying,
// and does it make good puzzles? So the rules live in logic.js; this file is
// only about readable flow and clear cause/effect:
//   * logic decides where power SHOULD go (instant, steady state)
//   * the picture lets electricity physically travel there; appliances only
//     count as powered once the surge reaches them, so you SEE the overload
//     arrive and trip the source.
// ============================================================================

const L = window.PowerLogic;
const cv = document.getElementById("board");
const ctx = cv.getContext("2d");

const COL = {
  bg: "#070a13", wire: "#1c2540", wireEdge: "#2a3558",
  panel: "#0e1424", dim: "#7d879e", text: "#eef2fa",
  amber: "#ffb02e", amberHi: "#ffd65a", core: "#fff6d0",
  red: "#ff4d4d", green: "#46e08a", blue: "#6fc2ff", gold: "#ffd34d",
  body: "#171e32", bodyEdge: "#38456a",
};

const TRIP_LOCK = 0.6;   // seconds before a trip can be reset
const WIN_HOLD = 0.7;    // seconds all required must stay lit to win
const FLOW_SPEED = 5.2;  // board units per second the surge travels
const DRAIN_SPEED = 16;  // how fast a cut wire empties

let W = 0, H = 0, DPR = 1;
const HUD_TOP = 82, HUD_BOTTOM = 130;

// ---------------------------------------------------------------- audio ----
const Sfx = {
  ctx: null, hum: null, humGain: null, humFilter: null,
  init() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.55; this.master.connect(c.destination);
    this.hum = c.createOscillator(); this.hum.type = "sawtooth"; this.hum.frequency.value = 55;
    this.humFilter = c.createBiquadFilter(); this.humFilter.type = "lowpass"; this.humFilter.frequency.value = 260;
    this.humGain = c.createGain(); this.humGain.gain.value = 0;
    this.hum.connect(this.humFilter); this.humFilter.connect(this.humGain); this.humGain.connect(this.master);
    this.hum.start();
  },
  tone(freq, dur, type, vol, slideTo, delay) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol) {
    const c = this.ctx; if (!c) return;
    const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(); s.buffer = buf;
    const g = c.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(this.master); s.start();
  },
  switchClick(on) { this.tone(on ? 340 : 230, 0.07, "square", 0.12, on ? 520 : 150); },
  routerClick() { this.tone(180, 0.05, "square", 0.12, 300); this.tone(420, 0.06, "triangle", 0.08, 560, 0.045); },
  applianceOn(load) { this.tone(420 + load * 110, 0.13, "sine", 0.16, 640 + load * 110); },
  applianceOff() { this.tone(300, 0.08, "sine", 0.07, 200); },
  trip() { this.noise(0.5, 0.5); this.tone(420, 0.6, "sawtooth", 0.25, 40); this.tone(90, 0.35, "square", 0.2, 30); },
  reset() { this.tone(160, 0.25, "sine", 0.18, 480); },
  taskDone() { this.tone(660, 0.16, "triangle", 0.2); this.tone(990, 0.3, "triangle", 0.2, null, 0.11); },
  win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.38, "triangle", 0.2, null, i * 0.085)); },
  setHum(load, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.humGain.gain.setTargetAtTime(on && load > 0 ? 0.045 : 0, t, 0.08);
    this.hum.frequency.setTargetAtTime(52 + load * 13, t, 0.12);
    this.humFilter.frequency.setTargetAtTime(220 + load * 60, t, 0.12);
  },
};

const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* ignore */ } };

// ----------------------------------------------------------------- state ----
const G = {
  levelIndex: 0, g: null, state: null,
  mode: "play",           // play | tripped | won
  t: 0, modeT: 0, winHold: 0, shake: 0, flash: 0, dark: 0,
  taps: 0, trips: 0, runTime: 0, started: false,
  bonus: false, load: 0, tripLoad: 0,
  nodes: {}, edges: [], inEdges: {}, u: 60, ox: 0, oy: 0,
  parts: [], rings: [], srcCells: [],
};

function px(n) { return G.ox + (n.x - G.bounds.minX) * G.u; }
function py(n) { return G.oy + (n.y - G.bounds.minY) * G.u; }

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 3);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  if (G.g) layout();
}

// journey: where a level sits on the map. #N links and the HUD use the journey position (sector s, slot k).
const levelLabel = (i) => { const p = Progress.poleFor(i); return p ? "SECTOR " + (p.sector + 1) + "   ·   LEVEL " + p.slot : "LEVEL " + (i + 1); };
const hashFor = (i) => { const p = Progress.poleFor(i); return p ? p.pos : i + 1; };
// Candidates (not part of the catalogue) can be played via #c9a style links; see www/candidates.js
const curLevel = () => (G.tut ? TUTORIAL_LEVEL : G.cand || LEVELS[G.levelIndex]); // tutorial: Level 0 lives in tutorial.js, not LEVELS

// tutorial: Level 0 (see tutorial.js). Not part of the catalogue.
function loadTutorial() {
  G.tut = Tutorial.begin(); G.cand = null; G.disc = null;
  try { history.replaceState(null, "", "#0"); } catch (e) { /* ignore */ }
  startLevel(TUTORIAL_LEVEL);
}
function endTutorial() { Tutorial.markDone(); G.tut = null; loadLevel(0); }
// restart the board; the tutorial returns to the current step's checkpoint instead of the very start
function restartBoard() {
  resetBoard(false); G.taps = 0; G.trips = 0; G.runTime = 0; G.started = false;
  if (G.tut) Tutorial.onRestart(G);
  if (G.disc) Discovery.end(G); // discovery: a restart ends the tip, the level is then normal
}

function loadCandidate(key) {
  const c = typeof CANDIDATES !== "undefined" && CANDIDATES[key];
  if (!c) return loadLevel(0);
  G.cand = c; G.candKey = key; G.tut = null; G.disc = null;
  try { history.replaceState(null, "", "#c" + key); } catch (e) { /* ignore */ }
  startLevel(c);
}

function loadLevel(i, plain) { // plain: true = abstract board, false = house (default); omitted = keep current
  i = Math.max(0, Math.min(LEVELS.length - 1, i));
  G.levelIndex = i; G.cand = null; G.tut = null;
  G.disc = typeof Discovery !== "undefined" ? Discovery.begin(i) : null; // discovery: first-encounter tip for routing / charge / pass-through
  if (plain !== undefined) G.plain = !!plain; // house experiment (see house.js)
  try { history.replaceState(null, "", "#" + hashFor(i) + (G.plain ? "p" : "")); } catch (e) { /* ignore */ }
  startLevel(LEVELS[i]);
}

function startLevel(lv) {
  G.g = L.build(lv);
  G.house = !G.plain && typeof HouseScene !== "undefined" ? HouseScene.build(G.g) : null; // house: environment generated around the level
  G.taps = 0; G.trips = 0; G.runTime = 0; G.started = false;
  resetBoard(true);
  layout();
}

function resetBoard(hard) {
  G.beat = null;
  G.state = L.initialState(G.g);
  G.mode = "play"; G.modeT = 0; G.winHold = 0; G.bonus = false;
  if (hard) { G.dark = 0; G.parts.length = 0; G.rings.length = 0; }
  G.edges.forEach((e) => { e.a0 = 0; e.a1 = 0; });
  Object.values(G.nodes).forEach((n) => { n.vp = n.id === G.g.src; n.pw = 0; n.culprit = false; n.onAt = 0; n.charge = 0; n.done = false; });
  G.srcCells = [];
}

function layout() {
  const g = G.g;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  g.order.forEach((id) => {
    const n = g.nodes[id];
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
  });
  if (G.house) { const b = G.house.bounds; minX = Math.min(minX, b.minX); maxX = Math.max(maxX, b.maxX); minY = Math.min(minY, b.minY); maxY = Math.max(maxY, b.maxY); } // house
  G.bounds = { minX, maxX, minY, maxY };
  const bw = maxX - minX, bh = maxY - minY;
  const availW = W - 14, availH = H - HUD_TOP - HUD_BOTTOM;
  G.u = Math.min(availW / (bw + 0.9), availH / (bh + 1.3), 104);
  G.ox = (W - bw * G.u) / 2;
  G.oy = HUD_TOP + (availH - bh * G.u) / 2;

  const prev = G.nodes;
  G.nodes = {};
  g.order.forEach((id) => {
    const n = g.nodes[id], o = prev[id] || {};
    G.nodes[id] = Object.assign(n, {
      vp: o.vp || id === g.src, pw: o.pw || 0, pop: o.pop || 0, ang: o.ang, vel: o.vel || 0,
      rot: o.rot || 0, culprit: !!o.culprit, onAt: o.onAt || 0, charge: o.charge || 0, done: !!o.done,
    });
  });

  // wires: elbow routes, each parent gets its own horizontal "lane" so
  // neighbouring routers' wires don't merge into one ambiguous line
  const rows = {};
  g.order.forEach((id) => { (rows[g.nodes[id].y] = rows[g.nodes[id].y] || []).push(id); });
  Object.values(rows).forEach((r) => r.sort((a, b) => g.nodes[a].x - g.nodes[b].x));
  const oldEdges = {};
  G.edges.forEach((e) => { oldEdges[e.key] = e; });
  G.edges = []; G.inEdges = {};
  g.order.forEach((id) => { G.inEdges[id] = []; });
  g.order.forEach((a) => {
    g.outs[a].forEach((b) => {
      const na = G.nodes[a], nb = G.nodes[b];
      // wires leaving a pass-through appliance start below its label so it reads as sitting on the line
      const p0 = { x: px(na), y: py(na) + (na.pass ? labelHalf(na) + G.u * 0.36 + 12 : 0) }, p1 = { x: px(nb), y: py(nb) };
      const rank = rows[na.y].indexOf(a), lane = rows[na.y].length > 1 ? [0.36, 0.5, 0.64][rank % 3] : 0.5;
      const my = p0.y + (p1.y - p0.y) * lane;
      const pts = [p0];
      if (Math.abs(p0.x - p1.x) > 0.5) pts.push({ x: p0.x, y: my }, { x: p1.x, y: my });
      pts.push(p1);
      let len = 0; const segs = [];
      for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); segs.push(d); len += d; }
      const key = a + ">" + b, o = oldEdges[key];
      const e = { a, b, key, pts, segs, len, a0: o ? o.a0 : 0, a1: o ? o.a1 : 0 };
      G.edges.push(e); G.inEdges[b].push(e);
    });
  });
}

// ------------------------------------------------------------ simulation ----
function pointAt(e, d) {
  d = Math.max(0, Math.min(e.len, d));
  for (let i = 0; i < e.segs.length; i++) {
    if (d <= e.segs[i] || i === e.segs.length - 1) {
      const k = e.segs[i] ? Math.min(1, d / e.segs[i]) : 0;
      return { x: e.pts[i].x + (e.pts[i + 1].x - e.pts[i].x) * k, y: e.pts[i].y + (e.pts[i + 1].y - e.pts[i].y) * k };
    }
    d -= e.segs[i];
  }
  return e.pts[e.pts.length - 1];
}

function strokeRange(e, d0, d1) {
  ctx.beginPath();
  const s = pointAt(e, d0); ctx.moveTo(s.x, s.y);
  let acc = 0;
  for (let i = 0; i < e.segs.length; i++) {
    const end = acc + e.segs[i];
    if (end > d0 && acc < d1) { const p = pointAt(e, Math.min(end, d1)); ctx.lineTo(p.x, p.y); }
    acc = end;
  }
  ctx.stroke();
}

function spawnSparks(x, y, n, color, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = (0.35 + Math.random()) * speed;
    G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.2, life: 0, max: 0.4 + Math.random() * 0.5, color, size: 1.5 + Math.random() * 2.5, g: 500 });
  }
}
function addRing(x, y, color, max, life) { G.rings.push({ x, y, r: 0, max, life: 0, dur: life || 0.5, color }); }

function step(dt) {
  G.t += dt; G.modeT += dt;
  if (G.started && G.mode === "play") G.runTime += dt;
  G.shake = Math.max(0, G.shake - dt * 2.4);
  G.flash = Math.max(0, G.flash - dt * 4);
  const tripped = G.mode === "tripped";
  G.dark += ((tripped ? 1 : 0) - G.dark) * Math.min(1, dt * (tripped ? 14 : 6));

  const logical = L.flow(G.g, G.state);
  const u = G.u;

  // 1) which nodes does the picture currently show as powered?
  Object.values(G.nodes).forEach((n) => {
    if (n.t === "src") { n.vp = !tripped; return; }
    const was = n.vp;
    // a pass-through appliance that is switched off is fed but NOT powered: it draws nothing and conducts nothing
    n.vp = G.inEdges[n.id].some((e) => e.a1 >= 0.999 && e.a0 <= 0.001) && !(n.pass && !G.state[n.id]);
    if (n.t === "ap" && n.vp && !was) { n.onAt = G.t; n.pop = 0.6; Sfx.applianceOn(n.load); addRing(px(n), py(n), COL.amberHi, u * 0.7, 0.45); spawnSparks(px(n), py(n), 6, COL.amberHi, u * 1.2); }
    if (n.t === "ap" && !n.vp && was && G.mode === "play") Sfx.applianceOff();
  });

  // 1b) charge appliances fill while powered; finishing is permanent
  if (G.mode === "play") {
    Object.values(G.nodes).forEach((n) => {
      if (n.t !== "ap" || !n.task || n.done || !n.vp) return;
      n.charge = Math.min(1, n.charge + dt / n.task);
      if (n.charge >= 1) {
        n.done = true; n.pop = 0.8;
        addRing(px(n), py(n), COL.green, u * 1.1, 0.7); spawnSparks(px(n), py(n), 18, COL.green, u * 2.2);
        Sfx.taskDone(); buzz(25);
      }
    });
  }

  // 2) surge travels along wires that logic says are live and whose source end is lit
  G.edges.forEach((e) => {
    const na = G.nodes[e.a];
    const want = !tripped && logical.live.has(e.key) && (na.t === "src" || na.vp);
    if (tripped) { e.a0 = 0; e.a1 = 0; return; }
    if (want) {
      e.a0 = Math.max(0, e.a0 - dt * 4);
      e.a1 = Math.min(1, e.a1 + (FLOW_SPEED * u * dt) / (e.len || 1));
      if (e.a1 < 1) e.a0 = 0;
    } else {
      e.a0 = Math.min(e.a1, e.a0 + (DRAIN_SPEED * u * dt) / (e.len || 1));
    }
  });

  // 3) the load the picture is actually carrying
  let load = 0; const lit = new Set();
  Object.values(G.nodes).forEach((n) => { if (n.vp) { lit.add(n.id); if (n.t === "ap") load += n.load; } });
  if (!tripped) G.load = load;

  if (G.mode === "play" && load > G.g.cap) trip(load);

  // 4) win: every required appliance stays lit for a beat
  if (G.mode === "play") {
    const doneSet = new Set(Object.values(G.nodes).filter((n) => n.done).map((n) => n.id));
    if (L.isWon(G.g, lit, doneSet)) {
      G.winHold += dt;
      if (G.winHold >= WIN_HOLD) win(lit);
    } else G.winHold = 0;
  }

  Sfx.setHum(G.load, G.mode === "play");

  // 5) easing for visuals
  Object.values(G.nodes).forEach((n) => {
    const target = n.t === "ap" ? (n.vp ? 1 : 0) : 0;
    n.pw += (target - n.pw) * Math.min(1, dt * (target ? 9 : 14));
    n.pop = Math.max(0, n.pop - dt * 4);
    if (n.t === "ap" && n.k === "fan") n.rot += dt * 11 * n.pw;
    if (n.t === "sw" || n.t === "rt") {
      const target2 = leverTarget(n);
      if (n.ang === undefined) n.ang = target2;
      n.vel += ((target2 - n.ang) * 300 - n.vel * 17) * dt;
      n.ang += n.vel * dt;
    }
  });

  // source cells ease toward current load
  for (let i = 0; i < Math.max(G.g.cap, Math.ceil(G.tripLoad)); i++) {
    const t = tripped ? (i < G.tripLoad ? 1 : 0) : (i < G.load ? 1 : 0);
    G.srcCells[i] = (G.srcCells[i] || 0) + (t - (G.srcCells[i] || 0)) * Math.min(1, dt * 14);
  }

  G.parts = G.parts.filter((p) => { p.life += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; return p.life < p.max; });
  G.rings = G.rings.filter((r) => { r.life += dt; return r.life < r.dur; });
  if (G.tut) Tutorial.update(G); // tutorial: watch the board and advance the steps
  if (G.disc) Discovery.update(G); // discovery: advance the tip, end it when the level is won
  if (G.mode === "won" && G.beat && !G.beat.shown && G.modeT > 1.25) { G.beat.shown = true; JourneyMap.showBeat(G.beat); } // progression: journey map beat
}

function leverTarget(n) {
  if (n.t === "sw") return G.state[n.id] ? 0 : -0.75;
  const child = G.nodes[G.g.outs[n.id][G.state[n.id]]];
  return Math.atan2(px(child) - px(n), py(child) - py(n));
}

function trip(load) {
  G.mode = "tripped"; G.modeT = 0; G.trips++; G.tripLoad = load;
  G.shake = 1; G.flash = 1; G.winHold = 0;
  const apps = Object.values(G.nodes).filter((n) => n.t === "ap" && n.vp).sort((a, b) => b.onAt - a.onAt);
  apps.forEach((n, i) => { n.culprit = i === 0; });
  G.tripSet = new Set(apps.map((n) => n.id)); // everything that was on together: shown so the overload explains itself
  const src = G.nodes[G.g.src];
  if (apps[0]) spawnSparks(px(apps[0]), py(apps[0]), 34, COL.red, G.u * 4);
  apps.forEach((n) => spawnSparks(px(n), py(n), 10, COL.amber, G.u * 2.4));
  spawnSparks(px(src), py(src), 46, COL.red, G.u * 4.5);
  addRing(px(src), py(src), COL.red, G.u * 2.6, 0.55);
  if (apps[0]) addRing(px(apps[0]), py(apps[0]), COL.red, G.u * 1.4, 0.5);
  Sfx.trip(); buzz([40, 30, 110]);
}

function win(lit) {
  const prog = !G.cand && !G.tut && typeof Progress !== "undefined" ? Progress.record(G.levelIndex) : null; // progression: count this level toward its milestone
  G.beat = prog ? Object.assign({ shown: false }, prog) : null;                      // every level (replays too) ends on the neighborhood map; off-plan levels fall back to next-level
  G.mode = "won"; G.modeT = 0;
  G.bonus = L.bonusDone(G.g, lit);
  G.shake = 0.15;
  Object.values(G.nodes).forEach((n) => {
    if (n.t === "ap" && (n.vp || n.done)) {
      addRing(px(n), py(n), n.req ? COL.green : COL.gold, G.u * 1.5, 0.8);
      spawnSparks(px(n), py(n), 16, n.req ? COL.green : COL.gold, G.u * 3);
    }
  });
  Sfx.win(); buzz([20, 40, 30]);
}

// ----------------------------------------------------------------- input ----
function hudHit(x, y) {
  if (Math.hypot(x - (W - 32), y - 34) < 26) return "restart";
  if (!G.tut && Math.hypot(x - (W - 82), y - 34) < 24) return "map"; // progression: neighborhood button
  if (G.disc) return Math.abs(x - W / 2) < 90 && Math.abs(y - (H - 26)) < 24 ? "skip" : null; // discovery: only Skip, no level dots
  if (G.tut) return G.tut.step < 5 && Math.abs(x - W / 2) < 90 && Math.abs(y - (H - 26)) < 24 ? "skip" : null; // tutorial: only Skip, no level dots
  return null; // journey: the map replaces the old row of level dots
}

function onDown(ev) {
  ev.preventDefault();
  Sfx.init();
  const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
  const hit = hudHit(x, y);
  if (hit === "skip") { if (G.tut) endTutorial(); else { restartBoard(); Sfx.reset(); } return; } // discovery: Skip = restart, which ends the tip
  if (hit === "map") { JourneyMap.showMap({ closable: true }); return; }
  if (hit === "restart") { restartBoard(); Sfx.reset(); return; }

  if (G.mode === "tripped") {
    if (G.modeT > TRIP_LOCK) { resetBoard(false); if (G.tut) Tutorial.onReset(G); if (G.disc) Discovery.end(G); Sfx.reset(); buzz(15); }
    return;
  }
  if (G.mode === "won") {
    if (G.modeT > 0.5) {
      if (G.tut) endTutorial();
      else if (G.cand) loadCandidate(G.candKey);
      else if (G.beat && !G.beat.shown) { G.beat.shown = true; JourneyMap.showBeat(G.beat); } // progression: do not wait for the delay
      else if (G.beat) { /* the journey map is already up */ }
      else loadLevel((G.levelIndex + 1) % LEVELS.length);
    }
    return;
  }

  let best = null, bd = Math.max(G.u * 0.5, 30);
  G.g.tappable.forEach((id) => {
    const n = G.nodes[id], d = Math.hypot(x - px(n), y - py(n));
    if (d < bd) { bd = d; best = n; }
  });
  if (!best) return;
  if (G.tut && !Tutorial.allows(G, best.id)) { Tutorial.rejected(G); return; } // tutorial: locked controls
  if (G.disc && !Discovery.allows(G, best.id)) { Discovery.rejected(G); return; } // discovery: locked controls
  G.started = true; G.taps++;
  const before = G.state[best.id];
  G.state = L.nextState(G.g, G.state, best.id);
  best.pop = 1; best.vel += best.t === "sw" ? (G.state[best.id] ? 7 : -7) : 6;
  addRing(px(best), py(best), COL.amberHi, G.u * 0.55, 0.3);
  if (best.t === "rt") Sfx.routerClick(); else Sfx.switchClick(!!G.state[best.id]);
  buzz(8);
  void before;
}

cv.addEventListener("pointerdown", onDown);
window.addEventListener("resize", resize);
window.addEventListener("keydown", (ev) => {
  if (/^[0-9]$/.test(ev.key)) { const n = ev.key === "0" ? 10 : +ev.key, i = Progress.indexAtPos(n); if (i !== null) loadLevel(i); } // 1-9, 0 = level 10 of sector 1
  if (ev.key === "r" || ev.key === "R") restartBoard();
  if (ev.key === " ") onDown({ preventDefault() {}, clientX: -1, clientY: -1 });
});

// ------------------------------------------------------------- rendering ----
function rr(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawWires() {
  const u = G.u;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  G.edges.forEach((e) => {
    ctx.strokeStyle = COL.wireEdge; ctx.lineWidth = Math.max(5, u * 0.095); strokeRange(e, 0, e.len);
    ctx.strokeStyle = COL.wire; ctx.lineWidth = Math.max(3, u * 0.06); strokeRange(e, 0, e.len);
  });
  G.edges.forEach((e) => {
    if (e.a1 - e.a0 <= 0.0005) return;
    const d0 = e.a0 * e.len, d1 = e.a1 * e.len;
    ctx.strokeStyle = "rgba(255,176,46,0.28)"; ctx.lineWidth = Math.max(10, u * 0.2); strokeRange(e, d0, d1);
    ctx.strokeStyle = COL.amber; ctx.lineWidth = Math.max(4, u * 0.075); strokeRange(e, d0, d1);
    ctx.strokeStyle = COL.core; ctx.lineWidth = Math.max(1.5, u * 0.028); strokeRange(e, d0, d1);
    // pulses riding the live wire so flow direction reads at a glance
    const gap = u * 0.55, sp = u * 2.2, off = (G.t * sp) % gap;
    ctx.fillStyle = "#fff";
    for (let d = off; d < e.len; d += gap) {
      if (d < d0 || d > d1) continue;
      const p = pointAt(e, d); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2.2, u * 0.035), 0, 7); ctx.fill();
    }
    if (e.a1 < 0.999) { // the surge front
      const p = pointAt(e, d1);
      ctx.fillStyle = "rgba(255,246,208,0.9)"; ctx.shadowColor = COL.amberHi; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(4, u * 0.075), 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    }
  });
}

function drawSource() {
  const n = G.nodes[G.g.src], u = G.u, cap = G.g.cap;
  const x = px(n), y = py(n);
  const cw = u * 0.27, ch = u * 0.34, gap = u * 0.05;
  const extra = G.mode === "tripped" ? Math.max(0, Math.ceil(G.tripLoad) - cap) : 0;
  const cells = cap + extra;
  const w = cells * (cw + gap) + gap + u * 0.12, h = ch + u * 0.22;
  const shake = G.mode === "tripped" ? Math.sin(G.t * 90) * 3 * Math.max(0, 1 - G.modeT * 2.5) : 0;
  ctx.save(); ctx.translate(shake, 0);
  const ok = G.mode !== "tripped";
  ctx.fillStyle = COL.panel; ctx.strokeStyle = ok ? COL.bodyEdge : COL.red; ctx.lineWidth = 3;
  if (!ok) { ctx.shadowColor = COL.red; ctx.shadowBlur = 24 * (0.6 + 0.4 * Math.sin(G.t * 14)); }
  rr(x - w / 2, y - h / 2, w, h, u * 0.1); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
  for (let i = 0; i < cells; i++) {
    const cx = x - w / 2 + u * 0.06 + gap + i * (cw + gap), cy = y - ch / 2;
    const f = G.srcCells[i] || 0, over = i >= cap;
    ctx.fillStyle = over ? "rgba(255,77,77,0.12)" : "#1a2238"; rr(cx, cy, cw, ch, u * 0.045); ctx.fill();
    if (f > 0.02) {
      const full = ok && G.load >= cap;
      ctx.globalAlpha = Math.min(1, f);
      ctx.fillStyle = over || !ok ? COL.red : (full ? COL.amberHi : COL.amber);
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10 * f;
      rr(cx, cy, cw, ch, u * 0.045); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
    if (over) { ctx.strokeStyle = COL.red; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); rr(cx, cy, cw, ch, u * 0.045); ctx.stroke(); ctx.setLineDash([]); }
  }
  ctx.restore();
}

function drawSwitch(n) {
  const u = G.u, x = px(n), y = py(n), r = Math.max(15, u * 0.25), s = 1 + n.pop * 0.22;
  const closed = !!G.state[n.id], on = n.vp && closed;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = COL.body; ctx.strokeStyle = on ? COL.amber : COL.bodyEdge; ctx.lineWidth = 3;
  if (on) { ctx.shadowColor = COL.amber; ctx.shadowBlur = 16; }
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
  // contacts + lever
  const topY = -r * 0.55, botY = r * 0.55;
  ctx.fillStyle = on ? COL.amberHi : "#5a6788";
  ctx.beginPath(); ctx.arc(0, topY, r * 0.14, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(0, botY, r * 0.14, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(0, botY); ctx.rotate(n.ang === undefined ? 0 : n.ang);
  ctx.strokeStyle = on ? COL.core : (closed ? "#c9d3ee" : "#8892ab"); ctx.lineWidth = Math.max(3, r * 0.2); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -(botY - topY)); ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function drawRouter(n) {
  const u = G.u, x = px(n), y = py(n), r = Math.max(17, u * 0.28), s = 1 + n.pop * 0.22;
  const passing = n.vp;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = COL.body; ctx.strokeStyle = passing ? COL.amber : COL.bodyEdge; ctx.lineWidth = 3;
  if (passing) { ctx.shadowColor = COL.amber; ctx.shadowBlur = 16; }
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
  G.g.outs[n.id].forEach((cid, i) => {
    const c = G.nodes[cid], a = Math.atan2(px(c) - x, py(c) - y), sel = G.state[n.id] === i;
    ctx.fillStyle = sel ? (passing ? COL.amberHi : "#c9d3ee") : "#3a4666";
    ctx.beginPath(); ctx.arc(Math.sin(a) * r * 0.82, Math.cos(a) * r * 0.82, r * 0.11, 0, 7); ctx.fill();
  });
  ctx.rotate(Math.PI - (n.ang === undefined ? 0 : n.ang)); // lever drawn "up" then rotated toward the chosen output
  ctx.strokeStyle = passing ? COL.core : "#c9d3ee"; ctx.lineWidth = Math.max(3.5, r * 0.22); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r * 0.62); ctx.stroke();
  ctx.fillStyle = passing ? COL.amberHi : "#8892ab"; ctx.beginPath(); ctx.arc(0, -r * 0.62, r * 0.17, 0, 7); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = "#2a3558"; ctx.beginPath(); ctx.arc(0, 0, r * 0.16, 0, 7); ctx.fill(); ctx.restore();
}

function drawSplit(n) {
  const x = px(n), y = py(n), r = Math.max(4, G.u * 0.08);
  ctx.fillStyle = n.vp ? COL.amberHi : COL.wireEdge;
  if (n.vp) { ctx.shadowColor = COL.amber; ctx.shadowBlur = 12; }
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
}

// appliance glyphs: drawn in a box of side s centred on 0,0. p = power 0..1
const GLYPH = {
  lamp(s, p, n) {
    if (p > 0.02) {
      const g = ctx.createRadialGradient(0, -s * 0.08, 0, 0, -s * 0.08, s * 1.15);
      g.addColorStop(0, `rgba(255,236,150,${0.75 * p})`); g.addColorStop(1, "rgba(255,200,60,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -s * 0.08, s * 1.15, 0, 7); ctx.fill();
    }
    ctx.fillStyle = p > 0.3 ? "#fff0b0" : "#2b3552"; ctx.strokeStyle = p > 0.3 ? "#fff" : "#55628a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -s * 0.08, s * 0.24, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#55628a"; rr(-s * 0.1, s * 0.14, s * 0.2, s * 0.14, 2); ctx.fill();
  },
  fan(s, p, n) {
    ctx.strokeStyle = "#55628a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, s * 0.34, 0, 7); ctx.stroke();
    ctx.save(); ctx.rotate(n.rot);
    ctx.fillStyle = p > 0.3 ? COL.blue : "#4a5778";
    for (let i = 0; i < 3; i++) {
      ctx.rotate(Math.PI * 2 / 3);
      ctx.beginPath(); ctx.ellipse(0, -s * 0.17, s * 0.09, s * 0.17, 0, 0, 7); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = "#9aa6c6"; ctx.beginPath(); ctx.arc(0, 0, s * 0.05, 0, 7); ctx.fill();
  },
  tv(s, p, n) {
    const w = s * 0.7, h = s * 0.5;
    ctx.fillStyle = "#222b45"; rr(-w / 2, -h / 2 + s * 0.04, w, h, 4); ctx.fill();
    const sw = w * 0.82, sh = h * 0.72;
    if (p > 0.3) {
      const hue = (G.t * 70) % 360;
      const g = ctx.createLinearGradient(-sw / 2, 0, sw / 2, 0);
      g.addColorStop(0, `hsl(${hue},80%,55%)`); g.addColorStop(1, `hsl(${(hue + 80) % 360},80%,55%)`);
      ctx.fillStyle = g; ctx.shadowColor = `hsl(${hue},90%,60%)`; ctx.shadowBlur = 14 * p;
    } else ctx.fillStyle = "#0a0e19";
    rr(-sw / 2, -sh / 2 + s * 0.04, sw, sh, 3); ctx.fill(); ctx.shadowBlur = 0;
    if (p > 0.3) { ctx.fillStyle = "rgba(0,0,0,0.22)"; for (let y = -sh / 2; y < sh / 2; y += 4) ctx.fillRect(-sw / 2, y + s * 0.04 + ((G.t * 30) % 4), sw, 1.5); }
    ctx.strokeStyle = "#55628a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-s * 0.08, -h / 2 + s * 0.04); ctx.lineTo(-s * 0.2, -s * 0.38); ctx.moveTo(s * 0.08, -h / 2 + s * 0.04); ctx.lineTo(s * 0.2, -s * 0.38); ctx.stroke();
  },
  heater(s, p, n) {
    ctx.fillStyle = "#222b45"; rr(-s * 0.36, -s * 0.34, s * 0.72, s * 0.68, 5); ctx.fill();
    for (let i = -1; i <= 1; i++) {
      ctx.strokeStyle = p > 0.3 ? `rgb(255,${Math.round(110 + 70 * Math.sin(G.t * 8 + i))},50)` : "#4a5778"; ctx.lineWidth = Math.max(3, s * 0.07); ctx.lineCap = "round";
      if (p > 0.3) { ctx.shadowColor = "#ff7a30"; ctx.shadowBlur = 14 * p; }
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) { const yy = -s * 0.24 + k * s * 0.08, xx = i * s * 0.2 + (k % 2 ? s * 0.04 : -s * 0.04); k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
      ctx.stroke(); ctx.shadowBlur = 0;
    }
  },
  fridge(s, p, n) {
    const vib = p > 0.3 ? Math.sin(G.t * 60) * 0.8 : 0;
    ctx.save(); ctx.translate(vib, 0);
    ctx.fillStyle = p > 0.3 ? "#2c3d63" : "#222b45"; rr(-s * 0.26, -s * 0.38, s * 0.52, s * 0.76, 5); ctx.fill();
    ctx.strokeStyle = "#55628a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-s * 0.26, -s * 0.1); ctx.lineTo(s * 0.26, -s * 0.1); ctx.stroke();
    ctx.fillStyle = "#8f9bbb"; ctx.fillRect(s * 0.14, -s * 0.3, 3, s * 0.14); ctx.fillRect(s * 0.14, -s * 0.04, 3, s * 0.2);
    ctx.fillStyle = p > 0.3 ? COL.blue : "#33405f"; ctx.shadowColor = COL.blue; ctx.shadowBlur = p > 0.3 ? 10 : 0;
    ctx.beginPath(); ctx.arc(-s * 0.14, -s * 0.28, s * 0.04, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    ctx.restore();
  },
  radio(s, p, n) {
    ctx.fillStyle = "#222b45"; rr(-s * 0.37, -s * 0.2, s * 0.74, s * 0.46, 5); ctx.fill();
    const pulse = p > 0.3 ? 1 + 0.12 * Math.sin(G.t * 16) : 1;
    ctx.fillStyle = p > 0.3 ? COL.amberHi : "#3a4666"; ctx.beginPath(); ctx.arc(-s * 0.15, s * 0.03, s * 0.15 * pulse, 0, 7); ctx.fill();
    ctx.fillStyle = "#0e1424"; ctx.beginPath(); ctx.arc(-s * 0.15, s * 0.03, s * 0.06, 0, 7); ctx.fill();
    ctx.fillStyle = "#8f9bbb"; ctx.beginPath(); ctx.arc(s * 0.16, s * 0.03, s * 0.07, 0, 7); ctx.fill();
    ctx.strokeStyle = "#55628a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s * 0.25, -s * 0.2); ctx.lineTo(s * 0.34, -s * 0.38); ctx.stroke();
    if (p > 0.3) {
      ctx.strokeStyle = `rgba(255,214,90,${0.6 * p})`; ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) { const k = ((G.t * 1.6 + i * 0.5) % 1); ctx.globalAlpha = (1 - k) * p; ctx.beginPath(); ctx.arc(-s * 0.15, s * 0.03, s * (0.18 + k * 0.3), 0, 7); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
  },
  kettle(s, p, n) {
    ctx.fillStyle = p > 0.3 ? "#5b6f9a" : "#2d3756"; ctx.beginPath();
    ctx.moveTo(-s * 0.26, s * 0.3); ctx.lineTo(-s * 0.2, -s * 0.12); ctx.lineTo(s * 0.2, -s * 0.12); ctx.lineTo(s * 0.26, s * 0.3); ctx.closePath(); ctx.fill();
    ctx.fillRect(-s * 0.1, -s * 0.2, s * 0.2, s * 0.08);
    ctx.strokeStyle = "#8f9bbb"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s * 0.24, s * 0.08, s * 0.14, -1.2, 1.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * 0.22, 0); ctx.lineTo(-s * 0.36, -s * 0.1); ctx.stroke();
    ctx.fillStyle = p > 0.3 ? COL.red : "#3a4666"; ctx.beginPath(); ctx.arc(0, s * 0.2, s * 0.045, 0, 7); ctx.fill();
    if (p > 0.3) for (let i = 0; i < 3; i++) {
      const k = (G.t * 0.9 + i / 3) % 1; ctx.fillStyle = `rgba(220,235,255,${(1 - k) * 0.55 * p})`;
      ctx.beginPath(); ctx.arc(-s * 0.1 + Math.sin(k * 6 + i) * s * 0.07, -s * 0.24 - k * s * 0.34, s * (0.05 + k * 0.06), 0, 7); ctx.fill();
    }
  },
};

// Labels:
//  - pips + label sit on one shared line per row, hung from the largest tile (load 3) rather than each tile's
//    own size, so appliances of different loads line up
//  - in the house view they get a dark outline so they read over walls, lit rooms and the floor slab
//    (modhouse.js also drops the floor slab so its top surface no longer runs behind the label line)
const LABEL_LOAD = 3;
const labelHalf = () => G.u * (0.46 + 0.07 * LABEL_LOAD) / 2; // tile half-size the pips/label hang from

function drawAppliance(n) {
  const u = G.u, x = px(n), y = py(n);
  const s = u * (0.46 + 0.07 * n.load), p = n.pw, sc = 1 + n.pop * 0.18;
  const tripGlow = G.mode === "tripped" && n.culprit;
  const frozen = G.mode === "tripped" && G.tripSet && G.tripSet.has(n.id) && !n.culprit;
  ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
  // glow
  if (p > 0.02) { ctx.shadowColor = COL.amber; ctx.shadowBlur = 26 * p; }
  ctx.fillStyle = COL.body;
  ctx.strokeStyle = tripGlow ? COL.red : (frozen || p > 0.3 ? COL.amber : (n.done ? COL.green : (n.req ? "#8d9bc2" : COL.bodyEdge)));
  ctx.lineWidth = n.req && p < 0.3 ? 3 : 3;
  rr(-s / 2, -s / 2, s, s, s * 0.2); ctx.fill();
  if (n.done) { ctx.fillStyle = "rgba(70,224,138,0.13)"; ctx.fill(); }
  if (tripGlow) { ctx.shadowColor = COL.red; ctx.shadowBlur = 22 * (0.6 + 0.4 * Math.sin(G.t * 18)); }
  ctx.stroke(); ctx.shadowBlur = 0;
  if (n.task) { // charge ring: faint track, fills while powered, turns green when done
    const m = 6, w = s + 2 * m, rad = s * 0.26, perim = 4 * (w - 2 * rad) + 2 * Math.PI * rad;
    ctx.lineCap = "butt"; ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255,176,46,0.2)"; rr(-w / 2, -w / 2, w, w, rad); ctx.stroke();
    if (n.charge > 0.002) {
      ctx.strokeStyle = n.done ? COL.green : COL.amberHi; ctx.setLineDash([n.charge * perim, perim]);
      if (!n.done) { ctx.shadowColor = COL.amber; ctx.shadowBlur = 10; }
      rr(-w / 2, -w / 2, w, w, rad); ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
    }
  } else if (n.req && p < 0.3 && !tripGlow) { // "needs power" cue: slow pulsing halo
    ctx.globalAlpha = 0.25 + 0.2 * Math.sin(G.t * 3.2); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    rr(-s / 2 - 5, -s / 2 - 5, s + 10, s + 10, s * 0.28); ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.save(); ctx.beginPath(); rr(-s / 2 + 1, -s / 2 + 1, s - 2, s - 2, s * 0.2); ctx.clip();
  GLYPH[n.k](s, p, n);
  ctx.restore();
  // badge: required (!/✓) or bonus (☆/★)
  const bx = s / 2 - 2, by = -s / 2 + 2, br = Math.max(8, u * 0.13);
  if (n.req) {
    const done = n.task ? n.done : p > 0.3;
    const bs = done ? 1 : 1 + 0.12 * Math.sin(G.t * 4.5); // the "!" breathes until the appliance is satisfied
    ctx.save(); ctx.translate(bx, by); ctx.scale(bs, bs); ctx.translate(-bx, -by);
    ctx.fillStyle = done ? COL.green : "#fff"; ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill();
    ctx.fillStyle = "#0a0e19"; ctx.font = `800 ${br * 1.3}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(done ? "✓" : "!", bx, by + 1);
    ctx.restore();
  } else if (n.bonus) {
    ctx.fillStyle = p > 0.3 ? COL.gold : "#0e1424"; ctx.strokeStyle = COL.gold; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = p > 0.3 ? "#0a0e19" : COL.gold; ctx.font = `800 ${br * 1.4}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("★", bx, by + 1);
  }
  if (n.pass) { // its own power button, top-left
    const on = !!G.state[n.id], qx = -s / 2 + 2, qy = -s / 2 + 2, qr = Math.max(8, u * 0.13);
    ctx.fillStyle = on ? COL.amber : "#0e1424"; ctx.strokeStyle = on ? COL.amberHi : "#55628a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(qx, qy, qr, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = on ? "#0a0e19" : "#8f9bbb"; ctx.lineWidth = Math.max(1.8, qr * 0.2); ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(qx, qy + qr * 0.06, qr * 0.5, -Math.PI / 2 + 0.65, -Math.PI / 2 - 0.65 + Math.PI * 2, false); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(qx, qy - qr * 0.62); ctx.lineTo(qx, qy - qr * 0.05); ctx.stroke();
  }
  ctx.restore();
  // demand pips + name under the box
  const outlined = !!G.house; // house view: outlined labels and pips (the plain board keeps its flat look)
  const pw = u * 0.12, pg = u * 0.04, total = n.load * pw + (n.load - 1) * pg;
  for (let i = 0; i < n.load; i++) {
    const cx = x - total / 2 + i * (pw + pg), cy = y + labelHalf(n) + 7;
    ctx.fillStyle = p > 0.3 || (G.mode === "tripped" && G.tripSet && G.tripSet.has(n.id)) ? COL.amber : "#2a3454"; rr(cx, cy, pw, u * 0.1, 2); ctx.fill();
    if (outlined) { ctx.strokeStyle = "rgba(6,9,24,0.8)"; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  // the label may use the space up to its nearest neighbour in the row (POWER Rounded is wide), shrinking a little if needed
  let gapX = Infinity; Object.values(G.nodes).forEach((m) => { if (m !== n && m.t === "ap" && m.y === n.y) gapX = Math.min(gapX, Math.abs(m.x - n.x)); });
  TXT.fit(ctx, n.k.toUpperCase(), Math.max(9, u * 0.15), isFinite(gapX) ? gapX * u - 6 : 0, 7.5); ctx.textAlign = "center"; ctx.textBaseline = "top";
  const ly = y + labelHalf(n) + 7 + u * 0.1 + 4;
  if (outlined) { ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(6,9,24,0.85)"; ctx.lineWidth = Math.max(3, u * 0.06); ctx.strokeText(n.k.toUpperCase(), x, ly); }
  ctx.fillStyle = outlined ? "#c3cde4" : COL.dim; ctx.fillText(n.k.toUpperCase(), x, ly);
}

function drawHud() {
  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  const hudW = W - 18 - 112; // text left of the home / restart buttons
  TXT.pale(ctx, G.tut ? "POWER  ·  TUTORIAL" : G.cand ? "POWER  ·  CANDIDATE " + G.candKey.toUpperCase() + "  (not in catalogue)" : "POWER  ·  " + levelLabel(G.levelIndex), 18, 21, 12, { maxW: hudW, color: TXT.PALE_DIM });
  TXT.title(ctx, curLevel().name, 18, 45, 28, { maxW: hudW, minPx: 16 });
  TXT.pale(ctx, curLevel().hint, 18, 69, 13.5, { maxW: W - 36, minPx: 10 });
  // restart
  ctx.strokeStyle = COL.bodyEdge; ctx.lineWidth = 2; ctx.fillStyle = COL.panel;
  ctx.beginPath(); ctx.arc(W - 32, 34, 20, 0, 7); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = COL.text; ctx.lineWidth = 2.5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(W - 32, 34, 8, -0.4, Math.PI * 1.55); ctx.stroke();
  ctx.fillStyle = COL.text; ctx.beginPath(); ctx.moveTo(W - 32 + 11, 34 - 6); ctx.lineTo(W - 32 + 3, 34 - 9); ctx.lineTo(W - 32 + 11, 34 - 13); ctx.fill();
  if (!G.tut) { // progression: house button opens the neighborhood
    ctx.strokeStyle = COL.bodyEdge; ctx.lineWidth = 2; ctx.fillStyle = COL.panel; ctx.beginPath(); ctx.arc(W - 82, 34, 20, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = COL.text; ctx.lineWidth = 2.2; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(W - 91, 35); ctx.lineTo(W - 82, 27); ctx.lineTo(W - 73, 35); ctx.moveTo(W - 88, 33); ctx.lineTo(W - 88, 43); ctx.lineTo(W - 76, 43); ctx.lineTo(W - 76, 33); ctx.stroke();
    ctx.fillStyle = COL.amber; ctx.fillRect(W - 84, 36, 4, 4);
  }
  if (G.disc) { ctx.textAlign = "center"; TXT.soft(ctx, "Skip tip ›", W / 2, H - 26, 13, { color: COL.dim }); return; } // discovery
  if (G.tut) { // tutorial: a single Skip control instead of the level dots and stats
    if (G.tut.step < 5) { ctx.textAlign = "center"; TXT.soft(ctx, "Skip tutorial ›", W / 2, H - 26, 13, { color: COL.dim }); }
    return;
  }
  ctx.textAlign = "center";
  const mins = G.runTime.toFixed(1);
  TXT.soft(ctx, `taps ${G.taps}  ·  trips ${G.trips}  ·  ${mins}s`, W / 2, H - 14, 11, { color: "#6a789e", outline: "rgba(11,18,51,0.6)" });
}

function drawPanel() {
  const cy = H - HUD_BOTTOM + 44;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (G.mode === "tripped") {
    const flick = 0.75 + 0.25 * Math.sin(G.t * 22) * Math.max(0, 1 - G.modeT);
    ctx.save(); ctx.globalAlpha = flick;
    TXT.title(ctx, "OVERLOAD", W / 2, cy - 6, 30, { maxW: W - 32, stops: [[0, "#ffd6cf"], [0.5, "#ff7a6a"], [1, "#e8382e"]] }); ctx.restore();
    if (G.modeT > 0.15) { // why it happened: everything outlined in amber was on at once
      ctx.globalAlpha = Math.min(1, (G.modeT - 0.15) * 4);
      TXT.soft(ctx, G.tut && G.tut.caption ? G.tut.caption : "Too much on at once — more than the battery holds", W / 2, cy + 20, 13, { maxW: W - 28, minPx: 10, color: "#c3cde4" }); ctx.globalAlpha = 1;
    }
    if (G.modeT > TRIP_LOCK) {
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(G.t * 5);
      TXT.soft(ctx, "tap to reset the breaker", W / 2, cy + 42, 14, { color: COL.text }); ctx.globalAlpha = 1;
    }
  } else if (G.mode === "play" && G.disc) {
    Discovery.drawPanelText(ctx, G, cy); // discovery: prompt / caption in place of the goal line
  } else if (G.mode === "play" && !G.tut) { // the goal, always visible, with progress
    const reqs = Object.values(G.nodes).filter((n) => n.t === "ap" && n.req);
    if (reqs.length) {
      const hasTask = reqs.some((n) => n.task), okN = reqs.filter((n) => (n.task ? n.done : n.vp)).length;
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      const a = "Power every", b = hasTask ? "— rings fill, then stay done" : "appliance", r = 9, gap = 7;
      let px = 15; ctx.font = TXT.font(px);
      const words = () => ctx.measureText(a).width + ctx.measureText(b).width, room = W - 28 - 2 * gap - 2 * r;
      if (words() > room) { px = Math.max(11, px * room / words()); ctx.font = TXT.font(px); } // shrink to fit the phone width
      const wa = ctx.measureText(a).width, wb = ctx.measureText(b).width, total = wa + gap + 2 * r + gap + wb;
      let x = W / 2 - total / 2; const y = cy - 2;
      TXT.soft(ctx, a, x, y, px, { color: COL.text }); x += wa + gap;
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x + r, y, r, 0, 7); ctx.fill();
      ctx.fillStyle = "#0a0e19"; ctx.font = "800 12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("!", x + r, y + 1);
      ctx.textAlign = "left"; TXT.soft(ctx, b, x + 2 * r + gap, y, px, { color: COL.text });
      // progress: one dot per required appliance
      const dr = 6, ds = 20, x0 = W / 2 - ((reqs.length - 1) * ds) / 2;
      reqs.forEach((n, i) => {
        const ok = n.task ? n.done : n.vp;
        ctx.beginPath(); ctx.arc(x0 + i * ds, cy + 22, dr, 0, 7);
        if (ok) { ctx.fillStyle = COL.green; ctx.fill(); } else { ctx.strokeStyle = "#55628a"; ctx.lineWidth = 2; ctx.stroke(); }
      });
      void okN;
    }
  } else if (G.mode === "won" && G.tut) {
    Tutorial.drawWon(ctx, G, cy);
  } else if (G.mode === "play" && G.tut) {
    Tutorial.drawPanelText(ctx, G, cy);
  } else if (G.mode === "won") {
    const k = Math.min(1, G.modeT * 5), e = 1 - Math.pow(1 - k, 3);
    ctx.save(); ctx.translate(0, (1 - e) * 24); ctx.globalAlpha = e;
    TXT.title(ctx, "POWERED", W / 2, cy - 8, 32, { maxW: W - 32 });
    const hasBonus = G.g.order.some((id) => G.g.nodes[id].bonus);
    if (hasBonus) TXT.soft(ctx, G.bonus ? "★ bonus lit too!" : "☆ bonus not lit — can you get it?", W / 2, cy + 18, 14, { maxW: W - 28, color: G.bonus ? COL.gold : "#c3cde4" });
    else TXT.soft(ctx, `${G.taps} taps · ${G.trips} trips · ${G.runTime.toFixed(1)}s`, W / 2, cy + 18, 14, { color: "#c3cde4" });
    if (G.modeT > 0.5) { ctx.globalAlpha = 0.55 + 0.45 * Math.sin(G.t * 5); TXT.soft(ctx, G.cand ? "tap to replay" : (G.levelIndex === LEVELS.length - 1 ? "tap to play again from level 1" : "tap for next level"), W / 2, cy + 44, 14, { maxW: W - 28, color: COL.text }); }
    ctx.restore();
  }
}

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, H);
  ctx.save();
  if (G.shake > 0) ctx.translate((Math.random() - 0.5) * 16 * G.shake, (Math.random() - 0.5) * 16 * G.shake);

  if (G.house) HouseScene.draw(ctx, G, { px, py, W, H }); // house: environment behind the circuit
  drawWires();
  Object.values(G.nodes).forEach((n) => { if (n.t === "sp") drawSplit(n); });
  Object.values(G.nodes).forEach((n) => { if (n.t === "sw") drawSwitch(n); else if (n.t === "rt") drawRouter(n); });
  Object.values(G.nodes).forEach((n) => { if (n.t === "ap") drawAppliance(n); });
  drawSource();

  // rings + sparks
  G.rings.forEach((r) => {
    const k = r.life / r.dur; ctx.globalAlpha = 1 - k; ctx.strokeStyle = r.color; ctx.lineWidth = 3 * (1 - k) + 1;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.max * (1 - Math.pow(1 - k, 3)), 0, 7); ctx.stroke();
  });
  G.parts.forEach((p) => {
    const k = p.life / p.max; ctx.globalAlpha = 1 - k; ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, 7); ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.restore();

  // blackout after a trip: the board goes dark, HUD stays readable
  if (G.dark > 0.01) { ctx.fillStyle = `rgba(2,3,8,${0.55 * G.dark})`; ctx.fillRect(0, HUD_TOP - 10, W, H - HUD_TOP - 60); }
  if (G.flash > 0) { ctx.fillStyle = `rgba(255,${G.mode === "tripped" ? "90,90" : "255,255"},${0.5 * G.flash})`; ctx.fillRect(0, 0, W, H); }
  if (G.tut) Tutorial.drawOverlay(ctx, G, { px, py }); // tutorial: spotlight + pip/battery pulses
  if (G.disc) Discovery.drawOverlay(ctx, G, { px, py }); // discovery: spotlight + tap ring
  drawHud();
  drawPanel();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  step(dt); draw();
  requestAnimationFrame(frame);
}

resize();
JourneyMap.init({
  play: (i) => loadLevel(i),
  sfx: (kind) => { // placeholder chimes
    if (kind === "level") { Sfx.tone(784, 0.2, "triangle", 0.16); Sfx.tone(988, 0.34, "triangle", 0.16, null, 0.13); }
    else [523, 659, 784, 1046, 1318].forEach((f, k) => Sfx.tone(f, 0.5, "triangle", 0.18, null, 0.2 + k * 0.2));
  },
});
function loadFromHash() {
  const raw = (location.hash || "").slice(1);
  // tutorial: #0 always replays it; a bare address starts it once on first launch; a level link skips it
  if (typeof Tutorial !== "undefined" && (raw === "0" || (raw === "" && !Tutorial.isDone()))) return loadTutorial();
  const fin = /^finale([0-9]+)$/.exec(raw); // debug: replay a sector finale on the map without changing saves
  if (fin) { loadLevel(Progress.nextIndex() === null ? 0 : Progress.nextIndex()); JourneyMap.previewFinale(+fin[1] - 1); return; }
  if (raw === "tips") { // discovery: test mode, every tip level shows its tip (until reload)
    Discovery.enableTesting(); try { history.replaceState(null, "", "#5"); } catch (e) { /* ignore */ }
    return loadFromHash();
  }
  if (raw === "reset") { // progression: #reset clears saved progress and the tutorial flag (testing)
    Progress.reset(); Discovery.reset(); try { localStorage.removeItem("power.tutorial.done"); } catch (e) { /* ignore */ }
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
    return loadFromHash();
  }
  if (raw === "" && Progress.hasAny()) { // returning player: resume at the next unfinished level, with the neighborhood up
    const n = Progress.nextIndex(); loadLevel(n === null ? 0 : n);
    JourneyMap.showMap({ closable: true });
    return;
  }
  const h = raw || "1";
  if (/^c[0-9]+[a-z]$/.test(h)) loadCandidate(h.slice(1));
  else if (/^legacy[0-9]+p?$/.test(h)) loadLevel((parseInt(h.slice(6), 10) || 1) - 1, /p$/.test(h)); // the old catalogue number
  else if (Progress.idToIndex(h.replace(/p$/, "")) !== null) loadLevel(Progress.idToIndex(h.replace(/p$/, "")), /p$/.test(h)); // #overload
  else { const pos = parseInt(h, 10) || 1, i = Progress.indexAtPos(pos); loadLevel(i === null ? 0 : i, /p$/.test(h)); } // journey position; #3p = plain board
}
window.addEventListener("hashchange", loadFromHash);
loadFromHash();
TXT.ready().then(() => { last = performance.now(); requestAnimationFrame(frame); }); // text is canvas-drawn: wait for POWER Rounded
window.__power = G; // handy for playtest/debug in the console
window.__stepFor = (sec) => { for (let t = 0; t < sec; t += 1 / 60) step(1 / 60); }; // advance the simulation without rendering (automated checks)
