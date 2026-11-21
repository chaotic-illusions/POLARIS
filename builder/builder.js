/* POLARIS: place LCARS pieces on a snapping grid and export a page. */
(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   * Palette and piece types
   * ------------------------------------------------------------------ */

  /*
   * Every LCARS color comes from ../palette-data.js. All of them can be used by
   * name; the color pickers show the ones enabled in Preferences (your picks
   * unless you change them). Aliases such as "honey" resolve to the first name.
   */
  const { PICKS, GROUPS, ERAS } = window.LCARS_PALETTES;
  const ALL_COLORS = window.LCARS_PALETTES.allColors();
  const HEX = new Map();
  for (const c of ALL_COLORS) for (const n of c.names) HEX.set(n, c.hex);
  const NAMES = new Set(HEX.keys());

  // Storage keys keep the project's old name, so renaming it to POLARIS lost nobody's saved work.
  const PREFS_KEY = "trektext-builder:colors";
  /** Color sets kept in this browser: { mine: [names] (your picks), sets: [{ name, colors }] }. */
  const SETS_KEY = "trektext-builder:color-sets";
  let sets = loadSets();
  function loadSets() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETS_KEY));
      if (saved && typeof saved === "object") {
        return {
          mine: Array.isArray(saved.mine) ? saved.mine.filter((n) => NAMES.has(n)) : null,
          sets: Array.isArray(saved.sets) ? saved.sets.filter((s) => s && typeof s.name === "string" && Array.isArray(s.colors))
            .map((s) => ({ name: s.name, colors: s.colors.filter((n) => NAMES.has(n)) })) : [],
        };
      }
    } catch { /* storage unavailable */ }
    return { mine: null, sets: [] };
  }
  function saveSets() {
    try { localStorage.setItem(SETS_KEY, JSON.stringify(sets)); } catch { /* storage unavailable */ }
  }
  /** Your picks: the set you saved as yours, or the POLARIS picks until you do. */
  const myPicks = () => sets.mine ?? PICKS;
  let enabled = loadEnabled();
  function loadEnabled() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY));
      if (Array.isArray(saved)) return new Set(saved.filter((n) => NAMES.has(n)));
    } catch { /* storage unavailable */ }
    return new Set(myPicks());
  }
  function saveEnabled() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify([...enabled])); } catch { /* storage unavailable */ }
  }
  const isOn = (c) => c.names.some((n) => enabled.has(n));
  /** [name, hex] for each enabled color, grouped by family. */
  const palette = () => ALL_COLORS.filter(isOn).map((c) => [c.name, c.hex]);

  /** The 2002 applet's letter codes, converted when a page from an older version is opened. */
  const LEGACY = {
    r: "chestnut-rose", o: "sandy-brown", O: "atomic-tangerine", y: "tanoi",
    b: "melrose", B: "blue-bell", p: "lilac", P: "hopbush",
  };
  /** Before version 2, the builder's alert reds and yellows had these short names. */
  const RENAMED = { "red-alert": "red-alert-2", "yellow-alert": "yellow-alert-2" };
  const DOC_VERSION = 5;

  /** The gauge pointer's pale cream (no palette color is this light). */
  const POINTER = "#F4F6D8";
  const LABELLED = { label: "", tcolor: "", fs: 17, halign: "center", valign: "middle", fit: false };
  const TYPES = {
    block: { w: 20, h: 4, color: "blue-bell", ends: "none", ...LABELLED, halign: "right", valign: "bottom" },
    button: { w: 11, h: 4, color: "atomic-tangerine", ends: "both", ...LABELLED, label: "000-000", href: "", hover: "", active: "", beep: "key" },
    elbow: { w: 38, h: 16, color: "chestnut-rose", corner: "tl", side: 25, bar: 4, rx: 11, ry: 8, ri: 4, ...LABELLED, halign: "right", valign: "bottom" },
    text: { w: 12, h: 4, ...LABELLED, tcolor: "atomic-tangerine", label: "Title", fs: 22, halign: "left", fit: true, wrap: false },
    padd: { w: 60, h: 30, fs: 24, hold: 16, tcolor: "", text: "##{melrose}INCOMING TRANSMISSION\n\n##{tanoi}TYPE YOUR TEXT IN THE PROPERTIES PANEL." },
    image: { w: 40, h: 20, src: "", alt: "", imgMode: "fit", zoom: 1, px: 50, py: 50, ratio: 0, border: "", caption: "", tcolor: "melrose", fs: 15 },
    frame: {
      w: 70, h: 44, variant: "bracket-left", title: "U.S.S. Enterprise", caption: "NCC-1701-D", color: "sandy-brown",
      color2: "tanoi", color3: "chestnut-rose", tcolor: "", fs: 24, bar: 3,
      src: "", alt: "", imgMode: "crop", zoom: 1, px: 50, py: 50, ratio: 0,
    },
    quote: {
      w: 60, h: 8, color: "lilac", tcolor: "melrose", fs: 16,
      text: "\"THE FIRST DUTY OF EVERY STARFLEET OFFICER IS TO THE TRUTH.\"\n##{tanoi}- CAPTAIN JEAN-LUC PICARD",
    },
    textbar: { w: 60, h: 4, label: "Hello World", titlePos: "start", color: "sandy-brown", color2: "chestnut-rose", tcolor: "golden-tanoi", fs: 24 },
    list: { w: 40, h: 8, color: "lilac", tcolor: "melrose", fs: 16, text: "First item in a list\nSecond list item\n##{tanoi}Third item" },
    cascade: { w: 50, h: 14, columns: 12, color: "sandy-brown", color2: "frozen-pond", fs: 11, numMotion: "scroll", highlights: "fixed", seed: 47 },
    gauge: {
      w: 12, h: 40, side: "left", tcolor: "", fs: 17,
      numbers: "count", from: 10, step: 10, count: 9, digits: 3, ticks: 1, labels: "",
      color: "orange-peel", color2: "chestnut-rose", color3: "tanoi", scolor: "atomic-tangerine", dcolor: POINTER,
      pointer: true, animate: true, seed: 3,
    },
    wave: {
      w: 40, h: 24, color: "chestnut-rose", color2: "tamarillo", grad: "lines", fade: true, shape: "diamond", lines: 48, thick: 50,
      motion: "voice", speed: 1, bracket: true, color3: "andorian-blue", acolor: "flat-dark-earth", acolor2: "husk", acolor3: "blue-bell",
      blocks: "even", seed: 1, mirror: false,
    },
    insignia: { w: 20, h: 21, color: "golden-tanoi", alt: "" },
  };
  const HAS_LABEL = new Set(["block", "button", "elbow", "text"]);

  /** Where the builder keeps your work: the site (all pages), and before sites, a single page. */
  /**
   * In the app, each window has its own project and keeps its own work, as in
   * VS Code: its keys carry the window's label. The first window ("main", and
   * the builder in a browser) keeps the original keys, so work kept before
   * windows existed is still there.
   */
  const WIN = window.__TAURI__?.window?.getCurrentWindow?.().label ?? "main";
  const slotKey = (key) => (WIN === "main" ? key : `${key}@${WIN}`);
  const SITE_KEY = slotKey("trektext-builder:site");
  const STORAGE_KEY = WIN === "main" ? "trektext-builder:v1" : null;
  const SITE_VERSION = 1;
  const LIB_FILES = { "lcars/palette.css": "../lcars/palette.css", "lcars/pieces.css": "../lcars/pieces.css", "lcars/pieces.js": "../lcars/pieces.js", "lcars/waveform.js": "../lcars/waveform.js", "lcars/flow.js": "../lcars/flow.js", "lcars/trek-padd.js": "../trek-padd.js",
    // The opening's power-up (lcars/flow.js plays them).
    "lcars/sounds/powerup.mp3": "../lcars/sounds/powerup.mp3", "lcars/sounds/press-key2.mp3": "../lcars/sounds/press-key2.mp3", "lcars/sounds/press-tap.mp3": "../lcars/sounds/press-tap.mp3", "lcars/sounds/press-chirp.mp3": "../lcars/sounds/press-chirp.mp3", "lcars/sounds/processing.mp3": "../lcars/sounds/processing.mp3", "lcars/sounds/processing3.mp3": "../lcars/sounds/processing3.mp3",
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  /** A palette name or #RRGGBB, as CSS; anything else (from a file made elsewhere) is left out. */
  const isColor = (c) => c === "" || NAMES.has(c) || /^#[0-9a-f]{6}$/i.test(c);
  const colorValue = (c) => (!c || !isColor(c) ? "" : c.startsWith("#") ? c : `var(--lcars-${c})`);
  /** A link that can't run script: javascript:, data: and vbscript: URLs are dropped. */
  const safeHref = (h) => {
    const s = String(h ?? "");
    return /^(javascript|data|vbscript):/i.test(s.replace(/[\s\u0000-\u001f]+/g, "")) ? "" : s;
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const num = (n) => Math.round(n * 1000) / 1000;

  /* ------------------------------------------------------------------ *
   * Label markup
   *
   *   ##{name}  an LCARS color     ##{#RRGGBB}  any color     ##{}  default
   *   *         a small dot (\* for a real asterisk); newlines are kept
   * ------------------------------------------------------------------ */

  const LITERAL_STAR = "";
  const DOT = '<i class="lcars-dot"></i>';

  function parseLabel(markup) {
    const s = String(markup ?? "");
    const runs = [];
    let color = "";
    let buf = "";
    const flush = () => {
      if (buf) runs.push({ text: buf, color });
      buf = "";
    };
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "\\" && s[i + 1] === "*") { buf += LITERAL_STAR; i++; continue; }
      if (s.startsWith("##{", i) && s.indexOf("}", i) > 0) {
        const end = s.indexOf("}", i);
        const name = s.slice(i + 3, end).trim().toLowerCase();
        flush();
        color = NAMES.has(name) || /^#[0-9a-f]{6}$/.test(name) ? name : "";
        i = end;
        continue;
      }
      buf += s[i];
    }
    flush();
    return runs;
  }

  /** Runs to HTML. In edit mode dots stay as "*" so the text can be typed naturally. */
  function runsHTML(runs, { edit = false } = {}) {
    return runs.map(({ text, color }) => {
      let html = esc(text);
      html = edit
        ? html.replace(new RegExp(LITERAL_STAR, "g"), "\\*")
        : html.replace(/ ?\* ?/g, DOT).replace(new RegExp(LITERAL_STAR, "g"), "*");
      if (!color) return html;
      const attrs = color.startsWith("#") ? `style="color:${color}"` : `class="t-${color}"`;
      return `<span ${attrs}${edit ? ` data-c="${color}"` : ""}>${html}</span>`;
    }).join("");
  }

  const labelHTML = (markup) => runsHTML(parseLabel(markup));
  const stripCodes = (markup) => String(markup ?? "").replace(/##\{[^}]*\}/g, "");

  /** Read an edited label back into markup. */
  function serialize(root) {
    let out = "";
    let current = "";
    const walk = (node, color) => {
      for (const n of node.childNodes) {
        if (n.nodeType === Node.TEXT_NODE) {
          const t = n.data.replace(/​/g, "");
          if (!t) continue;
          if (color !== current) { out += `##{${color}}`; current = color; }
          out += t;
        } else if (n.nodeName === "BR") {
          out += "\n";
        } else if (n.nodeType === Node.ELEMENT_NODE) {
          if (/^(DIV|P)$/.test(n.nodeName) && out && !out.endsWith("\n")) out += "\n";
          walk(n, n.hasAttribute("data-c") ? n.getAttribute("data-c") : color);
        }
      }
    };
    walk(root, "");
    return out.replace(/\n+$/, "");
  }

  /* ------------------------------------------------------------------ *
   * Rendering (shared by the canvas, preview and export)
   * ------------------------------------------------------------------ */

  /** The unrotated size of a piece's body, in cells. */
  const dims = (p) => ((p.rot || 0) % 180 ? { iw: p.h, ih: p.w } : { iw: p.w, ih: p.h });
  /** Pieces that turn (their panel's Shape has Turn); others only clear rotation left from old saves. */
  const TURNABLE = new Set(["wave", "gauge"]);

  function pieceClasses(p) {
    const cls = ["piece", `p-${p.type}`];
    if (p.ends && p.ends !== "none") cls.push(`ends-${p.ends}`);
    if (p.type === "elbow") cls.push(`corner-${p.corner}`);
    if (p.rot) cls.push(`rot-${p.rot}`);
    if (p.halign && p.halign !== "center") cls.push(`h-${p.halign}`);
    if (p.valign && p.valign !== "middle") cls.push(`v-${p.valign}`);
    if (p.type === "image" && !p.src) cls.push("empty");
    if (p.type === "image" && p.border) cls.push("bordered");
    if (p.type === "image" || p.type === "frame") cls.push(`img-${p.imgMode || "fit"}`);
    if ((p.type === "image" || p.type === "frame") && p.turn) cls.push(`pic-${p.turn}`);
    if (p.type === "frame") cls.push(`f-${p.variant}`);
    if (p.type === "gauge" && p.pointer !== false && p.animate) cls.push("animate");
    if (p.type === "gauge" && p.side === "right") cls.push("g-right"); // turned, its numbers stand up on the other side
    if (p.type === "cascade") {
      const m = cascadeMotion(p);
      if (m === "scroll") cls.push("animate");
      else if (m !== "still") cls.push(`cm-${m}`); // driven by lcars/pieces.js
      if (cascadeHighlights(p) === "move") cls.push("cm-hl"); // highlights that come and go (lcars/pieces.js)
    }
    if (p.type === "text" && p.wrap) cls.push("wrap");
    if (p.blink && p.blink !== "none") cls.push(`blink-${p.blink}`, ...(p.blinkTo ? ["blink-to"] : []));
    return cls.join(" ");
  }

  function pieceVars(p) {
    const { iw, ih } = dims(p);
    const v = { "--x": p.x, "--y": p.y, "--w": p.w, "--h": p.h };
    if (p.rot) Object.assign(v, { "--iw": iw, "--ih": ih, "--rot": p.rot });
    if (p.color) v["--c"] = colorValue(p.color);
    if (p.hover) v["--c-hover"] = colorValue(p.hover);
    if (p.active) v["--c-active"] = colorValue(p.active);
    if (p.fs) v["--fs"] = p.fs;
    if (p.type === "elbow") Object.assign(v, { "--S": p.side, "--B": p.bar });
    if ((p.type === "image" || p.type === "frame") && p.imgMode === "crop") {
      Object.assign(v, { "--zoom": p.zoom ?? 1, "--px": p.px ?? 50, "--py": p.py ?? 50 });
    }
    if (p.color3) v["--c3"] = colorValue(p.color3);
    if (p.tcolor) v["--tc"] = colorValue(p.tcolor);
    if (p.color2) v["--c2"] = colorValue(p.color2);
    if (p.border) v["--bc"] = colorValue(p.border);
    if (p.type === "frame") v["--fb"] = p.bar;
    if (p.scolor) v["--sc"] = colorValue(p.scolor);
    if (p.dcolor) v["--dc"] = colorValue(p.dcolor);
    // Blinking to a color: the keyframes swap between the piece's own colors (--c-on, --tc-on) and it.
    if (p.blinkTo && p.blink && p.blink !== "none") {
      v["--c-blink"] = colorValue(p.blinkTo);
      if (v["--c"]) v["--c-on"] = v["--c"];
      if (v["--tc"]) v["--tc-on"] = v["--tc"];
    }
    return v;
  }

  function elbowSVG(p, cell) {
    const { iw, ih } = dims(p);
    const W = iw * cell, H = ih * cell;
    const S = clamp(p.side, 1, iw - 1) * cell;
    const B = clamp(p.bar, 1, ih - 1) * cell;
    const rx = clamp(p.rx * cell, 0, S);
    const ry = clamp(p.ry * cell, 0, H - B);
    const ri = clamp(p.ri * cell, 0, Math.min(W - S, H - B));
    const d = `M${num(rx)},0 H${W} V${B} H${num(S + ri)} A${num(ri)},${num(ri)} 0 0 0 ${S},${num(B + ri)} ` +
      `V${H} H0 V${num(ry)} A${num(rx)},${num(ry)} 0 0 1 ${num(rx)},0 Z`;
    const flip = { tl: "", tr: `matrix(-1 0 0 1 ${W} 0)`, bl: `matrix(1 0 0 -1 0 ${H})`, br: `matrix(-1 0 0 -1 ${W} ${H})` }[p.corner];
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"${flip ? ` transform="${flip}"` : ""}/></svg>`;
  }

  /**
   * A block's or button's color, drawn as SVG the way an elbow is. Where a
   * block meets an elbow, both edges are then drawn the same way at any screen
   * size: a CSS box's edges round to whole pixels and an SVG's don't, which
   * left a 1-2 px step between them. The ends are rounded as before (a half
   * circle across the short side).
   */
  function fillSVG(p, cell) {
    const { iw, ih } = dims(p);
    const W = iw * cell, H = ih * cell, r = Math.min(W, H) / 2;
    const [tl, tr, br, bl] = { left: [r, 0, 0, r], right: [0, r, r, 0], both: [r, r, r, r], top: [r, r, 0, 0], bottom: [0, 0, r, r] }[p.ends] || [0, 0, 0, 0];
    const arc = (rad, x, y) => (rad ? ` A${num(rad)},${num(rad)} 0 0 1 ${num(x)},${num(y)}` : "");
    const d = `M${num(tl)},0 H${num(W - tr)}${arc(tr, W, tr)} V${num(H - br)}${arc(br, W - br, H)} ` +
      `H${num(bl)}${arc(bl, 0, H - bl)} V${num(tl)}${arc(tl, tl, 0)} Z`;
    return `<svg class="p-shape" viewBox="0 0 ${num(W)} ${num(H)}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
  }

  /** Where the two elbow handles sit, in body cells. */
  function elbowHandlePoints(p) {
    const { iw, ih } = dims(p);
    const S = clamp(p.side, 1, iw - 1), B = clamp(p.bar, 1, ih - 1);
    const left = p.corner[1] === "l", top = p.corner[0] === "t";
    return {
      side: { x: left ? S : iw - S, y: top ? (B + ih) / 2 : (ih - B) / 2 },
      bar: { x: left ? (S + iw) / 2 : (iw - S) / 2, y: top ? B : ih - B },
    };
  }

  /** A picture, turned inside its box when the piece says so (pieces.css turns .pic-turn). */
  const turned = (p, img) => (p.turn ? `<span class="pic-turn">${img}</span>` : img);

  /** An image frame in one of four layouts. Its inside holds the picture. */
  function frameHTML(p, ctx) {
    const src = (ctx.imageURL && ctx.imageURL(p)) || p.src;
    const alt = p.alt || stripCodes(p.title);
    const img = `<span class="f-outline"></span><div class="f-img${src ? "" : " empty"}">` +
      `${src ? turned(p, `<img src="${esc(src)}" alt="${esc(alt)}">`) : ""}</div>`;
    const text = (t) => (t ? `<span class="f-text">${labelHTML(t)}</span>` : "");
    const seg = (cls) => `<span class="f-seg${cls ? ` ${cls}` : ""}"></span>`;
    const detail = seg("c3") + seg("c2") + seg("sliver") + seg("sliver"); // accents along the bottom
    switch (p.variant) {
      case "bracket-right":
        return `<span class="f-bracket r"></span><span class="f-notch r"></span>` +
          `<div class="f-row top"><span class="f-cap l"></span>${text(p.title)}${seg()}</div>` +
          `<div class="f-row bottom"><span class="f-cap l"></span>${text(p.caption)}${seg()}` +
          `${seg("sliver")}${seg("sliver")}${seg("c2")}${seg("c3")}</div>${img}`;
      case "twin":
        return `<span class="f-bracket l"></span><span class="f-bracket r"></span><span class="f-notch l"></span><span class="f-notch r"></span>` +
          `<div class="f-row top">${text(p.title)}${seg()}</div>` +
          `<div class="f-row bottom">${detail}${seg()}${text(p.caption)}</div>${img}`;
      case "viewscreen":
        return `<span class="f-corner tl"></span><span class="f-corner tr"></span><span class="f-corner bl"></span><span class="f-corner br"></span>` +
          `<div class="f-row top">${text(p.title)}${seg()}${seg("c2")}</div>` +
          `<div class="f-row bottom">${detail}${seg()}${text(p.caption)}</div>${img}`;
      default: // bracket-left
        return `<span class="f-bracket l"></span><span class="f-notch l"></span>` +
          `<div class="f-row top">${seg()}${text(p.title)}<span class="f-cap r"></span></div>` +
          `<div class="f-row bottom">${detail}${seg()}${text(p.caption)}<span class="f-cap r"></span></div>${img}`;
    }
  }

  /** How far the picture sits from each edge of an Image or Frame piece, in cells (matches pieces.css). */
  function imageInsets(p) {
    if (p.type === "image") return { l: 0, r: 0, t: 0, b: p.caption ? (p.fs || 15) / doc.cell + 0.5 : 0 };
    const near = (p.bar || 3) + 1.75, far = 1.75;
    switch (p.variant) {
      case "bracket-right": return { l: far, r: near, t: near, b: near };
      case "twin":
      case "viewscreen": return { l: near, r: near, t: near, b: near };
      default: return { l: near, r: far, t: near, b: near };
    }
  }

  /**
   * "Keep image shape": size the piece so its picture area matches the image's
   * proportions. anchor "w" keeps the width (and the bottom edge if fromTop),
   * "h" keeps the height. Returns true if anything changed.
   */
  function applyAspect(p, anchor = "w", fromTop = false) {
    if (p.imgMode !== "keep" || !p.ratio) return false;
    const ratio = (p.turn || 0) % 180 ? 1 / p.ratio : p.ratio; // turned on its side, the picture is the other shape
    const i = imageInsets(p);
    const before = `${p.x},${p.y},${p.w},${p.h}`;
    if (anchor === "h") {
      p.w = Math.max(1, Math.round((p.h - i.t - i.b) * ratio + i.l + i.r));
    } else {
      const bottom = p.y + p.h;
      p.h = Math.max(1, Math.round((p.w - i.l - i.r) / ratio + i.t + i.b));
      if (fromTop) p.y = Math.max(0, bottom - p.h);
    }
    return `${p.x},${p.y},${p.w},${p.h}` !== before;
  }

  /** Small seeded random generator, so a cascade looks the same in the builder and on the page. */
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * How a Number Cascade moves: scroll, fill, shift, update or still.
   * Cascades from before the choice had a "Flowing numbers" tick (animate).
   */
  const cascadeMotion = (p) => p.numMotion || (p.animate === false ? "still" : "scroll");
  /** Which numbers are highlighted: fixed by the Pattern, coming and going, or none (earlier cascades had a tickbox). */
  const cascadeHighlights = (p) => p.highlights || (p.hlMove ? "move" : "fixed");

  /**
   * Columns of numbers. Scrolling columns hold two copies and loop (pure CSS);
   * the other motions are lcars/pieces.js working on the rows that fit.
   */
  function cascadeHTML(p, cell) {
    const { ih } = dims(p);
    const scroll = cascadeMotion(p) === "scroll";
    const fit = (ih * cell) / ((p.fs || 11) * 1.2);
    const rows = Math.max(1, scroll ? Math.ceil(fit) + 1 : Math.floor(fit));
    const cols = [];
    for (let c = 0; c < Math.max(1, p.columns || 12); c++) {
      const r = seeded((p.seed || 1) * 1009 + c * 31);
      const width = 1 + Math.floor(r() * 7);
      const cells = [];
      for (let i = 0; i < rows; i++) {
        const len = Math.max(1, width - Math.floor(r() * 3));
        const n = String(Math.floor(r() * 10 ** len)).padStart(r() < 0.35 ? len : 1, "0");
        // Fixed highlights from the pattern, unless they come and go (lcars/pieces.js lights them).
        const lit = r() < 0.08 && cascadeHighlights(p) === "fixed";
        cells.push(lit ? `<span class="hl">${n}</span>` : `<span>${n}</span>`);
      }
      const list = cells.join("");
      cols.push(`<div class="cc">${list}${scroll ? list : ""}</div>`);
    }
    return cols.join("");
  }

  /** Marked-up text split into lines, keeping each color running on from line to line. */
  function labelLines(markup) {
    const lines = [[]];
    for (const run of parseLabel(markup)) {
      run.text.split("\n").forEach((text, i) => {
        if (i) lines.push([]);
        if (text) lines[lines.length - 1].push({ text, color: run.color });
      });
    }
    return lines;
  }

  /** Cells a gauge gives up when its pointer is hidden. */
  const POINTER_ROOM = 2;

  /** Showing or hiding a gauge's pointer: grow or shrink the piece so the bracket stays put. */
  function resizeForPointer(p, show) {
    const d = show ? POINTER_ROOM : -POINTER_ROOM;
    const rot = p.rot || 0;
    // Where the pointer is on screen: at the start (left, or top when turned) or the end.
    const atStart = (p.side === "right") !== rot >= 180;
    if (rot % 180) {
      p.h = Math.max(4, p.h + d);
      if (atStart) p.y -= d;
      p.y = Math.max(0, Math.min(p.y, doc.rows - p.h));
    } else {
      p.w = Math.max(4, p.w + d);
      if (atStart) p.x -= d;
      p.x = Math.max(0, Math.min(p.x, doc.cols - p.w));
    }
  }

  /** Most numbers a counted gauge scale shows. */
  const MAX_COUNT = 60;

  /**
   * A gauge's counted numbers, one per line: from, from + step, ... (count of
   * them), zero-padded to at least `digits` digits, with as many decimals as
   * the start or step has.
   */
  function countedLabels(p) {
    const decimals = (v) => (String(v).split(".")[1] || "").length;
    const from = Number(p.from) || 0, step = Number(p.step) || 0;
    const dec = Math.min(4, Math.max(decimals(from), decimals(step)));
    const count = clamp(Math.round(Number(p.count) || 1), 1, MAX_COUNT);
    const digits = clamp(Math.round(Number(p.digits) || 1), 1, 12);
    return Array.from({ length: count }, (_, i) => {
      const v = from + i * step;
      const [whole, frac] = Math.abs(v).toFixed(dec).split(".");
      const text = whole.padStart(digits, "0") + (frac ? `.${frac}` : "");
      return v < 0 && Number(text) !== 0 ? `-${text}` : text;
    }).join("\n");
  }

  /** A gauge's numbers: counted, or typed in (gauges from before counting are typed). */
  const gaugeLabels = (p) => (p.numbers === "count" ? countedLabels(p) : p.labels);

  /**
   * A gauge: a bracket with a numbered scale beside it and an oval pointer
   * inside it that swings up and down (see lcars/pieces.js). Drawn for numbers on the left and
   * mirrored for the right. The seed varies the scale's breaks, the accent
   * blocks and where the pointer starts.
   * Sizes are in cells (the SVG's units), so nothing stretches.
   */
  function gaugeHTML(p) {
    const { iw, ih } = dims(p);
    const lines = labelLines(gaugeLabels(p));
    const n = Math.max(1, lines.length);
    const k = clamp(Math.round(p.ticks ?? 1), 0, 9) + 1; // tick marks per number
    const r = seeded((p.seed || 1) * 7919 + 13);
    const f = (v) => num(v);

    // Across, for numbers on the left: numbers | ticks | ruler over the bracket's side | pointer.
    const DOT_W = 4.2, DOT_H = 2.1, GAP = 0.4;
    const T = 2.7, ARM = 2, ARM_T = 1.5, RO = 2.6, RI = 1; // bracket
    const RULER = 1.4, LINE = 0.15, TICK = 0.65, TICK_T = 0.22, BREAK = 0.22;
    const pointer = p.pointer !== false;
    // Room inside the bracket: the pointer, or just the arms (POINTER_ROOM cells less).
    const xi = iw - (pointer ? DOT_W + GAP : DOT_W + GAP - POINTER_ROOM); // inside edge of the bracket's side
    const xo = xi - T; // outside edge
    const xa = Math.min(iw, xi + ARM);
    const rx = xo - 0.1;
    const tickX = rx - TICK;
    const numRight = tickX - 0.3;

    // Down: the ruler fills the middle of the bracket.
    const top = ih * 0.155;
    const bottom = ih - top;
    const y0 = top + 0.25;
    const step = Math.max(0.5, (bottom - top - 2) / (n - 0.5));
    const tickY = (i) => y0 + (i * step) / k;
    const last = tickY(k * n - 1);

    const rect = (cls, x, y, w, h, extra = "") =>
      `<rect class="${cls}" x="${f(x)}" y="${f(y)}" width="${f(Math.max(0, w))}" height="${f(Math.max(0, h))}"${extra}/>`;
    let svg = `<path class="g-br" d="M${f(xa)},0 H${f(xo + RO)} A${RO},${RO} 0 0 0 ${f(xo)},${RO} V${f(ih - RO)} ` +
      `A${RO},${RO} 0 0 0 ${f(xo + RO)},${f(ih)} H${f(xa)} V${f(ih - ARM_T)} H${f(xi + RI)} A${RI},${RI} 0 0 1 ${f(xi)},${f(ih - ARM_T - RI)} ` +
      `V${f(ARM_T + RI)} A${RI},${RI} 0 0 1 ${f(xi + RI)},${ARM_T} H${f(xa)} Z"/>`;

    // Accent blocks down the inner half of the side: accent, second accent, accent.
    const a0 = ih * (0.2 + r() * 0.08), a1 = ih * (0.72 + r() * 0.08);
    const s1 = a0 + (a1 - a0) * (0.08 + r() * 0.3);
    const s2 = Math.min(a1 - 1, s1 + (a1 - a0) * (0.35 + r() * 0.2));
    const ax = xo + T / 2;
    svg += rect("g-bk", ax, a0 - BREAK, xi - ax, a1 - a0 + 2 * BREAK) +
      rect("g-a2", ax, a0, xi - ax, s1 - a0 - BREAK / 2) +
      rect("g-a3", ax, s1 + BREAK / 2, xi - ax, s2 - s1 - BREAK) +
      rect("g-a2", ax, s2 + BREAK / 2, xi - ax, a1 - s2 - BREAK / 2);

    // The ruler, broken into a few lengths between ticks, with k ticks per number
    // (the one beside it, and k - 1 between it and the next).
    const breaks = [];
    for (let i = 1; i < k * n - 2; i++) if (r() < 0.22 && !breaks.includes(i - 1)) breaks.push(i);
    const half = step / k / 2;
    const cuts = [top, ...breaks.flatMap((i) => [tickY(i) + half - BREAK / 2, tickY(i) + half + BREAK / 2]), bottom];
    for (let i = 0; i < cuts.length; i += 2) {
      svg += rect("g-rl", rx, cuts[i], RULER, cuts[i + 1] - cuts[i], ` stroke-width="${LINE}"`);
    }
    const tickT = Math.min(TICK_T, (step / k) * 0.4);
    for (let i = 0; i < k * n; i++) svg += rect("g-sc", tickX, tickY(i) - tickT / 2, TICK + LINE / 2, tickT);

    const right = p.side === "right";
    const mirror = right ? ` transform="matrix(-1 0 0 1 ${f(iw)} 0)"` : "";
    const nums = lines.map((runs, i) => {
      if (!runs.length) return "";
      const y = tickY(k * i) - step / 2;
      const place = `${right ? "left" : "right"}:calc(${f(iw - numRight)} * var(--k))`;
      return `<div class="g-num" style="${place};top:calc(${f(y)} * var(--k));height:calc(${f(step)} * var(--k))">` +
        `<span>${runsHTML(runs)}</span></div>`;
    }).join("");

    // Where the pointer rests, and its fixed path if lcars/pieces.js is missing
    // (with it, every swing gets a random height and speed).
    const stops = [0, 1, 2, 3].map(() => Math.round(5 + r() * 90));
    const track = !pointer ? "" : `<div class="g-track" style="${right ? "left" : "right"}:0;width:calc(${DOT_W} * var(--k));` +
      `top:calc(${f(y0)} * var(--k));height:calc(${f(last - y0)} * var(--k))">` +
      `<span class="g-dot" style="height:calc(${DOT_H} * var(--k));${stops.map((v, i) => `--p${i}:${v}`).join(";")}"></span></div>`;

    return `<svg viewBox="0 0 ${f(iw)} ${f(ih)}" preserveAspectRatio="none" aria-hidden="true"><g${mirror}>${svg}</g></svg>${nums}${track}`;
  }

  /** A Waveform: an <lcars-waveform> element (lcars/waveform.js) with the piece's settings as attributes. */
  function waveHTML(p) {
    const attrs = {
      color: p.color, color2: p.color2, gradient: p.grad, fade: p.fade, shape: p.shape, lines: p.lines,
      thickness: p.thick, motion: p.motion, speed: p.speed, bracket: p.bracket,
      ...(p.bracket ? { "bracket-color": p.color3, accent: p.acolor, accent2: p.acolor2, accent3: p.acolor3 } : {}),
      ...(p.bracket && p.blocks && p.blocks !== "even"
        ? { pattern: p.blocks === "random" ? "random" : Math.round(Number(p.seed) || 0), mirror: !!p.mirror } : {}),
    };
    const list = Object.entries(attrs).filter(([, v]) => v !== false && v != null && v !== "")
      .map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`));
    return `<lcars-waveform ${list.join(" ")}></lcars-waveform>`;
  }

  /** The Starfleet insignia (lcars/insignia.js, traced by tools/trace_badge.py), in one color. */
  function insigniaHTML(p) {
    const art = window.LCARS_INSIGNIA;
    if (!art) return "";
    const a11y = p.alt ? `role="img" aria-label="${esc(p.alt)}"` : `aria-hidden="true"`;
    return `<svg viewBox="${art.viewBox}" preserveAspectRatio="xMidYMid meet" ${a11y}><path d="${art.d}"/></svg>`;
  }

  /** Inner HTML for a piece: its rotating body and content. */
  function pieceInner(p, cell, ctx = {}) {
    const label = HAS_LABEL.has(p.type) && (p.label || ctx.editingId === p.id)
      ? `<span class="label"><span class="lt">${labelHTML(p.label)}</span></span>` : "";
    let body;
    switch (p.type) {
      case "elbow": {
        body = elbowSVG(p, cell) + label;
        if (ctx.handlesFor === p.id) {
          const pts = elbowHandlePoints(p);
          body += Object.entries(pts).map(([h, pt]) =>
            `<span class="hd ehd" data-h="${h}" title="${h === "side" ? "Sidebar width" : "Bar thickness"}" ` +
            `style="left:calc(${num(pt.x)} * var(--k));top:calc(${num(pt.y)} * var(--k))"></span>`).join("");
        }
        break;
      }
      case "padd": {
        const attrs = [`hold="${esc(p.hold)}"`, p.tcolor ? `color="${esc(p.tcolor)}"` : "", ctx.editing ? "muted" : "",
          ctx.glyphs ? `glyphs="${ctx.glyphs}"` : ""].filter(Boolean).join(" ");
        const text = String(p.text ?? "").replace(/<\/script/gi, "<\\/script");
        body = `<trek-padd ${attrs}><script type="text/plain">\n${text}\n</script></trek-padd>`;
        break;
      }
      case "image": {
        const src = (ctx.imageURL && ctx.imageURL(p)) || p.src;
        body = `<div class="img-box">${src ? turned(p, `<img src="${esc(src)}" alt="${esc(p.alt)}">`) : ""}</div>` +
          (p.caption ? `<div class="caption">${labelHTML(p.caption)}</div>` : "");
        break;
      }
      case "frame":
        body = frameHTML(p, ctx);
        break;
      case "quote":
        body = `<span class="q-bar"></span><div class="q-text">${labelHTML(p.text)}</div>`;
        break;
      case "textbar": {
        const title = p.label ? `<span class="tb-text">${labelHTML(p.label)}</span>` : "";
        const bar = `<span class="tb-bar"></span>`;
        body = `<span class="tb-cap l"></span>${p.titlePos === "end" ? bar + title : title + bar}<span class="tb-cap r"></span>`;
        break;
      }
      case "list":
        body = String(p.text ?? "").split("\n").filter((l) => l.trim()).map((l) => `<div class="li">${labelHTML(l)}</div>`).join("");
        break;
      case "cascade":
        body = cascadeHTML(p, cell);
        break;
      case "gauge":
        body = gaugeHTML(p);
        break;
      case "wave":
        body = waveHTML(p);
        break;
      case "insignia":
        body = insigniaHTML(p);
        break;
      case "block":
      case "button":
        body = fillSVG(p, cell) + label;
        break;
      default:
        body = label;
    }
    return `<div class="body">${body}</div>`;
  }

  /* ------------------------------------------------------------------ *
   * Document state, history and storage
   * ------------------------------------------------------------------ */

  /**
   * The site: { version, current, nextPage, pages: [page, ...] }. Each page is
   * a document with its own pieces, plus a stable id (pid) and a file name
   * (file, without ".html"). `doc` is the page being edited.
   */
  let site = null;
  let doc = null;
  let selectedId = null;
  /**
   * More pieces picked along with selectedId (Shift-click, or a box dragged on
   * the board); empty when one piece or none is selected. With several picked,
   * selected() is null: the one-piece tools (panel, handles) stand aside.
   */
  const also = new Set();
  let editing = null; // { id, el, original } while a label is edited on the board
  const undoStack = [];
  const redoStack = [];
  const attached = new Map(); // "images/name" -> { file, url } for pictures picked from disk or opened with a project
  /** Pictures picked from disk show from memory in the builder and previews. */
  const imageURLFor = (page) => (p) => attached.get(p.src)?.url;

  const snapshot = () => JSON.stringify(site);
  /**
   * Screen presets: the page area (viewport) of a maximized browser window on
   * Windows 11, with tabs, toolbar and bookmarks bar shown (about 113 CSS px)
   * and the taskbar visible (48 CSS px). Sizes are CSS px at the given display
   * scaling. The 4K / 125% entry was measured from a real Firefox window.
   *
   * All presets are 108 rows high, so text keeps the same size relative to the
   * screen height; only the width (and so the shape) changes.
   */
  const ROWS = 108;
  const SCREENS = [
    { id: "4k-125", cols: 212, name: "4K at 125% · 3072×1567" },
    { id: "4k-150", cols: 216, name: "4K at 150% or 1440p · 2560×1279" },
    { id: "1080p", cols: 226, name: "1080p at 100% · 1920×919" },
    { id: "1080p-125", cols: 236, name: "1080p laptop at 125% · 1536×703" },
    { id: "1200p", cols: 200, name: "1920×1200 at 100% · 1920×1039" },
    { id: "ultrawide", cols: 290, name: "Ultrawide 3440×1440 · 3440×1279" },
    { id: "fullscreen", cols: 192, name: "Full screen 16:9 (F11 or kiosk)" },
    { id: "classic", cols: 166, name: "Classic builder page" },
  ].map((s) => ({ rows: ROWS, ...s }));
  /** The viewport of the window the builder is open in right now. */
  const thisWindow = () => ({
    id: "window", rows: ROWS, cols: Math.round((ROWS * innerWidth) / innerHeight),
    name: `This window · ${innerWidth}×${innerHeight}`,
  });
  const blankDoc = () => ({
    version: DOC_VERSION, title: "LCARS Page", cols: SCREENS[0].cols, rows: ROWS, cell: 6, textShapes: true, flow: "console", sound: false, nextId: 1, pieces: [],
  });

  /*
   * The desktop app (../desktop, built with Tauri) does the file work natively:
   * Open, Save and Save As dialogs, export to a folder, a preview window, and a
   * remembered font. In a browser, these fall back to what browsers allow.
   */
  const APP = window.__TAURI__ ?? null;
  const appCall = (cmd, args) => APP.core.invoke(cmd, args);
  /*
   * The designer's builder may use the start screen's own features (the power-up):
   * the app's debug build, and the builder run from the source in a browser. The
   * release app never offers them, whatever a project's file is called.
   */
  let designer = !APP;
  /** Settles once the app has said which build it is (at once in a browser). */
  const designerKnown = APP ? appCall("designer").then((on) => { designer = on === true; }).catch(() => {}) : Promise.resolve();

  /** The LCARS font, for drawing exported text as shapes. Never published (see .gitignore). */
  const FONT_URL = "../fonts/Helvetica Ultra Compressed.otf";
  /** Where the font comes from: the app's font folder, or the project's fonts folder. */
  const fontSource = () => (APP
    ? { load: () => appCall("read_font").catch(() => null), source: "the app's font folder" }
    : { url: FONT_URL });
  /** In the app, the font isn't packaged, so the builder's own screen loads it from the app's font folder. */
  async function useAppFont() {
    if (!APP) return;
    try {
      const face = new FontFace("Helvetica Ultra Compressed", await appCall("read_font"));
      document.fonts.add(await face.load());
      refit();
    } catch { /* no font yet: Antonio stands in */ }
  }
  const FONT_PS_NAMES = ["Helvetica-UltraCompressed"];

  /** A page from a file or storage, brought up to date (not yet shown). */
  function preparePage(d) {
    if (!d || !Array.isArray(d.pieces)) throw new Error("Not a builder file");
    const doc = Object.assign(blankDoc(), structuredClone(d));
    if (!("flow" in d)) doc.flow = "none"; // pages from before openings just appear, as they did
    if (!("sound" in d)) doc.sound = false;
    const version = doc.version || 1;
    for (const p of doc.pieces) {
      if (version < 2) upgradePiece(p);
      if (version < 3 && p.type === "text" && p.color && !p.tcolor) p.tcolor = p.color;
      // Version 3 kept the Opening step in "step", which a gauge uses for its numbers: it has its own field now.
      if (version < 4 && p.type !== "gauge" && "step" in p) {
        p.openStep = p.step;
        delete p.step;
      }
      // Version 4 buttons beeped (the PADD's beep) or didn't: they now choose a sound, and the beep becomes a button's keypress.
      if (version < 5 && p.type === "button") p.beep = p.beep === false ? "none" : "key";
      // Older saves: labels used "•"/"·" for dots and had no rotation.
      if (typeof p.label === "string") p.label = p.label.replace(/\s*[•·]\s*/g, " * ");
      p.rot ||= 0;
      if ((p.type === "image" || p.type === "frame") && !p.imgMode) p.imgMode = p.fit === "contain" ? "fit" : "crop";
      if (p.type === "frame") p.color3 ||= "chestnut-rose";
    }
    doc.version = DOC_VERSION;
    cleanPage(doc);
    return doc;
  }

  /*
   * Files are untrusted. A .lcars or site.json made elsewhere is written into
   * HTML and CSS here, in previews and in published pages, so before a page is
   * shown every field is brought back to something the builder itself would
   * write: numbers are numbers, choices are one of their options, colors are a
   * palette name or #RRGGBB, ids are p<number>, and links can't run script.
   */
  const COLOR_KEYS = ["color", "color2", "color3", "tcolor", "hover", "active", "border", "scolor", "dcolor", "acolor", "acolor2", "acolor3", "blinkTo"];
  /** Choices that become class names: a piece type that doesn't offer one doesn't keep it. */
  const CLASS_KEYS = ["ends", "halign", "valign", "imgMode", "variant", "blink"];
  const finite = (v, fallback) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Number(v) : fallback);
  /**
   * Ask OK or Cancel, and wait for the answer. In the app, the dialog plugin
   * replaces confirm() with one that returns a promise straight away (a native
   * dialog can't block the page), and a promise counts as true: so never use
   * confirm() bare; always `await ask(...)`. In a browser it's the usual confirm.
   */
  const ask = async (message) => (await window.confirm(message)) === true;

  /** A group's name as the builder keeps it: one line, capitals, at most 40 characters (blank: no group). */
  const groupName = (v) => (typeof v === "string" || typeof v === "number" ? String(v) : "").replace(/\s+/g, " ").trim().slice(0, 40).toUpperCase();
  /** The groups on a page, in the order their pieces come. */
  const groupsOf = (page = doc) => [...new Set(page.pieces.map((p) => p.group).filter(Boolean))];
  let choiceCache = null;
  /** For each piece type, the options of each choice field in its panel. */
  function choicesFor(type) {
    if (!choiceCache) {
      choiceCache = {};
      for (const [t, sections] of Object.entries(SECTIONS)) {
        const map = (choiceCache[t] = { rot: [0, 90, 180, 270] });
        if (t === "elbow") map.corner = ["tl", "tr", "bl", "br"];
        for (const [, fields] of sections) for (const [key, , kind] of fields) if (Array.isArray(kind)) map[key] = kind;
      }
    }
    return choiceCache[type] || {};
  }

  function cleanPiece(p) {
    const defaults = { x: 0, y: 0, w: 1, h: 1, rot: 0, ...TYPES[p.type] };
    const choices = choicesFor(p.type);
    for (const key of CLASS_KEYS) if (key in p && !choices[key]) delete p[key];
    for (const [key, value] of Object.entries(p)) {
      if (key === "id" || key === "type") continue;
      const fallback = defaults[key];
      if (choices[key]) {
        if (!choices[key].includes(value)) {
          if (fallback === undefined || !choices[key].includes(fallback)) delete p[key];
          else p[key] = fallback;
        }
      } else if (COLOR_KEYS.includes(key)) {
        if (typeof value !== "string" || !isColor(value)) p[key] = fallback ?? "";
      } else if (typeof fallback === "number" || ["x", "y", "w", "h", "ratio", "zoom", "px", "py"].includes(key)) {
        p[key] = finite(value, fallback ?? 0);
      } else if (typeof fallback === "boolean") {
        p[key] = !!value;
      } else if (value !== null && typeof value === "object") {
        delete p[key]; // nothing the builder writes is an object
      } else if (typeof fallback === "string" && typeof value !== "string") {
        p[key] = String(value ?? "");
      }
    }
    if ("href" in p) p.href = safeHref(p.href);
    // An Opening step: a whole number from 1 (absent: the piece comes in as usual).
    if ("openStep" in p) {
      const n = Math.round(finite(p.openStep, 0));
      if (n >= 1) p.openStep = n;
      else delete p.openStep;
    }
    // The group it's in, and the group clicking it opens: names, or absent.
    for (const key of ["group", "opens"]) {
      if (!(key in p)) continue;
      const name = groupName(p[key]);
      if (name) p[key] = name;
      else delete p[key];
    }
  }


  /** A sound the project carries: sounds/<name>. */
  const isSoundSrc = (v) => typeof v === "string" && /^sounds\/[^/\\]+$/.test(v);

  function cleanPage(doc) {
    const blank = blankDoc();
    for (const key of ["cols", "rows", "cell"]) {
      const n = finite(doc[key], blank[key]);
      doc[key] = n > 0 ? (key === "cell" ? n : Math.round(n)) : blank[key];
    }
    doc.title = String(doc.title ?? "");
    doc.file = String(doc.file ?? "");
    doc.flow = /^[a-z]+$/.test(doc.flow) ? doc.flow : "none";
    doc.sound = !!doc.sound;
    // The opening's own sound (blank: the built-in power-up), and each step's start time and sound.
    doc.soundFile = isSoundSrc(doc.soundFile) ? doc.soundFile : "";
    const steps = {};
    for (const [n, c] of Object.entries(doc.steps && typeof doc.steps === "object" ? doc.steps : {})) {
      if (!/^\d+$/.test(n) || !c || typeof c !== "object") continue;
      const at = c.at === "" || c.at == null ? -1 : finite(c.at, -1);
      const step = { ...(at >= 0 ? { at } : {}), ...(isSoundSrc(c.sound) ? { sound: c.sound } : {}) };
      if (Object.keys(step).length) steps[n] = step;
    }
    doc.steps = steps;
    // Sounds layered on top of the opening's: each a file and when it starts (seconds from the beginning).
    doc.layers = (Array.isArray(doc.layers) ? doc.layers : [])
      .filter((l) => l && typeof l === "object" && isSoundSrc(l.sound))
      .map((l) => ({ sound: l.sound, at: Math.max(0, finite(l.at, 0)) }));
    doc.textShapes = doc.textShapes !== false;
    if (!/^g\d+$/.test(doc.pid ?? "")) delete doc.pid; // loadSite gives it a new one
    doc.pieces = doc.pieces.filter((p) => p && typeof p === "object" && !Array.isArray(p) && Object.hasOwn(TYPES, p.type));
    doc.pieces.forEach(cleanPiece);
    // Ids are p<number> and unique; any other gets a new one after the highest.
    const seen = new Set();
    const keep = doc.pieces.map((p) => {
      const ok = typeof p.id === "string" && /^p\d+$/.test(p.id) && !seen.has(p.id);
      if (ok) seen.add(p.id);
      return ok;
    });
    doc.nextId = Math.max(finite(doc.nextId, 1), 1, ...[...seen].map((id) => Number(id.slice(1)) + 1));
    doc.pieces.forEach((p, i) => { if (!keep[i]) p.id = `p${doc.nextId++}`; });
  }

  /** Put a page (or a whole site file) in place of the page being edited. */
  function load(json) {
    const d = typeof json === "string" ? JSON.parse(json) : json;
    if (d && Array.isArray(d.pages)) return loadSite(d);
    const page = preparePage(d);
    if (!site) {
      site = { version: SITE_VERSION, current: 0, nextPage: 1, pages: [page] };
      page.pid = `g${site.nextPage++}`;
      page.file = "index";
    } else {
      page.pid = doc.pid;
      page.file = doc.file;
      site.pages[site.current] = page;
    }
    show(page);
  }

  /** Load a whole site: a site file, or a single page from before sites. */
  function loadSite(d) {
    const pages = (Array.isArray(d.pages) ? d.pages : [d]).map(preparePage);
    if (!pages.length) pages.push(preparePage(blankDoc()));
    const used = pages.map((p) => parseInt(String(p.pid || "").slice(1), 10) || 0);
    site = {
      version: SITE_VERSION, name: typeof d.name === "string" ? d.name : "", pages,
      current: Math.min(Math.max(0, d.current | 0), pages.length - 1),
      nextPage: Math.max(d.nextPage || 1, ...used.map((n) => n + 1)),
    };
    pages.forEach((p, i) => {
      p.pid ||= `g${site.nextPage++}`;
      const want = fileSlug(p.file || "") || (i === 0 ? "index" : fileSlug(p.title) || "page");
      p.file = "";
      p.file = uniqueFile(want, p);
    });
    show(site.pages[site.current]);
  }

  /** Show a page of the site on the board. */
  function show(page) {
    site.current = Math.max(0, site.pages.indexOf(page));
    doc = page;
    selectedId = null;
    also.clear();
    editing = null;
    renderAll();
    fitAll();
  }

  /* ---- Pages of the site ---- */

  /** A file name from any text: lower case letters, digits, - and _. */
  const fileSlug = (s) => String(s || "").toLowerCase().replace(/\.html?$/, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  /** `base`, or base-2, base-3 ... if another page already has it. */
  function uniqueFile(base, except = null) {
    let f = base || "page";
    for (let n = 2; site.pages.some((p) => p !== except && p.file === f); n++) f = `${base || "page"}-${n}`;
    return f;
  }

  function switchPage(i) {
    if (i === site.current || !site.pages[i]) return renderPagePick();
    if (editing) finishEdit(true);
    show(site.pages[i]);
    commit();
  }

  /** Add a page shaped like the current one; `from` copies a page instead of starting blank. */
  function addPage(from = null) {
    if (editing) finishEdit(true);
    let title = from ? `${from.title} Copy` : prompt("Name the new page:", "New Page");
    if (title == null) return;
    title = title.trim() || "New Page";
    const page = from ? structuredClone(from) : Object.assign(blankDoc(), { cols: doc.cols, rows: doc.rows, cell: doc.cell, textShapes: doc.textShapes, flow: doc.flow || "console", sound: !!doc.sound });
    page.title = title;
    page.pid = `g${site.nextPage++}`;
    page.file = uniqueFile(fileSlug(title) || "page");
    site.pages.splice(site.current + 1, 0, page);
    show(page);
    commit();
    toast(`Added ${page.file}.html`);
  }

  async function deletePage() {
    if (site.pages.length < 2) return toast("A site needs at least one page");
    if (!(await ask(`Delete the page "${doc.title}" (${doc.file}.html)? Buttons that link to it keep their links.`))) return;
    const i = site.current;
    site.pages.splice(i, 1);
    show(site.pages[Math.min(i, site.pages.length - 1)]);
    commit();
  }

  /** Give a page a new file name, and point buttons that linked to the old one at the new one. */
  function renamePage(page, want) {
    const file = uniqueFile(fileSlug(want) || page.file, page);
    if (file === page.file) return false;
    const old = `${page.file}.html`;
    page.file = file;
    let links = 0;
    for (const pg of site.pages) {
      for (const p of pg.pieces) {
        const m = typeof p.href === "string" && p.href.match(/^([^#?]*)(.*)$/);
        if (m && m[1] === old) {
          p.href = `${file}.html${m[2]}`;
          links++;
        }
      }
    }
    renderPagePick();
    commit();
    toast(`Now ${file}.html${links ? `; ${links} link${links > 1 ? "s" : ""} updated` : ""}`);
    return true;
  }

  /** The Pages menu: the project's name, then one LCARS button per page; and the top bar's name for the project and page. */
  function renderPagePick() {
    const list = document.getElementById("pages-list");
    if (!list || !site) return;
    $("#pages-project").textContent = site.name || "Untitled project";
    showProjectName();
    const label = (p) => {
      const span = document.createElement("span");
      span.textContent = p.title || "Untitled";
      const file = document.createElement("small");
      file.textContent = `${p.file}.html`;
      return [span, file];
    };
    list.replaceChildren(...site.pages.map((p, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pill lilac";
      if (i === site.current) b.setAttribute("aria-current", "page");
      b.append(...label(p));
      b.addEventListener("click", () => {
        document.getElementById("pages-menu").hidePopover();
        switchPage(i);
      });
      return b;
    }));
    const add = document.getElementById("pages-new");
    add.onclick = () => {
      document.getElementById("pages-menu").hidePopover();
      addPage();
    };
  }

  /** Bring a piece from a version-1 page up to date. */
  function upgradePiece(p) {
    const markup = (t) => String(t)
      .replace(/##([roOybBpP])/g, (_, c) => `##{${LEGACY[c]}}`)
      .replace(/##\{(red-alert|yellow-alert)\}/g, (_, n) => `##{${RENAMED[n]}}`);
    for (const key of ["label", "text", "title", "caption"]) if (typeof p[key] === "string") p[key] = markup(p[key]);
    for (const key of ["color", "color2", "color3", "tcolor", "hover", "active", "border"]) if (RENAMED[p[key]]) p[key] = RENAMED[p[key]];
  }

  function commit() {
    const snap = snapshot();
    if (undoStack[undoStack.length - 1] === snap) return;
    undoStack.push(snap);
    if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0;
    try { localStorage.setItem(SITE_KEY, snap); } catch { /* storage unavailable */ }
    updateTitle();
  }

  function undo() {
    if (undoStack.length < 2) return;
    redoStack.push(undoStack.pop());
    restore(undoStack[undoStack.length - 1]);
  }
  function redo() {
    if (!redoStack.length) return;
    const snap = redoStack.pop();
    undoStack.push(snap);
    restore(snap);
  }
  function restore(snap) {
    const keep = selectedId;
    site = JSON.parse(snap);
    doc = site.pages[site.current];
    editing = null;
    const kept = [keep, ...also].filter((id) => doc.pieces.some((p) => p.id === id));
    selectedId = kept[0] ?? null;
    also.clear();
    for (const id of kept.slice(1)) also.add(id);
    renderAll();
    try { localStorage.setItem(SITE_KEY, snap); } catch { /* storage unavailable */ }
    updateTitle();
  }

  const piece = (id) => doc.pieces.find((p) => p.id === id);
  const multi = () => also.size > 0;
  const selected = () => (multi() ? null : piece(selectedId));
  const isPicked = (id) => id === selectedId || also.has(id);
  /** Every selected piece, in board order. */
  const selectedPieces = () => doc.pieces.filter((p) => isPicked(p.id));

  function addPiece(type, at) {
    const p = { id: `p${doc.nextId++}`, type, x: 0, y: 0, rot: 0, ...structuredClone(TYPES[type]) };
    const x = at ? at.x : Math.round((doc.cols - p.w) / 2);
    const y = at ? at.y : Math.round((doc.rows - p.h) / 2);
    p.x = clamp(x, 0, Math.max(0, doc.cols - p.w));
    p.y = clamp(y, 0, Math.max(0, doc.rows - p.h));
    doc.pieces.push(p);
    selectedId = p.id;
    also.clear();
    renderAll();
    fitToText(p);
    commit();
  }

  /* ------------------------------------------------------------------ *
   * Canvas
   * ------------------------------------------------------------------ */

  const $ = (sel) => document.querySelector(sel);
  const board = $("#board");
  const stage = $("#stage");
  const inspector = $("#inspector");
  const els = new Map(); // piece id -> element
  const veiled = new Set(); // groups hidden on the board while editing (not saved)
  const isVeiled = (p) => !!p.group && veiled.has(p.group);
  let selBox = null;

  const ctx = {
    editing: true,
    imageURL: (p) => imageURLFor(doc)(p),
    get handlesFor() { return multi() ? null : selectedId; },
    get editingId() { return editing?.id; },
  };

  function applyVars(el, vars) {
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, String(v));
  }

  function renderPiece(p, { inner = true } = {}) {
    let el = els.get(p.id);
    if (!el) {
      el = document.createElement("div");
      el.dataset.id = p.id;
      els.set(p.id, el);
    }
    el.className = pieceClasses(p) + (!isPicked(p.id) ? "" : multi() ? " is-picked" : " is-selected");
    el.removeAttribute("style");
    applyVars(el, pieceVars(p));
    // The board marks its group, its Opening step and the group it opens (builder.css).
    const badge = [p.group, p.openStep, p.opens && `> ${p.opens}`].filter(Boolean).join(" · ");
    if (badge) el.dataset.badge = badge;
    else delete el.dataset.badge;
    el.classList.toggle("is-veiled", !!p.group && veiled.has(p.group));
    if (inner && editing?.id !== p.id) {
      el.innerHTML = pieceInner(p, doc.cell, ctx);
      if (p.type === "frame" || p.type === "image") watchImage(p, el);
    }
    return el;
  }

  /** Record the picture's proportions once it loads, and re-shape the piece if it keeps them. */
  function watchImage(p, el) {
    const img = el.querySelector("img");
    if (!img) return;
    const onLoad = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      if (!ratio || piece(p.id) !== p || Math.abs((p.ratio || 0) - ratio) < 1e-4) return;
      p.ratio = ratio;
      if (applyAspect(p)) {
        renderPiece(p, { inner: false });
        syncSelection();
        syncFields(p);
      }
      commit();
    };
    if (img.complete && img.naturalWidth) onLoad();
    else img.addEventListener("load", onLoad, { once: true });
  }

  /** Refresh the position and size boxes in the panel without rebuilding it. */
  function syncFields(p, keys = ["x", "y", "w", "h"]) {
    for (const key of keys) {
      const input = inspector.querySelector(`[data-key="${key}"]`);
      if (input && document.activeElement !== input) input.value = p[key];
    }
  }

  function renderAll() {
    applyVars(board, { "--cols": doc.cols, "--rows": doc.rows, "--cell": doc.cell });
    els.clear();
    board.replaceChildren(...doc.pieces.map((p) => renderPiece(p)));
    renderSelection();
    renderInspector();
    renderPagePick();
  }

  function renderSelection() {
    selBox?.remove();
    selBox = null;
    const p = selected();
    if (!p) return;
    selBox = document.createElement("div");
    selBox.className = "sel";
    selBox.innerHTML = ["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((h) => `<span class="hd" data-h="${h}"></span>`).join("") +
      `<span class="dims"></span>`;
    board.append(selBox);
    syncSelection();
  }

  function syncSelection() {
    const p = selected();
    if (!p || !selBox) return;
    applyVars(selBox, { "--x": p.x, "--y": p.y, "--w": p.w, "--h": p.h });
    const extra = p.type === "elbow" ? `  side ${p.side} · bar ${p.bar}` : "";
    selBox.querySelector(".dims").textContent = `${p.x},${p.y}  ${p.w}×${p.h}${p.rot ? `  ${p.rot}°` : ""}${extra}`;
  }

  const cellPx = () => board.getBoundingClientRect().width / doc.cols;

  function cellAt(clientX, clientY) {
    const r = board.getBoundingClientRect();
    const k = r.width / doc.cols;
    return { x: Math.floor((clientX - r.left) / k), y: Math.floor((clientY - r.top) / k) };
  }

  function select(id) {
    setPicked(id ? [id] : []);
  }

  /** Select these pieces (any number; the first leads). */
  function setPicked(ids) {
    ids = [...new Set(ids)].filter((id) => piece(id));
    if (editing && (ids.length !== 1 || editing.id !== ids[0])) finishEdit(true);
    const before = [selectedId, ...also];
    selectedId = ids[0] ?? null;
    also.clear();
    for (const id of ids.slice(1)) also.add(id);
    // Redraw what changed: outlines, and an elbow's handles (one selected elbow has them).
    for (const id of new Set([...before, ...ids])) {
      const p = piece(id);
      if (!p) continue;
      if (p.type === "elbow") renderPiece(p);
      else els.get(id).className = pieceClasses(p) + (!isPicked(id) ? "" : multi() ? " is-picked" : " is-selected") +
        (p.group && veiled.has(p.group) ? " is-veiled" : "");
    }
    renderSelection();
    renderInspector();
  }

  /** Map a screen drag into the piece body's own (unrotated) axes. */
  function toBody(dx, dy, rot) {
    switch (rot || 0) {
      case 90: return [dy, -dx];
      case 180: return [-dx, -dy];
      case 270: return [-dy, dx];
      default: return [dx, dy];
    }
  }

  // Move, resize, or drag an elbow's inner edges, snapping to whole cells.
  board.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (editing && editing.el.contains(e.target)) return; // selecting text in a label
    if (startPan(e)) return;
    const handle = e.target.closest(".hd");
    const pieceEl = e.target.closest(".piece");
    if (!handle) {
      if (!pieceEl) { startMarquee(e); return; }
      const id = pieceEl.dataset.id;
      if (e.shiftKey) { // add it to the selection, or take it out
        e.preventDefault();
        const ids = selectedPieces().map((q) => q.id);
        setPicked(isPicked(id) ? ids.filter((x) => x !== id) : [...ids, id]);
        return;
      }
      if (multi() && isPicked(id)) { startGroupMove(e); return; }
      if (id !== selectedId || multi()) select(id);
      else if (editing) finishEdit(true);
    }
    const p = selected();
    if (!p) return;
    e.preventDefault();
    const mode = handle ? handle.dataset.h : "move";
    const start = { x: e.clientX, y: e.clientY, p: { ...p } };
    const k = cellPx();
    board.setPointerCapture(e.pointerId);
    let changed = false;

    const onMove = (ev) => {
      const dx = (ev.clientX - start.x) / k;
      const dy = (ev.clientY - start.y) / k;
      const o = start.p;
      const next = { x: o.x, y: o.y, w: o.w, h: o.h, side: o.side, bar: o.bar };
      if (mode === "side" || mode === "bar") {
        const [bx, by] = toBody(dx, dy, o.rot);
        const { iw, ih } = dims(o);
        if (mode === "side") next.side = clamp(o.side + Math.round(bx) * (o.corner[1] === "l" ? 1 : -1), 1, iw - 1);
        else next.bar = clamp(o.bar + Math.round(by) * (o.corner[0] === "t" ? 1 : -1), 1, ih - 1);
      } else {
        const rx = Math.round(dx), ry = Math.round(dy);
        // Resize handles are named by compass points (n, ne, e, ...). Check those
        // only for a handle: the word "move" itself contains an "e".
        const dir = mode === "move" ? "" : mode;
        if (mode === "move") { next.x = o.x + rx; next.y = o.y + ry; }
        if (dir.includes("e")) next.w = o.w + rx;
        if (dir.includes("s")) next.h = o.h + ry;
        if (dir.includes("w")) { next.w = o.w - rx; next.x = o.x + rx; }
        if (dir.includes("n")) { next.h = o.h - ry; next.y = o.y + ry; }
        if (next.w < 1) { if (dir.includes("w")) next.x -= 1 - next.w; next.w = 1; }
        if (next.h < 1) { if (dir.includes("n")) next.y -= 1 - next.h; next.h = 1; }
        next.x = Math.max(0, next.x);
        next.y = Math.max(0, next.y);
      }
      if (["x", "y", "w", "h", "side", "bar"].every((key) => next[key] === p[key])) return;
      const resized = next.w !== p.w || next.h !== p.h || next.side !== p.side || next.bar !== p.bar;
      Object.assign(p, p.type === "elbow" ? next : { x: next.x, y: next.y, w: next.w, h: next.h });
      if (mode !== "move" && mode !== "side" && mode !== "bar") applyAspect(p, mode === "n" || mode === "s" ? "h" : "w", mode.includes("n"));
      changed = true;
      renderPiece(p, { inner: (p.type === "elbow" || p.type === "gauge") && resized });
      syncSelection();
    };
    const onUp = () => {
      board.removeEventListener("pointermove", onMove);
      board.removeEventListener("pointerup", onUp);
      board.removeEventListener("pointercancel", onUp);
      if (changed) {
        renderPiece(p);
        renderInspector();
        commit();
      }
    };
    board.addEventListener("pointermove", onMove);
    board.addEventListener("pointerup", onUp);
    board.addEventListener("pointercancel", onUp);
  });

  /**
   * A drag on empty board draws a box that selects every piece it touches
   * (with Shift, adds them to the selection). A plain click selects nothing,
   * which shows the page's settings.
   */
  function startMarquee(e) {
    e.preventDefault();
    const keep = e.shiftKey ? selectedPieces().map((p) => p.id) : [];
    const at = (ev) => {
      const r = board.getBoundingClientRect(), k = r.width / doc.cols;
      return { x: (ev.clientX - r.left) / k, y: (ev.clientY - r.top) / k };
    };
    const from = at(e);
    const area = (ev) => {
      const to = at(ev);
      return { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) };
    };
    let box = null;
    board.setPointerCapture(e.pointerId);
    const onMove = (ev) => {
      const a = area(ev);
      if (!box && Math.max(a.w, a.h) * cellPx() < 4) return; // still a click
      if (!box) {
        box = document.createElement("div");
        box.className = "marquee";
        board.append(box);
      }
      applyVars(box, { "--x": a.x, "--y": a.y, "--w": a.w, "--h": a.h });
    };
    const onUp = (ev) => {
      board.removeEventListener("pointermove", onMove);
      board.removeEventListener("pointerup", onUp);
      board.removeEventListener("pointercancel", onUp);
      if (!box) {
        if (!e.shiftKey) select(null);
        return;
      }
      box.remove();
      const a = area(ev);
      const hits = doc.pieces.filter((p) => p.x < a.x + a.w && p.x + p.w > a.x && p.y < a.y + a.h && p.y + p.h > a.y && !isVeiled(p));
      setPicked([...keep, ...hits.map((p) => p.id)]);
    };
    board.addEventListener("pointermove", onMove);
    board.addEventListener("pointerup", onUp);
    board.addEventListener("pointercancel", onUp);
  }

  /** Drag one of several selected pieces: they all move together, in whole cells. */
  function startGroupMove(e) {
    e.preventDefault();
    const k = cellPx();
    const start = { x: e.clientX, y: e.clientY };
    const from = new Map(selectedPieces().map((p) => [p.id, { x: p.x, y: p.y }]));
    board.setPointerCapture(e.pointerId);
    let changed = false;
    const onMove = (ev) => {
      if (moveSelection(Math.round((ev.clientX - start.x) / k), Math.round((ev.clientY - start.y) / k), from)) changed = true;
    };
    const onUp = () => {
      board.removeEventListener("pointermove", onMove);
      board.removeEventListener("pointerup", onUp);
      board.removeEventListener("pointercancel", onUp);
      if (changed) commit();
    };
    board.addEventListener("pointermove", onMove);
    board.addEventListener("pointerup", onUp);
    board.addEventListener("pointercancel", onUp);
  }

  /* ---- Fill and crop: drag the picture to position it, scroll to zoom ---- */

  /** The selected piece's picture under the pointer, if it can be panned. */
  function panTarget(target) {
    const p = selected();
    if (!p || p.imgMode !== "crop" || (p.type !== "frame" && p.type !== "image")) return null;
    const box = target.closest(".f-img, .img-box");
    const img = box?.querySelector("img");
    if (!img || !img.naturalWidth || box.closest(".piece")?.dataset.id !== p.id) return null;
    return { p, box, img };
  }

  /**
   * With object-position p% and the zoom anchored at the same point, the picture's
   * left edge sits at p * (box - shown) from the box's left edge. Dragging by dx
   * therefore changes p by dx / (box - shown). A turned picture works in its own
   * directions: its box is the other way round, and the drag is turned back.
   */
  function startPan(e) {
    const t = panTarget(e.target);
    if (!t) return false;
    e.preventDefault();
    const { p, box, img } = t;
    const turn = p.turn || 0;
    const rect = box.getBoundingClientRect();
    const r = turn % 180 ? { width: rect.height, height: rect.width } : rect;
    const cover = Math.max(r.width / img.naturalWidth, r.height / img.naturalHeight) * (p.zoom || 1);
    const spareX = r.width - img.naturalWidth * cover;
    const spareY = r.height - img.naturalHeight * cover;
    const start = { x: e.clientX, y: e.clientY, px: p.px ?? 50, py: p.py ?? 50 };
    board.setPointerCapture(e.pointerId);
    box.classList.add("panning");
    let changed = false;
    const onMove = (ev) => {
      const pct = (d, spare, from) => (Math.abs(spare) < 0.5 ? from : clamp(from + (d / spare) * 100, 0, 100));
      const [dx, dy] = toBody(ev.clientX - start.x, ev.clientY - start.y, turn);
      const px = Math.round(pct(dx, spareX, start.px) * 10) / 10;
      const py = Math.round(pct(dy, spareY, start.py) * 10) / 10;
      if (px === p.px && py === p.py) return;
      Object.assign(p, { px, py });
      changed = true;
      renderPiece(p, { inner: false });
      syncFields(p, ["px", "py"]);
    };
    const onUp = () => {
      board.removeEventListener("pointermove", onMove);
      board.removeEventListener("pointerup", onUp);
      board.removeEventListener("pointercancel", onUp);
      box.classList.remove("panning");
      if (changed) commit();
    };
    board.addEventListener("pointermove", onMove);
    board.addEventListener("pointerup", onUp);
    board.addEventListener("pointercancel", onUp);
    return true;
  }

  let zoomCommit = 0;
  board.addEventListener("wheel", (e) => {
    const t = panTarget(e.target);
    if (!t) return;
    e.preventDefault();
    const { p } = t;
    p.zoom = Math.round(clamp((p.zoom || 1) * Math.exp(-e.deltaY * 0.0015), 1, 6) * 100) / 100;
    renderPiece(p, { inner: false });
    syncFields(p, ["zoom"]);
    clearTimeout(zoomCommit);
    zoomCommit = setTimeout(commit, 400);
  }, { passive: false });

  // Double-click a piece to edit its label right on the board.
  board.addEventListener("dblclick", (e) => {
    const el = e.target.closest(".piece");
    const p = el && piece(el.dataset.id);
    if (p && HAS_LABEL.has(p.type)) startEdit(p);
  });

  // Tools: click to add in the middle, or drag onto the board.
  for (const tool of document.querySelectorAll(".tool")) {
    tool.addEventListener("click", () => addPiece(tool.dataset.type));
    tool.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/x-lcars-piece", tool.dataset.type);
      e.dataTransfer.effectAllowed = "copy";
    });
  }
  stage.addEventListener("dragover", (e) => {
    if (!e.dataTransfer.types.includes("text/x-lcars-piece")) return;
    e.preventDefault();
    stage.classList.add("drop-target");
  });
  stage.addEventListener("dragleave", () => stage.classList.remove("drop-target"));
  stage.addEventListener("drop", (e) => {
    stage.classList.remove("drop-target");
    const type = e.dataTransfer.getData("text/x-lcars-piece");
    if (!TYPES[type]) return;
    e.preventDefault();
    addPiece(type, cellAt(e.clientX, e.clientY));
  });

  $("#grid-toggle").addEventListener("change", (e) => {
    document.body.classList.toggle("show-grid", e.target.checked);
    try { localStorage.setItem("trektext-builder:grid", e.target.checked ? "on" : "off"); } catch { /* storage unavailable */ }
  });

  /* ------------------------------------------------------------------ *
   * Fit to text, and editing labels on the board
   * ------------------------------------------------------------------ */

  /** Resize a piece to its label when "Fit to text" is on. Returns true if it changed. */
  function fitToText(p) {
    if (!p || !p.fit || !HAS_LABEL.has(p.type)) return false;
    const label = els.get(p.id)?.querySelector(".label > .lt");
    if (!label || !label.textContent.trim()) return false;
    const range = document.createRange();
    range.selectNodeContents(label);
    const box = range.getBoundingClientRect();
    const k = cellPx();
    if (!box.width || !k) return false;
    const sideways = (p.rot || 0) % 180 !== 0;
    const textW = (sideways ? box.height : box.width) / k;
    // Height from the line count: labels are set solid (line-height 1).
    const lines = serialize(label).split("\n").length;
    const textH = p.wrap ? box.height / k : (lines * (p.fs || 17)) / doc.cell;
    const pad = p.type === "text" ? 0.8 : 1.6;
    const iw = p.wrap ? dims(p).iw : Math.max(1, Math.ceil(textW + pad - 0.05));
    const ih = Math.max(p.type === "text" ? 1 : dims(p).ih, Math.ceil(textH - 0.05));
    const [w, h] = sideways ? [ih, iw] : [iw, ih];
    if (w === p.w && h === p.h) return false;
    Object.assign(p, { w, h });
    renderPiece(p, { inner: false });
    syncSelection();
    return true;
  }

  function startEdit(p) {
    if (editing?.id === p.id) return;
    if (editing) finishEdit(true);
    if (selectedId !== p.id) select(p.id);
    editing = { id: p.id, original: p.label };
    const el = els.get(p.id);
    el.innerHTML = pieceInner(p, doc.cell, ctx); // ensures a label element exists
    const label = el.querySelector(".label > .lt");
    label.innerHTML = runsHTML(parseLabel(p.label), { edit: true }) || "​";
    label.contentEditable = "true";
    label.spellcheck = false;
    editing.el = label;
    label.addEventListener("input", onEditInput);
    label.addEventListener("keydown", onEditKey);
    label.addEventListener("paste", onEditPaste);
    label.addEventListener("blur", onEditBlur);
    label.focus();
    const sel = getSelection();
    sel.selectAllChildren(label);
    renderInspector();
  }

  function onEditInput() {
    const p = piece(editing.id);
    p.label = serialize(editing.el);
    fitToText(p);
    syncEditors(p, "label");
    syncSelection();
  }

  function onEditKey(e) {
    if (e.key === "Escape") { e.preventDefault(); finishEdit(false); }
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finishEdit(true); }
    else if (e.key === "Enter") { e.preventDefault(); document.execCommand("insertLineBreak"); }
  }

  function onEditPaste(e) {
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  }

  function onEditBlur() {
    // Clicking a text-color swatch keeps focus; anything else ends the edit.
    setTimeout(() => { if (editing && document.activeElement !== editing.el) finishEdit(true); }, 0);
  }

  function finishEdit(keep) {
    if (!editing) return;
    const { id, el, original } = editing;
    const p = piece(id);
    editing = null;
    el.removeEventListener("blur", onEditBlur);
    if (p) {
      p.label = keep ? serialize(el) : original;
      renderPiece(p);
      fitToText(p);
      syncEditors(p, "label");
      syncSelection();
      if (keep) commit();
    }
  }

  /* ------------------------------------------------------------------ *
   * Coloring text
   *
   * Text is edited as it will look, in rich-text editors (in the panel, or a
   * label on the board). Color codes stay behind the scenes in the markup.
   * ------------------------------------------------------------------ */

  /** The editor holding a non-empty text selection, if any. */
  function selectionEditor() {
    const sel = getSelection();
    if (!sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return null;
    let node = range.commonAncestorContainer;
    if (node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement;
    const host = node?.closest('.rt-edit, .lt[contenteditable="true"]');
    return host ? { host, range, sel } : null;
  }

  /** Wrap the selected letters in one color (an empty color returns them to the default). */
  function wrapRange(range, sel, color) {
    const frag = range.extractContents();
    const span = document.createElement("span");
    span.setAttribute("data-c", color);
    if (color.startsWith("#")) span.style.color = color;
    else if (color) span.className = `t-${color}`;
    const flatten = (node) => {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === Node.TEXT_NODE || n.nodeName === "BR") span.append(n);
        else flatten(n);
      }
    };
    flatten(frag);
    range.insertNode(span);
    sel.selectAllChildren(span);
  }

  /** A Text color swatch: color the selected letters, or else set the piece's text color. */
  function colorText(color) {
    const p = selected();
    if (!p) return;
    const target = selectionEditor();
    if (target) {
      wrapRange(target.range, target.sel, color);
      target.host.dispatchEvent(new Event("input", { bubbles: true }));
      commit();
      return;
    }
    if (editing) finishEdit(true);
    p.tcolor = color;
    renderPiece(p);
    fitToText(p);
    syncSelection();
    renderInspector();
    commit();
  }

  const FILLED = new Set(["block", "button", "elbow"]);

  /** How a piece's text looks by default, for painting the panel's editors. */
  function textLook(p) {
    const filled = FILLED.has(p.type);
    const plain = { text: "atomic-tangerine", padd: "melrose", quote: "melrose", list: "melrose", image: "melrose", gauge: "melrose" }[p.type];
    const fg = p.tcolor ? colorValue(p.tcolor) : filled ? "#000" : colorValue(plain || p.color || "atomic-tangerine");
    return { fg, bg: filled ? colorValue(p.color) : "#000" };
  }

  const fillEditor = (ed, markup) => { ed.innerHTML = runsHTML(parseLabel(markup), { edit: true }); };

  function paintEditor(ed, p) {
    const { fg, bg } = textLook(p);
    ed.style.setProperty("--ed-fg", fg);
    ed.style.setProperty("--ed-bg", bg);
  }

  /** Refresh the panel's editors after a change made elsewhere (e.g. on the board). */
  function syncEditors(p, key) {
    for (const ed of inspector.querySelectorAll(".rt-edit")) {
      paintEditor(ed, p);
      if ((!key || ed.dataset.key === key) && document.activeElement !== ed) fillEditor(ed, p[ed.dataset.key]);
    }
  }

  /**
   * A rich-text editor for one text property of a piece. The board updates as
   * you type (a PADD waits for a pause, since it re-types its text).
   */
  function richEditor(p, key, { multiline = true, later = false } = {}) {
    const ed = document.createElement("div");
    ed.className = "rt-edit" + (multiline ? " multi" : "") + (key === "text" && p.type === "padd" ? " padd" : "");
    ed.contentEditable = "true";
    ed.spellcheck = false;
    ed.dataset.key = key;
    ed.setAttribute("role", "textbox");
    if (multiline) ed.setAttribute("aria-multiline", "true");
    paintEditor(ed, p);
    fillEditor(ed, p[key]);
    let timer = 0;
    const show = () => {
      renderPiece(p);
      fitToText(p);
      if (applyAspect(p)) renderPiece(p, { inner: false });
      syncSelection();
    };
    ed.addEventListener("focus", () => { if (editing) finishEdit(true); });
    ed.addEventListener("input", () => {
      p[key] = serialize(ed);
      clearTimeout(timer);
      if (later) timer = setTimeout(show, 450);
      else show();
    });
    ed.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); ed.blur(); return; }
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (multiline && !(e.ctrlKey || e.metaKey)) document.execCommand("insertLineBreak");
      else ed.blur();
    });
    ed.addEventListener("paste", onEditPaste);
    ed.addEventListener("blur", () => {
      if (later && timer) { clearTimeout(timer); timer = 0; show(); }
      commit();
    });
    return ed;
  }

  /* ------------------------------------------------------------------ *
   * Inspector: grouped, collapsible sections
   * ------------------------------------------------------------------ */

  const BLINK = ["blink", "Blink", ["none", "slow", "normal", "fast"]];
  const BLINK_TO = ["blinkTo", "Blink to", "color-dim", { when: (p) => p.blink && p.blink !== "none" }];
  const TURN = ["rot", "Turn", [0, 90, 180, 270]];
  const CROP = { when: (p) => p.imgMode === "crop" };
  const POINTER_ON = { when: (p) => p.pointer !== false };
  const COUNTED = { when: (p) => p.numbers === "count" };
  const TYPED = { when: (p) => p.numbers !== "count" };
  const BRACKET_ON = { when: (p) => p.bracket };
  const BLOCKS_SEEDED = { when: (p) => p.bracket && p.blocks === "pattern" };
  const BLOCKS_VARIED = { when: (p) => p.bracket && p.blocks && p.blocks !== "even" };
  const ALIGN = [["halign", "Align", ["left", "center", "right"]], ["valign", "Vertical", ["top", "middle", "bottom"]]];
  const TEXT_COLOR = ["tcolor", "Text color · select letters first to color just those", "textcolor"];
  const FIT = ["fit", "Fit to text (shrinks and grows as you type)", "check"];

  // Every panel runs the same way: colours, then shape, then what the piece shows (picture, text),
  // then how it moves and what it does; its Opening step and its exact position come last.
  const POSITION = ["Position and size", [["x", "X", "int"], ["y", "Y", "int"], ["w", "Width", "int"], ["h", "Height", "int"]], { row: true, closed: true }];
  const LABEL = ["Text", [TEXT_COLOR, ["label", "Label · * = dot", "rich"], ["fs", "Text size", "num"], ...ALIGN, FIT]];
  const MOTION = ["Motion", [BLINK, BLINK_TO]];
  const PICTURE = ["Image", [["src", "Image (path or URL)", "text"], ["file", "Or choose a file", "file"], ["alt", "Description for screen readers", "text"]]];
  const SIZING = [["turn", "Turn the picture", [0, 90, 180, 270]], ["imgMode", "Sizing", ["keep", "crop", "fit"]],
    ["zoom", "Zoom (1 = just fills) · or scroll over the picture", "zoom", CROP],
    ["px", "Horizontal position % · or drag the picture", "pct", CROP], ["py", "Vertical position % (0 = top)", "pct", CROP]];

  /** Each piece type's panel: [section title, fields, options]. Opening and Position and size follow for every piece. */
  const SECTIONS = {
    block: [["Color", [["color", "Color", "color"]]], ["Shape", [["ends", "Rounded ends", ["none", "left", "right", "both", "top", "bottom"]]]], LABEL, MOTION],
    button: [
      ["Colors", [["color", "Color", "color"], ["hover", "Hover color", "color-auto"], ["active", "Pressed color", "color-auto"]]],
      ["Shape", [["ends", "Shape", ["both", "left", "right", "none"]]]],
      LABEL, MOTION,
      ["Action", [["href", "Link: one of your pages, or a URL", "link"], ["beep", "Sound when clicked", ["key", "tap", "chirp", "padd", "none"]]]]],
    elbow: [["Color", [["color", "Color", "color"]]],
      ["Shape", [["flip", "Flip", "flip"], ["side", "Sidebar width (the wide part)", "num"], ["bar", "Bar thickness (the narrow arm)", "num"],
        ["rx", "Outer curve width", "num"], ["ry", "Outer curve height", "num"], ["ri", "Inner curve", "num"]]],
      LABEL, MOTION],
    text: [["Text", [TEXT_COLOR, ["label", "Text · * = dot", "rich"], ["fs", "Text size", "num"], ...ALIGN, FIT,
      ["wrap", "Wrap lines to the box (for paragraphs)", "check"]]], MOTION],
    padd: [["Text", [TEXT_COLOR, ["text", "PADD text", "rich-later"], ["fs", "Text size", "num"]]],
      ["Motion", [["hold", "Seconds per page (0 = manual)", "num"]]]],
    image: [["Color", [["border", "Border color", "color-none"]]], ["Shape", SIZING], PICTURE,
      ["Caption", [TEXT_COLOR, ["caption", "Caption", "rich1"], ["fs", "Caption size", "num"]]]],
    frame: [["Colors", [["color", "Main color", "color"], ["color2", "Accent color", "color"], ["color3", "Second accent", "color"]]],
      ["Shape", [["variant", "Layout", ["bracket-left", "bracket-right", "twin", "viewscreen"]], ["bar", "Thickness (side and bars)", "num"], ...SIZING]],
      PICTURE,
      ["Text", [TEXT_COLOR, ["title", "Title (header)", "rich1"], ["caption", "Description (footer)", "rich1"], ["fs", "Text size", "num"]]]],
    quote: [["Color", [["color", "Bar color", "color"]]], ["Text", [TEXT_COLOR, ["text", "Quote", "rich"], ["fs", "Text size", "num"]]], MOTION],
    textbar: [["Colors", [["color", "Bar color", "color"], ["color2", "End cap color", "color-auto"]]],
      ["Text", [TEXT_COLOR, ["label", "Text", "rich1"], ["titlePos", "Text position", ["start", "end"]], ["fs", "Text size", "num"]]], MOTION],
    list: [["Color", [["color", "Bullet color", "color"]]], ["Text", [TEXT_COLOR, ["text", "Items, one per line", "rich"], ["fs", "Text size", "num"]]], MOTION],
    cascade: [["Colors", [["color", "Number color", "color"], ["color2", "Highlight color", "color"]]],
      ["Shape", [["columns", "Columns", "int"], ["fs", "Text size", "num"]]],
      ["Motion", [["numMotion", "Motion", ["scroll", "fill", "sweep", "shift", "update", "still"]],
        ["highlights", "Highlighted numbers", ["fixed", "move", "none"]], ["seed", "Pattern (any number)", "int"]]]],
    gauge: [
      ["Colors", [["color", "Bracket color", "color"], ["color2", "Accent color", "color"], ["color3", "Second accent", "color"],
        ["scolor", "Scale color", "color"], ["dcolor", "Pointer color", "color", POINTER_ON]]],
      ["Shape", [TURN, ["side", "Side", ["left", "right"]], ["pointer", "Show pointer", "check"], ["seed", "Pattern (any number)", "int"]]],
      ["Scale", [TEXT_COLOR, ["numbers", "Numbers", ["count", "typed"]],
        ["from", "Start at", "real", COUNTED], ["step", "Step (negative counts down)", "real", COUNTED],
        ["count", "How many numbers", "int", COUNTED], ["digits", "Digits (pads with zeros)", "int", COUNTED],
        ["labels", "Numbers, one per line", "rich", TYPED],
        ["ticks", "Tick marks between numbers", "int"], ["fs", "Text size", "num"]]],
      ["Motion", [["animate", "Pointer drifts up and down", "check", POINTER_ON]]]],
    wave: [
      ["Colors", [["color", "Main color", "color"], ["color2", "Second color", "color"], ["grad", "Blend", ["lines", "height", "across", "solid"]],
        ["fade", "Fade the tips out", "check"], ["color3", "Bracket color", "color", BRACKET_ON],
        ["acolor", "Accent", "color", BRACKET_ON], ["acolor2", "Second accent", "color", BRACKET_ON], ["acolor3", "Third accent", "color", BRACKET_ON]]],
      ["Shape", [TURN, ["shape", "Shape", ["diamond", "oval", "flat"]], ["lines", "Lines", "int"], ["thick", "Line thickness (% of the space per line)", "int"],
        ["bracket", "Show brackets", "check"], ["blocks", "Accent blocks", ["even", "pattern", "random"], BRACKET_ON],
        ["seed", "Pattern (any number)", "int", BLOCKS_SEEDED], ["mirror", "Same blocks on both sides", "check", BLOCKS_VARIED]]],
      ["Motion", [["motion", "Motion", ["voice", "pulse", "ripple", "still"]], ["speed", "Speed (1 = normal)", "real"]]]],
    insignia: [["Color", [["color", "Color", "color"]]],
      ["Description", [["alt", "Description for screen readers (blank if it's decoration)", "text"]]], MOTION],
  };
  const OPTION_NAMES = {
    turn: { 0: "Upright", 90: "90° clockwise", 180: "Upside down", 270: "90° counter-clockwise" },
    rot: { 0: "Upright", 90: "90° clockwise", 180: "Upside down", 270: "90° counter-clockwise" },
    imgMode: { keep: "Keep image shape (frame follows the picture)", crop: "Fill and crop (zoom and position)", fit: "Show whole image" },
    side: { left: "Left of the bracket", right: "Right of the bracket" },
    numbers: { count: "Counted (start, step)", typed: "Typed in (any text, colors)" },
    flow: {
      console: "Console: rails slide apart, the frame grows out of its elbows, then the content",
      spread: "Spread: colour floods out from the top left", none: "None: the page just appears",
    },
    beep: { key: "Keypress (TNG console)", tap: "Panel tap", chirp: "Chirp", padd: "PADD beep", none: "None" },
    highlights: { fixed: "Fixed (set by the Pattern)", move: "Come and go at random", none: "None" },
    numMotion: {
      scroll: "Scroll (the columns drift up)", fill: "Fill (rows type in, hold, then refill)",
      sweep: "Sweep (rows type in, a highlight band moves down, then refill)",
      shift: "Shift (a column at a time slides)", update: "Update (numbers change in place)", still: "Still",
    },
    variant: { "bracket-left": "Bracket on the left", "bracket-right": "Bracket on the right", twin: "Twin brackets", viewscreen: "Viewscreen corners" },
    grad: { lines: "Along each line (main color in the middle)", height: "By height (main color across the middle)", across: "Left to right", solid: "Main color only" },
    shape: { diamond: "Diamond", oval: "Oval", flat: "Even (every line the same)" },
    blocks: { even: "Even (three the same size)", pattern: "Patterned (set by a number)", random: "Random (new each time the page opens)" },
    motion: { voice: "Voice (bursts and pauses)", pulse: "Pulse (a slow breath)", ripple: "Ripple (waves travel across)", still: "Still" },
  };

  const SECTIONS_KEY = "trektext-builder:closed-sections";
  const OPENED_KEY = "trektext-builder:opened-sections"; // sections that start closed, opened since
  const storedSet = (key) => {
    try { return new Set(JSON.parse(localStorage.getItem(key)) || []); } catch { return new Set(); }
  };
  const closedSections = storedSet(SECTIONS_KEY);
  const openedSections = storedSet(OPENED_KEY);

  /** A collapsible panel section; which ones are open is remembered (closed: it starts closed). */
  function section(title, nodes, { row = false, closed = false } = {}) {
    const box = document.createElement("details");
    box.className = "section";
    box.open = closed ? openedSections.has(title) : !closedSections.has(title);
    const head = document.createElement("summary");
    head.textContent = title;
    const body = document.createElement("div");
    body.className = row ? "section-body row" : "section-body";
    body.append(...nodes);
    box.append(head, body);
    box.addEventListener("toggle", () => {
      const [set, key] = closed ? [openedSections, OPENED_KEY] : [closedSections, SECTIONS_KEY];
      if (box.open === closed) set.add(title);
      else set.delete(title);
      try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* storage unavailable */ }
    });
    return box;
  }

  function renderInspector() {
    if (multi()) return renderSeveral();
    const p = selected();
    inspector.replaceChildren();
    if (!p) return renderPageSettings();

    const h = document.createElement("h2");
    // Name the piece as its button in the Pieces list does.
    h.textContent = `${document.querySelector(`.tool[data-type="${p.type}"]`)?.textContent ?? p.type} ${p.id}`;
    inspector.append(h);
    if (p.rot && !TURNABLE.has(p.type)) {
      const turned = document.createElement("div");
      turned.className = "actions tight";
      turned.append(actionButton(`Clear rotation (${p.rot}°)`, "orange", clearRotation));
      inspector.append(turned);
    }

    // Every piece can open a group when it's clicked (its Action), and be in one (its Opening).
    const own = SECTIONS[p.type];
    const action = own.some(([title]) => title === "Action") ? [] : [["Action", []]];
    for (const [title, fields, opts] of [...own, ...action, ["Opening", []], POSITION]) {
      if (title === "Opening") {
        inspector.append(section(title, [stepField([p]), groupField([p])]));
        continue;
      }
      const shown = fields.filter(([, , , o]) => !o?.when || o.when(p));
      const nodes = shown.map(([key, text, kind]) => field(p, key, text, kind));
      if (title === "Action") nodes.push(opensField(p));
      inspector.append(section(title, nodes, opts));
    }
  }

  /** Several pieces selected: what they share (their Opening step), and how to work with them. */
  function renderSeveral() {
    const pieces = selectedPieces();
    inspector.replaceChildren();
    const h = document.createElement("h2");
    h.textContent = `${pieces.length} pieces selected`;
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = "Drag any of them to move them all; the arrows nudge them. Copy, cut, paste, duplicate and delete work on all of them. " +
      "Shift-click a piece to add it or take it out; Esc selects nothing. Ctrl+G puts them in a group.";
    inspector.append(h, section("Opening", [stepField(pieces), groupField(pieces)]), section("Help", [note]));
  }

  /**
   * The Opening step of these pieces. Blank: they come in as usual, with the
   * frame or with the content. 1, 2, 3 ...: they come in after that, in order
   * (the page's Opening settings time each step).
   */
  function stepField(pieces) {
    const wrap = document.createElement("label");
    wrap.className = "field";
    const cap = document.createElement("span");
    cap.textContent = "Opening step (blank: as usual · 1, 2, 3 ... come in after, in order · in a group: the order it grows in)";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.step = "1";
    input.dataset.key = "openStep";
    const now = new Set(pieces.map((p) => p.openStep ?? ""));
    if (now.size === 1) input.value = [...now][0];
    else input.placeholder = "mixed";
    input.addEventListener("change", () => {
      const n = Math.round(Number(input.value));
      for (const p of pieces) {
        if (input.value === "" || !(n >= 1)) delete p.openStep;
        else p.openStep = n;
        renderPiece(p, { inner: false });
      }
      if (input.value !== "" && !(n >= 1)) input.value = "";
      commit();
    });
    wrap.append(cap, input);
    return wrap;
  }

  /*
   * Groups. Pieces in a group stay hidden on the published page until a piece
   * that opens the group is clicked; then the group grows in (lcars/flow.js),
   * and clicking again closes it. In the builder they're always shown (hide
   * one while you edit what's under it: the page's Groups section, or the menu).
   */
  /** The group these pieces are in (blank: none); type a new name or pick one of the page's. */
  function groupField(pieces) {
    const wrap = document.createElement("label");
    wrap.className = "field";
    const cap = document.createElement("span");
    cap.textContent = "Group (blank: none · hidden until something opens it)";
    const input = document.createElement("input");
    input.type = "text";
    input.spellcheck = false;
    input.dataset.key = "group";
    const list = document.createElement("datalist");
    list.id = "group-names";
    for (const g of groupsOf()) list.append(new Option(g, g));
    input.setAttribute("list", list.id);
    const now = new Set(pieces.map((p) => p.group ?? ""));
    if (now.size === 1) input.value = [...now][0];
    else input.placeholder = "mixed";
    input.addEventListener("change", () => setGroup(pieces, input.value));
    wrap.append(cap, input, list);
    return wrap;
  }

  /** Put these pieces in a group (blank: in none). */
  function setGroup(pieces, name) {
    name = groupName(name);
    for (const p of pieces) {
      if (name) p.group = name;
      else delete p.group;
      renderPiece(p, { inner: false });
    }
    commit();
    renderInspector();
  }

  /** What clicking this piece does to a group: open it (and close it, clicked again). */
  function opensField(p) {
    const wrap = document.createElement("label");
    wrap.className = "field";
    const cap = document.createElement("span");
    const groups = groupsOf();
    cap.textContent = !groups.length ? "Clicking it opens a group · make one first (Ctrl+G)"
      : p.type === "button" ? "Clicking it opens a group (instead of its link), again closes it"
        : "Clicking it opens a group, again closes it";
    const pick = document.createElement("select");
    pick.dataset.key = "opens";
    pick.add(new Option("Nothing", ""));
    for (const g of new Set([...groups, ...(p.opens ? [p.opens] : [])])) pick.add(new Option(g, g));
    pick.value = p.opens || "";
    pick.addEventListener("change", () => {
      if (pick.value) p.opens = pick.value;
      else delete p.opens;
      renderPiece(p, { inner: false });
      commit();
    });
    wrap.append(cap, pick);
    return wrap;
  }

  /** Put the selected pieces in a group, named here (Ctrl+G). */
  function groupSelection() {
    const pieces = selectedPieces();
    if (!pieces.length) return;
    if (editing) finishEdit(true);
    const shared = new Set(pieces.map((p) => p.group || ""));
    const taken = groupsOf();
    let n = taken.length + 1;
    while (taken.includes(`GROUP ${n}`)) n++;
    const suggest = shared.size === 1 && [...shared][0] ? [...shared][0] : `GROUP ${n}`;
    const name = groupName(prompt("NAME THE GROUP. ITS PIECES STAY HIDDEN UNTIL SOMETHING OPENS IT.", suggest) ?? "");
    if (!name) return;
    setGroup(pieces, name);
    toast(`${pieces.length} piece${pieces.length > 1 ? "s" : ""} in ${name}. To open it, choose a piece's Action: "Clicking it opens a group".`);
  }

  /** Take the selected pieces out of their groups (Ctrl+Shift+G). */
  function ungroupSelection() {
    const pieces = selectedPieces().filter((p) => p.group);
    if (pieces.length) setGroup(pieces, "");
  }

  /** Every piece in the selected pieces' groups (or in this group). */
  function selectGroup(name = selectedPieces().find((p) => p.group)?.group) {
    if (!name) return;
    veiled.delete(name);
    for (const p of doc.pieces) if (p.group === name) renderPiece(p, { inner: false });
    setPicked(doc.pieces.filter((p) => p.group === name).map((p) => p.id));
  }

  /** Hide a group on the board while editing (to get at what's under it), or show it again. */
  function veilGroup(name = selectedPieces().find((p) => p.group)?.group, hide = !veiled.has(name)) {
    if (!name) return;
    if (hide) veiled.add(name);
    else veiled.delete(name);
    if (hide) setPicked(selectedPieces().filter((p) => p.group !== name).map((p) => p.id));
    for (const p of doc.pieces) if (p.group === name) renderPiece(p, { inner: false });
    if (!selectedPieces().length) renderInspector();
  }

  function showAllGroups() {
    for (const name of [...veiled]) veilGroup(name, false);
  }

  /** Rename a group, and every piece that opens it. */
  function renameGroup(from, to) {
    to = groupName(to);
    if (!to || to === from) return renderInspector();
    if (veiled.delete(from)) veiled.add(to);
    for (const p of doc.pieces) {
      if (p.group === from) p.group = to;
      if (p.opens === from) p.opens = to;
      if (p.group === to || p.opens === to) renderPiece(p, { inner: false });
    }
    commit();
    renderInspector();
  }

  /** The page's groups: rename, select, hide while editing, ungroup. */
  function groupSettings() {
    const groups = groupsOf();
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = groups.length
      ? "On the published page a group stays hidden until a piece that opens it is clicked; then it grows in (its pieces' Opening steps in order), " +
        "and clicking again closes it. A group that overlaps one opening closes first, so groups in the same place take turns. " +
        "Opened from a picture, the group's pictures grow out of it."
      : "Select pieces and press Ctrl+G (or Group in the menu) to make a group: it stays hidden on the published page until a piece that " +
        "opens it is clicked (that piece's Action), then grows in. Use it for details, pop-up panels, or a picture that grows to full size.";
    const out = [note];
    for (const name of groups) {
      const count = doc.pieces.filter((p) => p.group === name).length;
      const openers = doc.pieces.filter((p) => p.opens === name).length;
      const box = document.createElement("div");
      box.className = "step-box";
      const head = document.createElement("h3");
      head.textContent = `${name} · ${count} piece${count > 1 ? "s" : ""} · ` +
        (openers ? `opened by ${openers} piece${openers > 1 ? "s" : ""}` : "nothing opens it yet");
      const rename = document.createElement("label");
      rename.className = "field";
      const cap = document.createElement("span");
      cap.textContent = "Name";
      const input = document.createElement("input");
      input.type = "text";
      input.spellcheck = false;
      input.value = name;
      input.addEventListener("change", () => renameGroup(name, input.value));
      rename.append(cap, input);
      const actions = document.createElement("div");
      actions.className = "actions tight";
      actions.append(
        actionButton("Select", "blue", () => selectGroup(name)),
        actionButton(veiled.has(name) ? "Show on the board" : "Hide while editing", "orange", () => { veilGroup(name); renderInspector(); }),
        actionButton("Ungroup", "rose", () => setGroup(doc.pieces.filter((p) => p.group === name), "")),
      );
      box.append(head, rename, actions);
      out.push(box);
    }
    return out;
  }

  function renderPageSettings() {
    inspector.innerHTML = `<h2>Page</h2>`;
    const row = document.createElement("div");
    row.className = "row three";
    row.append(field(doc, "cols", "Columns", "int", { page: true }), field(doc, "rows", "Rows", "int", { page: true }),
      field(doc, "cell", "Cell size", "int", { page: true }));

    // Screen preset: sets columns and rows, and shows "Custom" for any other shape.
    const screen = document.createElement("label");
    screen.className = "field";
    const cap = document.createElement("span");
    cap.textContent = "Screen";
    const pick = document.createElement("select");
    const screens = [...SCREENS, thisWindow()];
    for (const s of screens) pick.add(new Option(s.name, s.id));
    pick.add(new Option("Custom", "custom"));
    screen.append(cap, pick);

    const note = document.createElement("p");
    note.className = "note";
    const sync = () => {
      pick.value = screens.find((s) => s.cols === doc.cols && s.rows === doc.rows)?.id ?? "custom";
      for (const key of ["cols", "rows"]) {
        const input = row.querySelector(`[data-key="${key}"]`);
        if (input && document.activeElement !== input) input.value = doc[key];
      }
      const ratio = (doc.cols / doc.rows).toFixed(2);
      // Built as text, not HTML: the sizes come from the page, which may come from a file.
      const kbd = document.createElement("kbd");
      kbd.textContent = "Ctrl+V";
      note.replaceChildren(
        `The board is ${doc.cols} × ${doc.rows} cells (${ratio}:1), ${doc.cols * doc.cell} × ${doc.rows * doc.cell} design pixels. ` +
          `It scales to fit any window, with black bars where the window's shape differs.`,
        document.createElement("br"), document.createElement("br"),
        "Bars and buttons are usually 4 cells high, with 1-cell gaps.",
        document.createElement("br"), document.createElement("br"),
        "Select a piece to edit it, or drag one in from the left. ", kbd, " pastes a piece you copied.");
    };
    pick.addEventListener("change", () => {
      const s = screens.find((x) => x.id === pick.value);
      if (!s) return sync();
      Object.assign(doc, { cols: s.cols, rows: s.rows });
      applyVars(board, { "--cols": doc.cols, "--rows": doc.rows, "--cell": doc.cell });
      sync();
      commit();
    });
    row.addEventListener("input", sync);
    sync();
    // The page's file name, which links use (name.html).
    const fileWrap = document.createElement("label");
    fileWrap.className = "field";
    const fileCap = document.createElement("span");
    fileCap.textContent = "File name (links use name.html)";
    const fileInputEl = document.createElement("input");
    fileInputEl.type = "text";
    fileInputEl.spellcheck = false;
    fileInputEl.value = doc.file;
    fileInputEl.addEventListener("change", () => {
      renamePage(doc, fileInputEl.value);
      fileInputEl.value = doc.file;
    });
    fileWrap.append(fileCap, fileInputEl);

    const pageActions = document.createElement("div");
    pageActions.className = "actions";
    pageActions.append(
      actionButton("New page", "blue", () => addPage()),
      actionButton("Duplicate page", "blue", () => addPage(doc)),
      actionButton("Delete page", "rose", deletePage),
    );

    inspector.append(section("Page", [field(doc, "title", "Page title", "text", { page: true }), fileWrap, screen, row, pageActions]),
      section("Opening", openingSettings()), section("Sounds", soundSettings()), section("Groups", groupSettings()), section("Publish", exportSettings()),
      section("Help", [note, shortcutList()]));
  }

  /*
   * Opening times show in milliseconds (250, not 0.25); pages keep them in
   * seconds, as lcars/flow.js reads them, so files and published pages don't change.
   */
  const toMs = (s) => Math.round(s * 1000);
  const fromMs = (ms) => Math.round(ms) / 1000;

  /**
   * The page's opening animation: its style, and its steps, each with an
   * optional start time and sound. The opening's sounds have their own
   * section (soundSettings).
   */
  function openingSettings() {
    const out = [field(doc, "flow", "Opening (how the page appears)", ["console", "spread", "none"], { page: true })];
    const rebuild = () => { commit(); renderInspector(); };

    // The steps on this page, from their pieces.
    const counts = new Map();
    for (const p of doc.pieces) if (p.openStep && !p.group) counts.set(p.openStep, (counts.get(p.openStep) || 0) + 1); // a group's steps are its own
    const nums = [...counts.keys()].sort((a, b) => a - b);
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = nums.length
      ? "After the frame and the rest of the content, each step comes in, in order. With sound they share the time until it ends; " +
        "a start time (milliseconds from the beginning) sets a step's own."
      : "To bring pieces in later, give them an Opening step in their panel (select several to set them together).";
    out.push(note);
    doc.steps ||= {};
    for (const n of nums) {
      const conf = doc.steps[n] || {};
      const box = document.createElement("div");
      box.className = "step-box";
      const head = document.createElement("h3");
      head.textContent = `Step ${n} · ${counts.get(n)} piece${counts.get(n) > 1 ? "s" : ""}`;
      const at = document.createElement("label");
      at.className = "field";
      const atCap = document.createElement("span");
      atCap.textContent = "Starts at (ms; blank: shared out)";
      const atInput = document.createElement("input");
      atInput.type = "number";
      atInput.min = "0";
      atInput.step = "50";
      atInput.placeholder = "auto";
      atInput.value = conf.at == null ? "" : toMs(conf.at);
      atInput.addEventListener("change", () => {
        const v = Number(atInput.value);
        const step = { ...(doc.steps[n] || {}) };
        if (atInput.value === "" || !(v >= 0)) delete step.at;
        else step.at = fromMs(v);
        if (Object.keys(step).length) doc.steps[n] = step;
        else delete doc.steps[n];
        commit();
      });
      at.append(atCap, atInput);
      box.append(head, at, soundPicker(conf.sound || "", (src) => {
        const step = { ...(doc.steps[n] || {}) };
        if (src) step.sound = src;
        else delete step.sound;
        if (Object.keys(step).length) doc.steps[n] = step;
        else delete doc.steps[n];
        rebuild();
      }, "Sound as it comes in"));
      out.push(box);
    }
    return out;
  }

  /**
   * The opening's sounds, one line each: name, start time (milliseconds), Remove.
   * First the lead sound, the one the opening is timed to (the built-in
   * power-up, or a page's own file from before this list), starting at 0;
   * then the sounds layered over it. Add sound under them all, and Add
   * power-up when the page has no lead sound.
   */
  function soundSettings() {
    doc.layers ||= [];
    const rebuild = () => { commit(); renderInspector(); };
    const out = [];
    const list = document.createElement("div");
    list.className = "sound-list";
    const line = (name, at, onRemove, title = name) => {
      const row = document.createElement("div");
      row.className = "sound-row";
      const label = document.createElement("span");
      label.className = "sound-name";
      label.textContent = name;
      label.title = title;
      const unit = document.createElement("span");
      unit.className = "sound-unit";
      unit.textContent = "ms";
      const remove = actionButton("Remove", "rose", onRemove);
      remove.setAttribute("aria-label", `Remove ${name}`);
      row.append(label, at, unit, remove);
      list.append(row);
    };
    const timeInput = (value, name) => {
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "50";
      input.value = toMs(value);
      input.setAttribute("aria-label", `${name}: starts at, in milliseconds`);
      return input;
    };

    if (doc.sound && (doc.soundFile || playsPowerUp(doc))) {
      const name = doc.soundFile ? doc.soundFile.slice("sounds/".length) : "Power-up (built in)";
      const at = timeInput(0, name);
      at.disabled = true; // the opening is timed from it
      line(name, at, () => { doc.sound = false; doc.soundFile = ""; rebuild(); }, `${name}: the opening is timed to this sound`);
    }
    for (const layer of doc.layers) {
      const name = layer.sound.slice("sounds/".length);
      const at = timeInput(layer.at, name);
      at.addEventListener("change", () => {
        const v = Number(at.value);
        layer.at = v >= 0 ? fromMs(v) : 0;
        at.value = toMs(layer.at);
        commit();
      });
      line(name, at, () => { doc.layers.splice(doc.layers.indexOf(layer), 1); rebuild(); });
    }
    if (list.children.length) out.push(list);
    else {
      const note = document.createElement("p");
      note.className = "note";
      note.textContent = "The opening plays silently.";
      out.push(note);
    }

    // Add: LCARS buttons; Add sound opens the file chooser.
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*,.mp3,.wav,.ogg,.m4a";
    input.hidden = true;
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      const src = await imageSrcFor(file, "sounds");
      attach(src, file);
      doc.layers.push({ sound: src, at: 0 });
      rebuild();
    });
    const actions = document.createElement("div");
    actions.className = "actions tight";
    actions.append(actionButton("Add sound", "orange", () => input.click()));
    // The power-up belongs to the start screen alone.
    if (isStartScreen() && !doc.sound) actions.append(actionButton("Add power-up", "blue", () => { doc.sound = true; doc.soundFile = ""; rebuild(); }));
    actions.append(input);
    out.push(actions);
    return out;
  }

  /** Choose a sound file (kept in the project, published in sounds/), or take it away. */
  function soundPicker(current, onPick, caption = "Sound file") {
    const wrap = document.createElement("label");
    wrap.className = "field";
    const cap = document.createElement("span");
    cap.textContent = current ? `${caption}: ${current.slice("sounds/".length)}` : caption;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*,.mp3,.wav,.ogg,.m4a";
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      const src = await imageSrcFor(file, "sounds");
      attach(src, file);
      onPick(src);
    });
    wrap.append(cap, input);
    if (!current) return wrap;
    const actions = document.createElement("div");
    actions.className = "actions tight";
    actions.append(actionButton("No sound", "rose", () => onPick("")));
    const box = document.createElement("div");
    box.append(wrap, actions);
    return box;
  }

  /** Every keyboard shortcut, for the Help section (the menus, top left, have them too). */
  function shortcutList() {
    const list = document.createElement("dl");
    list.className = "keys";
    for (const [keys, what] of SHORTCUTS) {
      const dt = document.createElement("dt");
      dt.textContent = keys;
      const dd = document.createElement("dd");
      dd.textContent = what;
      list.append(dt, dd);
    }
    return list;
  }
  const SHORTCUTS = [
    ["Click · Shift-click", "Select a piece · add or take one out"],
    ["Drag on empty board", "Select the pieces in a box"],
    ["Ctrl+A · Esc", "Select all · select nothing"],
    ["Arrows (Shift: 4)", "Nudge"],
    ["Ctrl+C · Ctrl+X · Ctrl+V", "Copy · cut · paste (on any page)"],
    ["Ctrl+D · Del", "Duplicate · delete"],
    ["Ctrl+] · Ctrl+[", "Bring forward · send back"],
    ["Ctrl+G · Ctrl+Shift+G", "Group · ungroup"],
    ["H · V", "Flip an elbow"],
    ["Double-click · Enter", "Edit a label on the board"],
    ["Ctrl+Z · Ctrl+Y", "Undo · redo"],
    ["Ctrl+S · Ctrl+Shift+S", "Save · save as"],
    ["Ctrl+O · Ctrl+Shift+N", "Open · new window (app)"],
  ];

  /** Text-as-shapes switch, which font file it uses, and a way to choose one. */
  function exportSettings() {
    const status = document.createElement("p");
    status.className = "note";
    const show = (font) => {
      status.textContent = font
        ? `Using ${font.name} (${font.source}). Exported pages draw their text with it, so they look the same ` +
          `on every computer without the font. PADD text stays live.`
        : APP
          ? "No font yet. Choose your copy of the LCARS font once; the app keeps a copy on this computer (it's never " +
            "exported). Until then, text exports as live text and visitors see Antonio."
          : "No font file found in the fonts folder. Choose your copy of the LCARS font to export text as shapes; " +
            "otherwise visitors see Antonio.";
    };
    status.textContent = "Looking for the font file...";
    if (window.lcarsOutline) lcarsOutline.getFont(fontSource()).then(show, () => show(null));
    else status.textContent = "The outline tools did not load, so text exports as live text.";
    const choose = actionButton("Choose font file", "blue", async () => {
      try {
        if (APP) {
          if (!(await appCall("choose_font"))) return;
          lcarsOutline.forget();
          const font = await lcarsOutline.getFont(fontSource());
          if (!font) throw new Error("not a font this tool can read");
          await useAppFont();
          show(font);
          toast(`Using ${font.name}`);
          return;
        }
        const font = await lcarsOutline.chooseFont({ postscriptNames: FONT_PS_NAMES });
        if (font) {
          show(font);
          toast(`Using ${font.name}`);
        }
      } catch (err) {
        toast(`Could not read that font: ${err.message}`);
      }
    });
    const actions = document.createElement("div");
    actions.className = "actions tight";
    actions.append(choose);
    return [field(doc, "textShapes", "Publish text as shapes", "check", { page: true }), status, actions];
  }

  function actionButton(text, color, fn) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `pill ${color}`;
    b.textContent = text;
    b.addEventListener("click", fn);
    return b;
  }

  function field(target, key, text, kind, opts = {}) {
    const block = kind === "textcolor" || kind === "flip" || String(kind).startsWith("rich") || String(kind).startsWith("color");
    const wrap = document.createElement(block ? "div" : "label");
    wrap.className = kind === "check" ? "check" : "field";

    const update = (value, final) => {
      if (key === "pointer" && target.type === "gauge" && value !== (target.pointer !== false)) resizeForPointer(target, value);
      if (key === "rot") turnPiece(target, value);
      // Typing in numbers starts from the counted ones, ready to recolor or change.
      if (key === "numbers" && value === "typed" && target.numbers === "count") target.labels = countedLabels(target);
      target[key] = value;
      if (opts.page) {
        // Resize the board in place; rebuilding the panel would steal focus mid-typing.
        if (key !== "title") applyVars(board, { "--cols": doc.cols, "--rows": doc.rows, "--cell": doc.cell });
        else renderPagePick();
        if (key === "cell") for (const p of doc.pieces) if (p.type === "elbow") renderPiece(p);
      } else {
        renderPiece(target);
        if (key === "fs" || key === "fit") fitToText(target);
        if (["imgMode", "bar", "variant", "caption", "fs", "turn"].includes(key) && applyAspect(target)) renderPiece(target, { inner: false });
        syncSelection();
        if (key === "color") syncEditors(target); // filled pieces' editors show the fill
        if (["imgMode", "pointer", "numbers", "bracket", "blocks", "blink"].includes(key)) renderInspector(); // show or hide the controls that depend on it
      }
      if (final) commit();
    };

    if (kind === "check") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!target[key];
      input.addEventListener("change", () => update(input.checked, true));
      wrap.append(input, document.createTextNode(text));
      return wrap;
    }

    if (kind === "flip") {
      wrap.className = "actions tight";
      wrap.append(actionButton("Flip horizontal", "orange", () => flip("h")), actionButton("Flip vertical", "orange", () => flip("v")));
      return wrap;
    }

    const cap = document.createElement("span");
    cap.textContent = text;
    wrap.append(cap);

    if (kind === "textcolor") {
      const autoTitle = FILLED.has(target.type) ? "Default (black)" : "Default";
      wrap.append(swatches(target[key], true, colorText, { autoTitle }));
      return wrap;
    }
    if (kind === "color" || kind === "color-auto" || kind === "color-none" || kind === "color-dim") {
      const autoTitle = kind === "color-none" ? "None" : kind === "color-dim" ? "Dim (the usual blink)" : undefined;
      wrap.append(swatches(target[key], kind !== "color", (v) => update(v, true), { autoTitle, mark: true }));
      return wrap;
    }
    if (String(kind).startsWith("rich")) {
      wrap.append(richEditor(target, key, { multiline: kind !== "rich1", later: kind === "rich-later" }));
      return wrap;
    }
    if (kind === "file") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*,.svg,.png,.jpg,.jpeg,.gif,.webp,.avif";
      input.addEventListener("change", async () => {
        const file = input.files[0];
        if (!file) return;
        const src = await imageSrcFor(file);
        attach(src, file);
        target.src = src;
        renderPiece(target);
        renderInspector();
        commit();
      });
      wrap.append(input);
      return wrap;
    }

    let input;
    if (Array.isArray(kind)) {
      input = document.createElement("select");
      for (const v of kind) input.add(new Option(OPTION_NAMES[key]?.[v] ?? v, v));
      input.value = target[key] ?? kind[0];
      const numbers = kind.every((v) => typeof v === "number");
      input.addEventListener("change", () => update(numbers ? Number(input.value) : input.value, true));
    } else {
      input = document.createElement("input");
      const isText = kind === "text" || kind === "link";
      input.type = isText ? "text" : "number";
      if (kind === "link") {
        // Offer the site's other pages; any URL can still be typed.
        const list = document.createElement("datalist");
        list.id = `pages-${key}`;
        for (const p of site.pages) if (p !== doc) list.append(new Option(p.title || "", `${p.file}.html`));
        input.setAttribute("list", list.id);
        input.placeholder = "another page, or a URL";
        wrap.append(list);
      }
      if (kind === "int") { input.step = "1"; input.min = ["x", "y", "ticks"].includes(key) ? "0" : "1"; }
      if (kind === "int" && key === "count") input.max = String(MAX_COUNT);
      if (kind === "int" && key === "ticks") input.max = "9";
      if (kind === "real") input.step = "any";
      if (kind === "num") { input.step = "0.5"; input.min = "0"; }
      if (kind === "pct") { input.step = "1"; input.min = "0"; input.max = "100"; }
      if (kind === "zoom") { input.step = "0.05"; input.min = "1"; input.max = "6"; }
      input.value = target[key] ?? "";
      const read = () => (isText ? input.value : Number(input.value));
      input.addEventListener("input", () => {
        const v = read();
        if (!isText && !Number.isFinite(v)) return;
        if (kind === "int" && input.min && v < Number(input.min)) return;
        update(kind === "int" ? Math.round(v) : v, false);
      });
      input.addEventListener("change", () => commit());
    }
    input.dataset.key = key;
    wrap.append(input);
    return wrap;
  }

  /** A row of color swatches. With mark, the ring moves to a picked swatch (for fields whose panel isn't rebuilt). */
  function swatches(current, allowAuto, onPick, { autoTitle, mark } = {}) {
    const box = document.createElement("div");
    box.className = "swatches";
    const add = (value, title, bg) => {
      const b = document.createElement("button");
      b.type = "button";
      b.title = title;
      if (bg) b.style.setProperty("--sw", bg);
      else b.className = "auto";
      b.setAttribute("aria-pressed", String((current || "") === value));
      // Keep any text selection when a swatch is clicked.
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", () => {
        if (mark) for (const other of box.children) other.setAttribute("aria-pressed", String(other === b));
        onPick(value);
      });
      box.append(b);
    };
    if (allowAuto) add("", autoTitle || "Automatic", null);
    const list = palette();
    if (current && HEX.has(current) && !list.some(([n]) => n === current)) list.unshift([current, HEX.get(current)]);
    for (const [name, hex] of list) add(name, name.replace(/-/g, " "), hex);
    return box;
  }

  /* ------------------------------------------------------------------ *
   * Editing commands
   * ------------------------------------------------------------------ */

  /** Mirror an elbow left-right ("h") or top-bottom ("v"). */
  function flip(axis) {
    const p = selected();
    if (!p || p.type !== "elbow") return;
    if (editing) finishEdit(true);
    const [v, h] = p.corner;
    p.corner = axis === "h" ? v + (h === "l" ? "r" : "l") : (v === "t" ? "b" : "t") + h;
    renderPiece(p);
    syncSelection();
    renderInspector();
    commit();
  }

  /**
   * Turn a piece (rot: 0, 90, 180, 270). On its side its width and height
   * trade places, about its middle, so it turns where it is.
   */
  function turnPiece(p, rot) {
    if (((p.rot || 0) - rot) % 180) {
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      [p.w, p.h] = [p.h, p.w];
      p.x = clamp(Math.round(cx - p.w / 2), 0, Math.max(0, doc.cols - p.w));
      p.y = clamp(Math.round(cy - p.h / 2), 0, Math.max(0, doc.rows - p.h));
    }
    p.rot = rot;
  }

  /** Turn the selected waveform or gauge a quarter turn clockwise. */
  function turnSelected() {
    const p = selected();
    if (!p || !TURNABLE.has(p.type)) return;
    turnPiece(p, ((p.rot || 0) + 90) % 360);
    renderPiece(p);
    syncSelection();
    renderInspector();
    commit();
  }

  /** Pages saved while rotation existed: turn a piece back to upright. */
  function clearRotation() {
    const p = selected();
    if (!p || !p.rot) return;
    if (p.rot % 180) [p.w, p.h] = [p.h, p.w];
    p.rot = 0;
    renderPiece(p);
    syncSelection();
    renderInspector();
    commit();
  }

  /** Delete the selected pieces. */
  function remove() {
    const gone = new Set(selectedPieces().map((p) => p.id));
    if (!gone.size) return;
    editing = null;
    doc.pieces = doc.pieces.filter((p) => !gone.has(p.id));
    selectedId = null;
    also.clear();
    renderAll();
    commit();
  }

  /** New copies of `pieces` on this page, `shift` cells down and right (kept on the board), selected. */
  function placeCopies(pieces, shift) {
    const ids = pieces.map((from) => {
      const copy = { ...structuredClone(from), id: `p${doc.nextId++}` };
      copy.x = clamp(from.x + shift, 0, Math.max(0, doc.cols - copy.w));
      copy.y = clamp(from.y + shift, 0, Math.max(0, doc.rows - copy.h));
      doc.pieces.push(copy);
      return copy.id;
    });
    selectedId = ids[0] ?? null;
    also.clear();
    for (const id of ids.slice(1)) also.add(id);
    renderAll();
    commit();
  }

  function duplicate() {
    const pieces = selectedPieces();
    if (!pieces.length) return;
    if (editing) finishEdit(true);
    placeCopies(pieces, 2);
  }

  /*
   * Copy and paste. The clipboard holds copies of the selected pieces with all
   * their settings, plus their pictures, so they paste on any page, or into
   * another project. Each paste lands 2 cells further down and right than the
   * last, so pastes don't hide each other; after a cut, the first paste goes
   * back where the pieces were.
   */
  let clipboard = null; // { pieces, images: Map(src -> File), pastes }

  function copyPiece() {
    const pieces = selectedPieces();
    if (!pieces.length) return false;
    if (editing) finishEdit(true);
    const images = new Map(pieces.filter((p) => attached.has(p.src)).map((p) => [p.src, attached.get(p.src).file]));
    clipboard = { pieces: structuredClone(pieces), images, pastes: 0 };
    toast(`Copied ${pieces.length > 1 ? `${pieces.length} pieces` : `the ${pieces[0].type}`}. Ctrl+V pastes.`);
    return true;
  }

  function cutPiece() {
    if (!copyPiece()) return;
    clipboard.pastes = -1;
    remove();
  }

  function pastePiece() {
    if (!clipboard) return;
    if (editing) finishEdit(true);
    // Pasted into another project: bring the pictures along.
    for (const [src, file] of clipboard.images) {
      attach(src, file);
    }
    placeCopies(clipboard.pieces, 2 * ++clipboard.pastes);
  }

  /** Select every piece on the page. */
  function selectAll() {
    setPicked(doc.pieces.map((p) => p.id));
  }

  /** Move the selected pieces by (dx, dy) cells, all together and all kept on the board. */
  function moveSelection(dx, dy, from = null) {
    const pieces = selectedPieces();
    const start = from || new Map(pieces.map((p) => [p.id, { x: p.x, y: p.y }]));
    const at = (p) => start.get(p.id);
    // Clamp the move as a whole, so the group keeps its shape at the edges.
    const lo = (key) => Math.max(...pieces.map((p) => -at(p)[key]));
    const hi = (key, size, max) => Math.min(...pieces.map((p) => max - p[size] - at(p)[key]));
    dx = clamp(dx, lo("x"), Math.max(lo("x"), hi("x", "w", doc.cols)));
    dy = clamp(dy, lo("y"), Math.max(lo("y"), hi("y", "h", doc.rows)));
    let changed = false;
    for (const p of pieces) {
      const x = at(p).x + dx, y = at(p).y + dy;
      if (x === p.x && y === p.y) continue;
      Object.assign(p, { x, y });
      renderPiece(p, { inner: false });
      changed = true;
    }
    syncSelection();
    return changed;
  }

  function restack(dir) {
    const i = doc.pieces.findIndex((p) => p.id === selectedId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= doc.pieces.length) return;
    if (editing) finishEdit(true);
    [doc.pieces[i], doc.pieces[j]] = [doc.pieces[j], doc.pieces[i]];
    renderAll();
    commit();
  }

  document.addEventListener("keydown", (e) => {
    const typing = e.target.closest?.("input, textarea, select") || e.target.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;
    if (APP && mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === "n") {
      e.preventDefault();
      COMMANDS.newWindow();
      return;
    }
    if (splashOpen) {
      if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        openFile();
      }
      return;
    }
    if (mod && !e.altKey && ["s", "o"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      if (e.key.toLowerCase() === "o") openFile();
      else savePage(e.shiftKey);
      return;
    }
    if (typing) return;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (mod && !e.altKey && e.key.toLowerCase() === "v" && clipboard) { e.preventDefault(); pastePiece(); return; }
    if (mod && !e.altKey && e.key.toLowerCase() === "a") { e.preventDefault(); selectAll(); return; }
    if (!selectedPieces().length) return;
    // Copy and cut take the pieces, unless some text on the screen is selected to copy instead.
    if (mod && !e.altKey && ["c", "x"].includes(e.key.toLowerCase()) && (getSelection()?.isCollapsed ?? true)) {
      e.preventDefault();
      e.key.toLowerCase() === "c" ? copyPiece() : cutPiece();
      return;
    }
    const step = e.shiftKey ? 4 : 1;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      if (moveSelection(...moves[e.key])) {
        if (!multi()) renderInspector();
        commit();
      }
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(); return; }
    if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(); return; }
    if (mod && !e.altKey && e.key.toLowerCase() === "g") { e.preventDefault(); e.shiftKey ? ungroupSelection() : groupSelection(); return; }
    if (e.key === "Escape") { select(null); return; }
    const p = selected();
    if (!p) return; // the rest are for one piece
    if (mod && (e.key === "]" || e.key === "[")) {
      e.preventDefault();
      restack(e.key === "]" ? 1 : -1);
    } else if (!mod && p.type === "elbow" && ["h", "v"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      flip(e.key.toLowerCase());
    } else if ((e.key === "Enter" || e.key === "F2") && HAS_LABEL.has(p.type)) {
      e.preventDefault();
      startEdit(p);
    }
  });

  /* ------------------------------------------------------------------ *
   * Save, open, preview and export
   * ------------------------------------------------------------------ */

  function pageCSS(page = doc) {
    const lines = [`/* Generated by POLARIS. */`,
      `.lcars-board { --cols: ${page.cols}; --rows: ${page.rows}; --cell: ${page.cell}; }`];
    for (const p of page.pieces) {
      const vars = Object.entries(pieceVars(p)).map(([k, v]) => `${k}: ${v};`).join(" ");
      lines.push(`#${p.id} { ${vars} }`);
    }
    return lines.join("\n") + "\n";
  }

  /**
   * A page as HTML. `shapes` (from textShapes) swaps in pieces whose text is
   * drawn as outlines. Exported pages link their own stylesheet, name.css.
   */
  /**
   * The board's opening: its style, its sound (the power-up, or a file of the
   * project's), and its steps' times and sounds. url turns sounds/name into
   * where the page finds it.
   */
  function flowAttrs(page, url = (src) => src) {
    if (!page.flow || page.flow === "none") return "";
    let attrs = ` data-flow="${esc(page.flow)}"`;
    if (page.sound && page.soundFile) attrs += ` data-flow-sound="${esc(url(page.soundFile))}"`;
    else if (playsPowerUp(page)) attrs += " data-flow-sound";
    const steps = Object.entries(page.steps || {}).map(([n, c]) => [n, { ...c, ...(c.sound ? { sound: url(c.sound) } : {}) }]);
    if (steps.length) attrs += ` data-flow-steps="${esc(JSON.stringify(Object.fromEntries(steps)))}"`;
    const layers = (page.layers || []).map((l) => ({ ...l, sound: url(l.sound) }));
    if (layers.length) attrs += ` data-flow-layers="${esc(JSON.stringify(layers))}"`;
    return attrs;
  }
  /**
   * The sounds a button can make, from lcars/sounds/ (TrekCore's TNG console
   * sounds, as the opening's key presses are). The PADD beep is the one built
   * into trek-padd.js, which plays anything marked data-beep.
   */
  const BEEPS = { key: "lcars/sounds/press-key2.mp3", tap: "lcars/sounds/press-tap.mp3", chirp: "lcars/sounds/press-chirp.mp3", padd: "" };
  /** A button's sound, as an attribute; url turns lcars/... into where the page finds it. */
  const beepAttr = (p, url = (path) => path) => {
    if (p.type !== "button" || !(p.beep in BEEPS)) return "";
    return BEEPS[p.beep] ? ` data-beep="${esc(url(BEEPS[p.beep]))}"` : " data-beep";
  };
  /** A runtime file (lcars/...) as the builder itself loads it: for previews and the start screen. */
  const libURL = (path) => new URL(LIB_FILES[path], location.href).href;

  /** A piece's Opening step, its group, and the group it opens (an opener acts as a button: focusable, Enter or Space). */
  const pieceAttrs = (p) => (p.openStep ? ` data-step="${p.openStep}"` : "") + (p.group ? ` data-group="${esc(p.group)}"` : "") +
    (p.opens ? ` data-opens="${esc(p.opens)}" role="button" tabindex="0" aria-expanded="false"` : "");

  function pageHTML({ preview = false, shapes = null, page = doc, clock = "" } = {}) {
    const lib = (path) => (preview ? libURL(path) : path);
    const pieces = page.pieces.map((p) => {
      const isLink = p.type === "button" && !p.opens && safeHref(p.href);
      const tag = isLink ? "a" : "div";
      const href = isLink ? ` href="${esc(safeHref(p.href))}"` : "";
      const beep = beepAttr(p, preview ? libURL : undefined);
      const glyphs = shapes?.glyphs ? GLYPHS_ID : null;
      const inner = shapes?.inners.get(p.id) ?? pieceInner(p, page.cell, preview ? { imageURL: imageURLFor(page), glyphs } : { glyphs });
      return `      <${tag} id="${esc(p.id)}" class="${esc(pieceClasses(p))}"${href}${beep}${pieceAttrs(p)}>${inner}</${tag}>`;
    }).join("\n");
    const css = preview ? `<style>\n${pageCSS(page)}${shapes?.css ?? ""}</style>` : `<link rel="stylesheet" href="${esc(page.file || "page")}.css">`;
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">${clock ? `
  <script src="${esc(clock)}"></script>` : ""}
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(page.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Antonio&display=swap">
  <link rel="stylesheet" href="${lib("lcars/palette.css")}">
  <link rel="stylesheet" href="${lib("lcars/pieces.css")}">
  ${css}
  <script src="${lib("lcars/pieces.js")}"></script>
  <script src="${lib("lcars/waveform.js")}"></script>
  <script src="${lib("lcars/flow.js")}"></script>
  <script src="${lib("lcars/trek-padd.js")}"></script>${preview ? PREVIEW_LINKS : ""}
</head>
<body class="lcars-body">
  ${shapes?.defs ?? ""}${shapes?.glyphs ? glyphScript(shapes.glyphs) : ""}
  <main class="lcars-screen">
    <div class="lcars-board"${flowAttrs(page, preview ? (src) => attached.get(src)?.url ?? src : undefined)}>
${pieces}
    </div>
  </main>
</body>
</html>
`;
  }

  /** In a preview, links to the site's own pages open that page's preview (asked of the builder). */
  const PREVIEW_LINKS = `
  <script>
    addEventListener("click", (e) => {
      const a = e.target.closest?.("a[href]");
      const m = a && a.getAttribute("href").match(/^([\\w-]+)\\.html$/);
      const builder = (window.opener || (parent !== window && parent.opener))?.lcarsBuilder; // the page sits in Preview's frame
      if (!m || !builder?.previewPage) return;
      e.preventDefault();
      builder.previewPage(m[1], window);
    }, true);
  </script>`;

  /** The PADDs' letter shapes, read by <trek-padd glyphs="..."> (see trek-padd.js). */
  const GLYPHS_ID = "lcars-glyphs";
  const glyphScript = (set) =>
    `\n  <script type="application/json" id="${GLYPHS_ID}">${JSON.stringify(set).replace(/</g, "\\u003c")}</script>`;

  /** Every letter a PADD can show: its text, plus the stardate, page count and buttons. */
  function paddText(page = doc) {
    const padds = page.pieces.filter((p) => p.type === "padd");
    if (!padds.length) return "";
    const text = padds.map((p) => stripCodes(p.text)).join("") + "STARDATE 0123456789. PAGE / Back Audio Next Restart";
    return text + text.toUpperCase();
  }

  function download(name, content, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /** A name for the project's files and its published folder: the project's name (dots kept, as in a domain). */
  const slug = () => folderName(site.name) || fileSlug((site.pages.find((p) => p.file === "index") ?? site.pages[0]).title) || "lcars-site";
  /** Text that's safe as a Windows file or folder name. */
  const folderName = (s) => String(s || "").trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").replace(/^[.\s-]+|[.\s-]+$/g, "");

  /**
   * Outline the page's text with the LCARS font, so exported pages look right
   * without it. Returns null (text stays live) when turned off or the font is
   * missing. PADDs type, wrap and page their own text, so instead of outlining
   * them, the page gets the shapes of the letters they use (shapes.glyphs).
   */
  async function textShapes({ forPreview = false, page = doc } = {}) {
    if (!page.textShapes) return null;
    if (!window.lcarsOutline || !window.opentype) {
      toast("Text left as live text: the outline tools did not load");
      return null;
    }
    let font = null;
    try {
      font = await lcarsOutline.getFont(fontSource());
    } catch (err) {
      console.error(err);
    }
    if (!font) {
      toast("Text left as live text: choose the font file under Page > Publish");
      return null;
    }
    const scale = 4; // measure at four times the design size, so pixel rounding is negligible
    try {
      const shapes = await lcarsOutline.outline({
        html: pageHTML({ preview: true, page }),
        width: page.cols * page.cell * scale,
        height: page.rows * page.cell * scale,
        skip: new Set(page.pieces.filter((p) => p.type === "padd").map((p) => p.id)),
        glyphText: paddText(page),
      });
      // The frame showed attached pictures from memory; the export points at images/.
      if (!forPreview) {
        for (const p of page.pieces) {
          const url = imageURLFor(page)(p);
          if (url && shapes.inners.has(p.id)) shapes.inners.set(p.id, shapes.inners.get(p.id).split(url).join(esc(p.src)));
        }
      }
      if (shapes.missing.size) toast(`${page.file}.html: not in the font, left as live text: ${[...shapes.missing].join(" ")}`);
      return shapes;
    } catch (err) {
      console.error(err);
      toast("Could not draw the text as shapes; it was left as live text");
      return null;
    }
  }

  /** Every file of the exported site: pages, their stylesheets, the shared files, pictures and site.json. */
  async function siteFiles({ clock = "" } = {}) {
    const files = {};
    for (const page of site.pages) {
      const shapes = await textShapes({ page });
      files[`${page.file}.html`] = pageHTML({ shapes, page, clock });
      files[`${page.file}.css`] = pageCSS(page) + (shapes?.css ?? "");
    }
    files["site.json"] = JSON.stringify(site, null, 2);
    try {
      for (const [dest, src] of Object.entries(LIB_FILES)) {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`${src}: ${res.status}`);
        files[dest] = /\.(mp3|wav|ogg)$/i.test(dest) ? await res.blob() : await res.text();
      }
    } catch (err) {
      toast("Publishing needs the builder served over HTTP (python tools/serve.py)");
      console.error(err);
      return null;
    }
    for (const src of usedFiles()) files[src] = attached.get(src).file;
    return files;
  }

  /**
   * Publish: write the whole site as web pages. It goes into a folder named
   * after the site (made inside the folder you pick), or straight into the
   * folder you pick if that's a site published before (it has a site.json).
   */
  /** Publishing into a folder that has files: what's replaced, and what isn't. (The app asks the same, in Rust.) */
  const PUBLISH_OVER = (folder) =>
    `The folder "${folder}" already has files in it.\n\nPublishing overwrites the site's files there. ` +
    "Any old files stay, such as pages you've since deleted or renamed. Publish anyway?";

  async function exportFolder() {
    if (editing) finishEdit(true);
    // Ask for the folder first, while the click still counts as a user action.
    let dir = null;
    if (!APP && window.showDirectoryPicker) {
      try {
        dir = await window.showDirectoryPicker({ id: "lcars-export", mode: "readwrite" });
      } catch {
        return; // cancelled
      }
      const published = await dir.getFileHandle("site.json").then(() => true, () => false);
      const target = published ? dir : await dir.getDirectoryHandle(slug()).catch(() => null);
      if (target && !(await target.values().next()).done && !(await ask(PUBLISH_OVER(target.name)))) return;
      if (!published) dir = await dir.getDirectoryHandle(slug(), { create: true });
    }
    toast(`Publishing ${site.pages.length} page${site.pages.length > 1 ? "s" : ""}...`);
    const files = await siteFiles();
    if (!files) return;
    if (!site.pages.some((p) => p.file === "index")) toast("No page is named index, so the site has no home page; rename one under Page");

    if (APP) {
      try {
        const done = await appCall("export_site", { files: await encodeFiles(files), name: slug() });
        if (!done) return; // cancelled
        toast(`Published ${done.count} files to ${done.folder}`);
        appCall("show_folder", { folder: done.folder }).catch(() => {});
      } catch (err) {
        toast(`Could not publish: ${err}`);
      }
      return;
    }

    if (!dir) {
      // Browsers that can't write a folder (Firefox) get the whole site as one .zip, in a folder named after the site.
      const blob = await zipFiles(Object.fromEntries(Object.entries(files).map(([path, c]) => [`${slug()}/${path}`, c])));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${slug()}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast(`Saved ${slug()}.zip with ${Object.keys(files).length} files. Unzip it and open ${slug()}/index.html.`);
      return;
    }
    for (const [path, content] of Object.entries(files)) {
      const parts = path.split("/");
      let folder = dir;
      for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part, { create: true });
      const handle = await folder.getFileHandle(parts[parts.length - 1], { create: true });
      const out = await handle.createWritable();
      await out.write(content);
      await out.close();
    }
    toast(`Published ${Object.keys(files).length} files to "${dir.name}"`);
  }

  /*
   * Preview shows the page in builder/preview.html, with play, pause, stop and a
   * scrubber; each page gets builder/preview-clock.js first, which puts it on
   * the clock those drive. Neither is ever published. In the app the preview's
   * files sit beside the site's, under __preview/.
   */
  const PREVIEW_DIR = "__preview";
  async function preview() {
    if (editing) finishEdit(true);
    if (APP) {
      const files = await siteFiles({ clock: `${PREVIEW_DIR}/clock.js` });
      if (!files) return;
      try {
        files[`${PREVIEW_DIR}/clock.js`] = await (await fetch("preview-clock.js")).text();
        files[`${PREVIEW_DIR}/index.html`] = await (await fetch("preview.html")).text();
        const start = `${PREVIEW_DIR}/index.html#${encodeURIComponent(`../${doc.file}.html`)}`;
        await appCall("preview", { files: await encodeFiles(files), start, title: doc.title || doc.file });
      } catch (err) {
        toast(`Could not preview: ${err}`);
      }
      return;
    }
    // Open the tab now, while the click still counts, and fill it once the text is outlined.
    const win = window.open("", "_blank");
    const url = new URL(`preview.html#${encodeURIComponent(await previewURL(doc))}`, location.href).href;
    if (win) win.location.href = url;
    else window.open(url, "_blank");
  }

  async function previewURL(page) {
    const shapes = await textShapes({ forPreview: true, page });
    const clock = new URL("preview-clock.js", location.href).href;
    return URL.createObjectURL(new Blob([pageHTML({ preview: true, shapes, page, clock })], { type: "text/html" }));
  }

  /** A preview's link to another page of the site: show that page's preview in the same tab. */
  async function previewPage(file, win) {
    const page = site.pages.find((p) => p.file === file);
    if (!page) {
      toast(`No page named ${file}.html in this site`);
      return;
    }
    win.location.href = await previewURL(page);
  }

  /** A .zip of the files (stored, not compressed), for browsers that can't write a folder. */
  async function zipFiles(files) {
    const enc = new TextEncoder();
    const crcTable = Array.from({ length: 256 }, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
    const crc32 = (data) => {
      let c = 0xffffffff;
      for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };
    const now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [], central = [];
    let offset = 0;
    for (const [path, content] of Object.entries(files)) {
      const name = enc.encode(path);
      const data = typeof content === "string" ? enc.encode(content) : new Uint8Array(await content.arrayBuffer());
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // names are UTF-8
      local.setUint16(10, time, true);
      local.setUint16(12, date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      parts.push(local, name, data);
      const entry = new DataView(new ArrayBuffer(46));
      entry.setUint32(0, 0x02014b50, true);
      entry.setUint16(4, 20, true);
      entry.setUint16(6, 20, true);
      entry.setUint16(8, 0x0800, true);
      entry.setUint16(12, time, true);
      entry.setUint16(14, date, true);
      entry.setUint32(16, crc, true);
      entry.setUint32(20, data.length, true);
      entry.setUint32(24, data.length, true);
      entry.setUint16(28, name.length, true);
      entry.setUint32(42, offset, true);
      central.push(entry, name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((n, part) => n + part.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, Object.keys(files).length, true);
    end.setUint16(10, Object.keys(files).length, true);
    end.setUint32(12, size, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: "application/zip" });
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3500);
  }

  /*
   * The site's file: its path (in the app) and name, from the last Open or
   * Save, and whether there are changes since. Kept with your work, so the
   * app saves to the same file after a restart.
   */
  const FILE_KEY = slotKey("trektext-builder:file");
  let filePath = "", fileName = "", savedSnap = null, shownTitle = "";
  try {
    ({ path: filePath = "", name: fileName = "" } = JSON.parse(localStorage.getItem(FILE_KEY)) || {});
  } catch { /* storage unavailable */ }
  const unsaved = () => savedSnap !== null && snapshot() !== savedSnap;
  function rememberFile(dirty) {
    try { localStorage.setItem(FILE_KEY, JSON.stringify({ path: filePath, name: fileName, dirty })); } catch { /* storage unavailable */ }
  }
  function setFile(path, name) {
    filePath = path;
    fileName = name;
    tellWindowFile();
  }
  /**
   * Is the project open the builder's own start screen (start-screen.lcars), in
   * the designer's builder? Only it may use the built-in power-up: other pages'
   * sounds are files, and a release build treats every project as an ordinary one.
   */
  const isStartScreen = () => designer && /^start-screen\.lcars$/i.test(fileName);
  /** Does this page's opening play the power-up (its lead sound when it has no file of its own)? */
  const playsPowerUp = (page) => !!page.sound && !page.soundFile && isStartScreen();
  /** The app knows which project each window has open, so opening it again brings that window forward. */
  const tellWindowFile = () => { if (APP) appCall("window_file", { path: filePath || null }).catch(() => {}); };
  /** Open in another window: that window came forward instead. */
  const openElsewhere = (opened) => {
    if (opened?.elsewhere) toast(`${opened.name} is open in another window`);
    return !!opened?.elsewhere;
  };
  /** `snap` is the site as it was written; edits made while saving stay unsaved. */
  function markSaved(snap = snapshot()) {
    savedSnap = snap;
    updateTitle();
  }
  /** The top bar, after the menus: the project's name and the page on the board. */
  function showProjectName() {
    const out = document.getElementById("project-name");
    if (!out || !site) return;
    const page = document.createElement("small");
    page.textContent = `${doc?.file || "index"}.html`;
    out.replaceChildren(site.name || "Untitled project", page);
  }
  /** The window title: the site's file, with * while there are changes not saved to it. */
  function updateTitle() {
    const dirty = unsaved();
    showProjectName();
    const title = `${site?.name || "Untitled project"}${fileName ? ` · ${fileName}` : ""}${dirty ? " *" : ""} - POLARIS`;
    if (title === shownTitle) return;
    shownTitle = title;
    document.title = title;
    rememberFile(dirty);
    APP?.window.getCurrentWindow().setTitle(title).catch(() => {});
  }

  async function blobBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  /** Base64 for files the app writes (pictures are bytes; pages are text). */
  async function encodeFiles(files) {
    const out = {};
    for (const [path, content] of Object.entries(files)) {
      out[path] = typeof content === "string" ? { text: content } : { base64: await blobBase64(content) };
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Projects: a site and its pictures in one .lcars file
   * ------------------------------------------------------------------ */

  const PROJECT_FORMAT = "lcars-builder-project"; // from before POLARIS had its name; .lcars files carry it
  const IMAGE_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", avif: "image/avif" };
  const SOUND_TYPES = { mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4" };
  const typeOf = (name) => { const ext = name.split(".").pop().toLowerCase(); return IMAGE_TYPES[ext] || SOUND_TYPES[ext] || ""; };
  /**
   * Keep a chosen file as src (once), typed by its name. A file from the
   * system's file dialog can come with no type (Windows doesn't always know
   * one), and a browser won't draw an SVG that isn't typed image/svg+xml.
   */
  function attach(src, file) {
    if (attached.has(src)) return;
    const type = typeOf(file.name) || file.type;
    if (type && file.type !== type) file = new File([file], file.name, { type, lastModified: file.lastModified });
    attached.set(src, { file, url: URL.createObjectURL(file) });
  }

  /** The files (images/name, sounds/name) the site uses and the builder has: pictures, and openings' sounds. */
  function usedFiles() {
    const used = new Set();
    for (const page of site.pages) {
      for (const p of page.pieces) if (p.src) used.add(p.src);
      if (page.soundFile) used.add(page.soundFile);
      for (const c of Object.values(page.steps || {})) if (c.sound) used.add(c.sound);
      for (const l of page.layers || []) used.add(l.sound);
    }
    return [...used].filter((src) => attached.has(src));
  }

  /**
   * Where a picked file goes: images/<its name> (or sounds/), unless a different
   * file already has that name, and then name-2, name-3 ... So two photos both
   * called photo.png stay two photos. The same file picked again is shared.
   */
  async function imageSrcFor(file, dir = "images") {
    const dot = file.name.lastIndexOf(".");
    const stem = dot > 0 ? file.name.slice(0, dot) : file.name;
    const ext = dot > 0 ? file.name.slice(dot) : "";
    for (let n = 1; ; n++) {
      const src = `${dir}/${n === 1 ? file.name : `${stem}-${n}${ext}`}`;
      const have = attached.get(src);
      if (!have || await sameBytes(have.file, file)) return src;
    }
  }

  async function sameBytes(a, b) {
    if (a === b) return true;
    if (a.size !== b.size) return false;
    const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]).then((bufs) => bufs.map((buf) => new Uint8Array(buf)));
    return x.every((v, i) => v === y[i]);
  }

  /** The project as a .lcars file: the site, plus the pictures and sounds its pages use. */
  async function projectText() {
    const images = {}, sounds = {};
    for (const src of usedFiles()) (src.startsWith("sounds/") ? sounds : images)[src] = await blobBase64(attached.get(src).file);
    return JSON.stringify({ format: PROJECT_FORMAT, version: 1, site, images, sounds });
  }

  /** A file from its base64, as a project file carries it. */
  function fromBase64(src, b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const name = src.split("/").pop();
    return new File([bytes], name, { type: typeOf(name) });
  }

  /** Pictures and sounds from a project file (replacing any from the last project). */
  function attachImages(images = {}, sounds = {}) {
    for (const { url } of attached.values()) URL.revokeObjectURL(url);
    attached.clear();
    for (const [src, b64] of [...Object.entries(images || {}), ...Object.entries(sounds || {})]) {
      if (typeof b64 !== "string" || !/^(images|sounds)\//.test(src)) continue;
      try {
        const file = fromBase64(src, b64);
        attached.set(src, { file, url: URL.createObjectURL(file) });
      } catch { /* not base64: left out */ }
    }
  }

  /* ---- recent projects (the app knows where they are) ---- */

  const RECENT_KEY = "trektext-builder:recent";
  function recents() {
    try {
      const list = JSON.parse(localStorage.getItem(RECENT_KEY));
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }
  function addRecent(path, name) {
    if (!path) return;
    const list = [{ path, name, project: site.name || "" }, ...recents().filter((r) => r.path !== path)].slice(0, 8);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
  }
  function dropRecent(path) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recents().filter((r) => r.path !== path))); } catch { /* storage unavailable */ }
  }

  /* ---- the splash: open a project, or start a new one ---- */

  // The start screen's emblem: the traced insignia.
  if (window.LCARS_INSIGNIA) {
    const emblem = $(".sp-delta");
    emblem.setAttribute("viewBox", window.LCARS_INSIGNIA.viewBox);
    emblem.innerHTML = `<path d="${window.LCARS_INSIGNIA.d}"/>`;
  }

  let splashOpen = false;
  const hasWork = () => site.pages.some((p) => p.pieces.length) || !!site.name;

  /*
   * The start screen is a builder project, builder/start-screen.lcars: open it
   * in the builder to change it, save it over itself, and the next app build
   * packages it. Its buttons act through their links:
   *   #new      New Project
   *   #open     Open Project
   *   #resume   back to the project the builder kept (its text names the project)
   *   #recent   a recent project each, filled in order down the page (the app keeps 8)
   * Resume and recent buttons are always drawn. When there's a project for one,
   * the project's name replaces its text; otherwise it keeps its own text (blank
   * is fine) and does nothing. Other links do nothing here.
   * Until the file loads, or if it can't (a builder opened from disk), the start
   * screen written into index.html stands in.
   * The designer's builder (a debug build, or the builder in a browser) reads the
   * file again each time the start screen shows (Close) and on R, so a saved change
   * is there without a rebuild; Preview shows unsaved work. The debug app reads it
   * from the source folder, not the copy built into it.
   */
  const START_FILE = "start-screen.lcars";
  let startPage = null;
  let startImages = {};
  let startSounds = new Map(); // sounds/name -> object URL
  let startLoading = null;
  /** Read the start screen's design (one read at a time). */
  function loadStartScreen() {
    return startLoading ||= (async () => {
      const text = APP && designer ? await appCall("start_screen_source").catch(() => null) : null;
      const d = text ? JSON.parse(text) : await fetch(START_FILE, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null));
      if (!d) return;
      const s = d.format === PROJECT_FORMAT ? d.site : d;
      const page = preparePage(Array.isArray(s.pages) ? s.pages[s.current | 0] || s.pages[0] : s);
      for (const url of startSounds.values()) URL.revokeObjectURL(url);
      startPage = page;
      startImages = d.images || {};
      startSounds = new Map(Object.entries(d.sounds || {}).filter(([src, b64]) => isSoundSrc(src) && typeof b64 === "string")
        .map(([src, b64]) => [src, URL.createObjectURL(fromBase64(src, b64))]));
    })()
      .catch(() => { /* no design (or a broken one): the last one, or the written-in start screen, stays */ })
      .finally(() => { startLoading = null; });
  }
  /** Read the design again and show it, opening and all (the designer's builder). */
  function refreshSplash() {
    return loadStartScreen().then(() => {
      if (!splashOpen) return;
      paintSplash();
      splashFocus();
    });
  }
  designerKnown.then(loadStartScreen)
    .finally(() => {
      $("#splash").classList.remove("pending");
      if (splashOpen) {
        paintSplash();
        splashFocus();
      }
    });

  /** The start screen's content: the design from start-screen.lcars, or the written-in one. */
  function paintSplash() {
    const root = $("#splash");
    root.querySelector(".sp-screen")?.remove();
    $(".sp").style.display = startPage ? "none" : "";
    if (!startPage) return paintBuiltIn();
    const page = startPage;
    const imageURL = (p) => {
      const b64 = startImages[p.src];
      return b64 ? `data:${IMAGE_TYPES[p.src.split(".").pop().toLowerCase()] || ""};base64,${b64}` : "";
    };
    const board = document.createElement("div");
    board.className = "lcars-board";
    applyVars(board, { "--cols": page.cols, "--rows": page.rows, "--cell": page.cell });
    board.innerHTML = page.pieces.map((p) => {
      const link = p.type === "button" && !p.opens && safeHref(p.href);
      const tag = link ? "a" : "div";
      const style = Object.entries(pieceVars(p)).map(([k, v]) => `${k}:${v}`).join(";");
      return `<${tag} class="${esc(pieceClasses(p))}"${link ? ` href="${esc(link)}"` : ""}${beepAttr(p, libURL)}${pieceAttrs(p)} ` +
        `style="${esc(style)}">${pieceInner(p, page.cell, { imageURL })}</${tag}>`;
    }).join("");

    // Fill in the resume and recent projects buttons.
    const recent = APP ? recents() : [];
    const recentButtons = page.pieces.filter((p) => p.type === "button" && p.href === "#recent").sort((a, b) => a.y - b.y || a.x - b.x);
    const label = (el, text, note) => {
      const body = el.querySelector(".body");
      body.querySelector(".label")?.remove();
      body.insertAdjacentHTML("beforeend", `<span class="label"><span class="lt"><span></span><small></small></span></span>`);
      body.querySelector(".lt > span").textContent = text;
      body.querySelector(".lt > small").textContent = note;
    };
    const idle = (el) => {
      el.classList.add("idle");
      el.tabIndex = -1;
      el.setAttribute("aria-disabled", "true");
    };
    page.pieces.forEach((p, i) => {
      const el = board.children[i];
      if (p.type !== "button") return;
      if (p.href === "#resume") {
        if (!hasWork()) return idle(el);
        label(el, `Resume ${site.name || site.pages[0].title || "the last project"}`, unsaved() ? "changes not saved to a file" : fileName || "");
      } else if (p.href === "#recent") {
        const r = recent[recentButtons.indexOf(p)];
        if (!r) { el.hidden = true; return; } // fewer recent projects than buttons: hide the spare ones
        label(el, r.project || r.name, r.name);
        el.dataset.path = r.path;
        el.title = r.path;
      }
    });
    const screen = document.createElement("main");
    screen.className = "lcars-screen sp-screen";
    screen.append(board);
    root.append(screen);
    // It builds itself on, as its Opening says (lcars/flow.js), once it's showing.
    if (window.LcarsFlow && page.flow && page.flow !== "none") {
      // Its sounds come from start-screen.lcars; a sound it doesn't have falls back to the power-up (or silence, for a step).
      const url = (src) => startSounds.get(src) ?? "";
      const steps = Object.fromEntries(Object.entries(page.steps || {}).map(([n, c]) => [n, { ...c, sound: c.sound ? url(c.sound) : "" }]));
      const sound = page.sound ? (page.soundFile && url(page.soundFile)) || true : false;
      const layers = (page.layers || []).map((l) => ({ ...l, sound: url(l.sound) })).filter((l) => l.sound);
      requestAnimationFrame(() => { if (board.isConnected) LcarsFlow.play(board, { style: page.flow, sound, steps, layers }); });
    }
  }

  /**
   * The designed start screen doesn't put focus on a button (that held New
   * Project lit up, with a focus box); Enter still starts a new project. The
   * written-in one focuses New Project as before.
   */
  function splashFocus() {
    if ($("#splash .sp-screen")) document.activeElement?.blur?.();
    else $("#sp-new").focus();
  }
  // R on the start screen plays its opening again (to watch it without restarting the app);
  // the designer's builder reads start-screen.lcars again first, so a saved change shows.
  document.addEventListener("keydown", (e) => {
    if (!splashOpen || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== "r") return;
    if (newDialog.open || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
    e.preventDefault();
    if (designer) refreshSplash();
    else paintSplash();
  });
  document.addEventListener("keydown", (e) => {
    if (!splashOpen || e.key !== "Enter" || e.defaultPrevented) return;
    if (document.activeElement && document.activeElement !== document.body) return; // a focused button handles its own Enter
    const add = $("#splash .sp-screen a[href='#new']");
    if (!add) return;
    e.preventDefault();
    newProject();
  });

  $("#splash").addEventListener("click", (e) => {
    const a = e.target.closest(".sp-screen a[href]");
    if (!a) return;
    e.preventDefault();
    if (a.classList.contains("idle")) return;
    const act = { "#new": newProject, "#open": openFile, "#resume": resumeProject, "#recent": () => openPath(a.dataset.path) };
    act[a.getAttribute("href")]?.();
  });

  function showSplash() {
    if (editing) finishEdit(true);
    for (const pop of document.querySelectorAll(":popover-open")) pop.hidePopover();
    $("#splash").hidden = false;
    splashOpen = true;
    // The designer sees the start screen as last saved (once the first read is done: it paints when it is).
    if (designer && !$("#splash").classList.contains("pending")) return void refreshSplash();
    paintSplash();
    splashFocus();
  }

  /** The written-in start screen's resume and recent projects buttons. */
  function paintBuiltIn() {
    const resume = $("#sp-resume");
    resume.replaceChildren();
    if (hasWork()) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pill peach";
      b.innerHTML = "<span></span><small></small>";
      b.querySelector("span").textContent = `Resume ${site.name || site.pages[0].title || "the last project"}`;
      b.querySelector("small").textContent = unsaved() ? "changes not saved to a file" : fileName || "";
      b.addEventListener("click", resumeProject);
      resume.append(b);
    }
    const list = $("#sp-recent");
    const items = APP ? recents() : [];
    list.replaceChildren(...items.map((r) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pill dkblue";
      b.title = r.path;
      b.innerHTML = "<span></span><small></small>";
      b.querySelector("span").textContent = r.project || r.name;
      b.querySelector("small").textContent = r.name;
      b.addEventListener("click", () => openPath(r.path));
      return b;
    }));
    $("#sp-recent-head").hidden = !items.length;
  }

  function hideSplash() {
    $("#splash").hidden = true;
    splashOpen = false;
  }

  /** Back to the project that was open (kept by the builder), with its pictures from its file. */
  async function resumeProject() {
    hideSplash();
    if (APP && filePath && !attached.size) {
      try {
        const opened = await appCall("open_path", { path: filePath });
        if (!opened || opened.elsewhere) return; // not confirmed, or open in another window: the pages are here, without their pictures
        const d = JSON.parse(opened.text);
        if (d.format === PROJECT_FORMAT) {
          attachImages(d.images, d.sounds);
          renderAll();
        }
      } catch { /* the file moved: the pages are still here, without pictures picked from disk */ }
    }
  }

  async function openPath(path) {
    try {
      const opened = await appCall("open_path", { path });
      if (opened && !openElsewhere(opened)) await openText(opened.name, opened.text, opened.path); // null: not confirmed in the Open dialog
    } catch (err) {
      toast(`Could not open ${path}: ${err}`);
      dropRecent(path);
      if (splashOpen) showSplash();
    }
  }

  /* ---- new project ---- */

  const newDialog = $("#new-project");
  function newProject() {
    if (editing) finishEdit(true);
    $("#np-name").value = "";
    newDialog.showModal();
    $("#np-name").focus();
  }
  newDialog.addEventListener("close", async () => {
    if (newDialog.returnValue !== "create") return;
    const name = $("#np-name").value.trim();
    const start = newDialog.querySelector('input[name="np-start"]:checked')?.value || "blank";
    if (unsaved() && !(await ask(`Start ${name || "a new project"}? Changes to ${site.name || "the open project"} not saved to a file will be lost.`))) return;
    const page = TEMPLATES[start] ? TEMPLATES[start].make() : Object.assign(blankDoc(), { title: name || "Home" });
    loadSite({ name, pages: [Object.assign(page, { file: "index" })] });
    attachImages({});
    fitAll();
    setFile("", "");
    commit();
    savedSnap = ""; // a new project isn't saved anywhere yet
    updateTitle();
    hideSplash();
    // The app gives a new project its file straight away, like any project you'd open later.
    if (APP) await savePage(true);
  });

  /**
   * Save the project (every page, and its pictures) as a .lcars file. The app
   * saves to the project's file, or asks where for a new one or with Save As.
   * Browsers ask each time where they can, and otherwise download it.
   */
  async function savePage(as = false) {
    if (editing) finishEdit(true);
    if (splashOpen) return;
    // The site as it is now: what's written, and so what counts as saved, even if it changes during a dialog.
    const snap = snapshot();
    const json = await projectText();
    const name = fileName && fileName.endsWith(".lcars") ? fileName : `${slug()}.lcars`;
    if (APP) {
      let saved;
      try {
        if (!as && filePath) {
          try {
            saved = await appCall("save_site", { path: filePath, text: json });
          } catch (err) {
            // The file moved, or its folder is gone: ask where to save instead.
            toast(`Could not save to ${filePath}: ${err}. Choose where to save it.`);
            saved = await appCall("save_site_as", { text: json, suggested: name });
          }
        } else {
          saved = await appCall("save_site_as", { text: json, suggested: name });
        }
      } catch (err) {
        toast(`Could not save: ${err}`);
        return;
      }
      if (!saved) return; // cancelled
      setFile(saved.path, saved.name);
      markSaved(snap);
      addRecent(saved.path, saved.name);
      toast(`Saved ${saved.name}`);
      return;
    }
    if (!window.showSaveFilePicker) {
      download(name, json, "application/x-lcars-project");
      setFile("", name);
      markSaved(snap);
      return;
    }
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        id: "lcars-page", suggestedName: name,
        types: [{ description: "LCARS project", accept: { "application/x-lcars-project": [".lcars"] } }],
      });
    } catch (err) {
      if (err.name !== "AbortError") toast(`Could not save: ${err.message}`);
      return; // cancelled
    }
    try {
      const out = await handle.createWritable();
      await out.write(json);
      await out.close();
      setFile("", handle.name);
      markSaved(snap);
      toast(`Saved ${handle.name}`);
    } catch (err) {
      toast(`Could not save ${handle.name}: ${err.message}`);
    }
  }

  const fileInput = $("#open-file");
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    fileInput.value = "";
    if (file) await openText(file.name, await file.text());
  });

  async function openFile() {
    if (editing) finishEdit(true);
    if (!APP) return fileInput.click();
    try {
      const opened = await appCall("open_site");
      if (opened && !openElsewhere(opened)) await openText(opened.name, opened.text, opened.path);
    } catch (err) {
      toast(`Could not open: ${err}`);
    }
  }

  /**
   * Open a file: a project (.lcars) or a site from before projects (.json)
   * opens as the project; a single page (from before sites) joins the open
   * project, or starts one from the splash.
   */
  async function openText(name, text, path = "") {
    const file = { name };
    try {
      const d = JSON.parse(text);
      const project = d.format === PROJECT_FORMAT;
      if (project || Array.isArray(d.pages) || splashOpen) {
        if (unsaved() && !(await ask(`Open ${name}? Changes to ${site.name || "the open project"} not saved to a file will be lost.`))) return;
        const s = project ? d.site : Array.isArray(d.pages) ? d : { pages: [Object.assign(d, { file: "index" })] };
        loadSite(s);
        if (!site.name) site.name = name.replace(/\.(lcars|json)$/i, "").replace(/^site$/i, "");
        attachImages(project ? d.images : {}, project ? d.sounds : {});
        renderAll();
        commit();
        // Files from before projects get saved as a project (.lcars) next time, so they aren't overwritten.
        setFile(project ? path : "", project ? name : "");
        if (project) {
          markSaved();
          addRecent(path, name);
        } else {
          savedSnap = "";
          updateTitle();
        }
        hideSplash();
        toast(`Opened ${file.name}: ${site.pages.length} page${site.pages.length > 1 ? "s" : ""}`);
      } else {
        // A single page (saved before sites) joins this site as a new page.
        const page = preparePage(d);
        page.pid = `g${site.nextPage++}`;
        page.file = uniqueFile(fileSlug(page.title) || "page");
        site.pages.push(page);
        show(page);
        commit();
        toast(`Added ${file.name} as ${page.file}.html`);
      }
    } catch (err) {
      toast(`Could not open ${file.name}: ${err.message}`);
    }
  }

  /* ------------------------------------------------------------------ *
   * Preferences: which colors the pickers offer
   * ------------------------------------------------------------------ */

  const prefsDialog = $("#prefs");

  function setOn(c, on) {
    for (const n of c.names) enabled.delete(n);
    if (on) enabled.add(c.name);
  }

  function prefsChanged() {
    saveEnabled();
    renderPrefs();
    renderInspector();
  }

  function renderPrefs() {
    const box = $("#prefs-colors");
    box.replaceChildren();
    for (const [key, title] of GROUPS) {
      const list = ALL_COLORS.filter((c) => c.family === key);
      if (!list.length) continue;
      const sec = document.createElement("section");
      sec.className = "prefs-group";
      const allOn = list.every(isOn);
      sec.innerHTML = `<h3><span></span><small>${list.filter(isOn).length} of ${list.length}</small>` +
        `<button type="button" class="pill dkblue">${allOn ? "None" : "All"}</button></h3><div class="prefs-grid"></div>`;
      sec.querySelector("h3 span").textContent = title;
      sec.querySelector("h3 button").addEventListener("click", () => {
        for (const c of list) setOn(c, !allOn);
        prefsChanged();
      });
      const grid = sec.querySelector(".prefs-grid");
      for (const c of list) {
        const chip = document.createElement("label");
        const mine = c.names.some((n) => myPicks().includes(n));
        chip.className = "prefs-chip" + (mine ? " picked" : "");
        chip.title = `${c.names.join(" / ")}  ${c.hex}${mine ? "  (one of your picks)" : ""}`;
        chip.innerHTML = `<input type="checkbox"${isOn(c) ? " checked" : ""}><span class="sw"></span><span class="nm"></span>`;
        chip.querySelector(".sw").style.background = c.hex;
        chip.querySelector(".nm").textContent = c.names.join(" / ");
        chip.querySelector("input").addEventListener("change", (e) => {
          setOn(c, e.target.checked);
          prefsChanged();
        });
        grid.append(chip);
      }
      box.append(sec);
    }
    $("#prefs-count").textContent = `${palette().length} of ${ALL_COLORS.length} colors in the pickers`;
    renderSets();
  }

  /*
   * Color sets: your picks, sets you've saved, the POLARIS picks, and each
   * source palette (the film and series palettes, and thelcars.com's themes).
   */
  const ERA_SETS = ERAS.map((e) => ({ name: e.title, colors: e.colors.map(([n]) => n), theme: e.src.includes("thelcars.com") }));

  /** The menu's groups of sets, each set as { id, name, colors }. */
  function setGroups() {
    return [
      ["Yours", [{ id: "mine", name: "My picks", colors: myPicks() },
        ...sets.sets.map((s, i) => ({ id: `saved:${i}`, name: s.name, colors: s.colors }))]],
      ["POLARIS", [{ id: "trektext", name: "POLARIS picks", colors: PICKS }]],
      ["Show themes", ERA_SETS.filter((e) => e.theme).map((e) => ({ id: `era:${e.name}`, ...e }))],
      ["Film and series palettes", ERA_SETS.filter((e) => !e.theme).map((e) => ({ id: `era:${e.name}`, ...e }))],
    ];
  }
  const allSets = () => setGroups().flatMap(([, list]) => list);

  /** The colors a set turns on, each under its first name. */
  const setColors = (names) => new Set(names.map((n) => ALL_COLORS.find((c) => c.names.includes(n))?.name).filter(Boolean));
  const sameSet = (a, b) => a.size === b.size && [...a].every((n) => b.has(n));

  function renderSets() {
    const pick = $("#prefs-set");
    pick.replaceChildren(new Option("Custom (not a saved set)", ""));
    const current = setColors([...enabled]);
    let match = "";
    for (const [title, list] of setGroups()) {
      const group = document.createElement("optgroup");
      group.label = title;
      for (const s of list) {
        group.append(new Option(`${s.name} (${setColors(s.colors).size})`, s.id));
        if (!match && sameSet(setColors(s.colors), current)) match = s.id;
      }
      pick.append(group);
    }
    pick.value = match;
    pick.options[0].hidden = !!match;
    $("#prefs-delete").disabled = !match.startsWith("saved:");
  }

  $("#prefs-set").addEventListener("change", (e) => {
    const s = allSets().find((x) => x.id === e.target.value);
    if (!s) return;
    enabled = setColors(s.colors);
    prefsChanged();
  });

  const PREFS_ACTIONS = {
    picks: () => { enabled = setColors(myPicks()); prefsChanged(); },
    all: () => { enabled = new Set(ALL_COLORS.map((c) => c.name)); prefsChanged(); },
    none: () => { enabled = new Set(); prefsChanged(); },
    mine: async () => {
      if (!(await ask(`Make these ${enabled.size} colors your picks? "Reset to my picks" will bring them back.`))) return;
      sets.mine = [...enabled];
      saveSets();
      renderPrefs();
      toast("Saved as your picks");
    },
    save: async () => {
      const name = prompt("Name this color set:", "")?.trim();
      if (!name) return;
      const i = sets.sets.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());
      if (i >= 0 && !(await ask(`Replace your set "${sets.sets[i].name}"?`))) return;
      const entry = { name, colors: [...enabled] };
      if (i >= 0) sets.sets[i] = entry;
      else sets.sets.push(entry);
      saveSets();
      renderPrefs();
      toast(`Saved "${name}"`);
    },
    delete: async () => {
      const id = $("#prefs-set").value;
      if (!id.startsWith("saved:")) return;
      const i = Number(id.slice(6));
      if (!(await ask(`Delete your set "${sets.sets[i].name}"?`))) return;
      sets.sets.splice(i, 1);
      saveSets();
      renderPrefs();
    },
  };
  for (const b of document.querySelectorAll("[data-prefs]")) b.addEventListener("click", () => PREFS_ACTIONS[b.dataset.prefs]());

  const COMMANDS = {
    prefs: () => { renderPrefs(); prefsDialog.showModal(); },
    new: newProject,
    close: async () => {
      if (unsaved() && !(await ask(`Close ${site.name || "this project"}? Its changes aren't saved to a file yet; you can still resume it from the start screen.`))) return;
      showSplash();
    },
    template: async (name) => {
      const t = TEMPLATES[name];
      if (!t) return;
      if (doc.pieces.length && !(await ask(`Replace this page with the "${t.name}" template? Its pieces will be replaced (Ctrl+Z brings them back).`))) return;
      const keepTitle = doc.title !== blankDoc().title && doc.title !== "New Page" ? doc.title : null;
      load(t.make());
      if (keepTitle) doc.title = keepTitle;
      renderAll();
      fitAll();
      commit();
    },
    open: openFile,
    save: () => savePage(false),
    saveAs: () => savePage(true),
    newWindow: () => APP && appCall("new_window").catch((err) => toast(`Could not open a window: ${err}`)),
    preview,
    export: exportFolder,
  };
  for (const b of document.querySelectorAll("[data-cmd]")) b.addEventListener("click", () => COMMANDS[b.dataset.cmd](b.dataset.arg));

  /*
   * The menu bar, top left: File, Edit, Arrange and Group, each its own
   * menu, every command with its shortcut (then Pages, from index.html). A command that can't run now (nothing selected,
   * nothing to paste) is greyed out; app-only ones show only in the app.
   */
  const MENU = [
    ["File", "orange", [
      ["New project", "", () => COMMANDS.new()],
      ["Open...", "Ctrl+O", () => openFile()],
      ["New window", "Ctrl+Shift+N", () => COMMANDS.newWindow(), { app: true }],
      ["Save", "Ctrl+S", () => savePage(false)],
      ["Save as...", "Ctrl+Shift+S", () => savePage(true), { app: true }],
      ["Preview", "", () => COMMANDS.preview()],
      ["Publish...", "", () => COMMANDS.export()],
      ["Preferences...", "", () => COMMANDS.prefs()],
      ["Close project", "", () => COMMANDS.close()],
    ]],
    ["Edit", "lilac", [
      ["Undo", "Ctrl+Z", () => undo(), { when: () => undoStack.length > 1 }],
      ["Redo", "Ctrl+Y", () => redo(), { when: () => redoStack.length > 0 }],
      ["Cut", "Ctrl+X", () => cutPiece(), { when: () => selectedPieces().length > 0 }],
      ["Copy", "Ctrl+C", () => copyPiece(), { when: () => selectedPieces().length > 0 }],
      ["Paste", "Ctrl+V", () => pastePiece(), { when: () => !!clipboard }],
      ["Duplicate", "Ctrl+D", () => duplicate(), { when: () => selectedPieces().length > 0 }],
      ["Delete", "Del", () => remove(), { when: () => selectedPieces().length > 0 }],
      ["Select all", "Ctrl+A", () => selectAll(), { when: () => doc.pieces.length > 0 }],
      ["Select nothing", "Esc", () => select(null), { when: () => selectedPieces().length > 0 }],
    ]],
    ["Arrange", "blue", [
      ["Bring forward", "Ctrl+]", () => restack(1), { when: () => !!selected() }],
      ["Send back", "Ctrl+[", () => restack(-1), { when: () => !!selected() }],
      ["Flip horizontal", "H", () => flip("h"), { when: () => selected()?.type === "elbow" }],
      ["Flip vertical", "V", () => flip("v"), { when: () => selected()?.type === "elbow" }],
      ["Turn clockwise", "", () => turnSelected(), { when: () => TURNABLE.has(selected()?.type) }],
      ["Clear rotation", "", () => clearRotation(), { when: () => !!selected()?.rot && !TURNABLE.has(selected().type) }],
    ]],
    ["Group", "peach", [
      ["Group...", "Ctrl+G", () => groupSelection(), { when: () => selectedPieces().length > 0 }],
      ["Ungroup", "Ctrl+Shift+G", () => ungroupSelection(), { when: () => selectedPieces().some((p) => p.group) }],
      ["Select the group", "", () => selectGroup(), { when: () => selectedPieces().some((p) => p.group) }],
      ["Hide while editing", "", () => veilGroup(undefined, true), { when: () => selectedPieces().some((p) => p.group) }],
      ["Show hidden groups", "", () => showAllGroups(), { when: () => veiled.size > 0 }],
    ]],
  ];
  const menubar = $("#menubar");
  MENU.forEach(([title, color, items], i) => {
    const top = document.createElement("button");
    top.type = "button";
    top.className = `pill ${color} menu-top`;
    top.textContent = title;
    const menu = document.createElement("div");
    menu.id = `menu-${title.toLowerCase()}`;
    menu.className = "menu cmd-menu bar-menu";
    menu.popover = "auto";
    top.setAttribute("popovertarget", menu.id);
    const entries = [];
    for (const [text, keys, run, opts = {}] of items) {
      if (opts.app && !APP) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.className = `pill ${color}`;
      const name = document.createElement("span");
      name.textContent = text;
      const key = document.createElement("small");
      key.textContent = keys;
      b.append(name, key);
      b.addEventListener("click", () => {
        menu.hidePopover();
        run();
      });
      entries.push([b, opts.when]);
      menu.append(b);
    }
    // What can run is worked out as the menu opens; on the start screen, only File's commands make sense.
    menu.addEventListener("beforetoggle", (e) => {
      if (e.newState !== "open") return;
      for (const [b, when] of entries) b.disabled = splashOpen ? !!when : !!when && !when();
    });
    menubar.append(top);
    document.body.append(menu);
    if (i === 0) top.classList.add("first");
  });
  // Each menu opens under its name; with one open, pointing at another name opens that one instead, as in a menu bar.
  const barButtons = () => document.querySelectorAll(".topbar [popovertarget]");
  for (const top of barButtons()) {
    const menu = document.getElementById(top.getAttribute("popovertarget"));
    menu.addEventListener("beforetoggle", (e) => {
      if (e.newState !== "open") return;
      const r = top.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8))}px`;
      menu.style.top = `${r.bottom + 6}px`;
    });
    top.addEventListener("pointerenter", () => {
      const open = document.querySelector(".bar-menu:popover-open");
      if (!open || open === menu) return;
      open.hidePopover();
      menu.showPopover();
    });
  }

  // The grid on the board while editing (Preferences), remembered.
  const GRID_KEY = "trektext-builder:grid";
  const gridToggle = $("#grid-toggle");
  try { gridToggle.checked = localStorage.getItem(GRID_KEY) !== "off"; } catch { /* storage unavailable */ }
  document.body.classList.toggle("show-grid", gridToggle.checked);

  /* ------------------------------------------------------------------ *
   * Starter template: a classic two-frame LCARS page
   * ------------------------------------------------------------------ */

  function classicTemplate() {
    const { d, P } = starter("Classic Frame");
    const cap = (x, y, ends) => P("block", x, y, 4, 4, { color: "lilac", ends, halign: "center", valign: "middle" });
    const bar = (x, y, w, color) => P("block", x, y, w, 4, { color, halign: "center", valign: "middle" });
    // Laid out for 166 columns; the bars and right-hand pieces stretch to the page width.
    const dx = d.cols - 166;

    // Header and footer bars
    cap(0, 0, "left");
    P("text", 5, 0, 24, 4, { label: "LCARS Page", tcolor: "atomic-tangerine", fit: false });
    bar(30, 0, 82 + dx, "blue-bell");
    P("text", 113 + dx, 0, 48, 4, { label: "23801 Subspace Communications * Active", tcolor: "tanoi", halign: "right", fit: false });
    cap(162 + dx, 0, "right");
    cap(0, 104, "left");
    bar(5, 104, 100 + dx, "blue-bell");
    P("text", 106 + dx, 104, 55, 4, { label: "LCARS * Historical File", tcolor: "hopbush", halign: "right", fit: false });
    cap(162 + dx, 104, "right");

    // Buttons
    const btn = (x, y, label, color) => P("button", x, y, 11, 4, { label, color });
    btn(0, 12, "416-101", "atomic-tangerine");
    btn(0, 17, "088-281", "melrose");
    btn(12, 17, "088-151", "atomic-tangerine");
    btn(12, 22, "088-332", "chestnut-rose");
    btn(0, 27, "088-834", "atomic-tangerine");
    btn(12, 27, "088-964", "blue-bell");
    const colors = ["lilac", "atomic-tangerine", "atomic-tangerine", "lilac", "hopbush", "sandy-brown"];
    for (let i = 0; i < 12; i++) btn((i % 2) * 12, 50 + Math.floor(i / 2) * 5, `088-${String(i + 1).padStart(3, "0")}`, colors[i % colors.length]);

    // Upper frame with an image
    P("elbow", 25, 6, 38, 16, { corner: "tl", color: "chestnut-rose", label: "Online" });
    P("elbow", 25, 23, 38, 17, { corner: "bl", color: "sandy-brown" });
    bar(64, 6, 102 + dx, "lilac");
    bar(64, 36, 102 + dx, "blue-bell");
    P("image", 55, 11, 111 + dx, 24);

    // Lower frame with a PADD
    P("elbow", 25, 42, 38, 16, { corner: "tl", color: "blue-bell", label: "Mode Select" });
    P("block", 25, 59, 25, 20, { color: "lilac", label: "Accessing\n088-647" });
    P("elbow", 25, 80, 38, 22, { corner: "bl", color: "sandy-brown" });
    bar(64, 42, 102 + dx, "hopbush");
    bar(64, 98, 102 + dx, "chestnut-rose");
    P("padd", 55, 47, 111 + dx, 50, {
      text: "##{melrose}WELCOME TO POLARIS.\n\n##{tanoi}DRAG PIECES FROM THE LEFT, STRETCH THEM WITH THE HANDLES, AND EDIT THEM IN THE PANEL ON THE RIGHT.\n\n" +
        "##{atomic-tangerine}DOUBLE-CLICK ##{melrose}ANY LABEL TO EDIT IT ON THE BOARD, AND SELECT LETTERS TO ##{green-apple}COLOR ##{andorian-blue}THEM.",
    });
    return d;
  }

  /**
   * A new page for a template, the same shape as the current page, and a
   * helper that adds pieces to it. Templates are laid out for 108 rows.
   */
  function starter(title) {
    const d = blankDoc();
    d.title = title;
    if (doc) {
      d.cols = Math.max(100, Math.round((doc.cols * ROWS) / doc.rows));
      d.textShapes = doc.textShapes;
    }
    const P = (type, x, y, w, h, props = {}) =>
      d.pieces.push({ id: `p${d.nextId++}`, type, rot: 0, ...structuredClone(TYPES[type]), x, y, w, h, ...props });
    return { d, P };
  }

  /**
   * "LCARS Access": a TNG data screen with two gauges. The middle is left
   * open for your own content. Laid out for 144 columns (4:3); the bars,
   * numbers and right-hand pieces stretch or move to fill wider pages.
   */
  function accessTemplate() {
    const { d, P } = starter("LCARS Access");
    const dx = d.cols - 144;
    const open = (f) => Math.round(18 + f * (d.cols - 18)); // a point across the open area
    const block = (x, y, w, h, color, label = "", props = {}) =>
      P("block", x, y, w, h, { color, label, halign: "right", valign: "bottom", ...props });

    // Left column
    block(0, 5, 18, 12, "lilac", "LCARS 40274");
    P("elbow", 0, 18, 64, 16, { corner: "bl", color: "melrose", side: 18, bar: 2, rx: 18, ry: 9, ri: 5, label: "02-654598", valign: "top" });
    P("elbow", 0, 35, 64, 13, { corner: "tl", color: "chestnut-rose", side: 18, bar: 2, rx: 18, ry: 8, ri: 5, label: "03-975683" });
    block(0, 49, 18, 19, "chestnut-rose", "04-765466");
    block(0, 69, 18, 5, "atomic-tangerine", "05-224353", { valign: "middle" });
    block(0, 75, 18, 26, "orange-peel", "06-576565", { valign: "top" });

    // The two bars across the page, in short colored lengths
    block(65, 32, 4, 2, "atomic-tangerine");
    block(70, 32, 21, 2, "lilac");
    block(92, 32, 47 + dx, 2, "lilac");
    block(140 + dx, 32, 4, 2, "chestnut-rose");
    block(65, 35, 4, 2, "tanoi");
    block(70, 35, 21, 1, "tanoi");
    block(92, 35, 47 + dx, 2, "lilac");
    block(140 + dx, 35, 4, 2, "atomic-tangerine");

    // Numbers, title and buttons
    // Seven still rows of numbers (pick a Motion to bring them to life)
    P("cascade", 27, 14, 70 + dx, 16, {
      columns: 22 + Math.round((dx * 22) / 70), color: "atomic-tangerine", color2: POINTER, fs: 11.5, seed: 441, numMotion: "still",
    });
    P("text", 92 + dx, 3, 52, 12, { label: "LCARS Access 441", tcolor: "atomic-tangerine", fs: 56, halign: "right", fit: false });
    const btn = (x, y, label, color) => P("button", x + dx, y, 22, 6, { label, color, fs: 18, halign: "right", valign: "bottom" });
    btn(99, 15, "9886-234", "melrose");
    btn(122, 15, "0128-069", "orange-peel");
    btn(99, 23, "1014-819", "atomic-tangerine");
    btn(122, 23, "7232-838", "melrose");
    P("text", 100 + dx, 92, 44, 10, { label: "Data Node 188", tcolor: "atomic-tangerine", fs: 50, halign: "right", fit: false });

    // Gauges either side of the open middle
    P("gauge", open(0.1825), 47, 12, 40, {
      side: "left", seed: 3, fs: 19, numbers: "typed", labels: "000\n010\n##{atomic-tangerine}020\n030\n040\n##{}050\n060\n070",
    });
    P("gauge", open(0.778) - 12, 47, 12, 40, {
      side: "right", seed: 11, fs: 19, numbers: "typed", labels: "000\n010\n020\n##{atomic-tangerine}030\n040\n050\n##{}060\n070",
    });
    return d;
  }

  /**
   * "Holodeck": a holodeck program menu, built only from the standard pieces
   * (elbows, blocks, buttons and text). Centered; it doesn't stretch.
   */
  function holodeckTemplate() {
    const { d, P } = starter("Holodeck Programming");
    const ox = Math.max(0, Math.round((d.cols - 136) / 2));
    const X = (x, y, w, h) => [x + ox, y, w, h];
    const add = (type, [x, y, w, h], props) => P(type, x, y, w, h, props);
    const block = (x, y, w, h, color, props = {}) => add("block", X(x, y, w, h), { color, ...props });
    const label = (x, y, w, h, color, text, props = {}) => block(x, y, w, h, color, { label: text, fs: 20, halign: "right", valign: "middle", ...props });
    const pill = (x, y, w, text, color) => add("button", X(x, y, w, 5), { label: text, color, fs: 20, halign: "left" });
    const number = (y, text) => add("text", X(31, y - 1, 9, 7), { label: text, tcolor: "#FFFFFF", fs: 38, halign: "right", fit: false });
    const PURPLE = "#A68AD8";

    // Frame: two big elbows with a small one nested inside each
    add("elbow", X(0, 4, 59, 25), { corner: "tl", color: "sandy-brown", side: 32, bar: 11, rx: 12, ry: 12, ri: 6 });
    add("text", X(60, 4, 66, 11), { label: "Holodeck Programming", tcolor: "command-gold", fs: 50, halign: "left", fit: false });
    block(127, 4, 9, 10, "sandy-brown", { ends: "right" });
    add("elbow", X(34, 19, 37, 10), { corner: "tl", color: "command-gold", side: 11, bar: 4, rx: 5, ry: 5, ri: 3 });
    label(80, 19, 24, 4, "command-gold", "LCARS", { fs: 18 });
    block(105, 19, 4, 4, "command-gold", { ends: "right" });

    add("elbow", X(0, 91, 45, 13), { corner: "bl", color: "sandy-brown", side: 32, bar: 6, rx: 8, ry: 8, ri: 3 });
    add("elbow", X(34, 91, 12, 6), { corner: "bl", color: "command-gold", side: 8, bar: 4, rx: 4, ry: 4, ri: 2 });
    for (const [x, w] of [[47, 12], [60, 12], [76, 27]]) block(x, 93, w, 4, "command-gold");
    block(104, 93, 4, 4, "command-gold", { ends: "right" });
    const tab = (x, w, text) => label(x, 98, w, 6, "neon-carrot", text, { halign: "left" });
    tab(47, 12, "Scene");
    tab(60, 12, "Sim 14");
    tab(76, 27, "Wardrobe");
    tab(104, 22, "Parameter");
    block(127, 98, 5, 6, "sandy-brown", { ends: "right" });

    // Left column, with small blocks beside some rows
    const rows = [
      [32, "Library", "neon-carrot", "neon-carrot"], [38, "Log 677", "sandy-brown", ""], [44, "Eve 331", "command-gold", "neon-carrot"],
      [50, "", "", "command-gold"], [56, "Ident 9", PURPLE, ""], [62, "Lock 41", "melrose", "melrose"],
      [68, "Frame 1", "fc-lavender", "fc-lavender"], [74, "Mo 5780", "neon-carrot", ""],
    ];
    for (const [y, text, color, side] of rows) {
      if (text) label(0, y, 27, 5, color, text);
      if (side) block(28, y, 4, 5, side);
    }

    // Big numbers, each with a small block after it
    number(32, "15");
    number(56, "481");
    number(68, "131");
    number(74, "00");
    number(80, "00");
    const marks = (x, list) => { for (const [y, color] of list) block(x, y, 2, 5, color); };
    marks(40, [[32, "bourbon"], [44, "neon-carrot"], [56, PURPLE], [62, "melrose"], [68, "fc-lavender"], [74, "bourbon"], [80, "bourbon"]]);

    // The program list
    const sims = [["03-889", "Scuba diving. Hanuma Bay, Earth"], ["02-556", "Klingon rite of ascension chamber"], ["03-992", "Calisthenics - Lt. Worf"],
      ["03-9986", "Dixon Hill in \"The Black Orchid\""], ["03-936", "Dixon Hill in \"The Long Dark Tunnel\""], ["03-225", "Shi-Kar desert survival, Vulcan"],
      ["05-865", "Carnival , Rio de Janero, Earth"], ["06-229", "Utopia Planitia, Mars"], ["07-441", "Old West, North America, Earth"]];
    const list = { tcolor: "#FFFFFF", fs: 15, halign: "left", valign: "top", fit: false, wrap: true };
    add("text", X(47, 26, 40, 34), { ...list, label: ["Select Simulation", ...sims.map(([n]) => n)].join("\n") });
    add("text", X(56, 26, 34, 34), { ...list, label: ["", ...sims.map(([, t]) => t)].join("\n") });

    // Buttons in three columns
    pill(47, 62, 12, "Circa", "melrose");
    pill(60, 62, 12, "ME 618", "melrose");
    pill(76, 62, 12, "Func", "melrose");
    pill(60, 68, 12, "VB 228", "fc-lavender");
    pill(76, 68, 12, "Route", "fc-lavender");
    pill(47, 74, 12, "Edit", "neon-carrot");
    pill(60, 74, 12, "BA 631", "neon-carrot");
    pill(76, 74, 12, "Open", "neon-carrot");
    pill(47, 80, 12, "Mode", "neon-carrot");
    pill(76, 80, 12, "Sync", "neon-carrot");

    // A tall bar between two columns of small blocks, then the right-hand buttons
    marks(88, [[32, "command-gold"], [44, "neon-carrot"], [56, PURPLE], [62, "melrose"], [68, "fc-lavender"], [80, "neon-carrot"]]);
    block(91, 32, 11, 53, "bourbon");
    marks(104, [[32, "neon-carrot"], [38, "neon-carrot"], [44, "neon-carrot"], [56, PURPLE], [62, "melrose"], [68, "fc-lavender"], [80, "neon-carrot"]]);
    const tag = (y, text, color) => add("button", X(107, y, 12, 5), { label: text, color, ends: "right", fs: 20, halign: "left" });
    tag(32, "BV 691", "neon-carrot");
    tag(38, "PWR", "neon-carrot");
    tag(56, "RO 773", PURPLE);
    tag(62, "TB 500", "melrose");
    tag(74, "Time", "neon-carrot");
    tag(80, "RO 449", "neon-carrot");
    return d;
  }

  const TEMPLATES = {
    classic: { name: "Classic frame", make: () => classicTemplate() },
    access: { name: "LCARS Access", make: () => accessTemplate() },
    holodeck: { name: "Holodeck", make: () => holodeckTemplate() },
  };

  /* ------------------------------------------------------------------ *
   * Start
   * ------------------------------------------------------------------ */

  /** Re-fit text after the font loads. That isn't a change of yours, so a saved site stays saved. */
  function refit() {
    const clean = !unsaved();
    if (fitAll()) {
      commit();
      if (clean) markSaved();
    }
  }

  function fitAll() {
    let changed = false;
    for (const p of doc.pieces) changed = fitToText(p) || changed;
    return changed;
  }

  let saved = null;
  try { saved = localStorage.getItem(SITE_KEY) ?? (STORAGE_KEY && localStorage.getItem(STORAGE_KEY)); } catch { /* storage unavailable */ }
  try {
    loadSite(saved ? JSON.parse(saved) : { pages: [classicTemplate()] });
  } catch {
    loadSite({ pages: [classicTemplate()] });
  }
  commit();
  // Changes not saved to a file before the last close are still unsaved.
  let wasDirty = false;
  try { wasDirty = !!JSON.parse(localStorage.getItem(FILE_KEY))?.dirty; } catch { /* storage unavailable */ }
  savedSnap = wasDirty ? "" : snapshot();
  updateTitle();
  $("#sp-new").addEventListener("click", newProject);
  $("#sp-open").addEventListener("click", openFile);
  showSplash();
  if (APP) {
    useAppFont();
    tellWindowFile();
    // Debug build or release? (The page panel shows the start screen's power-up only in debug.)
    designerKnown.then(renderInspector);
    // Opened for a project (double-clicked, at start or while POLARIS runs): open it.
    appCall("launch_file").then((path) => path && openPath(path)).catch(() => {});
    // Closing with changes not saved to a file asks first. The last window keeps its work for next
    // time; closing any other window lets its work go, as closing a window in VS Code does.
    APP.window.getCurrentWindow().onCloseRequested(async (event) => {
      const last = (await appCall("builder_windows").catch(() => 1)) <= 1;
      if (unsaved()) {
        const close = await APP.dialog.ask(
          last ? "Some changes aren't saved to a file. Close anyway?\n\nThe builder still keeps your work for next time."
            : "Some changes aren't saved to a file. Close this window anyway?\n\nThose changes will be lost.",
          { title: last ? "Close POLARIS?" : "Close this window?", kind: "warning", okLabel: "Close", cancelLabel: "Keep working" });
        if (!close) return event.preventDefault();
      }
      if (!last) {
        try { localStorage.removeItem(SITE_KEY); localStorage.removeItem(FILE_KEY); } catch { /* storage unavailable */ }
      }
    });
  }
  // Text sizes depend on the font, so re-fit once it has loaded.
  document.fonts?.ready.then(refit);

  window.lcarsBuilder = {
    get doc() { return doc; }, get site() { return site; }, get unsaved() { return unsaved(); }, pageHTML, pageCSS, load, loadSite, select, flip, switchPage, previewPage,
    startEdit: (id) => startEdit(piece(id)),
    colorText, parseLabel, serialize,
  };
})();
