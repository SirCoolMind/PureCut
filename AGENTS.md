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

There is currently **no test runner wired to npm.** Playwright is installed as a
devDependency, but the ad-hoc scripts in the repo root are not integrated and
are mid-migration into `tests/`. Do not assume they pass.

## Architecture

| Module | Role |
| --- | --- |
| `src/App.vue` | The application shell: template, styles, and the logic not yet extracted (~2300 lines and shrinking). See the map below before reading it end-to-end. |
| `src/aiEngine.js` | Transformers.js wrapper. Model loading, device selection (WebGPU vs WASM), and the WebGPU→WASM fallback. |
| `src/detectionEngine.js` | Pure pixel analysis: connected-component subject detection, magic-wand flood fill, mask contour extraction. No Vue, no DOM. |
| `src/constants.js` | `appVersion`, `modelOptions`, `changelog`, `roadmap`. |
| `src/components/*.vue` | Three lazy-loaded modals (Info / Settings / Showcase). Dumb props + emits. |
| `src/composables/*.ts` | `setup()`-scope state and behaviour, one concern per composable. Dependencies arrive as refs/callbacks rather than imports, so each module's signature is its whole contract. Currently `useDisplayScale`, `useWorkspaceUi`, `useZoomPan`, `useTelemetry`, `useUndoRedo`, `useImageInput`, `useOutlineOverlay`, `useSubjects`. |
| `src/core/*.ts` | Framework-free modules: no Vue, no DOM side effects. Must be unit-testable in isolation. Currently `storageKeys.ts` and `canvasStore.ts`. |

> **Note:** the refactor moves code out of `App.vue` into `src/composables/`
> (state + logic per concern) and `src/core/` (framework-free helpers). Prefer
> those files over `App.vue`, and update this table as the module list grows.
>
> `src/core/canvasStore.ts` is the one deliberate exception to "no DOM": it owns
> the `HTMLCanvasElement` / `CanvasRenderingContext2D` handles as **live ES module
> bindings**. Read them directly; replace them only via its setters.

**Data flow:** `processImage(file)` → `runTransformersModel()` returns a mask
blob → the mask is drawn into an offscreen canvas → brush/selection tools mutate
that mask canvas in place → `recompositeCanvas()` applies threshold / trim /
de-fringe and exports a PNG blob → undo snapshots and subject detection both
branch off the same mask canvas.

## Where to edit what (`src/App.vue` line ranges — STALE, verify first)

These ranges were taken from the 4404-line pre-refactor `App.vue` and were **not**
kept in sync as composables moved out, so most numbers below are now wrong. Treat
the table as an index of what exists, and confirm any line number with a search
before relying on it. Rows are deleted as each concern gets a real file path.

| Concern | Lines | Key symbols |
| --- | --- | --- |
| Imports | 1–44 | 33 lucide icons, engine + constants imports |
| Lazy modal imports | 47–49 | `defineAsyncComponent` |
| All reactive state | 52–129 | ~50 `ref`/`reactive`/computed declarations |
| Zoom & pan | 131–192 | `zoomIn/Out`, `resetZoom`, `onWheelZoom`, `onPanStart/Move/End` |
| Browser zoom + font scaling | 194–239 | `updateBrowserZoom`, `applyFontSize`, `cycleFontSize` |
| Tuning + modal state | 241–266 | `tuning`, `sliderPosition`, `previewBg`, prompt refs |
| Model cache management | 268–347 | `checkModelCacheStatus`, `clearAllCache`, `formattedCacheUsage` |
| Preload / presets / formatting | 349–397 | `handlePreload`, `applyPreset`, `formatBytes` |
| **AI pipeline** | **401–519** | **`processImage`** |
| Model-change prompt flow | 521–566 | `handleModelSelectChange`, `confirmModelRerun` |
| Fast GPU preview | 568–610 | `renderFastPreview`, `schedulePreview` |
| **Full-quality compositing** | **612–717** | **`recompositeCanvas`** (threshold/trim/deFringe) |
| Cutout outline overlay | 719–788 | `toggleOutline`, `updateOutlineOverlay` |
| Subject visibility / erase | 790–831 | `toggleSubjectVisibility`, `eraseSubject` |
| Undo / redo / brush reset | 833–868 | `saveUndoState`, `handleUndo`, `handleRedo` |
| Pointer → pixel mapping | 870–912 | `getCanvasCoords` |
| Brush engine | 916–978 | `onPointerDown/Move/Up` |
| Selection overlay + ants | 980–1083 | `renderSelectionOverlay`, `startAntsAnimation` |
| Magnetic lasso edge snap | 1085–1140 | `findNearestObjectEdge` |
| Selection tools | 1142–1337 | `onSelectPointerDown/Move/Up`, `applySelectionAction` |
| File input / paste / copy | 1339–1410 | `confirmAndProcessImage`, `onDrop`, `onPaste` |
| Reset | 1412–1431 | `reset` |
| Keyboard shortcuts | 1433–1466 | `onKeyDown` (Ctrl+Z/Y, Delete/Enter/Esc) |
| Lifecycle | 1468–1499 | `watch(activeTool)`, `onMounted`, `onUnmounted` |

Template: navbar 1504–1619 · upload hero 1623–1671 · processing overlay
1672–1713 · studio workspace 1714–2274 · `<Teleport>` prompt modals 2276–2389 ·
modal mounts 2391–2413.
Styles: global `<style>` 2417–2829 · `<style scoped>` 2831–4403.

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
