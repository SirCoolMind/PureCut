# AGENTS.md — PureCut

Guidance for AI coding agents working in this repository. Keep this file short,
specific, and stable: it is loaded into the context window on every request.

## What this is

PureCut is a **100% client-side AI background remover**. Vue 3 (`<script setup>`,
Composition API) + Vite. Inference runs entirely in the browser via
`@huggingface/transformers` (Transformers.js / ONNX WebGPU + WASM). There is no
server, no API, and no backend — images never leave the device.

## Commands

| Task | Command |
| --- | --- |
| Dev server (port 5173, auto-opens browser) | `npm run dev` |
| Production build | `npm run build` |
| Preview the built output | `npm run preview` |
| Report AI context cost per file | `npm run context:report` |
| Enforce the file-size budget | `npm run context:check` |
| Type-check the source | `npm run typecheck` |

TypeScript is pinned to **5.x on purpose.** `vue-tsc` resolves
`typescript/lib/tsc`, which TypeScript 7 removed from its `exports` map, so
upgrading TS breaks `npm run typecheck` with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
Do not bump TypeScript past 5 until vue-tsc supports TS 7.

`npm run test:regression` is the structural safety net: a Playwright suite
(`tests/e2e/regression.mjs`, 61 checks) that needs the dev server on :5173 and
clicks through the whole app, including inference. Run it before and after any
structural change. It catches a lost element or a dead handler, but **not** lost
styling, so pair it with a visual check whenever markup moves between files.
`test.cjs` still cannot run (no `puppeteer` dependency) and `playwright-test.mjs`
/ `test-showcase.mjs` still point at a hardcoded path outside this repo.

## Architecture

| Module | Role |
| --- | --- |
| `src/App.vue` | The application shell: the composable wiring block, the four function refs, `getCanvasCoords`, `reset`, `onKeyDown` and the lifecycle hooks, plus the template that composes the components below. ~610 lines (script ~420, template ~185). |
| `src/aiEngine.js` | Transformers.js wrapper. Model loading, device selection (WebGPU vs WASM), and the WebGPU→WASM fallback. |
| `src/detectionEngine.js` | Pure pixel analysis: connected-component subject detection, magic-wand flood fill, mask contour extraction. No Vue, no DOM. |
| `src/constants.js` | `appVersion`, `modelOptions`, `changelog`, `roadmap`. |
| `src/components/*.vue` | The view layer, one concern per file: `Navbar`, `ModelStatusBar`, `UploadHero`, `ProcessingOverlay`, `StageHeader`, `CanvasViewport`, `StageFooter`, `TuningSidebar`, `SubjectsDrawer`, `ZoomToolbar`, `ModelChangePrompt`, `ReplaceImagePrompt`, plus the three lazy-loaded modals (Info / Settings / Showcase). Dumb props + emits; all state stays in `App.vue`. |
| `src/composables/*.ts` | `setup()`-scope state and behaviour, one concern per composable. Dependencies arrive as refs/callbacks rather than imports, so each module's signature is its whole contract: `useDisplayScale`, `useWorkspaceUi`, `useZoomPan`, `useTelemetry`, `useUndoRedo`, `useImageInput`, `useOutlineOverlay`, `useSubjects`, `useBrush`, `useSelectionOverlay`, `useSelectionTools`, `useCompositor`, `useModelCache`, `useProcessing`. |
| `src/core/*.ts` | Framework-free modules: no Vue, no DOM side effects. Must be unit-testable in isolation. Currently `storageKeys.ts`, `canvasStore.ts`, `format.ts`. |
| `scripts/context-report.mjs` | The size budget tool: per-file lines/tokens, plus a per-block breakdown for oversized `.vue` files. |

> **Note:** the refactor is done moving code out of `App.vue` — logic lives in
> `src/composables/`, helpers in `src/core/`, markup in `src/components/`.
> `App.vue` is now the wiring plus the template; prefer the extracted files.
>
> `src/core/canvasStore.ts` is the one deliberate exception to "no DOM": it owns
> the `HTMLCanvasElement` / `CanvasRenderingContext2D` handles as **live ES module
> bindings**. Read them directly; replace them only via its setters.

