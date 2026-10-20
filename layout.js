// ============================================================================
// POWER — layout rules (visual only; level data, solver, solutions and node order are untouched)
//
// Loaded after logic.js and house.js. It wraps PowerLogic.build and HouseScene.build so every level,
// including new ones, gets the same treatment automatically:
//  1. Breathing room: neighbouring nodes in a row are spaced at least MIN_GAP apart (centre to centre).
//     Positions are remapped by ONE monotone function of x, so everything in a column moves together
//     (vertical wires stay vertical, switches stay above their appliances) and left-to-right order — which
//     decides router outputs — never changes.
//  2. No slim houses: a house narrower than MIN_RATIO x its height is widened, first through its outer
//     rooms (up to OUTER_MAX a side), then with decor-only side rooms (no circuit) that light with their
//     neighbour.
// Both stop at the width where the board would start to shrink on the reference phone (375 x 812), and a
// level that is already that wide is left exactly as authored (g.layout.exempt).
// Rules and rationale: DESIGN.md, "Layout rules". Checked by tools/test-layout.js (npm test).
// ============================================================================
(function (root) {
  const RULES = {
    MIN_GAP: { apap: 1.3, apsw: 1.15, swsw: 1.0 },      // board units; an appliance tile is ~0.65 wide
    MIN_RATIO: 0.65, OUTER_MAX: 0.6, ANNEX_MIN: 0.9,
    REF: (375 - 14) / (812 - 82 - 130),                 // reference phone: board width / height before game.js shrinks u
    MARGIN_W: 0.9, MARGIN_H: 1.3,                       // the margins game.js layout() adds around the board
  };
  const ADJ = ["BEDROOM", "LIVING ROOM", "KITCHEN", "STUDY"];
  const key = (x) => +x.toFixed(2);
  const maxBoardW = (S) => RULES.REF * (S.bounds.maxY - S.bounds.minY + RULES.MARGIN_H) - RULES.MARGIN_W; // widest board that keeps u
  const boardW = (S) => S.bounds.maxX - S.bounds.minX;
  const kind = (n) => (n.t === "ap" ? "ap" : "sw");

  // full spacing: stretch the gaps between distinct x positions until every pair in a row meets its minimum
  function spaced(g) {
    const xs = [...new Set(g.order.map((id) => key(g.nodes[id].x)))].sort((a, b) => a - b);
    if (xs.length < 2) return null;
    const gap = xs.slice(1).map((x, i) => x - xs[i]), at = (x) => xs.indexOf(key(x)), rows = {}, cons = [];
    g.order.forEach((id) => { const n = g.nodes[id]; if (n.t === "ap" || n.t === "sw" || n.t === "rt") (rows[n.y] = rows[n.y] || []).push(n); });
    Object.values(rows).forEach((r) => {
      r.sort((a, b) => a.x - b.x);
      for (let i = 1; i < r.length; i++) {
        const a = r[i - 1], b = r[i], ka = kind(a), kb = kind(b);
        if (at(b.x) > at(a.x)) cons.push([at(a.x), at(b.x), RULES.MIN_GAP[ka === kb ? ka + kb : "apsw"]]);
      }
    });
    for (let pass = 0; pass < 30; pass++) {
      let changed = false;
      cons.forEach(([i, j, min]) => {
        let cur = 0; for (let k = i; k < j; k++) cur += gap[k];
        if (cur < min - 1e-6) { const f = min / cur; for (let k = i; k < j; k++) gap[k] *= f; changed = true; }
      });
      if (!changed) break;
    }
    const nx = [xs[0]]; gap.forEach((d) => nx.push(nx[nx.length - 1] + d));
    const c0 = (xs[0] + xs[xs.length - 1]) / 2, c1 = (nx[0] + nx[nx.length - 1]) / 2; // keep the circuit centred
    return { xs, nx: nx.map((x) => x - c1 + c0) };
  }

  function install(logic, house) {
    if (!logic || !house || logic.build.__layout) return;
    const build = logic.build, houseBuild = house.build;

    logic.build = function (level) {
      const g = build(level);
      const S0 = houseBuild(g), maxW = maxBoardW(S0);
      g.layout = { maxW, spread: 0 };
      if (boardW(S0) >= maxW - 0.05) { g.layout.exempt = true; return g; } // already as wide as the screen allows
      const sp = spaced(g); if (!sp) return g;
      const span0 = sp.xs[sp.xs.length - 1] - sp.xs[0], spanF = sp.nx[sp.nx.length - 1] - sp.nx[0];
      const t = spanF - span0 > 1e-6 ? Math.max(0, Math.min(1, (maxW - boardW(S0)) / (spanF - span0))) : 0;
      const map = {}; sp.xs.forEach((x, i) => { map[x] = x + t * (sp.nx[i] - x); });
      g.order.forEach((id) => { const n = g.nodes[id]; n.x = map[key(n.x)]; });
      g.layout.spread = t;
      return g;
    };
    logic.build.__layout = true;

    house.build = function (g) {
      const S = houseBuild(g);
      if (!g.layout || g.layout.exempt) return S;
      const h = S.floor - S.roofTop, w = S.right - S.left;
      const target = Math.min(RULES.MIN_RATIO * h, g.layout.maxW - 0.28); // 0.28: the bounds pad house.js adds
      const e = (target - w) / 2; if (e < 0.03) return S;
      const outer = e <= RULES.OUTER_MAX + RULES.ANNEX_MIN ? e : RULES.OUTER_MAX, annex = e - outer; // never an annex narrower than ANNEX_MIN
      const L0 = S.left, R0 = S.right, mid = (L0 + R0) / 2;
      S.left -= outer; S.right += outer;
      S.rooms.forEach((r) => {
        if (Math.abs(r.x0 - L0) < 1e-6) { if (r.window && Math.abs(r.window.x - (r.x0 + 0.16)) < 1e-6) r.window.x -= outer; r.x0 = S.left; }
        if (Math.abs(r.x1 - R0) < 1e-6) { if (r.window && Math.abs(r.window.x + r.window.w - (r.x1 - 0.16)) < 1e-6) r.window.x += outer; r.x1 = S.right; }
      });
      if (S.tank !== null) S.tank += S.tank > mid ? outer : -outer;
      if (annex > 0.01) {
        const used = new Set(S.rooms.map((r) => r.name)), names = ADJ.filter((n) => !used.has(n));
        const spans = [...new Map(S.rooms.map((r) => [r.y0 + "|" + r.y1, r])).values()];
        [[S.left, -1], [S.right, 1]].forEach(([edge, side]) => {
          spans.forEach((row) => {
            const litBy = S.rooms.findIndex((r) => r.y0 === row.y0 && r.y1 === row.y1 && Math.abs((side < 0 ? r.x0 : r.x1) - edge) < 1e-6);
            S.rooms.push({ x0: side < 0 ? edge - annex : edge, x1: side < 0 ? edge : edge + annex, y0: row.y0, y1: row.y1, nodes: [], name: names.shift() || "STUDY", annex: true, litBy });
          });
          S.walls.push(edge);
        });
        S.left -= annex; S.right += annex;
        if (S.tank !== null) S.tank += S.tank > mid ? annex : -annex;
      }
      S.bounds.minX = S.left - 0.14; S.bounds.maxX = S.right + 0.14;
      S.widened = { outer, annex };
      return S;
    };
  }

  const api = { RULES, install, maxBoardW, boardW };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.PowerLayout = api; install(root.PowerLogic, typeof HouseScene !== "undefined" ? HouseScene : null); } // HouseScene is a top-level const, not a window property
})(typeof window !== "undefined" ? window : globalThis);
