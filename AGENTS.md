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
| Local RMBG-2.0 CPU lab (see below) | `npm run rmbg2` / `npm run rmbg2:help` |
| Local RMBG-2.0 CPU lab, one-click GUI (Windows) | `start-rmbg2.bat` |
| Local RMBG-2.0 CPU lab, one-click terminal (Windows) | `start-rmbg2-cmd.bat` |
| Local RMBG-2.0 lab, point-and-click GUI | `npm run rmbg2:lab` → `/rmbg2` |
| Pre-download RMBG-2.0 weights | `npm run rmbg2:preload` / `:preload:all` |
| Compare RMBG-2.0 execution providers | `npm run rmbg2:bench` |
| Report AI context cost per file | `npm run context:report` |
| Enforce the file-size budget | `npm run context:check` |
| Unit tests (vitest, pure modules) | `npm test` |
| Type-check the source | `npm run typecheck` |
| Check a build for lost styling | `node scripts/css-parity.mjs dist` / `--compare a.txt b.txt` |

TypeScript is pinned to **5.x on purpose.** `vue-tsc` resolves
`typescript/lib/tsc`, which TypeScript 7 removed from its `exports` map, so
upgrading TS breaks `npm run typecheck` with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
Do not bump TypeScript past 5 until vue-tsc supports TS 7.

`npm run test:regression` is the structural safety net: a Playwright suite
(`tests/e2e/regression.mjs`, 66 lines of orchestration over `tests/e2e/checks/*`)
that needs the dev server on :5173 and clicks through the whole app, including
inference, in **66 checks**. Run it before and after any structural change. It
catches a lost element or a dead handler, but **not** lost styling, so pair it
with a visual check whenever markup moves between files. For styling there is
`scripts/css-parity.mjs` (see below), which is the only guard against a rule
that silently stopped matching.

## Architecture

