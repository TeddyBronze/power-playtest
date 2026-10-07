// Handcrafted levels. x/y are board units (1 unit = one grid cell).
// See logic.js for node types and DESIGN.md for the difficulty framework
// (diff = the designer's intended 1-5 rating). Check with: npm run solve
const LEVELS = [
  { // 1 — learn switching and flow
    name: "Flip it", hint: "Tap the switches to power every ! appliance",
    diff: 1, // intended difficulty, see DESIGN.md
    cap: 3,
    nodes: [
      { id: "src", t: "src", x: 1, y: 0 },
      { id: "m", t: "sw", x: 1, y: 1.2, s: 0 },
      { id: "sp", t: "sp", x: 1, y: 2.3 },
      { id: "sa", t: "sw", x: 0, y: 3.2, s: 0 },
      { id: "sb", t: "sw", x: 2, y: 3.2, s: 0 },
      { id: "lamp", t: "ap", k: "lamp", x: 0, y: 4.6, load: 1, req: true },
      { id: "fan", t: "ap", k: "fan", x: 2, y: 4.6, load: 1, req: true },
    ],
    edges: [["src", "m"], ["m", "sp"], ["sp", "sa"], ["sp", "sb"], ["sa", "lamp"], ["sb", "fan"]],
  },
  { // 2 — limited power: free up capacity before the big load
    name: "Not enough", hint: "The source can only carry so much",
    diff: 2, // intended difficulty, see DESIGN.md
    cap: 4,
    nodes: [
      { id: "src", t: "src", x: 1.5, y: 0 },
      { id: "sp", t: "sp", x: 1.5, y: 1.3 },
      { id: "s0", t: "sw", x: 0, y: 2.5, s: 1 },
      { id: "s1", t: "sw", x: 1, y: 2.5, s: 1 },
      { id: "s2", t: "sw", x: 2, y: 2.5, s: 1 },
      { id: "s3", t: "sw", x: 3, y: 2.5, s: 0 },
      { id: "lamp", t: "ap", k: "lamp", x: 0, y: 4.1, load: 1, req: true },
      { id: "tv", t: "ap", k: "tv", x: 1, y: 4.1, load: 2 },
      { id: "fan", t: "ap", k: "fan", x: 2, y: 4.1, load: 1 },
      { id: "heater", t: "ap", k: "heater", x: 3, y: 4.1, load: 3, req: true },
    ],
    edges: [["src", "sp"], ["sp", "s0"], ["sp", "s1"], ["sp", "s2"], ["sp", "s3"],
      ["s0", "lamp"], ["s1", "tv"], ["s2", "fan"], ["s3", "heater"]],
  },
  { // 3 — routing: a router always feeds exactly one output
    name: "Crossroads", hint: "A router sends power down one path",
    diff: 2, // intended difficulty, see DESIGN.md
    cap: 4,
    nodes: [
      { id: "src", t: "src", x: 1.5, y: 0 },
      { id: "sp", t: "sp", x: 1.5, y: 1.3 },
      { id: "ra", t: "rt", x: 0.5, y: 2.5, s: 0 },
      { id: "rb", t: "rt", x: 2.5, y: 2.5, s: 0 },
      { id: "lamp", t: "ap", k: "lamp", x: 0, y: 4.1, load: 1 },
      { id: "heater", t: "ap", k: "heater", x: 1, y: 4.1, load: 3, req: true },
      { id: "tv", t: "ap", k: "tv", x: 2, y: 4.1, load: 2 },
      { id: "fan", t: "ap", k: "fan", x: 3, y: 4.1, load: 1, req: true },
    ],
    edges: [["src", "sp"], ["sp", "ra"], ["sp", "rb"], ["ra", "lamp"], ["ra", "heater"], ["rb", "tv"], ["rb", "fan"]],
  },
  { // 4 — required vs optional: the star costs capacity you may need
    name: "Worth it?", hint: "The star is optional. Power is not.",
    diff: 2, // intended difficulty, see DESIGN.md
    cap: 6,
    nodes: [
      {id: "src", t: "src", x: 2, y: 0},
      {id: "tr", t: "sw", s: 0, x: 2, y: 1.1},
      {id: "sp", t: "sp", x: 2, y: 2.1},
      {id: "b0", t: "rt", s: 1, x: 0.5, y: 3.3},
      {id: "b1", t: "rt", s: 1, x: 3.5, y: 3.3},
      {id: "b2", t: "rt", s: 1, x: 1.5, y: 3.3},
      {id: "a0", t: "ap", k: "fridge", x: 3, load: 2, req: true, y: 5},
      {id: "a1", t: "ap", k: "lamp", x: 0, load: 1, req: true, y: 5},
      {id: "a2", t: "ap", k: "tv", x: 1, load: 2, bonus: true, y: 5},
      {id: "a3", t: "ap", k: "heater", x: 2, load: 3, y: 5},
      {id: "a4", t: "ap", k: "kettle", x: 4, load: 3, y: 5},
    ],
    edges: [["sp", "b0"], ["sp", "b1"], ["sp", "b2"], ["b0", "a1"], ["b0", "a2"], ["b1", "a0"], ["b1", "a4"], ["b2", "a3"], ["b2", "a2"], ["src", "tr"], ["tr", "sp"]],
  },
  { // 5 — BRIDGE: pips vs battery. Everything is armed (switches closed) but the main is open: switching it on
    // asks for more than the battery holds. Teaches that pips add up against the cells.
    name: "Main switch", hint: "Everything is ready to go",
    diff: 1, // intended difficulty, see DESIGN.md
    cap: 3,
    nodes: [
      { id: "src", t: "src", x: 1.5, y: 0 },
      { id: "m", t: "sw", x: 1.5, y: 1.2, s: 0 },
      { id: "sp", t: "sp", x: 1.5, y: 2.3 },
      { id: "st", t: "sw", x: 0, y: 3.2, s: 1 },
      { id: "sl", t: "sw", x: 1, y: 3.2, s: 1 },
      { id: "sr", t: "sw", x: 2, y: 3.2, s: 1 },
      { id: "sf", t: "sw", x: 3, y: 3.2, s: 1 },
      { id: "tv", t: "ap", k: "tv", x: 0, y: 4.6, load: 2 },
      { id: "lamp", t: "ap", k: "lamp", x: 1, y: 4.6, load: 1, req: true },
      { id: "radio", t: "ap", k: "radio", x: 2, y: 4.6, load: 1, req: true },
      { id: "fan", t: "ap", k: "fan", x: 3, y: 4.6, load: 1 },
    ],
    edges: [["src", "m"], ["m", "sp"], ["sp", "st"], ["sp", "sl"], ["sp", "sr"], ["sp", "sf"], ["st", "tv"], ["sl", "lamp"], ["sr", "radio"], ["sf", "fan"]],
  },
  { // 6 — BRIDGE: free capacity first. The board is live and the battery is already full of something you do not
    // need; the required appliances cannot be added until the player switches it off.
    name: "Already full", hint: "The battery is full before you start",
    diff: 2, // intended difficulty, see DESIGN.md
    cap: 3,
    nodes: [
      { id: "src", t: "src", x: 1, y: 0 },
      { id: "sp", t: "sp", x: 1, y: 1.3 },
      { id: "st", t: "sw", x: 0, y: 2.4, s: 0 },
      { id: "sh", t: "sw", x: 1, y: 2.4, s: 1 },
      { id: "sl", t: "sw", x: 2, y: 2.4, s: 0 },
      { id: "tv", t: "ap", k: "tv", x: 0, y: 3.9, load: 2, req: true },
      { id: "heater", t: "ap", k: "heater", x: 1, y: 3.9, load: 3 },
      { id: "lamp", t: "ap", k: "lamp", x: 2, y: 3.9, load: 1, req: true },
    ],
    edges: [["src", "sp"], ["sp", "st"], ["sp", "sh"], ["sp", "sl"], ["st", "tv"], ["sh", "heater"], ["sl", "lamp"]],
  },
  { // 7 — the hard one: trunk + routers + shared appliances
    name: "Overload", hint: "Everything at once",
    diff: 3, // intended difficulty, see DESIGN.md
    cap: 5,
    nodes: [
      {id: "src", t: "src", x: 2.5, y: 0},
      {id: "tr", t: "sw", s: 1, x: 2.5, y: 1.1},
      {id: "sp", t: "sp", x: 2.5, y: 2.1},
      {id: "b0", t: "rt", s: 2, x: 2, y: 3.3},
      {id: "b1", t: "rt", s: 0, x: 4, y: 3.3},
      {id: "b2", t: "rt", s: 0, x: 0.5, y: 3.3},
      {id: "a0", t: "ap", k: "heater", load: 3, x: 4, y: 5},
      {id: "a1", t: "ap", k: "tv", load: 2, req: true, x: 5, y: 5},
      {id: "a2", t: "ap", k: "lamp", load: 1, req: true, x: 0, y: 5},
      {id: "a3", t: "ap", k: "kettle", load: 3, x: 1, y: 5},
      {id: "a4", t: "ap", k: "fan", load: 1, x: 3, y: 5},
      {id: "a5", t: "ap", k: "fridge", load: 2, req: true, x: 2, y: 5},
    ],
    edges: [["sp", "b0"], ["sp", "b1"], ["sp", "b2"], ["b0", "a5"], ["b0", "a4"], ["b0", "a3"], ["b1", "a4"], ["b1", "a0"], ["b1", "a1"], ["b2", "a2"], ["b2", "a3"], ["src", "tr"], ["tr", "sp"]],
  },
  { // 8 — EXPERIMENT: charge appliances (done stays done)
    name: "Charge up", hint: "Some devices only need power for a while",
    diff: 3, // intended difficulty, see DESIGN.md
    cap: 4,
    nodes: [
      {id: "src", t: "src", x: 1.5, y: 0},
      {id: "sp", t: "sp", x: 1.5, y: 1.3},
      {id: "b0", t: "rt", x: 0.5, s: 1, y: 2.7},
      {id: "b1", t: "sw", x: 2, s: 1, y: 2.7},
      {id: "b2", t: "sw", x: 3, s: 0, y: 2.7},
      {id: "a0", t: "ap", k: "kettle", x: 0, load: 3, req: true, task: 2, y: 4.3},
      {id: "a1", t: "ap", k: "fan", x: 1, load: 1, req: true, task: 2, y: 4.3},
      {id: "a2", t: "ap", k: "heater", x: 2, load: 3, req: true, y: 4.3},
      {id: "a3", t: "ap", k: "fridge", x: 3, load: 2, y: 4.3},
    ],
    edges: [["sp", "b0"], ["b0", "a0"], ["b0", "a1"], ["sp", "b1"], ["b1", "a2"], ["sp", "b2"], ["b2", "a3"], ["src", "sp"]],
  },
  { // 9 — EXPERIMENT: sequencing with a forced start
    name: "Last in line", hint: "Finish a job, switch it off, reuse the power",
    diff: 4, // intended difficulty, see DESIGN.md
    cap: 5,
    nodes: [
      {id: "src", t: "src", x: 2.5, y: 0},
      {id: "tr", t: "sw", s: 1, x: 2.5, y: 1.1},
      {id: "sp", t: "sp", x: 2.5, y: 2.1},
      {id: "b0", t: "rt", x: 0.5, s: 0, y: 3.4},
      {id: "b1", t: "rt", x: 2.5, s: 1, y: 3.4},
      {id: "b2", t: "sw", x: 4, s: 0, y: 3.4},
      {id: "b3", t: "sw", x: 5, s: 0, y: 3.4},
      {id: "a0", t: "ap", k: "tv", x: 0, load: 2, req: true, task: 2, y: 5},
      {id: "a1", t: "ap", k: "kettle", x: 1, load: 3, req: true, y: 5},
      {id: "a2", t: "ap", k: "fridge", x: 2, load: 2, y: 5},
      {id: "a3", t: "ap", k: "heater", x: 3, load: 3, y: 5},
      {id: "a4", t: "ap", k: "radio", x: 4, load: 1, req: true, task: 2, y: 5},
      {id: "a5", t: "ap", k: "lamp", x: 5, load: 1, req: true, task: 2, y: 5},
    ],
    edges: [["sp", "b0"], ["b0", "a0"], ["b0", "a1"], ["sp", "b1"], ["b1", "a2"], ["b1", "a3"], ["sp", "b2"], ["b2", "a4"], ["sp", "b3"], ["b3", "a5"], ["src", "tr"], ["tr", "sp"]],
  },
  { // 10 — EXPERIMENT: appliances are part of the wire (pass-through)
    name: "On the line", hint: "An appliance that is off passes nothing on",
    diff: 1, // intended difficulty, see DESIGN.md
    cap: 4,
    nodes: [
      { id: "src", t: "src", x: 1, y: 0 },
      { id: "sp", t: "sp", x: 1, y: 1.3 },
      { id: "tv", t: "ap", k: "tv", x: 0, y: 3.9, load: 2, pass: true, s: 1 },
      { id: "sr", t: "sw", x: 1, y: 2.4, s: 1 },
      { id: "sf", t: "sw", x: 2, y: 2.4, s: 0 },
      { id: "radio", t: "ap", k: "radio", x: 1, y: 3.9, load: 1 },
      { id: "fan", t: "ap", k: "fan", x: 2, y: 3.9, load: 1, req: true },
      { id: "lamp", t: "ap", k: "lamp", x: 0, y: 5.4, load: 1, req: true },
    ],
    edges: [["src", "sp"], ["sp", "tv"], ["sp", "sr"], ["sp", "sf"], ["sr", "radio"], ["sf", "fan"], ["tv", "lamp"]],
  },
  { // 11 — pass-through + capacity: keep the root, cut the branch
    name: "Root or branch", hint: "Cheap is not always safe to switch off",
    diff: 3, // intended difficulty, see DESIGN.md
    cap: 6,
    nodes: [
      {id: "src", t: "src", x: 1.31, y: 0},
      {id: "sp", t: "sp", x: 1.31, y: 1.1},
      {id: "b0", t: "sw", s: 0, x: 2.1, y: 2.2},
      {id: "a0", t: "ap", k: "radio", load: 1, pass: true, s: 1, x: 0.53, y: 2.2},
      {id: "a1", t: "ap", k: "heater", load: 3, pass: true, s: 1, x: 0, y: 4.35},
      {id: "a2", t: "ap", k: "lamp", load: 1, x: 0, y: 6.5},
      {id: "a3", t: "ap", k: "radio", load: 1, pass: true, s: 0, x: 1.05, y: 4.35},
      {id: "a4", t: "ap", k: "fan", load: 1, req: true, x: 1.05, y: 6.5},
      {id: "a5", t: "ap", k: "tv", load: 2, pass: true, s: 0, x: 2.1, y: 3.45},
      {id: "a6", t: "ap", k: "lamp", load: 1, req: true, x: 2.1, y: 5.6},
    ],
    edges: [["src", "sp"], ["sp", "a0"], ["a0", "a1"], ["a1", "a2"], ["a0", "a3"], ["a3", "a4"], ["sp", "b0"], ["b0", "a5"], ["a5", "a6"]],
  },
  { // 12 — charge + pass-through + capacity: a finished job still holding the line
    name: "Done, not free", hint: "A finished job can still be holding the line",
    diff: 4, // intended difficulty, see DESIGN.md
    cap: 5,
    nodes: [
      {id: "src", t: "src", x: 1.05, y: 0},
      {id: "sp", t: "sp", x: 1.05, y: 1.1},
      {id: "b1", t: "sw", s: 0, x: 0, y: 2.2},
      {id: "b2", t: "sw", s: 0, x: 1.05, y: 2.2},
      {id: "b4", t: "sw", s: 1, x: 2.1, y: 2.2},
      {id: "a0", t: "ap", k: "kettle", load: 3, pass: true, s: 1, task: 2, req: true, x: 0, y: 3.45},
      {id: "a1", t: "ap", k: "lamp", load: 1, pass: true, s: 0, task: 2, req: true, x: 0, y: 5.6},
      {id: "a2", t: "ap", k: "radio", load: 1, req: true, x: 0, y: 7.75},
      {id: "a3", t: "ap", k: "tv", load: 2, task: 2, req: true, x: 1.05, y: 3.45},
      {id: "a4", t: "ap", k: "heater", load: 3, x: 2.1, y: 3.45},
    ],
    edges: [["src", "sp"], ["sp", "b1"], ["b1", "a0"], ["a0", "a1"], ["a1", "a2"], ["sp", "b2"], ["b2", "a3"], ["sp", "b4"], ["b4", "a4"]],
  },
];
if (typeof module !== "undefined" && module.exports) module.exports = { LEVELS };
