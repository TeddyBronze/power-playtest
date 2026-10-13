// ============================================================================
// POWER — Mechanic Discovery (isolated from the level catalogue)
//
// A very short guided tip the FIRST time a mechanic appears, embedded in the
// level that introduces it. Same pattern as the Level 0 tutorial, much shorter:
//   1. guided demonstration  (one locked tap, one-line prompt, spotlight)
//   2. visible consequence   (short caption)
//   3. unlocked step         (the player makes the decision; the level's win ends the tip)
//
//   routing       "Crossroads" (sector 1, slot 5)   tap a router: power takes one path
//   charge        "Fill the ring" (sector 2, slot 3)  watch a ring fill, then free the battery for the next job
//   pass-through  "On the line" (sector 2, slot 1)  an appliance that is off passes nothing on
//
// Level boards, solutions and the solver are untouched: this only locks controls
// and draws guidance. Seen once per mechanic (localStorage), never on a level the
// player has already completed, never on candidates or #Np links.
// A trip, restart or Skip ends the tip and returns to the level's real start board.
//
// Testing: #tips clears the flags and shows the tip every time a tip level loads
// (until the page is reloaded). #reset also clears them.
// To remove: delete this file, its <script> tag and the lines marked "discovery" in game.js.
// ============================================================================
const Discovery = (function () {
  const KEY = "power.discovery.v1";
  const AMBER = "#ffb02e", AMBER_HI = "#ffd65a", TEXT = "#eef2fa";
  const CAPTION_SECONDS = 2.6;
  const FREE = "Now power every ! appliance.";

  // level id -> sequence (attached to the stable id, so the tip follows the level wherever it sits on the journey). Each step: prompt, tap (the one allowed control, or null),
  // spot (nodes left bright), until (when the player's action has landed), caption (shown after).
  const SEQ = {
    crossroads: { key: "routing", steps: [
      { prompt: "A router sends power down one path at a time. Tap this router.", tap: "rb", spot: ["rb", "tv", "fan"],
        until: (G) => G.state.rb === 1 && G.nodes.fan.vp, caption: "Power goes down one path only." },
      { free: true, prompt: FREE },
    ] },
    "s2-03": { key: "charge", steps: [ // "Fill the ring" (sector 2, slot 3): the first charge level
      { prompt: "This one charges. Switch it on.", tap: "sa", spot: ["sa", "tv"],
        until: (G) => G.state.sa === 1 && G.nodes.tv.vp },
      { prompt: "Keep it powered until the ring fills.", tap: null, spot: ["tv"],
        until: (G) => G.nodes.tv.done, caption: "Ring full: the job is done." },
      { free: true, prompt: FREE },
    ] },
    "on-the-line": { key: "pass", steps: [
      { prompt: "The lamp is fed through the TV. Switch the TV off.", tap: "tv", spot: ["tv", "lamp"],
        until: (G) => G.state.tv === 0 && !G.nodes.lamp.vp, caption: "An appliance that is off passes nothing on." },
      { free: true, prompt: FREE },
    ] },
  };

  let testing = false; // #tips: ignore the saved flags
  function seen(key) { try { return (JSON.parse(localStorage.getItem(KEY)) || {})[key] === 1; } catch (e) { return false; } }
  function markSeen(key) { try { const v = JSON.parse(localStorage.getItem(KEY)) || {}; v[key] = 1; localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  function reset() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  function enableTesting() { testing = true; reset(); }

  function begin(levelIndex) {
    const seq = SEQ[LEVELS[levelIndex] && LEVELS[levelIndex].id];
    if (!seq) return null;
    if (!testing && (seen(seq.key) || (typeof Progress !== "undefined" && Progress.isComplete(levelIndex)))) return null;
    return { seq, i: 0, sub: "prompt", capAt: 0, nudgeAt: -9 };
  }
  const stepOf = (d) => d.seq.steps[d.i];
  function end(G) { const d = G.disc; if (!d) return; markSeen(d.seq.key); G.disc = null; }

  function allows(G, id) {
    const d = G.disc, s = stepOf(d);
    if (s.free) return true;
    return d.sub === "prompt" && s.tap === id;
  }
  function rejected(G) { G.disc.nudgeAt = G.t; }

  function advance(d) { d.i++; d.sub = "prompt"; }
  function update(G) {
    const d = G.disc; if (!d) return;
    if (G.mode === "won") { end(G); return; }   // the independent decision is solved
    if (G.mode !== "play") return;
    const s = stepOf(d);
    if (s.free) return;
    if (d.sub === "prompt" && s.until(G)) { if (s.caption) { d.sub = "caption"; d.capAt = G.t; } else advance(d); }
    else if (d.sub === "caption" && G.t - d.capAt > CAPTION_SECONDS) advance(d);
  }

  function rrPath(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // spotlight everything except the battery and the nodes in play, plus a ring on the control to tap
  function drawOverlay(ctx, G, api) {
    const d = G.disc; if (!d || G.mode !== "play") return;
    const s = stepOf(d); if (s.free) return;
    const u = G.u, t = G.t, top = HUD_TOP - 10, bottom = H - HUD_BOTTOM + 14;
    const sn = G.nodes[G.g.src], cap = G.g.cap, cw = u * 0.27, gap = u * 0.05, bw = cap * (cw + gap) + gap + u * 0.12, bh = u * 0.56;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, top, W, bottom - top);
    rrPath(ctx, api.px(sn) - bw / 2 - 12, api.py(sn) - bh / 2 - 12, bw + 24, bh + 24, 14);
    const rad = Math.max(u * 0.52, 30);
    s.spot.forEach((id) => {
      const n = G.nodes[id];
      if (n.t === "ap") { const sz = u * (0.46 + 0.07 * n.load); rrPath(ctx, api.px(n) - sz / 2 - 12, api.py(n) - sz / 2 - 12, sz + 24, sz + 26 + u * 0.5, 14); }
      else { ctx.moveTo(api.px(n) + rad, api.py(n)); ctx.arc(api.px(n), api.py(n), rad, 0, Math.PI * 2); }
    });
    ctx.fillStyle = "rgba(3,6,14,0.62)"; ctx.fill("evenodd");
    ctx.restore();
    if (d.sub === "prompt" && s.tap) {
      const n = G.nodes[s.tap], px = api.px(n), py = api.py(n), pulse = 0.5 + 0.5 * Math.sin(t * 5), bump = Math.max(0, 1 - (t - d.nudgeAt) / 0.5);
      ctx.strokeStyle = bump > 0 ? `rgba(255,255,255,${0.5 + 0.5 * bump})` : AMBER; ctx.lineWidth = 3 + 2 * bump;
      ctx.globalAlpha = 0.6 + 0.4 * pulse; ctx.beginPath(); ctx.arc(px, py, rad * 0.8 + 3 * pulse + 6 * bump, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
      const by = py - rad - 6 - 4 * pulse; ctx.fillStyle = AMBER_HI; ctx.beginPath(); ctx.moveTo(px, by + 9); ctx.lineTo(px - 8, by - 3); ctx.lineTo(px + 8, by - 3); ctx.closePath(); ctx.fill();
    }
  }

  function wrap(ctx, text, maxW) {
    const words = text.split(" "), lines = []; let cur = "";
    words.forEach((w) => { const test = cur ? cur + " " + w : w; if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test; });
    if (cur) lines.push(cur); return lines;
  }
  function drawPanelText(ctx, G, cy) { // play mode only
    const d = G.disc, s = stepOf(d); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (d.sub === "caption") {
      ctx.font = "700 17px system-ui, sans-serif"; ctx.fillStyle = AMBER_HI; ctx.globalAlpha = Math.min(1, (G.t - d.capAt) * 6);
      wrap(ctx, s.caption, W - 40).forEach((ln, i, arr) => ctx.fillText(ln, W / 2, cy - 2 + (i - (arr.length - 1) / 2) * 22));
      ctx.globalAlpha = 1; return;
    }
    ctx.font = "700 16px system-ui, sans-serif"; ctx.fillStyle = TEXT;
    const lines = wrap(ctx, s.prompt, W - 44);
    lines.forEach((ln, i) => ctx.fillText(ln, W / 2, cy - 4 + (i - (lines.length - 1) / 2) * 22));
  }

  return { begin, end, update, allows, rejected, drawOverlay, drawPanelText, enableTesting, reset };
})();

if (typeof module !== "undefined" && module.exports) module.exports = { Discovery };