| Module | Role |
| --- | --- |
| `src/App.vue` | The application shell: the composable wiring block, the four function refs, `getCanvasCoords`, `reset` and the lifecycle hooks, plus the template that composes the components below. **531 lines** (script 339, template 184) — down from 4404. |
| `src/aiEngine.js` | Transformers.js wrapper. Model loading, device selection (WebGPU vs WASM), and the WebGPU→WASM fallback. |
| `src/detectionEngine.js` | Pure pixel analysis: connected-component subject detection, magic-wand flood fill, mask contour extraction. No Vue, no DOM. |
| `src/constants.js` | `appVersion`, `modelOptions`, `changelog`, `roadmap`. |
| `src/components/*.vue` | The view layer, one concern per file: `Navbar`, `ModelStatusBar`, `UploadHero`, `ProcessingOverlay`, `StageHeader`, `CanvasViewport`, `StageFooter`, `TuningSidebar`, `SubjectsDrawer`, `ZoomToolbar`, `ModelChangePrompt`, `ReplaceImagePrompt`, plus the three lazy-loaded modals (Info / Settings / Showcase) and their sub-components: `ShowcaseSliderStage`, `ShowcaseDiagnosis`, `ShowcaseGallery`, `InfoChangelogTab`, `InfoRoadmapTab`, `InfoAboutTab`, `InfoStorageTab`. Dumb props + emits; all state stays in `App.vue`. |
| `src/composables/*.ts` | `setup()`-scope state and behaviour, one concern per composable. Dependencies arrive as refs/callbacks rather than imports, so each module's signature is its whole contract: `useDisplayScale`, `useWorkspaceUi`, `useZoomPan`, `useTelemetry`, `useUndoRedo`, `useImageInput`, `useOutlineOverlay`, `useSubjects`, `useBrush`, `useSelectionOverlay`, `useSelectionTools`, `useCompositor`, `useModelCache`, `useKeyboardShortcuts`, `useProcessing`. |
| `src/core/*.ts` | Framework-free modules: no Vue, no DOM side effects. Must be unit-testable in isolation. Currently `storageKeys.ts`, `canvasStore.ts`, `format.ts`, `geometry.ts`, `maskOps.ts`. |
| `scripts/context-report.mjs` | The size budget tool: per-file lines/tokens, plus a per-block breakdown for oversized `.vue` files. |
| `scripts/css-parity.mjs` | Normalises the CSS of a build into a sorted set of `selector | declaration` lines and diffs two snapshots. The only guard against a rule that silently stopped matching. |

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
| Global keyboard shortcuts (undo/redo, selection keys) | `composables/useKeyboardShortcuts.ts` |
| Canvas handles (live module bindings) | `core/canvasStore.ts` |
| `localStorage` key names | `core/storageKeys.ts` |
| Pointer event → image pixel mapping | `toImageCoords` in `core/geometry.ts` (injected into the tool composables as `getCanvasCoords`) |
| Trim / threshold / de-fringe, wand rect mapping, lasso snap | `core/maskOps.ts` |
| Styles | `styles/global.css` (unscoped), `styles/app.css` (App.vue's shell), and a scoped `<style>` inside each component |

Styles travel with markup: when a block moves into a component, its CSS moves too,
because scoped styles do not cross component boundaries. Vue also rewrites
`@keyframes` names per scope, so a component can never use a parent's keyframes —
`ProcessingOverlay`, `ModelStatusBar`, `InfoModal` and each of the four
`Info*Tab` components declare their own.

The same rule bites in the other direction: a scoped rule can only style a child
through the child's ROOT element. `.stage-grid` in `ShowcaseModal.vue` lays out
both `ShowcaseSliderStage` and `ShowcaseDiagnosis`, so it has to live in the host
— left inside the stage component it silently stopped matching and the two-column
layout collapsed, while the regression harness stayed green (it asserts elements,
not layout) and css-parity stayed identical (a scoped rule that matches nothing is
still a rule).

## Model catalogue — read before adding or resizing a model

`modelOptions` in `src/constants.js` is the single source of truth; `ModelStatusBar`,
`TuningSidebar`, `InfoStorageTab` and `useModelCache` all read it, so adding a model is
normally one entry there. Two fields exist for reasons that are not obvious:

- **`forceWasm: true`** pins the model to WASM in `resolveModelDevice()` (`aiEngine.js`).
  Some graphs use `Pad` / `GatherND` nodes the WebGPU WGSL compiler rejects
  (`ShaderModule with 'Pad' label is invalid`). The older substring hint (`'BiRefNet'`)
  still works; prefer the explicit flag.
- **Working resolution is what decides whether a model fits, not the weight size.**
  `runTransformersModel` downscales the *source image* (BiRefNet 512, MODNet 768, else
  1024), but **a model's own `preprocessor_config.json` can override that** and resize the
  network input back up regardless. This is how a 109 MB checkpoint can still exhaust the
  32-bit WASM heap.

### RMBG-2.0 does not run in the browser — three checkpoints, three different failures

Recorded so nobody repeats the investigation. All verified against `onnxruntime-web`
(the browser runtime) on 2026-09-23.

| Checkpoint | Outcome | Cause |
| --- | --- | --- |
| `briaai/RMBG-2.0` (+ every mirror / quantization) | fails at **session creation** | `[ShapeInferenceError] Mismatch between number of inferred and declared dimensions. inferred=4 declared=6` |
| `onnx-community/BiRefNet-ONNX` (467 MB), `BiRefNet_lite-ONNX` (109 MB) | fails at **inference** | `std::bad_alloc` — preprocessor declares `size: {1024, 1024}` |
| `onnx-community/BiRefNet_512x512-ONNX` (473 MB) | **works** | preprocessor declares `size: {512, 512}` |

- The RMBG-2.0 failure is **a malformed shape declaration in the ONNX export, not a size
  limit**. Proof: the same bytes load fine under `onnxruntime-node`, and a 467 MB BiRefNet
  creates a session happily in the web runtime. Every mirror (`kn4666`, `Aero-Ex`,
  `camenduru`, `yuvraj108c`, `qqceqqq`) is byte-identical — confirmed by LFS hash — so
  switching repositories cannot help. It needs a re-export from PyTorch.
  `graphOptimizationLevel: 'disabled'` and `strict_shape_type_inference: '0'` do **not** work
  around it; the WASM build hardcodes strict shape inference.
- The `std::bad_alloc` failure is **not** about weights or the source image. Both the full
  and the *lite* checkpoint declare a 1024×1024 input, so the ViT feature extractor upscales
  no matter what `aiEngine.js` does. 1024² activations exceed the heap. **Do not raise the
  `BiRefNet → 512px` ceiling without re-testing in a real browser.**
- `BiRefNet_512x512-ONNX` is the only BiRefNet worth offering; it is enabled, CPU-only.
  It is a 473 MB download and the slowest option, so reconsider before shipping it widely.

**Debugging tips:** check `size` in the model's `preprocessor_config.json` *first* when a
model OOMs. A truncated Hugging Face download surfaces as `protobuf parsing failed`, not an
OOM — compare the local byte count against the repo's reported size before concluding
anything. And since the app fetches weights from HF at runtime, you can test a new model id
by editing `modelOptions` alone, with no local mirroring.

### Testing RMBG-2.0 anyway: the Node-side lab (`rmbg2-lab/`)

RMBG-2.0 is unrunnable *in a browser*, but not *on the machine*. The identical bytes create a
session fine under `onnxruntime-node`, so there is a local CPU tester that runs the real model
and shows the output. This is the ONLY place RMBG-2.0 can be evaluated; it is deliberately
outside `src/` and must stay there.

| File | Role |
| --- | --- |
| `scripts/rmbg2.mjs` | CLI only: args, help, entry point |
| `scripts/rmbg2.config.mjs` | paths, checkpoints, execution providers, preprocessing constants, token |
| `scripts/rmbg2-image.mjs` | ALL `sharp` usage: inputs, preprocess, mask stats, previews |
| `scripts/rmbg2-session.mjs` | the ONNX session + the batch loop |
| `scripts/rmbg2-report.mjs` | the standalone HTML report |
| `scripts/rmbg2-serve.mjs` | the `--serve` newline-JSON protocol |
| `scripts/rmbg2-bench.mjs` | provider benchmark, with a mask-correctness check |
| `scripts/rmbg2-vite-plugin.mjs` | dev-only `/rmbg2` routes (page, list, providers, upload, delete, clear, preload, run, report, out/, input/); spawns the CLI as a **child process** |
| `scripts/rmbg2.page.html` | the lab page — a GUI laid out so the controls fit one screen, with results below the fold |
| `rmbg2-lab/inputs/` | the **CLI's** working folder |
| `rmbg2-lab/uploads/` | the **GUI's** folder; emptied on page load, never listed by the CLI |

Those five `rmbg2-*` modules are one file's job split at real seams, because the single
runner crossed the repo's 800-line budget in `context:check`. Nothing in `rmbg2-image.mjs`
knows about ONNX; nothing in `rmbg2-serve.mjs` knows about sharp. Keep that property if you
touch them, and only `rmbg2.mjs` should run work at import time.

`npm run rmbg2` runs a batch; `npm run rmbg2:lab` opens the GUI at
`http://localhost:5173/rmbg2` (or reach it during any `npm run dev`), where you can drop in
images, pick which to process, and choose checkpoint + provider. Two Windows launchers wrap
these: `start-rmbg2.bat` (GUI) and `start-rmbg2-cmd.bat` (terminal, two-step: it shows the
input folder, waits for Enter, then confirms the image count before running). `npm run
rmbg2:bench` compares providers and flags a wrong mask; `npm run rmbg2:preload` fetches weights
deliberately so the first run does not stall. `rmbg2-lab/README.md` has setup and troubleshooting.

Uploads go through `/rmbg2/upload?name=<file>` as a **raw body** (not multipart, which would
need a dependency). The name is reduced to a basename, sanitised, and extension-whitelisted,
and the body is size-capped — `npm run rmbg2:apitest` (needs the dev server up) asserts that
`../evil.png` lands as `evil.png` inside `uploads/`, `.exe` is refused with 400, `/input/`
refuses traversal, and the CLI's `inputs/` folder is byte-for-byte unchanged. Keep that
property if you touch the route.
- **The GUI and the CLI use DIFFERENT folders, and that separation is load-bearing.** The GUI
  works in `uploads/` (emptied on every page load, so nothing accumulates and a run only covers
  what you just uploaded); the CLI works in `inputs/`. `handleRun` builds absolute paths from
  `uploads/` itself rather than trusting the request, and it REFUSES an empty selection — an
  empty list would otherwise fall through to the runner's `listInputs([])`, which means
  "everything in `inputs/`" and would run a batch staged for the terminal.
- **`EventSource` reconnects on its own, so a one-shot SSE endpoint must be idempotent.**
  `/rmbg2/run` streams progress and ends the response when the result lands — at which point the
  browser treats it as a dropped connection and re-opens the SAME url a few seconds later. That
  url starts a run, so a single click re-ran the same images forever (observed: one extra run
  every ~9 s, rewriting `outputs/` each time). Two fixes, both needed:
  1. the page calls `stream.close()` on completion — merely dropping the reference (the old
     `stream = null`) does NOT stop it, which is what made the loop unstoppable;
  2. the page sends one `runId` per click and `handleRun` remembers it, so a reconnect REPLAYS
     the stored result instead of re-running — the net for a tab reloaded mid-run.
  `npm run rmbg2:reruntest` (needs the dev server) proves requests 2 and 3 replay and start no
  batch, while a fresh `runId` still runs for real.

Things that are easy to get wrong here:

- **The child process is not a style choice.** `onnxruntime-node` cannot live in Vite's module
  graph (Vite tries to pre-bundle its native bindings), and a 1024×1024 run has a multi-GB
  working set that must not be able to take the dev server down with it.
- **Dev-only, three ways.** `apply: 'serve'` in the plugin, so `npm run build` never sees it;
  the page is not an input to the Rollup build, so it is absent from `dist/`; and every request
  is rejected unless `remoteAddress` is loopback. Keep all three.
- **Preprocessing is pinned to the reference implementation** (1024×1024 `fit: 'fill'`
  stretch, BGR, ImageNet mean/std, sigmoid, mask resized back to source). The 1024×1024 resize
  is the same figure that made the *browser* OOM — on native Node it is unremarkable, because
  the 32-bit WASM heap was the constraint, not the graph.
- **`executionProviders: ['cpu']` by default.** Not a preference: this is a correctness
  reviewer, and a mask is only comparable across runs if the provider is held constant.
- **The GPU advice you will find online is wrong for this package, twice over.** Both parts
  were measured (RTX 4050 Laptop, 6 GB, 2026-09-25), not assumed:
  1. **There is no CUDA provider.** `listSupportedBackends()` returns only `cpu`, `dml`,
     `webgpu`. `--provider=cuda` cannot work; no setting fixes it.
  2. **DirectML was slower and produced an empty mask.** Session load 10.9 s vs 23.4 s (dml
     wins), inference **85.9 s vs 19.6 s** (dml loses 4x), `meanAlpha` **0.0000 vs 0.2695**
     (dml returns a blank mask). `npm run rmbg2:bench` reproduces this and checks the mask
     VALUE, not just the clock — a timing-only benchmark would have called it a win.
  Keep CPU the default. The `dml` option stays in the CLI and `rmbg2:bench` only because hardware
  varies — it is NOT offered in the GUI, because a dropdown of a broken choice is a way to get
  bad results rather than a feature. The GUI's model panel explains the checkpoint instead.
- **`Run All Model` in the GUI runs every checkpoint sequentially.** Not parallel: the runner holds
  one warm session and switching checkpoint drops it, so overlapping runs would fight over a
  multi-GB model. Each result carries its `checkpoint`, which is what lets the cards be labelled —
  without it several cards for one image are indistinguishable.
- **Releasing a session must call `session.release()`, not just null the reference.** An ONNX
  InferenceSession holds a large native allocation — measured **8,543 MB** for q4f16 at 1024×1024,
  dropping to **124 MB** after release (99% returned) — which is only given back on `release()` or
  process exit. Nulling alone leaves it to the GC, so cycling checkpoints accumulates memory.
  `Run All Model` passes `release=1` so each model is closed after its images finish and before the
  next loads; a plain Run does not, because a warm session is what makes a repeat run fast.
  `npm run rmbg2:releasetest` guards this.
- **Anything emitted AFTER the result is lost, and writing after `response.end()` is unsafe.** The
  plugin ends the SSE response the moment it sees the result, so the release log had to move
  *before* the result send. If you add a step that reports progress at the end of a run, emit it
  before the result.
- **Editing the runner modules needs a dev-server restart.** `scripts/rmbg2.mjs --serve` runs as a
  long-lived CHILD process, so changes to `rmbg2-serve.mjs` / `rmbg2-session.mjs` do not reach an
  already-spawned child. Symptom: code changes appear to have no effect while the old child keeps
  serving. (Also check the port — a stale dev server on 5173 silently serves an old plugin, and
  Vite will quietly start on 5174 instead.)
- **The checkpoint is gated** (`gated: "auto"`). No anonymous download path exists, so a token
  is mandatory. `.env` is gitignored; `HF_TOKEN` is read from there, or from the environment.
- **`onnxruntime-node` and `sharp` are intentionally NOT in `package.json`.** They are declared
  dependencies only in the sense that `package.json` lists them; `.github/workflows` and any
  clone rely on the documented install step, which keeps the app's
  no-server-dependency posture honest. If you find them missing, the README says what to run.
- **Resolve the token BEFORE any branch that can download.** This bit once: `resolveToken()` sat
  only on the batch path of `main()`, *after* the `--serve` and `--preload` early returns, so both
  built their session with an empty token and sent `Authorization: Bearer ` to Hugging Face. A
  CACHED checkpoint still worked (no request is made), so it only surfaced when a fresh checkpoint
  was requested - as a bare `HTTP 401`, which reads as "your token is wrong" when it is fine.
  `main()` now resolves it once, after `--help` / `--check-providers` / `--list` (which touch no
  network and must not need a token) and before everything else. `npm run rmbg2:tokentest` guards
  the plumbing via a `hasToken` boolean on the `--serve` handshake - a boolean, never the value.
- **Weights are cached with a `.meta.json` byte-count sidecar.** A finished download records its
  exact size and every run re-checks it, so a truncated file is treated as absent and refetched
  rather than surfacing much later as `protobuf parsing failed`. A cache with no sidecar (written
  by an older version) is adopted and recorded, not thrown away.
- Measured checkpoint sizes from the live repo: `model_q4f16.onnx` **223 MB**,
  `model_fp16.onnx` **490 MB**, `model.onnx` **977 MB**.
- **Verified working end-to-end** (2026-09-25, laptop CPU): session load ~26 s, then
  ~16-19 s per image. The correctness anchor is `sample-01-circle.png` — a disc of radius 300
  in 1024², so `pi*300^2/1024^2` = **26.96%** of the frame. The model returns **26.9%**, which
  validates resize, BGR order, ImageNet normalisation, sigmoid and resize-back in one number.
  Keep that sample: if a refactor breaks any of those steps, this figure moves.
- **Never judge a mask by one percentage.** `meanAlpha` and `coverage` (share of pixels at
  alpha ≥ 0.5) are different numbers and only agree when the mask saturates. `sample-02` is the
  proof: its mask stays in 0.50–0.73, so the same 14.4%-foreground segmentation reads 53% mean
  alpha and **100%** coverage. Both are printed, plus a `separation` verdict
  (strong *reaches* 0 and 1 / weak *never leaves* the middle). A weak mask means the model is
  unsure; look at the `-mask.png` rather than trusting the number.
- **sharp promotes a 1-channel raw buffer to 3 channels on output — read the channel count,
  never assume it.** This bit `composeCutout` and the symptom was invisible in the report: the
  mask PNG was perfect (written by a separate path) and the RGB survived, so only the ALPHA was
  wrong. Indexing a 3-channel buffer as if it were 1 consumes just the first third of the mask,
  leaving the rest unread — the cutout came out mostly transparent while every number stayed
  green. Measured: `sample-01` read 12.8% opaque instead of 26.9%, and the real photo lost the
  subject entirely (correct RGB, alpha 0). Fixed by `toColourspace('b-w')` **plus** indexing with
  `maskInfo.channels`. **Verify a cutout by its alpha coverage, not by eye** — the check is
  `opaque% ≈ mask coverage%`; a mismatch means this bug. The samples are the regression guard.

## Non-obvious constraints — read before editing

1. **Canvas objects are deliberately NOT reactive.** `maskCanvas`, `maskCtx`,
   `originalCanvas` and `originalCtx` are module-level `let` bindings, outside
   Vue's reactivity system. Never wrap a canvas, context, or `ImageData` in
   `ref()` — the resulting Proxy breaks `getImageData`/`putImageData` identity
   and destroys performance. Use `shallowRef` or plain module state.

2. **The `localStorage` key strings live in `core/storageKeys.ts`.** They used to
   be magic strings repeated in four files; that is fixed, so **import
   `STORAGE_KEYS` rather than typing a literal**: `purecut_hf_token`,
   `purecut_font_size`, `purecut_cached_<modelId>`, `purecut_prompt_model_change`.
   The one copy that must stay duplicated is in `index.html`, which runs before
   any module loads and so cannot import — do not "fix" it. Note the reads and
   writes are still split across `App.vue`, `SettingsModal.vue`, `aiEngine.js`
   and `useModelCache.ts`; that is a separate, harmless shape (see known issue 4),
   but the key names themselves have a single source of truth.

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
- Respect the size budget: no file over 800 lines (`maxFileLines` in
  `scripts/context-report.mjs`), except `src/App.vue`, which carries its own
  600-line budget (`targetAppVueLines`) and is the only file the budget excuses.
  Run `npm run context:report` before and after a large change; `npm run
  context:check` is the gate and should exit 0.
  The limit was raised from 450 by user request: it kept flagging files that were
  over only because of explanatory comments and unavoidable scoped CSS, so each
  fix was churn rather than improvement. 800 still catches a file that has
  genuinely outgrown its single job.

## Known issues — report, do not silently fix

1. `toggleSubjectVisibility` / `eraseSubject` erase a **bounding box**, not the
   per-component mask pixels, so erasing one subject also wipes overlapping
   pixels of its neighbours. The code comment acknowledges this.
2. `ShowcaseModal.vue` no longer declares `open-in-studio` - it was declared and
   never emitted, and was removed rather than wired up. The feature it hinted at
   (jumping from a showcase cutout into the studio) is still unimplemented.
3. `@imgly/background-removal` is declared as a dependency but never imported   (it appears only as a display string in `InfoModal.vue`).
4. `SettingsModal.vue` writes `localStorage` directly, bypassing `App.vue`.
5. `App.vue` contains no `@media` queries — there is no responsive layout.
6. The contour-outline overlay is unreachable. `showOutline` is only ever written
   by `toggleOutline()`, and nothing calls `toggleOutline` — not the template, not
   `useKeyboardShortcuts`. So the `#outlineCanvas` layer never becomes visible and
   `updateOutlineOverlay` / `stopOutlineAnimation` never run. Found while
   extracting `useOutlineOverlay.ts`; the code was moved verbatim rather than
   deleted, because dropping a feature is a product decision.
7. The three power-user sliders call `recompositeCanvas` with the raw `input`
   event, so it arrives as the `immediateBlob` argument, which is truthy — every
   slider tick runs the full-resolution pixel loop synchronously instead of
   taking the ~120 ms debounce. The de-fringe toggle beside them is called with
   no arguments and does debounce. Pre-existing; preserved deliberately during the
   extraction (see the note in `TuningSidebar.vue`), not fixed.
8. `src/App.vue` (561 lines) carries its own 600-line `targetAppVueLines` rather
   than the general `maxFileLines`. The user has explicitly forgiven it: shrinking
   it further would mean either compacting the component tags' attribute lists
   onto single lines (which keeps the token count and only games the metric) or
   hoisting shared state into a module (forbidden by constraint 7). Everything the
   budget covers fits, so `npm run context:check` exits 0. Splitting the two
   former offenders took three commits: `ShowcaseModal.vue` 1000 → 396 plus
   `ShowcaseSliderStage` / `ShowcaseDiagnosis` / `ShowcaseGallery`, and
   `InfoModal.vue` 789 → 279 plus four `Info*Tab` components. `maxFileLines` is
   now 800 (raised from 450 by user request), so the general budget no longer
   flags a file that is long only through comments and scoped CSS.

## Test layout

| Path | Runner | Scope |
| --- | --- | --- |
| `tests/unit/*.test.ts` | `npm test` (vitest) | `src/core/*.ts`: pure functions, no DOM |
| `tests/e2e/regression.mjs` | `npm run test:regression` | orchestrator: builds the harness, runs the areas |
| `tests/e2e/lib/constants.mjs` | — | env defaults, benign-noise allowlist, fixtures |
| `tests/e2e/lib/harness.mjs` | — | `Harness`, `check`/`skip`, screenshots, reporting |
| `tests/e2e/checks/*.mjs` | — | one area each: landing, modals, viewport, studio |
| `tests/fixtures/` | — | input image for the e2e run |

The budget covers `tests/` as well as `src/` and `scripts/`, because those files
are just as much part of the context an agent has to read.
