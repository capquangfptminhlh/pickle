# Full-site Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a highly animated, sports-broadcast motion system across every Pickleup surface without delaying controls or changing confirmed tournament state.

**Architecture:** Ship GSAP 3.15.0 as a pinned local asset, expose one resilient `window.PickleMotion` semantic API, and let each existing renderer trigger motion only after confirmed DOM state changes. Shared motion stays in focused core/style files; rankings, brackets, live boards, referee scoring, and admin dialogs retain ownership of their state transitions and call the shared API.

**Tech Stack:** Vanilla JavaScript, GSAP 3.15.0, CSS, Canvas 2D, Socket.IO render hooks, Node test runner, Playwright, service-worker caches.

**Design:** `docs/superpowers/specs/2026-10-13-full-site-animation-design.md`

**References:** [GSAP npm package](https://www.npmjs.com/package/gsap), [GSAP matchMedia documentation](https://gsap.com/docs/v3/GSAP/gsap.matchMedia%28%29/)

---

## File map

- `assets/vendor/gsap-3.15.0.min.js`: committed browser runtime copied byte-for-byte from the pinned package.
- `scripts/sync-gsap-vendor.mjs`: copies and verifies the pinned distribution file so upgrades are explicit.
- `assets/motion-system.js`: capability detection, keyed timeline lifecycle, FLIP support, numeric transitions, celebration canvas, cleanup, and no-op fallback.
- `assets/motion-system.css`: shared overlay, ripple, glow, transition-state, and reduced-motion styles.
- `assets/ui-motion.js`: page decoration and shared interaction orchestration built on `PickleMotion`.
- `assets/ranking.js`: ranking snapshots, FLIP reorder, numeric rating transition, and leader emphasis.
- `assets/bracket-ui.js`: stable bracket identity metadata required by downstream advancement/reset motion.
- `assets/public.js`, `assets/tournament.js`, `assets/match-live.js`, `assets/court-board.js`, `assets/checkin.js`: confirmed-state motion hooks for public and tournament-day screens.
- `assets/referee-courtside.js`, `assets/referee-arena.css`: scoring, server light trail, set completion, winner, Undo, and reset effects.
- `assets/admin-app.js`, `assets/admin-crud.js`: dialog, toast, validation, save, and page-render effects.
- root and `preview/` HTML files: deterministic script/style loading order.
- `service-worker.js`, `preview/service-worker.js`: cache the new runtime and bump asset versions once.
- `scripts/registry-motion-runtime.test.mjs`: static contract, dependency, HTML ordering, and cache coverage.
- `scripts/registry-motion-ui.test.mjs`: shared behavior, fallback, reduced-motion, cleanup, and interaction safety.
- existing surface browser suites: assertions for the live, bracket, referee, check-in, ranking, and admin final states.

### Task 1: Pin and vendor GSAP

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/sync-gsap-vendor.mjs`
- Create: `assets/vendor/gsap-3.15.0.min.js`
- Create: `scripts/registry-motion-runtime.test.mjs`

- [ ] **Step 1: Write the failing dependency and vendor test**

Create `scripts/registry-motion-runtime.test.mjs` with the initial contract:

```js
import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("GSAP is exact-pinned and vendored locally",async()=>{
  const pkg=JSON.parse(await read("package.json"));
  assert.equal(pkg.dependencies.gsap,"3.15.0");
  const vendor=await read("assets/vendor/gsap-3.15.0.min.js");
  assert.match(vendor,/GreenSock|GSAP/);
  assert.ok(vendor.length>50000,"vendor file contains the production runtime");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test scripts/registry-motion-runtime.test.mjs`  
Expected: FAIL because `dependencies.gsap` and the local vendor asset do not exist.

- [ ] **Step 3: Pin GSAP and add a deterministic vendor sync script**

Run: `npm install --save-exact gsap@3.15.0`

Create `scripts/sync-gsap-vendor.mjs`:

```js
import {copyFile,mkdir,readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const source=resolve(root,"node_modules/gsap/dist/gsap.min.js");
const target=resolve(root,"assets/vendor/gsap-3.15.0.min.js");
await mkdir(dirname(target),{recursive:true});
await copyFile(source,target);
const bytes=await readFile(target);
console.log(`gsap-3.15.0 ${createHash("sha256").update(bytes).digest("hex")}`);
```

Run: `node scripts/sync-gsap-vendor.mjs`

Add `"vendor:gsap": "node scripts/sync-gsap-vendor.mjs"` to `package.json` scripts. Do not add a `postinstall`; CI intentionally uses `npm ci --ignore-scripts` and the committed browser asset must remain sufficient.

- [ ] **Step 4: Run the test and dependency audit**

Run: `node --test scripts/registry-motion-runtime.test.mjs`  
Expected: PASS.

Run: `npm audit --audit-level=high`  
Expected: no high or critical vulnerabilities.

- [ ] **Step 5: Commit the pinned runtime**

```powershell
git add package.json package-lock.json scripts/sync-gsap-vendor.mjs assets/vendor/gsap-3.15.0.min.js scripts/registry-motion-runtime.test.mjs
git commit -m "build: vendor pinned GSAP runtime"
```

### Task 2: Build the resilient semantic motion core

**Files:**
- Create: `assets/motion-system.js`
- Create: `assets/motion-system.css`
- Modify: `scripts/registry-motion-runtime.test.mjs`
- Modify: `scripts/registry-motion-ui.test.mjs`

- [ ] **Step 1: Extend the runtime test with the public API contract**

Add to `scripts/registry-motion-runtime.test.mjs`:

```js
test("motion core exposes semantic operations and no-op fallback",async()=>{
  const source=await read("assets/motion-system.js");
  for(const name of ["keyed","entrance","press","flip","count","serviceChange","scoreChange","setWin","matchWin","error","dispose"]){
    assert.match(source,new RegExp(`\\b${name}\\b`),`exports ${name}`);
  }
  assert.match(source,/prefers-reduced-motion: reduce/);
  assert.match(source,/visibilitychange/);
  assert.match(source,/window\.PickleMotion/);
});
```

Add a Playwright case to `scripts/registry-motion-ui.test.mjs` that blocks `**/gsap-3.15.0.min.js`, opens `/`, and asserts `window.PickleMotion.ready === false`, body opacity is `1`, and the primary navigation button remains clickable.

- [ ] **Step 2: Run both tests and verify they fail**

Run: `node --test scripts/registry-motion-runtime.test.mjs scripts/registry-motion-ui.test.mjs`  
Expected: FAIL because the semantic runtime and fallback do not exist.

- [ ] **Step 3: Implement the motion core API**

Create `assets/motion-system.js` around this complete interface and state model:

```js
(()=>{
  const gsap=window.gsap;
  const media=matchMedia("(prefers-reduced-motion: reduce)");
  const timelines=new Map();
  const quality=()=>media.matches?"reduced":((navigator.deviceMemory||8)<=4||innerWidth<=480?"compact":"full");
  const kill=key=>{timelines.get(key)?.kill?.();timelines.delete(key)};
  const keyed=(key,build,finish)=>{
    kill(key);
    if(!gsap||media.matches){finish?.();return null}
    const timeline=build(gsap.timeline({onComplete:()=>{timelines.delete(key);finish?.()},onInterrupt:finish}));
    timelines.set(key,timeline);
    return timeline;
  };
  const api={
    ready:!!gsap,reduced:()=>media.matches,quality,keyed,kill,
    entrance:(targets,options={})=>keyed(options.key||"entrance",tl=>tl.fromTo(targets,{autoAlpha:0,y:options.y??24,scale:options.scale??.98},{autoAlpha:1,y:0,scale:1,duration:options.duration??.55,stagger:options.stagger??.06,ease:"back.out(1.45)",clearProps:"transform,opacity,visibility"})),
    press:target=>gsap&&!media.matches&&gsap.fromTo(target,{scale:.94},{scale:1,duration:.32,ease:"elastic.out(1,.45)",overwrite:true,clearProps:"transform"}),
    flip:(before,elements,key="flip")=>keyed(key,tl=>{for(const el of elements){const prior=before.get(el.dataset.motionKey);if(!prior)continue;const next=el.getBoundingClientRect();tl.fromTo(el,{x:prior.left-next.left,y:prior.top-next.top},{x:0,y:0,duration:.55,ease:"power3.inOut",clearProps:"transform"},0)}return tl}),
    count:(element,from,to)=>keyed(`count:${element.dataset.motionKey||element.id}`,tl=>{const value={n:Number(from)||0};return tl.to(value,{n:Number(to)||0,duration:.55,ease:"power2.out",onUpdate:()=>{element.textContent=(Math.round(value.n*100)/100).toString()}})}),
    scoreChange:(element,delta)=>keyed(`score:${element.id}`,tl=>tl.fromTo(element,{y:delta>0?14:-14,scale:.82,filter:"brightness(1.8)"},{y:0,scale:1,duration:.48,ease:"back.out(2)",filter:"brightness(1)",clearProps:"transform,filter"})),
    serviceChange:(athlete,banner,color)=>keyed("service-change",tl=>tl.fromTo(athlete,{scale:.9,boxShadow:`0 0 0 0 ${color}`},{scale:1,boxShadow:`0 0 0 12px transparent`,duration:.55,ease:"back.out(2)",clearProps:"transform,boxShadow"}).fromTo(banner,{x:-12,filter:`drop-shadow(0 0 12px ${color})`},{x:0,filter:"none",duration:.4,clearProps:"transform,filter"},.08)),
    setWin:(target,color)=>api.celebrate({target,color,kind:"set"}),
    matchWin:(target,color)=>api.celebrate({target,color,kind:"match"}),
    error:target=>keyed(`error:${target.id||target.name||"field"}`,tl=>tl.to(target,{x:-7,duration:.07,repeat:5,yoyo:true,ease:"none",clearProps:"transform"})),
    celebrate:()=>null,
    dispose:()=>{for(const key of [...timelines.keys()])kill(key);document.querySelector(".motion-celebration")?.remove()}
  };
  document.addEventListener("visibilitychange",()=>{if(document.hidden)gsap?.globalTimeline.pause();else gsap?.globalTimeline.resume()});
  addEventListener("pagehide",api.dispose);
  window.PickleMotion=api;
})();
```

Complete `celebrate` in Task 8. Until then it deliberately returns `null`, so state-changing features can integrate without waiting for particles.

Create `assets/motion-system.css` with the fixed `.motion-celebration` overlay, `.motion-ripple`, `.motion-glow`, `.motion-route-leaving`, and `[data-motion-state]` styles. Add a final `@media (prefers-reduced-motion: reduce)` block that removes transforms, animation, transition, filters, and scroll smoothing from those classes.

- [ ] **Step 4: Verify core and fallback behavior**

Run: `node --check assets/motion-system.js`  
Expected: exit 0.

Run: `node --test scripts/registry-motion-runtime.test.mjs scripts/registry-motion-ui.test.mjs`  
Expected: PASS for static API and missing-library fallback cases.

- [ ] **Step 5: Commit the core**

```powershell
git add assets/motion-system.js assets/motion-system.css scripts/registry-motion-runtime.test.mjs scripts/registry-motion-ui.test.mjs
git commit -m "feat: add resilient semantic motion core"
```

### Task 3: Load motion consistently and upgrade shared interactions

**Files:**
- Modify: root HTML files: `index.html`, `about.html`, `admin.html`, `checkin.html`, `court-board.html`, `legacy-migrate.html`, `login.html`, `match.html`, `offline.html`, `player.html`, `ranking.html`, `referee.html`, `submit-tournament.html`, `tournament.html`
- Modify: matching HTML files under `preview/`
- Modify: `assets/ui-motion.js`
- Modify: `assets/pickleup-ui.css`
- Modify: `service-worker.js`
- Modify: `preview/service-worker.js`
- Modify: `scripts/registry-motion-runtime.test.mjs`
- Modify: `scripts/registry-motion-ui.test.mjs`

- [ ] **Step 1: Add failing asset-order and interaction assertions**

Extend the static test to enumerate every root and preview HTML document and assert this order where motion is supported:

```html
<link rel="stylesheet" href="assets/motion-system.css?v=1">
<script src="assets/vendor/gsap-3.15.0.min.js"></script>
<script src="assets/motion-system.js?v=1"></script>
<script src="assets/ui-motion.js?v=35"></script>
```

Use `../assets/` in preview pages. Assert both service workers cache the versioned and unversioned local vendor/core/style files.

Extend the browser suite to check that clicking a normal button adds visual press feedback without changing its `innerHTML`, route exit finishes within 220 ms, a dynamically inserted card receives entrance motion, and reduced-motion mode leaves computed transforms at `none`.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test scripts/registry-motion-runtime.test.mjs scripts/registry-motion-ui.test.mjs`  
Expected: FAIL on missing page references and shared GSAP interactions.

- [ ] **Step 3: Add deterministic page loading and cache entries**

Add the stylesheet to each page head. Add GSAP and `motion-system.js` before `ui-motion.js` or the page-specific application script that calls `PickleMotion`. Add `ui-motion.js` to operational pages that do not currently load it. Keep business scripts in their current relative order.

Update service-worker versions to a single release name ending in `full-motion-20261013`; add all versioned and unversioned new assets. Do not bump the cache a second time in later tasks; later asset version changes are collected in Task 9.

- [ ] **Step 4: Replace shared CSS-only reveals with semantic GSAP calls**

In `assets/ui-motion.js`, keep table labels, dock, navigation, and PWA behavior intact. Replace the reveal observer callback with:

```js
const reveal=entry=>{
  if(!entry.isIntersecting)return;
  const siblings=[...entry.target.parentElement.children].filter(el=>el.matches("[data-motion-ready],.reveal-target"));
  window.PickleMotion?.entrance(siblings,{key:`reveal:${entry.target.parentElement.id||entry.target.className}`,stagger:.055,y:28});
  siblings.forEach(el=>observer.unobserve(el));
};
```

Use event delegation for pointer-down press feedback and create a non-layout `.motion-ripple` positioned from pointer coordinates. Use `MutationObserver` to decorate newly committed cards, rows, dialogs, and toasts once. Implement route exit with `PickleMotion.keyed("route", ...)` and a hard 200 ms navigation timer; skip it for hash links, downloads, external links, modified clicks, View Transition API handling, and reduced motion.

- [ ] **Step 5: Run shared UI coverage**

Run: `node --test scripts/registry-motion-runtime.test.mjs scripts/registry-motion-ui.test.mjs scripts/registry-site-design-ui.mjs`  
Expected: PASS in normal and reduced motion, at all existing responsive widths.

- [ ] **Step 6: Commit shared loading and interactions**

```powershell
git add assets/ui-motion.js assets/motion-system.css assets/pickleup-ui.css service-worker.js preview/service-worker.js *.html preview/*.html scripts/registry-motion-runtime.test.mjs scripts/registry-motion-ui.test.mjs
git commit -m "feat: animate shared site interactions"
```

### Task 4: Animate public cards, rankings, and numeric metrics

**Files:**
- Modify: `assets/public.js`
- Modify: `preview/preview-public.js`
- Modify: `assets/tournament.js`
- Modify: `assets/player.js`
- Modify: `assets/ranking.js`
- Modify: `assets/public-refresh.css`
- Modify: `scripts/registry-motion-ui.test.mjs`
- Modify: `scripts/registry-site-design-ui.mjs`

- [ ] **Step 1: Write failing public-state animation tests**

Add browser cases that capture `[data-motion-key]` ranking row positions before a rating reorder, trigger the confirmed reload, and assert the final order and that `PickleMotion.flip` was called once. Add cases that assert rating text reaches the confirmed value, a new leader has one `data-motion-state="leader"` transition, and initial load does not mark the leader as newly promoted.

For cards, assert dynamic public renders add stable `data-motion-key` values and no card remains at opacity `0` after 1 second.

- [ ] **Step 2: Run the public suites and verify they fail**

Run: `node --test scripts/registry-motion-ui.test.mjs scripts/registry-site-design-ui.mjs`  
Expected: FAIL on missing stable keys, FLIP call, and confirmed numeric transition.

- [ ] **Step 3: Add snapshot helpers and confirmed render hooks**

In `assets/ranking.js`, add:

```js
let renderedRatings=new Map(),hasRendered=false;
const rowKey=item=>`${mode}:${item.id||item.name}`;
const snapshot=()=>new Map([...document.querySelectorAll("#rankingRows [data-motion-key]")].map(el=>[el.dataset.motionKey,el.getBoundingClientRect()]));
```

Emit `data-motion-key` on every ranking and podium entry. At the start of `render`, capture `before=snapshot()`. After assigning HTML, call `PickleMotion.flip(before, rows, "ranking-order")`, then `PickleMotion.count` only when `hasRendered` and a rating changed. Apply the leader sweep only when the previous first key differs from the new first key. Update `renderedRatings` and `hasRendered` last.

Add stable motion keys to public/tournament/player cards using their real entity IDs. After confirmed renderer commits, call `PickleMotion.entrance` for only newly created keys; keep a `Set` per renderer so Socket.IO duplicates do not replay.

- [ ] **Step 4: Add the visual states**

In `assets/public-refresh.css`, add team-color light sweeps, card perspective containment, `transform-style:preserve-3d`, and leader/podium glow styles. Limit pointer tilt to `@media (hover:hover) and (pointer:fine)` and remove all perspective transforms in reduced-motion mode.

- [ ] **Step 5: Verify public behavior**

Run: `node --test scripts/registry-motion-ui.test.mjs scripts/registry-site-design-ui.mjs scripts/registry-preview.test.mjs`  
Expected: PASS with correct final ranking order and no duplicate promotion effect.

- [ ] **Step 6: Commit public motion**

```powershell
git add assets/public.js preview/preview-public.js assets/tournament.js assets/player.js assets/ranking.js assets/public-refresh.css scripts/registry-motion-ui.test.mjs scripts/registry-site-design-ui.mjs
git commit -m "feat: animate public tournament and ranking updates"
```

### Task 5: Animate live match, court board, schedule, and check-in updates

**Files:**
- Modify: `assets/match-live.js`
- Modify: `assets/match-live.css`
- Modify: `assets/court-board.js`
- Modify: `assets/court-board.css`
- Modify: `assets/checkin.js`
- Modify: `assets/site-sport.css`
- Modify: `scripts/registry-realtime.test.mjs`
- Modify: `scripts/registry-checkin-ui.test.mjs`
- Modify: `scripts/registry-court-scheduling-ui.mjs`

- [ ] **Step 1: Write failing confirmed-state and duplicate-event tests**

Add a repeated Socket.IO fixture update with the same match version and assert score motion runs once. Add a new version and assert the affected score side reaches the new text and runs once more. For court cards, capture old card rectangles, apply a court reassignment, and assert final card order plus one FLIP call. For check-in, assert a successful API response marks the athlete row `data-motion-state="checked-in"`; a rejected response must not.

- [ ] **Step 2: Run the operational suites and verify they fail**

Run: `node --test scripts/registry-realtime.test.mjs scripts/registry-checkin-ui.test.mjs scripts/registry-court-scheduling-ui.mjs`  
Expected: FAIL because render-version deduplication and semantic hooks are absent.

- [ ] **Step 3: Add confirmed version guards and motion hooks**

For match and court renderers, keep `Map<entityId, versionOrSignature>`. Build the signature from persisted values already in the response: score, sets, winner, status, court ID, scheduled time, and version. Call score, live-status, or FLIP motion only when the signature changes after initial render.

Use this shape in each renderer:

```js
const previous=rendered.get(match.id);
const next=`${match.version}:${match.scoreA}:${match.scoreB}:${match.status}:${match.courtId||""}`;
rendered.set(match.id,next);
if(previous&&previous!==next)window.PickleMotion?.scoreChange(changedScore,delta);
```

In check-in, call the success sweep only after the awaited API call returns and the row is rendered as checked in. On failure, call `PickleMotion.error` on the control and retain the existing error text.

- [ ] **Step 4: Add broadcast visual styles**

Add a controlled live pulse, court-card travel shadow, checked-in identity sweep, and final-state cleanup. Ambient live loops must be paused by the core visibility handler and disabled under reduced motion.

- [ ] **Step 5: Verify tournament-day flows**

Run: `node --test scripts/registry-realtime.test.mjs scripts/registry-checkin-ui.test.mjs scripts/registry-court-scheduling-ui.mjs scripts/registry-network-ui.test.mjs`  
Expected: PASS; repeated events do not replay, offline/error paths remain usable.

- [ ] **Step 6: Commit operational motion**

```powershell
git add assets/match-live.js assets/match-live.css assets/court-board.js assets/court-board.css assets/checkin.js assets/site-sport.css scripts/registry-realtime.test.mjs scripts/registry-checkin-ui.test.mjs scripts/registry-court-scheduling-ui.mjs
git commit -m "feat: animate confirmed live tournament updates"
```

### Task 6: Animate bracket drawing, advancement, and knockout reset

**Files:**
- Modify: `assets/bracket-ui.js`
- Create: `assets/bracket-motion.js`
- Modify: `assets/site-sport.css`
- Modify: `admin.html`
- Modify: `index.html`
- Modify: `tournament.html`
- Modify: matching `preview/` HTML pages
- Modify: `scripts/registry-draw-reset-ui.mjs`
- Modify: `scripts/registry-mlp-championship-ui.mjs`

- [ ] **Step 1: Write failing bracket identity and transition tests**

Assert each round, match, team slot, and connector has a stable key derived from division, series, and `bracketSlot`. Capture a bracket before a confirmed advancement, apply the new state, and assert exactly one destination slot receives `data-motion-state="advanced"`. Apply knockout reset and assert cleared knockout slots receive `data-motion-state="reset"` while group result nodes and text remain unchanged.

- [ ] **Step 2: Run bracket suites and verify they fail**

Run: `node scripts/registry-draw-reset-ui.mjs`  
Run: `node scripts/registry-mlp-championship-ui.mjs`  
Expected: at least one FAIL on absent stable connector/slot metadata and transition state.

- [ ] **Step 3: Emit stable bracket metadata**

Update `assets/bracket-ui.js` so each match carries `data-motion-key="bracket:<division>:<series>:<slot>"`, each team row carries `data-team-id`, and connector SVG paths carry source/destination slot data. Escape every value with the existing `esc` helper.

Create `assets/bracket-motion.js` with one exported reconciler:

```js
(()=>{
  const snapshots=new WeakMap();
  function reconcile(root,{initial=false}={}){
    const current=new Map([...root.querySelectorAll("[data-motion-key]")].map(el=>[el.dataset.motionKey,{el,team:el.querySelector(".win")?.textContent.trim()||"",rect:el.getBoundingClientRect()}]));
    const before=snapshots.get(root);
    snapshots.set(root,current);
    if(initial||!before)return window.PickleMotion?.entrance([...root.querySelectorAll(".bracket-round-pro,.bracket-connector")],{key:`bracket:${root.id||"root"}`,stagger:.07,y:18});
    for(const [key,item] of current){
      const old=before.get(key);
      if(old&&!old.team&&item.team){item.el.dataset.motionState="advanced";window.PickleMotion?.keyed(`advance:${key}`,tl=>tl.fromTo(item.el,{scale:.92,filter:"brightness(1.8)"},{scale:1,filter:"none",duration:.7,ease:"back.out(1.8)",clearProps:"transform,filter",onComplete:()=>delete item.el.dataset.motionState}))}
      if(old?.team&&!item.team){item.el.dataset.motionState="reset";window.PickleMotion?.keyed(`reset:${key}`,tl=>tl.fromTo(item.el,{autoAlpha:.45,scale:.96},{autoAlpha:1,scale:1,duration:.45,clearProps:"transform,opacity,visibility",onComplete:()=>delete item.el.dataset.motionState}))}
    }
  }
  window.PickleBracketMotion={reconcile};
})();
```

Call `reconcile` immediately after the owning page replaces bracket HTML. Treat first render as `initial:true`; never infer advancement from DOM appearance alone.

- [ ] **Step 4: Load and style bracket motion**

Load `bracket-motion.js` after `motion-system.js` and before page renderers on root and preview pages that contain a bracket. Add connector dash drawing, team-colored travel glow, winner emphasis, and reverse/reset styles. Provide static connector appearance under reduced motion.

- [ ] **Step 5: Verify advancement and reset safety**

Run: `node scripts/registry-draw-reset-ui.mjs`  
Run: `node scripts/registry-mlp-championship-ui.mjs`  
Run: `node --test scripts/registry-tournament-progress.test.mjs`  
Expected: PASS; group results remain preserved and knockout final DOM matches the confirmed state.

- [ ] **Step 6: Commit bracket motion**

```powershell
git add assets/bracket-ui.js assets/bracket-motion.js assets/site-sport.css index.html tournament.html admin.html preview/index.html preview/tournament.html preview/admin.html scripts/registry-draw-reset-ui.mjs scripts/registry-mlp-championship-ui.mjs
git commit -m "feat: animate bracket advancement and reset"
```

### Task 7: Animate referee scoring, service selection, Undo, and set state

**Files:**
- Modify: `assets/referee-courtside.js`
- Modify: `assets/referee-arena.css`
- Modify: `scripts/registry-referee-arena-ui.mjs`
- Modify: `scripts/registry-scoring-ui.mjs`

- [ ] **Step 1: Write failing referee semantic transition tests**

Instrument `PickleMotion` before page scripts and record calls. Assert:

- initial match load calls neither `scoreChange`, `setWin`, nor `matchWin`;
- a confirmed point for A calls `scoreChange` for A with `+1` once;
- a correction calls the same method with `-1` once;
- tapping athlete B/1 calls `serviceChange` only after the API response updates server state;
- repeated rendering of the same version does not replay service motion;
- Undo uses `data-motion-direction="reverse"` and reaches the restored score;
- set completion calls `setWin` once;
- a finished match disables service selection.

- [ ] **Step 2: Run the referee suites and verify they fail**

Run: `node scripts/registry-referee-arena-ui.mjs`  
Run: `node scripts/registry-scoring-ui.mjs`  
Expected: FAIL on missing semantic calls and reverse direction metadata.

- [ ] **Step 3: Replace local Web Animations calls with confirmed semantic hooks**

Keep the existing `lastScore` snapshot but add `version`, `status`, and `winner`. Remove the local `motions` map after all callers use `PickleMotion`. In `renderScore`, compare previous and next only when IDs match and the confirmed version changed.

Use:

```js
if(delta)window.PickleMotion?.scoreChange(score,delta);
if((previous.serve!==serve||previous.server!==server)&&next.version!==previous.version){
  const athlete=document.querySelector(`[data-service-player="${serve}"][data-server-number="${server}"]`);
  window.PickleMotion?.serviceChange(athlete,$("#serveBanner"),serve==="A"?"#bcff37":"#4dd0ff");
}
if(next.sets>previous.sets)window.PickleMotion?.setWin($("#setHistory"),next.lastSetWinner==="A"?"#bcff37":"#4dd0ff");
if(!previous.winner&&next.winner)window.PickleMotion?.matchWin($("#scoreHint"),next.winner===m.a?"#bcff37":"#4dd0ff");
```

Set `data-motion-direction="reverse"` immediately before an Undo/reset action, clear it after the confirmed render, and never await animation promises in `action`.

- [ ] **Step 4: Add arena light-trail and reverse styles**

Add pseudo-element lanes for team-color service travel, score flash containment, winner rays, and reverse desaturation. Ensure overlays use `pointer-events:none`, remain inside the viewport, and do not alter score-card dimensions.

- [ ] **Step 5: Verify scoring correctness and responsiveness**

Run: `node scripts/registry-referee-arena-ui.mjs`  
Run: `node scripts/registry-scoring-ui.mjs`  
Run: `node --test scripts/registry-team-lineup.test.mjs`  
Expected: PASS in normal and reduced motion across existing mobile and desktop viewports.

- [ ] **Step 6: Commit referee motion**

```powershell
git add assets/referee-courtside.js assets/referee-arena.css scripts/registry-referee-arena-ui.mjs scripts/registry-scoring-ui.mjs
git commit -m "feat: animate referee score and service changes"
```

### Task 8: Add celebrations and animate admin feedback

**Files:**
- Modify: `assets/motion-system.js`
- Modify: `assets/motion-system.css`
- Modify: `assets/admin-app.js`
- Modify: `assets/admin-crud.js`
- Modify: `scripts/registry-motion-ui.test.mjs`
- Modify: `scripts/registry-referee-arena-ui.mjs`
- Modify: `scripts/registry-accounts-ui.mjs`

- [ ] **Step 1: Write failing celebration, dialog, and cleanup tests**

Add tests that transition an active match from no winner to winner and assert one `.motion-celebration` canvas appears, has `pointer-events:none`, then is removed within 3 seconds. Reload an already finished match and assert no canvas appears. Switch to reduced motion and assert `matchWin` applies a brief static emphasis without canvas.

Open and close `#genericDialog`; assert the card reaches visible final state, focus remains in the dialog, and the closing timeline restores focus to the invoker. Trigger validation failure and assert `PickleMotion.error` is called for the first invalid field. Trigger a successful save and assert one success toast transition.

- [ ] **Step 2: Run celebration and admin suites and verify they fail**

Run: `node --test scripts/registry-motion-ui.test.mjs scripts/registry-accounts-ui.mjs`  
Run: `node scripts/registry-referee-arena-ui.mjs`  
Expected: FAIL on absent celebration canvas lifecycle and admin semantic hooks.

- [ ] **Step 3: Implement a bounded shared celebration renderer**

Replace the temporary `celebrate` no-op with a canvas renderer that:

- creates one `.motion-celebration` fixed overlay with `aria-hidden="true"`;
- uses `quality()` to choose 48 compact or 96 full particles;
- seeds particles from the target rectangle center with color plus white/yellow accents;
- animates with one `requestAnimationFrame` loop capped at 1,200 ms for `set` and 2,500 ms for `match`;
- cancels an older celebration before starting another;
- removes the overlay on completion, `pagehide`, `dispose`, or when the document becomes hidden;
- skips canvas entirely under reduced motion and runs one 180 ms opacity emphasis on the target.

The public method remains `celebrate({target,color,kind})`; `setWin` and `matchWin` continue delegating to it.

- [ ] **Step 4: Integrate dialog, validation, and toast motion**

In `assets/ui-motion.js`, observe `dialog[open]` and toast insertion. Animate only their visual panels, never the native dialog element or focus/inert state. In `admin-app.js` and `admin-crud.js`, call `PickleMotion.error(field)` at concrete validation returns and `PickleMotion.press(saveButton)` after confirmed saves. Preserve every existing toast string and API sequence.

Use one helper:

```js
const invalid=(field,message)=>{field?.focus();window.PickleMotion?.error(field);toast(message);return false};
```

Replace only validation branches that already return before an API call; do not add client-side rules that disagree with server validation.

- [ ] **Step 5: Verify cleanup, focus, and confirmed-only celebration**

Run: `node --test scripts/registry-motion-ui.test.mjs scripts/registry-accounts-ui.mjs`  
Run: `node scripts/registry-referee-arena-ui.mjs`  
Expected: PASS; no overlay survives 3 seconds or page teardown, initial completed state does not celebrate, dialog focus behavior is unchanged.

- [ ] **Step 6: Commit celebrations and admin feedback**

```powershell
git add assets/motion-system.js assets/motion-system.css assets/ui-motion.js assets/admin-app.js assets/admin-crud.js scripts/registry-motion-ui.test.mjs scripts/registry-referee-arena-ui.mjs scripts/registry-accounts-ui.mjs
git commit -m "feat: add bounded celebrations and admin feedback"
```

### Task 9: Final asset versions, performance guardrails, and release verification

**Files:**
- Modify: all HTML files that reference changed assets
- Modify: `service-worker.js`
- Modify: `preview/service-worker.js`
- Modify: `scripts/registry-motion-runtime.test.mjs`
- Modify: `scripts/registry-motion-ui.test.mjs`
- Modify: `.github/workflows/ci.yml` if the new test is not discovered by the current command list

- [ ] **Step 1: Add failing final-release assertions**

Extend the runtime test to assert every changed asset has the same final version in root pages, preview pages, and both service-worker lists. Add browser assertions for:

- no horizontal overflow at 375, 680, 844, 1024, and 1440 pixels;
- no active `.motion-celebration` or keyed timeline after completion;
- controls accept a second click during an active visual timeline;
- `document.hidden` pauses ambient loops;
- reduced motion uses no canvas, parallax, shaking, numeric tween, or structural travel;
- blocked GSAP still leaves each representative page usable;
- navigation exit never exceeds 220 ms.

- [ ] **Step 2: Run the focused test and verify any version gaps fail**

Run: `node --test scripts/registry-motion-runtime.test.mjs scripts/registry-motion-ui.test.mjs`  
Expected: FAIL until final versions and cache lists are synchronized.

- [ ] **Step 3: Synchronize versions once**

Choose one new numeric version per changed first-party asset, update root and preview HTML references, and mirror them in both service-worker arrays. Set final cache names ending in `full-motion-20261013`. Keep the GSAP filename versioned by its package version and do not append a second package version in query parameters.

If CI does not glob `scripts/*.test.mjs`, add `node --test scripts/registry-motion-runtime.test.mjs` beside the existing motion suite in `.github/workflows/ci.yml`.

- [ ] **Step 4: Run syntax and focused suites**

Run:

```powershell
node --check assets/motion-system.js
node --check assets/ui-motion.js
node --check assets/bracket-motion.js
node --check assets/ranking.js
node --check assets/referee-courtside.js
node --test scripts/registry-motion-runtime.test.mjs scripts/registry-motion-ui.test.mjs scripts/registry-checkin-ui.test.mjs scripts/registry-team-lineup.test.mjs
node scripts/registry-referee-arena-ui.mjs
node scripts/registry-scoring-ui.mjs
node scripts/registry-draw-reset-ui.mjs
```

Expected: all commands exit 0.

- [ ] **Step 5: Run broad application verification**

Run:

```powershell
npm audit --audit-level=high
npm run ui:smoke
node scripts/registry-site-design-ui.mjs
node scripts/registry-network-ui.test.mjs
node scripts/registry-preview.test.mjs
python ..\seo-web-governance\engine\website_os_engine.py --project-root . --governance-root ..\seo-web-governance --gate auto --source-sha ef18d255150f3a77a7c7587feccf1ba7c419ad7b
git diff --check
```

Expected: all suites and Website OS enforcement pass with no findings; `git diff --check` prints nothing.

- [ ] **Step 6: Review representative screenshots**

Capture normal and reduced-motion final states for public home, ranking, tournament bracket, referee score, and admin at 375 and 1440 pixels using the existing screenshot environment variables. Inspect that overlays do not cover controls, text remains readable, service/winner state is obvious, and no transform causes clipping.

- [ ] **Step 7: Commit the final synchronized release**

```powershell
git add .
git commit -m "test: verify full-site motion release"
```

- [ ] **Step 8: Push and monitor deployment**

Run: `git push origin main`

Monitor the CI and Cloudflare Worker runs for the pushed SHA until both complete successfully. Verify production serves `assets/vendor/gsap-3.15.0.min.js`, the final `motion-system.js` version, and the updated cache name. Open the production referee and public home pages once to verify there are no runtime errors and controls remain interactive.
