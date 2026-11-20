/*
 * LCARS flow: a page builds itself on, piece to piece, instead of just
 * appearing; and before you leave for another page, it takes itself down.
 *
 *   <div class="lcars-board" data-flow="console">   plays when the page loads
 *        (data-flow-speed="2" plays it twice as fast)
 *   LcarsFlow.play(root, { style: "console", speed: 1 })   plays (or replays) it
 *   LcarsFlow.leave(root, url)    takes the page down, then goes to url
 *
 * Styles:
 *   console  built like the old LCARS Flash intros (lcars.org.uk): the header
 *            and footer rails draw together in the middle of the screen and
 *            slide apart (when the top and bottom are elbows, they start as
 *            two bars in the middle, draw out to the right, then open like a
 *            sheet: the elbows part up and down, their sidebars growing out of
 *            the seam and the blocks between them coming into view); the
 *            elbows bloom from their corners, one after
 *            another; everything else grows out of them, each piece from the
 *            side where it meets the last, so bars telescope out along the
 *            arms and sidebars and button columns stack away from the joints.
 *            Then the content comes up: words key on, pictures scan in, text
 *            types, number columns fill, PADDs start.
 *   spread   colour floods out from the top left along everything it touches,
 *            branching wherever pieces meet
 *   surge    spread, faster, with a white-hot leading edge that cools to colour
 *   stream   one brush: each piece is painted after the last, nearest next
 *   ripple   a wave from the top-left corner: each piece fills outward from
 *            where the wave first touches it
 *
 * Sound: with data-flow-sound (or { sound: true }), the opening plays the
 * power-up from lcars/sounds/: the power rising (TrekCore's Power Up 1 and 2
 * clean, joined into one rise), console key presses at random moments
 * through it (Keypress 2, a panel tap, a chirp; now and then two systems at
 * once, and now and then a tick train like the computer beep sequences), and
 * the computer starting to process as the power peaks. A new mix every time.
 * With sound, the opening is timed to it: the frame draws through the
 * power-up's rise and stands as the power peaks (3 s), the content comes up
 * while the computer processes (to 4.5 s), and each key press in the sound
 * makes a piece already on screen flare, like a system coming online.
 * Browsers only let sound start once the visitor has clicked something on
 * the site, so a site's first page may open silently; the POLARIS app
 * always plays it. Sounds need the page served over HTTP (or the app).
 *
 * Steps: a piece with data-step="1" (2, 3 ...) leaves the build above and
 * comes in later, step by step after the content: bars, buttons and gauges
 * grow along their long side, then their words key on; text types, pictures
 * scan in, and so on. Steps share out the time after the frame (with sound,
 * so the last one finishes with it), or start at a time of their own; each
 * step's pieces finish before the next step starts, quicker if they must:
 *   <div class="lcars-board" data-flow="console" data-flow-steps='{"2": {"at": 3.5, "sound": "sounds/beep.mp3"}}'>
 * ("at" in seconds from the start of the opening; "sound" plays as the step comes in).
 *
 * Your own sound: data-flow-sound="sounds/opening.mp3" plays that file
 * instead of the power-up, and the opening takes as long as it does (the
 * frame stands about two thirds of the way in, at most 3 s).
 *
 * Layered sounds play on top of it (a voice over the power-up, say), each
 * from its own start time, and don't change the opening's timing:
 *   data-flow-layers='[{"sound": "sounds/voice.mp3", "at": 1.5}]'
 *
 * Groups: pieces with data-group="name" stay hidden (pieces.css) until
 * something with data-opens="name" is clicked (or pressed with Enter or
 * Space); then the group grows in as a step does, its own steps in order
 * (pieces without one first). Opened from a picture, the group's pictures
 * grow out of the one clicked. Clicking it again closes the group, and an
 * open group that overlaps one opening closes first, so groups in the same
 * place take turns. Openers carry aria-expanded. Works whether or not the
 * page has an opening; when the opening plays, every group starts closed.
 *   <div class="piece p-image" data-opens="DETAIL" role="button" tabindex="0" aria-expanded="false">
 *   <div class="piece p-frame" data-group="DETAIL">
 *   LcarsFlow.openGroup(root, "DETAIL") and LcarsFlow.closeGroup(root, "DETAIL") do it from script.
 *
 * Page changes: on a page that builds itself, following a link to another
 * page of the site (name.html) first plays the build backwards, quickly, back
 * to the joints and the rails, then goes. Coming back with the Back button
 * plays the build again.
 *
 * Works on POLARIS pages (.lcars-board > .piece) and on pages written
 * with lcars/lcars.css (bars, caps, buttons and frames). With reduced motion
 * turned on in the operating system, pages just show, and links just go.
 *
 * A plain script (not a module), so pages work when opened from disk.
 */
