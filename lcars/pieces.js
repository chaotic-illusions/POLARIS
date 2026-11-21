/*
 * Motion for POLARIS pieces that CSS alone can't do. Load it with
 * pieces.css:
 *
 *   gauges   the pointer of each animated Gauge (.p-gauge.animate) swings up
 *            and down, each swing to a new random height. It moves like a
 *            needle with weight: it speeds up and slows down at a set rate up
 *            to a top speed (a full-scale swing takes about 5.8 s), so short
 *            hops never get going and look as calm as long sweeps. It pauses
 *            a quarter second each time it changes direction. Without this
 *            script the pointer follows its fixed path from pieces.css instead.
 *
 *   numbers  Number Cascades with a Motion other than Scroll (which is CSS):
 *              fill    rows type in top to bottom, hold, a row flares white,
 *                      then they clear and refill, some numbers new
 *              sweep   rows type in top to bottom and hold; then a band two rows
 *                      deep, in the highlight colour, moves down a row at a time
 *                      to the bottom, waits there, and they clear and refill
 *                      (as on the Master Systems Status screens)
 *              shift   now and then one column slides up or down a few rows,
 *                      wrapping round, while the rest stay put
 *              update  single numbers change in place, a few a second
 *            and with "Highlights come and go" (.cm-hl), random single numbers
 *            light up in the highlight colour for a few seconds each
 *
 * Each motion works out its own random sequence from a seed when it starts,
 * then shows itself as it is at the time, every frame. So it can be shown at
 * any moment, earlier ones too (the POLARIS preview moves the page's clock
 * back and forth), and it never drifts.
 *
 * Pieces added later (or switched on) are picked up on their own. With
 * reduced motion turned on in the operating system, they stay still.
 *
 * A plain script (not a module), so pages work when opened from disk.
 */
