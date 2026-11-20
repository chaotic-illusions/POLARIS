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
  const running = new WeakSet();

  /** Top speed, in % of the scale per second (the range in 5 s), and the seconds it takes to reach it. */
  const TOP_SPEED = (HIGH - LOW) / 5, RAMP = 0.8;
  const ACCEL = TOP_SPEED / RAMP;
  /** Milliseconds the pointer rests each time it changes direction. */
  const PAUSE = 250;

  /**
   * Keyframes for a move of d (% of the scale) from `from`: speed up, cruise
   * at top speed if there's room, slow down. Short moves never reach top speed.
   */
  function move(from, d) {
    const dist = Math.abs(d), sign = Math.sign(d);
    const peak = Math.min(TOP_SPEED, Math.sqrt(dist * ACCEL));
    const ramp = peak / ACCEL;
    const secs = dist / peak + ramp;
    const at = (t) =>
      t < ramp ? 0.5 * ACCEL * t * t
        : t > secs - ramp ? dist - 0.5 * ACCEL * (secs - t) ** 2
          : 0.5 * ACCEL * ramp * ramp + peak * (t - ramp);
    const n = Math.max(8, Math.ceil(secs * 30));
    const frames = [];
    for (let i = 0; i <= n; i++) frames.push({ top: `${from + sign * at((secs * i) / n)}%` });
    return { frames, ms: secs * 1000 };
  }

  /** Swing one pointer until its gauge stops animating or leaves the page. */
  function drive(dot) {
    if (running.has(dot)) return;
    running.add(dot);
    let at = parseFloat(dot.style.getPropertyValue("--p0")) || 50;
    let down = Math.random() < 0.5;
    let current = null;
    dot.style.animation = "none";
    dot.style.top = `${at}%`;

    const stop = () => {
      running.delete(dot);
      current?.cancel();
      dot.style.animation = "";
      dot.style.top = "";
    };

    const swing = () => {
      if (!dot.isConnected || !dot.matches(DOT) || reduced.matches) return stop();
      // How far: anything from a twitch to most of the scale, mostly middling.
      const far = 6 + Math.random() ** 1.4 * 80;
      // Which way: alternate up and down, unless there's no room to go that way.
      down = !down;
      if ((down ? HIGH - at : at - LOW) < 8) down = !down;
      const to = at + (down ? 1 : -1) * Math.min(far, down ? HIGH - at : at - LOW);
      const { frames, ms } = move(at, to - at);
      current = dot.animate(frames, { duration: ms, delay: PAUSE, fill: "forwards" });
      current.finished.then(() => {
        dot.style.top = `${to}%`;
        current.cancel();
        at = to;
        swing();
      }, () => {}); // cancelled by stop()
    };
    swing();
  }

  /* ---------------- number cascades ---------------- */

  const NUMBERS = { fill, sweep, shift, update };
  const numbering = new WeakMap(); // cascade -> its motion while running
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  /** A new number as long as the old one. */
  const renumber = (span) => {
    span.textContent = Array.from(span.textContent, () => Math.floor(Math.random() * 10)).join("");
  };

  /** Run a cascade's motion until its motion changes or it leaves the page. */
  function number(piece) {
    const mode = Object.keys(NUMBERS).find((m) => piece.classList.contains(`cm-${m}`));
    if (!mode || numbering.get(piece) === mode) return;
    numbering.set(piece, mode);
    const cols = [...piece.querySelectorAll(".cc")];
    // Redrawn (the builder replaces a piece's insides), switched to another motion, or gone: stop.
    const alive = () => piece.isConnected && piece.classList.contains(`cm-${mode}`) && !reduced.matches &&
      cols.length > 0 && cols[0].parentNode && piece.contains(cols[0]);
    NUMBERS[mode](cols, alive).finally(() => {
      for (const c of cols) for (const s of c.children) s.classList.remove("off", "flare", "band");
      if (numbering.get(piece) === mode) numbering.delete(piece);
      if (piece.isConnected) later();
    });
  }

  /** Fill, with a two-row highlight band moving down before each refill. */
  function sweep(cols, alive) {
    return fill(cols, alive, true);
  }

  /**
   * Rows type in one at a time and hold; then one row flares (or, sweeping, a
   * two-row band in the highlight colour moves down to the bottom); then they
   * clear and refill with some new numbers.
   */
  async function fill(cols, alive, sweeping = false) {
    const rows = Math.max(...cols.map((c) => c.children.length));
    const row = (i) => cols.map((c) => c.children[i]).filter(Boolean);
    while (alive()) {
      for (const c of cols) for (const s of c.children) s.classList.add("off");
      await sleep(250);
      for (let i = 0; i < rows && alive(); i++) {
        for (const s of row(i)) s.classList.remove("off");
        await sleep(150);
      }
      if (sweeping) {
        await sleep(1900);
        const band = Math.min(2, rows);
        let lit = [];
        for (let top = 0; top + band <= rows && alive(); top++) {
          for (const s of lit) s.classList.remove("band");
          lit = Array.from({ length: band }, (_, j) => row(top + j)).flat();
          for (const s of lit) s.classList.add("band");
          await sleep(250);
        }
        await sleep(450); // waits on the bottom rows
        for (const s of lit) s.classList.remove("band");
      } else {
        await sleep(2200);
        if (!alive()) return;
        const lit = row(Math.floor(Math.random() * rows));
        for (const s of lit) s.classList.add("flare");
        await sleep(260);
        for (const s of lit) s.classList.remove("flare");
        await sleep(1600);
      }
      for (const c of cols) for (const s of c.children) if (Math.random() < 0.3) renumber(s);
    }
  }

  /** Every second or two, one column slides a few rows up or down, wrapping round. */
  async function shift(cols, alive) {
    while (alive()) {
      await sleep(900 + Math.random() * 2200);
      if (!alive()) return;
      const col = pick(cols), down = Math.random() < 0.5;
      const h = col.firstElementChild?.offsetHeight || 0;
      for (let n = 2 + Math.floor(Math.random() * 6); n > 0 && alive() && h; n--) {
        const a = col.animate([{ transform: "none" }, { transform: `translateY(${down ? h : -h}px)` }], { duration: 110 });
        await a.finished.catch(() => {});
        if (down) col.prepend(col.lastElementChild);
        else col.append(col.firstElementChild);
      }
    }
  }

  /** Single numbers change in place, a few a second. */
  async function update(cols, alive) {
    const cells = cols.flatMap((c) => [...c.children]);
    while (alive()) {
      await sleep(80 + Math.random() * 260);
      if (alive() && cells.length) renumber(pick(cells));
    }
  }

  /** Random single numbers light up for a while, about one in twenty at a time. */
  const glowing = new WeakSet();
  async function glow(piece) {
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
    let lit = 0;
    while (alive()) {
      await sleep(lit < target ? 120 + Math.random() * 300 : 400);
      if (!alive() || lit >= target) continue;
      const on = twins(pick(cells)).filter((s) => !s.classList.contains("hl"));
      if (!on.length) continue;
      for (const s of on) s.classList.add("hl");
      lit++;
      sleep(1500 + Math.random() * 3500).then(() => {
        for (const s of on) s.classList.remove("hl");
        lit--;
      });
    }
    for (const c of cols) for (const s of c.children) s.classList.remove("hl");
    glowing.delete(piece);
    if (piece.isConnected) later();
  }

  let queued = false;
  function scan() {
    queued = false;
    if (reduced.matches) return;
    document.querySelectorAll(DOT).forEach(drive);
    document.querySelectorAll(".p-cascade:is(.cm-fill, .cm-sweep, .cm-shift, .cm-update)").forEach(number);
    document.querySelectorAll(".p-cascade.cm-hl").forEach(glow);
  }
  const later = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(scan);
    }
  };

  new MutationObserver(later).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["class"],
  });
  reduced.addEventListener("change", later);
  later();
})();
