// ============================================================================
// POWER — "Light Up the Neighborhood" screen (placeholder visuals, replaceable)
//
// A DOM + SVG overlay on top of the game canvas. Three presentations of the same
// scene:
//   sheet   after an ordinary level: a compact panel showing the current location
//           gaining a lit window, how many puzzles are left, and Continue
//   payoff  after a milestone's last level: the full neighborhood, the location
//           lights up window by window, then the next location is highlighted
//   map     the whole neighborhood (launch for returning players, or the house
//           button in the HUD): objective, tappable locations, replayable levels
//
// Everything is placeholder geometry. To use final artwork, fill in ART below:
//   ART.home = { dark: "assets/home-dark.png", lit: "assets/home-lit.png", w: 110, h: 90 }
// and the location draws the two images (cross-faded by progress) instead of shapes.
// All rules live in progress.js; this file only draws them.
// ============================================================================
const Neighborhood = (function () {
  const API = { play: null, sfx: null };          // set by the game via init()
  const ART = {};                                  // art slots: see header comment

  // viewBox 0 0 360 640. (x, y) is the bottom-centre of each building.
  const LOC = {
    home: { x: 92, y: 520 }, flat: { x: 262, y: 410 }, compound: { x: 98, y: 300 }, shop: { x: 258, y: 196 }, street: { x: 178, y: 92 },
  };
  const START = { x: 180, y: 630 };
  const WARM = "#ffd36b", CREAM = "#fff3c8", AMBER = "#ffb02e";

  // Placeholder buildings: shapes in a local frame, bottom-centre at (0,0). `wins` light up one by one.
  const KIND = {
    home: {
      shapes: '<rect class="bd" x="-34" y="-46" width="68" height="46" rx="3"/><rect class="bd2" x="-38" y="-52" width="76" height="7" rx="2"/><rect class="bd2" x="14" y="-68" width="15" height="16" rx="2"/><rect class="door" x="-6" y="-22" width="12" height="22" rx="2"/>',
      wins: [[-28, -38, 14, 12], [14, -38, 14, 12], [-6, -43, 12, 10]], label: 12,
    },
    flat: {
      shapes: '<rect class="bd" x="-27" y="-86" width="54" height="86" rx="3"/><rect class="bd2" x="-31" y="-92" width="62" height="7" rx="2"/><rect class="door" x="-6" y="-14" width="12" height="14" rx="2"/>',
      wins: [[-21, -78, 16, 14], [5, -78, 16, 14], [-21, -57, 16, 14], [5, -57, 16, 14], [-21, -36, 16, 14], [5, -36, 16, 14]], label: 12,
    },
    compound: {
      shapes: '<rect class="bd" x="-42" y="-56" width="38" height="34" rx="2"/><rect class="bd" x="4" y="-64" width="38" height="42" rx="2"/><rect class="bd2" x="-52" y="-22" width="104" height="22" rx="2"/><rect class="door" x="-11" y="-22" width="22" height="22" rx="2"/>',
      wins: [[-36, -50, 11, 11], [-21, -50, 11, 11], [10, -58, 11, 11], [26, -58, 11, 11]], label: 12,
    },
    shop: {
      shapes: '<rect class="bd" x="-40" y="-46" width="80" height="46" rx="3"/><rect class="bd2" x="-26" y="-68" width="52" height="11" rx="2"/><path class="awn" d="M-44 -56 H44 L40 -46 H-40 Z"/><rect class="door" x="14" y="-34" width="18" height="34" rx="2"/>',
      wins: [[-34, -37, 22, 21], [-8, -37, 18, 21], [16, -33, 14, 30]], label: 12,
    },
    street: {
      shapes: '<rect class="bd2" x="-64" y="-5" width="128" height="5" rx="2"/>' + [-48, -16, 16, 48].map((x) => `<rect class="bd" x="${x - 1.5}" y="-62" width="3" height="62"/>`).join(""),
      wins: [[-57, -70, 18, 7], [-25, -70, 18, 7], [7, -70, 18, 7], [39, -70, 18, 7]], label: 12, lamps: true,
    },
  };

  // ---- scene ---------------------------------------------------------------------------------
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const litCount = (frac, n) => (frac <= 0 ? 0 : Math.max(1, Math.round(frac * n)));

  function building(i, st, opt) {
    const m = Progress.MILESTONES[i], loc = LOC[m.id], k = KIND[m.id];
    const n = k.wins.length, now = litCount(st.frac, n), from = opt.anim && opt.anim.milestone === i ? litCount(st.fracBefore, n) : now;
    const bursting = opt.anim && opt.anim.milestone === i && opt.anim.type === "payoff";
    let g = `<g class="loc ${st.status}${bursting ? " burst" : ""}" data-i="${i}" transform="translate(${loc.x} ${loc.y})">`;
    g += `<circle class="glow" cx="0" cy="-38" r="${st.status === "done" ? 78 : 56}" style="opacity:${st.status === "done" ? 0.9 : (now / n) * 0.55}"/>`;
    if (bursting) g += `<circle class="bloom" cx="0" cy="-38" r="90" style="animation-delay:${(now - from) * 0.2 + 0.2}s"/>`;
    const art = ART[m.id];
    if (art) { // art slot: dark + lit images, cross-faded
      g += `<image href="${art.dark}" x="${-art.w / 2}" y="${-art.h}" width="${art.w}" height="${art.h}"/><image class="artlit" href="${art.lit}" x="${-art.w / 2}" y="${-art.h}" width="${art.w}" height="${art.h}" style="opacity:${st.frac}"/>`;
    } else {
      g += `<g class="shell ${st.status === "done" ? "restored" : ""}">${k.shapes}</g>`;
      k.wins.forEach((w, j) => {
        const pop = j >= from && j < now, on = j < now;
        const delay = pop ? `style="animation-delay:${(j - from) * 0.2 + 0.2}s"` : "";
        if (on) g += `<circle class="halo ${pop ? "pop" : "on"}" cx="${w[0] + w[2] / 2}" cy="${w[1] + w[3] / 2}" r="${Math.max(w[2], w[3]) * 0.95}" ${delay}/>`;
        if (k.lamps && on) g += `<path class="cone ${pop ? "pop" : "on"}" d="M${w[0] + 3} ${w[1] + w[3]} L${w[0] - 7} -3 L${w[0] + w[2] + 7} -3 L${w[0] + w[2] - 3} ${w[1] + w[3]} Z" ${delay}/>`;
        g += `<rect class="w ${pop ? "pop" : on ? "on" : ""}" x="${w[0]}" y="${w[1]}" width="${w[2]}" height="${w[3]}" rx="2" ${delay}/>`;
      });
    }
    // foot mat in front of the building: glows (and breathes) on the current location, warm on restored ones, dark on locked ones
    g += `<g class="mat ${st.status}"><ellipse class="matglow" cx="0" cy="10" rx="62" ry="24"/><path class="matbody" d="M-31 4 A31 14 0 0 0 31 4 Z"/><path class="matin" d="M-22 5.5 A22 9 0 0 0 22 5.5"/></g>`;
    if (opt.anim && opt.anim.milestone === i && opt.anim.type === "payoff") {
      for (let s = 0; s < 8; s++) { const a = (s / 8) * Math.PI * 2; g += `<circle class="spark" cx="0" cy="-40" r="2.6" style="--dx:${Math.cos(a) * 62}px;--dy:${Math.sin(a) * 52 - 8}px;animation-delay:${(now - from) * 0.2 + 0.3 + s * 0.04}s"/>`; }
    }
    g += `<text class="lab ${st.status}" x="0" y="${k.label + 18}" text-anchor="middle">${esc(m.name)}</text>`;
    if (st.status === "current") g += `<g transform="translate(0 -104)"><rect class="chip" x="-27" y="-10" width="54" height="16" rx="8"/><text class="chipt" x="0" y="2" text-anchor="middle">NOW</text></g>`;
    if (st.status === "done") g += `<text class="tick" x="${n > 5 ? 34 : 40}" y="-72" text-anchor="middle">✓</text>`;
    return g + "</g>";
  }

  // The trail between locations is a line of alternating footprints. Restored legs are lit; the leg to the
  // next location lights up one step after another, as if someone were walking toward it; later legs are dark.
  const MAT = (loc) => ({ x: loc.x, y: loc.y + 11 });          // where a trail ends: the mat in front of a building
  function leg(prev, to) { // cubic with vertical tangents (an S-curve), sampled evenly by length
    const my = (prev.y + to.y) / 2, pts = [], N = 160;
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t;
      pts.push({ x: u * u * u * prev.x + 3 * u * u * t * prev.x + 3 * u * t * t * to.x + t * t * t * to.x, y: u * u * u * prev.y + 3 * u * u * t * my + 3 * u * t * t * my + t * t * t * to.y });
    }
    return pts;
  }
  function steps(prev, to, status, fromId, toLoc) {
    const pts = leg(prev, to); let len = 0; const cum = [0];
    for (let i = 1; i < pts.length; i++) { len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); cum.push(len); }
    const gap = 21, out = [];
    for (let d = 14, k = 0; d < len - 8; d += gap, k++) {
      let j = cum.findIndex((c) => c >= d); if (j < 1) j = 1;
      const p = pts[j], q = pts[j - 1], dx = p.x - q.x, dy = p.y - q.y, l = Math.hypot(dx, dy) || 1, side = k % 2 ? 1 : -1;
      const x = p.x + (-dy / l) * 5.6 * side, y = p.y + (dx / l) * 5.6 * side;
      // leave the lettering readable: no steps under the destination's name
      if (Math.abs(x - toLoc.x) < 50 && y > toLoc.y + 17 && y < toLoc.y + 38) continue;
      out.push({ x, y, ang: (Math.atan2(dy, dx) * 180) / Math.PI + 90 });
    }
    const cycle = out.length * 0.3 + 2.6;
    return out.map((f, i) => `<g class="fp ${status === "done" ? "on" : status === "current" ? "walk" : ""}" transform="translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) rotate(${f.ang.toFixed(0)})" style="animation-delay:${(i * 0.3).toFixed(2)}s;--cycle:${cycle.toFixed(1)}s"><ellipse cx="0" cy="-4.6" rx="3.7" ry="5.2"/><ellipse cx="0" cy="4.4" rx="2.9" ry="3.2"/><circle cx="-3.6" cy="-10.6" r="1.15"/><circle cx="-1.2" cy="-11.4" r="1.15"/><circle cx="1.3" cy="-11.4" r="1.15"/><circle cx="3.7" cy="-10.6" r="1.15"/></g>`).join("");
  }
  function pathSVG(states) {
    let prev = START, out = "";
    Progress.MILESTONES.forEach((m, i) => {
      const to = MAT(LOC[m.id]);
      const d = `M${prev.x} ${prev.y} C${prev.x} ${(prev.y + to.y) / 2} ${to.x} ${(prev.y + to.y) / 2} ${to.x} ${to.y}`;
      out += `<path class="road" d="${d}"/>` + steps(prev, to, states[i].status, i, LOC[m.id]);
      prev = to;
    });
    return out;
  }

  function stateFor(i, anim) {
    const c = Progress.counts(i), before = anim && anim.milestone === i && !anim.replay ? c.done - 1 : c.done;
    return { status: Progress.status(i), frac: c.done / c.total, fracBefore: before / c.total };
  }

  // Ambience (hills, trees, distant houses, street lamps): placeholder shapes, drawn behind the locations.
  const TREES = [[18, 330, 20], [44, 346, 15], [338, 330, 22], [318, 352, 14], [24, 470, 22], [52, 492, 16], [340, 600, 22], [20, 604, 24], [332, 250, 18], [28, 176, 18], [302, 142, 16], [340, 450, 18]];
  const FAR_HOUSES = [[8, 384, 34, 26, [0]], [318, 514, 34, 24, [1]], [6, 238, 30, 22, [0, 1]], [322, 360, 30, 22, [0]]];
  function decor(states) {
    let d = '<path d="M-60 250 Q 110 205 230 245 T 440 215 V 720 H-60 Z" fill="#0f1a38"/><path d="M-60 470 Q 80 420 190 455 T 440 430 V 720 H-60 Z" fill="#0c1530"/><path d="M-60 565 Q 100 508 210 548 T 440 520 V 720 H-60 Z" fill="#0a1228"/>';
    TREES.forEach((t) => { d += `<circle cx="${t[0]}" cy="${t[1]}" r="${t[2]}" fill="#091025"/><circle cx="${t[0] + t[2] * 0.5}" cy="${t[1] - t[2] * 0.4}" r="${t[2] * 0.7}" fill="#091025"/>`; });
    FAR_HOUSES.forEach((h) => {
      d += `<rect x="${h[0]}" y="${h[1]}" width="${h[2]}" height="${h[3]}" rx="2" fill="#0e1830" stroke="#1a2542"/>`;
      h[4].forEach((k) => { d += `<rect x="${h[0] + 5 + k * 13}" y="${h[1] + 6}" width="8" height="8" rx="1" fill="#c99a40" opacity="0.7"/>`; });
    });
    // street lamps beside each location: lit once the location is lit or being restored
    Progress.MILESTONES.forEach((m, i) => {
      const loc = LOC[m.id], lit = states[i].status !== "locked", x = loc.x + (loc.x < 180 ? 52 : -52), y = loc.y - 2;
      d += `<rect x="${x - 1}" y="${y - 24}" width="2" height="24" fill="#1c2748"/>`;
      if (lit) d += `<circle cx="${x}" cy="${y - 26}" r="16" fill="url(#nbhalo)" opacity="0.8"/>`;
      d += `<circle cx="${x}" cy="${y - 26}" r="3.4" fill="${lit ? WARM : "#26324f"}"/>`;
    });
    return d;
  }
  function tagSVG(t, delay) { // small callout bubble; x,y = top-left, clamped inside the scene
    const w = Math.round(t.text.length * 5.7 + 18), x = Math.max(6, Math.min(354 - w, t.x)), y = t.y;
    return `<g class="tag" style="animation-delay:${delay}s"><rect x="${x}" y="${y}" width="${w}" height="22" rx="8"/><text x="${x + w / 2}" y="${y + 15}" text-anchor="middle">${esc(t.text)}</text></g>`;
  }

  // opt: { anim, tags: [{x,y,text}], only: milestone index, view: [x,y,w,h] }
  function scene(opt) {
    const states = Progress.MILESTONES.map((_, i) => stateFor(i, opt.anim));
    const v = opt.view || [-20, 0, 400, 640];
    let stars = "";
    for (let s = 0; s < 34; s++) stars += `<circle class="star" cx="${(s * 97 + 31) % 360}" cy="${(s * 53 + 11) % 560}" r="${s % 5 === 0 ? 1.4 : 0.9}" style="animation-delay:${(s % 7) * 0.4}s"/>`;
    let svg = `<svg class="nb-svg" viewBox="${v.join(" ")}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">`;
    svg += '<defs><radialGradient id="nbhalo"><stop offset="0" stop-color="#ffe9a8" stop-opacity="0.95"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient>';
    svg += '<radialGradient id="nbglow"><stop offset="0" stop-color="#ffd36b" stop-opacity="0.55"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient>';
    svg += '<linearGradient id="nbsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1430"/><stop offset="1" stop-color="#070a13"/></linearGradient></defs>';
    if (opt.only === undefined) {
      svg += stars;
      svg += '<circle cx="318" cy="38" r="12" fill="#dfe7fb" opacity="0.55"/><circle cx="324" cy="35" r="11" fill="#0b1430"/>';
      svg += decor(states) + pathSVG(states);
      for (let i = Progress.MILESTONES.length - 1; i >= 0; i--) svg += building(i, states[i], opt);
      (opt.tags || []).forEach((t, k) => { svg += tagSVG(t, 1.4 + k * 0.35); });
    } else {
      svg += `<path d="M-200 ${LOC[Progress.MILESTONES[opt.only].id].y + 6} H560" stroke="#1a2340" stroke-width="2"/>` + building(opt.only, states[opt.only], opt);
    }
    return svg + "</svg>";
  }

  // ---- DOM -------------------------------------------------------------------------------------------------
  const CSS = `
  .nb{position:fixed;inset:0;z-index:30;display:flex;flex-direction:column;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#eef2fa;touch-action:manipulation;user-select:none;-webkit-user-select:none}
  .nb.hidden{display:none}
  .nb[data-mode="map"],.nb[data-mode="payoff"]{background:linear-gradient(to bottom,#0b1430 0%,#070a13 75%)}
  .nb-head{padding:calc(14px + env(safe-area-inset-top)) 56px 4px;text-align:center}
  .nb-kicker{font-size:11px;letter-spacing:.2em;color:#7d879e;font-weight:700}
  .nb-title{font-size:23px;font-weight:800;margin-top:6px;line-height:1.15}
  .nb-sub{font-size:14px;color:#aab4cc;margin-top:4px;min-height:18px}
  .nb-sub b{color:#ffd36b}
  .nb-pips{display:flex;gap:9px;justify-content:center;margin-top:9px;min-height:14px}
  .nb-pip{width:13px;height:13px;border-radius:50%;border:2px solid #4b5675;background:transparent}
  .nb-pip.on{background:#ffd36b;border-color:#ffd36b;box-shadow:0 0 10px rgba(255,211,107,.7)}
  .nb-pip.new{animation:nbPip .7s .25s both}
  @keyframes nbPip{0%{transform:scale(.4);background:transparent}60%{transform:scale(1.6);background:#fff3c8}100%{transform:scale(1);background:#ffd36b}}
  .nb-scene{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 4%,#000 93%,transparent 100%);mask-image:linear-gradient(to bottom,transparent 0,#000 4%,#000 93%,transparent 100%)}
  .nb-svg{flex:none;width:150%;height:100%;display:block}
  .nb-scene{overflow:hidden}
  .nb-chips{display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap;padding:6px 20px 0;min-height:52px}
  .nb-chip{min-width:46px;height:46px;border-radius:14px;border:2px solid #2a3558;background:#0e1424;color:#eef2fa;font-size:17px;font-weight:700;padding:0 8px}
  .nb-chip.done{border-color:#ffd36b;color:#ffd36b}
  .nb-chip.next{border-color:#ffb02e;background:#2a2110;animation:nbPulse 1.6s infinite}
  .nb-chip[disabled]{opacity:.35}
  .nb-hint{font-size:12px;color:#7d879e;text-align:center;min-height:16px;padding:4px 20px 0}
  .nb-actions{padding:10px 20px calc(18px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:6px;align-items:center}
  .nb-continue{width:100%;max-width:420px;height:58px;border:0;border-radius:18px;background:linear-gradient(#ffc24d,#ffa51f);color:#1b1304;font-size:19px;font-weight:800;box-shadow:0 0 24px rgba(255,176,46,.35);animation:nbPulse 1.8s infinite}
  .nb-continue:active{transform:scale(.98)}
  .nb-continue[disabled]{opacity:0;pointer-events:none;animation:none}
  .nb-continue.ready{opacity:1;transition:opacity .5s}
  .nb-close{position:absolute;top:calc(10px + env(safe-area-inset-top));right:14px;width:42px;height:42px;border-radius:50%;border:2px solid #2a3558;background:#0e1424;color:#eef2fa;font-size:22px;line-height:1;z-index:2}
  @keyframes nbPulse{0%,100%{box-shadow:0 0 14px rgba(255,176,46,.25)}50%{box-shadow:0 0 30px rgba(255,176,46,.6)}}
  .nb .star{fill:#cfd8f5;opacity:.45;animation:nbTwinkle 3s infinite}
  @keyframes nbTwinkle{0%,100%{opacity:.2}50%{opacity:.7}}
  .nb .road{fill:none;stroke:#141c36;stroke-width:14;stroke-linecap:round;opacity:.8}
  .nb .fp ellipse,.nb .fp circle{fill:#26324f;opacity:.75}
  .nb .fp.on ellipse,.nb .fp.on circle{fill:#ffd36b;opacity:.95}
  .nb .fp.walk ellipse,.nb .fp.walk circle{fill:#26324f;opacity:.2;animation:nbStep var(--cycle,5s) infinite;animation-delay:inherit}
  @keyframes nbStep{0%{opacity:.2;fill:#26324f}3%{opacity:1;fill:#fff3c8}13%{opacity:1;fill:#ffd36b}34%{opacity:.45;fill:#c99a40}100%{opacity:.2;fill:#26324f}}
  .nb .mat .matglow{fill:url(#nbglow);opacity:0}
  .nb .mat .matbody{fill:#101a30;stroke:#26324f;stroke-width:1.5;stroke-linejoin:round}
  .nb .mat .matin{fill:none;stroke:#1c2748;stroke-width:1}
  .nb .mat.done .matglow{opacity:.75}
  .nb .mat.done .matbody{fill:#4a3512;stroke:#e0b04a}
  .nb .mat.done .matin{stroke:#8a6a2c}
  .nb .mat.current .matglow{opacity:1;animation:nbMat 1.8s ease-in-out infinite}
  .nb .mat.current .matbody{fill:#7a5414;stroke:#ffd36b;stroke-width:2;animation:nbMatEdge 1.8s ease-in-out infinite}
  .nb .mat.current .matin{stroke:#ffe9a8;stroke-width:1.5}
  @keyframes nbMat{0%,100%{opacity:.7}50%{opacity:1}}
  @keyframes nbMatEdge{0%,100%{stroke:#c99a40}50%{stroke:#fff3c8}}
  .nb .bd{fill:#101a30;stroke:#26324f;stroke-width:1.5}
  .nb .bd2{fill:#17213d;stroke:#2c3a5e;stroke-width:1.5}
  .nb .awn{fill:#3a2a44;stroke:#4a3a58;stroke-width:1.5}
  .nb .door{fill:#0a1020;stroke:#26324f;stroke-width:1}
  .nb .shell.restored .bd{fill:#1d2038;stroke:#46406a}
  .nb .shell.restored .bd2{fill:#262846;stroke:#524a78}
  .nb .w{fill:#1b2745;stroke:#2a3558;stroke-width:1}
  .nb .w.on{fill:#ffd36b;stroke:#fff3c8}
  .nb .w.pop{animation:nbWin .7s both}
  @keyframes nbWin{0%{fill:#1b2745;stroke:#2a3558}55%{fill:#fff3c8;stroke:#fff}100%{fill:#ffd36b;stroke:#fff3c8}}
  .nb .halo{fill:url(#nbhalo);opacity:0}
  .nb .halo.on{opacity:.9}
  .nb .halo.pop{animation:nbHalo .9s both}
  @keyframes nbHalo{0%{opacity:0;transform:scale(.4)}60%{opacity:1}100%{opacity:.9}}
  .nb .halo{transform-box:fill-box;transform-origin:center}
  .nb .cone{fill:rgba(255,211,107,.18);opacity:0}
  .nb .cone.on{opacity:1}
  .nb .cone.pop{animation:nbHalo .9s both}
  .nb .glow{fill:url(#nbglow);pointer-events:none}
  .nb .bloom{fill:url(#nbglow);opacity:0;animation:nbBloom 1.6s both;transform-box:fill-box;transform-origin:center}
  @keyframes nbBloom{0%{opacity:0;transform:scale(.3)}40%{opacity:1}100%{opacity:.6;transform:scale(1.25)}}
  .nb .spark{fill:#fff3c8;opacity:0;animation:nbSpark 1.3s ease-out both}
  @keyframes nbSpark{0%{opacity:0;transform:translate(0,0)}25%{opacity:1}100%{opacity:0;transform:translate(var(--dx),var(--dy))}}
  .nb .lab{fill:#7d879e;font-size:11px;font-weight:700}
  .nb .lab.done{fill:#ffd36b}
  .nb .lab.current{fill:#fff;font-size:12px}
  .nb .lab.locked{fill:#4b5675}
  .nb .chip{fill:#ffb02e}
  .nb .chipt{fill:#1b1304;font-size:10px;font-weight:800;letter-spacing:.08em}
  .nb .tick{fill:#ffd36b;font-size:15px;font-weight:800}
  .nb .tag rect{fill:#0e1424;stroke:#33426b;stroke-width:1.2;opacity:0;animation:nbTag .5s forwards;animation-delay:inherit}
  .nb .tag text{fill:#eef2fa;font-size:10.5px;font-weight:700;opacity:0;animation:nbTag .5s forwards;animation-delay:inherit}
  @keyframes nbTag{to{opacity:1}}
  .nb-card{margin:0 auto 4px;min-width:230px;max-width:330px;border:1.5px solid #33426b;background:rgba(14,20,36,.92);border-radius:16px;padding:9px 16px 10px;text-align:center}
  .nb-card:empty{display:none}
  .nb-card-name{font-size:15px;font-weight:800}
  .nb-card-sub{font-size:13px;color:#aab4cc;margin-top:1px}
  .nb-card-sub b{color:#ffd36b}
  .nb-card .nb-pips{margin-top:7px}
  .nb .loc.done,.nb .loc.current{cursor:pointer}
  .nb .loc.sel .lab{text-decoration:underline}
  `;

  let root = null, sel = 0, mode = "map", cb = {}, timer = null;

  function ensure() {
    if (root) return;
    const st = document.createElement("style"); st.id = "nb-style"; st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement("div"); root.className = "nb hidden"; root.id = "nb";
    root.innerHTML = '<button class="nb-close" aria-label="Close">×</button><div class="nb-head"><div class="nb-kicker">LIGHT UP THE NEIGHBORHOOD</div><div class="nb-title"></div><div class="nb-sub"></div><div class="nb-pips"></div></div><div class="nb-scene"></div><div class="nb-card"></div><div class="nb-chips"></div><div class="nb-hint"></div><div class="nb-actions"><button class="nb-continue">Continue</button></div>';
    document.body.appendChild(root);
    root.querySelector(".nb-close").addEventListener("click", () => hide());
    root.querySelector(".nb-continue").addEventListener("click", () => { if (cb.continue) cb.continue(); });
    root.querySelector(".nb-scene").addEventListener("click", (ev) => {
      const g = ev.target.closest && ev.target.closest(".loc"); if (!g || mode !== "map") return;
      const i = +g.dataset.i; if (Progress.status(i) !== "locked") { sel = i; renderMap(); }
    });
    window.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !root.classList.contains("hidden") && cb.closable) hide(); });
  }
  const $ = (sel2) => root.querySelector(sel2);
  function hide() { if (!root) return; clearTimeout(timer); root.classList.add("hidden"); }
  const isOpen = () => !!root && !root.classList.contains("hidden");
  const name = (i) => Progress.MILESTONES[i].name;
  const left = (i) => { const c = Progress.counts(i); return c.total - c.done; };
  const plural = (n) => `${n} puzzle${n === 1 ? "" : "s"}`;
  function pips(i, newIdx) {
    const c = Progress.counts(i); let h = "";
    for (let k = 0; k < c.total; k++) h += `<span class="nb-pip ${k < c.done ? "on" : ""} ${k === newIdx ? "new" : ""}"></span>`;
    $(".nb-pips").innerHTML = h;
  }
  function open(m) { ensure(); mode = m; root.dataset.mode = m; root.classList.remove("hidden"); }

  // ---- map ------------------------------------------------------------------------------------------------------------
  function renderMap() {
    const cur = Progress.currentMilestone(), all = cur < 0;
    $(".nb-title").textContent = all ? "The neighborhood is lit!" : `Restoring: ${name(cur)}`;
    $(".nb-sub").innerHTML = all ? "Every location is back on." : `<b>${plural(left(cur))}</b> left to light it`;
    pips(all ? Progress.MILESTONES.length - 1 : cur);
    $(".nb-scene").innerHTML = scene({});
    const g = $(`.loc[data-i="${sel}"]`); if (g) g.classList.add("sel");
    // replayable levels of the selected location
    const next = Progress.nextLevel(-1);
    $(".nb-chips").innerHTML = Progress.MILESTONES[sel].levels.map((lv) => {
      const done = Progress.isComplete(lv), playable = done || lv === next;
      return `<button class="nb-chip ${done ? "done" : lv === next ? "next" : ""}" data-lv="${lv}" ${playable ? "" : "disabled"}>${done ? "✓ " : ""}${lv + 1}</button>`;
    }).join("");
    $(".nb-hint").textContent = `${name(sel)} — tap a puzzle to play it`;
    $(".nb-chips").onclick = (ev) => { const b = ev.target.closest && ev.target.closest(".nb-chip"); if (b && !b.disabled) { hide(); if (API.play) API.play(+b.dataset.lv); } };
    const btn = $(".nb-continue"); btn.disabled = false; btn.classList.add("ready");
    btn.textContent = all ? "Play again from Level 1" : `Continue — Level ${next + 1}`;
    $(".nb-card").innerHTML = "";
    $(".nb-close").style.display = cb.closable ? "" : "none";
  }

  // returning players / the HUD house button. opts: { closable, continue: fn }
  function showMap(opts) {
    opts = opts || {}; ensure(); clearTimeout(timer);
    const cur = Progress.currentMilestone(); sel = cur < 0 ? 0 : cur;
    cb = { closable: !!opts.closable, continue: () => { hide(); const n = Progress.nextLevel(-1); if (opts.continue) opts.continue(n === null ? 0 : n); else if (API.play) API.play(n === null ? 0 : n); } };
    open("map"); renderMap();
  }

  // ---- after a level: always the map ---------------------------------------------------------------------------
  // beat: result of Progress.record(). Ordinary level: the map with the current location's progress and its
  // newest window lighting up. Milestone: the same map with the location lighting up, then the next one
  // introduced. A replay shows the map without animation. No sheet and no "view map" step: this IS the map.
  function showBeat(beat) {
    ensure(); clearTimeout(timer);
    const m = beat.milestone, target = Progress.nextLevel(beat.level);
    const goNext = () => { hide(); if (API.play) API.play(target === null ? 0 : target); };
    const cur = Progress.currentMilestone();
    cb = { closable: false, continue: goNext };
    open("payoff");
    const btn = $(".nb-continue"), card = $(".nb-card");
    $(".nb-pips").innerHTML = ""; $(".nb-chips").innerHTML = ""; $(".nb-hint").textContent = ""; $(".nb-close").style.display = "none";
    const cardFor = (i, newIdx) => {
      const c = Progress.counts(i); let pp = "";
      for (let k = 0; k < c.total; k++) pp += `<span class="nb-pip ${k < c.done ? "on" : ""} ${k === newIdx ? "new" : ""}"></span>`;
      card.innerHTML = `<div class="nb-card-name">${esc(name(i))}</div><div class="nb-card-sub">${c.done === c.total ? "Fully lit" : `<b>${plural(c.total - c.done)}</b> left`}</div><div class="nb-pips">${pp}</div>`;
    };
    if (!beat.milestoneDone) { // ordinary level (or replay)
      $(".nb-title").textContent = beat.replay ? "Replay complete" : "Puzzle complete!";
      $(".nb-sub").innerHTML = Progress.milestoneComplete(m) ? `${esc(name(m))} is already lit` : `<b>${plural(left(m))}</b> left to light ${esc(name(m))}`;
      $(".nb-scene").innerHTML = scene({ anim: beat.replay ? null : beat });
      cardFor(m, beat.replay ? -1 : beat.done - 1);
      btn.disabled = false; btn.classList.add("ready"); btn.textContent = target === null ? "Play again from Level 1" : "Continue";
      if (API.sfx && !beat.replay) API.sfx("level");
      return;
    }
    // milestone: the neighborhood payoff
    Progress.markCelebrated(m);
    const L1 = LOC[Progress.MILESTONES[m].id], tags = [{ x: L1.x - 40, y: L1.y - 128, text: name(m) + " is complete!" }];
    if (cur >= 0) {
      const L2 = LOC[Progress.MILESTONES[cur].id], right = L2.x < 180;
      tags.push({ x: (L1.x + L2.x) / 2 + 10, y: (L1.y + L2.y) / 2 + 12, text: "The road lights the way" });
      tags.push({ x: right ? L2.x + 54 : L2.x - 156, y: L2.y - 74, text: "Your next destination!" });
    }
    $(".nb-title").textContent = name(m) + " is lit!";
    $(".nb-sub").innerHTML = "&nbsp;";
    $(".nb-scene").innerHTML = scene({ anim: Object.assign({ type: "payoff" }, beat), tags });
    card.innerHTML = "";
    btn.disabled = true; btn.classList.remove("ready"); btn.textContent = cur < 0 ? "Play again from Level 1" : "Continue";
    if (API.sfx) API.sfx("milestone");
    timer = setTimeout(() => { // the payoff lands, then the next location is introduced
      if (cur < 0) $(".nb-sub").innerHTML = "<b>The whole neighborhood is back on.</b>";
      else { $(".nb-sub").innerHTML = `Next: <b>${esc(name(cur))}</b> · ${plural(Progress.counts(cur).total)}`; cardFor(cur, -1); }
      btn.disabled = false; btn.classList.add("ready");
    }, 2300);
  }

  function init(opts) { Object.assign(API, opts || {}); }
  return { init, showMap, showBeat, hide, isOpen, ART };
})();
