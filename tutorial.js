// ============================================================================
// POWER — Level 0 tutorial (isolated from the level catalogue)
//
// Teaches three things on a purpose-built board of 3 appliances:
//   1. the objective  (power every appliance marked !)
//   2. pips use battery cells  (1 bar = 1 cell)
//   3. switching something off frees power for something else
// through a short guided sequence with a deliberate overload, then an unlocked
// final step the player solves alone.
//
//   step 1  switch on the lamp           1 bar fills 1 cell
//   step 2  switch on the TV             2 bars fill 2 cells; battery full
//   step 3  switch on the radio          deliberate overload (1 bar too many)
//   step 4  make room for the radio      UNLOCKED; player solves it
//   step 5  "You did it!"                tap to start level 1
//
// Shown automatically on first launch (no level in the address), replayable
// with #0, skippable at any time. Not part of LEVELS, so levels 1-12 and their
// numbering are untouched. To remove: delete this file, its <script> tag, and
// the lines marked "tutorial" in game.js.
//
// The game owns the board; this file only supplies the level, decides which
// controls are allowed, watches the board to advance, and draws guidance.
// ============================================================================
const TUTORIAL_LEVEL = {
  name: "Tutorial", hint: "A quick walkthrough",
  cap: 3,
  nodes: [
    { id: "src", t: "src", x: 1, y: 0 },
    { id: "sp", t: "sp", x: 1, y: 1.3 },
    { id: "sl", t: "sw", x: 0, y: 2.4, s: 0 },
    { id: "st", t: "sw", x: 1, y: 2.4, s: 0 },
    { id: "sr", t: "sw", x: 2, y: 2.4, s: 0 },
    { id: "lamp", t: "ap", k: "lamp", x: 0, y: 3.9, load: 1, req: true },
    { id: "tv", t: "ap", k: "tv", x: 1, y: 3.9, load: 2 },
    { id: "radio", t: "ap", k: "radio", x: 2, y: 3.9, load: 1, req: true },
  ],
  edges: [["src", "sp"], ["sp", "sl"], ["sp", "st"], ["sp", "sr"], ["sl", "lamp"], ["st", "tv"], ["sr", "radio"]],
};

