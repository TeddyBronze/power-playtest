// ============================================================================
// POWER — the journey map (placeholder visuals, replaceable)
//
// A DOM + SVG overlay on top of the game canvas: one tall, vertically scrolling scene
// with a winding route. Each level is an electricity pole; every tenth pole is a
// transformer / substation. Completed wires are lit and stay lit; the current pole is
// highlighted; future poles are dark.
//
//   showMap()    launch for returning players / the HUD house button: the map, focused
//                on the next playable pole, completed poles tappable to replay
//   showBeat()   after every win: the wire from the previous pole lights up (skippable),
//                or, for a sector's tenth level, the transformer energises and power
//                spreads through the surrounding scenery (skippable)
//
// The map shows one sector at a time (a button switches). Sector 1 uses the approved art (map1.js, a canvas
// view); sectors without art yet use the placeholder SVG scene below, cropped to that sector's band.
// All rules live in progress.js; this file only draws them.
// ============================================================================
const JourneyMap = (function () {
  const API = { play: null, sfx: null };            // set by the game via init()
  const ART = {};                                    // art slots: see header comment

  // ---- geometry (SVG units; the scene is 360 wide, scaled to the screen) ----------------------
  const W = 360, SEC_H = 1400, TOP_PAD = 320, BOTTOM_PAD = 190, SPACING = SEC_H / 10;
  const PS = 1.3, POLE_H = 46, ATTACH = -41 * PS, T_ATTACH = -64 * PS;        // wire attach height above the base: pole, transformer
  const WARM = "#ffd36b", CREAM = "#fff3c8", AMBER = "#ffb02e";
  const SECTORS = () => Progress.SECTORS;
  const totalH = () => TOP_PAD + SECTORS().length * SEC_H + BOTTOM_PAD;
  const bandBottom = (si) => totalH() - BOTTOM_PAD - si * SEC_H;
  const START = () => ({ x: 180, y: totalH() - BOTTOM_PAD + 62 });
  function polePos(p) { // base point of a route pole
    const k = p.slot, si = p.sector;
    const x = p.finale ? 180 : 180 + 86 * Math.sin((k - 1) * 0.92 + si * 1.7) + 22 * Math.sin((k + si * 3) * 2.1);
    return { x: Math.max(52, Math.min(308, x)), y: bandBottom(si) - (k - 0.5) * SPACING };
  }
  const POS = []; // by route index
  function computePositions() { POS.length = 0; Progress.ROUTE.forEach((p) => POS.push(polePos(p))); }
  const top = (p) => { const b = POS[p.pos - 1]; return { x: b.x, y: b.y + (p.finale ? T_ATTACH : ATTACH) }; };

  // wire into chain pole i: from the previous built pole (or the supply), through any unbuilt poles between them
  function wirePoints(cp) {
    const route = Progress.ROUTE, pts = [];
    const prev = cp.chain === 0 ? null : Progress.CHAIN[cp.chain - 1];
    if (!prev) { const s = START(); pts.push({ x: s.x, y: s.y - 54 }); }
    else for (let r = prev.pos - 1; r < cp.pos - 1; r++) pts.push(top(route[r]));
    pts.push(top(cp));
    return pts;
  }
  function wireD(pts) {
    let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], sag = Math.min(20, 8 + Math.hypot(b.x - a.x, b.y - a.y) * 0.08);
      d += ` Q${((a.x + b.x) / 2).toFixed(1)} ${((a.y + b.y) / 2 + sag).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }
    return d;
  }
  function roadD() { // smooth route through the pole bases (Catmull-Rom to cubic Bezier)
    const pts = [START(), ...POS];
    let d = `M${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      d += ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }

  // ---- scenery (placeholder buildings, lamps, trees), generated per sector ----------------------
  const KIND = {
    house: { shapes: '<rect class="bd" x="-30" y="-40" width="60" height="40" rx="3"/><rect class="bd2" x="-34" y="-46" width="68" height="7" rx="2"/><rect class="door" x="-5" y="-20" width="10" height="20" rx="2"/>', wins: [[-24, -33, 12, 11], [12, -33, 12, 11]] },
    flat: { shapes: '<rect class="bd" x="-24" y="-74" width="48" height="74" rx="3"/><rect class="bd2" x="-28" y="-80" width="56" height="7" rx="2"/><rect class="door" x="-5" y="-12" width="10" height="12" rx="2"/>', wins: [[-18, -66, 14, 12], [4, -66, 14, 12], [-18, -46, 14, 12], [4, -46, 14, 12], [-18, -26, 14, 12]] },
    shop: { shapes: '<rect class="bd" x="-36" y="-42" width="72" height="42" rx="3"/><path class="awn" d="M-40 -52 H40 L36 -42 H-36 Z"/><rect class="door" x="12" y="-30" width="16" height="30" rx="2"/>', wins: [[-30, -34, 20, 18], [-6, -34, 16, 18]] },
    yard: { shapes: '<rect class="bd2" x="-46" y="-26" width="92" height="26" rx="2"/><rect class="bd" x="-40" y="-52" width="34" height="26" rx="2"/><rect class="bd" x="6" y="-46" width="32" height="20" rx="2"/>', wins: [[-34, -44, 10, 10], [-20, -44, 10, 10], [12, -39, 10, 9], [26, -39, 8, 9]] },
    tank: { shapes: '<rect class="bd2" x="-2" y="-12" width="4" height="12"/><rect class="bd2" x="-12" y="-14" width="24" height="3"/><rect class="bd" x="-12" y="-38" width="24" height="26" rx="6"/>', wins: [[-4, -30, 8, 8]] },
  };
  const THEME_KINDS = { street: ["house", "flat", "house", "shop"], compound: ["yard", "house", "tank", "yard"] };
  let PROPS = [];   // { sector, kind, x, y, lamp }
  function computeProps() {
    PROPS = [];
    SECTORS().forEach((sec, si) => {
      const kinds = THEME_KINDS[sec.theme] || THEME_KINDS.street;
      const poles = Progress.ROUTE.filter((p) => p.sector === si);
      for (let n = 0; n < 24; n++) {
        const p = poles[n % 10], base = POS[p.pos - 1];
        const side = n % 2 ? 1 : -1, off = 74 + ((n * 37) % 46), y = base.y + ((n * 53) % 90) - 40;
        for (const sd of [side, -side]) {
          const x = Math.max(34, Math.min(326, base.x + sd * off));
          const clash = POS.some((q) => Math.abs(q.x - x) < 52 && Math.abs(q.y - y) < 46) || PROPS.some((o) => Math.abs(o.x - x) < 70 && Math.abs(o.y - y) < 54);
          if (!clash) { PROPS.push({ sector: si, kind: kinds[n % kinds.length], x, y, near: p }); break; }
        }
      }
      // street lamps beside each pole of the sector
      poles.forEach((p) => { const b = POS[p.pos - 1]; PROPS.push({ sector: si, kind: "lamp", x: b.x + (b.x < 180 ? 30 : -30), y: b.y + 8, near: p }); });
    });
  }

  // ---- rendering ---------------------------------------------------------------------------------------
  const SKY = { street: ["#0c1634", "#08101f"], compound: ["#1b1730", "#110e1e"] };
  const GLOW_SKY = { street: "#3a2c18", compound: "#40281a" };
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const fx = (n) => n.toFixed(1);

  function poleSVG(p, st, pending, ctx) { // st: gap | locked | current | done | pre
    const b = POS[p.pos - 1], cls = `pole ${st} ${p.finale ? "fin" : ""}`;
    let g = `<g class="${cls}" data-pos="${p.pos}" data-index="${p.index === null ? "" : p.index}" transform="translate(${fx(b.x)} ${fx(b.y)}) scale(${PS})">`;
    g += `<circle class="tap" cx="0" cy="-26" r="${p.finale ? 44 : 34}" fill="transparent"/>`;
    if (st === "current" || st === "pre" || st === "done") g += `<ellipse class="halo" cx="0" cy="${p.finale ? -48 : -44}" rx="${p.finale ? 54 : 34}" ry="${p.finale ? 54 : 34}" fill="url(#jmhalo)"/>`;
    if (p.finale) {
      g += '<rect class="fence" x="-40" y="-7" width="80" height="16" rx="2"/>';
      for (let x = -36; x <= 36; x += 8) g += `<line class="fence" x1="${x}" y1="-7" x2="${x}" y2="9"/>`;
      g += '<rect class="trunk" x="-3" y="-58" width="6" height="52" rx="1"/>';
      g += '<rect class="arm" x="-22" y="-60" width="44" height="4" rx="1.5"/>';
      g += '<rect class="can" x="-24" y="-46" width="16" height="30" rx="5"/><rect class="can" x="8" y="-46" width="16" height="30" rx="5"/>';
      g += '<path class="bolt" d="M-1 -43 L-6 -31 H-1 L-3 -20 L5 -34 H0 Z"/>';
      [-20, 0, 20].forEach((x) => { g += `<circle class="ins" cx="${x}" cy="-63" r="2.6"/>`; });
      g += `<circle class="bulb" cx="0" cy="-69" r="4.6"/>`;
      if (st !== "gap") g += `<g transform="translate(0 28)"><circle class="badge" r="9"/><text class="badget" y="3.4" text-anchor="middle">${p.sector + 1}</text></g>`;
    } else {
      g += '<rect class="trunk" x="-2.2" y="-46" width="4.4" height="46" rx="1"/>';
      g += '<rect class="arm" x="-13" y="-40" width="26" height="3" rx="1.2"/>';
      [-10, 0, 10].forEach((x) => { g += `<circle class="ins" cx="${x}" cy="-42.5" r="2"/>`; });
      g += `<circle class="bulb" cx="0" cy="-49" r="4.2"/>`;
    }
    if (st === "current" || st === "pre") g += '<g class="mat"><ellipse class="matglow" cx="0" cy="10" rx="62" ry="24"/><path class="matbody" d="M-31 4 A31 14 0 0 0 31 4 Z"/><path class="matin" d="M-22 5.5 A22 9 0 0 0 22 5.5"/></g>';
    if (!p.finale && st !== "gap") g += `<text class="num ${st}" x="0" y="${st === "current" || st === "pre" ? 36 : 20}" text-anchor="middle">${p.slot}</text>`;
    return g + "</g>";
  }
  function propSVG(pr, lit, delay) {
    const d = delay === undefined ? 0 : delay;
    if (pr.kind === "lamp") {
      return `<g class="prop lamp ${lit ? "lit" : ""}" data-sector="${pr.sector}" style="--d:${d}s" transform="translate(${fx(pr.x)} ${fx(pr.y)})"><rect class="lpost" x="-1" y="-26" width="2" height="26"/><circle class="lhalo" cx="0" cy="-27" r="18" fill="url(#jmhalo)"/><circle class="lbulb" cx="0" cy="-27" r="3.2"/></g>`;
    }
    const k = KIND[pr.kind];
    let g = `<g class="prop ${pr.kind} ${lit ? "lit" : ""}" data-sector="${pr.sector}" style="--d:${d}s" transform="translate(${fx(pr.x)} ${fx(pr.y)})"><g class="shell">${k.shapes}</g>`;
    k.wins.forEach((w, j) => { g += `<rect class="w" x="${w[0]}" y="${w[1]}" width="${w[2]}" height="${w[3]}" rx="2" style="--j:${j * 0.12}s"/>`; });
    return g + "</g>";
  }

  // ctx: { done(p), lit(p), next, pending, litSectors:Set }
  function normalCtx() {
    return { done: (p) => Progress.isCompleteId(p.id), lit: (p) => Progress.wireLit(p), next: Progress.nextPole(), pending: null, litSectors: new Set(SECTORS().map((_, i) => i).filter((i) => Progress.wasCelebrated(i))) };
  }
  function scene(ctx) {
    const H = totalH(), secs = SECTORS(), cut = svgCut();
    let s = `<svg class="jm-svg" viewBox="0 0 ${W} ${cut}" xmlns="http://www.w3.org/2000/svg" data-h="${cut}">`;
    s += '<defs><radialGradient id="jmhalo"><stop offset="0" stop-color="#ffe9a8" stop-opacity="0.9"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient>';
    s += '<radialGradient id="jmglow"><stop offset="0" stop-color="#ffd36b" stop-opacity="0.55"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient>';
    s += '<linearGradient id="jmfog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070a13" stop-opacity="0.92"/><stop offset="1" stop-color="#070a13" stop-opacity="0"/></linearGradient>';
    secs.forEach((sec, i) => { const c = SKY[sec.theme] || SKY.street; s += `<linearGradient id="jmsky${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient>`; });
    s += "</defs>";
    // sky bands, one per sector, plus the open sky above the last one
    s += `<rect x="0" y="0" width="${W}" height="${H}" fill="#070a13"/>`;
    secs.forEach((sec, i) => {
      const y0 = bandBottom(i) - SEC_H, glow = GLOW_SKY[sec.theme] || GLOW_SKY.street;
      s += `<rect x="0" y="${i === secs.length - 1 ? 0 : y0}" width="${W}" height="${SEC_H + (i === secs.length - 1 ? y0 : 0) + 2}" fill="url(#jmsky${i})"/>`;
      s += `<rect class="skylit" data-sector="${i}" x="0" y="${y0}" width="${W}" height="${SEC_H}" fill="${glow}" opacity="${ctx.litSectors.has(i) ? 0.55 : 0}"/>`;
      // horizon hills at the sector's far end
      s += `<path d="M-20 ${y0 + 60} Q 80 ${y0 + 18} 190 ${y0 + 50} T 390 ${y0 + 36} V ${y0 + 130} H-20 Z" fill="#0b1226" opacity="0.8"/>`;
    });
    for (let n = 0; n < 90; n++) s += `<circle class="star" cx="${(n * 97 + 31) % 360}" cy="${(n * 211 + 17) % Math.floor(H - BOTTOM_PAD)}" r="${n % 6 === 0 ? 1.3 : 0.8}"/>`;
    s += `<circle cx="298" cy="${H - BOTTOM_PAD - secs.length * SEC_H + 90}" r="16" fill="#dfe7fb" opacity="0.5"/><circle cx="306" cy="${H - BOTTOM_PAD - secs.length * SEC_H + 86}" r="15" fill="#0b1226"/>`;
    // road
    s += `<path class="road" d="${roadD()}"/>`;
    // scenery (fogged until the previous sector is lit)
    secs.forEach((sec, si) => {
      const fog = si > 0 && !ctx.litSectors.has(si - 1);
      s += `<g class="scenery ${fog ? "fogged" : ""}" data-sector="${si}">`;
      PROPS.filter((p) => p.sector === si).forEach((pr, j) => { s += propSVG(pr, ctx.litSectors.has(si)); void j; });
      s += "</g>";
    });
    // wires
    Progress.CHAIN.forEach((cp) => {
      const d = wireD(wirePoints(cp)), lit = ctx.lit(cp);
      s += `<g class="wire" data-chain="${cp.chain}"><path class="wdark" d="${d}"/><path class="wlit ${lit ? "on" : ""}" d="${d}"/></g>`;
    });
    // supply pole + poles
    const st0 = START();
    s += `<g class="pole supply done" transform="translate(${st0.x} ${st0.y})"><rect class="fence" x="-22" y="-6" width="44" height="14" rx="2"/><rect class="can" x="-14" y="-52" width="28" height="48" rx="6"/><path class="bolt" d="M0 -46 L-7 -28 H-1 L-3 -10 L7 -32 H1 Z"/></g>`;
    Progress.ROUTE.forEach((p) => {
      let st = "gap";
      if (p.built) st = ctx.pending === p ? "pre" : (ctx.done(p) ? "done" : (ctx.next === p ? "current" : "locked"));
      s += poleSVG(p, st, ctx.pending === p, ctx);
    });
    s += '<g class="fxl"></g>';
    return s + "</svg>";
  }

  // ---- DOM ---------------------------------------------------------------------------------------------------
  const CSS = `
  .jm{position:fixed;inset:0;z-index:30;background:#070a13;font-family:"POWER Rounded",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#eef2fa;user-select:none;-webkit-user-select:none}
  .jm.hidden{display:none}
  .jm-scroll{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:none;touch-action:pan-y}
  .jm-scroll::-webkit-scrollbar{display:none}
  .jm-col{max-width:480px;margin:0 auto;transform-origin:50% 50%}
  .jm-svg{display:block;width:100%;height:auto}
  .jm.enter .jm-col{animation:jmIn .3s ease-out both}
  @keyframes jmIn{from{opacity:0;transform:scale(1.35)}to{opacity:1;transform:scale(1)}}
  .jm.leaving .jm-col{transition:transform .28s ease-in,opacity .28s ease-in;opacity:0}
  .jm-top{position:absolute;left:0;right:0;top:0;height:calc(90px + env(safe-area-inset-top));background:linear-gradient(#070a13e0,#070a1300);pointer-events:none}
  .jm-title{position:absolute;left:16px;right:16px;top:calc(64px + env(safe-area-inset-top));text-align:center;font-size:clamp(18px,6.2vw,28px);white-space:nowrap;font-weight:700;color:#ffe39a;background:linear-gradient(#fff8e4,#ffe39a 45%,#ffb42a);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 0 1.2px #0b1233) drop-shadow(0 0 1.2px #0b1233) drop-shadow(0 2.5px 0 #0b1233) drop-shadow(0 0 14px rgba(255,176,46,.45));pointer-events:none;opacity:0;transition:opacity .5s}
  .jm-title.on{opacity:1}
  .jm-close{position:absolute;top:calc(10px + env(safe-area-inset-top));right:14px;width:42px;height:42px;border-radius:50%;border:2px solid #2a3558;background:#0e1424;color:#eef2fa;font-size:22px;line-height:1;z-index:3}
  .jm-actions{position:absolute;left:0;right:0;bottom:0;padding:34px 20px calc(18px + env(safe-area-inset-bottom));display:flex;justify-content:center;background:linear-gradient(#070a1300,#070a13d8 60%);pointer-events:none}
  .jm button{font-family:inherit}
  .jm-continue{pointer-events:auto;width:100%;max-width:420px;height:58px;border:0;border-radius:18px;background:linear-gradient(#ffc24d,#ffa51f);color:#14204a;font-size:21px;font-weight:700;box-shadow:0 0 24px rgba(255,176,46,.35);animation:jmPulse 1.8s infinite}
  .jm-continue:active{transform:scale(.98)}
  @keyframes jmPulse{0%,100%{box-shadow:0 0 14px rgba(255,176,46,.25)}50%{box-shadow:0 0 30px rgba(255,176,46,.6)}}
  .jm-recentre{position:absolute;right:16px;bottom:calc(96px + env(safe-area-inset-bottom));width:46px;height:46px;border-radius:50%;border:2px solid #33426b;background:#0e1424ee;display:none;align-items:center;justify-content:center;z-index:3}
  .jm-recentre.on{display:flex}
  .jm-s1{position:absolute;inset:0;width:100%;height:100%;display:none;touch-action:none}
  .jm.s1 .jm-scroll{display:none}
  .jm.leaving .jm-s1{transition:opacity .25s ease-in;opacity:0}
  .jm.enter .jm-s1{animation:jmFade .3s ease-out both}
  @keyframes jmFade{from{opacity:0}to{opacity:1}}
  .jm-sector{position:absolute;top:calc(10px + env(safe-area-inset-top));left:14px;height:42px;padding:0 16px;border-radius:21px;border:2px solid #2a3558;background:#0e1424e8;color:#dbe5ff;font-size:15px;z-index:3}
  .jm-sector[hidden]{display:none}
  .jm .star{fill:#cfd8f5;opacity:.4}
  .jm .road{fill:none;stroke:#111a33;stroke-width:34;stroke-linecap:round;stroke-linejoin:round;opacity:.9}
  .jm .scenery{transition:opacity .9s}
  .jm .scenery.fogged{opacity:.3}
  .jm .skylit{transition:opacity 1.6s}
  .jm .bd{fill:#101a30;stroke:#26324f;stroke-width:1.5}
  .jm .bd2{fill:#17213d;stroke:#2c3a5e;stroke-width:1.5}
  .jm .awn{fill:#3a2a44;stroke:#4a3a58;stroke-width:1.5}
  .jm .door{fill:#0a1020;stroke:#26324f;stroke-width:1}
  .jm .w{fill:#1b2745;stroke:#2a3558;stroke-width:1}
  .jm .prop.lit .w{fill:${WARM};stroke:${CREAM};transition:fill .5s calc(var(--d,0s) + var(--j,0s)),stroke .5s calc(var(--d,0s) + var(--j,0s))}
  .jm .prop.lit .bd{fill:#1d2038;stroke:#46406a}
  .jm .prop.lit .bd2{fill:#262846;stroke:#524a78}
  .jm .lpost{fill:#1c2748}
  .jm .lbulb{fill:#26324f}
  .jm .lhalo{opacity:0}
  .jm .prop.lamp.lit .lbulb{fill:${WARM};transition:fill .4s var(--d,0s)}
  .jm .prop.lamp.lit .lhalo{opacity:.85;transition:opacity .5s var(--d,0s)}
  .jm .wdark{fill:none;stroke:#26324f;stroke-width:2.2;stroke-linecap:round}
  .jm .wlit{fill:none;stroke:${WARM};stroke-width:2.8;stroke-linecap:round;opacity:0;filter:drop-shadow(0 0 3px ${AMBER})}
  .jm .wlit.on{opacity:1}
  .jm .trunk{fill:#2b3049;stroke:#3a4263;stroke-width:1}
  .jm .arm{fill:#323a58;stroke:#434d70;stroke-width:1}
  .jm .ins{fill:#4b5675}
  .jm .bulb{fill:#26324f;stroke:#3a4263;stroke-width:1}
  .jm .fence{stroke:#3a4263;stroke-width:1.2;fill:none}
  .jm .can{fill:#2a3350;stroke:#3a4263;stroke-width:1.5}
  .jm .bolt{fill:#4b5675}
  .jm .badge{fill:#17213d;stroke:#3a4263;stroke-width:1.5}
  .jm .badget{fill:#7d879e;font-size:11px;font-weight:800}
  .jm .num{fill:#4b5675;font-size:11px;font-weight:700}
  .jm .num.done{fill:#c99a40}
  .jm .num.current,.jm .num.pre{fill:#fff;font-size:14px;font-weight:800}
  .jm .halo{opacity:0}
  .jm .pole.gap{opacity:.35}
  .jm .pole.gap .trunk,.jm .pole.gap .arm{stroke-dasharray:3 3;fill:none}
  .jm .pole.done .trunk,.jm .pole.supply .trunk{fill:#3a3f5f}
  .jm .pole.done .bulb,.jm .pole.supply .bulb{fill:${WARM};stroke:${CREAM}}
  .jm .pole.done .ins{fill:${WARM}}
  .jm .pole.done .halo{opacity:.8}
  .jm .pole.done .can,.jm .pole.supply .can{fill:#5a4620;stroke:#e0b04a}
  .jm .pole.done .bolt,.jm .pole.supply .bolt{fill:${CREAM}}
  .jm .pole.done .badge{stroke:#e0b04a}.jm .pole.done .badget{fill:${WARM}}
  .jm .pole.current .bulb,.jm .pole.pre .bulb{fill:#6b5320;stroke:${WARM}}
  .jm .pole.current .halo,.jm .pole.pre .halo{opacity:.7;animation:jmHalo 1.8s ease-in-out infinite}
  @keyframes jmHalo{0%,100%{opacity:.4}50%{opacity:.95}}
  .jm .pole.flare .halo{opacity:1;animation:jmFlare .9s ease-out}
  @keyframes jmFlare{0%{transform:scale(.4);opacity:0}30%{opacity:1}100%{transform:scale(1.4);opacity:.8}}
  .jm .pole .halo{transform-box:fill-box;transform-origin:center}
  .jm .pole.done,.jm .pole.current{cursor:pointer}
  .jm .pole.shake{animation:jmShake .3s}
  @keyframes jmShake{0%,100%{transform:translate(var(--x),var(--y)) scale(1.3)}30%{transform:translate(calc(var(--x) - 4px),var(--y)) scale(1.3)}70%{transform:translate(calc(var(--x) + 4px),var(--y)) scale(1.3)}}
  .jm .mat .matglow{fill:url(#jmglow);opacity:1;animation:jmMat 1.8s ease-in-out infinite}
  .jm .mat .matbody{fill:#7a5414;stroke:${WARM};stroke-width:2;stroke-linejoin:round}
  .jm .mat .matin{fill:none;stroke:#ffe9a8;stroke-width:1.5}
  @keyframes jmMat{0%,100%{opacity:.7}50%{opacity:1}}
  .jm .head{fill:#fff;filter:drop-shadow(0 0 6px ${AMBER}) drop-shadow(0 0 12px ${AMBER})}
  .jm .ring{fill:none;stroke:${CREAM};stroke-width:3;opacity:0;transform-box:fill-box;transform-origin:center;animation:jmRing var(--dur,.9s) ease-out both}
  @keyframes jmRing{0%{opacity:.95;transform:scale(.2)}100%{opacity:0;transform:scale(1)}}
  .jm .spark{fill:${CREAM};opacity:0;animation:jmSpark 1s ease-out both}
  @keyframes jmSpark{0%{opacity:0;transform:translate(0,0)}25%{opacity:1}100%{opacity:0;transform:translate(var(--dx),var(--dy))}}
  @media (prefers-reduced-motion:reduce){.jm .pole.current .halo,.jm .mat .matglow,.jm-continue{animation:none}.jm.enter .jm-col{animation:none}}
  `;

  let root = null, scrollEl = null, mode = "map", cb = {}, anim = null, view = { ctxFn: normalCtx }, curSector = 0;
  // ---- Sector 1: the approved art (map1.js) ---------------------------------------------------------------
  const hasS1 = () => typeof Sector1Map !== "undefined" && Sector1Map.ready();
  // the art is still downloading (e.g. the map opens right at launch): show the sector blank, then retry once it is in;
  // only a failed download falls back to the placeholder scene
  let s1Wait = 0;
  function waitS1(retry) {
    if (typeof Sector1Map === "undefined" || Sector1Map.ready() || Sector1Map.failed()) return false;
    root.classList.add("s1"); const tok = ++s1Wait;
    Sector1Map.load().then(() => { if (tok === s1Wait && isOpen()) retry(); });
    return true;
  }
  const s1On = () => !!root && root.classList.contains("s1");
  const s1Poles = () => Progress.ROUTE.filter((p) => p.sector === 0);
  const s1State = (p) => ({ done: Progress.isCompleteId(p.id), lit: Progress.wireLit(p), current: Progress.nextPole() === p });
  function openS1(focus, state) {
    root.classList.add("s1");
    Sector1Map.open(root, {
      poles: s1Poles(), state: state || s1State, focus: focus && focus.sector === 0 ? focus : s1Poles()[0],
      onPlay: (p) => { cancelAnim(); root.classList.add("leaving"); setTimeout(() => { hide(); if (API.play) API.play(p.index); }, reducedMotion() ? 0 : 260); },
      onSkip: () => { if (anim && anim.skip) anim.skip(); },
      onFrame: () => { const r = $(".jm-recentre"), on = mode === "map" && Sector1Map.offFocus(view.focus); if (r.classList.contains("on") !== on) r.classList.toggle("on", on); },
    });
  }
  // on the art the current marker carries its own Play tag (and pole 1 sits low enough for the bar to hide it), so the
  // Continue bar only appears when the next level is not on this map (e.g. after the finale, Sector 2 is next)
  function s1Actions() { const nx = Progress.nextPole(); setContinue(nextLabel(), !(nx && nx.sector === 0)); }
  const reducedMotion = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  function sectorButton(show) { // switch between sectors; hidden while an animation runs
    const b = $(".jm-sector"), n = SECTORS().length;
    b.hidden = !show || n < 2;
    b.textContent = curSector === 0 ? `Sector ${curSector + 2} ›` : `‹ Sector ${curSector}`;
  }
  // the SVG scene for a sector other than 1 is cropped at the bottom of that sector's band
  const svgCut = () => (curSector > 0 ? Math.min(totalH(), bandBottom(curSector) + 150) : totalH());
  const $ = (q) => root.querySelector(q);
  const k = () => $(".jm-col").offsetWidth / W;   // layout width: unaffected by the entry/leave transforms
  const viewH = () => scrollEl.clientHeight;

  function ensure() {
    if (root) return;
    const st = document.createElement("style"); st.id = "jm-style"; st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement("div"); root.className = "jm hidden"; root.id = "jm";
    root.innerHTML = '<div class="jm-scroll"><div class="jm-col"></div></div><div class="jm-top"></div><div class="jm-title"></div><button class="jm-sector" hidden></button><button class="jm-close" aria-label="Close">×</button><button class="jm-recentre" aria-label="Back to the current level"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#eef2fa" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg></button><div class="jm-actions"><button class="jm-continue">Continue</button></div>';
    document.body.appendChild(root);
    scrollEl = $(".jm-scroll");
    $(".jm-close").addEventListener("click", () => hide());
    $(".jm-continue").addEventListener("click", () => { if (cb.continue) cb.continue(); });
    $(".jm-recentre").addEventListener("click", () => { if (!view.focus) return; if (s1On()) Sector1Map.focus(view.focus); else smoothScroll(scrollFor(view.focus), 450); });
    $(".jm-sector").addEventListener("click", () => { if (anim) return; showMap({ closable: cb.closable, sector: curSector === 0 ? 1 : 0 }); });
    scrollEl.addEventListener("scroll", updateRecentre, { passive: true });
    // tap: poles. Taps on empty scenery during an animation skip it.
    let moved = false, downY = 0, downScroll = 0, mouseDrag = false;
    scrollEl.addEventListener("pointerdown", (ev) => { moved = false; downY = ev.clientY; downScroll = scrollEl.scrollTop; mouseDrag = ev.pointerType === "mouse"; if (anim && anim.skip) anim.skip(); });
    window.addEventListener("pointermove", (ev) => { // desktop: drag with the mouse to scroll (touch scrolls natively)
      if (!mouseDrag || ev.buttons !== 1) return;
      const dy = ev.clientY - downY; if (Math.abs(dy) > 5) moved = true;
      if (moved) scrollEl.scrollTop = downScroll - dy;
    });
    window.addEventListener("pointerup", () => { mouseDrag = false; });
    scrollEl.addEventListener("click", (ev) => {
      if (moved && Math.abs(scrollEl.scrollTop - downScroll) > 4) return;
      const g = ev.target.closest && ev.target.closest(".pole"); if (!g || g.classList.contains("supply")) return;
      if (g.classList.contains("done") || g.classList.contains("current")) { if (mode === "beat" && anim) return; zoomInto(g, +g.dataset.index); }
      else if (g.classList.contains("locked")) { g.classList.remove("shake"); void g.getBoundingClientRect(); g.style.setProperty("--x", g.getAttribute("transform").match(/translate\(([-\d.]+)/)[1] + "px"); g.style.setProperty("--y", g.getAttribute("transform").match(/ ([-\d.]+)\)/)[1] + "px"); g.classList.add("shake"); }
    });
    window.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && isOpen() && cb.closable) hide(); });
  }
  const isOpen = () => !!root && !root.classList.contains("hidden");
  function hide() { if (!root) return; cancelAnim(); if (typeof Sector1Map !== "undefined") Sector1Map.close(); root.classList.add("hidden"); root.classList.remove("leaving", "enter", "s1"); }
  function cancelAnim() { if (anim && anim.cancel) anim.cancel(); anim = null; }

  // zoom into a pole, then start its level
  function zoomInto(g, index) {
    if (!isFinite(index)) return;
    cancelAnim();
    const r = g.getBoundingClientRect(), cr = $(".jm-col").getBoundingClientRect();
    $(".jm-col").style.transformOrigin = `${r.left + r.width / 2 - cr.left}px ${r.top + r.height / 2 - cr.top}px`;
    $(".jm-col").style.transform = "scale(2.6)";
    root.classList.add("leaving");
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => { hide(); $(".jm-col").style.transform = ""; $(".jm-col").style.transformOrigin = ""; if (API.play) API.play(index); }, reduce ? 0 : 260);
  }

  // ---- camera ----------------------------------------------------------------------------------------------------
  const scrollFor = (pole, frac) => Math.max(0, Math.min(scrollEl.scrollHeight - viewH(), (POS[pole.pos - 1].y - 20) * k() - viewH() * (frac === undefined ? 0.6 : frac)));
  const scrollForY = (y, frac) => Math.max(0, Math.min(scrollEl.scrollHeight - viewH(), y * k() - viewH() * (frac === undefined ? 0.5 : frac)));
  function smoothScroll(target, ms, done) {
    const from = scrollEl.scrollTop, t0 = performance.now(); let raf = 0, stop = false;
    const step = (now) => {
      if (stop) return;
      const t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3);
      scrollEl.scrollTop = from + (target - from) * e;
      if (t < 1) raf = requestAnimationFrame(step); else if (done) done();
    };
    if (ms <= 0) { scrollEl.scrollTop = target; if (done) done(); } else raf = requestAnimationFrame(step);
    return { cancel() { stop = true; cancelAnimationFrame(raf); } };
  }
  function updateRecentre() {
    if (!view.focus) return;
    $(".jm-recentre").classList.toggle("on", mode === "map" && Math.abs(scrollEl.scrollTop - scrollFor(view.focus)) > 320);
  }

  // ---- state helpers ---------------------------------------------------------------------------------------------
  function render(ctx) { // draw the scene for a state context
    $(".jm-col").innerHTML = scene(ctx);
  }
  function setContinue(label, show) { const b = $(".jm-continue"); b.textContent = label; $(".jm-actions").style.display = show === false ? "none" : "flex"; }
  const poleEl = (p) => root.querySelector(`.pole[data-pos="${p.pos}"]`);
  const nextLabel = () => (Progress.nextPole() ? "Continue" : "Play again");
  const goNext = () => { hide(); const n = Progress.nextIndex(); if (API.play) API.play(n === null ? 0 : n); };

  function open(m) {
    ensure(); cancelAnim(); s1Wait++; mode = m; root.classList.remove("hidden", "leaving"); $(".jm-col").style.transform = "";
    root.classList.remove("enter"); void root.offsetWidth; root.classList.add("enter");
    const t = $(".jm-title"); t.classList.remove("on"); t.textContent = "";
    if (typeof Sector1Map !== "undefined") Sector1Map.close(); root.classList.remove("s1"); $(".jm-recentre").classList.remove("on");
  }

  // ---- the map (launch / HUD house button) -------------------------------------------------------------------
  function showMap(opts) {
    opts = opts || {}; ensure(); computePositions(); computeProps();
    cb = { closable: !!opts.closable, continue: goNext };
    open("map");
    let focus = Progress.nextPole() || Progress.CHAIN[Progress.CHAIN.length - 1];
    curSector = opts.sector !== undefined ? opts.sector : focus.sector;
    if (focus.sector !== curSector) { // viewing another sector: its next pole, else its last completed one, else its first
      const ps = Progress.ROUTE.filter((p) => p.sector === curSector && p.built);
      focus = ps.filter((p) => Progress.isCompleteId(p.id)).pop() || ps[0] || focus;
    }
    view = { focus };
    $(".jm-close").style.display = cb.closable ? "" : "none";
    setContinue(nextLabel(), true); sectorButton(true);
    if (curSector === 0 && waitS1(() => showMap(opts))) return;
    if (curSector === 0 && hasS1()) { openS1(focus); s1Actions(); return; }
    render(normalCtx());
    scrollEl.scrollTop = scrollFor(focus);
    updateRecentre();
  }

  // ---- after a win -----------------------------------------------------------------------------------------------
  // beat: Progress.record(). Ordinary level: the new wire lights up and the new pole is energised (about 1.5 s,
  // tap anywhere to skip, Continue goes straight on). Replay: the map as it is. Closing a gap in the wire run
  // (an out-of-order save) rushes power through the poles that were already done. A sector's tenth level (or the
  // level that closes the run to it) also lights the transformer and the scenery (about 6 s, skippable).
  function beatPoles(beat) { // the poles the new connection lights, in order (stops at the transformer of a finished sector)
    const out = [];
    if (!beat.pole || beat.pole.chain >= beat.to) return out;
    for (let i = beat.pole.chain; i < beat.to && out.length < 14; i++) {
      out.push(Progress.CHAIN[i]);
      if (beat.finale >= 0 && Progress.CHAIN[i].sector === beat.finale && Progress.CHAIN[i].finale) break;
    }
    return out;
  }
  function showBeat(beat) {
    ensure(); computePositions(); computeProps();
    cb = { closable: false, continue: goNext };
    const seq = beat.replay ? [] : beatPoles(beat);
    if (!seq.length) { // nothing new connected (a replay): show the map as it is, no animation
      showMap({ closable: false }); cb.continue = goNext; return;
    }
    open("beat");
    const finale = beat.finale >= 0 ? beat.finale : -1;
    if (seq[0].sector === 0 && waitS1(() => showBeat(beat))) return;
    if (seq[0].sector === 0 && hasS1()) { s1Beat(seq.filter((p) => p.sector === 0), finale === 0); return; }
    curSector = seq[0].sector; sectorButton(false);
    const inSeq = (p) => p.chain >= seq[0].chain && p.chain <= seq[seq.length - 1].chain;
    // pre-state: everything as it was; the poles about to light wait in the dark, their wires dark
    const pre = {
      done: (p) => Progress.isCompleteId(p.id) && !inSeq(p), lit: (p) => p.chain < seq[0].chain, next: null, pending: seq[0],
      litSectors: new Set(SECTORS().map((_, i) => i).filter((i) => Progress.wasCelebrated(i) && i !== finale)),
    };
    if (finale >= 0) Progress.markCelebrated(finale);
    render(pre);
    view = { focus: Progress.nextPole() || seq[seq.length - 1] };
    $(".jm-close").style.display = "none"; setContinue("Continue", true);
    const prev = seq[0].chain === 0 ? null : Progress.CHAIN[seq[0].chain - 1];
    const a = prev ? POS[prev.pos - 1].y : START().y, b = POS[seq[0].pos - 1].y;
    scrollEl.scrollTop = scrollForY((a + b) / 2 - 20, 0.5);
    runBeat(seq, finale);
  }

  // Sector 1: the cable runs to the new pole, then its compound lights (tap to skip). The tenth level also plays the
  // sector finale, then "Sector complete"; Continue goes on to the next level either way.
  function s1Beat(seq, isFinale, previewState) {
    curSector = 0;
    if (isFinale && !previewState) Progress.markCelebrated(0);
    const next = Progress.nextPole();
    view = { focus: previewState ? seq[seq.length - 1] : (next && next.sector === 0 ? next : seq[seq.length - 1]) };
    $(".jm-close").style.display = previewState ? "" : "none"; setContinue("Continue", false); sectorButton(false); // tap anywhere skips
    openS1(seq[0], previewState);
    const settle = () => {
      anim = null; mode = "map";
      if (isFinale) { const t = $(".jm-title"); t.textContent = "Sector complete"; t.classList.add("on"); }
      if (previewState) setContinue("Continue", true); else s1Actions();
      sectorButton(true);
    };
    anim = { cancel() { Sector1Map.skip(); }, skip() { Sector1Map.skip(); } };
    cb.continue = previewState ? () => { if (anim) Sector1Map.skip(); else hide(); }
      : () => { if (!anim) { goNext(); return; } if (isFinale) Sector1Map.skip(); else { anim = null; Sector1Map.skip(); goNext(); } };
    Sector1Map.beat(seq, { finale: isFinale, next: view.focus !== seq[seq.length - 1] ? view.focus : null, sfx: (kind) => { if (API.sfx) API.sfx(kind); }, onDone: settle });
  }

  function runBeat(seq, finale) {
    const svg = $(".jm-svg"), fxl = $(".fxl"), NS = "http://www.w3.org/2000/svg";
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lastNext = Progress.nextPole();
    const timers = []; let raf = 0, finished = false, cam = null;
    const later = (ms, fn) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
    const mk = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); Object.keys(attrs).forEach((a) => e.setAttribute(a, attrs[a])); (parent || fxl).appendChild(e); return e; };
    const head = mk("circle", { class: "head", r: 4.5, cx: -50, cy: -50 });
    const cascade = seq.length > 1;

    function sparks(x, y, n, spread) {
      for (let i = 0; i < n; i++) { const an = (i / n) * Math.PI * 2; mk("circle", { class: "spark", r: 2.4, cx: x, cy: y, style: `--dx:${Math.cos(an) * spread}px;--dy:${Math.sin(an) * spread}px;animation-delay:${i * 0.02}s` }); }
    }
    function arrive(p, lit) { // a pole is energised
      lit.style.strokeDasharray = ""; lit.style.strokeDashoffset = ""; lit.classList.add("on");
      const pel = poleEl(p); pel.classList.remove("pre", "locked", "current"); pel.classList.add("done", "flare");
      if (!pel.querySelector(".halo")) pel.insertAdjacentHTML("afterbegin", `<ellipse class="halo" cx="0" cy="-44" rx="34" ry="34" fill="url(#jmhalo)"/>`);
      const m = pel.querySelector(".mat"); if (m) m.remove();
      const t = top(p);
      mk("circle", { class: "ring", cx: t.x, cy: t.y - 8, r: p.finale ? 70 : 38 });
      sparks(t.x, t.y - 8, p.finale ? 14 : 8, p.finale ? 60 : 34);
      if (API.sfx && !cascade) API.sfx(p.finale ? "milestone" : "level");
    }
    function showNext() { // the highlight and the mat move on
      if (!lastNext) return;
      const el = poleEl(lastNext); if (!el) return;
      el.classList.remove("locked"); el.classList.add("current");
      if (!el.querySelector(".mat")) el.insertAdjacentHTML("beforeend", '<g class="mat"><ellipse class="matglow" cx="0" cy="10" rx="62" ry="24"/><path class="matbody" d="M-31 4 A31 14 0 0 0 31 4 Z"/><path class="matin" d="M-22 5.5 A22 9 0 0 0 22 5.5"/></g>');
      if (!el.querySelector(".halo")) el.insertAdjacentHTML("afterbegin", '<ellipse class="halo" cx="0" cy="-44" rx="34" ry="34" fill="url(#jmhalo)"/>');
    }
    function pulse(lit, ms, then) {
      const len = lit.getTotalLength(), t0 = performance.now();
      lit.style.opacity = 1; lit.style.strokeDasharray = len; lit.style.strokeDashoffset = len;
      const stepP = (now) => {
        if (finished) return;
        const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        lit.style.strokeDashoffset = len * (1 - e);
        const pt = lit.getPointAtLength(len * e); head.setAttribute("cx", pt.x); head.setAttribute("cy", pt.y);
        if (t < 1) raf = requestAnimationFrame(stepP); else then();
      };
      raf = requestAnimationFrame(stepP);
    }
    function ripple(p) { // power spreads through the sector's scenery
      const tt = top(p), sec = p.sector;
      svg.querySelectorAll(`.scenery[data-sector="${sec}"] .prop`).forEach((el) => {
        const m = el.getAttribute("transform").match(/translate\(([-\d.]+) ([-\d.]+)\)/), d = Math.hypot(+m[1] - tt.x, +m[2] - tt.y);
        el.style.setProperty("--d", (d / 330).toFixed(2) + "s");
        later((d / 330) * 1000, () => { if (!finished) el.classList.add("lit"); });
      });
      for (let i = 0; i < 3; i++) later(i * 380, () => { if (!finished) mk("circle", { class: "ring", cx: tt.x, cy: tt.y + 20, r: 150 + i * 90, style: "--dur:1.4s" }); });
      const sk = svg.querySelector(`.skylit[data-sector="${sec}"]`); if (sk) sk.setAttribute("opacity", 0.55);
    }
    function finish(go) { // settle on the final state, instantly
      if (finished) return; finished = true; timers.forEach(clearTimeout); cancelAnimationFrame(raf); if (cam) cam.cancel();
      anim = null;
      render(normalCtx());
      view = { focus: Progress.nextPole() || seq[seq.length - 1] };
      scrollEl.scrollTop = scrollFor(view.focus);
      mode = "map"; updateRecentre();
      if (finale >= 0) { const t = $(".jm-title"); t.textContent = "Sector complete"; t.classList.add("on"); }
      setContinue(nextLabel(), true); sectorButton(true);
      if (go) goNext();
    }
    // Continue: an ordinary connection goes straight on; a finale first settles (second press continues)
    cb.continue = () => { if (!anim) { goNext(); return; } if (finale >= 0) finish(false); else { anim.cancel(); anim = null; goNext(); } };
    anim = { cancel() { finished = true; timers.forEach(clearTimeout); cancelAnimationFrame(raf); if (cam) cam.cancel(); }, skip() { finish(false); } };
    if (reduce) { later(0, () => finish(false)); return; }

    function endRun() { // ordinary: the highlight moves on, the camera follows
      later(220, () => { showNext(); if (lastNext) cam = smoothScroll(scrollFor(lastNext), 520, () => { cam = null; later(150, () => finish(false)); }); else later(300, () => finish(false)); });
    }
    function finaleScene(p) { // transformer flare, ripple, warm sky, then the next sector comes into view
      later(500, () => {
        ripple(p);
        cam = smoothScroll(scrollForY(POS[p.pos - 1].y + 420, 0.5), 2200, () => {
          cam = null;
          later(300, () => {
            const sc = svg.querySelector(`.scenery[data-sector="${p.sector + 1}"]`); if (sc) sc.classList.remove("fogged");
            showNext();
            cam = smoothScroll(scrollFor(lastNext || p, 0.6), 1800, () => { cam = null; later(250, () => finish(false)); });
          });
        });
      });
    }
    function run(i) {
      const p = seq[i], lit = svg.querySelector(`.wire[data-chain="${p.chain}"] .wlit`);
      const ms = cascade ? 260 : (p.finale ? 1000 : 750);
      if (cascade) cam = smoothScroll(scrollForY(POS[p.pos - 1].y, 0.5), 240);
      pulse(lit, ms, () => {
        arrive(p, lit);
        if (finale >= 0 && p.finale && p.sector === finale) { head.remove(); if (API.sfx) API.sfx("milestone"); finaleScene(p); }
        else if (i + 1 < seq.length) run(i + 1);
        else { head.remove(); endRun(); }
      });
    }
    later(180, () => run(0));
  }

  // debug: play a sector's finale without touching saved progress (#finale1)
  function previewFinale(si) {
    ensure(); computePositions(); computeProps();
    const pole = Progress.ROUTE.filter((p) => p.sector === si)[9];
    if (!pole || !pole.built) return false;
    cb = { closable: true, continue: () => hide() };
    open("beat");
    if (si === 0 && hasS1()) { // everything before the transformer shown done; saved progress is not touched
      s1Beat([pole], true, (p) => (p.slot < 10 || !Sector1Map.busy() ? { done: true, lit: true, current: false } : { done: false, lit: false, current: false }));
      return true;
    }
    curSector = si; sectorButton(false);
    const pre = { done: (p) => p.chain < pole.chain, lit: (p) => p.chain < pole.chain, next: null, pending: pole, litSectors: new Set(SECTORS().map((_, i) => i).filter((i) => i < si)) };
    render(pre);
    view = { focus: pole }; $(".jm-close").style.display = ""; setContinue("Continue", true);
    scrollEl.scrollTop = scrollForY(POS[pole.pos - 1].y + 120, 0.5);
    runBeat([pole], si);
    const inner = cb.continue; cb.continue = () => { if (anim) inner(); else hide(); };
    return true;
  }

  function init(opts) { Object.assign(API, opts || {}); if (typeof Sector1Map !== "undefined") Sector1Map.load(); }
  return { init, showMap, showBeat, previewFinale, hide, isOpen, ART };
})();
