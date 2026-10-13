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
  - **Sample photo**: one click runs a real cutout, and a guided tutorial walks through the studio.
- **📦 Batch Processing → ZIP**: Select or drop several photos at once. Each one is cut out with the selected model and your current tuning, and every PNG arrives in a single ZIP. The open workspace is left untouched, failed files are listed with their error, and *Cancel* stops after the photo in progress while still saving what finished.
- **Interactive Split Comparison Slider**: Seamlessly inspect the original image vs. the cutout with a custom handle.
- **Backdrop Switcher**: Preview the transparent cutout against Grid, White, Dark, Color Gradient, or **your own photo**.
- **🖼️ Custom Background Replacement**: Choose *Image* in the backdrop switcher to place the cutout on any photo (cover-fitted, never stretched). While it is active, the download button becomes **Download with BG** and saves the flattened result as a full-resolution JPG. Remove it with the ✕ next to the button.
- **High-Resolution PNG Download & Clipboard Copy**: Full-resolution PNG download and 1-click clipboard export.
- **📲 Installable App (PWA)**: Install PureCut from the browser to get its own window and icon. Once installed and a model is downloaded, it opens and works without an internet connection. See [Install PureCut as an app](#-install-purecut-as-an-app).
- **Responsive on every browser**: On browsers without WebGPU (Safari, iOS), inference runs in a background worker so the interface never freezes.

---

## 📲 Install PureCut as an app

PureCut is a Progressive Web App (PWA). Installing it is optional, but it gives you a standalone
window, a desktop or home-screen icon, and **offline use**. Nothing is uploaded either way.

**Quickest route:** open PureCut, click the version badge (e.g. `v1.6.0`) in the top bar, go to
the **About** tab, and press **Install PureCut**. The button appears only in browsers that support
one-click install; otherwise the About tab shows the steps for your device, which are also listed
below.

| Device / browser | How to install |
| --- | --- |
| **Chrome, Edge or Brave** (Windows, macOS, Linux, ChromeOS) | Click the install icon (a monitor with a down arrow) at the right of the address bar, or open the browser menu (**⋮**) and choose **Install PureCut** (in Edge: **Apps → Install this site as an app**). |
| **Chrome on Android** | Open the **⋮** menu and tap **Install app** (on some versions: **Add to Home screen**). |
| **Safari on iPhone / iPad** | Tap **Share** (the square with an arrow), then **Add to Home Screen**, then **Add**. |
| **Safari on macOS (Sonoma or later)** | **File → Add to Dock**. |
| **Firefox (desktop)** | Not supported: Firefox does not install web apps. Use it as a normal website. |

**Using it offline**

1. Open PureCut once while online, so the app itself is cached.
2. Process at least one image with the model you want to use offline, or press the pre-download
   button: model weights are downloaded once and then stored on your device.
3. From then on the installed app opens and removes backgrounds without a connection. Switching to
   a model you have never downloaded still needs the internet.

**Good to know**

- **Updates** install themselves: whenever you are online the app loads the latest version, and the
  in-app update prompt tells you when a new release is ready.
- **Uninstall** like any other app: from the app window's menu (**⋮ → Uninstall PureCut**) on
  desktop, by long-pressing the icon on Android, or by deleting the home-screen icon on iOS.
- **Storage:** *Clear Cache* in the Storage tab removes downloaded models. The app keeps working
  online and re-caches itself on the next visit.
- **No install button?** The app may already be installed (you will see *PureCut is installed on
  this device* in About), the browser may not support installing (see the table), or the page is
  not served over HTTPS. `localhost` counts as secure for local development.

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

Double-click **[`start-rmbg2-gui.bat`](start-rmbg2-gui.bat)** to install the Node-only dependencies when
needed and open the local lab at `http://localhost:5173/rmbg2`. The launcher checks that a Hugging
Face token is configured before starting; it gives exact setup instructions if one is missing.

RMBG-2.0 is a gated Hugging Face repository. Before its first download:

1. Accept the licence at <https://huggingface.co/briaai/RMBG-2.0>.
2. Create a **READ** token at <https://huggingface.co/settings/tokens>.
3. Create a `.env` file beside `start-rmbg2-gui.bat` containing `HF_TOKEN=hf_your_token_here`.

The `.env` file is gitignored. The launcher requires the token before it starts, even if weights
are already cached; the token is sent only to `huggingface.co` when gated model weights need to
be downloaded. See
[`rmbg2/README.md`](rmbg2/README.md) for hardware limits and troubleshooting.

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
[`start-rmbg2-gui.bat`](start-rmbg2-gui.bat), through the Node-only lab at `/rmbg2`, or with
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
while idle. See [`rmbg2/README.md`](rmbg2/README.md) for setup and troubleshooting.

---

## 📁 Project Structure

```
PureCut/
├── index.html                 # HTML shell: SEO tags, PWA manifest link, service worker loader
├── package.json               # Dependencies & scripts
├── vite.config.js             # Vite config (dev server, COOP/COEP headers, version.json)
├── start.bat                  # 1-click Windows launcher
├── AGENTS.md                  # Architecture guide for contributors and AI agents
├── public/
│   ├── manifest.webmanifest   # PWA manifest (name, icons, standalone display)
│   ├── coi-serviceworker.js   # Cross-origin isolation + offline app-shell cache
│   └── ...                    # Icons, sample photo, showcase images
├── src/
│   ├── main.js                # Vue mount; registers the PWA install listener early
│   ├── App.vue                # Shell that wires the composables and components together
│   ├── aiEngine.js            # Model loading, WebGPU/WASM selection, inference
│   ├── detectionEngine.js     # Canvas side of subject detection, magic wand, outline
│   ├── constants.js           # Version, model catalogue, changelog, roadmap
│   ├── components/            # View layer (Navbar, StageHeader, BatchPanel, modals...)
│   ├── composables/           # State + behaviour (useProcessing, useBatch, useCustomBackground...)
│   └── core/                  # Framework-free, unit-tested logic (maskOps, detection, zip...)
├── tests/
│   ├── unit/                  # Vitest suites for src/core and scripts
│   └── e2e/                   # Playwright regression suite (npm run test:regression)
└── rmbg2/                     # Local Node RMBG-2.0 lab (not part of the web app)
```

---

## 🛠️ Tech Stack

- **Framework**: [Vue 3](https://vuejs.org/) (Composition API with `<script setup>`)
- **Bundler / Dev Server**: [Vite](https://vitejs.dev/)
- **AI Inference**: [Transformers.js](https://huggingface.co/docs/transformers.js) on [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html) (WebGPU + WASM)
- **Offline / PWA**: Web App Manifest + [`coi-serviceworker`](https://github.com/gzuidhof/coi-serviceworker) extended with an app-shell cache
- **Icon Set**: [`lucide-vue-next`](https://lucide.dev/)
- **Testing**: [Vitest](https://vitest.dev/) (unit) and [Playwright](https://playwright.dev/) (end-to-end regression)

---

## 🗺️ Roadmap

### Done
- [x] Selection tools: subject detection, lasso, rectangle, and magic wand.
- [x] Zoom and pan workspace.
- [x] Curated browser model catalogue with safe WASM fallback.
- [x] Local Node RMBG-2.0 lab with RAM admission safeguards and live resource monitoring.
- [x] Batch processing with ZIP download.
- [x] Custom background replacement.
- [x] Installable PWA with offline support.
- [x] Off-main-thread inference on browsers without WebGPU.

### Planned
- [ ] Brush hardness / softness and pressure-sensitive stylus support.
- [ ] Visual undo history and named export presets.
- [ ] Multi-layer compositing.
- [ ] WebGPU post-processing and Web Worker compositing.
- [ ] Multi-format and custom-resolution exports.
- [ ] Keyboard shortcuts and mobile-optimized controls.

---

## 💡 Notes for Future Conversations & Development

Start with [`AGENTS.md`](AGENTS.md): it maps every module, the commands, and the rules that keep
the codebase healthy (file-size budget, regression suite, CSS parity check). Useful entry points:
- **`src/composables/useProcessing.ts`**: the single-image pipeline, `processImage(file)`.
- **`src/composables/useBatch.ts`**: batch mode; reuses `renderCutout` from `useCompositor.ts`, so
  batch PNGs match the studio's Download PNG exactly.
- **`src/composables/useCustomBackground.ts`**: background photo preview and flattened JPG export.
- **`src/aiEngine.js`**: model loading, device choice, and the WASM proxy worker switch.
- **`public/coi-serviceworker.js`**: vendored service worker; the PureCut addition at the top is the
  offline app-shell cache.
