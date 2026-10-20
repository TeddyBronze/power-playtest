// ============================================================================
// POWER — the house, assembled at runtime from the modular kit (default look since 2026-10-20)
//
// Loaded by index.html after game.js (and modkit/assembler.js). It ASSEMBLES each level's house at runtime from
// Codex's modular sprite kit (modkit/: assets.json + atlas_off/on.png + assembler.js; authoring source in blender/kit),
// placed around the room layout HouseScene.build() already derives from the level:
//   backdrop -> contact shadow -> back walls -> wall props / windows / lights -> furniture -> room light spill
//   -> dividers -> slabs -> roof, parapet, battery housing, roof details
// Each room crossfades OFF -> ON sprites at its eased light level. Furniture is placed only where it clears
// every node, label and wire; anything that doesn't fit is left out.
// Controls (dial/lever sprites, stronger wires, larger dots, 1.12x vector appliances) follow Codex's tested
// scene renderer. Positions, hit areas, states, animations and all logic stay the game's.
// ============================================================================
(function () {
  const ok = (i) => i && i.complete && i.naturalWidth > 0;
  const img = (src) => { const i = new Image(); i.src = src; return i; };
  const COS = Math.cos(Math.PI / 18);
  const SPR = {}; ["dial_off", "dial_on", "lever_off", "lever_on"].forEach((n) => { SPR[n] = img("modkit/controls/" + n + ".png"); });
  const BG = img("modkit/neighborhood.png"), BG_GROUND = 1185; // image row (lawn runs 1124-1279 mid-image) where the foundation's front edge stands
  let kit = null, A = null, NPPU = 150, skyTop = "#121a4e";
  let failed = false; // if the kit cannot load, the game keeps its original canvas house
  PowerAssetKit.load("modkit").then((k) => { kit = k; A = k.meta.assets; NPPU = k.meta.pixels_per_unit; }).catch((e) => { failed = true; console.error(e); });
  BG.addEventListener("error", () => { failed = true; }, { once: true });
  BG.addEventListener("load", () => {
    try { const c = document.createElement("canvas"); c.width = 1; c.height = 1; const x = c.getContext("2d"); x.drawImage(BG, 0, 0, BG.naturalWidth, 4, 0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; skyTop = `rgb(${d[0]},${d[1]},${d[2]})`; } catch (e) {}
  }, { once: true });

  const active = () => (G.cand || !G.house || !kit || !ok(BG) ? null : kit); // tutorial included: it is the first house players see
  const orig = { house: HouseScene.draw, source: drawSource, sw: drawSwitch, rt: drawRouter, ap: drawAppliance, wires: drawWires };

  // ---- furniture sets: upper-storey rooms get a hero piece or two; lower (circuit) rooms only small accents ---
  const SETS = {
    "BEDROOM": { floor: ["bed", "bedside_table", "dresser", "plant_small"], wall: ["curtain_pair", "picture_frame"] },
    "LIVING ROOM": { floor: ["sofa", "plant_large", "side_table", "armchair"], wall: ["picture_frame"] },
    "KITCHEN": { floor: ["counter", "cabinet", "kitchen_stool", "plant_small"], wall: ["kitchen_shelf", "upper_cupboard"] },
    "": { floor: ["cabinet", "plant_large", "side_table"], wall: ["picture_frame"] },
    "LOWER": { floor: ["plant_small", "side_table", "plant_large"], wall: [] },
  };
  const WALLS = ["wall_back", "wall_back_2", "wall_back_3"];
  // the floor slab is drawn lower by exactly the height of its visible top surface (sprite height above its base,
  // minus the front face), so that surface sits below the appliance labels instead of behind them
  const floorDrop = () => (A ? (A.slab_floor.pivot_px[1] - A.slab_floor.footprint.h * COS * NPPU) / NPPU : 0);
  const SEAM = 0.06; // ground-floor walls and dividers reach this far behind the slab so no gap can open
  const SLAB_T = 0.2, TOPFACE = 0.23, SPLIT_MIN = -0.2; // storey slab thickness; how much of a slab's top shows above it at 10 degrees

  // a piece's rectangle in board units when its pivot sits at (x, base)
  function rectOf(id, x, base, scale) {
    const a = A[id], k = scale / NPPU;
    return { x0: x - a.pivot_px[0] * k, y0: base - a.pivot_px[1] * k, x1: x - a.pivot_px[0] * k + a.size_px[0] * k, y1: base - a.pivot_px[1] * k + a.size_px[1] * k };
  }
  const hit = (r, list) => list.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0);
  // what the game draws for a node, above and below its centre (tile + pips + label), at the 1.12x appliance scale
  const extent = (n) => (n.t === "ap" ? [0.45, 0.72] : n.t === "sw" || n.t === "rt" ? [0.42, 0.42] : [0.08, 0.08]);

  // everything the player has to read or tap (nodes), and the wires, in board units
  function reserved() {
    const nodes = [], wires = [], u = G.u, bx = (sx) => (sx - G.ox) / u + G.bounds.minX, by = (sy) => (sy - G.oy) / u + G.bounds.minY;
    Object.values(G.nodes).forEach((n) => {
      if (n.t === "src") { const w = G.g.cap * 0.16 + 0.45; nodes.push({ x0: n.x - w, x1: n.x + w, y0: n.y - 0.4, y1: n.y + 0.4 }); return; }
      const [up, dn] = extent(n), hw = n.t === "ap" ? (0.46 + 0.07 * n.load) * 0.56 + 0.12 : up;
      nodes.push({ x0: n.x - hw, x1: n.x + hw, y0: n.y - up, y1: n.y + dn });
    });
    G.edges.forEach((e) => {
      for (let i = 1; i < e.pts.length; i++) {
        const a = e.pts[i - 1], b = e.pts[i], p = 0.1;
        wires.push({ x0: bx(Math.min(a.x, b.x)) - p, x1: bx(Math.max(a.x, b.x)) + p, y0: by(Math.min(a.y, b.y)) - p, y1: by(Math.max(a.y, b.y)) + p });
      }
    });
    return { nodes, wires };
  }

  // upper storey above the first branching row, when a slab fits there with clearance and leaves >= 1.6 of room
  // (same rule as blender/scene.py, without its perspective term: the kit camera is orthographic)
  function storeySplit(S) {
    const all = Object.values(G.nodes).filter((n) => n.t !== "src");
    const tap = all.filter((n) => n.t === "sw" || n.t === "rt" || (n.t === "ap" && n.pass));
    const rows = [...new Set(all.map((n) => +n.y.toFixed(2)))].sort((a, b) => a - b);
    for (const ry of rows) {
      if (tap.filter((n) => Math.abs(n.y - ry) < 0.05).length < 2) continue;
      const above = rows.filter((r) => r < ry - 0.05); if (!above.length) return null;
      let best = null;
      for (let k = 1; k < 40; k++) {
        const sy = above[above.length - 1] + (ry - above[above.length - 1]) * k / 40;
        const clear = Math.min(...all.filter((n) => n.y < sy).map((n) => (sy - SLAB_T / 2 - TOPFACE) - (n.y + extent(n)[1])),
          ...all.filter((n) => n.y > sy).map((n) => (n.y - extent(n)[0]) - (sy + SLAB_T / 2)));
        if (!best || clear > best[0]) best = [clear, sy];
      }
      return best && best[0] > SPLIT_MIN && best[1] - S.ceiling >= 1.6 ? best[1] : null;
    }
    return null;
  }

  // ---- per-level layout of every kit piece (cached until the level or the screen changes) ------------------
  let LAY = null;
  function layoutFor() {
    const key = (G.tut ? "tut" : G.levelIndex) + "|" + G.u + "|" + G.ox + "|" + G.oy;
    if (LAY && LAY.key === key && LAY.house === G.house) return LAY;
    const S = G.house, res = reserved(), busy = res.nodes.slice(), busyAll = res.nodes.concat(res.wires);
    const split = storeySplit(S), lowerTop = split !== null ? split + SLAB_T / 2 : S.ceiling;
    // visual rooms: the game rooms (trimmed below the upper storey) + the upper-storey rooms
    const rooms = S.rooms.map((r, i) => ({ x0: r.x0, x1: r.x1, y0: S.slab === null || r.y0 < S.slab ? Math.max(r.y0, lowerTop) : r.y0, y1: r.y1, name: split !== null && !r.annex ? "LOWER" : r.name, light: { [i]: 1 } })); // side rooms (layout2.js) have no circuit: full furniture
    const upperEdges = [];
    if (split !== null) {
      const tops = Object.values(G.nodes).filter((n) => n.t === "sw" || n.t === "rt"), trunk = tops.reduce((a, b) => (b.y < a.y ? b : a)).x;
      const w = Math.max(0.9, (S.right - S.left) / 3);
      const edges = S.right - S.left >= 2.6 ? [S.left, trunk - w / 2, trunk + w / 2, S.right] : [S.left, (S.left + S.right) / 2, S.right];
      const names = edges.length === 4 ? ["BEDROOM", "LIVING ROOM", "KITCHEN"] : ["BEDROOM", "KITCHEN"];
      for (let k = 0; k + 1 < edges.length; k++) {
        const r = { x0: edges[k], x1: edges[k + 1], y0: S.ceiling, y1: split - SLAB_T / 2, name: names[k], light: {} };
        S.rooms.forEach((g, i) => { const ov = Math.min(r.x1, g.x1) - Math.max(r.x0, g.x0); if (ov > 0.05) r.light[i] = ov / (r.x1 - r.x0); }); // lit by the game rooms below it
        rooms.push(r);
      }
      upperEdges.push(...edges.slice(1, -1));
    }
    rooms.forEach((r, i) => {
      const set = SETS[r.name] || SETS[""], items = [], inner = { x0: r.x0 + 0.13, x1: r.x1 - 0.13, y0: r.y0 + 0.06, y1: r.y1 + 0.16 }; // sprites reach a little below their base (contact shadow)
      const inside = (q) => q.x0 >= inner.x0 && q.x1 <= inner.x1 && q.y0 >= inner.y0 && q.y1 <= inner.y1;
      const tryPlace = (id, bases, fromRight, scale, avoid) => {
        const xs = []; for (let x = inner.x0; x <= inner.x1; x += 0.04) xs.push(x);
        if (fromRight) xs.reverse();
        for (const base of bases) for (const x of xs) {
          const q = rectOf(id, x, base, scale);
          if (inside(q) && !hit(q, avoid)) { const pad = { x0: q.x0 - 0.05, x1: q.x1 + 0.05, y0: q.y0, y1: q.y1 }; busy.push(pad); busyAll.push(pad); items.push({ id, x, base, scale }); return true; }
        }
        return false;
      };
      // a window in a top corner, clear of nodes and wires
      const win = i % 2 ? "window_plain" : "window_louvre", ws = 0.85;
      tryPlace(win, [r.y0 + 0.2 + A[win].footprint.h * ws * COS], i % 2 === 1, ws, busyAll);
      // floor pieces, alternating sides; prefer spots clear of wires, then accept a wire passing in front
      const max = r.name === "LOWER" ? 2 : 2;
      let n = 0;
      set.floor.forEach((id, k) => {
        if (n >= max) return;
        const side = k % 2 === 1;
        if (tryPlace(id, [r.y1], side, 1, busyAll) || tryPlace(id, [r.y1], side, 1, busy) || tryPlace(id, [r.y1], side, 0.8, busy)) n++;
      });
      const bt = items.find((it) => it.id === "bedside_table");
      if (bt) { const top = bt.base - A.bedside_table.footprint.h * COS; const q = rectOf("table_lamp", bt.x, top, 0.9); if (!hit(q, res.nodes)) { busy.push(q); items.push({ id: "table_lamp", x: bt.x, base: top, scale: 0.9 }); } }
      // one wall piece at a natural mounting height above the floor
      set.wall.some((id) => tryPlace(id, [0.95, 1.1, 0.8].map((h) => r.y1 - h * COS), false, 1, busyAll));
      // wall-mounted pieces behind floor pieces, then left to right
      const onFloor = (it) => (Math.abs(it.base - r.y1) < 1e-6 ? 1 : 0);
      items.sort((a, b) => onFloor(a) - onFloor(b) || a.x - b.x);
      r.items = items; r.wall = WALLS[i % WALLS.length];
    });
    // roof details on whichever side the battery leaves free
    const roof = [], src = G.g.nodes[G.g.src], half = G.g.cap * 0.16 + 0.55;
    if (S.tank !== null) roof.push({ id: "water_tank", x: S.tank });
    const other = S.tank !== null && S.tank > src.x ? S.left + 0.45 : S.right - 0.45;
    if (Math.abs(other - src.x) > half + 0.3) roof.push({ id: "roof_vent", x: other });
    // ground contact: greenery over the two front corners of the foundation (+ a few tufts on wide houses),
    // varied per level but stable, dropped where it would touch a node or label
    const ground = [], gb = S.floor + 0.28 + floorDrop() + (A.slab_floor.size_px[1] - A.slab_floor.pivot_px[1]) / NPPU; // foundation's visible bottom edge
    const gHalf = ((S.right + 0.09) - (S.left - 0.09) + 0.08) / 2, gcx = (S.left + S.right) / 2, xL = gcx - gHalf, xR = gcx + gHalf;
    let seed = [...(G.tut ? "tutorial" : (LEVELS[G.levelIndex] || {}).id || "level")].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    const flip = rnd() < 0.5, side = (sgn, big) => {
      const x = sgn < 0 ? xL : xR, extra = rnd() < 0.5 ? "bush_small" : "rock_small";
      return [ // the big bush straddles the corner so its foliage overlaps the slab's edge
        { id: big, x: x - sgn * 0.12, base: gb + 0.02, scale: 1.5 },
        { id: extra, x: x + sgn * 0.3, base: gb + 0.08, scale: 1.3 },
        { id: rnd() < 0.5 ? "grass_tuft" : "grass_tuft_2", x: x - sgn * (0.62 + rnd() * 0.15), base: gb + 0.08, scale: 1.3 },
      ];
    };
    const cand = [...side(-1, flip ? "bush_medium_2" : "bush_medium"), ...side(1, flip ? "bush_medium" : "bush_medium_2")];
    if (gHalf * 2 > 3) [0.33, 0.67].forEach((f, i) => cand.push({ id: i ? "rock_small" : (rnd() < 0.5 ? "grass_tuft" : "grass_tuft_2"), x: xL + gHalf * 2 * (f + (rnd() - 0.5) * 0.12), base: gb + 0.08, scale: 1.3 }));
    cand.forEach((p) => { // a corner bush that would touch a label falls back to smaller sizes before it is dropped
      const tries = p.id.startsWith("bush_medium") ? [[p.id, p.scale], [p.id, 1.15], ["bush_small", 1.3], ["bush_small", 1]] : [[p.id, p.scale]];
      const ok = tries.find(([id, sc]) => !hit(rectOf(id, p.x, p.base, sc), res.nodes));
      if (ok) ground.push(Object.assign({}, p, { id: ok[0], scale: ok[1] }));
    });
    ground.sort((a, b) => a.base - b.base);
    LAY = { key, house: G.house, rooms, roof, split, lowerTop, upperEdges, ground }; window.__lay = LAY;
    return LAY;
  }

  // ---- environment ---------------------------------------------------------------------------------------
  HouseScene.draw = function (c, G2, api) {
    const k = active();
    if (!k) {
      if (failed || G.cand || !G.house) return orig.house(c, G2, api);
      const g = c.createLinearGradient(0, 0, 0, api.H); g.addColorStop(0, "#151c52"); g.addColorStop(1, "#0b1030"); // still loading: plain night sky, no placeholder house
      c.fillStyle = g; c.fillRect(0, 0, api.W, api.H); return;
    }
    const S = G.house, u = G.u, W = api.W, H = api.H, lay = layoutFor();
    const X = (x) => G.ox + (x - G.bounds.minX) * u, Y = (y) => G.oy + (y - G.bounds.minY) * u;
    const dt = Math.max(0, Math.min(0.1, G.t - S._t)); S._t = G.t;
    if (!S._lit) S._lit = S.rooms.map(() => 0);
    const tripped = G.mode === "tripped";
    if (tripped && S._mode !== "tripped") S._tripLit = S._lit.slice();
    S._mode = G.mode;
    S.rooms.forEach((r, i) => {
      let tgt = 0; r.nodes.forEach((id) => { const n = G.nodes[id]; if (n) tgt = Math.max(tgt, n.pw); }); // a room is fully lit when anything in it is powered
      S._lit[i] += (Math.min(1, tgt) - S._lit[i]) * Math.min(1, dt * (tgt > S._lit[i] ? 5 : 12));
    });
    const lit = S._lit.map((v, i) => (!tripped || !S._tripLit || G.modeT > 0.5) ? v : Math.max(v, S._tripLit[i] * Math.max(0, 1 - G.modeT / 0.5) * (Math.sin(G.modeT * 55) > -0.2 ? 1 : 0.15)));
    S.rooms.forEach((r, i) => { if (r.litBy >= 0) lit[i] = lit[r.litBy]; }); // side rooms light with their neighbour
    const anyLit = Math.max(0, ...lit);
    const roomLit = (r) => Math.min(1, Object.entries(r.light).reduce((s, [i, w]) => s + w * lit[i], 0));
    const P = (id, x, y, power, scale = 1) => k.draw(c, id, X(x), Y(y), { ppu: u, scale, power });
    const panel = (id, x, y, w, h, power) => k.drawPanel(c, id, X(x), Y(y), w, h, { ppu: u, power });

    // backdrop: fills the screen with the lawn under the building. Zoomed in when needed so the foundation lands
    // mid-lawn AND the image still reaches the bottom of the screen (pushing it down instead put the house on the hedge line)
    const FD = floorDrop(), slabBase = Y(S.floor + 0.28 + FD), groundY = slabBase + (A.slab_floor.size_px[1] - A.slab_floor.pivot_px[1]) / NPPU * u; // visible bottom edge of the floor slab
    const s = Math.max(W / BG.naturalWidth, H / BG.naturalHeight, (H - groundY) / (BG.naturalHeight - BG_GROUND), groundY / BG_GROUND) * 1.02;
    const bw = BG.naturalWidth * s, bh = BG.naturalHeight * s;
    let oy = groundY - BG_GROUND * s; if (oy + bh < H) oy = H - bh; if (oy > 0) oy = 0;
    c.fillStyle = skyTop; c.fillRect(0, 0, W, H);
    c.drawImage(BG, (W - bw) / 2, oy, bw, bh);
    if (oy > 0) { const fg = c.createLinearGradient(0, oy, 0, oy + 40); fg.addColorStop(0, skyTop); fg.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = fg; c.fillRect(0, oy, W, 40); }

    const left = S.left - 0.09, right = S.right + 0.09, cx = (S.left + S.right) / 2, width = right - left;
    // ground shadow on the lawn: a wide soft one in front of and around the foundation, and a tighter, darker core
    const gx = X(cx), half = (width + 0.1) * u / 2;
    const blob = (rx, ry, dy, a) => {
      if (!(rx > 0 && ry > 0)) return; // e.g. before the first layout, when u is still 0
      c.save(); c.translate(gx, groundY + dy); c.scale(1, ry / rx);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, `rgba(4,6,20,${a})`); g.addColorStop(0.55, `rgba(4,6,20,${a * 0.55})`); g.addColorStop(1, "rgba(4,6,20,0)");
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, 7); c.fill(); c.restore();
    };
    blob(half * 1.3, u * 0.6, u * 0.08, 0.6);
    blob(half * 1.06, u * 0.24, u * 0.04, 0.85);
    if (anyLit > 0.02) { c.save(); c.globalCompositeOperation = "lighter"; const wg = c.createRadialGradient(X(cx), groundY, 0, X(cx), groundY, width * u * 0.7); wg.addColorStop(0, `rgba(255,170,80,${0.16 * anyLit})`); wg.addColorStop(1, "rgba(255,170,80,0)"); c.fillStyle = wg; c.fillRect(0, groundY - u, W, u * 3); c.restore(); }

    // rooms: back wall, props, light spill
    lay.rooms.forEach((r) => {
      const Lr = roomLit(r); r.lit = Lr;
      const ext = FD > 0 && Math.abs(r.y1 - S.floor) < 1e-6 ? SEAM : 0; // hidden behind the dropped slab
      panel(r.wall, (r.x0 + r.x1) / 2, r.y1 + ext, r.x1 - r.x0, (r.y1 - r.y0 + ext) / COS, Lr);
      r.items.forEach((it) => P(it.id, it.x, it.base, Lr, it.scale));
      if (Lr > 0.01) {
        const x0 = X(r.x0), y0 = Y(r.y0), w = (r.x1 - r.x0) * u, h = (r.y1 - r.y0) * u;
        c.save(); c.beginPath(); c.rect(x0, y0, w, h); c.clip(); c.globalCompositeOperation = "lighter";
        const g = c.createRadialGradient(x0 + w / 2, y0 + h * 0.12, 0, x0 + w / 2, y0 + h * 0.12, Math.max(w, h) * 0.9);
        g.addColorStop(0, `rgba(255,200,120,${0.2 * Lr})`); g.addColorStop(0.5, `rgba(255,170,90,${0.08 * Lr})`); g.addColorStop(1, "rgba(255,150,70,0)");
        c.fillStyle = g; c.fillRect(x0, y0, w, h); c.restore();
      }
    });
    // weight at the base: the lowest strip of wall darkens toward the floor (drawn under dividers and slabs)
    { const fy = Y(S.floor), ao = c.createLinearGradient(0, fy - u * 0.6, 0, fy); ao.addColorStop(0, "rgba(6,8,26,0)"); ao.addColorStop(1, "rgba(6,8,26,0.32)");
      c.fillStyle = ao; c.fillRect(X(S.left), fy - u * 0.6, (S.right - S.left) * u, u * 0.6); }
    const near = (x, y0, y1) => { let v = 0; lay.rooms.forEach((r) => { if (x >= r.x0 - 0.2 && x <= r.x1 + 0.2 && r.y1 > y0 && r.y0 < y1) v = Math.max(v, r.lit); }); return v * 0.7; };
    const rowLit = (y0, y1) => { let v = 0; lay.rooms.forEach((r) => { if (r.y1 > y0 - 0.15 && r.y0 < y1 + 0.15) v = Math.max(v, r.lit); }); return v * 0.6; };

    // dividers: outer walls and room walls of the lower storey, then the upper storey's
    const top = S.ceiling, lowH = (S.floor - lay.lowerTop) / COS;
    const dExt = FD > 0 ? SEAM : 0;
    [S.left, S.right, ...S.walls].forEach((x) => panel("divider", x, S.floor + dExt, A.divider.footprint.w, lowH + dExt / COS, near(x, lay.lowerTop, S.floor)));
    if (lay.split !== null) {
      const upB = lay.split - SLAB_T / 2, upH = (upB - top) / COS;
      [S.left, S.right, ...lay.upperEdges].forEach((x) => panel("divider", x, upB, A.divider.footprint.w, upH, near(x, top, upB)));
      panel("slab_storey", cx, lay.split + SLAB_T / 2, width + 0.06, SLAB_T, rowLit(lay.split - 0.3, lay.split + 0.3));
    }
    // storey and floor slabs, roof slab with parapet
    if (S.slab !== null) panel("slab_storey", cx, S.slab + 0.1, width, A.slab_storey.footprint.h, rowLit(S.slab - 0.2, S.slab + 0.2));
    panel("slab_floor", cx, S.floor + 0.28 + FD, width + 0.08, A.slab_floor.footprint.h, rowLit(S.floor - 0.2, S.floor));
    { // the foundation's front face darkens toward the ground, and a thin dark line marks where it meets the grass
      const sx = X(cx - (width + 0.08) / 2), sw = (width + 0.08) * u, top0 = Y(S.floor + FD), sg = c.createLinearGradient(0, top0, 0, groundY);
      sg.addColorStop(0, "rgba(6,8,26,0)"); sg.addColorStop(0.5, "rgba(6,8,26,0.12)"); sg.addColorStop(1, "rgba(6,8,26,0.42)");
      c.save(); c.beginPath(); c.rect(sx, top0, sw, groundY - top0 + 1); c.clip(); c.fillStyle = sg; c.fillRect(sx, top0, sw, groundY - top0 + 1); c.restore();
      const cl = c.createLinearGradient(0, groundY - 2, 0, groundY + u * 0.12); cl.addColorStop(0, "rgba(3,4,16,0.75)"); cl.addColorStop(1, "rgba(3,4,16,0)");
      c.fillStyle = cl; c.fillRect(sx - u * 0.04, groundY - 2, sw + u * 0.08, u * 0.12 + 2);
    }
    // greenery over the foundation corners, warmed by the ground-floor room above it
    const floorLit = (x) => { let v = 0; lay.rooms.forEach((r) => { if (Math.abs(r.y1 - S.floor) < 1e-6 && x >= r.x0 - 0.3 && x <= r.x1 + 0.3) v = Math.max(v, r.lit); }); return v * 0.8; };
    lay.ground.forEach((p) => P(p.id, p.x, p.base, floorLit(p.x), p.scale));
    panel("slab_roof", cx, top, width + 0.16, A.slab_roof.footprint.h, rowLit(top, top + 0.3));
    panel("parapet_edge", cx, top - A.slab_roof.footprint.h * COS, width + 0.12, A.parapet_edge.footprint.h, 0);
    // roof: battery housing (cells drawn by the game sit in its window), tank, vent
    const src = G.nodes[G.g.src], cellsW = G.g.cap * 0.32 + 0.17;
    lay.roof.forEach((p) => P(p.id, p.x, top - A.slab_roof.footprint.h * COS, 0));
    panel("battery_housing", src.x, src.y + 0.37, Math.max(1.0, cellsW + 0.3), A.battery_housing.footprint.h, 0);

    const sc = c.createLinearGradient(0, 0, 0, 120); sc.addColorStop(0, "rgba(12,16,44,0.75)"); sc.addColorStop(1, "rgba(12,16,44,0)"); c.fillStyle = sc; c.fillRect(0, 0, W, 120);
  };

  // ---- battery: cells only (the housing comes from the kit) -------------------------------------------------
  window.drawSource = function () {
    if (!active()) return orig.source();
    const n = G.nodes[G.g.src], u = G.u, cap = G.g.cap, x = px(n), y = py(n);
    const cw = u * 0.27, ch = u * 0.34, gap = u * 0.05;
    const extra = G.mode === "tripped" ? Math.max(0, Math.ceil(G.tripLoad) - cap) : 0, cells = cap + extra;
    const w = cells * (cw + gap) + gap + u * 0.12, okm = G.mode !== "tripped";
    const shake = G.mode === "tripped" ? Math.sin(G.t * 90) * 3 * Math.max(0, 1 - G.modeT * 2.5) : 0;
    ctx.save(); ctx.translate(shake, 0);
    if (!okm) { ctx.strokeStyle = COL.red; ctx.lineWidth = 3; ctx.shadowColor = COL.red; ctx.shadowBlur = 24 * (0.6 + 0.4 * Math.sin(G.t * 14)); rr(x - w / 2, y - (ch + u * 0.22) / 2, w, ch + u * 0.22, u * 0.1); ctx.stroke(); ctx.shadowBlur = 0; }
    for (let i = 0; i < cells; i++) {
      const cx = x - w / 2 + u * 0.06 + gap + i * (cw + gap), cy = y - ch / 2, f = G.srcCells[i] || 0, over = i >= cap;
      ctx.fillStyle = over ? "rgba(255,77,77,0.12)" : "#151b38"; rr(cx, cy, cw, ch, u * 0.06); ctx.fill();
      if (f > 0.02) {
        ctx.globalAlpha = Math.min(1, f); ctx.fillStyle = over || !okm ? COL.red : COL.amberHi; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12 * f;
        rr(cx, cy, cw, ch, u * 0.06); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(255,255,255,0.25)"; rr(cx + cw * 0.12, cy + ch * 0.1, cw * 0.76, ch * 0.22, u * 0.03); ctx.fill();
      }
      if (over) { ctx.strokeStyle = COL.red; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); rr(cx, cy, cw, ch, u * 0.06); ctx.stroke(); ctx.setLineDash([]); }
    }
    ctx.restore();
  };

  // ---- switches and routers: Codex's dial + lever sprites with larger connection dots ------------------------
  function dial(x, y, r, on, s) {
    const d = SPR[on ? "dial_on" : "dial_off"], size = 2 * r * 1.25 * s;
    if (on) { ctx.save(); ctx.globalAlpha = 0.55; ctx.shadowColor = COL.amber; ctx.shadowBlur = 22; ctx.fillStyle = "rgba(255,176,46,0.35)"; ctx.beginPath(); ctx.arc(x, y, r * s, 0, 7); ctx.fill(); ctx.restore(); }
    if (ok(d)) ctx.drawImage(d, x - size / 2, y - size / 2, size, size);
  }
  function lever(x, y, r, on, ang, s) {
    const l = SPR[on ? "lever_on" : "lever_off"], size = 2 * r * 1.25 * s * 1.25;
    if (!ok(l)) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.drawImage(l, -size / 2, -size / 2, size, size); ctx.restore();
  }
  window.drawSwitch = function (n) {
    if (!active()) return orig.sw(n);
    const u = G.u, r = Math.max(16, u * 0.28), s = 1 + n.pop * 0.18, on = n.vp && !!G.state[n.id];
    dial(px(n), py(n), r, on, s);
    lever(px(n), py(n), r, on, n.ang === undefined ? 0 : n.ang, s);
    for (const dy of [-0.83, 0.83]) {
      ctx.beginPath(); ctx.arc(px(n), py(n) + dy * r * s, Math.max(3.5, r * 0.18) * s, 0, 7);
      ctx.fillStyle = on ? "#fff0b0" : "#c9d5ef"; ctx.fill(); ctx.strokeStyle = "#10172d"; ctx.lineWidth = 1.8; ctx.stroke();
    }
  };
  window.drawRouter = function (n) {
    if (!active()) return orig.rt(n);
    const u = G.u, x = px(n), y = py(n), r = Math.max(17, u * 0.3), s = 1 + n.pop * 0.18, on = n.vp;
    dial(x, y, r, on, s);
    lever(x, y, r, on, Math.PI - (n.ang === undefined ? 0 : n.ang), s);
    G.g.outs[n.id].forEach((cid, i) => { // which outputs exist, which one is chosen
      const c = G.nodes[cid], a = Math.atan2(px(c) - x, py(c) - y), sel = G.state[n.id] === i;
      ctx.fillStyle = sel ? (on ? "#fff0b0" : "#ffffff") : "#9eadd2"; ctx.beginPath(); ctx.arc(x + Math.sin(a) * r * 0.88 * s, y + Math.cos(a) * r * 0.88 * s, Math.max(3.5, r * 0.19) * s, 0, 7); ctx.fill(); ctx.strokeStyle = "#10172d"; ctx.lineWidth = 1.8; ctx.stroke();
    });
  };

  // ---- wires: dark outline + light core so they read over furniture -------------------------------------------
  window.drawWires = function () {
    if (!active()) return orig.wires();
    const u = G.u;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    G.edges.forEach((e) => {
      ctx.strokeStyle = "#0a1024"; ctx.lineWidth = Math.max(8, u * 0.13); strokeRange(e, 0, e.len);
      ctx.strokeStyle = "#7383aa"; ctx.lineWidth = Math.max(4, u * 0.07); strokeRange(e, 0, e.len);
    });
    G.edges.forEach((e) => {
      if (e.a1 - e.a0 <= 0.0005) return;
      const d0 = e.a0 * e.len, d1 = e.a1 * e.len;
      ctx.strokeStyle = "rgba(255,176,46,0.28)"; ctx.lineWidth = Math.max(10, u * 0.2); strokeRange(e, d0, d1);
      ctx.strokeStyle = COL.amber; ctx.lineWidth = Math.max(5, u * 0.09); strokeRange(e, d0, d1);
      ctx.strokeStyle = COL.core; ctx.lineWidth = Math.max(2, u * 0.035); strokeRange(e, d0, d1);
      const gap = u * 0.55, sp = u * 2.2, off = (G.t * sp) % gap;
      ctx.fillStyle = "#fff";
      for (let d = off; d < e.len; d += gap) { if (d < d0 || d > d1) continue; const p = pointAt(e, d); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2.2, u * 0.035), 0, 7); ctx.fill(); }
      if (e.a1 < 0.999) { const p = pointAt(e, d1); ctx.fillStyle = "rgba(255,246,208,0.9)"; ctx.shadowColor = COL.amberHi; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(5, u * 0.09), 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
    });
  };

  // ---- appliances: the game's animated vector appliances, slightly larger ------------------------------------
  window.drawAppliance = function (n) {
    if (!active()) return orig.ap(n);
    const x = px(n), y = py(n);
    ctx.save(); ctx.translate(x, y); ctx.scale(1.12, 1.12); ctx.translate(-x, -y); orig.ap(n); ctx.restore();
  };
})();
