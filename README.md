# PureCut — In-Browser AI Background Remover Studio

PureCut is a private, client-side AI tool for removing image backgrounds directly in the web browser. It is inspired by tools like BG Poof, but designed with a custom modern dark-slate studio theme, zero external server dependencies, and full client-side execution.

---

## 🌟 Key Features

- **100% Private & In-Browser**: Images never leave the device. No data is sent to any server or API.
- **Curated Model Catalogue**:
  - BRIA RMBG-1.4 is the recommended default for difficult real-world photos: fine hair, clothing that camouflages with the background, complex poses, and reflections.
  - Additional browser-safe models cover salient-object, portrait, and high-quality CPU-only cutouts.
  - Models with unreliable output or unsuitable browser execution are documented below instead of being offered in the picker.
- **Interactive Magic Brush (Erase & Restore Tool)**:
  - 🧹 **Erase Brush**: Allows users to manually swipe away stray reflections, panel seams, or handrails in seconds.
  - ✨ **Restore Brush**: Paint back any foreground detail that the AI might have accidentally clipped.
  - 🎚️ **Adjustable Brush Radius**: From 8px to 100px.
  - ↩️ **Multi-level Undo**: Easily undo brush strokes (`Undo` button).
  - 🔄 **Reset**: Return to the raw AI mask with 1 click.
- **Model Cache Status & Storage Manager**:
  - Live indicator in navbar: shows whether model is cached locally (`🟢 Cached & Ready`) or not yet downloaded (`⚡ Not Downloaded`).
  - **Live Storage Meter**: Shows real-time disk/browser storage used by cached models (e.g. `44.8 MB`).
  - **1-Click Clear Cache**: Purges all on-device cached AI weights from `CacheStorage` and `IndexedDB` with instant UI status refresh.
  - Pre-download button: allows users to download model weights ahead of time.
- **In-App Version, Changelog & Roadmap Dialog**:
  - Clickable version badge in navbar opening a dedicated popup modal.
  - Tabs for **Changelog**, **Roadmap**, **About**, and dedicated **Storage & Cache** inspector.
- **Tinkering & Settings (Standard vs Power User)**:
  - **Standard Mode**: One-click quick presets (*Balanced*, *Fine Hair & Fur*, *Clean Product*, *Deep Background*).
  - **Power User Mode**: Real-time canvas sliders (Alpha Cutoff Sensitivity, Edge Feather Softness, Edge Shift Trim, De-fringe Color Spill).
  - **Hardware Accelerator**: WebGPU (Hardware GPU) vs CPU (WASM SIMD Multi-threaded).
- **Live Hardware Telemetry & Resource Monitor**:
  - Measures execution duration in seconds and milliseconds.
  - Measures RAM heap allocation delta and total memory during inference.
  - Tracks pixel processing throughput ($\text{Megapixels/sec}$).
  - Displays active CPU logical cores and acceleration engine.
- **Easy Uploads**:
  - Drag-and-drop images anywhere into the upload card.
  - File picker dialog.
  - **Clipboard Paste**: Press `Ctrl + V` (or `⌘ + V` on Mac) to paste images directly.
- **Interactive Split Comparison Slider**: Seamlessly inspect the original image vs. the cutout with a custom handle.
- **Backdrop Switcher**: Preview the transparent cutout against Grid, White, Dark, or Color Gradient.
- **High-Resolution PNG Download & Clipboard Copy**: Full-resolution PNG download and 1-click clipboard export.

---

## 🚀 How to Run

### Option 1: One-Click Launcher (Windows)
Double-click **`start.bat`** in this directory.
- It will verify Node.js is installed.
- It automatically runs `npm install` if `node_modules` is missing.
- It launches the Vite development server and **opens your browser automatically** at `http://localhost:5173`.

### Windows native RMBG-2.0 lab (not the web app)

**RMBG-2.0 is too heavy and incompatible with browser processing.** Its published ONNX graph fails
to create a browser session and its fixed 1024×1024 runtime has a multi-GB working set. It is
therefore available only as a local Windows/Node lab, never in the deployed web application.

