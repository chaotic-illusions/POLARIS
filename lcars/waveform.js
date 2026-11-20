/*
 * <lcars-waveform>: an animated LCARS waveform, a row of thin vertical lines
 * whose heights move like a voice on a comm channel, optionally inside an
 * LCARS bracket.
 *
 *   <script src="lcars/waveform.js"></script>
 *   <lcars-waveform style="width: 420px; height: 240px" bracket></lcars-waveform>
 *
 * Attributes (all optional):
 *
 *   color          the waveform's main color: an LCARS color name or any CSS color (chestnut-rose)
 *   color2         its second color (tamarillo)
 *   gradient       how the two colors blend:
 *                    lines   along each line: color in the middle, color2 at its tips (default)
 *                    height  by height: color across the middle, color2 toward the top and
 *                            bottom, so short lines stay the main color
 *                    across  left to right, color to color2
 *                    solid   color only
 *   fade           the tips of the lines fade out to nothing
 *   lines          how many lines (48)
 *   thickness      line width, as a percentage of the space for each line (50)
 *   shape          the outline the lines fill: diamond (default), oval or flat
 *   motion         voice (default; bursts and pauses like speech), pulse (a slow
 *                  breath), ripple (waves travelling across) or still
 *   speed          animation speed, 1 = normal
 *   bracket        draw LCARS brackets either side
 *   bracket-color  the brackets' color (andorian-blue)
 *   accent, accent2, accent3   the blocks down each bracket's side
 *                  (flat-dark-earth, husk, blue-bell)
 *   pattern        how the blocks are laid out. Left out: three blocks the same
 *                  size. A number: 2 to 4 blocks of varied sizes, reaching
 *                  varied distances up and down the side, the colors starting
 *                  from a varied accent; the same number always gives the same
 *                  layout. "random": a new layout each time the page loads.
 *   mirror         with a pattern, both brackets get the same blocks (otherwise
 *                  each side has its own)
 *
 * Color names are the LCARS names from palette-data.js, used through their
 * CSS variables (--lcars-<name>) when lcars/palette.css is loaded, so a page
 * can restyle them. The element is 160px tall unless sized otherwise. It
 * stops animating while off screen, and with reduced motion turned on in the
 * operating system it holds still.
 *
 * A plain script (not a module), so pages work when opened from disk.
 */
