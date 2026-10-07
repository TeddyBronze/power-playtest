// ============================================================================
// POWER — pure circuit logic (no rendering). Shared by the game and the
// level solver in tools/solve.js, so what the solver proves is what the
// player experiences.
//
// Node types:
//   src  power source (feeds every output)
//   sp   split / junction (feeds every output)
//   sw   toggle switch (state 0 = open, 1 = closed), one output
//   rt   router (state = index of the ONE output that is fed), outputs
//        are ordered left-to-right by x
//   ap   appliance (terminal). load = power it draws while powered.
//        req:true  must be powered to win
//        bonus:true optional; powering it as well earns a star
//        task:N    charge appliance: needs ~N seconds of power in total (the
//                  game's clock). Once charged it is DONE for good and counts
//                  as satisfied even when switched off. It keeps drawing its
//                  load while it is powered, so you still have to switch it off.
//                  Partial charge is kept; nothing ever fails by waiting.
//        pass:true  (levels 8-9) the appliance sits ON the wire: it has a
//                  switch of its own (s: 1 = on) and feeds whatever hangs off
//                  it. Switched off it draws nothing AND passes nothing on, so
//                  everything downstream goes dark.
// An appliance fed by two live wires is still only one load.
// ============================================================================
(function (root) {
  function build(level) {
    const nodes = {};
    level.nodes.forEach((n) => { nodes[n.id] = Object.assign({ s: 0, load: 0 }, n); });
    const order = level.nodes.map((n) => n.id);
    const outs = {};
    order.forEach((id) => { outs[id] = []; });
    level.edges.forEach(([a, b]) => outs[a].push(b));
    order.forEach((id) => outs[id].sort((p, q) => nodes[p].x - nodes[q].x));
    const tappable = order.filter((id) => nodes[id].t === "sw" || nodes[id].t === "rt" || (nodes[id].t === "ap" && nodes[id].pass));
    const src = order.find((id) => nodes[id].t === "src");
    return { nodes, order, outs, tappable, src, cap: level.cap };
  }

  function initialState(g) {
    const s = {};
    g.tappable.forEach((id) => { s[id] = g.nodes[id].s | 0; });
    return s;
  }

  function nextState(g, state, id) {
    const n = g.nodes[id];
    const mod = n.t === "rt" ? g.outs[id].length : 2;
    return Object.assign({}, state, { [id]: (state[id] + 1) % mod });
  }

  // Which outputs does node `id` currently feed, given switch state?
  function passes(g, state, id, relaxed) {
    const n = g.nodes[id];
    if (n.t === "src" || n.t === "sp") return g.outs[id];
    if (n.t === "sw") return state[id] ? g.outs[id] : [];
    if (n.t === "rt") return g.outs[id].length ? [g.outs[id][state[id]]] : [];
    if (n.t === "ap" && n.pass) return state[id] || relaxed ? g.outs[id] : [];
    return [];
  }

  // Steady-state flow: returns { powered:Set(node ids), live:Set("a>b") }.
  // relaxed (analysis only): a switched-off pass appliance still hands power on.
  function flow(g, state, relaxed) {
    const powered = new Set([g.src]);
    const live = new Set();
    const queue = [g.src];
    const offSeen = new Set();
    while (queue.length) {
      const u = queue.shift();
      passes(g, state, u, relaxed).forEach((v) => {
        live.add(u + ">" + v);
        const off = g.nodes[v].t === "ap" && g.nodes[v].pass && !state[v];
        if (off) { // fed but switched off: wire is live up to it, it draws nothing
          if (relaxed && !offSeen.has(v)) { offSeen.add(v); queue.push(v); }
          return;
        }
        if (!powered.has(v)) { powered.add(v); queue.push(v); }
      });
    }
    return { powered, live };
  }

  function loadOf(g, powered) {
    let sum = 0;
    powered.forEach((id) => { if (g.nodes[id].t === "ap") sum += g.nodes[id].load; });
    return sum;
  }

  // done: Set of charge appliances that have finished (may be omitted)
  function isWon(g, powered, done) {
    return g.order.every((id) => {
      const n = g.nodes[id];
      if (!n.req) return true;
      return n.task ? !!(done && done.has(id)) : powered.has(id);
    });
  }

  function bonusDone(g, powered) {
    return g.order.every((id) => !g.nodes[id].bonus || powered.has(id));
  }

  const api = { build, initialState, nextState, passes, flow, loadOf, isWon, bonusDone };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PowerLogic = api;
})(typeof window !== "undefined" ? window : globalThis);
