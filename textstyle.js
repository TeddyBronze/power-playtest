// ============================================================================
// POWER — text styles (POWER Rounded Bold, the approved "A" look)
//
// The font holds only the letter shapes; gradients, outlines and shadows are drawn here, so text stays dynamic.
//   title()  level names and success messages: cream-to-gold vertical gradient, dark navy outline, short drop shadow
//   pale()   level line and subtitles: pale blue/white with a dark navy outline
//   soft()   appliance labels, objectives, instructions: same font, lighter outline for small sizes
// Characters the font lacks (· › — ★ ✓ ' …) fall back per character to the system font in FAMILY.
// TXT.ready() resolves when the font has loaded (or after a timeout, so the game never waits forever).
// ============================================================================
const TXT = (function () {
  const FAMILY = '"POWER Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const NAVY = "#0b1233", PALE = "#dbe5ff", PALE_DIM = "#a9b8e6";
  const font = (px) => `700 ${Math.round(px * 10) / 10}px ${FAMILY}`;

  let loaded = null;
  function ready(timeout = 2500) {
    if (loaded) return loaded;
    const wait = document.fonts && document.fonts.load ? document.fonts.load('700 24px "POWER Rounded"').catch(() => null) : Promise.resolve();
    loaded = Promise.race([wait, new Promise((r) => setTimeout(r, timeout))]);
    return loaded;
  }

  // set the font, shrinking it (down to minPx) so `text` fits maxW; returns the size used
  function fit(ctx, text, px, maxW, minPx = px * 0.6) {
    ctx.font = font(px);
    const w = ctx.measureText(text).width;
    if (maxW && w > maxW) { px = Math.max(minPx, px * maxW / w); ctx.font = font(px); }
    return px;
  }

  function stroke(ctx, text, x, y, color, width) {
    ctx.lineJoin = "round"; ctx.miterLimit = 2; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.strokeText(text, x, y);
  }

  // cream-to-gold title with a navy outline and a short downward shadow
  function title(ctx, text, x, y, px, o = {}) {
    ctx.save();
    px = fit(ctx, text, px, o.maxW, o.minPx);
    const ow = Math.max(3, px * 0.17), drop = Math.max(2, px * 0.09);
    ctx.fillStyle = NAVY; stroke(ctx, text, x, y + drop, NAVY, ow); ctx.fillText(text, x, y + drop); // shadow
    stroke(ctx, text, x, y, NAVY, ow);
    const m = ctx.measureText(text), top = y - (m.actualBoundingBoxAscent || px * 0.75), bot = y + (m.actualBoundingBoxDescent || px * 0.2);
    const g = ctx.createLinearGradient(0, top, 0, bot);
    (o.stops || [[0, "#fff8e4"], [0.45, "#ffe39a"], [1, "#ffb42a"]]).forEach(([k, c]) => g.addColorStop(k, c));
    ctx.fillStyle = g; ctx.fillText(text, x, y);
    ctx.restore();
    return px;
  }

  // pale blue/white with a dark navy outline
  function pale(ctx, text, x, y, px, o = {}) {
    ctx.save();
    px = fit(ctx, text, px, o.maxW, o.minPx);
    stroke(ctx, text, x, y, NAVY, Math.max(2.5, px * 0.24));
    ctx.fillStyle = o.color || PALE; ctx.fillText(text, x, y);
    ctx.restore();
    return px;
  }

  // the light version for small text: thinner, slightly transparent outline
  function soft(ctx, text, x, y, px, o = {}) {
    ctx.save();
    px = fit(ctx, text, px, o.maxW, o.minPx);
    stroke(ctx, text, x, y, o.outline || "rgba(11,18,51,0.8)", Math.max(2, px * 0.2));
    ctx.fillStyle = o.color || PALE; ctx.fillText(text, x, y);
    ctx.restore();
    return px;
  }

  return { FAMILY, NAVY, PALE, PALE_DIM, font, ready, fit, title, pale, soft };
})();