const Tutorial = (function () {
  const KEY = "power.tutorial.done";
  const PROMPT = {
    1: "Appliances marked ! need power. Switch on the lamp.",
    2: "Let's see how much power the TV uses. Switch it on.",
    3: "The battery is full. What happens if we switch on the radio?",
    4: "Make room for the radio without losing the lamp.",
    5: "You did it! Power every ! without overloading the battery.",
  };
  const CAPTION = {
    1: "1 bar = 1 battery cell.",
    2: "The battery is full: 3 bars, 3 cells.",
    3: "1 bar too many — the battery holds only 3.",
    5: "Switching off what you didn't need made room.",
  };
  const TARGET = { 1: { sw: "sl", ap: "lamp" }, 2: { sw: "st", ap: "tv" }, 3: { sw: "sr", ap: "radio" } };
  const CAPTION_SECONDS = 2.6;
  const AMBER = "#ffb02e", AMBER_HI = "#ffd65a", CORE = "#fff6d0", TEXT = "#eef2fa", DIM = "#7d879e", GREEN = "#46e08a";

  // ---- first-launch memory (never throws: storage can be blocked) ----------
  function isDone() { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; } }
  function markDone() { try { localStorage.setItem(KEY, "1"); } catch (e) { /* ignore */ } }

  // switch states each step starts from (also where a trip / restart returns to)
  const CP = { 1: { sl: 0, st: 0, sr: 0 }, 2: { sl: 1, st: 0, sr: 0 }, 3: { sl: 1, st: 1, sr: 0 }, 4: { sl: 1, st: 1, sr: 0 } };

  function begin() { return { step: 1, sub: "prompt", capAt: 0, caption: null, pairs: [], pairAt: 0, nudgeAt: -9, cp: Object.assign({}, CP[1]) }; }

  // ---- control restriction ----------------------------------------------------
  function allows(G, id) {
    const T = G.tut;
    if (T.sub !== "prompt") return false;            // captions and the trip are watch-only
    if (T.step === 4) return true;                   // the player's own step: everything unlocked
    return TARGET[T.step] && TARGET[T.step].sw === id;
  }
  function rejected(G) { G.tut.nudgeAt = G.t; }

  // ---- progress: watch the board, never drive it ------------------------------
  function caption(G, step, pairs) {
    const T = G.tut; T.sub = "caption"; T.capAt = G.t; T.caption = CAPTION[step]; T.pairs = pairs; T.pairAt = G.t;
  }
  function update(G) {
    const T = G.tut; if (!T) return;
    const now = G.t;
    if (T.step === 1 && T.sub === "prompt" && G.mode === "play" && G.nodes.lamp.vp) caption(G, 1, [{ node: "lamp", pip: 0, cell: 0 }]);
    else if (T.step === 2 && T.sub === "prompt" && G.mode === "play" && G.nodes.tv.vp) caption(G, 2, [{ node: "tv", pip: 0, cell: 1 }, { node: "tv", pip: 1, cell: 2 }]);
    else if (T.step === 3 && T.sub === "prompt" && G.mode === "tripped") { // the deliberate overload
      T.sub = "tripped"; T.caption = CAPTION[3]; T.pairs = [{ node: "radio", pip: 0, cell: 3 }]; T.pairAt = now;
    } else if ((T.step === 1 || T.step === 2) && T.sub === "caption" && now - T.capAt > CAPTION_SECONDS) {
      T.step += 1; T.sub = "prompt"; T.caption = null; T.pairs = []; T.cp = Object.assign({}, CP[T.step]);
    } else if (T.step === 4 && G.mode === "won") { T.step = 5; T.sub = "won"; T.caption = CAPTION[5]; markDone(); } // solved: never auto-start again
  }
  // after the player taps to reset a trip: return to the step's checkpoint, never to the start
  function onReset(G) {
    const T = G.tut;
    if (T.step === 3 && T.sub === "tripped") { T.step = 4; T.cp = Object.assign({}, CP[4]); }
    T.sub = "prompt"; T.caption = null; T.pairs = [];
    G.state = Object.assign({}, T.cp);
  }
  // restart button: back to the current step's checkpoint, earlier steps are not replayed
  function onRestart(G) {
    const T = G.tut;
    if (T.step === 5) { T.step = 4; T.cp = Object.assign({}, CP[4]); }
    T.sub = "prompt"; T.caption = null; T.pairs = [];
    G.state = Object.assign({}, T.cp);
  }

  // ---- geometry (mirrors drawAppliance / drawSource in game.js) ---------------
  function pipRect(G, api, n, i) {
    const u = G.u, s = u * (0.46 + 0.07 * n.load), pw = u * 0.12, pg = u * 0.04, total = n.load * pw + (n.load - 1) * pg;
    return { x: api.px(n) - total / 2 + i * (pw + pg), y: api.py(n) + s / 2 + 7, w: pw, h: u * 0.1 };
  }
  function cellRect(G, api, i) {
    const u = G.u, cap = G.g.cap, extra = G.mode === "tripped" ? Math.max(0, Math.ceil(G.tripLoad) - cap) : 0;
    const cw = u * 0.27, ch = u * 0.34, gap = u * 0.05, w = (cap + extra) * (cw + gap) + gap + u * 0.12, sn = G.nodes[G.g.src];
    return { x: api.px(sn) - w / 2 + u * 0.06 + gap + i * (cw + gap), y: api.py(sn) - ch / 2, w: cw, h: ch };
  }
  function rrPath(ctx, x, y, w, h, r) { // adds a rounded rect as a sub-path (no beginPath)
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

  // ---- drawing: spotlight, pip<->cell pulses, nudge --------------------------------
  function drawOverlay(ctx, G, api) {
    const T = G.tut, u = G.u, t = G.t; if (!T) return;
    const top = HUD_TOP - 10, bottom = H - HUD_BOTTOM + 14;

    // spotlight: dim everything except the battery and the one switch + appliance in play
    const focus = TARGET[T.step];
    if (focus && G.mode === "play") {
      const sw = G.nodes[focus.sw], ap = G.nodes[focus.ap], sn = G.nodes[G.g.src];
      const cap = G.g.cap, cw = u * 0.27, gap = u * 0.05, bw = cap * (cw + gap) + gap + u * 0.12, bh = u * 0.56;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, top, W, bottom - top);
      rrPath(ctx, api.px(sn) - bw / 2 - 12, api.py(sn) - bh / 2 - 12, bw + 24, bh + 24, 14);
      const rad = Math.max(u * 0.52, 30); ctx.moveTo(api.px(sw) + rad, api.py(sw)); ctx.arc(api.px(sw), api.py(sw), rad, 0, Math.PI * 2);
      const s = u * (0.46 + 0.07 * ap.load);
      rrPath(ctx, api.px(ap) - s / 2 - 12, api.py(ap) - s / 2 - 12, s + 24, s + 26 + u * 0.5, 14);
      ctx.fillStyle = "rgba(3,6,14,0.62)"; ctx.fill("evenodd");
      ctx.restore();
      if (T.sub === "prompt") { // pulsing ring + a small bouncing marker on the control to tap
        const px = api.px(sw), py = api.py(sw), pulse = 0.5 + 0.5 * Math.sin(t * 5), bump = Math.max(0, 1 - (t - T.nudgeAt) / 0.5);
        ctx.strokeStyle = bump > 0 ? `rgba(255,255,255,${0.5 + 0.5 * bump})` : AMBER; ctx.lineWidth = 3 + 2 * bump;
        ctx.globalAlpha = 0.6 + 0.4 * pulse; ctx.beginPath(); ctx.arc(px, py, rad * 0.8 + 3 * pulse + 6 * bump, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
        const by = py - rad - 6 - 4 * pulse; ctx.fillStyle = AMBER_HI; ctx.beginPath(); ctx.moveTo(px, by + 9); ctx.lineTo(px - 8, by - 3); ctx.lineTo(px + 8, by - 3); ctx.closePath(); ctx.fill();
      }
    }

    // synchronized pulse on each pip and the battery cell it fills, with dots flowing between them
    if (T.pairs.length) {
      const phase = (t - T.pairAt), glow = 0.55 + 0.45 * Math.sin(phase * 7);
      T.pairs.forEach((pr, idx) => {
        const n = G.nodes[pr.node], pip = pipRect(G, api, n, pr.pip), cell = cellRect(G, api, pr.cell);
        [pip, cell].forEach((r) => {
          ctx.fillStyle = `rgba(255,246,208,${0.2 + 0.25 * glow})`; ctx.beginPath(); rrPath(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 4); ctx.fill();
          ctx.strokeStyle = `rgba(255,246,208,${0.55 + 0.45 * glow})`; ctx.lineWidth = 2.5; ctx.beginPath(); rrPath(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 4); ctx.stroke();
        });
        const a = center(pip), b = center(cell), side = a.x <= b.x ? 1 : -1;
        const c = { x: (a.x + b.x) / 2 + side * u * 0.7, y: (a.y + b.y) / 2 };
        for (let k = 0; k < 3; k++) {
          const q = ((phase * 0.8 + k / 3 + idx * 0.17) % 1), x = (1 - q) * (1 - q) * a.x + 2 * (1 - q) * q * c.x + q * q * b.x, y = (1 - q) * (1 - q) * a.y + 2 * (1 - q) * q * c.y + q * q * b.y;
          ctx.globalAlpha = Math.sin(Math.PI * q); ctx.fillStyle = CORE; ctx.shadowColor = AMBER_HI; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        }
      });
    }
  }

  // ---- drawing: prompts (bottom panel) ------------------------------------------------
  function wrap(ctx, text, maxW) {
    const words = text.split(" "), lines = []; let cur = "";
    words.forEach((w) => { const test = cur ? cur + " " + w : w; if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test; });
    if (cur) lines.push(cur); return lines;
  }
  function drawPanelText(ctx, G, cy) { // play mode only
    const T = G.tut; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (T.sub === "caption") {
      ctx.font = "700 17px system-ui, sans-serif"; ctx.fillStyle = AMBER_HI;
      const k = Math.min(1, (G.t - T.capAt) * 6); ctx.globalAlpha = k;
      wrap(ctx, T.caption, W - 40).forEach((ln, i, arr) => ctx.fillText(ln, W / 2, cy - 2 + (i - (arr.length - 1) / 2) * 22));
      ctx.globalAlpha = 1; return;
    }
    ctx.font = "700 16px system-ui, sans-serif"; ctx.fillStyle = TEXT;
    const lines = wrap(ctx, PROMPT[T.step], W - 44);
    lines.forEach((ln, i) => ctx.fillText(ln, W / 2, cy - 4 + (i - (lines.length - 1) / 2) * 22));
  }
  function drawWon(ctx, G, cy) { // step 5
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const k = Math.min(1, G.modeT * 5), e = 1 - Math.pow(1 - k, 3);
    ctx.save(); ctx.translate(0, (1 - e) * 24); ctx.globalAlpha = e;
    ctx.fillStyle = GREEN; ctx.font = "800 30px system-ui, sans-serif"; ctx.shadowColor = GREEN; ctx.shadowBlur = 16; ctx.fillText("You did it!", W / 2, cy - 10); ctx.shadowBlur = 0;
    ctx.fillStyle = TEXT; ctx.font = "600 14px system-ui, sans-serif"; ctx.fillText(PROMPT[5].replace("You did it! ", ""), W / 2, cy + 16);
    ctx.fillStyle = DIM; ctx.font = "500 12.5px system-ui, sans-serif"; ctx.fillText(CAPTION[5], W / 2, cy + 36);
    if (G.modeT > 0.5) { ctx.globalAlpha = 0.55 + 0.45 * Math.sin(G.t * 5); ctx.fillStyle = TEXT; ctx.font = "600 14px system-ui, sans-serif"; ctx.fillText("tap to start", W / 2, cy + 62); }
    ctx.restore();
  }

  return { isDone, markDone, begin, allows, rejected, update, onReset, onRestart, drawOverlay, drawPanelText, drawWon };
})();

if (typeof module !== "undefined" && module.exports) module.exports = { TUTORIAL_LEVEL };
