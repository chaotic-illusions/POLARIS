/*
 * POLARIS preview clock: loaded first, and only, into pages shown in Preview
 * (builder/preview.html). Never published.
 *
 * It puts the page on a clock the preview controls, so the opening can be
 * paused, stepped and played from any moment, with everything in step:
 *   - timers, animation frames, performance.now() and Date.now() run on page time
 *   - every animation (CSS animations and transitions, and element.animate())
 *     is held paused and set to page time each frame
 *   - sounds (Web Audio) are started, stopped and shaped on page time too: while
 *     the page is paused, running ahead or at another speed, they wait, and
 *     when it plays at 1x they start where they would be by now
 *   - Math.random() is seeded, so every run of the page matches
 * Seeking reloads the page and runs it ahead quickly to the moment asked for.
 *
 * Page time is ms since the page loaded; the preview's times are ms from the
 * opening's start ("lcars-flow:start" from lcars/flow.js), or from load on a
 * page without an opening. The preview window talks to it through
 * parent.PolarisPreview (seed, takeRequest(), attach(clock)).
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
  let end = 0;             // the opening's length, ms from its start
  let busy = false;        // running ahead to a moment

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
      let id = 0, t = null;
      for (const [k, v] of timers) if (v.due <= limit && (!t || v.due < t.due)) { id = k; t = v; }
      if (!t) return;
      if (!live) vt = Math.max(vt, t.due);
      if (t.every) t.due += t.every;
      else timers.delete(id);
      try { t.fn(...t.args); } catch (err) { report(err); }
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
  const finished = new WeakSet();
  const realAnimate = Element.prototype.animate;
  Element.prototype.animate = function (...args) {
    const a = realAnimate.apply(this, args);
    born.set(a, now());
    a.pause();
    a.currentTime = 0;
    return a;
  };
  /** Animations that just began (a class changed, say) begin now. */
  function noteAnimations() {
    for (const a of document.getAnimations()) if (!born.has(a)) born.set(a, now());
  }
  /** Every animation to page time: held paused at its place, or finished when it's done. */
  function setAnimations() {
    const t = now();
    for (const a of document.getAnimations()) {
      if (finished.has(a)) continue;
      if (!born.has(a)) born.set(a, t);
      const local = Math.max(0, (t - born.get(a)) * (a.playbackRate || 1));
      const endTime = a.effect?.getComputedTiming?.().endTime;
      if (Number.isFinite(endTime) && local >= endTime) {
        finished.add(a);
        try { a.finish(); } catch { /* cancelled meanwhile */ }
        continue;
      }
      if (a.playState !== "paused") a.pause();
      a.currentTime = local;
    }
  }

  /* ---- sound ---- */

  // Sounds play straight through while the page plays at 1x; otherwise their
  // calls wait in `queue`, timed in page time, until it does.
  const audible = () => live && rate === 1 && !busy;
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

  /** Which context each AudioParam belongs to (a param doesn't say), learnt as nodes hand them out. */
  const paramContext = new WeakMap();
  if (window.AudioNode) {
    for (const key of Object.getOwnPropertyNames(window)) {
      if (!/Node$/.test(key)) continue;
      const C = window[key];
      if (typeof C !== "function" || !(C.prototype instanceof AudioNode)) continue;
      for (const [prop, d] of Object.entries(Object.getOwnPropertyDescriptors(C.prototype))) {
        if (!d.get || !d.configurable) continue;
        Object.defineProperty(C.prototype, prop, {
          ...d,
          get() {
            const v = d.get.call(this);
            if (v instanceof AudioParam) paramContext.set(v, this.context);
            return v;
          },
        });
      }
    }
  }

  // While sound is held, a context's clock (currentTime) keeps page time too, so what the page
  // schedules from it lands where it means to: from the context time it had when sound was held.
  const BAC = window.BaseAudioContext || window.AudioContext;
  const clockDesc = BAC && Object.getOwnPropertyDescriptor(BAC.prototype, "currentTime");
  const realTime = (ctx) => clockDesc.get.call(ctx);
  const held = new Map(); // context -> { c: its time, v: the page time then }
  if (clockDesc?.get) {
    Object.defineProperty(BAC.prototype, "currentTime", {
      ...clockDesc,
      get() {
        if (audible()) return realTime(this);
        if (!held.has(this)) held.set(this, { c: realTime(this), v: now() });
        const h = held.get(this);
        return h.c + (now() - h.v) / 1000;
      },
    });
  }

  const queue = [];
  /** A context time, as page time (a time already past counts as now). */
  const pageTimeOf = (ctx, when) => now() + Math.max(0, (Number(when) || 0) - ctx.currentTime) * 1000;

  const realStarts = new Map();
  for (const C of [window.AudioScheduledSourceNode, window.AudioBufferSourceNode]) {
    const d = C && Object.getOwnPropertyDescriptor(C.prototype, "start");
    if (!d) continue;
    realStarts.set(C, d.value);
    C.prototype.start = function (when = 0, ...rest) {
      if (audible()) return d.value.call(this, when, ...rest);
      queue.push({ kind: "start", ctx: this.context, node: this, real: d.value, args: [when, ...rest], v: pageTimeOf(this.context, when) });
    };
  }
  const realStop = window.AudioScheduledSourceNode?.prototype.stop;
  if (realStop) window.AudioScheduledSourceNode.prototype.stop = function (when = 0) {
    if (audible()) return realStop.call(this, when);
    queue.push({ kind: "stop", ctx: this.context, node: this, v: pageTimeOf(this.context, when) });
  };
  const PARAM_TIME = { setValueAtTime: 1, linearRampToValueAtTime: 1, exponentialRampToValueAtTime: 1, setTargetAtTime: 1, setValueCurveAtTime: 1, cancelScheduledValues: 0, cancelAndHoldAtTime: 0 };
  if (window.AudioParam) {
    for (const [method, at] of Object.entries(PARAM_TIME)) {
      const real = AudioParam.prototype[method];
      if (!real) continue;
      AudioParam.prototype[method] = function (...args) {
        const ctx = paramContext.get(this);
        if (audible() || !ctx) return real.apply(this, args);
        queue.push({ kind: "param", ctx, param: this, real, args, at, v: pageTimeOf(ctx, args[at]) });
        return this;
      };
    }
  }

  /** Play what waited: each call at its page time, now mapped to its context's time; a sound already under way starts part way in. */
  function release() {
    held.clear();
    const ops = queue.splice(0);
    const anchors = new Map();
    const timeOf = (ctx, v) => {
      if (!anchors.has(ctx)) anchors.set(ctx, { c: realTime(ctx), v: now() });
      const a = anchors.get(ctx);
      return a.c + (v - a.v) / 1000;
    };
    // A sound whose stop is already past (a short tone, a cut-off press) isn't started at all.
    const skipped = new WeakSet();
    for (const op of ops) if (op.kind === "stop" && op.v <= now()) skipped.add(op.node);
    for (const op of ops) {
      const { ctx } = op;
      if (ctx.state === "closed") continue;
      try {
        if (op.kind === "start") {
          if (skipped.has(op.node)) continue;
          const args = [...op.args];
          let when = timeOf(ctx, op.v);
          const late = realTime(ctx) - when;
          if (late > 0) {
            when = 0;
            if (op.node instanceof AudioBufferSourceNode) {
              const offset = (Number(args[1]) || 0) + late;
              const length = op.node.buffer?.duration ?? Infinity;
              if (!op.node.loop && offset >= length) { skipped.add(op.node); continue; }
              args[1] = offset;
              if (args[2] != null) {
                args[2] -= late;
                if (args[2] <= 0) { skipped.add(op.node); continue; }
              }
            }
          }
          args[0] = when;
          op.real.apply(op.node, args);
          // The opening runs on: anything still sounding past it lengthens it.
          if (zero != null && op.node.buffer) end = Math.max(end, op.v - zero + op.node.buffer.duration * 1000);
        } else if (op.kind === "stop") {
          if (!skipped.has(op.node)) realStop.call(op.node, Math.max(0, timeOf(ctx, op.v)));
        } else {
          const args = [...op.args];
          args[op.at] = Math.max(0, timeOf(ctx, op.v));
          op.real.apply(op.param, args);
        }
      } catch { /* a node already stopped, or never started */ }
    }
  }

  const suspendAll = () => Promise.all([...contexts].map((c) => (c.state === "running" ? realSuspend.call(c).catch(() => {}) : null)));
  const resumeAll = () => Promise.race([
    Promise.all([...contexts].map((c) => (c.state === "suspended" ? realResume.call(c).catch(() => {}) : null))),
    new Promise((r) => realSetTimeout(r, 300)),
  ]);

  /* ---- driving it ---- */

  const channel = new MessageChannel();
  const nextTask = () => new Promise((r) => { channel.port1.onmessage = () => r(); channel.port2.postMessage(0); });

  /** Run page time ahead to `target`, quickly (sounds wait), a frame at a time. */
  async function runTo(target) {
    hold(false);
    busy = true;
    while (vt < target) {
      const step = Math.min(target, vt + 1000 / 60);
      runDue(step);
      vt = step;
      runFrames();
      setAnimations();
      await nextTask();
    }
    busy = false;
  }

  function pause() {
    if (!live) return;
    hold(false);
    setAnimations();
    suspendAll();
  }
  async function play(r = rate) {
    if (live || busy) return;
    if (r === 1 && contexts.size) await resumeAll();
    hold(true, r);
    if (r === 1) release();
  }
  async function step(ms) {
    if (busy) return;
    pause();
    await runTo(vt + ms);
    setAnimations();
  }

  // Real time drives page time: timers often, animations and frames every frame.
  const pump = () => { if (live && !busy) runDue(now()); realSetTimeout(pump, 4); };
  const frame = () => {
    if (live && !busy) {
      runDue(now());
      runFrames();
    }
    if (!busy) setAnimations();
    realRAF(frame);
  };
  pump();
  realRAF(frame);

  /** The opening starts: do what the preview asked of this load (play from the start, or go to a moment). */
  function started() {
    zero = now();
    end = 0;
    reseed();
    const ask = host.takeRequest?.() || { t: 0, play: true, rate: 1 };
    if (ask.t <= 0 && ask.play && (ask.rate ?? 1) === 1) return; // as a page plays anyway
    hold(false); // sounds wait from here: this very call is before the opening's sounds start
    busy = true;
    realSetTimeout(async () => {
      busy = false;
      await runTo(zero + Math.max(0, ask.t));
      if (ask.play) await play(ask.rate ?? 1);
      else {
        rate = ask.rate ?? 1;
        suspendAll();
      }
    }, 0);
  }
  document.addEventListener("lcars-flow:start", started, true);
  document.addEventListener("lcars-flow:timeline", (e) => { end = Math.max(end, Number(e.detail?.end) || 0); }, true);
  // A page without an opening keeps time from when it loads.
  addEventListener("DOMContentLoaded", () => { if (!document.querySelector("[data-flow]")) started(); });

  // Space, Home and the arrows reach the preview's controls when nothing on the page has focus.
  addEventListener("keydown", (e) => {
    if (e.target !== document.body && e.target !== document.documentElement) return;
    if (!/^( |Home|ArrowLeft|ArrowRight|l|L)$/.test(e.key)) return;
    e.preventDefault();
    host.key?.(e.key, e.shiftKey);
  });

  host.attach({
    /** Where the opening is: t in ms from its start (null before it starts). */
    state: () => ({ t: zero == null ? null : Math.max(0, now() - zero), playing: live && !busy, busy, rate, end }),
    play: () => play(rate),
    pause,
    step,
  });
})();
