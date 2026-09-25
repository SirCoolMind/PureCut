# RMBG-2.0 local lab

A Node-side CPU tester for `briaai/RMBG-2.0`, which **cannot run in any browser
tab** — see *Why* below.

```
npm run rmbg2              # process every image in rmbg2-lab/inputs/
npm run rmbg2:help         # all flags
npm run rmbg2 -- photo.jpg # one image (substring match)
npm run rmbg2 -- --list    # list inputs, download nothing
npm run rmbg2:preload      # download the checkpoint(s), run no inference
npm run rmbg2:bench        # compare execution providers with a correctness check
npm run rmbg2:tokentest    # token plumbing guard (no download, no token needed)
npm run rmbg2:apitest      # upload/delete/traversal checks (needs the dev server)
npm run rmbg2:reruntest    # a reconnecting stream must not re-run the job
npm run rmbg2:releasetest  # Run All Model closes each model before the next loads
```

Everything is local: `rmbg2-lab/` is gitignored, and the token only ever goes to
`huggingface.co`.

## Setup

### Option A — one-click (Windows)

There are two launchers, and both do the same prerequisite checks (Node, app deps, the two
native lab deps, the Hugging Face token):

| Launcher | What it does |
| --- | --- |
| `start-rmbg2.bat` | Opens the **GUI** at `http://localhost:5173/rmbg2`. Drop in images, tick which to run, pick checkpoint + provider. |
| `start-rmbg2-cmd.bat` | **Terminal, two-step.** Shows you the input folder and opens it, waits for Enter, then prints the image count and asks you to confirm before running. |

Both print what to do when a run fails.

### Pre-downloading weights

The weights are cached in `rmbg2-lab/.cache/` and reused, so you only pay the download once.
To get it out of the way deliberately (rather than stalling your first run):

```
npm run rmbg2:preload       # just the default checkpoint
npm run rmbg2:preload:all   # all three
```

A finished download writes a `.meta.json` sidecar recording its exact byte count, and that is
re-checked on every run. A truncated file is therefore treated as absent and refetched, instead
of failing much later as `protobuf parsing failed` (which reads like a corrupt checkpoint rather
than an interrupted download).

### Option B — manual

1. **Accept the licence** at https://huggingface.co/briaai/RMBG-2.0 (the repo is
   `gated: "auto"` — non-commercial / personal / academy / non-profit).
2. **Create a READ token** at https://huggingface.co/settings/tokens.
3. **Put it in `.env`** at the repo root (gitignored):

   ```
   HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxx
   ```

   `$env:HF_TOKEN` also works and takes precedence.
4. **Install the Node-only dependencies** — deliberately *not* auto-installed by
   `npm install`, so the app keeps its zero-server-dependency posture:

   ```
   npm install -D onnxruntime-node --cpu
   npm install -D sharp
   ```

5. **Run it.** An empty `rmbg2-lab/inputs/` gets four synthetic samples, so the
   first run works before you've added anything.

> The launcher and the manual steps are equivalent — the launcher only automates
> steps 1–5 and the empty-folder case. Neither is required to read the code.

## Option B — the dev-only page (point and click)

```
npm run rmbg2:lab     # starts the dev server and opens http://localhost:5173/rmbg2
```

or during a normal `npm run dev`, open `http://localhost:5173/rmbg2`.
This page is a **GUI front end**, laid out so that everything you need to operate it fits the
first screen (no scrolling to find Run):

- **Left — Images.** Drop, click, or paste (Ctrl+V). Tick which to run; `×` removes one.
- **Right — Model & hardware.** A checkpoint picker, a panel explaining the selected model
  (architecture, working resolution, size, cached state), **Preload {model}** / **Preload All
  Model**, then a large green **Run**, an amber **Run All Model**, and **Open full-size report**.
  The progress log sits underneath.
- **Scroll down — Output.** The side-by-side comparison (original / cutout / mask) plus timings,
  one card per image, labelled with the checkpoint that produced it.

**There is no execution-provider picker.** DirectML is the only GPU provider this runtime bundles,
and measurement showed it both slower on this graph and returning an empty mask, so offering it as
a dropdown would only be a way to get bad results. Every run uses CPU. The provider plumbing is
still there for the CLI (`--provider=dml`) and for `npm run rmbg2:bench`, which is how that finding
stays reproducible.

