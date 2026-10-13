import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

async function loadMotion({ gsap, reduced = false, memory = 8, width = 1440 } = {}) {
  const listeners = new Map();
  const removed = [];
  const document = {
    hidden: false,
    addEventListener(type, listener) {
      listeners.set(`document:${type}`, listener);
    },
    querySelectorAll(selector) {
      return selector === ".motion-celebration"
        ? [{ remove: () => removed.push(selector) }]
        : [];
    },
  };
  const window = {
    document,
    gsap,
    innerWidth: width,
    navigator: { deviceMemory: memory },
    matchMedia: () => ({ matches: reduced }),
    addEventListener(type, listener) {
      listeners.set(`window:${type}`, listener);
    },
  };
  window.window = window;
  vm.runInNewContext(await read("assets/motion-system.js"), {
    document,
    Element: class Element {},
    NodeList: class NodeList {},
    HTMLCollection: class HTMLCollection {},
    window,
  });
  return { api: window.PickleMotion, document, listeners, removed };
}

test("GSAP is exact-pinned and vendored locally", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(pkg.dependencies.gsap, "3.15.0");
  const vendor = await read("assets/vendor/gsap-3.15.0.min.js");
  assert.match(vendor, /GreenSock|GSAP/);
  assert.ok(vendor.length > 50000, "vendor file contains the production runtime");
  assert.doesNotMatch(vendor, /[ \t]+$/m);
  assert.match(vendor, /[^\r\n]\r?\n$/, "vendor file ends with exactly one newline");
});

test("semantic motion runtime exposes the shared resilient API", async () => {
  const source = await read("assets/motion-system.js");
  for (const operation of [
    "keyed",
    "entrance",
    "press",
    "flip",
    "count",
    "serviceChange",
    "scoreChange",
    "setWin",
    "matchWin",
    "error",
    "dispose",
  ]) {
    assert.match(source, new RegExp(`\\b${operation}\\b`), `${operation} is available`);
  }
  assert.match(source, /prefers-reduced-motion:\s*reduce/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /window\.PickleMotion/);
});

test("motion styles keep overlays inert and reduced motion content visible", async () => {
  const source = await read("assets/motion-system.css");
  assert.match(source, /\.motion-celebration/);
  assert.match(source, /pointer-events:\s*none/);
  assert.match(source, /\.motion-ripple/);
  assert.match(source, /\.motion-glow/);
  assert.match(source, /\.motion-route-leaving/);
  assert.match(source, /\[data-motion-state\]/);
  assert.match(source, /prefers-reduced-motion:\s*reduce/);
  assert.match(source, /scroll-behavior:\s*auto/);
});

test("motion quality follows accessibility and device capability", async () => {
  assert.equal((await loadMotion({ reduced: true })).api.quality(), "reduced");
  assert.equal((await loadMotion({ memory: 4 })).api.quality(), "compact");
  assert.equal((await loadMotion({ width: 480 })).api.quality(), "compact");
  assert.equal((await loadMotion()).api.quality(), "full");
});

test("reduced motion preference is exposed as a callable operation", async () => {
  const normal = (await loadMotion()).api;
  const reduced = (await loadMotion({ reduced: true })).api;
  assert.equal(typeof normal.reduced, "function");
  assert.equal(normal.reduced(), false);
  assert.equal(reduced.reduced(), true);
});

test("count preserves fractional values to two decimals during motion", async () => {
  const intermediate = [];
  const element = { textContent: "4" };
  const gsap = {
    timeline(options) {
      return {
        to(state, animation) {
          state.value = 4.25;
          animation.onUpdate();
          intermediate.push(element.textContent);
          options.onComplete();
          return this;
        },
        kill() {
          options.onInterrupt?.();
        },
      };
    },
    globalTimeline: { pause() {}, resume() {} },
  };
  const { api } = await loadMotion({ gsap });
  api.count(element, 4, 4.5);
  assert.deepEqual(intermediate, ["4.25"]);
  assert.equal(element.textContent, "4.5");
});

test("keyed motion interrupts once and completes once", async () => {
  const created = [];
  const gsap = {
    timeline(options) {
      const timeline = {
        options,
        killCount: 0,
        kill() {
          this.killCount += 1;
          options.onInterrupt?.();
        },
      };
      created.push(timeline);
      return timeline;
    },
    globalTimeline: { pause() {}, resume() {} },
  };
  const { api } = await loadMotion({ gsap });
  let firstFinished = 0;
  let secondFinished = 0;
  api.keyed("score", () => {}, () => firstFinished++);
  api.keyed("score", () => {}, () => secondFinished++);
  assert.equal(created[0].killCount, 1);
  assert.equal(firstFinished, 1);
  created[0].options.onInterrupt();
  assert.equal(firstFinished, 1, "interrupt finalizer is idempotent");
  created[1].options.onComplete();
  created[1].options.onInterrupt();
  assert.equal(secondFinished, 1, "completion and interruption share one finalizer");
});

test("missing GSAP remains safe and restores entrance final state", async () => {
  const { api } = await loadMotion();
  const target = { style: { opacity: "0", transform: "translateY(20px)", filter: "blur(4px)", visibility: "hidden" } };
  assert.equal(api.ready, false);
  assert.equal(api.entrance(target), null);
  assert.equal(target.style.opacity, "1");
  assert.equal(target.style.transform, "none");
  assert.equal(target.style.filter, "none");
  assert.equal(target.style.visibility, "visible");
  for (const operation of ["press", "flip", "count", "scoreChange", "serviceChange", "setWin", "matchWin", "error", "celebrate"]) {
    assert.doesNotThrow(() => api[operation](target));
  }
});

test("visibility and page lifecycle control and dispose shared motion", async () => {
  let paused = 0;
  let resumed = 0;
  let killed = 0;
  const gsap = {
    timeline(options) {
      return { kill() { killed += 1; options.onInterrupt?.(); } };
    },
    globalTimeline: { pause() { paused += 1; }, resume() { resumed += 1; } },
  };
  const { api, document, listeners, removed } = await loadMotion({ gsap });
  api.keyed("active", () => {});
  document.hidden = true;
  listeners.get("document:visibilitychange")();
  document.hidden = false;
  listeners.get("document:visibilitychange")();
  listeners.get("window:pagehide")();
  assert.equal(paused, 1);
  assert.equal(resumed, 1);
  assert.equal(killed, 1);
  assert.deepEqual(removed, [".motion-celebration"]);
});
