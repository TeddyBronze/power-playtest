// ============================================================================
// POWER — "Light Up the Neighborhood" progression (logic only, no rendering)
//
// The 12 levels are grouped into five restoration milestones. Completing a level
// advances its milestone; completing a milestone's last level lights that
// location. Progress is saved locally. No currency, stars, lives or rewards.
//
// Level numbers here are 0-based indexes into LEVELS (level 1 = index 0).
// Puzzle content, difficulty and solutions are untouched: this only groups them.
//
// Rendering lives in neighborhood.js, which reads this module, so the visuals can
// be replaced with final art without touching the rules.
// ============================================================================
const Progress = (function () {
  const KEY = "power.progress.v1";

  // How the 12 levels map to locations (and why):
  //   Family Home      1-2   switching + the first capacity limit; short, so the first light-up comes quickly
  //   Neighbor's Flat  3-5   routers, a choice with a bonus, then the first capacity teaching level
  //   The Compound     6-8   a full battery, trunk + routers, charge
  //   The Corner Shop  9-10  sequencing, then appliances as part of the wire
  //   Our Street       11-12 pass-through + capacity, then charge + pass-through together
  const MILESTONES = [
    { id: "home", name: "The Family Home", levels: [0, 1] },
    { id: "flat", name: "The Neighbor's Flat", levels: [2, 3, 4] },
    { id: "compound", name: "The Compound", levels: [5, 6, 7] },
    { id: "shop", name: "The Corner Shop", levels: [8, 9] },
    { id: "street", name: "Our Street", levels: [10, 11] },
  ];
  const TOTAL = MILESTONES.reduce((n, m) => n + m.levels.length, 0);

  let data = load();
  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      if (v && Array.isArray(v.completed)) {
        return {
          completed: [...new Set(v.completed.filter((i) => Number.isInteger(i) && i >= 0 && i < TOTAL))],
          celebrated: Array.isArray(v.celebrated) ? [...new Set(v.celebrated.filter((i) => Number.isInteger(i)))] : [],
        };
      }
    } catch (e) { /* storage blocked or corrupt: start fresh */ }
    return { completed: [], celebrated: [] };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ } }

  const milestoneOf = (level) => MILESTONES.findIndex((m) => m.levels.includes(level));
  const isComplete = (level) => data.completed.includes(level);
  const counts = (m) => ({ done: MILESTONES[m].levels.filter(isComplete).length, total: MILESTONES[m].levels.length });
  const milestoneComplete = (m) => { const c = counts(m); return c.done === c.total; };
  const allComplete = () => MILESTONES.every((_, m) => milestoneComplete(m));
  const currentMilestone = () => MILESTONES.findIndex((_, m) => !milestoneComplete(m)); // -1 when everything is restored
  // 'done' | 'current' | 'locked'
  function status(m) { if (milestoneComplete(m)) return "done"; return m === currentMilestone() ? "current" : "locked"; }

  // Completing a level. Replays change nothing. Returns what happened, or null for levels outside the plan.
  function record(level) {
    const m = milestoneOf(level);
    if (m < 0) return null;
    const replay = isComplete(level);
    if (!replay) { data.completed.push(level); save(); }
    const c = counts(m);
    return { level, milestone: m, replay, done: c.done, total: c.total, milestoneDone: !replay && c.done === c.total };
  }

  // Where Continue goes: the next unfinished level after `after`, else the first unfinished level, else null.
  function nextLevel(after) {
    const flat = MILESTONES.flatMap((m) => m.levels);
    const later = flat.find((i) => i > (after === undefined ? -1 : after) && !isComplete(i));
    if (later !== undefined) return later;
    const any = flat.find((i) => !isComplete(i));
    return any === undefined ? null : any;
  }

  const hasAny = () => data.completed.length > 0;
  const wasCelebrated = (m) => data.celebrated.includes(m);
  function markCelebrated(m) { if (!data.celebrated.includes(m)) { data.celebrated.push(m); save(); } }
  function reset() { data = { completed: [], celebrated: [] }; try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  return { MILESTONES, TOTAL, milestoneOf, isComplete, counts, milestoneComplete, allComplete, currentMilestone, status, record, nextLevel, hasAny, wasCelebrated, markCelebrated, reset };
})();

if (typeof module !== "undefined" && module.exports) module.exports = { Progress };
