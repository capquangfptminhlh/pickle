import assert from "node:assert/strict";
import { test } from "node:test";
import { access, readFile } from "node:fs/promises";
import vm from "node:vm";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const scopedPages = [
  "index.html",
  "about.html",
  "admin.html",
  "checkin.html",
  "court-board.html",
  "legacy-migrate.html",
  "login.html",
  "match.html",
  "offline.html",
  "player.html",
  "ranking.html",
  "referee.html",
  "submit-tournament.html",
  "tournament.html",
];

async function exists(path) {
  try {
    await access(new URL(`../${path}`, import.meta.url));
    return true;
  } catch {
    return false;
  }
}

test("every supported root and preview document loads shared motion in deterministic order", async () => {
  const pages = [...scopedPages];
  for (const page of scopedPages) {
    const preview = `preview/${page}`;
    if (await exists(preview)) pages.push(preview);
  }

  for (const page of pages) {
    const source = await read(page);
    const prefix = page.startsWith("preview/") ? "../" : "";
    const headEnd = source.indexOf("</head>");
    const css = `${prefix}assets/motion-system.css?v=2`;
    const vendor = `${prefix}assets/vendor/gsap-3.15.0.min.js`;
    const core = `${prefix}assets/motion-system.js?v=2`;
    const ui = `${prefix}assets/ui-motion.js?v=36`;
    const positions = [css, vendor, core, ui].map(asset => source.indexOf(asset));

    positions.forEach((position, index) => assert.ok(position >= 0, `${page} loads ${[css, vendor, core, ui][index]}`));
    assert.ok(positions[0] < headEnd, `${page} loads motion styles in head`);
    assert.ok(positions[1] < positions[2] && positions[2] < positions[3], `${page} loads vendor, core, then shared UI motion`);
    for (const asset of [css, vendor, core, ui]) {
      assert.equal(source.split(asset).length - 1, 1, `${page} loads ${asset} exactly once`);
    }

    const businessScripts = [...source.matchAll(/<script\s+[^>]*src=["']([^"']+)["'][^>]*>/g)]
      .filter(([, src]) => !src.includes("theme.js") && !src.includes("socket.io") && !src.includes("preview-guard.js") && ![vendor, core, ui].includes(src));
    for (const match of businessScripts) {
      assert.ok(positions[2] < match.index, `${page} loads motion core before ${match[1]}`);
    }
  }
});

test("root and preview service workers cache versioned and unversioned shared motion", async () => {
  for (const [path, prefix] of [["service-worker.js", "/"], ["preview/service-worker.js", "../"]]) {
    const source = await read(path);
    if(path==="service-worker.js")assert.match(source, /const VERSION="pickleup-v86-source";/, "root worker uses a source marker replaced with a content hash at build time");
    else assert.match(source, /full-motion-20261019/, "preview worker keeps its preview cache version");
    for (const asset of [
      "assets/vendor/gsap-3.15.0.min.js",
      "assets/motion-system.js",
      "assets/motion-system.css",
      "assets/ui-motion.js",
    ]) {
      const url = `${prefix}${asset}`;
      assert.ok(source.includes(`"${url}"`), `${path} caches ${url}`);
      const version = asset.endsWith("ui-motion.js") ? "36" : asset.includes("vendor/") ? null : "2";
      if (version) assert.ok(source.includes(`"${url}?v=${version}"`), `${path} caches ${url}?v=${version}`);
    }
  }
});

test("bracket motion loads once after the core and is cached for public and preview PWAs", async () => {
  for (const page of ["index.html", "admin.html", "tournament.html", "preview/index.html", "preview/admin.html", "preview/tournament.html"]) {
    const source = await read(page);
    const prefix = page.startsWith("preview/") ? "../" : "";
    const core = `${prefix}assets/motion-system.js?v=2`;
    const bracket = `${prefix}assets/bracket-motion.js?v=2`;
    assert.equal(source.split(bracket).length - 1, 1, `${page} loads bracket motion once`);
    assert.ok(source.indexOf(core) < source.indexOf(bracket), `${page} loads the motion core before bracket motion`);
  }
  for (const [path, prefix] of [["service-worker.js", "/"], ["preview/service-worker.js", "../"]]) {
    const source = await read(path);
    assert.ok(source.includes(`"${prefix}assets/bracket-motion.js?v=2"`), `${path} caches versioned bracket motion`);
    assert.ok(source.includes(`"${prefix}assets/bracket-motion.js"`), `${path} caches unversioned bracket motion`);
  }
});

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
