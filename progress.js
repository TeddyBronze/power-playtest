// ============================================================================
// POWER — journey progression (logic only, no rendering)
//
// The journey is a list of SECTORS of exactly 10 poles each. A pole is one level
// (slot 1-10); slot 10 is the sector's transformer / substation and its finale.
// Levels are addressed by stable id. Completing a level connects a wire from the
// previous pole; the wire chain is the unbroken run of completed levels from the start.
//
// Puzzle content, difficulty and solutions are untouched: this only orders them.
// Rendering lives in journeymap.js, which reads this module, so the visuals can be
// replaced with final art without touching the rules.
//
// Saves: power.progress.v2 = { v:2, completed:[ids], celebrated:[sectorIds] }.
// A v1 save (indexes into the old 12-level catalogue, plus milestones) is migrated on
// load through LEGACY below and left untouched.
// ============================================================================
const Progress = (function () {
  const KEY = "power.progress.v2", KEY_V1 = "power.progress.v1";
  const LEVEL_LIST = typeof LEVELS !== "undefined" ? LEVELS : require("./levels.js").LEVELS;
  const store = () => { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (e) { return null; } };

  // The v1 catalogue, frozen: old save index -> level id. Never edit.
  const LEGACY = ["flip-it", "not-enough", "crossroads", "worth-it", "main-switch", "already-full", "overload", "charge-up", "last-in-line", "on-the-line", "root-or-branch", "done-not-free"];

  // Journey order. null = a slot with no level yet (the pole is drawn as an unbuilt stub and skipped).
  // Sector 1: switching, capacity, routing. Sector 2: pass-through and charge.
  const SECTORS = [
    { id: "s1", name: "Residential street", theme: "street",
      levels: ["flip-it", "main-switch", "not-enough", "already-full", "crossroads", "worth-it", "s1-07", "s1-08", "s1-09", "overload"] },
    { id: "s2", name: "The compound", theme: "compound",
      levels: ["on-the-line", "s2-02", "s2-03", "charge-up", "root-or-branch", "s2-06", "s2-07", "last-in-line", "s2-09", "done-not-free"] },
  ];

  const indexOfId = {}; LEVEL_LIST.forEach((l, i) => { if (l.id) indexOfId[l.id] = i; });
  // every pole of the route, in order (built or not)
  const ROUTE = [];
  SECTORS.forEach((s, si) => s.levels.forEach((id, k) => {
    const index = id && indexOfId[id] !== undefined ? indexOfId[id] : null;
    ROUTE.push({ sector: si, slot: k + 1, pos: si * 10 + k + 1, id: index === null ? null : id, index, built: index !== null, finale: k === 9 });
  }));
  const CHAIN = ROUTE.filter((p) => p.built);            // the playable poles, in order
  ROUTE.forEach((p) => { p.chain = p.built ? CHAIN.indexOf(p) : -1; });
  const poleOfIndex = {}; CHAIN.forEach((p) => { poleOfIndex[p.index] = p; });

  // ---- save / migrate --------------------------------------------------------
  let data = { v: 2, completed: [], celebrated: [] };
  function parse(key) { const s = store(); if (!s) return null; try { return JSON.parse(s.getItem(key)); } catch (e) { return null; } }
  function load() {
    let d = null;
    const v2 = parse(KEY);
    if (v2 && Array.isArray(v2.completed)) {
      d = { v: 2, completed: [...new Set(v2.completed.filter((x) => typeof x === "string"))], celebrated: Array.isArray(v2.celebrated) ? [...new Set(v2.celebrated.filter((x) => typeof x === "string"))] : [] };
    } else {
      const v1 = parse(KEY_V1); // migrate: old indexes -> ids; unknown or out-of-range entries are dropped, v1 is left as it was
      const ids = v1 && Array.isArray(v1.completed) ? v1.completed.filter((i) => Number.isInteger(i) && i >= 0 && i < LEGACY.length).map((i) => LEGACY[i]) : [];
      d = { v: 2, completed: [...new Set(ids)], celebrated: [] };
      if (ids.length) { data = d; save(); }
    }
    data = d;
    // sectors that are already complete when the save is read were celebrated before (or are a migration): stay quiet
    SECTORS.forEach((s, si) => { if (sectorDone(si) && !d.celebrated.includes(s.id)) d.celebrated.push(s.id); });
    return d;
  }
  function save() { const s = store(); if (!s) return; try { s.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ } }

  // ---- queries ---------------------------------------------------------------
  const isCompleteId = (id) => data.completed.includes(id);
  const isComplete = (index) => !!LEVEL_LIST[index] && isCompleteId(LEVEL_LIST[index].id);
  const connected = () => { let n = 0; while (n < CHAIN.length && isCompleteId(CHAIN[n].id)) n++; return n; };   // length of the unbroken completed run
  const nextPole = () => CHAIN[connected()] || null;
  const nextIndex = () => { const p = nextPole(); return p ? p.index : null; };
  // 'done' | 'current' | 'locked' | 'gap'
  function status(p) { if (!p.built) return "gap"; if (isCompleteId(p.id)) return "done"; return nextPole() === p ? "current" : "locked"; }
  const wireLit = (p) => p.built && p.chain < connected();                // the wire INTO this pole carries power
  const sectorPoles = (si) => ROUTE.filter((p) => p.sector === si);
  const sectorBuilt = (si) => sectorPoles(si).every((p) => p.built);
  function sectorDone(si) { // a finale needs all ten levels, all complete, and the wire run unbroken to the transformer
    if (!sectorBuilt(si)) return false;
    const last = sectorPoles(si)[9];
    return connected() > last.chain;
  }
  const wasCelebrated = (si) => data.celebrated.includes(SECTORS[si].id);
  function markCelebrated(si) { if (!wasCelebrated(si)) { data.celebrated.push(SECTORS[si].id); save(); } }
  const hasAny = () => data.completed.length > 0;
  function reset() { data = { v: 2, completed: [], celebrated: [] }; const s = store(); if (s) { try { s.removeItem(KEY); s.removeItem(KEY_V1); } catch (e) { /* ignore */ } } }

  // position helpers (journey position = (sector-1)*10 + slot; used by #N links, the HUD and the number keys)
  const poleAt = (n) => ROUTE[n - 1] && ROUTE[n - 1].built ? ROUTE[n - 1] : null;
  const indexAtPos = (n) => { const p = poleAt(n); return p ? p.index : null; };
  const poleFor = (index) => poleOfIndex[index] || null;
  const idToIndex = (id) => (indexOfId[id] === undefined ? null : indexOfId[id]);

  // Completing a level. Replays change nothing. Returns what happened, or null for a level that is off the journey.
  function record(index) {
    const p = poleOfIndex[index]; if (!p) return null;
    const replay = isCompleteId(p.id), from = connected();
    if (!replay) { data.completed.push(p.id); save(); }
    const to = connected();
    let finale = -1;
    SECTORS.forEach((s, si) => { if (finale < 0 && !wasCelebrated(si) && sectorDone(si)) finale = si; });
    return { index, id: p.id, pole: p, sector: p.sector, slot: p.slot, replay, from, to, finale, connected: p.chain < to };
  }

  data = load(); // after every helper above exists

  return { SECTORS, ROUTE, CHAIN, LEGACY, record, status, wireLit, nextPole, nextIndex, connected, isComplete, isCompleteId, sectorBuilt, sectorDone, sectorPoles, wasCelebrated, markCelebrated, hasAny, reset, poleAt, indexAtPos, poleFor, idToIndex };
})();

if (typeof module !== "undefined" && module.exports) module.exports = { Progress };