(() => {
  "use strict";

  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SCRIPT_SRC = document.currentScript?.src || location.href; // sounds/ sits beside this script

  /** Speeds in design pixels a second, for a page 1400 px wide. */
  const STYLES = {
    console: { speed: 1000, joints: true },
    spread: { speed: 1000 },
    surge: { speed: 1500, hot: true },
    stream: { speed: 2600 },
    ripple: { speed: 950 },
  };
  const HIDDEN = "polygon(0 0, 0 0, 0 0)";
  /** How much faster a page comes down than it went up. */
  const LEAVE_RATE = 2.4;
  /** With sound: when the frame stands (the power peaks) and when the sound ends, in ms. */
  const FRAME_END = 3000, SOUND_END = 4450;

  /* ---------------- what's on the page ---------------- */

  /**
   * The page's parts:
   *   shapes   the coloured frame, which colour flows through
   *   labels   words on the shapes, which key on once the frame stands
   *   content  everything else, which comes up last, each in its own way
   *   rails    the header and footer, for console
   */
  function survey(root) {
    const board = root.matches(".lcars-board") ? root : root.querySelector(".lcars-board");
    return board ? surveyBoard(board) : surveyPage(root);
  }

  /** A page written with lcars/lcars.css. */
  function surveyPage(root) {
    const shapes = [...root.querySelectorAll([
      ".lcars-cap", ".lcars-seg", ".lcars-bar > .lcars-title", ".lcars-btn:not(.blank)",
      ".lcars-frame > .side > .seg", ".lcars-frame > .top > *", ".lcars-frame > .bottom > *",
    ].join(", "))].filter((el) => el.getClientRects().length).map(measure);
    const labels = [...root.querySelectorAll(".lcars-btn:not(.blank), .lcars-frame > .side > .seg")].map((el) => ({ el, by: "color" }));
    const content = [...root.querySelectorAll(".lcars-frame > .content > *")].map((el) => ({ el, how: el.tagName === "TREK-PADD" ? "padd" : "scan" }));
    const bars = [...root.querySelectorAll(":scope > .lcars-bar")];
    const railEls = bars.length > 1 ? [bars[0], bars.at(-1)] : bars;
    const rails = railEls.map((bar, i) => ({ move: bar, side: i ? "bottom" : "top", pieces: shapes.filter((p) => bar.contains(p.el)) }));
    return { root, shapes, labels, content, rails, page: true, stepped: [] };
  }

  /** What each builder piece is: part of the frame, or content (and how it comes up). */
  const BOARD = {
    elbow: "shape", block: "shape", button: "shape", textbar: "shape", gauge: "shape", frame: "shape", quote: "shape",
    text: "type", list: "type", image: "scan", cascade: "rows", padd: "padd", wave: "grow", insignia: "scan",
  };
  /** Words on builder shapes. */
  const BOARD_LABELS = ".body > .label, .tb-text, .q-text, .f-text, .g-num, .g-track";

  /** A page made in POLARIS. */
  function surveyBoard(board) {
    const box = board.getBoundingClientRect();
    const cols = parseFloat(getComputedStyle(board).getPropertyValue("--cols")) || 160;
    const k = box.width / cols; // one grid cell, in px
    const shapes = [], content = [], labels = [], stepped = [];
    for (const el of board.querySelectorAll(":scope > .piece")) {
      if (el.hasAttribute("data-group") || !el.getClientRects().length) continue; // a group comes in when it's opened
      const item = itemOf(el), { role } = item;
      if (item.step >= 1) { // comes in later, at its step
        stepped.push(item);
        continue;
      }
      if (role === "shape") {
        shapes.push(measure(el, k));
        for (const l of el.querySelectorAll(BOARD_LABELS)) labels.push({ el: l, by: "show" });
        const pic = el.querySelector(".f-img");
        if (pic) content.push({ el: pic, how: "scan" });
      } else {
        content.push({ el, how: role });
      }
    }
    // Rails: bar-like pieces along the very top and the very bottom, reaching across most of the page.
    // An elbow along the top edge (arm at the top) or the bottom edge counts too: the page then opens like a sheet.
    const flat = (p) => p.kind === "h" && p.h <= 8 * k;
    const atTop = (p) => p.y - (box.top + scrollY) <= 4.5 * k; // pages often keep a few cells' margin
    const atBottom = (p) => box.bottom + scrollY - (p.y + p.h) <= 4.5 * k;
    const top = shapes.filter((p) => atTop(p) && (flat(p) || (p.kind === "elbow" && !p.vflip)));
    const bottom = shapes.filter((p) => atBottom(p) && (flat(p) || (p.kind === "elbow" && p.vflip)));
    const wide = (ps) => ps.reduce((s, p) => s + p.boxW, 0) >= box.width * 0.4;
    const rails = [["top", top], ["bottom", bottom]].filter(([, ps]) => ps.length && wide(ps))
      .map(([side, ps]) => ({ side, pieces: ps.sort((a, b) => a.x - b.x) }));
    return { root: board, shapes, labels, content, rails, k, stepped };
  }

  /** A piece that comes in on its own (at its step, or with its group), and how. */
  function itemOf(el) {
    const type = [...el.classList].find((c) => c.startsWith("p-"))?.slice(2);
    const role = BOARD[type] || "shape";
    return { el, step: parseInt(el.dataset.step, 10) || 0, role,
      labels: role === "shape" ? [...el.querySelectorAll(BOARD_LABELS)] : [], pic: el.querySelector(".f-img") };
  }

  /* ---------------- geometry ---------------- */

  /**
   * A piece and the path colour takes through it. Bars run along their long
   * side. An elbow's path runs from the tip of its arm, along the arm to the
   * middle of its sidebar, then down (or up) the sidebar. Positions along a
   * path are "s", from 0 to len. In an elbow's own drawing the sidebar is on
   * the left (w wide) and the arm along the top (bar thick), reaching arm
   * further right; hflip and vflip turn that to the other corners.
   */
  function measure(el, k) {
    const r = el.getBoundingClientRect();
    const p = { el, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
    p.boxW = p.w;
    if (el.matches(".side > .elbow-top, .side > .elbow-bottom")) {
      // lcars.css: the box is the sidebar; the arm and inner curve hang off it (::before, ::after).
      const before = getComputedStyle(el, "::before"), after = getComputedStyle(el, "::after");
      Object.assign(p, {
        kind: "elbow", arm: parseFloat(before.width) || 0, bar: parseFloat(before.height) || 0, inner: parseFloat(after.width) || 0,
        vflip: el.classList.contains("elbow-bottom"), hflip: !!el.closest(".lcars-frame.flip"),
      });
    } else if (el.matches(".p-elbow") && ![...el.classList].some((c) => c.startsWith("rot-"))) {
      // A builder elbow: the box holds it all; --S and --B are the sidebar and arm in cells.
      const cs = getComputedStyle(el);
      const corner = [...el.classList].find((c) => c.startsWith("corner-"))?.slice(7) || "tl";
      const side = (parseFloat(cs.getPropertyValue("--S")) || 1) * k, bar = (parseFloat(cs.getPropertyValue("--B")) || 1) * k;
      const svg = el.querySelector("svg"), d = el.querySelector("svg path")?.getAttribute("d") || "";
      const scale = svg ? p.w / (svg.viewBox.baseVal.width || p.w) : 1;
      const inner = (parseFloat(/ A([\d.]+),/.exec(d)?.[1]) || 0) * scale;
      Object.assign(p, {
        kind: "elbow", w: Math.min(side, p.w), arm: Math.max(0, p.w - side), bar: Math.min(bar, p.h), inner,
        hflip: corner[1] === "r", vflip: corner[0] === "b",
      });
    } else {
      p.kind = p.w >= p.h ? "h" : "v";
      p.len = p.kind === "h" ? p.w : p.h;
      p.rects = [{ x: p.x, y: p.y, w: p.w, h: p.h }];
      return p;
    }
    p.sA = p.arm + p.w / 2; // where the path turns the corner
    p.len = p.sA + p.h - p.bar / 2;
    // Its outline, for finding what it touches: the sidebar and the arm.
    p.rects = [[0, 0, p.w, p.h], [p.w, 0, p.w + p.arm, p.bar]].map(([x0, y0, x1, y1]) => {
      const a = fromLocal(p, x0, y0), b = fromLocal(p, x1, y1);
      return { x: p.x + Math.min(a.x, b.x), y: p.y + Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    });
    return p;
  }

  /** Page point to the elbow's own drawing, and its own drawing to element coordinates. */
  const toLocal = (p, x, y) => ({ x: p.hflip ? p.boxW - (x - p.x) : x - p.x, y: p.vflip ? p.h - (y - p.y) : y - p.y });
  const fromLocal = (p, x, y) => ({ x: p.hflip ? p.boxW - x : x, y: p.vflip ? p.h - y : y });

  /** Where along a piece's path a page point is. */
  function along(p, q) {
    if (p.kind === "h") return clamp(q.x - p.x, 0, p.len);
    if (p.kind === "v") return clamp(q.y - p.y, 0, p.len);
    const l = toLocal(p, q.x, q.y);
    if (l.y < p.bar && l.x > p.w / 2) return clamp(p.w + p.arm - l.x, 0, p.sA);
    return clamp(p.sA + l.y - p.bar / 2, p.sA, p.len);
  }

  /** The page point at a place along a piece's path. */
  function pointAt(p, s) {
    if (p.kind === "h") return { x: p.x + s, y: p.y + p.h / 2 };
    if (p.kind === "v") return { x: p.x + p.w / 2, y: p.y + s };
    const l = s <= p.sA ? { x: p.w + p.arm - s, y: p.bar / 2 } : { x: p.w / 2, y: p.bar / 2 + s - p.sA };
    const e = fromLocal(p, l.x, l.y);
    return { x: p.x + e.x, y: p.y + e.y };
  }

  /**
   * How much of a piece shows with colour from s0 to s1 along its path, as a
   * clip-path. limit: for an elbow, nothing shows further than this from its
   * arm (in its own drawing), as when its sidebar is still coming out of a seam.
   * reach: for an elbow, nothing shows further than this from its outer side
   * (in its own drawing), as when it's being drawn from its corner outward.
   */
  function region(p, s0, s1, limit = Infinity, reach = Infinity) {
    const B = 1.5; // bleed, so edges aren't shaved
    if (s1 <= s0 || reach <= 0) return HIDDEN;
    if (s0 <= 0 && s1 >= p.len && limit >= p.h && (p.kind !== "elbow" || reach >= p.w + p.arm + B)) return "none";
    if (p.kind === "h") return `inset(${-B}px ${px(p.w - s1)} ${-B}px ${px(s0)})`;
    if (p.kind === "v") return `inset(${px(s0)} ${-B}px ${px(p.h - s1)} ${-B}px)`;
    const rects = [];
    if (s0 < p.sA) { // along the arm
      const right = p.w + p.arm - s0 + (s0 <= 0 ? B : 0);
      const left = s1 >= p.sA ? -B : p.w + p.arm - s1;
      rects.push([left, -B, right, p.bar]);
    }
    if (s1 > p.sA) { // down the sidebar (and its inner curve)
      const top = s0 <= p.sA ? -B : p.bar / 2 + s0 - p.sA;
      const bottom = s1 >= p.len ? p.h + B : p.bar / 2 + s1 - p.sA;
      rects.push([-B, top, p.w + p.inner + B, bottom]);
    }
    const shown = rects.map(([x0, y0, x1, y1]) => [x0, y0, Math.min(x1, reach), Math.min(y1, limit)])
      .filter(([x0, y0, x1, y1]) => y1 > y0 && x1 > x0);
    if (!shown.length) return HIDDEN;
    const d = shown.map(([x0, y0, x1, y1]) => {
      const a = fromLocal(p, x0, y0), b = fromLocal(p, x1, y1);
      const [l, r] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
      const [t, bt] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
      return `M${r2(l)} ${r2(t)}H${r2(r)}V${r2(bt)}H${r2(l)}Z`;
    }).join(" ");
    return `path("${d}")`;
  }

  /** The gap between two pieces, and the nearest point on each. */
  function contact(a, b) {
    let best = null;
    for (const ra of a.rects) for (const rb of b.rects) {
      const onB = nearestTo(rb, ra), onA = nearestTo(ra, rb);
      const dist = Math.hypot(onB.x - onA.x, onB.y - onA.y);
      if (!best || dist < best.dist) best = { dist, onA, onB };
    }
    return best;
  }

  /** The point of rect r nearest rect o (the middle of where they face each other). */
  function nearestTo(r, o) {
    const span = (a0, a1, b0, b1) => (a1 >= b0 && b1 >= a0 ? (Math.max(a0, b0) + Math.min(a1, b1)) / 2 : b0 > a1 ? a1 : a0);
    return { x: span(r.x, r.x + r.w, o.x, o.x + o.w), y: span(r.y, r.y + r.h, o.y, o.y + o.h) };
  }

  /** The point of piece p nearest a page point. */
  function nearestPoint(p, q) {
    let best = null;
    for (const r of p.rects) {
      const pt = { x: clamp(q.x, r.x, r.x + r.w), y: clamp(q.y, r.y, r.y + r.h) };
      const d = Math.hypot(pt.x - q.x, pt.y - q.y);
      if (!best || d < best.d) best = { d, pt };
    }
    return best;
  }

  /* ---------------- timing ---------------- */

  /** Fill a piece from s along its path, reaching both ends: how long it takes. */
  const fillTime = (p) => (p.wipe ? p.w + p.arm + 2 : Math.max(p.s, p.len - p.s)) / p.v;
  const topLeft = (pieces) => pieces.reduce((a, b) => (b.y + b.x * 0.2 < a.y + a.x * 0.2 ? b : a));

  /**
   * Colour spreading from settled pieces through everything they touch: each
   * open piece starts where colour first reaches it. A hop across a small gap
   * is quick; a jump across open black is slower.
   */
  function flood(settled, open, v, tol, rate = 1, from = (p) => p.t, jump = (d) => d * 4) {
    open = new Set(open);
    for (const p of open) p.t = Infinity;
    const relax = (a) => {
      for (const b of open) {
        const c = contact(a, b);
        const hop = c.dist <= tol ? c.dist : jump(c.dist);
        const t = from(a) + Math.abs(along(a, c.onA) - a.s) / a.v + hop / v;
        if (t < b.t) Object.assign(b, { t, s: along(b, c.onB) });
      }
    };
    settled.forEach(relax);
    if (!settled.length && open.size) {
      const o = topLeft([...open]);
      Object.assign(o, { t: 0, s: along(o, { x: o.x, y: o.y }) });
    }
    while (open.size) {
      let a = null;
      for (const p of open) if (!a || p.t < a.t) a = p;
      open.delete(a);
      a.v = v * rate;
      relax(a);
    }
  }

  /** spread, surge, stream and ripple: by distance from the top left. */
  function schedule(page, style, v, tol) {
    const pieces = page.shapes;
    for (const p of pieces) p.v = v;
    const origin = topLeft(pieces);
    const O = { x: origin.x, y: origin.y };
    if (style === "ripple") {
      for (const p of pieces) {
        const n = nearestPoint(p, O);
        Object.assign(p, { t: n.d / v, s: along(p, n.pt) });
      }
      return {};
    }
    if (style === "stream") {
      let cur = origin, t = 0, s = along(origin, O);
      const left = new Set(pieces);
      while (cur) {
        left.delete(cur);
        Object.assign(cur, { t, s });
        const done = t + fillTime(cur);
        const exit = pointAt(cur, s < cur.len / 2 ? cur.len : 0); // the far end
        let next = null, best = null;
        for (const p of left) {
          const n = nearestPoint(p, exit);
          if (!best || n.d < best.d) [next, best] = [p, n];
        }
        if (!next) break;
        t = done + best.d / v;
        s = along(next, best.pt);
        cur = next;
      }
      return {};
    }
    flood([], pieces, v, tol);
    return {};
  }

  /**
   * console: rails first, drawn left to right in the middle and slid apart;
   * then the elbows, one after another; then everything grows out of them.
   * Returns the rails' slide.
   */
  function scheduleConsole(page, v, tol) {
    const { shapes } = page;
    const box = page.root.getBoundingClientRect();
    const mid = Math.min(box.top + box.height / 2, innerHeight / 2);

    // 1. Rails, drawn together in the middle of the screen, then apart. An elbow on a rail starts as
    //    a bar (its sidebar hidden past the seam in the middle) and draws out from its corner.
    const midPage = mid + scrollY;
    const both = page.rails.length > 1;
    let drawn = 0;
    const slides = page.rails.map((rail) => {
      const top = Math.min(...rail.pieces.map((p) => p.y)), bottom = Math.max(...rail.pieces.map((p) => p.y + p.h));
      const band = Math.max(...rail.pieces.map((p) => (p.kind === "elbow" ? p.bar : p.h)));
      const isTop = rail.side === "top";
      const dy = !both ? (isTop ? midPage - band / 2 - top : midPage + band / 2 - bottom)
        : isTop ? midPage - 3 - band - top : midPage + 3 + band - bottom;
      const slide = { els: rail.move ? [rail.move] : rail.pieces.map((p) => p.el), dy, cur: dy, side: rail.side, top, bottom };
      const leftward = rail.pieces.some((p) => p.kind === "elbow" && p.hflip);
      let t = 0;
      for (const p of leftward ? [...rail.pieces].reverse() : rail.pieces) {
        if (p.kind === "elbow") {
          // Drawn from nothing: the corner first, then the bar growing out along the arm.
          Object.assign(p, { t, s: 0, v: v * 1.8, wipe: true, seam: isTop ? midPage - 1 : midPage + 1, slide });
          t += fillTime(p);
        } else {
          Object.assign(p, { t, s: leftward ? p.len : 0, v: v * 3.2 });
          t += p.len / p.v;
        }
      }
      drawn = Math.max(drawn, t);
      return slide;
    });
    const railPieces = new Set(page.rails.flatMap((r) => r.pieces));
    const railElbows = [...railPieces].filter((p) => p.kind === "elbow");
    const slideAt = drawn + 120, slideFor = railElbows.length ? 950 : 520;
    const T = !slides.length ? 0 : railElbows.length ? slideAt + slideFor + 60 : slideAt + slideFor * 0.7;

    // The sheet: blocks between the rail elbows, under their sidebars, come into view as they part.
    let sheet = null;
    if (railElbows.length) {
      const sides = railElbows.map((e) => e.rects[0]);
      const upper = slides.find((sl) => sl.side === "top"), lower = slides.find((sl) => sl.side === "bottom");
      const lo = upper ? upper.bottom : -Infinity, hi = lower ? lower.top : Infinity;
      const blocks = shapes.filter((p) => !railPieces.has(p) && p.y >= lo - 1 && p.y + p.h <= hi + 1 &&
        sides.some((c) => p.x < c.x + c.w && p.x + p.w > c.x));
      for (const b of blocks) Object.assign(b, { t: slideAt, s: 0, v: v * 1000, window: true });
      sheet = { upper, lower, blocks };
    }

    // Pages written with lcars.css know their frames; builder pages are worked out from where things touch.
    if (page.page) return { slides, slideAt, slideFor, ...framesByStructure(page, v, T) };

    const opened = new Set(sheet?.blocks);

    // 2. Elbows, top to bottom, each blooming from its corner.
    const elbows = shapes.filter((p) => p.kind === "elbow" && !railPieces.has(p))
      .sort((a, b) => Math.round((a.y - b.y) / 20) || a.x - b.x);
    elbows.forEach((p, i) => Object.assign(p, { t: T + i * 260, s: p.sA, v: v * 1.7 }));

    // 3. Everything else grows out of them (or out of the rails and the sheet, once they've landed).
    const rest = shapes.filter((p) => p.kind !== "elbow" && !railPieces.has(p) && !opened.has(p));
    const landed = (p) => railPieces.has(p) || opened.has(p);
    // A jump across open black (to buttons out in the middle, say) is a short pause, not a slow crawl.
    flood([...elbows, ...railPieces, ...opened], rest, v, tol, 3, (p) => (landed(p) ? Math.max(p.t, T) : p.t), (d) => 2 * tol + d * 0.25);
    return { slides, slideAt, slideFor, sheet };
  }

  /** console on a page written with lcars.css: frame by frame, then the buttons beside each, row by row. */
  function framesByStructure(page, v, T) {
    const byEl = new Map(page.shapes.map((p) => [p.el, p]));
    const set = (el, t, from, rate) => {
      const p = byEl.get(el);
      if (!p || p.t !== undefined) return null;
      const s = from === "end" ? p.len : from === "joint" ? (p.kind === "elbow" ? p.sA : p.len / 2) : 0;
      return Object.assign(p, { t, s, v: v * rate });
    };
    for (const p of page.shapes) if (!page.rails.some((r) => r.pieces.includes(p))) delete p.t;
    const span = (p) => (p ? p.len / p.v : 0);
    const frameAt = new Map();
    for (const frame of page.root.querySelectorAll(".lcars-frame")) {
      frameAt.set(frame, T);
      const flip = frame.classList.contains("flip");
      const segs = [...frame.querySelectorAll(":scope > .side > .seg")];
      const elbow = (el) => el.matches(".elbow-top, .elbow-bottom");
      for (const el of segs.filter(elbow)) set(el, T, "joint", 1.7);
      let ty = T + 170;
      for (const el of segs.filter((e) => !elbow(e))) if (set(el, ty, 0, 2.6)) ty += 80;
      for (const row of [":scope > .top > *", ":scope > .bottom > *"]) {
        let t = T + 200;
        const kids = [...frame.querySelectorAll(row)];
        if (flip) kids.reverse();
        for (const el of kids) t += span(set(el, t, flip ? "end" : 0, 4)) + 40;
      }
      T += 480;
    }
    for (const nav of page.root.querySelectorAll(".lcars-buttons")) {
      const nr = nav.getBoundingClientRect();
      let start = T;
      for (const [frame, at] of frameAt) {
        const fr = frame.getBoundingClientRect();
        if (nr.top < fr.bottom && nr.bottom > fr.top) { start = at + 320; break; }
      }
      const btns = [...nav.querySelectorAll(".lcars-btn:not(.blank)")].map((el) => ({ el, r: el.getBoundingClientRect() }));
      const rows = [...new Set(btns.map((b) => Math.round(b.r.top / 8)))].sort((a, b) => a - b);
      for (const b of btns) set(b.el, start + rows.indexOf(Math.round(b.r.top / 8)) * 55 + (b.r.left - nr.left) * 0.15, 0, 2.2);
    }
    for (const p of page.shapes) if (p.t === undefined) set(p.el, T, "joint", 2);
    return {};
  }

  /** The whole plan for a page: who starts when, and when the frame stands. */
  function plan(root, opts) {
    const style = STYLES[opts.style] ? opts.style : root.dataset.flow in STYLES ? root.dataset.flow : "console";
    const conf = STYLES[style];
    const page = survey(root);
    if (!page.shapes.length && !page.stepped.length) return null;
    const scale = page.root.getBoundingClientRect().width / 1400;
    const rate = opts.speed || Number(root.dataset.flowSpeed) || 1;
    const v = (conf.speed * rate * Math.max(0.5, scale)) / 1000; // px per ms
    const tol = page.k ? 2.5 * page.k : 16 * Math.max(0.6, scale);
    const extra = !page.shapes.length ? {} : style === "console" ? scheduleConsole(page, v, tol) : schedule(page, style, v, tol);
    const end = page.shapes.length ? Math.max(...page.shapes.map((p) => p.t + fillTime(p))) : 0;
    const endAll = Math.max(end, extra.slides?.length ? extra.slideAt + extra.slideFor : 0);
    return { page, conf, end, endAll, ...extra };
  }

  /* ---------------- one moment of the build ---------------- */

  /** cubic-bezier(x1, y1, x2, y2) as a function of 0..1. */
  function bezier(x1, y1, x2, y2) {
    const at = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
    return (x) => {
      let t = x;
      for (let i = 0; i < 8; i++) {
        const dx = 3 * x1 * (1 - t) ** 2 + 6 * (x2 - x1) * t * (1 - t) + 3 * (1 - x2) * t * t;
        if (Math.abs(dx) < 1e-6) break;
        t = clamp(t - (at(x1, x2, t) - x) / dx, 0, 1);
      }
      return at(y1, y2, t);
    };
  }
  const slideEase = bezier(0.5, 0, 0.2, 1);

  /**
   * Put the page as it is at time t (ms) into the build: the rails' slide,
   * every shape's clip, the sheet's opening. Returns whether anything is still
   * on its way.
   */
  function frame(p, t) {
    const { page } = p;
    if (p.slides) {
      const k = slideEase(clamp((t - p.slideAt) / p.slideFor, 0, 1));
      for (const sl of p.slides) {
        sl.cur = sl.dy * (1 - k);
        const tf = Math.abs(sl.cur) < 0.05 ? "" : `translateY(${r2(sl.cur)}px)`;
        for (const el of sl.els) el.style.transform = tf;
      }
    }
    // The sheet's opening: between the rail elbows' current edges.
    let win = null;
    if (p.sheet) {
      const top = p.sheet.upper ? p.sheet.upper.bottom + p.sheet.upper.cur : -Infinity;
      const bottom = p.sheet.lower ? p.sheet.lower.top + p.sheet.lower.cur : Infinity;
      if (top < bottom) win = { top, bottom };
    }
    let busy = !!p.slides && t < p.slideAt + p.slideFor;
    for (const s of page.shapes) {
      let clip;
      if (s.window) {
        const a = win ? clamp(win.top - s.y, 0, s.h) : s.h, b = win ? clamp(s.y + s.h - win.bottom, 0, s.h) : 0;
        clip = a + b >= s.h ? HIDDEN : a < 0.5 && b < 0.5 ? "none" : `inset(${px(a)} -2px ${px(b)} -2px)`;
      } else {
        const d = (t - s.t) * s.v;
        let limit = Infinity;
        if (s.seam !== undefined) { // a rail elbow: nothing past the seam in the middle
          const seam = s.seam - (s.y + s.slide.cur);
          limit = s.vflip ? s.h - seam : seam;
        }
        clip = d <= 0 ? HIDDEN : s.wipe ? region(s, 0, s.len, limit, d - 1.5) : region(s, s.s - d, s.s + d, limit);
      }
      s.el.style.clipPath = clip === "none" ? "" : clip;
      if (clip !== "none") busy = true;
    }
    return busy;
  }

  /* ---------------- playing ---------------- */

  let running = null;

  /** Build a page on. */
  function play(root = document.querySelector("[data-flow]") || document.body, opts = {}) {
    stop();
    document.documentElement.classList.remove("flow-pending");
    closeGroups(root);
    if (reduced()) return;
    const p = plan(root, opts);
    if (!p) return;
    const { page } = p;

    // Hide it all, words too, until the colour and then the content arrive.
    const run = start(page);
    for (const s of page.shapes) s.el.style.clipPath = HIDDEN;
    for (const { el, by } of page.labels) by === "color" ? (el.style.color = "transparent") : (el.style.visibility = "hidden");
    for (const { el } of page.content) el.style.visibility = "hidden";
    for (const s of page.stepped) {
      s.el.style.visibility = "hidden";
      for (const l of s.labels) l.style.visibility = "hidden"; // they key on after the piece has grown
    }

    run.cleanup.push(() => { for (const sl of p.slides || []) for (const el of sl.els) el.style.transform = ""; });
    if (p.slides) frame(p, 0); // rails in the middle, before anything shows

    // The steps' own times and sounds.
    p.steps = stepConfig(root, opts);
    // With sound, wait (briefly) until it's loaded, so the two start together.
    const sound = !!(opts.sound ?? root.hasAttribute("data-flow-sound"));
    const own = typeof opts.sound === "string" ? opts.sound : root.getAttribute("data-flow-sound") || "";
    const stepSounds = Object.values(p.steps).map((c) => c.sound).filter(Boolean);
    const layers = layerConfig(root, opts);
    if (sound) p.timed = true; // the opening takes as long as the sound, whether or not the browser lets it play
    if (!sound && !stepSounds.length && !layers.length) return go(p, run);
    Promise.all([
      !sound ? false : own ? sounds.ready(800, own) : sounds.ready(800),
      ...stepSounds.map((url) => sounds.ready(800, url)),
      ...layers.map((l) => sounds.ready(800, l.sound)),
    ]).then(() => {
      if (running !== run) return;
      // Every sound decides now, alike: it plays if it has loaded and sound may play. (A sound's own
      // check can come before a new window's audio has started, which dropped the power-up alone.)
      const ok = sounds.ctx?.state === "running";
      let presses = null;
      if (sound && own) {
        // Its length sets the opening's even if the browser holds the sound back (it plays once it may).
        const buf = sounds.files.get(own);
        if (buf) p.soundEnd = buf.duration * 1000 + 50;
        if (ok && buf) run.cleanup.push(playFile(own));
      } else if (sound && ok && sounds.buffers) {
        presses = pressPlan();
        run.cleanup.push(powerUp(presses));
      }
      // Layered sounds start on the same clock, each at its own time.
      for (const l of layers) run.cleanup.push(playFile(l.sound, l.at));
      go(p, run, presses);
    });
  }

  /** data-flow-layers (or opts.layers): [{ sound: url, at: seconds }], read safely. */
  function layerConfig(root, opts) {
    let list = opts.layers;
    if (!list) try { list = JSON.parse(root.dataset.flowLayers || "[]"); } catch { list = []; }
    return (Array.isArray(list) ? list : [])
      .filter((l) => l && typeof l.sound === "string" && l.sound)
      .map((l) => ({ sound: l.sound, at: Number.isFinite(Number(l.at)) && Number(l.at) > 0 ? Number(l.at) : 0 }));
  }

  /** data-flow-steps (or opts.steps): { "2": { at: seconds, sound: url } }, read safely. */
  function stepConfig(root, opts) {
    let conf = opts.steps;
    if (!conf) try { conf = JSON.parse(root.dataset.flowSteps || "{}"); } catch { conf = {}; }
    const out = {};
    for (const [n, c] of Object.entries(conf || {})) {
      if (!/^\d+$/.test(n) || !c || typeof c !== "object") continue;
      const at = Number(c.at);
      out[n] = {
        at: c.at !== "" && c.at != null && Number.isFinite(at) && at >= 0 ? at : null,
        sound: typeof c.sound === "string" ? c.sound : "",
      };
    }
    return out;
  }

  /**
   * The build itself, from now. Timed to the sound, the build's own clock runs
   * at whatever pace makes the frame stand as the power peaks; presses (from
   * the sound) make finished pieces flare.
   */
  function go(p, run, presses = null) {
    const { page, conf, endAll } = p;
    const soundEnd = p.soundEnd || SOUND_END;
    const frameEnd = p.soundEnd ? Math.min(FRAME_END, soundEnd * 0.67) : FRAME_END;
    const rate = p.timed && p.endAll > 0 ? p.endAll / frameEnd : 1; // build ms per real ms
    const real = (t) => t / rate;
    if (conf.joints) { // elbows flare as they form
      for (const s of page.shapes.filter((q) => q.kind === "elbow")) {
        run.anims.push(s.el.animate([{ filter: "brightness(1.9) saturate(0.5)" }, { filter: "none" }],
          { duration: 450, delay: real(s.t), easing: "ease-out", fill: "backwards" }));
      }
    }
    if (conf.hot) {
      for (const s of page.shapes) {
        run.anims.push(s.el.animate(
          [{ filter: "brightness(2.4) saturate(0.35)" }, { filter: "brightness(1.35) saturate(0.8)", offset: 0.35 }, { filter: "none" }],
          { duration: real(fillTime(s)) + 650, delay: real(s.t), easing: "ease-out", fill: "backwards" },
        ));
      }
    }
    if (presses) systemsOnline(p, run, presses, rate);

    const t0 = performance.now();
    const tick = (now) => {
      run.frame = frame(p, (now - t0) * rate) ? requestAnimationFrame(tick) : 0;
    };
    run.frame = requestAnimationFrame(tick);
    const at = real(endAll) + 100; // once the frame stands: drawn, and (a sheet opening) fully parted
    // After the frame: the content, then each step, sharing the time to the sound's end (or brisk, without).
    const nums = [...new Set(page.stepped.map((s) => s.step))].sort((a, b) => a - b);
    const tail = p.timed ? Math.max(200 * (nums.length + 1), soundEnd - at) : 0;
    const phase = p.timed ? tail / (nums.length + 1) : 700;
    const whens = nums.map((n, i) => (p.steps[n]?.at != null ? p.steps[n].at * 1000 : at + (i + 1) * phase));
    // Each part has until the next one starts (the last, until the sound ends), and finishes in it, so the order shows.
    const budget = (t) => {
      const next = Math.min(...whens.filter((w) => w > t + 50));
      if (Number.isFinite(next)) return next - t;
      return p.timed ? Math.max(phase, soundEnd - t) : 900;
    };
    if (nums.length) run.timers.push(setTimeout(() => populate(page, run, budget(at), 0, budget(at)), at));
    else run.timers.push(setTimeout(() => populate(page, run, p.timed ? phase : 0), at));
    nums.forEach((n, i) => {
      const when = whens[i];
      const items = page.stepped.filter((s) => s.step === n);
      run.timers.push(setTimeout(() => revealStep(items, run, budget(when)), when));
      if (p.steps[n]?.sound) run.cleanup.push(playFile(p.steps[n].sound, when / 1000));
    });
  }

  /**
   * A step's pieces come in: shapes grow along their long side, then their
   * words and pictures; the rest as content does. All of it within span ms.
   */
  function revealStep(items, run, span) {
    const grow = clamp(span * 0.4, 150, 600);
    const sub = { labels: [], content: [] };
    for (const s of items) {
      if (s.role !== "shape") { // populate shows it, its own way
        sub.content.push({ el: s.el, how: s.role });
        continue;
      }
      s.el.style.visibility = "";
      const r = s.el.getBoundingClientRect();
      const from = r.width >= r.height ? "inset(-2px 100% -2px -2px)" : "inset(-2px -2px 100% -2px)";
      run.anims.push(s.el.animate([{ clipPath: from }, { clipPath: "inset(-2px)" }],
        { duration: grow, easing: "cubic-bezier(0.3, 0, 0.2, 1)", fill: "backwards" }));
      sub.labels.push(...s.labels.map((el) => ({ el, by: "show" })));
      if (s.pic) sub.content.push({ el: s.pic, how: "scan" });
    }
    const shapes = items.some((s) => s.role === "shape");
    const rest = Math.max(150, shapes ? span - grow : span);
    populate(sub, run, rest, shapes ? grow : 0, rest);
  }

  /**
   * Each key press in the sound lights up a piece that's already drawn, like a
   * system coming online; a tick train flickers one piece through its ticks.
   */
  function systemsOnline(p, run, presses, rate) {
    const shapes = p.page.shapes;
    const ready = (s, t) => (s.window ? t >= p.slideAt + p.slideFor : s.t + fillTime(s) <= t);
    const trains = new Map();
    for (const h of presses) {
      const ms = h.t * 1000 + 50; // the sound starts 50 ms in
      let s = h.train !== undefined ? trains.get(h.train) : null;
      if (!s) {
        const lit = shapes.filter((x) => ready(x, ms * rate));
        if (!lit.length) continue;
        s = pick(lit);
        if (h.train !== undefined) trains.set(h.train, s);
      }
      const short = h.tick !== undefined;
      run.anims.push(s.el.animate([{ filter: `brightness(${short ? 1.45 : 1.75})` }, { filter: "none" }],
        { duration: short ? 45 : 240, delay: ms, easing: "ease-out" }));
    }
  }

  /**
   * Words key on in reading order; then each piece of content comes up its own
   * way. span: ms to spread it over (to finish with the sound), or 0 for brisk.
   * fit: ms it must all be done in (a step's turn), shortening each piece's way in.
   */
  function populate(page, run, span = 0, lead = 0, fit = 0) {
    const n = page.content.length;
    const room = fit * 0.85;
    const labelStep = fit ? clamp((room * 0.3) / Math.max(1, page.labels.length), 6, 70)
      : span ? clamp((span * 0.5) / Math.max(1, page.labels.length), 18, 70) : 0;
    const labelFor = fit ? clamp(room * 0.6, 120, 260) : 260;
    const stagger = fit && n > 1 ? Math.min(120, (room * 0.25) / (n - 1)) : 0;
    const dur = (ms) => (fit ? Math.max(100, Math.min(ms, room - stagger * Math.max(0, n - 1))) : ms);
    const contentStep = fit ? stagger : span && n > 1 ? clamp((span - 900) / (n - 1), 70, 450) : 70;
    const reading = (list) => list.map((x) => ({ ...x, r: x.el.getBoundingClientRect() }))
      .sort((a, b) => Math.round(a.r.top / 12) - Math.round(b.r.top / 12) || a.r.left - b.r.left);
    reading(page.labels).forEach(({ el, by }, i) => {
      if (by === "color") {
        el.style.color = "";
        const c = getComputedStyle(el).color;
        run.anims.push(el.animate(
          [{ color: "transparent" }, { color: c, offset: 0.3 }, { color: "transparent", offset: 0.45 }, { color: c }],
          { duration: labelFor, delay: lead + i * (labelStep || 22), fill: "backwards" }));
      } else {
        el.style.visibility = "";
        run.anims.push(el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0, offset: 0.45 }, { opacity: 1 }],
          { duration: labelFor, delay: lead + i * (labelStep || 18), fill: "backwards" }));
      }
    });
    reading(page.content).forEach(({ el, how, r }, i) => {
      el.style.visibility = "";
      const delay = lead + (fit ? 0 : 100) + i * contentStep;
      const wipe = (from, ms, easing = "linear") =>
        run.anims.push(el.animate([{ clipPath: from }, { clipPath: "inset(-2px)" }], { duration: dur(ms), delay, easing, fill: "backwards" }));
      switch (how) {
        case "padd": el.restart?.() ?? el.querySelector("trek-padd")?.restart?.(); break;
        case "type": wipe("inset(-2px 100% -2px -2px)", 420, "steps(14, end)"); break; // left to right, in steps, like typing
        case "rows": wipe("inset(-2px -2px 100% -2px)", 700, `steps(${Math.max(3, Math.round(r.height / 14))}, end)`); break;
        case "grow": wipe("inset(-2px 50% -2px 50%)", 500, "cubic-bezier(0.3, 0, 0.2, 1)"); break;
        default: scan(el, r, delay, run, dur(900)); // pictures
      }
    });
  }

  /** A picture scans in from the top behind a bright line. */
  function scan(el, r, delay, run, ms = 900) {
    run.anims.push(el.animate([{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0 0)" }],
      { duration: ms, delay, easing: "linear", fill: "backwards" }));
    const host = el.offsetParent || el.parentElement, box = host?.getBoundingClientRect();
    if (!box) return;
    const line = document.createElement("div");
    line.style.cssText = `position:absolute;left:${r.left - box.left}px;width:${r.width}px;top:${r.top - box.top}px;height:2px;` +
      "background:#fff;box-shadow:0 0 8px 2px rgb(153 204 255 / 0.8);pointer-events:none;opacity:0;z-index:5";
    host.append(line);
    const a = line.animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 1, transform: `translateY(${r.height}px)`, offset: 0.97 },
      { opacity: 0, transform: `translateY(${r.height}px)` }], { duration: ms + 30, delay, easing: "linear" });
    a.finished.then(() => line.remove(), () => line.remove());
    run.cleanup.push(() => line.remove());
  }

  /* ---------------- sound ---------------- */

  const SOUND_FILES = {
    base: "powerup.mp3", K: "press-key2.mp3", T: "press-tap.mp3", C: "press-chirp.mp3",
    proc3: "processing3.mp3", proc: "processing.mp3",
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  const sounds = {
    ctx: null, buffers: null, loading: null,
    /** Other sound files (your own opening sound, steps' sounds): url -> decoded buffer, once each. */
    files: new Map(), fetching: new Map(),
    context() {
      if (!this.ctx) try { this.ctx = new AudioContext(); } catch { /* no sound here */ }
      return this.ctx;
    },
    /** Fetch and decode the power-up's sounds (once). */
    load() {
      if (this.loading) return this.loading;
      if (!this.context()) return (this.loading = Promise.resolve(false));
      const dir = new URL("sounds/", SCRIPT_SRC);
      this.loading = Promise.all(Object.entries(SOUND_FILES).map(async ([key, file]) => {
        const res = await fetch(new URL(file, dir));
        if (!res.ok) throw new Error(file);
        return [key, await this.ctx.decodeAudioData(await res.arrayBuffer())];
      })).then((list) => { this.buffers = Object.fromEntries(list); return true; }, () => false);
      return this.loading;
    },
    /** Fetch and decode a sound file of the page's own (once). */
    loadFile(url) {
      if (!this.fetching.has(url)) {
        this.fetching.set(url, !this.context() ? Promise.resolve(false) : fetch(new URL(url, document.baseURI))
          .then((res) => { if (!res.ok) throw new Error(url); return res.arrayBuffer(); })
          .then((data) => this.ctx.decodeAudioData(data))
          .then((buf) => { this.files.set(url, buf); return true; }, () => false));
      }
      return this.fetching.get(url);
    },
    /**
     * Ready to play within ms, and allowed to (browsers hold sound until the
     * visitor has clicked)? The power-up's sounds, or with url, that file.
     */
    async ready(ms, url = "") {
      const ok = await Promise.race([url ? this.loadFile(url) : this.load(), wait(ms).then(() => false)]);
      if (!ok) return false;
      // A new window's audio can take a moment to start; a browser holding sound until a click never starts it.
      if (this.ctx.state !== "running") await Promise.race([this.ctx.resume().catch(() => {}), wait(400)]);
      return this.ctx.state === "running";
    },
  };
  // After the visitor's first click, later openings on this page can sound.
  addEventListener("pointerdown", () => sounds.ctx?.resume().catch(() => {}), { capture: true, once: true });

  /**
   * Key presses through the power-up's rise: 4 to 6 moments from about 0.9 s
   * to 2.95 s. About a third are two systems at once (25 to 90 ms apart); now
   * and then (at most twice) a moment is a tick train: a tap, 4 to 9 quick
   * ticks, a chirp. Times in seconds; gains as in the mixes it was tuned on.
   */
  function pressPlan() {
    const keys = ["K", "T", "C"], hits = [];
    let t = rand(0.85, 1.15), last = null, trains = 0;
    for (let n = 4 + Math.floor(Math.random() * 3); n > 0 && t <= 2.95; n--) {
      if (trains < 2 && Math.random() < 0.3) {
        const step = rand(0.038, 0.055), k = 4 + Math.floor(Math.random() * 6), freq = Math.random() < 0.67 ? 2300 : 1150;
        const train = trains;
        hits.push({ t, key: "T", gain: 0.5, train });
        for (let j = 0; j < k; j++) hits.push({ t: t + 0.06 + j * step, tick: freq, gain: 0.9 - (0.5 * j) / k, train });
        hits.push({ t: t + 0.06 + k * step + 0.03, key: "C", gain: 0.42, train });
        t += 0.06 + k * step + 0.25;
        trains++;
        last = "C";
        continue;
      }
      const a = pick(keys.filter((x) => x !== last));
      hits.push({ t, key: a, gain: rand(0.42, 0.6) });
      last = a;
      if (Math.random() < 0.35) {
        const b = pick(keys.filter((x) => x !== a));
        hits.push({ t: t + rand(0.025, 0.09), key: b, gain: rand(0.35, 0.5) });
        last = b;
      }
      t += rand(0.18, 0.5);
    }
    return hits;
  }

  /** Play a sound file of the page's own (loaded by sounds.ready) in `at` seconds. Returns a function that stops it. */
  function playFile(url, at = 0) {
    const { ctx } = sounds, buf = sounds.files.get(url);
    if (!ctx || !buf || ctx.state !== "running") return () => {};
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(ctx.currentTime + 0.05 + at);
    return () => { try { src.stop(); } catch { /* done already */ } };
  }

  /** Play a power-up now, with these presses (pressPlan). Returns a function that fades it out. */
  function powerUp(presses = pressPlan()) {
    const { ctx, buffers: B } = sounds;
    const master = ctx.createGain();
    const limit = ctx.createDynamicsCompressor(); // keeps overlapping presses from clipping
    limit.threshold.value = -3;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.002;
    limit.release.value = 0.1;
    master.connect(limit).connect(ctx.destination);
    const T0 = ctx.currentTime + 0.05, nodes = [];
    const play = (buf, at, gain) => {
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf;
      g.gain.value = gain;
      src.connect(g).connect(master);
      src.start(T0 + at);
      nodes.push(src);
    };
    /** A clean tick: a tone and its octave, 2 ms attack, fast decay. */
    const tick = (at, freq, gain) => {
      const env = ctx.createGain(), t = T0 + at;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime((0.4 * gain) / 1.35, t + 0.002);
      env.gain.setTargetAtTime(0, t + 0.002, 0.008);
      env.connect(master);
      for (const [f, v] of [[freq, 1], [freq * 2, 0.35]]) {
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.frequency.value = f;
        og.gain.value = v;
        o.connect(og).connect(env);
        o.start(t);
        o.stop(t + 0.03);
        nodes.push(o);
      }
    };
    play(B.base, 0, 1);
    // The computer starts processing under the top of the rise, then gets busy as the power peaks,
    // steady right to the end: no fades.
    play(B.proc3, 1.85, 0.7);
    play(B.proc, 3.05, 0.5); // quieter than the power-up's peak (about 5 dB), with no fade; its closing trill is halved in the file
    for (const h of presses) h.tick ? tick(h.t, h.tick, h.gain) : play(B[h.key], h.t, h.gain);
    return () => {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
      setTimeout(() => {
        for (const n of nodes) try { n.stop(); } catch { /* not started, or already done */ }
        master.disconnect();
      }, 250);
    };
  }

  /* ---------------- leaving ---------------- */

  /** Take the page down (the build, backwards and quicker), then go to url. */
  function leave(root, url) {
    stop();
    const go = () => { location.href = url; };
    const p = !reduced() && plan(root, {});
    if (!p) return go();
    const { page, endAll } = p;
    const run = start(page);
    run.cleanup.push(() => { for (const sl of p.slides || []) for (const el of sl.els) el.style.transform = ""; });
    // Words and content go first, quickly.
    const quick = [...page.labels.map((l) => l.el), ...page.content.map((c) => c.el), ...page.stepped.map((s) => s.el),
      ...root.querySelectorAll(`.${GROUP_OPEN}`)];
    for (const el of quick) run.anims.push(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" }));
    // Then the build, backwards and quicker: the rails slide back together near the end.
    const t0 = performance.now() + 120;
    const tick = (now) => {
      const back = endAll - Math.max(0, now - t0) * LEAVE_RATE; // the build's own clock, running backwards
      frame(p, back);
      if (back > 0) run.frame = requestAnimationFrame(tick);
      else { run.frame = 0; run.timers.push(setTimeout(go, 60)); }
    };
    run.frame = requestAnimationFrame(tick);
  }

  /** Links to another page of the site take the page down first. */
  addEventListener("click", (e) => {
    const root = e.target.closest?.("[data-flow]");
    const a = e.target.closest?.("a[href]");
    if (!root || !a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== "_self") return;
    const href = a.getAttribute("href");
    if (!/^[\w./-]+\.html(?:[?#].*)?$/i.test(href) || /^[a-z]+:/i.test(href)) return;
    e.preventDefault();
    leave(root, a.href);
  });
  // Back to a page taken down (the browser kept it as it was): build it again.
  addEventListener("pageshow", (e) => {
    const root = document.querySelector("[data-flow]");
    if (e.persisted && root) play(root);
  });

  /* ---------------- groups ---------------- */

  const GROUP_OPEN = "group-open";
  /** Each board's groups: name -> { open, opener, run }. */
  const groupState = new WeakMap();
  const stateOf = (board, name) => {
    if (!groupState.has(board)) groupState.set(board, new Map());
    const all = groupState.get(board);
    if (!all.has(name)) all.set(name, { open: false, opener: null, run: null });
    return all.get(name);
  };
  const boardOf = (root) => (root?.matches?.(".lcars-board") ? root : root?.querySelector?.(".lcars-board"));
  const groupPieces = (board, name) => [...board.querySelectorAll(":scope > .piece[data-group]")].filter((el) => el.dataset.group === name);
  const isPicture = (el) => el.matches(".p-image, .p-frame");
  function union(els) {
    const rs = els.map((el) => el.getBoundingClientRect());
    return { left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)),
      right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) };
  }
  const overlaps = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  /** Stop whatever a group is doing (growing in, or closing), and start a new run for it. */
  function newRun(st) {
    if (st.run) {
      for (const t of st.run.timers) clearTimeout(t);
      for (const a of st.run.anims) a.cancel();
      for (const f of st.run.cleanup) f();
    }
    return (st.run = { frame: 0, anims: [], timers: [], cleanup: [] });
  }
  function setExpanded(board, name, open) {
    for (const el of board.querySelectorAll("[data-opens]")) if (el.dataset.opens === name) el.setAttribute("aria-expanded", String(open));
  }
  /** A transform that lays el over the box `to`. */
  const over = (el, to) => {
    const r = el.getBoundingClientRect();
    return `translate(${r2(to.left - r.left)}px, ${r2(to.top - r.top)}px) scale(${to.width / r.width || 1}, ${to.height / r.height || 1})`;
  };

  /** Open a group: overlapping open groups close, then its pieces grow in, step by step. */
  function openGroup(board, name, from = null) {
    const els = groupPieces(board, name);
    if (!els.length) return;
    const box = union(els);
    for (const [other, st] of groupState.get(board) || []) {
      if (other !== name && st.open && overlaps(union(groupPieces(board, other)), box)) closeGroup(board, other);
    }
    const st = stateOf(board, name);
    const run = newRun(st);
    Object.assign(st, { open: true, opener: from });
    setExpanded(board, name, true);
    if (reduced()) return els.forEach((el) => el.classList.add(GROUP_OPEN));
    // From a picture (not one of the group's own), the group's pictures grow out of it.
    const zoomFrom = from && isPicture(from) && !els.includes(from) ? from.getBoundingClientRect() : null;
    const steps = [...new Set(els.map((el) => itemOf(el).step))].sort((a, b) => a - b);
    steps.forEach((n, i) => {
      const show = () => {
        const items = els.map(itemOf).filter((s) => s.step === n);
        for (const s of items) s.el.classList.add(GROUP_OPEN);
        const zoom = zoomFrom ? items.filter((s) => isPicture(s.el)) : [];
        for (const s of zoom) {
          run.anims.push(s.el.animate([{ transformOrigin: "0 0", transform: over(s.el, zoomFrom) }, { transformOrigin: "0 0", transform: "none" }],
            { duration: 420, easing: "cubic-bezier(0.3, 0, 0.2, 1)" }));
        }
        revealStep(items.filter((s) => !zoom.includes(s)), run, i < steps.length - 1 ? 450 : 900);
      };
      if (i) run.timers.push(setTimeout(show, i * 450));
      else show();
    });
  }

  /** Close a group: its pieces fold away (pictures back into the one that opened them), then hide. */
  function closeGroup(board, name) {
    const st = stateOf(board, name);
    const run = newRun(st);
    st.open = false;
    setExpanded(board, name, false);
    const els = groupPieces(board, name).filter((el) => el.classList.contains(GROUP_OPEN));
    const hide = () => {
      for (const el of els) el.classList.remove(GROUP_OPEN);
      for (const a of run.anims) a.cancel();
      run.anims.length = 0;
    };
    if (!els.length || reduced()) return hide();
    const back = st.opener?.isConnected && isPicture(st.opener) && !els.includes(st.opener) && st.opener.getClientRects().length
      ? st.opener.getBoundingClientRect() : null;
    const ease = { duration: 260, easing: "cubic-bezier(0.5, 0, 0.8, 0.6)", fill: "forwards" };
    for (const el of els) {
      if (back && isPicture(el)) {
        run.anims.push(el.animate([{ transformOrigin: "0 0", transform: "none" }, { transformOrigin: "0 0", transform: over(el, back) }], ease));
      } else if (itemOf(el).role === "shape") {
        const r = el.getBoundingClientRect();
        const to = r.width >= r.height ? "inset(-2px 100% -2px -2px)" : "inset(-2px -2px 100% -2px)";
        run.anims.push(el.animate([{ clipPath: "inset(-2px)" }, { clipPath: to }], ease));
      } else {
        run.anims.push(el.animate([{ opacity: 1 }, { opacity: 0 }], { ...ease, duration: 180 }));
      }
    }
    run.timers.push(setTimeout(hide, 280));
  }

  /** Every group on the board closed, at once (the opening starts from there). */
  function closeGroups(root) {
    const board = boardOf(root);
    if (!board) return;
    for (const [name, st] of groupState.get(board) || []) {
      newRun(st);
      Object.assign(st, { open: false, opener: null });
      setExpanded(board, name, false);
    }
    for (const el of board.querySelectorAll(`:scope > .${GROUP_OPEN}`)) el.classList.remove(GROUP_OPEN);
  }

  function toggleGroup(el) {
    const board = el.closest(".lcars-board"), name = el.dataset.opens;
    if (!board || !name) return;
    if (stateOf(board, name).open) closeGroup(board, name);
    else openGroup(board, name, el);
  }
  addEventListener("click", (e) => {
    const el = e.target.closest?.("[data-opens]");
    if (!el || e.defaultPrevented || e.button !== 0) return;
    e.preventDefault();
    toggleGroup(el);
  });
  addEventListener("keydown", (e) => {
    if ((e.key !== "Enter" && e.key !== " ") || e.defaultPrevented || e.repeat) return;
    const el = e.target.closest?.("[data-opens]");
    if (!el || el !== e.target) return;
    e.preventDefault(); // Space would scroll
    toggleGroup(el);
  });

  /* ---------------- housekeeping ---------------- */

  /** A run's bookkeeping; putting the page back as it was when it's stopped. */
  function start(page) {
    const run = { frame: 0, anims: [], timers: [], cleanup: [] };
    run.cleanup.push(() => {
      for (const s of page.shapes) s.el.style.clipPath = "";
      for (const { el } of page.labels) { el.style.color = ""; el.style.visibility = ""; }
      for (const { el } of page.content) el.style.visibility = "";
      for (const s of page.stepped || []) {
        s.el.style.visibility = "";
        for (const l of s.labels) l.style.visibility = "";
      }
    });
    running = run;
    return run;
  }

  function stop() {
    if (!running) return;
    cancelAnimationFrame(running.frame);
    for (const t of running.timers) clearTimeout(t);
    for (const a of running.anims) a.cancel();
    for (const f of running.cleanup) f();
    running = null;
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const r2 = (v) => Math.round(v * 100) / 100;
  const px = (v) => `${r2(Math.max(0, v))}px`;

  // Pages that build themselves stay dark until the pictures and fonts are in, then play.
  document.documentElement.classList.add("flow-pending");
  const style = document.createElement("style");
  style.textContent = ".flow-pending [data-flow] { visibility: hidden; }";
  document.head.append(style);
  const begin = () => {
    const root = document.querySelector("[data-flow]");
    if (!root) return document.documentElement.classList.remove("flow-pending");
    if (root.hasAttribute("data-flow-sound")) {
      const own = root.getAttribute("data-flow-sound");
      own ? sounds.loadFile(own) : sounds.load();
    }
    (document.fonts?.ready ?? Promise.resolve()).then(() => play(root));
  };
  if (document.readyState === "complete") begin();
  else addEventListener("load", begin, { once: true });

  window.LcarsFlow = {
    play, leave, stop, styles: Object.keys(STYLES), preloadSound: () => sounds.load(),
    openGroup: (root, name) => { const b = boardOf(root); if (b) openGroup(b, name); },
    closeGroup: (root, name) => { const b = boardOf(root); if (b) closeGroup(b, name); },
  };
})();
