/*!
 * outline.js: turns an LCARS page's text into vector shapes for export.
 *
 * The exported page then looks the same on every computer without shipping
 * the font: each line of text becomes a small inline SVG that draws the
 * font's letter outlines, and every outline is defined once per page.
 *
 * How it works:
 *   1. The page is laid out in a hidden frame with the real font, the same
 *      way the builder shows it, and every character's position is measured.
 *   2. Each run of characters on one line is replaced by an inline <svg> of
 *      exactly that width and one line high, aligned to the top of its line.
 *      Sizes are in em, so the page still scales with the screen.
 *   3. The SVGs fill with currentColor, so colors, hover rules and colored
 *      runs keep working from the page's CSS.
 *
 * Line boxes come out the same height whatever font a visitor has, so the
 * layout no longer depends on the font at all. A hidden copy of the text is
 * kept for screen readers.
 *
 * Needs opentype.js (vendor/opentype.min.js) to read the font file.
 */
(() => {
  "use strict";

  const FAMILY = "POLARIS Outline Font";
  let cached = null; // { font, buffer, source, name }

  /* ------------------------------------------------------------------ *
   * Getting the font file
   * ------------------------------------------------------------------ */

  async function fromURL(url) {
    try {
      const res = await fetch(url);
      return res.ok ? await res.arrayBuffer() : null;
    } catch {
      return null;
    }
  }

  /** An installed font, where the browser allows reading it (Chrome and Edge). */
  async function fromSystem(postscriptNames) {
    if (!window.queryLocalFonts) return null;
    try {
      const list = await window.queryLocalFonts({ postscriptNames });
      return list.length ? await (await list[0].blob()).arrayBuffer() : null;
    } catch {
      return null;
    }
  }

  function fromPicker() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".otf,.ttf,.woff,font/otf,font/ttf,font/woff";
      input.addEventListener("change", async () => resolve(input.files[0] ? await input.files[0].arrayBuffer() : null));
      input.addEventListener("cancel", () => resolve(null));
      input.click();
    });
  }

  function use(buffer, source) {
    const font = window.opentype.parse(buffer);
    if (!font.supported || !font.numGlyphs) throw new Error("Not a font this tool can read");
    const name = font.names.fontFamily?.en || font.names.fullName?.en || "font";
    cached = { font, buffer, source, name };
    return cached;
  }

  /**
   * The font chosen earlier, or else from `url` (the fonts folder) or `load`
   * (an async function giving the file's bytes, as the desktop app does).
   */
  async function getFont({ url, load, source = "fonts folder" } = {}) {
    if (cached) return cached;
    const buffer = load ? await load() : url ? await fromURL(url) : null;
    return buffer ? use(buffer, source) : null;
  }

  /** Drop the font read earlier, so the next getFont reads it again. */
  function forget() {
    cached = null;
  }

  /** Ask for the font: the installed copy if the browser can read it, else a file. Call from a click. */
  async function chooseFont({ postscriptNames = [] } = {}) {
    let buffer = await fromSystem(postscriptNames);
    let source = "installed font";
    if (!buffer) {
      buffer = await fromPicker();
      source = "chosen file";
    }
    return buffer ? use(buffer, source) : null;
  }

  /* ------------------------------------------------------------------ *
   * Measuring and replacing the text
   * ------------------------------------------------------------------ */

  const round = (n, places) => {
    const f = 10 ** places;
    return Math.round(n * f) / f;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  const CSS = `
/* Text drawn as shapes (see builder/outline.js). */
.lcars-board .tx-o { white-space: nowrap; letter-spacing: 0; word-spacing: 0; }
.lcars-board svg.tx { display: inline-block; vertical-align: top; overflow: visible; fill: currentColor; }
.lcars-board .lcars-dot.tx-dot { vertical-align: top; margin-top: var(--dt); }
.lcars-board .tx-live { display: inline-block; vertical-align: top; text-align: center; overflow: visible; }
.lcars-board .tx-sr {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap;
}
`;

  /**
   * Lay out a page in a hidden frame and outline its text.
   *   html    the page, with its stylesheets reachable from this document
   *   width/height  frame size in px (bigger measures more precisely)
   *   skip    ids of pieces to leave as live text
   *   glyphText  text that the page lays out itself (PADDs): its letters'
   *              shapes are returned as a set for <trek-padd glyphs="...">
   * Returns { inners: Map(piece id -> outlined .body HTML), defs, css, missing, glyphs }.
   */
  async function outline({ html, width, height, skip = new Set(), glyphText = "" }) {
    if (!cached) throw new Error("No font loaded");
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    // Scripts never run in it: measuring only needs the layout, which the builder reads from outside.
    frame.setAttribute("sandbox", "allow-same-origin");
    frame.tabIndex = -1;
    Object.assign(frame.style, {
      position: "fixed", left: "-100000px", top: "0", width: `${width}px`, height: `${height}px`,
      border: "0", opacity: "0", pointerEvents: "none",
    });
    const loaded = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
    frame.srcdoc = html;
    document.body.append(frame);
    try {
      await loaded;
      return await measure(frame, skip, glyphText);
    } finally {
      frame.remove();
    }
  }

  async function measure(frame, skip, glyphText) {
    const { font, buffer } = cached;
    const win = frame.contentWindow;
    const d = frame.contentDocument;

    // Measure with exactly the font file being outlined, whatever the CSS asks for.
    const face = new win.FontFace(FAMILY, buffer.slice(0));
    await face.load();
    d.fonts.add(face);
    const style = d.createElement("style");
    style.textContent = `
      .lcars-board, .lcars-board * { font-family: "${FAMILY}" !important; }
      .piece { --rot: 0 !important; }
      .g-num > span { rotate: none !important; translate: none !important; }
      *, *::before, *::after { animation: none !important; transition: none !important; }`;
    d.head.append(style);
    await d.fonts.ready;

    const upm = font.unitsPerEm;
    const glyphs = new Map(); // glyph index -> path data
    const missing = new Set();
    const inners = new Map();
    const ctx = { d, win, font, upm, glyphs, missing, metrics: new Map() };

    for (const el of d.querySelectorAll(".lcars-board > .piece")) {
      if (skip.has(el.id)) continue;
      const body = el.querySelector(":scope > .body");
      if (!body) continue;
      outlineRoot(body, ctx, { speak: !el.classList.contains("p-cascade") });
      if (el.classList.contains("p-cascade")) body.setAttribute("aria-hidden", "true");
      inners.set(el.id, body.outerHTML);
    }

    const paths = [...glyphs].map(([i, dPath]) => `<path id="tg${i}" d="${dPath}"/>`).join("");
    const defs = `<svg class="tx-defs" aria-hidden="true" width="0" height="0" style="position:absolute"><defs>${paths}</defs></svg>`;
    const glyphSet = glyphText ? letterSet(glyphText, ctx) : null;
    return { inners, defs, css: CSS, missing, glyphs: glyphSet };
  }

  /**
   * The letters in some text as a set of shapes and advances (in font units),
   * with kerning between them, for text that a page lays out itself.
   * See trek-padd.js for the format. Only letters the text uses are included.
   */
  function letterSet(text, ctx) {
    const { font, upm, missing } = ctx;
    const chars = [...new Set(text.replace(/\s/g, " "))].sort();
    const glyphs = {};
    const index = new Map();
    for (const ch of chars) {
      const list = font.stringToGlyphs(ch);
      const g = list.length === 1 ? list[0] : null;
      if (!g || g.index === 0) {
        if (ch.trim()) missing.add(ch);
        continue;
      }
      const path = ch.trim() ? g.getPath(0, 0, upm).toPathData(1) : "";
      glyphs[ch] = path ? [g.advanceWidth, path] : [g.advanceWidth];
      index.set(ch, g);
    }
    const kern = {};
    for (const [a, ga] of index) {
      for (const [b, gb] of index) {
        const v = font.getKerningValue(ga, gb);
        if (v) kern[a + b] = v;
      }
    }
    // The baseline sits at (line height / 2 + mid) below a line's top, as the browser sets it.
    const m = lineMetrics(ctx, 1000, 1000);
    return { upm, mid: round((m.base - 500) / 1000, 4), glyphs, kern };
  }

  /**
   * Where text sits in a line of this font size and line height, measured the
   * way the browser lays it out (it rounds font metrics per size):
   *   top   from the top of the line to the top of a character's box
   *   base  from the top of the line to the baseline
   */
  function lineMetrics(ctx, fs, L) {
    const key = `${fs}|${L}`;
    if (ctx.metrics.has(key)) return ctx.metrics.get(key);
    const { d } = ctx;
    const probe = d.createElement("div");
    probe.style.cssText = `position:absolute;left:0;top:0;font-family:"${FAMILY}";font-size:${fs}px;` +
      `line-height:${L}px;white-space:pre;letter-spacing:0`;
    probe.innerHTML = 'H<i style="display:inline-block;width:0;height:0"></i>';
    d.body.append(probe);
    const range = d.createRange();
    range.selectNodeContents(probe.firstChild);
    const box = probe.getBoundingClientRect();
    const m = { top: range.getBoundingClientRect().top - box.top, base: probe.lastChild.getBoundingClientRect().top - box.top };
    probe.remove();
    ctx.metrics.set(key, m);
    return m;
  }

  /** The block that lays out this element's lines (the nearest ancestor that isn't inline). */
  function containerOf(el, root, win) {
    while (el !== root && /^(inline|contents)$/.test(win.getComputedStyle(el).display)) el = el.parentElement;
    return el;
  }

  function outlineRoot(root, ctx, { speak }) {
    const { d, win } = ctx;
    // Text nodes and inline dots, in document order, grouped by the block they flow in.
    const groups = new Map();
    const walker = d.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => n.nodeType === Node.ELEMENT_NODE && /^(SCRIPT|STYLE|TEXTAREA|TREK-PADD|svg)$/i.test(n.nodeName)
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const isText = n.nodeType === Node.TEXT_NODE;
      if (!isText && !n.classList.contains("lcars-dot")) continue;
      const box = containerOf(n.parentElement, root, win);
      if (!groups.has(box)) groups.set(box, []);
      groups.get(box).push(n);
    }
    const spoken = speak ? speech(root, win) : "";
    for (const [box, nodes] of groups) outlineBlock(box, nodes, ctx);
    if (spoken) {
      const sr = d.createElement("span");
      sr.className = "tx-sr";
      sr.textContent = spoken;
      root.prepend(sr);
    }
  }

  /** The piece's words for screen readers, with dots and line breaks read as spaces. */
  function speech(root, win) {
    let out = "";
    const walk = (node) => {
      for (const n of node.childNodes) {
        if (n.nodeType === Node.TEXT_NODE) out += n.data;
        else if (n.nodeType !== Node.ELEMENT_NODE || /^(SCRIPT|STYLE|TREK-PADD|svg)$/i.test(n.nodeName)) continue;
        else if (n.classList.contains("lcars-dot") || n.nodeName === "BR") out += " ";
        else {
          const block = !/^inline$/.test(win.getComputedStyle(n).display);
          if (block) out += " ";
          walk(n);
          if (block) out += " ";
        }
      }
    };
    walk(root);
    return out.replace(/\s+/g, " ").trim();
  }

  /** Measure every character and dot in one block, then replace its text with shapes. */
  function outlineBlock(box, nodes, ctx) {
    const { d, win } = ctx;
    const range = d.createRange();
    const items = [];

    for (const n of nodes) {
      if (n.nodeType !== Node.TEXT_NODE) {
        const cs = win.getComputedStyle(n);
        if (cs.display !== "inline-block") continue; // a flex item: placed without the baseline
        const fs = parseFloat(cs.fontSize);
        items.push({ kind: "dot", el: n, rect: n.getBoundingClientRect(), fs });
        continue;
      }
      const cs = win.getComputedStyle(n.parentElement);
      const fs = parseFloat(cs.fontSize);
      const L = parseFloat(cs.lineHeight) || fs * 1.2;
      const collapse = cs.whiteSpaceCollapse || (/^pre/.test(cs.whiteSpace) || cs.whiteSpace === "break-spaces"
        ? (cs.whiteSpace === "pre-line" ? "preserve-breaks" : "preserve") : "collapse");
      const upper = cs.textTransform === "uppercase";
      const spacing = parseFloat(cs.letterSpacing) || 0;
      const m = lineMetrics(ctx, fs, L);
      const data = n.data;
      for (let i = 0; i < data.length;) {
        const ch = String.fromCodePoint(data.codePointAt(i));
        range.setStart(n, i);
        range.setEnd(n, i + ch.length);
        i += ch.length;
        const space = /\s/.test(ch);
        if (ch === "\n" && collapse !== "collapse") {
          items.push({ kind: "nl", node: n });
          continue;
        }
        const rects = range.getClientRects();
        const r = rects.length ? rects[0] : range.getBoundingClientRect();
        if (space && r.width === 0) continue; // collapsed away
        items.push({
          kind: "ch", node: n, ch, space, fs, L, upper, spacing, base: m.base,
          left: r.left, right: r.right, lineTop: r.top - m.top,
        });
      }
    }

    // Which line each dot sits on.
    const chars = items.filter((it) => it.kind === "ch");
    for (const it of items) {
      if (it.kind !== "dot") continue;
      const mid = (it.rect.top + it.rect.bottom) / 2;
      const line = chars.find((c) => mid >= c.lineTop && mid <= c.lineTop + c.L);
      it.lineTop = line ? line.lineTop : null;
    }

    // Find soft line breaks, and drop the spaces that hang at the end of a wrapped line.
    let prev = null;
    const onLine = [];
    for (const it of items) {
      if (it.kind === "nl") {
        prev = null;
        onLine.length = 0;
        continue;
      }
      if (it.lineTop == null) continue;
      const tol = (it.L || it.fs) / 2;
      if (prev && Math.abs(it.lineTop - prev.lineTop) > tol) {
        it.breakBefore = true;
        for (let k = onLine.length - 1; k >= 0 && onLine[k].space; k--) onLine[k].drop = true;
        onLine.length = 0;
      }
      onLine.push(it);
      prev = it;
    }

    // Rewrite the text nodes.
    const byNode = new Map();
    for (const it of items) {
      if (it.kind === "dot") {
        if (it.breakBefore) it.el.before(d.createElement("br"));
        if (it.lineTop != null) {
          it.el.classList.add("tx-dot");
          it.el.style.setProperty("--dt", `${round((it.rect.top - it.lineTop) / it.fs, 4)}em`);
        }
        continue;
      }
      if (!byNode.has(it.node)) byNode.set(it.node, []);
      byNode.get(it.node).push(it);
    }
    for (const n of nodes) {
      if (n.nodeType !== Node.TEXT_NODE) continue;
      const list = byNode.get(n) || [];
      const out = [];
      let run = [];
      const flush = () => {
        if (run.length) out.push(...runNodes(run, ctx));
        run = [];
      };
      for (const it of list) {
        if (it.drop) continue;
        if (it.kind === "nl") {
          flush();
          out.push(d.createElement("br"));
          continue;
        }
        if (it.breakBefore) {
          flush();
          out.push(d.createElement("br"));
        }
        run.push(it);
      }
      flush();
      const parent = n.parentElement;
      // In a flex or grid box the text was one anonymous item; keep it as one.
      if (out.length > 1 && /flex|grid/.test(win.getComputedStyle(parent).display)) {
        const wrap = d.createElement("span");
        wrap.append(...out);
        n.replaceWith(wrap);
      } else {
        n.replaceWith(...out);
      }
    }

    box.classList.add("tx-o");
  }

  /** One line's worth of characters from one text node, as SVGs (and live text for missing letters). */
  function runNodes(run, ctx) {
    const { d, font, upm, glyphs, missing } = ctx;
    const out = [];
    let seg = [];
    const tpl = d.createElement("template");

    const emitSVG = () => {
      if (!seg.length) return;
      const first = seg[0], last = seg[seg.length - 1];
      const { fs, L } = first;
      const s = upm / fs;
      const w = last.right - first.left;
      const base = first.base * s;
      let uses = "";
      for (const c of seg) {
        if (c.space) continue;
        let x = (c.left - first.left) * s;
        for (const g of font.stringToGlyphs(c.upper ? c.ch.toUpperCase() : c.ch)) {
          if (!glyphs.has(g.index)) glyphs.set(g.index, g.getPath(0, 0, upm).toPathData(1));
          uses += `<use href="#tg${g.index}" x="${round(x, 1)}" y="${round(base, 1)}"/>`;
          x += (g.advanceWidth || 0) + c.spacing * s;
        }
      }
      tpl.innerHTML = `<svg class="tx" aria-hidden="true" viewBox="0 0 ${round(w * s, 1)} ${round(L * s, 1)}" ` +
        `style="width:${round(w / fs, 4)}em;height:${round(L / fs, 4)}em">${uses}</svg>`;
      out.push(tpl.content.firstChild);
      seg = [];
    };

    for (const c of run) {
      const text = c.upper ? c.ch.toUpperCase() : c.ch;
      const known = c.space || font.stringToGlyphs(text).every((g) => g.index !== 0);
      if (known) {
        seg.push(c);
        continue;
      }
      // Not in the font: the browser drew it from another font, so keep it as live text.
      emitSVG();
      missing.add(c.ch);
      const live = d.createElement("span");
      live.className = "tx-live";
      live.textContent = c.ch;
      live.style.cssText = `width:${round((c.right - c.left) / c.fs, 4)}em;height:${round(c.L / c.fs, 4)}em;` +
        `line-height:${round(c.L / c.fs, 4)}em`;
      out.push(live);
    }
    emitSVG();
    return out;
  }

  window.lcarsOutline = { getFont, chooseFont, forget, outline, get font() { return cached; }, esc };
})();
