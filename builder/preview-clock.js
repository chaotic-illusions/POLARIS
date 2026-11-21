/*
 * POLARIS preview clock: loaded first, and only, into pages shown in Preview
 * (builder/preview.html). Never published.
 *
 * It puts the page on a clock the preview controls, so the opening can be
 * played, paused, and moved to any moment, forwards or back, at any speed,
 * smoothly:
 *   - timers, animation frames, performance.now() and Date.now() run on page time
 *   - every animation (CSS animations and transitions, and element.animate())
 *     is held paused and set to page time each frame, so it shows as it is at
 *     any moment, earlier ones included
 *   - lcars/flow.js hands over its opening (LcarsPreviewClock.opening): a way
 *     to draw it as it is at any moment, and its sound, which starts from any
 *     moment; the clock draws it each frame and plays its sound at 1x
 *   - any other sound only starts while the page plays at 1x
 *   - Math.random() is seeded, so every run of the page matches (Shuffle
 *     loads the page again with another seed)
 *
 * Page time is ms since the page loaded; the preview's times are ms from the
 * opening's start ("lcars-flow:start" from lcars/flow.js), or from load on a
 * page without an opening. The preview window talks to it through
 * parent.PolarisPreview (seed, takeRequest(), attach(clock), key()).
 */
(() => {
  "use strict";
  let host = null;
  try { host = window.parent !== window ? window.parent.PolarisPreview : null; } catch { /* another origin */ }
  if (!host) return;

  const realSetTimeout = window.setTimeout.bind(window);
  const realRAF = window.requestAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  const PERF0 = realNow(), DATE0 = Date.now();

  /* ---- page time ---- */

  let vt = 0;              // page time when last set
  let live = true;         // moving with real time (at rate)
  let rate = 1;
  let since = PERF0;       // real time when vt was last set while live
  const now = () => (live ? vt + (realNow() - since) * rate : vt);
  /** Fix page time where it is now, and go on (or not) from here. */
  const hold = (moving, r = rate) => {
    vt = now();
    since = realNow();
    live = moving;
    rate = r;
  };

  let zero = null;         // page time the opening started
  let opening = null;      // from lcars/flow.js: { render(t), sound: { play(from), stop() }, timeline }
  const t = () => (zero == null ? null : Math.max(0, now() - zero));
  const audible = () => live && rate === 1;

  /* ---- seeded randomness ---- */

  let seed = 0;
  const reseed = () => { seed = (Number(host.seed) >>> 0) || 1; };
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  reseed();

  /* ---- timers and frames ---- */

  let nextId = 1;
  const timers = new Map(); // id -> { due, fn, args, every }
  const addTimer = (fn, ms, args, repeat) => {
    const id = nextId++;
    const d = Math.max(0, Number(ms) || 0);
    timers.set(id, { due: now() + d, fn, args, every: repeat ? Math.max(4, d) : 0 });
    return id;
  };
  window.setTimeout = (fn, ms, ...args) => (typeof fn === "function" ? addTimer(fn, ms, args, false) : 0);
  window.setInterval = (fn, ms, ...args) => (typeof fn === "function" ? addTimer(fn, ms, args, true) : 0);
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };

  const frames = new Map();
  window.requestAnimationFrame = (fn) => { const id = nextId++; frames.set(id, fn); return id; };
  window.cancelAnimationFrame = (id) => { frames.delete(id); };
  performance.now = () => PERF0 + now();
  Date.now = () => DATE0 + Math.round(now());

  const report = (err) => { try { window.reportError(err); } catch { console.error(err); } };

  /** Run the timers due by page time `limit`, in order (and any they set that fall due by then). */
  function runDue(limit) {
    for (let guard = 0; guard < 5000; guard++) {
      let id = 0, next = null;
      for (const [k, v] of timers) if (v.due <= limit && (!next || v.due < next.due)) { id = k; next = v; }
      if (!next) return;
      if (!live) vt = Math.max(vt, next.due);
      if (next.every) next.due += next.every;
      else timers.delete(id);
      try { next.fn(...next.args); } catch (err) { report(err); }
      noteAnimations();
    }
  }
  function runFrames() {
    if (!frames.size) return;
    const list = [...frames.values()];
    frames.clear();
    const stamp = PERF0 + now();
    for (const fn of list) try { fn(stamp); } catch (err) { report(err); }
    noteAnimations();
  }

  /* ---- animations ---- */

  const born = new WeakMap(); // animation -> page time it began
  const known = new Set();    // every animation in play, finished ones too (so going back shows them again)
  const ended = new WeakSet(); // finished once (its finished promise kept)
  const realAnimate = Element.prototype.animate;
  const adopt = (a) => {
    if (born.has(a)) return;
    born.set(a, now());
    known.add(a);
    a.pause();
  };
  Element.prototype.animate = function (...args) {
    const a = realAnimate.apply(this, args);
    adopt(a);
    a.currentTime = 0;
    return a;
  };
  /** Animations that just began (a class changed, say) begin now. */
  function noteAnimations() {
    for (const a of document.getAnimations()) adopt(a);
  }
  /** Every animation to page time: held paused at its place (finished once, the first time it gets to its end). */
  function setAnimations() {
    noteAnimations();
    const at = now();
    for (const a of known) {
      if (a.playState === "idle") { known.delete(a); continue; } // cancelled, or its CSS gone
      const local = Math.max(0, (at - born.get(a)) * (a.playbackRate || 1));
      const endTime = a.effect?.getComputedTiming?.().endTime;
      if (Number.isFinite(endTime) && local >= endTime && !ended.has(a)) {
        ended.add(a);
        try { a.finish(); } catch { /* cancelled meanwhile */ }
      }
      if (a.playState !== "paused") a.pause();
      a.currentTime = local;
    }
  }

  /* ---- sound ---- */

  // Other sounds (a button's beep, say) only start while the page plays at 1x.
  const contexts = new Set();
  for (const name of ["AudioContext", "webkitAudioContext"]) {
    const C = window[name];
    if (C) window[name] = new Proxy(C, { construct(T, args, nt) { const c = Reflect.construct(T, args, nt); contexts.add(c); return c; } });
  }
  const realResume = window.AudioContext?.prototype.resume;
  const realSuspend = window.AudioContext?.prototype.suspend;
  if (realResume) window.AudioContext.prototype.resume = function () {
    // While held, the page can't start its sound (a click would otherwise set it going out of step).
    return audible() ? realResume.call(this) : Promise.resolve();
  };
  for (const C of [window.AudioScheduledSourceNode, window.AudioBufferSourceNode]) {
    const d = C && Object.getOwnPropertyDescriptor(C.prototype, "start");
    if (d) C.prototype.start = function (...args) { if (audible()) return d.value.apply(this, args); };
  }
  const suspendAll = () => { for (const c of contexts) if (c.state === "running") realSuspend.call(c).catch(() => {}); };
  const resumeAll = () => Promise.race([
    Promise.all([...contexts].map((c) => (c.state === "suspended" ? realResume.call(c).catch(() => {}) : null))),
    new Promise((r) => realSetTimeout(r, 300)),
  ]);

  /* ---- the controls ---- */

  /** Go to t ms from the opening's start (playing on, or not, as before). */
  function seek(ms) {
    if (zero == null) return;
    const target = zero + Math.max(0, ms);
    const sounding = audible();
    if (sounding) opening?.sound.stop();
    const wasLive = live;
    hold(false);
    if (target > vt) runDue(target); // timers that fall due on the way
    vt = target;
    live = wasLive;
    since = realNow();
    runFrames();
    opening?.render(ms);
    setAnimations();
    if (sounding) opening?.sound.play(ms);
  }
  function pause() {
    if (!live) return;
    if (audible()) opening?.sound.stop();
    hold(false);
    setAnimations();
    suspendAll();
  }
  async function play() {
    if (live) return;
    if (rate === 1) await resumeAll();
    if (live) return;
    hold(true);
    if (audible()) opening?.sound.play(t());
  }
  async function setRate(r) {
    if (r === rate || !(r > 0)) return;
    const wasLive = live;
    if (audible()) opening?.sound.stop();
    hold(wasLive, r);
    if (audible()) {
      await resumeAll();
      if (audible()) opening?.sound.play(t());
    }
  }
  function step(ms) {
    pause();
    seek((t() ?? 0) + ms);
  }

  // Real time drives page time: timers often, the opening, animations and frames every frame.
  const pump = () => { if (live) runDue(now()); realSetTimeout(pump, 4); };
  const frame = () => {
    if (live) {
      runDue(now());
      runFrames();
      if (opening && zero != null) opening.render(t());
    }
    setAnimations();
    realRAF(frame);
  };
  pump();
  realRAF(frame);

  /** The opening starts: play it from the start, or do what the preview asked of this load (after a Shuffle). */
  function started() {
    zero = now();
    reseed();
    const ask = host.takeRequest?.();
    if (!ask) return;
    rate = ask.rate > 0 ? ask.rate : 1;
    hold(false); // held from here, so the opening's sound doesn't start
    realSetTimeout(() => {
      seek(ask.t || 0);
      if (ask.play) play();
    }, 0);
  }
  document.addEventListener("lcars-flow:start", started, true);
  // A page without an opening keeps time from when it loads.
  addEventListener("DOMContentLoaded", () => { if (!document.querySelector("[data-flow]")) started(); });

  window.LcarsPreviewClock = {
    /** lcars/flow.js hands over its opening as it starts. */
    opening(o) {
      opening = o;
      o.render(t() ?? 0);
      if (audible()) o.sound.play(t() ?? 0);
    },
  };

  // Space, Home, L, T and the arrows reach the preview's controls when nothing on the page has focus.
  addEventListener("keydown", (e) => {
    if (e.target !== document.body && e.target !== document.documentElement) return;
    if (!/^( |Home|ArrowLeft|ArrowRight|l|L|t|T)$/.test(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    host.key?.(e.key, e.shiftKey);
  });

  host.attach({
    /** Where the opening is: t in ms from its start (null before it starts), and its timeline from lcars/flow.js. */
    state: () => ({ t: t(), playing: live, rate, end: opening?.timeline.end ?? 0, timeline: opening?.timeline ?? null }),
    play, pause, seek, step, setRate,
  });
})();