**Data flow:** `processImage(file)` → `runTransformersModel()` returns a mask
blob → the mask is drawn into an offscreen canvas → brush/selection tools mutate
that mask canvas in place → `recompositeCanvas()` applies threshold / trim /
de-fringe and exports a PNG blob → undo snapshots and subject detection both
branch off the same mask canvas.

## Where things live

`App.vue` owns every ref and every composable and passes them down; the components
are presentational and talk back through emits only.

| Concern | File |
| --- | --- |
| Navbar, brand, version badge, mode + font-size controls | `components/Navbar.vue` |
| Model picker, cached indicator, preload, cache pill | `components/ModelStatusBar.vue` |
| Upload hero / dropzone | `components/UploadHero.vue` |
| Processing overlay, download progress, live tiles | `components/ProcessingOverlay.vue` |
| File/dimension/subject tags, tool + backdrop switchers | `components/StageHeader.vue` |
| Canvas stack, tool layers, brush/selection/pan surfaces | `components/CanvasViewport.vue` |
| Zoom controls | `components/ZoomToolbar.vue` |
| Per-tool footer controls + export actions | `components/StageFooter.vue` |
| Presets, tuning sliders, engine selects, telemetry card | `components/TuningSidebar.vue` |
| Subject drawer | `components/SubjectsDrawer.vue` |
| "Switch model?" / "Replace image?" prompts | `components/ModelChangePrompt.vue`, `components/ReplaceImagePrompt.vue` |
| Model loading, device selection + fallback | `aiEngine.js` |
| Subject detection, flood fill, contour extraction | `detectionEngine.js` |
| Fast GPU preview vs full-quality export | `composables/useCompositor.ts` |
| Mask history (undo/redo/reset) | `composables/useUndoRedo.ts` |
| Canvas handles (live module bindings) | `core/canvasStore.ts` |
| `localStorage` key names | `core/storageKeys.ts` |
| Pointer event → image pixel mapping | `getCanvasCoords` in `App.vue` (destined for `core/geometry.ts`) |
| Styles | `styles/global.css` (unscoped), `styles/app.css` (App.vue's shell), and a scoped `<style>` inside each component |

Styles travel with markup: when a block moves into a component, its CSS moves too,
because scoped styles do not cross component boundaries. Vue also rewrites
`@keyframes` names per scope, so a component can never use a parent's keyframes —
`ProcessingOverlay`, `ModelStatusBar` and `InfoModal` each declare their own
`spin`.

## Non-obvious constraints — read before editing

1. **Canvas objects are deliberately NOT reactive.** `maskCanvas`, `maskCtx`,
   `originalCanvas` and `originalCtx` are module-level `let` bindings, outside
   Vue's reactivity system. Never wrap a canvas, context, or `ImageData` in
   `ref()` — the resulting Proxy breaks `getImageData`/`putImageData` identity
   and destroys performance. Use `shallowRef` or plain module state.

2. **`localStorage` keys are magic strings, duplicated in four files.**
   `purecut_hf_token`, `purecut_font_size`, `purecut_cached_<modelId>`,
   `purecut_prompt_model_change`. They appear in `App.vue`, `SettingsModal.vue`,
   `aiEngine.js`, and `index.html`. `index.html` cannot import a module, so its
   copy of `purecut_font_size` must stay duplicated — do not "fix" it.

3. **COOP/COEP headers are load-bearing.** `vite.config.js` sets
   `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`, and
   `public/coi-serviceworker.js` replicates them for static hosting.
   Multi-threaded WASM inference breaks without them. Do not remove or relax.

4. **The WebGPU→WASM fallback must survive refactors.** `aiEngine.js` retries on
   failure and downgrades the selected device. Do not simplify it into a single
   attempt, and do not reorder the module-level mutations of
   `env.fetch` / `env.backends.onnx.wasm`.

5. **Vue scoped CSS rewrites `@keyframes` names.** `@keyframes spin` is declared
   in `App.vue`'s scoped block, so it is **not usable from `src/components/*.vue`**.
   An extracted component needing it must declare its own.

6. **Scoped styles do not cross component boundaries.** A child component's root
   element inherits the parent's scope ID, but its nested elements do not. If you
   extract markup into a component, move that markup's CSS with it.

7. **No Pinia, no Vuex, no router, no provide/inject.** State lives in `App.vue`
   and reaches the three modals via props/emits. Keep it that way unless asked.

8. **`detectedSubjects` items are mutated in place** (`subject.visible = …`).
   This works only because `ref([])` is deeply reactive — do not change that
   array to `shallowRef`.

## Conventions

- `<script setup>` + Composition API only. No Options API.
- Preserve the fast/slow compositing split: `renderFastPreview()` uses GPU
  composite ops (<1 ms) for live feedback; `recompositeCanvas()` is debounced
  (~120 ms) and runs the full-resolution pixel loop plus PNG encoding. Live UI
  must never call the heavy path directly.
- Keep expensive work off the render path: batch with `requestAnimationFrame`
  (`schedulePreview`) and defer non-critical analysis (`detectSubjects` is
  already deferred with `setTimeout`).
- Do not add `console.log` noise; the browser console is used for real errors.
- Respect the size budget: no source file over 450 lines. Run
  `npm run context:report` before and after a large change.

## Known issues — report, do not silently fix

1. `toggleSubjectVisibility` / `eraseSubject` erase a **bounding box**, not the
   per-component mask pixels, so erasing one subject also wipes overlapping
   pixels of its neighbours. The code comment acknowledges this.
2. `ShowcaseModal.vue` emits `open-in-studio` but nothing listens for it.
3. `test.cjs` cannot run — it requires `puppeteer`, which is not a dependency —
   and it targets port 5174 while the dev server uses 5173.
4. `playwright-test.mjs` and `test-showcase.mjs` were written against a
   hardcoded absolute artifact path outside this repo.
5. `@imgly/background-removal` is declared as a dependency but never imported
   (it appears only as a display string in `InfoModal.vue`).
6. `SettingsModal.vue` writes `localStorage` directly, bypassing `App.vue`.
7. `App.vue` contains no `@media` queries — there is no responsive layout.
8. The contour-outline overlay is unreachable. `showOutline` is only ever written
   by `toggleOutline()`, and nothing calls `toggleOutline` — not the template, not
   `onKeyDown`. So the `#outlineCanvas` layer never becomes visible and
   `updateOutlineOverlay` / `stopOutlineAnimation` never run. Found while
   extracting `useOutlineOverlay.ts`; the code was moved verbatim rather than
   deleted, because dropping a feature is a product decision.
9. Dead CSS rules are scattered through the components: `.demo-showcase-trigger`
   and `.model-notice-pill` (in `UploadHero.vue`) and `.cached-text` /
   `.uncached-text` (in `ModelStatusBar.vue`) have no matching markup anywhere in
   the app. They were already dead before the components phase and moved with
   their block rather than deleted, for the same reason as issue 8.
10. The three power-user sliders call `recompositeCanvas` with the raw `input`
    event, so it arrives as the `immediateBlob` argument, which is truthy — every
    slider tick runs the full-resolution pixel loop synchronously instead of
    taking the ~120 ms debounce. The de-fringe toggle beside them is called with
    no arguments and does debounce. Pre-existing; preserved deliberately during the
    extraction (see the note in `TuningSidebar.vue`), not fixed.
11. `ShowcaseModal.vue` (1000 lines) and `InfoModal.vue` (789) are over the
    450-line budget, and it is almost entirely scoped CSS (646 and 575 lines).
    `npm run context:check` therefore exits 1 — the budget is unmet until those two
    modals are split. `context:report` prints the per-block breakdown that says so.