(() => {
  "use strict";

  if (customElements.get("lcars-waveform")) return;

  const SVG = "http://www.w3.org/2000/svg";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  /** Hex values for the default colors, used when lcars/palette.css isn't loaded. */
  const FALLBACK = {
    "chestnut-rose": "#CC6666", tamarillo: "#882211", "andorian-blue": "#55A7FF",
    "flat-dark-earth": "#CC9966", husk: "#BBAA55", "blue-bell": "#9999CC",
  };

  /** A CSS color for an LCARS name, a hex value or any CSS color. */
  function paint(value, fallback) {
    const v = String(value || "").trim().toLowerCase() || fallback;
    if (/^#|\(/.test(v)) return v;
    const hex = window.TrekPadd?.NAMED?.[v] ?? FALLBACK[v];
    return /^[a-z][a-z0-9-]*$/.test(v) ? `var(--lcars-${v}, ${hex ?? v})` : fallback;
  }

  const SHAPES = {
    diamond: (u) => 0.05 + 0.95 * (1 - Math.abs(u)),
    oval: (u) => 0.05 + 0.95 * Math.sqrt(Math.max(0, 1 - u * u)),
    flat: () => 1,
  };

  /** A repeatable random number source (mulberry32): the same seed, the same numbers. */
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let count = 0;

  const el = (name, attrs = {}) => {
    const n = document.createElementNS(SVG, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const r2 = (v) => Math.round(v * 100) / 100;

  class LcarsWaveform extends HTMLElement {
    static observedAttributes = ["color", "color2", "gradient", "fade", "lines", "thickness", "shape", "motion",
      "speed", "bracket", "bracket-color", "accent", "accent2", "accent3", "pattern", "mirror"];

    constructor() {
      super();
      this.uid = `lw${++count}`;
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML = `<style>
        :host { display: block; position: relative; height: 160px; }
        :host([hidden]) { display: none; }
        svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; overflow: visible; }
      </style>`;
      this.svg = el("svg", { "aria-hidden": "true", part: "svg" });
      root.append(this.svg);
      this.bars = [];
      this.visible = true;
      this.raf = 0;
      this.dice = Math.floor(Math.random() * 2 ** 31); // the seed for pattern="random", kept while the page is open
      this.tick = this.tick.bind(this);
      this.onMotion = () => this.build();
    }

    connectedCallback() {
      this.resize = new ResizeObserver(() => this.build());
      this.resize.observe(this);
      this.seen = new IntersectionObserver(([e]) => {
        this.visible = e.isIntersecting;
        this.play();
      });
      this.seen.observe(this);
      reduced.addEventListener("change", this.onMotion);
      this.build();
    }

    disconnectedCallback() {
      this.resize?.disconnect();
      this.seen?.disconnect();
      reduced.removeEventListener("change", this.onMotion);
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }

    attributeChangedCallback() {
      if (!this.isConnected || this.queued) return;
      this.queued = true;
      queueMicrotask(() => {
        this.queued = false;
        this.build();
      });
    }

    /** The attributes, read with their defaults. */
    get options() {
      const num = (name, def, lo, hi) => {
        const v = parseFloat(this.getAttribute(name));
        return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
      };
      const pick = (name, list) => (list.includes(this.getAttribute(name)) ? this.getAttribute(name) : list[0]);
      return {
        color: paint(this.getAttribute("color"), "chestnut-rose"),
        color2: paint(this.getAttribute("color2"), "tamarillo"),
        gradient: pick("gradient", ["lines", "height", "across", "solid"]),
        fade: this.hasAttribute("fade"),
        lines: Math.round(num("lines", 48, 1, 400)),
        thickness: num("thickness", 50, 5, 100) / 100,
        shape: pick("shape", ["diamond", "oval", "flat"]),
        motion: pick("motion", ["voice", "pulse", "ripple", "still"]),
        speed: num("speed", 1, 0, 10),
        bracket: this.hasAttribute("bracket"),
        bracketColor: paint(this.getAttribute("bracket-color"), "andorian-blue"),
        accents: [paint(this.getAttribute("accent"), "flat-dark-earth"), paint(this.getAttribute("accent2"), "husk"),
          paint(this.getAttribute("accent3"), "blue-bell")],
        pattern: this.pattern,
        mirror: this.hasAttribute("mirror"),
      };
    }

    /** The bracket blocks' seed: null for even blocks, a number, or this page load's own for "random". */
    get pattern() {
      const v = (this.getAttribute("pattern") || "").trim().toLowerCase();
      if (!v) return null;
      if (v === "random") return this.dice;
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : [...v].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
    }

    /** Draw everything for the element's current size and attributes. */
    build() {
      const W = this.clientWidth, H = this.clientHeight;
      const o = this.options;
      this.opts = o;
      this.svg.replaceChildren();
      this.bars = [];
      if (!W || !H) return this.play();
      this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      const defs = el("defs");
      this.svg.append(defs);

      // The waveform's area: the whole element, or between the brackets' arms.
      let x0 = 0, x1 = W, y0 = 0, y1 = H;
      if (o.bracket) {
        const arm = this.drawBrackets(W, H, o);
        const room = Math.max(2, H * 0.06);
        if (W - 2 * (arm + room) > 8) [x0, x1] = [arm + room, W - arm - room];
        [y0, y1] = [H * 0.1, H * 0.9];
      }

      // How the lines are colored.
      const id = this.uid;
      const stops = (grad, list) => {
        for (const [offset, color, opacity = 1] of list) {
          grad.append(el("stop", { offset, style: `stop-color:${color};stop-opacity:${opacity}` }));
        }
        defs.append(grad);
      };
      const ends = o.fade
        ? [[0, o.color2, 0], [0.24, o.color2], [0.5, o.color], [0.76, o.color2], [1, o.color2, 0]]
        : [[0, o.color2], [0.5, o.color], [1, o.color2]];
      let fill;
      if (o.gradient === "lines") {
        stops(el("linearGradient", { id: `${id}g`, x1: 0, y1: 0, x2: 0, y2: 1 }), ends);
        fill = `url(#${id}g)`;
      } else if (o.gradient === "height") {
        stops(el("linearGradient", { id: `${id}g`, gradientUnits: "userSpaceOnUse", x1: 0, y1: r2(y0), x2: 0, y2: r2(y1) }), ends);
        fill = `url(#${id}g)`;
      } else if (o.gradient === "across") {
        stops(el("linearGradient", { id: `${id}g`, gradientUnits: "userSpaceOnUse", x1: r2(x0), y1: 0, x2: r2(x1), y2: 0 }),
          [[0, o.color], [1, o.color2]]);
        fill = `url(#${id}g)`;
      }
      const group = el("g", fill ? { fill } : { style: `fill:${o.color}` });
      if (o.fade && (o.gradient === "across" || o.gradient === "solid")) {
        // Fade by height instead: the top and bottom of the area fade out.
        const fadeGrad = el("linearGradient", { id: `${id}f`, gradientUnits: "userSpaceOnUse", x1: 0, y1: r2(y0), x2: 0, y2: r2(y1) });
        stops(fadeGrad, [[0, "#fff", 0], [0.3, "#fff"], [0.7, "#fff"], [1, "#fff", 0]]);
        const mask = el("mask", { id: `${id}m`, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: W, height: H });
        mask.append(el("rect", { x: 0, y: 0, width: W, height: H, fill: `url(#${id}f)` }));
        defs.append(mask);
        group.setAttribute("mask", `url(#${id}m)`);
      }

      // The lines, centred on the middle height.
      const n = o.lines, step = (x1 - x0) / n, bw = Math.max(0.5, step * o.thickness);
      const env = SHAPES[o.shape];
      this.mid = (y0 + y1) / 2;
      this.half = (y1 - y0) / 2;
      for (let i = 0; i < n; i++) {
        const u = ((i + 0.5) / n) * 2 - 1;
        const rect = el("rect", { x: r2(x0 + step * (i + 0.5) - bw / 2), width: r2(bw) });
        group.append(rect);
        this.bars.push({ rect, u, env: env(u), jit: Math.random(), phase: Math.random() * Math.PI * 2 });
      }
      this.svg.append(group);

      // Start from the still shape (also what reduced motion shows).
      this.level = 0.5;
      this.target = 0.8;
      this.hold = 0;
      this.t = 0;
      this.draw(() => 0.92);
      this.play();
    }

    /**
     * LCARS brackets either side; returns how far their arms reach in from the edge.
     * Each bracket is a top and a bottom half joined by accent blocks down its side.
     */
    drawBrackets(W, H, o) {
      const T = Math.max(3, Math.min(H * 0.075, W * 0.08)); // side thickness
      const A = Math.max(T + 2, Math.min(H * 0.17, W * 0.2)); // arm length, from the outside
      const at = Math.max(2, H * 0.06); // arm thickness
      const R = Math.min(H * 0.1, A, H / 4); // outer corner
      const ri = Math.min(at, T) * 0.6; // inner corner
      const g = Math.max(1.5, H * 0.016); // gap between blocks
      const f = r2;
      // A half, from the arm down the side to depth d.
      const half = (d) => `M${f(A)},0 H${f(R)} A${f(R)},${f(R)} 0 0 0 0,${f(R)} V${f(d)} H${f(T)} ` +
        `V${f(at + ri)} A${f(ri)},${f(ri)} 0 0 1 ${f(T + ri)},${f(at)} H${f(A)} Z`;

      // The blocks: three the same size, or a pattern from the seed.
      const even = { top: H * 0.24, bottom: H * 0.76, sizes: [1, 1, 1], first: 0 };
      const rand = o.pattern == null ? null : seeded(o.pattern);
      const layout = () => {
        if (!rand) return even;
        const n = 2 + Math.floor(rand() * 3);
        return {
          top: H * (0.17 + rand() * 0.13), bottom: H * (0.7 + rand() * 0.13),
          sizes: Array.from({ length: n }, () => 0.35 + rand()), first: Math.floor(rand() * 3),
        };
      };
      const left = layout();
      const right = rand && !o.mirror ? layout() : left;

      const side = ({ top, bottom, sizes, first }, transform) => {
        const s = el("g", transform ? { transform } : {});
        s.append(el("path", { d: half(top), style: `fill:${o.bracketColor}` }));
        s.append(el("path", { d: half(H - bottom), style: `fill:${o.bracketColor}`, transform: `matrix(1 0 0 -1 0 ${f(H)})` }));
        const room = bottom - top - (sizes.length + 1) * g;
        const total = sizes.reduce((a, b) => a + b, 0);
        let y = top + g;
        sizes.forEach((size, i) => {
          const h = (room * size) / total;
          s.append(el("rect", { x: 0, y: f(y), width: f(T), height: f(h), style: `fill:${o.accents[(first + i) % 3]}` }));
          y += h + g;
        });
        return s;
      };
      this.svg.append(side(left), side(right, `matrix(-1 0 0 1 ${f(W)} 0)`));
      return A;
    }

    /** Set every line's height from level(bar), a fraction of the full height. */
    draw(level) {
      for (const b of this.bars) {
        const h = Math.max(0.6, this.half * b.env * Math.min(1, Math.max(0.03, level(b))));
        b.rect.setAttribute("y", r2(this.mid - h));
        b.rect.setAttribute("height", r2(2 * h));
      }
    }

    get animated() {
      return this.bars.length && this.opts?.motion !== "still" && this.opts?.speed > 0 && !reduced.matches;
    }

    play() {
      const run = this.isConnected && this.visible && this.animated;
      if (run && !this.raf) {
        this.last = performance.now();
        this.raf = requestAnimationFrame(this.tick);
      } else if (!run && this.raf) {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
      }
      if (!this.animated) this.draw(() => 0.92);
    }

    tick(now) {
      this.raf = 0;
      if (!this.isConnected || !this.visible || !this.animated) return;
      const dt = Math.min(0.1, (now - this.last) / 1000) * this.opts.speed;
      this.last = now;
      const t = (this.t += dt);
      const ease = (tau) => 1 - Math.exp(-dt / tau);

      switch (this.opts.motion) {
        case "pulse": {
          const breath = 0.55 + 0.45 * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 2.4));
          this.draw((b) => breath * (0.93 + 0.07 * Math.sin(b.u * 9 + t * 5 + b.phase)));
          break;
        }
        case "ripple":
          this.draw((b) => 0.58 + 0.3 * Math.sin(b.u * 7 - t * 4.2) + 0.12 * Math.sin(b.u * 17 + t * 6.3));
          break;
        default: {
          // Speech: bursts of syllables at random loudness, now and then a pause.
          this.hold -= dt;
          if (this.hold <= 0) {
            const pause = Math.random() < 0.16;
            this.target = pause ? 0.06 + Math.random() * 0.08 : 0.5 + Math.random() * 0.5;
            this.hold = pause ? 0.15 + Math.random() * 0.4 : 0.07 + Math.random() * 0.2;
          }
          this.level += (this.target - this.level) * ease(this.target > this.level ? 0.04 : 0.1);
          const level = this.level;
          for (const b of this.bars) b.jit += (Math.random() - b.jit) * ease(0.05);
          this.draw((b) => level * (0.82 + 0.12 * Math.sin(b.u * 5.3 + t * 8.1 + 0.4) +
            0.1 * Math.sin(b.u * 11.7 - t * 13.3 + 1.3) + 0.24 * (b.jit - 0.5)));
        }
      }
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  // A page may load this script twice; the second copy leaves the first one's element in place.
  if (!customElements.get("lcars-waveform")) customElements.define("lcars-waveform", LcarsWaveform);
})();
