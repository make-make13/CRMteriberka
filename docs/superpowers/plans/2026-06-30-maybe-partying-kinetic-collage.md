# MAYBE PARTYING Kinetic Collage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a validated 4.6-second, 1080×1920 HyperFrames composition with readable CapCut/Reels-style kinetic typography.

**Architecture:** Keep the video fully isolated under `hyperframes/maybe-partying/`. A standalone `index.html` owns the static hero layout, decorative club background, and one deterministic GSAP timeline; `DESIGN.md` is the visual identity source of truth, and `verify.mjs` provides fast requirement-level regression checks before browser-based HyperFrames checks.

**Tech Stack:** HyperFrames CLI, HTML/CSS, GSAP 3, Node.js assertions.

---

### Task 1: Scaffold and lock requirements

**Files:**
- Create: `hyperframes/maybe-partying/` via the HyperFrames kinetic-type scaffold
- Create: `hyperframes/maybe-partying/verify.mjs`
- Create: `hyperframes/maybe-partying/DESIGN.md`

- [ ] **Step 1: Scaffold the isolated composition**

Run `npx hyperframes init hyperframes/maybe-partying --example kinetic-type --non-interactive` from the repository root.

Expected: the CLI creates an isolated HyperFrames project without changing the CRM Vite entry point.

- [ ] **Step 2: Add a failing requirement verifier**

Create `verify.mjs` with these assertions:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const design = await readFile(new URL("./DESIGN.md", import.meta.url), "utf8");

assert.match(html, /data-composition-id="maybe-partying"/);
assert.match(html, /data-width="1080"/);
assert.match(html, /data-height="1920"/);
assert.match(html, /data-duration="4\.6"/);
assert.match(html, />MAYBE</);
assert.match(html, />PARTYING</);
assert.match(html, />WILL</);
assert.match(html, />HELP</);
assert.match(html, /We need to get into/);
assert.match(html, /a little mischief\./);
assert.match(html, /window\.__timelines\["maybe-partying"\] = tl/);
assert.doesNotMatch(html, /Math\.random|Date\.now|repeat:\s*-1/);
assert.match(design, /#09070D/);
assert.match(design, /#FF2EC4/);
assert.match(design, /#22D3EE/);

console.log("HyperFrames composition requirements passed");
```

- [ ] **Step 3: Confirm the verifier fails against the scaffold**

Run `node verify.mjs` from `hyperframes/maybe-partying`.

Expected: FAIL because the scaffold does not contain the required composition ID and copy.

- [ ] **Step 4: Define the visual identity**

Write `DESIGN.md` with the exact palette from the approved design, Impact/Haettenschweiler headline fallbacks, an Arial Rounded/Trebuchet quote fallback, deterministic fast motion rules, and explicit prohibitions on rainbow color, gradient text, random animation, excessive blur, and settled text outside safe margins.

### Task 2: Author the composition

**Files:**
- Replace: `hyperframes/maybe-partying/index.html`

- [ ] **Step 1: Build the settled hero layout**

Create one standalone root with `data-composition-id="maybe-partying"`, `data-start="0"`, `data-duration="4.6"`, `data-track-index="0"`, `data-width="1080"`, and `data-height="1920"`. Add separate elements for `MAYBE`, `PARTYING`, `WILL`, `HELP`, and both quote rows. Use a full-canvas flex content container with 96px horizontal padding; reserve absolute positioning for background glows, grain, traces, and the quote overlay.

- [ ] **Step 2: Add visual styling from DESIGN.md**

Use CSS custom properties for all five palette colors. Keep headline text within 888px and use fixed render sizes for deterministic capture. Keep glow on `PARTYING` only. Implement grain with a deterministic inline SVG turbulence filter at low opacity, and mark decoratives with `data-layout-ignore`.

- [ ] **Step 3: Build the synchronous GSAP timeline**

Load GSAP 3.14.2, create `const tl = gsap.timeline({ paused: true })`, and register it synchronously as `window.__timelines["maybe-partying"] = tl`. Implement beats at 0.18, 0.62, 1.48, 1.82, 2.92, 3.22, 3.48, and 4.38 seconds. Use explicit shake keyframes for `PARTYING`; do not use randomness, infinite repeats, async construction, display animation, or media playback.

- [ ] **Step 4: Make the requirement verifier pass**

Run `node verify.mjs`.

Expected: `HyperFrames composition requirements passed`.

- [ ] **Step 5: Commit the working composition checkpoint**

Run `git add hyperframes/maybe-partying` and `git commit -m "feat: add MAYBE PARTYING HyperFrames composition"`.

### Task 3: Validate motion and layout

**Files:**
- Modify if required: `hyperframes/maybe-partying/index.html`
- Create: `hyperframes/maybe-partying/.hyperframes/anim-map/animation-map.json`

- [ ] **Step 1: Run static HyperFrames checks**

Run `npx hyperframes lint` and `npx hyperframes validate` from `hyperframes/maybe-partying`.

Expected: both commands exit successfully with no composition errors.

- [ ] **Step 2: Inspect portrait layout at dense samples**

Run `npx hyperframes inspect --samples 15`.

Expected: no unintended clipping, overflow, or collision at settled frames. Entrance overshoot may be marked with `data-layout-allow-overflow` only when the movement is intentional.

- [ ] **Step 3: Generate and review the animation map**

Run `node "C:\Users\Make\.codex\plugins\cache\openai-curated-remote\hyperframes\0.1.2\skills\hyperframes\scripts\animation-map.mjs" hyperframes/maybe-partying --out hyperframes/maybe-partying/.hyperframes/anim-map` from the repository root.

Expected: the map shows the headline sequence, quote sequence, and readable final hold with no unexplained offscreen, collision, or invisible flags.

- [ ] **Step 4: Re-run checks after corrections**

Run `node verify.mjs`, `npx hyperframes lint`, `npx hyperframes validate`, and `npx hyperframes inspect --samples 15`.

Expected: all checks pass.

### Task 4: Document completion

**Files:**
- Modify: `docs/WORKLOG.md`

- [ ] **Step 1: Append a concise completion checkpoint**

Record date/time, task, changed files, completed animation behavior, exact checks, recommended preview/render step, and remaining visual-review risk. Preserve all pre-existing worklog changes.

- [ ] **Step 2: Verify final scope**

Run `git status --short` and `git diff --stat HEAD`.

Expected: scope is limited to the HyperFrames project, plan, and `docs/WORKLOG.md`; CRM application source is untouched.