Double-click **[`start-rmbg2.bat`](start-rmbg2.bat)** to install the Node-only dependencies when
needed and open the local lab at `http://localhost:5173/rmbg2`. The launcher checks that a Hugging
Face token is configured before starting; it gives exact setup instructions if one is missing.

RMBG-2.0 is a gated Hugging Face repository. Before its first download:

1. Accept the licence at <https://huggingface.co/briaai/RMBG-2.0>.
2. Create a **READ** token at <https://huggingface.co/settings/tokens>.
3. Create a `.env` file beside `start-rmbg2.bat` containing `HF_TOKEN=hf_your_token_here`.

The `.env` file is gitignored. The launcher requires the token before it starts, even if weights
are already cached; the token is sent only to `huggingface.co` when gated model weights need to
be downloaded. See
[`rmbg2-lab/README.md`](rmbg2-lab/README.md) for hardware limits and troubleshooting.

### Option 2: Command Line
```bash
# 1. Install dependencies (first time only)
npm install

# 2. Start the development server
npm run dev

# 3. Build for production (optional)
npm run build
```

### Option 3: Deploy to GitHub Pages (Automated)
This project is pre-configured with GitHub Actions (`.github/workflows/deploy.yml`):
1. Push this code to your GitHub repository on branch `main`.
2. In your GitHub repository, go to **Settings** > **Pages**.
3. Under **Build and deployment** > **Source**, choose **GitHub Actions**.
4. The workflow will automatically build and deploy PureCut to your GitHub Pages URL!

---

## 🧠 Models and execution