(() => {
  "use strict";

  const DOT = ".p-gauge.animate .g-dot";
  const LOW = 5, HIGH = 95; // the pointer's range, in % of the scale
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  /** Top speed, in % of the scale per second (the range in 5 s), and the seconds it takes to reach it. */
  const TOP_SPEED = (HIGH - LOW) / 5, RAMP = 0.8;
  const ACCEL = TOP_SPEED / RAMP;
  /** Milliseconds the pointer rests each time it changes direction. */
  const PAUSE = 250;

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
  /** A random number for (seed, a, b, c), the same every time it's asked. */
  const hash = (seed, a = 0, b = 0, c = 0) =>
    seeded((seed ^ Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca77) ^ Math.imul(c + 1, 0xc2b2ae3d)) >>> 0)();
  const newSeed = () => Math.floor(Math.random() * 2 ** 32);

  /* ---------------- the frame loop ---------------- */

  /** Running motions: { alive(), render(t), stop(), t0 }. */
  const motions = new Set();
  let raf = 0;
  function loop() {
    raf = 0;
    const now = performance.now();
    for (const m of motions) {
      if (!m.alive()) {
        motions.delete(m);
        m.stop();
        later();
        continue;
      }
      m.render(Math.max(0, now - m.t0));
    }
    if (motions.size) raf = requestAnimationFrame(loop);
  }
  function begin(m) {
    m.t0 = performance.now();
    motions.add(m);
    m.render(0);
    if (!raf) raf = requestAnimationFrame(loop);
  }
  /** Find the index of the last item whose `key` is at or before t (items sorted by it), or -1. */
  function lastAt(list, t, key) {
    let lo = 0, hi = list.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid][key] <= t) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return found;
  }

  /* ---------------- gauges ---------------- */

  /**
   * A move of d (% of the scale): speed up, cruise at top speed if there's
   * room, slow down. Short moves never reach top speed. Returns how long it
   * takes (ms) and how far it has got at a time (s) into it.
   */
  function move(d) {
    const dist = Math.abs(d);
    const peak = Math.min(TOP_SPEED, Math.sqrt(dist * ACCEL));
    const ramp = peak / ACCEL;
    const secs = dist / peak + ramp;
    const at = (t) =>
      t <= 0 ? 0 : t >= secs ? dist
        : t < ramp ? 0.5 * ACCEL * t * t
          : t > secs - ramp ? dist - 0.5 * ACCEL * (secs - t) ** 2
            : 0.5 * ACCEL * ramp * ramp + peak * (t - ramp);
    return { ms: secs * 1000, at };
  }

  const gauged = new WeakSet();
  /** One pointer's swings: each a rest, then a move to a new height. */
  function gauge(dot) {
    if (gauged.has(dot)) return;
    gauged.add(dot);
    const rand = seeded(newSeed());
    let at = parseFloat(dot.style.getPropertyValue("--p0")) || 50;
    let down = rand() < 0.5;
    const swings = []; // { from: ms it starts resting, go: ms it starts moving, end, top0, to, path }
    const extend = (t) => {
      while (!swings.length || swings[swings.length - 1].end <= t) {
        const from = swings.length ? swings[swings.length - 1].end : 0;
        // How far: anything from a twitch to most of the scale, mostly middling.
        const far = 6 + rand() ** 1.4 * 80;
        // Which way: alternate up and down, unless there's no room to go that way.
        down = !down;
        if ((down ? HIGH - at : at - LOW) < 8) down = !down;
        const to = at + (down ? 1 : -1) * Math.min(far, down ? HIGH - at : at - LOW);
        const path = move(to - at);
        swings.push({ from, go: from + PAUSE, end: from + PAUSE + path.ms, top0: at, to, path });
        at = to;
      }
    };
    dot.style.animation = "none";
    begin({
      alive: () => dot.isConnected && dot.matches(DOT) && !reduced.matches,
      render(t) {
        extend(t);
        const s = swings[Math.max(0, lastAt(swings, t, "from"))];
        const d = s.path.at((t - s.go) / 1000);
        dot.style.top = `${s.top0 + Math.sign(s.to - s.top0) * d}%`;
      },
      stop() {
        gauged.delete(dot);
        dot.style.animation = "";
        dot.style.top = "";
      },
    });
  }

  /* ---------------- number cascades ---------------- */

  const numbering = new WeakMap(); // cascade -> its motion while running
  const digitsFor = (len, seed, a, b) => Array.from({ length: len }, (_, i) => Math.floor(hash(seed, a, b, i + 7) * 10)).join("");

  /** Run a cascade's motion until its motion changes or it leaves the page. */
  function number(piece) {
    const mode = Object.keys(NUMBERS).find((m) => piece.classList.contains(`cm-${m}`));
    if (!mode || numbering.get(piece) === mode) return;
    numbering.set(piece, mode);
    const cols = [...piece.querySelectorAll(".cc")];
    // Redrawn (the builder replaces a piece's insides), switched to another motion, or gone: stop.
    const alive = () => piece.isConnected && piece.classList.contains(`cm-${mode}`) && !reduced.matches &&
      cols.length > 0 && cols[0].parentNode && piece.contains(cols[0]);
    const m = NUMBERS[mode](cols, newSeed());
    begin({
      alive,
      render: m.render,
      stop() {
        m.stop?.();
        for (const c of cols) for (const s of c.children) s.classList.remove("off", "flare", "band");
        if (numbering.get(piece) === mode) numbering.delete(piece);
      },
    });
  }

  /** The numbers as first drawn, so they can be put back. */
  const originals = (cells) => cells.map((s) => s.textContent);

  /**
   * Fill: rows type in one at a time and hold; then one row flares (or,
   * sweeping, a two-row band in the highlight colour moves down to the
   * bottom); then they clear and refill with some new numbers (about a third).
   */
  function fill(cols, seed, sweeping = false) {
    const rows = Math.max(...cols.map((c) => c.children.length));
    const row = (i) => cols.map((c) => c.children[i]).filter(Boolean);
    const cells = cols.flatMap((c) => [...c.children]);
    const first = originals(cells);
    const shown = 250 + rows * 150; // all rows in
    const band = Math.min(2, rows);
    const cycle = sweeping ? shown + 1900 + (rows - band + 1) * 250 + 450 : shown + 2200 + 260 + 1600;
    let last = "";
    let numbersOf = -1;
    return {
      render(t) {
        const k = Math.floor(t / cycle), u = t - k * cycle;
        const on = u < 250 ? 0 : Math.min(rows, Math.floor((u - 250) / 150) + 1); // rows showing
        let lit = -1, flare = -1;
        if (sweeping) {
          const s = u - shown - 1900;
          if (s >= 0 && s < (rows - band + 1) * 250 + 450) lit = Math.min(rows - band, Math.floor(s / 250));
        } else if (u >= shown + 2200 && u < shown + 2460) flare = Math.floor(hash(seed, k) * rows);
        // The numbers for this round: each cell as it was last renumbered (a third of them each round).
        if (k !== numbersOf) {
          numbersOf = k;
          cells.forEach((s, i) => {
            let text = first[i];
            for (let j = k - 1; j >= 0; j--) if (hash(seed, i, j) < 0.3) { text = digitsFor(first[i].length, seed, i, j); break; }
            if (s.textContent !== text) s.textContent = text;
          });
        }
        const key = `${on}|${lit}|${flare}`;
        if (key === last) return;
        last = key;
        for (let i = 0; i < rows; i++) {
          const inBand = lit >= 0 && i >= lit && i < lit + band;
          for (const s of row(i)) {
            s.classList.toggle("off", i >= on);
            s.classList.toggle("band", inBand);
            s.classList.toggle("flare", i === flare);
          }
        }
      },
      stop() { cells.forEach((s, i) => { s.textContent = first[i]; }); },
    };
  }

  /** Fill, with a two-row highlight band moving down before each refill. */
  const sweep = (cols, seed) => fill(cols, seed, true);

  /** Every second or two, one column slides a few rows up or down, wrapping round. */
  function shift(cols, seed) {
    const rand = seeded(seed);
    const firsts = cols.map((c) => [...c.children]);
    const moves = []; // { at, col, dir, n, end, after: each column's offset once it's done }
    let offsets = cols.map(() => 0);
    const extend = (t) => {
      while (!moves.length || moves[moves.length - 1].end <= t + 5000) {
        const prev = moves.length ? moves[moves.length - 1].end : 0;
        const at = prev + 900 + rand() * 2200;
        const col = Math.floor(rand() * cols.length), dir = rand() < 0.5 ? 1 : -1;
        const n = 2 + Math.floor(rand() * 6);
        offsets = offsets.slice();
        offsets[col] += dir * n;
        moves.push({ at, col, dir, n, end: at + n * 110, after: offsets });
      }
    };
    const placed = cols.map(() => 0);
    const arrange = (ci, o) => {
      if (placed[ci] === o) return;
      placed[ci] = o;
      const kids = firsts[ci], L = kids.length;
      const order = kids.map((_, i) => kids[(((i - o) % L) + L) % L]);
      cols[ci].append(...order);
    };
    return {
      render(t) {
        extend(t);
        const i = lastAt(moves, t, "at");
        const done = i > 0 ? moves[i - 1].after : cols.map(() => 0); // where each column was before this move
        const m = i >= 0 ? moves[i] : null;
        cols.forEach((c, ci) => {
          let o = done[ci], slide = 0;
          if (m && m.col === ci) {
            const into = Math.min(t - m.at, m.n * 110);
            const steps = Math.floor(into / 110);
            o += m.dir * steps;
            if (steps < m.n) slide = (into - steps * 110) / 110;
          }
          arrange(ci, o);
          const h = c.firstElementChild?.offsetHeight || 0;
          c.style.transform = slide && h ? `translateY(${m.dir * h * slide}px)` : "";
        });
      },
      stop() {
        cols.forEach((c, ci) => { arrange(ci, 0); c.style.transform = ""; });
      },
    };
  }

  /** Single numbers change in place, a few a second. */
  function update(cols, seed) {
    const rand = seeded(seed);
    const cells = cols.flatMap((c) => [...c.children]);
    const first = originals(cells);
    const changes = []; // { at, cell, text }
    const extend = (t) => {
      while (!changes.length || changes[changes.length - 1].at <= t) {
        const at = (changes.length ? changes[changes.length - 1].at : 0) + 80 + rand() * 260;
        const cell = Math.floor(rand() * cells.length);
        changes.push({ at, cell, text: Array.from(first[cell], () => Math.floor(rand() * 10)).join("") });
      }
    };
    let shownUpTo = -1;
    return {
      render(t) {
        if (!cells.length) return;
        extend(t);
        const i = lastAt(changes, t, "at");
        if (i === shownUpTo) return;
        if (i > shownUpTo) {
          for (let j = shownUpTo + 1; j <= i; j++) cells[changes[j].cell].textContent = changes[j].text;
        } else {
          // Back in time: each cell as its last change by then left it.
          const seen = new Set();
          for (let j = i; j >= 0 && seen.size < cells.length; j--) {
            if (seen.has(changes[j].cell)) continue;
            seen.add(changes[j].cell);
            cells[changes[j].cell].textContent = changes[j].text;
          }
          cells.forEach((s, ci) => { if (!seen.has(ci)) s.textContent = first[ci]; });
        }
        shownUpTo = i;
      },
      stop() { cells.forEach((s, i) => { s.textContent = first[i]; }); },
    };
  }

  const NUMBERS = { fill, sweep, shift, update };

  /** Random single numbers light up for a while, about one in twenty at a time. */
  const glowing = new WeakSet();
  function glow(piece) {
    if (glowing.has(piece)) return;
    glowing.add(piece);
    const cols = [...piece.querySelectorAll(".cc")];
    const alive = () => piece.isConnected && piece.classList.contains("cm-hl") && !reduced.matches &&
      cols.length > 0 && piece.contains(cols[0]);
    // A scrolling column holds two copies: light a number in both, so the loop stays seamless.
    const twins = (span) => {
      const col = span.parentNode, kids = [...col.children];
      if (!piece.classList.contains("animate")) return [span];
      const half = kids.length / 2, i = kids.indexOf(span);
      return [span, kids[i < half ? i + half : i - half]].filter(Boolean);
    };
    const cells = cols.flatMap((c) => [...c.children]);
    const target = Math.max(1, Math.round(cells.length / (piece.classList.contains("animate") ? 40 : 20)));
    const rand = seeded(newSeed());
    const lights = []; // { at, end, spans }, in order of `at`
    let clock = 0;
    /** The lights on at t (none lasts over 5 s, so only recent ones need a look). */
    const litAt = (t) => {
      const out = [];
      for (let i = lights.length - 1; i >= 0 && lights[i].at > t - 5000; i--) if (lights[i].at <= t && lights[i].end > t) out.push(lights[i]);
      return out;
    };
    const extend = (t) => {
      while (clock <= t) {
        const lit = litAt(clock).length;
        clock += lit < target ? 120 + rand() * 300 : 400;
        if (litAt(clock).length >= target) continue;
        const busy = new Set(litAt(clock).flatMap((l) => l.spans));
        const on = twins(cells[Math.floor(rand() * cells.length)]).filter((s) => !busy.has(s));
        const end = clock + 1500 + rand() * 3500;
        if (on.length) lights.push({ at: clock, end, spans: on });
      }
    };
    let last = new Set();
    begin({
      alive,
      render(t) {
        if (!cells.length) return;
        extend(t);
        const now = new Set();
        for (let i = lastAt(lights, t, "at"); i >= 0 && lights[i].at > t - 5000; i--) {
          if (lights[i].end > t) for (const s of lights[i].spans) now.add(s);
        }
        for (const s of last) if (!now.has(s)) s.classList.remove("hl");
        for (const s of now) if (!last.has(s)) s.classList.add("hl");
        last = now;
      },
      stop() {
        for (const c of cols) for (const s of c.children) s.classList.remove("hl");
        glowing.delete(piece);
      },
    });
  }

  let queued = false;
  function scan() {
    queued = false;
    if (reduced.matches) return;
    document.querySelectorAll(DOT).forEach(gauge);
    document.querySelectorAll(".p-cascade:is(.cm-fill, .cm-sweep, .cm-shift, .cm-update)").forEach(number);
    document.querySelectorAll(".p-cascade.cm-hl").forEach(glow);
  }
  function later() {
    if (!queued) {
      queued = true;
      requestAnimationFrame(scan);
    }
  }

  new MutationObserver(later).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["class"],
  });
  reduced.addEventListener("change", later);
  later();
})();
