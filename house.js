// ============================================================================
// POWER — EXPERIMENT: cutaway home at night (visual only, removable)
//
// Question: does playing inside a simplified cutaway home feel more distinctive
// and satisfying while staying as readable as the abstract board?
//
// Isolation: this file only DRAWS a scene behind the normal circuit renderer.
// It never touches levels.js, logic.js or the solver, and it never moves a node:
// the house is GENERATED AROUND each level's existing layout (a shell, rooms
// chosen by grouping appliances, a flat roof carrying the source). To remove
// the experiment: delete this file, its <script> tag in index.html, and the
// lines marked "house" in game.js.
//
// The house is the default presentation. Add "p" to a link (#3p) for the plain
// abstract board; "#3h" also works.
//
// Placeholders only: canvas rectangles, circles and lines. Final art replaces all.
// ============================================================================
const HouseScene = (function () {
  // how much each appliance contributes to "this room is lit up"
  const LIGHT_WEIGHT = { lamp: 0.95, heater: 0.6, tv: 0.55, fan: 0.45, fridge: 0.45, radio: 0.45, kettle: 0.45 };
  // which room name each appliance kind suggests (first free best match wins)
  const ROOM_OF = { fridge: "KITCHEN", kettle: "KITCHEN", tv: "LIVING ROOM", radio: "LIVING ROOM", fan: "LIVING ROOM", lamp: "BEDROOM", heater: "BEDROOM" };
  const ROOM_NAMES = ["LIVING ROOM", "BEDROOM", "KITCHEN", "STUDY", "PARLOUR", "STORE"];
  const C = {
    skyTop: "#0b1430", skyBot: "#05080f", slab: "#1b2542", slabEdge: "#2f3d63", wall: "#222e50",
    roomDark: [13, 20, 38], roomLit: [66, 52, 34], windowDark: [24, 36, 66], windowLit: [190, 150, 80],
    plate: "rgba(26,36,64,0.92)", plateEdge: "#33426b", label: "rgba(125,135,158,0.55)",
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (a, b, t) => `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;

  // ---- scene generation ----------------------------------------------------
  // Everything is in board units (levels.js units) and derived from node positions.
  function build(g) {
    const nodes = g.order.map((id) => g.nodes[id]);
    const apps = nodes.filter((n) => n.t === "ap");
    const src = g.nodes[g.src];
    let minX = Infinity, maxX = -Infinity, floor = -Infinity;
    nodes.forEach((n) => { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); floor = Math.max(floor, n.y + (n.t === "ap" ? 0.95 : 0.5)); });
    const m = 0.46, left = minX - m, right = maxX + m;
    const roofTop = src.y + 0.3, ceiling = roofTop + 0.15;

    // columns: contiguous groups of appliance x positions; the wall sits between groups
    const xs = [...new Set(apps.map((a) => +a.x.toFixed(2)))].sort((a, b) => a - b);
    const nCols = Math.max(2, Math.min(3, Math.round(apps.length / 2.2)));
    const per = xs.length / nCols, groups = [];
    for (let i = 0; i < nCols; i++) { const gr = xs.slice(Math.round(i * per), Math.round((i + 1) * per)); if (gr.length) groups.push(gr); }
    const walls = [];
    for (let i = 0; i + 1 < groups.length; i++) walls.push((groups[i][groups[i].length - 1] + groups[i + 1][0]) / 2);
    const colEdges = [left].concat(walls, [right]);

    // storeys: only very tall levels get a second floor, and only where a slab fits between appliance rows
    let slab = null;
    if (floor - ceiling > 6.4) {
      const ys = [...new Set(apps.map((a) => +a.y.toFixed(2)))].sort((a, b) => a - b);
      let best = 0;
      for (let i = 0; i + 1 < ys.length; i++) if (ys[i + 1] - ys[i] >= 2.0 && ys[i + 1] - ys[i] > best && (ys[i] + ys[i + 1]) / 2 > ceiling + 2) { best = ys[i + 1] - ys[i]; slab = (ys[i] + ys[i + 1]) / 2; }
    }
    const rows = slab === null ? [[ceiling, floor]] : [[ceiling, slab - 0.075], [slab + 0.075, floor]];

    const rooms = [];
    rows.forEach((row) => colEdges.slice(0, -1).forEach((x0, c) => {
      const x1 = colEdges[c + 1];
      const inside = apps.filter((a) => a.x > x0 && a.x <= x1 && a.y >= row[0] && a.y < row[1] + 0.3).map((a) => a.id);
      rooms.push({ x0, x1, y0: row[0], y1: row[1], nodes: inside, name: "" });
    }));
    // names from what is inside
    const used = new Set();
    rooms.filter((r) => r.nodes.length).forEach((r) => {
      const score = {}; r.nodes.forEach((id) => { const nm = ROOM_OF[g.nodes[id].k]; if (nm) score[nm] = (score[nm] || 0) + 1; });
      const pick = Object.keys(score).sort((a, b) => score[b] - score[a]).find((nm) => !used.has(nm)) || ROOM_NAMES.find((nm) => !used.has(nm));
      if (pick) { r.name = pick; used.add(pick); }
    });
    // a small louvre window in a top corner, only where no node sits near it
    rooms.forEach((r) => {
      const ww = 0.55, wh = 0.62, wy = r.y0 + 0.42; // below the room label
      const free = (wx) => !nodes.some((n) => n.x > wx - 0.5 && n.x < wx + ww + 0.5 && n.y > wy - 0.5 && n.y < wy + wh + 0.5);
      const cands = [r.x0 + 0.16, r.x1 - 0.16 - ww];
      const wx = cands.find(free);
      if (wx !== undefined && r.x1 - r.x0 > 1.4) r.window = { x: wx, y: wy, w: ww, h: wh };
    });

    return {
      bounds: { minX: left - 0.14, maxX: right + 0.14, minY: src.y - 0.85, maxY: floor + 0.45 },
      left, right, roofTop, ceiling, floor, slab, walls, rooms, tank: tankSpot(g, src, left, right),
      _lit: null, _t: 0, _mode: "play", _tripLit: null,
    };
  }

  // overhead water tank on whichever end of the roof the source plate leaves free (null = no room)
  function tankSpot(g, src, left, right) {
    const plateHalf = ((g.cap + 2) * 0.32 + 0.17) / 2 + 0.2; // source plate (with room for overflow cells)
    const roomR = right - (src.x + plateHalf), roomL = (src.x - plateHalf) - left;
    if (Math.max(roomL, roomR) < 0.8) return null;
    return roomR >= roomL ? right - 0.45 : left + 0.45;
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---- drawing -------------------------------------------------------------
  // api: { px(node), py(node), W, H }.  Called before the wires are drawn.
  function draw(ctx, G, api) {
    const S = G.house, u = G.u, W = api.W, H = api.H;
    const X = (x) => G.ox + (x - G.bounds.minX) * u, Y = (y) => G.oy + (y - G.bounds.minY) * u;
    const dt = Math.max(0, Math.min(0.1, G.t - S._t)); S._t = G.t;
    if (!S._lit) S._lit = S.rooms.map(() => 0);

    // --- how lit is each room? (eased), with a short flicker when the source trips
    const tripped = G.mode === "tripped";
    if (tripped && S._mode !== "tripped") S._tripLit = S._lit.slice();
    S._mode = G.mode;
    S.rooms.forEach((r, i) => {
      let tgt = 0;
      r.nodes.forEach((id) => { const n = G.nodes[id]; if (n) tgt += (LIGHT_WEIGHT[n.k] || 0.4) * n.pw; });
      tgt = Math.min(1, tgt);
      S._lit[i] += (tgt - S._lit[i]) * Math.min(1, dt * (tgt > S._lit[i] ? 6 : 14));
    });
    const lit = S._lit.map((v, i) => {
      if (!tripped || !S._tripLit || G.modeT > 0.5) return v;
      const f = Math.max(0, 1 - G.modeT / 0.5) * (Math.sin(G.modeT * 55) > -0.2 ? 1 : 0.15); // brief, readable flicker-out
      return Math.max(v, S._tripLit[i] * f);
    });
    const anyLit = Math.max(0, ...lit);

    // --- sky, moon, stars
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, C.skyTop); g.addColorStop(0.75, C.skyBot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const roofY = Y(S.roofTop);
    for (let i = 0; i < 26; i++) {
      const sx = ((i * 97 + 31) % 100) / 100 * W, sy = 90 + ((i * 53 + 17) % 100) / 100 * Math.max(10, roofY - 120);
      if (sy > roofY - 16) continue;
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(G.t * 1.5 + i); ctx.fillStyle = "#cfd8f5";
      ctx.fillRect(sx, sy, i % 5 === 0 ? 2.2 : 1.4, i % 5 === 0 ? 2.2 : 1.4);
    }
    ctx.globalAlpha = 0.55; ctx.fillStyle = "#dfe7fb"; ctx.beginPath(); ctx.arc(W - 40, HUD_TOP + 8, 11, 0, 7); ctx.fill();
    ctx.fillStyle = "#0b1430"; ctx.beginPath(); ctx.arc(W - 35, HUD_TOP + 5, 10, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;

    const left = X(S.left), right = X(S.right), top = Y(S.ceiling), floorY = Y(S.floor), wallT = Math.max(5, u * 0.09), slabT = Math.max(6, u * 0.15);
    const cx0 = (left + right) / 2, cy0 = (top + floorY) / 2;

    // --- warm halo around the whole house when something is on
    if (anyLit > 0.02) {
      const hg = ctx.createRadialGradient(cx0, cy0, u * 0.5, cx0, cy0, Math.max(right - left, floorY - top) * 0.75);
      hg.addColorStop(0, `rgba(255,214,140,${0.1 * anyLit})`); hg.addColorStop(1, "rgba(255,214,140,0)");
      ctx.fillStyle = hg; ctx.fillRect(0, roofY, W, floorY - roofY + u * 1.2);
    }

    // --- rooms (cutaway): fill, appliance light, window, label
    S.rooms.forEach((r, i) => {
      const x0 = X(r.x0), x1 = X(r.x1), y0 = Y(r.y0), y1 = Y(r.y1), L = lit[i];
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
      ctx.fillStyle = mix(C.roomDark, C.roomLit, L * 0.85); ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      // appliance light, clipped to the room so it never leaks through walls
      r.nodes.forEach((id) => {
        const n = G.nodes[id]; if (!n || n.pw < 0.02) return;
        const cx = api.px(n), cy = api.py(n), p = n.pw;
        const wash = (rad, color, a) => { const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad); gg.addColorStop(0, `rgba(${color},${a * p})`); gg.addColorStop(1, `rgba(${color},0)`); ctx.fillStyle = gg; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); };
        if (n.k === "lamp") {
          const lg = ctx.createRadialGradient(cx, cy - u * 0.05, 0, cx, cy - u * 0.05, u * 2.3);
          lg.addColorStop(0, `rgba(255,232,160,${0.55 * p})`); lg.addColorStop(0.45, `rgba(255,214,130,${0.2 * p})`); lg.addColorStop(1, "rgba(255,200,100,0)");
          ctx.fillStyle = lg; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        } else if (n.k === "tv") wash(u * 1.5, "150,190,255", 0.3 * (0.85 + 0.15 * Math.sin(G.t * 9)));
        else if (n.k === "heater") wash(u * 1.5, "255,120,50", 0.3);
        else if (n.k === "fridge") wash(u * 1.2, "170,215,255", 0.22);
        else wash(u * 1.2, "255,214,140", 0.22);
      });
      // window with louvres: moonlit blue when dark, warm when the room is lit
      if (r.window) {
        const wx = X(r.window.x), ww = r.window.w * u, wy = Y(r.window.y), wh = r.window.h * u;
        ctx.fillStyle = mix(C.windowDark, C.windowLit, L * 0.8); rr(ctx, wx, wy, ww, wh, 3); ctx.fill();
        ctx.strokeStyle = "rgba(10,14,26,0.55)"; ctx.lineWidth = 1.5;
        for (let k = 1; k < 6; k++) { ctx.beginPath(); ctx.moveTo(wx, wy + (wh * k) / 6); ctx.lineTo(wx + ww, wy + (wh * k) / 6); ctx.stroke(); }
        ctx.strokeStyle = C.plateEdge; ctx.lineWidth = 2.5; rr(ctx, wx, wy, ww, wh, 3); ctx.stroke();
      }
      // fan airflow: faint moving streaks beside a running fan; heat shimmer above a running heater
      r.nodes.forEach((id) => {
        const n = G.nodes[id]; if (!n || n.pw < 0.3) return;
        const cx = api.px(n), cy = api.py(n), s = u * (0.46 + 0.07 * n.load);
        if (n.k === "fan") {
          ctx.strokeStyle = `rgba(170,215,255,${0.45 * n.pw})`; ctx.lineWidth = 1.8; ctx.lineCap = "round"; ctx.setLineDash([u * 0.16, u * 0.14]); ctx.lineDashOffset = -G.t * u * 1.6;
          [-1, 1].forEach((dir) => [-0.14, 0.02, 0.18].forEach((dy) => {
            ctx.beginPath(); ctx.moveTo(cx + dir * s * 0.62, cy + dy * u); ctx.quadraticCurveTo(cx + dir * s * 1.0, cy + (dy - 0.06) * u, cx + dir * s * 1.5, cy + (dy + 0.04) * u); ctx.stroke();
          }));
          ctx.setLineDash([]);
        } else if (n.k === "heater") {
          ctx.strokeStyle = `rgba(255,150,80,${0.35 * n.pw})`; ctx.lineWidth = 1.6;
          for (let k = -1; k <= 1; k++) { ctx.beginPath(); for (let j = 0; j <= 6; j++) { const yy = cy - s * 0.55 - j * u * 0.07 - ((G.t * u * 0.4) % (u * 0.07)), xx = cx + k * s * 0.22 + Math.sin(G.t * 4 + j + k) * 2.2; j ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); } ctx.stroke(); }
        }
      });
      ctx.restore();
      if (r.name) {
        ctx.fillStyle = C.label; ctx.font = `600 ${Math.max(8, u * 0.13)}px system-ui, sans-serif`; ctx.textBaseline = "top"; ctx.textAlign = "left";
        const fitW = x1 - x0 - 2 * wallT - 8;
        const label = [r.name, r.name.split(" ")[0].slice(0, 7)].find((t) => ctx.measureText(t).width <= fitW);
        if (label) ctx.fillText(label, x0 + wallT + 4, y0 + 5);
      }
    });

    // --- walls, storey slab, floor slab, ground
    ctx.fillStyle = C.wall;
    const wallTop = top, wallH = floorY - top;
    ctx.fillRect(left - wallT, wallTop, wallT, wallH);
    ctx.fillRect(right, wallTop, wallT, wallH);
    S.walls.forEach((wx) => ctx.fillRect(X(wx) - wallT / 2, wallTop, wallT, wallH));
    if (S.slab !== null) { ctx.fillStyle = C.slab; ctx.fillRect(left - wallT, Y(S.slab) - slabT / 2, right - left + 2 * wallT, slabT); ctx.strokeStyle = C.slabEdge; ctx.lineWidth = 1.5; ctx.strokeRect(left - wallT, Y(S.slab) - slabT / 2, right - left + 2 * wallT, slabT); }
    ctx.fillStyle = C.slab; ctx.fillRect(left - wallT, floorY, right - left + 2 * wallT, slabT);
    const groundY = floorY + slabT, bottomY = Y(S.bounds.maxY);
    ctx.fillStyle = "#0a0f1d"; ctx.fillRect(left - wallT - 6, groundY, right - left + 2 * wallT + 12, Math.max(0, bottomY - groundY));
    ctx.strokeStyle = C.slabEdge; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(left - wallT - 6, groundY); ctx.lineTo(right + wallT + 6, groundY); ctx.stroke();
    if (anyLit > 0.02) { const sg = ctx.createLinearGradient(0, floorY, 0, bottomY); sg.addColorStop(0, `rgba(255,214,140,${0.12 * anyLit})`); sg.addColorStop(1, "rgba(255,214,140,0)"); ctx.fillStyle = sg; ctx.fillRect(left - wallT, groundY, right - left + 2 * wallT, Math.max(0, bottomY - groundY)); }

    // --- roof: flat slab with parapet and an overhead water tank
    const slabH = Y(S.ceiling) - roofY;
    ctx.fillStyle = C.slab; ctx.fillRect(left - wallT - 4, roofY, right - left + 2 * wallT + 8, slabH);
    ctx.strokeStyle = C.slabEdge; ctx.lineWidth = 2; ctx.strokeRect(left - wallT - 4, roofY, right - left + 2 * wallT + 8, slabH);
    ctx.fillStyle = C.slab; ctx.fillRect(left - wallT - 4, roofY - u * 0.18, wallT + 2, u * 0.18); ctx.fillRect(right + 2, roofY - u * 0.18, wallT + 2, u * 0.18);
    if (S.tank !== null) {
      const tw = u * 0.55, th = u * 0.55, tx = X(S.tank);
      ctx.fillStyle = "#1b2744"; ctx.strokeStyle = C.slabEdge; ctx.lineWidth = 2;
      ctx.fillRect(tx - tw / 2, roofY - th, tw, th); ctx.strokeRect(tx - tw / 2, roofY - th, tw, th);
      ctx.beginPath(); ctx.ellipse(tx, roofY - th, tw / 2, u * 0.08, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#0e1630"; ctx.fillRect(tx - tw / 2 + 5, roofY - th * 0.78, tw - 10, 3);
    }

    // --- where power starts: a mounting plate behind the source, with a label
    const srcNode = G.nodes[G.g.src], cap = G.g.cap, cells = cap + (G.mode === "tripped" ? Math.max(0, Math.ceil(G.tripLoad) - cap) : 0);
    const sw = cells * (u * 0.27 + u * 0.05) + u * 0.05 + u * 0.12, sh = u * 0.34 + u * 0.22, sx = api.px(srcNode), sy = api.py(srcNode);
    ctx.fillStyle = C.plate; ctx.strokeStyle = G.mode === "tripped" ? "rgba(255,77,77,0.6)" : C.plateEdge; ctx.lineWidth = 2;
    rr(ctx, sx - sw / 2 - u * 0.14, sy - sh / 2 - u * 0.12, sw + u * 0.28, sh + u * 0.24, u * 0.1); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.label; ctx.font = `700 ${Math.max(8, u * 0.13)}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText("POWER IN", sx, sy - sh / 2 - u * 0.16);

    // --- wall plates behind every switch / router so they read as things you can tap
    G.g.tappable.forEach((id) => {
      const n = G.nodes[id]; if (n.t === "ap") return;
      const s = Math.max(34, u * 0.82);
      ctx.fillStyle = C.plate; ctx.strokeStyle = C.plateEdge; ctx.lineWidth = 2; rr(ctx, api.px(n) - s / 2, api.py(n) - s / 2, s, s, s * 0.22); ctx.fill(); ctx.stroke();
    });
  }

  return { build, draw };
})();