PureCut runs entirely on the local device. The browser studio uses
[`@huggingface/transformers`](https://huggingface.co/docs/transformers.js) and ONNX Runtime Web;
the optional RMBG-2.0 lab uses native `onnxruntime-node` locally. Images are not uploaded to an
application server.

### Browser studio — active models

These are the models shown in the studio model pickers. Weights download from Hugging Face on
first use and are cached in browser storage for later use.

| Model | Download | Execution | Intended use |
| --- | ---: | --- | --- |
| `briaai/RMBG-1.4` | 43 MB | WebGPU when available; WASM fallback | **Recommended default.** Difficult clothing, hair, reflections, and complex poses. |
| `onnx-community/ISNet-ONNX` | 42 MB | WebGPU when available; WASM fallback | High-precision salient-object cutouts. |
| `Xenova/modnet` | 20 MB | WebGPU when available; WASM fallback | Fast portrait matting. |
| `onnx-community/BiRefNet_512x512-ONNX` | 473 MB | CPU WASM only | Highest-quality browser option; slow and a large download. |

The browser selects WebGPU where the model graph supports it and falls back to multi-threaded
WASM where needed. Actual timing depends on the device, image, browser memory budget, and whether
the model is already cached.

### Browser studio — retained but inactive models

The following U²-Net entries remain in the internal catalogue for cache cleanup and future
evaluation, but are **hidden from all model pickers**. They use `MaxPool` with `ceil_mode`, which
ONNX Runtime WebGPU cannot execute; they must use CPU WASM. They are not currently part of the
supported browser model set.

| Model | Download | Status |
| --- | ---: | --- |
| `skillsafe-ai/u2netp` | 4.4 MB | Inactive; retained for future evaluation. |
| `skillsafe-ai/u2net` | 176 MB | Inactive; retained for future evaluation. |
| `skillsafe-ai/u2net-human-seg` | 176 MB | Inactive; retained for future evaluation. |

### Tested but unsuitable browser models

These models were evaluated and are deliberately not selectable.

| Model | Decision | Reason |
| --- | --- | --- |
| `skillsafe-ai/isnet-general-use` | Removed | Output was unreliable during testing. Its 1024px graph also requires CPU WASM because WebGPU does not support its `ceil_mode` MaxPool shape computation. |
| `briaai/RMBG-2.0` | Not browser-compatible | The published ONNX export fails browser session creation with a shape-inference mismatch. It needs a new PyTorch/ONNX export. |
| `onnx-community/BiRefNet-ONNX` | Not browser-compatible | The preprocessor forces 1024×1024 inference, exhausting the browser's WASM memory heap. |
| `onnx-community/BiRefNet_lite-ONNX` | Not browser-compatible | Despite its smaller weights, it also forces 1024×1024 inference and exhausts the browser WASM heap. |

### Local RMBG-2.0 lab — native Node models

`briaai/RMBG-2.0` can be tested locally by double-clicking
[`start-rmbg2.bat`](start-rmbg2.bat), through the Node-only lab at `/rmbg2`, or with
`npm run rmbg2`; it is not included in the deployed browser application. All three checkpoints
are the same 1024×1024 model and require substantial native RAM while a session is loaded.

| Checkpoint | Download | Estimated peak RAM | Minimum free RAM to start | Guidance |
| --- | ---: | ---: | ---: | --- |
| `onnx/model_q4f16.onnx` | 223 MB | ~9 GB | 12 GB | Default and recommended native option. |
| `onnx/model_fp16.onnx` | 490 MB | ~14 GB | 20 GB | Diagnostic/reference option; use only on a machine with ample available memory. |
| `onnx/model.onnx` | 977 MB | ~16 GB | 24 GB | fp32 reference option; slowest and most memory-intensive. |

The lab rejects a run before loading ONNX when free physical RAM is below the checkpoint's
threshold. This intentionally prevents RMBG-2.0 runs on 4 GB and 8 GB machines. Even on 16 GB,
only q4f16 may be viable after closing memory-heavy applications. GUI runs release their native
session after completion; this returns the multi-GB runtime allocation instead of retaining it
while idle. See [`rmbg2-lab/README.md`](rmbg2-lab/README.md) for setup and troubleshooting.

---

## 📁 Project Structure

```
PureCut/
├── index.html              # HTML shell & app entry point
├── package.json            # Project dependencies & scripts
├── vite.config.js          # Vite build configuration (opens browser on port 5173)
├── start.bat               # 1-click Windows launcher script
├── README.md               # Project documentation (this file)
└── src/
    ├── main.js             # Vue 3 application mount
    └── App.vue             # Core component: UI, dropzone, AI inference, slider, & controls
```

---

## 🛠️ Tech Stack

- **Framework**: [Vue 3](https://vuejs.org/) (Composition API with `<script setup>`)
- **Bundler / Dev Server**: [Vite](https://vitejs.dev/)
- **AI Background Removal**: [`@imgly/background-removal`](https://github.com/imgly/background-removal-js)
- **Icon Set**: [`lucide-vue-next`](https://lucide.dev/)

---

## 🗺️ Roadmap

### Done
- [x] Selection tools: subject detection, lasso, rectangle, and magic wand.
- [x] Zoom and pan workspace.
- [x] Curated browser model catalogue with safe WASM fallback.
- [x] Local Node RMBG-2.0 lab with RAM admission safeguards and live resource monitoring.

### Planned
- [ ] Brush hardness / softness and pressure-sensitive stylus support.
- [ ] Visual undo history and named export presets.
- [ ] Custom background replacement and multi-layer compositing.
- [ ] Batch processing with ZIP download.
- [ ] WebGPU post-processing and Web Worker compositing.
- [ ] Multi-format and custom-resolution exports.
- [ ] Keyboard shortcuts, PWA support, and mobile-optimized controls.

---

## 💡 Notes for Future Conversations & Development

If extending this application in future chats, here are useful entry points:
- **`src/App.vue`**: Contains the full UI and background removal pipeline in `processImage(file)`.
- **Edge refinement / Feathering**: Can be added before exporting by manipulating alpha matte channels on an HTML5 `<canvas>`.
- **Batch Processing**: Multiple images can be processed sequentially by accepting `FileList` in `onDrop` / `onFileSelect` and looping through `removeBackground()`.