**Run All Model** runs the selected images through *every* checkpoint in turn, so you can compare
them. For each model it loads the checkpoint, runs every selected image, then **closes the model
before loading the next one** — only one model is ever resident, and the memory goes back between
models rather than at the very end. That is worth a lot: q4f16 at 1024×1024 measured **8,543 MB**
resident while loaded and **124 MB** after being closed, so without it a three-model cycle would
accumulate every model at once. It is sequential for the same reason, so expect a session load per
model.

On the sample photo all three checkpoints agreed (17.3% coverage, strong separation); the
quantised q4f16 was the fastest.

**It runs only what you upload, and keeps nothing.** Uploads go to `rmbg2-lab/uploads/`, which the
page empties on load, so each visit starts clean and nothing accumulates. That folder is
deliberately separate from `rmbg2-lab/inputs/` (the CLI's working folder): the GUI never lists or
clears that one, so a batch you staged for the terminal is safe.

It is dev-only on three axes: registered with `apply: 'serve'`, absent from `dist/`, and every
request is rejected unless it came from loopback. Uploads are size-capped, the filename is
sanitised to a basename, and only image extensions are accepted.

## Choosing a checkpoint

| Checkpoint | Size | Notes |
| --- | --- | --- |
| `onnx/model_q4f16.onnx` | 223 MB | Default. 4-bit quantised; the sensible choice. |
| `onnx/model_fp16.onnx` | 490 MB | Half precision. Bigger download, marginally cleaner edges. |
| `onnx/model.onnx` | 977 MB | The uncompressed export. Use to sanity-check a quantisation. |

Switching checkpoint reloads the session (minutes), so the page says so rather than appearing
to hang.

## GPU / execution providers

The usual advice is "use the CUDA provider". For `onnxruntime-node` that is wrong twice, and
both parts were measured on this machine rather than assumed:

**1. There is no CUDA provider in the package.** `listSupportedBackends()` returns only
`cpu`, `dml` and `webgpu`. `--provider=cuda` fails at session creation, and no setting fixes
it. CUDA needs a different build (e.g. `onnxruntime-node-gpu`) plus matching CUDA/cuDNN.

**2. DirectML was slower AND wrong.** Same checkpoint, same image, same code path
(RTX 4050 Laptop 6 GB, 2026-09-25):

| Provider | Session load | Inference | meanAlpha | Verdict |
| --- | --- | --- | --- | --- |
| `cpu` | 23.4 s | **19.6 s** | **0.2695** | correct |
| `dml` | 10.9 s | 85.9 s | **0.0000** | **empty mask** |

DirectML created its session faster, then ran 4x slower and returned a blank mask. That is why
the lab defaults to CPU, and why the benchmark checks the mask value rather than only the
clock — a timing-only benchmark would have called this a win.

```
npm run rmbg2:bench                  # cpu vs dml, with a correctness check
npm run rmbg2 -- --check-providers   # what this install can actually run
npm run rmbg2 -- --provider=dml      # try it yourself
```

The benchmark compares each provider's mask against the known answer
($\pi \cdot 300^2 / 1024^2 \approx 0.2696$) and labels an empty mask as a failure. If your
hardware is different from the one above, that command is how you find out — do not take the
table as universal.

## What you get

```
rmbg2-lab/
  inputs/                     the CLI's working folder (the GUI does not touch it)
  uploads/                    images uploaded through the GUI (emptied on each page load)
  outputs/<name>-cutout.png   transparent cutout, full source resolution
  outputs/<name>-mask.png     raw 1024x1024 alpha mask
  outputs/report.html         self-contained side-by-side report
  .cache/<model>/<file>.onnx  downloaded weights (several hundred MB)
```

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `HTTP 401` / `403` on download | Licence not accepted, or token from a different account |
| `protobuf parsing failed` | Truncated download — compare bytes against the repo's reported size |
| `onnxruntime-node is not installed` | Run the install step above |
| Very slow / machine swaps | Expected at 1024² on CPU. Try `--checkpoint=onnx/model_q4f16.onnx` |
| `No Hugging Face token found` | The repo is gated, so there is no anonymous path |
| Cutout looks blank but the mask looks right | Alpha/compositing bug — see "Correctness anchor" |
| `--provider=cuda` fails | Expected: `onnxruntime-node` bundles no CUDA provider |

### "HTTP 401" even though your token is good

Not this project's problem any more, but worth knowing because it was a nasty one. The token used
to be resolved only on the batch path, *after* the `--serve` and `--preload` early returns, so
those built their session with an **empty** token. A cached checkpoint still worked (no request),
so it only surfaced when a fresh checkpoint was requested. `npm run rmbg2:tokentest` guards it now.

If you still see a 401: confirm the licence is accepted for the **same account** the token
belongs to, and that `.env` has `HF_TOKEN=` on its own line with no quotes or trailing text.

## Why Node and not the browser

`briaai/RMBG-2.0` fails at ORT **session creation** under `onnxruntime-web`:

```
[ShapeInferenceError] Mismatch between number of inferred and declared
dimensions. inferred=4 declared=6
```

The WASM build hardcodes strict shape inference, so `graphOptimizationLevel:
'disabled'` and `strict_shape_type_inference: '0'` do not help. It is a malformed
shape declaration in the ONNX export — every mirror is byte-identical by LFS hash
— and it needs a PyTorch re-export to fix. **The identical bytes create a session
happily under `onnxruntime-node`.** So the model is testable on your laptop, just
not in a page. Do not try to port this into `src/aiEngine.js`.

## Expected numbers

Rough CPU figures, not guarantees — a 1024×1024 graph with a several-GB working
set. It is slow and it will use a lot of RAM. That is the cost of running the
full-size model rather than the 512px BiRefNet the studio ships.

- First run: download (hundreds of MB) + session load (minutes).
- Per image: inference dominates; pre/post-processing are milliseconds.
- The report prints the real timings per image — trust those over any estimate.

## Preprocessing (matches BRIA's reference)

`transforms.Resize((1024, 1024))` → `ToTensor()` → `Normalize([0.485,0.456,0.406],
[0.229,0.224,0.225])`, with `fit: 'fill'` (stretch, not letterbox, exactly like
the reference) and channel order swapped to BGR to match the ONNX graph. The
prediction is sigmoided, then the mask is resized back to the source size.

## Layout

| File | Role |
| --- | --- |
| `scripts/rmbg2.mjs` | CLI: args, help, entry point |
| `scripts/rmbg2.config.mjs` | paths, checkpoints, providers, preprocessing constants, token |
| `scripts/rmbg2-image.mjs` | all `sharp` usage: inputs, preprocess, mask stats, previews |
| `scripts/rmbg2-session.mjs` | the ONNX session + the batch loop |
| `scripts/rmbg2-report.mjs` | the standalone HTML report |
| `scripts/rmbg2-serve.mjs` | the `--serve` JSON protocol |
| `scripts/rmbg2-bench.mjs` | provider benchmark + mask correctness check |
| `scripts/rmbg2-apitest.mjs` | upload/delete/traversal checks (needs the dev server) |
| `scripts/rmbg2-tokentest.mjs` | token-plumbing regression guard |
| `scripts/rmbg2-reruntest.mjs` | proves a reconnecting stream cannot re-run a job |
| `scripts/rmbg2-releasetest.mjs` | proves each model is closed between models |
| `scripts/rmbg2-vite-plugin.mjs` | dev-only `/rmbg2` routes (page, list, upload, delete, providers, run, report) |
| `scripts/rmbg2.page.html` | the lab page |

## Reading the numbers

Two mask figures are reported and they are **not** interchangeable:

- **coverage** — share of pixels the mask calls subject (alpha ≥ 0.5). Use this to judge how
  much of the frame was kept.
- **mean alpha** — the average mask value. Differs from coverage whenever the mask does not
  saturate, i.e. when the model is unsure.

The **separation** verdict says which case you are in: `strong` means the mask reaches near 0
and near 1 (a confident decision), `weak` means it only ever sits mid-range. A mask can be
geometrically correct *and* weak-separated — the synthetic silhouette sample is exactly that
(the right 14% of pixels, but all at alpha 0.5–0.73). When a mask reads `weak`, open
`outputs/<name>-mask.png` and look at it instead of trusting the percentage.

### Correctness anchor

`sample-01-circle.png` is a disc of radius 300 in a 1024² frame, so the true subject area is
$\pi \cdot 300^2 / 1024^2 = 26.96\%$, and the model returns **26.9%**. That single figure
validates the whole chain at once — resize, BGR channel order, ImageNet normalisation, sigmoid
and resize-back. If you change any of those, this number should move; if it moves and you did
not change them, you have a bug.

**Check the cutout's alpha, not just the mask.** For `sample-01`, the cutout should report
≈26.9% of pixels opaque. It is worth stating because a real bug hid here: sharp promotes a
1-channel raw buffer to 3 channels on output, and compositing that indexed it as single-channel
consumed only the first third of the mask. The mask PNG stayed perfect and the RGB survived, so
only the alpha was wrong — the cutout was mostly transparent while every reported number looked
correct (sample-01 measured 12.8% instead of 26.9%). If `opaque% ≠ coverage%`, suspect that
path first.