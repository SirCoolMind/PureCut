# PureCut — In-Browser AI Background Remover Studio

PureCut is a private, client-side AI tool for removing image backgrounds directly in the web browser. It is inspired by tools like BG Poof, but designed with a custom modern dark-slate studio theme, zero external server dependencies, and full client-side execution.

---

## 🌟 Key Features

- **100% Private & In-Browser**: Images never leave the device. No data is sent to any server or API.
- **State-of-the-Art BRIA RMBG-1.4 Neural Model (Default)**:
  - Powered by Transformers.js (`briaai/RMBG-1.4`).
  - Superior accuracy on difficult real-world photos: fine hair, clothing that camouflages with the background (e.g. grey sweatpants against metal walls), complex poses, and reflective surfaces.
  - Also includes legacy ISNet models as selectable alternatives.
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
  - Clickable `v1.1.0` badge in navbar opening a dedicated popup modal.
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

## 🧠 How the AI Model Works

- **Engine**: Powered by [`@imgly/background-removal`](https://www.npmjs.com/package/@imgly/background-removal) which runs pre-trained ONNX neural network models in-browser using **WebAssembly (WASM)** and **WebGPU**.
- **Model Weight Download**:
  - On the very **first** image upload, the browser downloads the quantized model weights (~35–45 MB) from the CDN.
  - The model weights are automatically stored in the browser's **IndexedDB cache**.
  - Subsequent image removals load the model instantly from local cache without re-downloading.
- **Computation**: Inference takes ~1 to 3 seconds on modern hardware and runs on the user's local CPU/GPU.

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

## 🗺️ Roadmap & Future Features

### 🎯 Selection & Detection
- [ ] **Dotted Cutout Outline** — Marching ants / dashed border animation around the detected subject for visual clarity before confirming the cutout.
- [ ] **Auto-Detect Categories** — Automatically classify the subject (Human, Animal, Product, Vehicle, Food, etc.) and apply category-optimized AI settings.
- [ ] **Multi-Subject Detection** — Detect and list all separate subjects in an image; let the user pick which ones to keep or remove individually.
- [ ] **Polygon / Lasso Selection Tool** — Manual selection tool for precise boundary drawing when AI misses tricky areas.
- [ ] **Magic Wand (Color-Based Selection)** — Click to select/deselect regions by color similarity, useful for solid-color backgrounds.

### 🖌️ Brush & Editing
- [ ] **Brush Hardness / Softness Slider** — Adjustable edge falloff on the brush for softer, more natural manual edits.
- [ ] **Pressure-Sensitive Stylus Support** — Vary brush size/opacity based on pen pressure for tablet users (Wacom, iPad, Surface).
- [ ] **Visual Undo History Panel** — Thumbnail strip showing each undo state for quick visual comparison and rollback.

### 🖼️ Canvas & Viewport
- [ ] **Zoom & Pan** — Pinch-to-zoom and scroll-to-zoom with pan for precision brush work on high-resolution images.
- [ ] **Custom Background Replacement** — Upload or pick a custom photo/color as the new background behind the cutout.
- [ ] **Multi-Layer Compositing** — Stack multiple cutout subjects onto a single canvas with drag-to-reposition.
- [ ] **Side-by-Side Multi-View** — Compare cutout results from different models or settings simultaneously.

### 📦 Batch & Workflow
- [ ] **Batch Processing** — Drag-drop multiple images; process them all sequentially and download as a ZIP archive.
- [ ] **Preset Export Profiles** — Save and reuse named combinations of tuning settings (e.g., "E-commerce Product", "LinkedIn Headshot").
- [ ] **Processing Queue with Progress** — Visual queue showing each image's status when batch processing.

### ⚡ Performance & Engine
- [ ] **WebGPU Shader Post-Processing** — Move the pixel-level threshold/trim/de-fringe loop to a GPU compute shader for instant full-quality renders.
- [ ] **Web Worker Offloading** — Run heavy compositing in a Web Worker to keep the UI thread always responsive.
- [ ] **OffscreenCanvas** — Use `OffscreenCanvas` for the display preview to enable hardware-accelerated rendering off the main thread.

### 🚀 Export & Sharing
- [ ] **Multi-Format Export** — Export as JPEG (with white/custom background fill), WebP (smaller file size), or SVG trace.
- [ ] **Custom Resolution Export** — Resize the output to specific dimensions (e.g., 1080×1080 for Instagram, 800×800 for e-commerce).
- [ ] **Direct Social Sharing** — One-click share to Instagram, Twitter/X, or generate a shareable link.

### 📱 Platform & UX
- [ ] **Progressive Web App (PWA)** — Offline-capable installable app with service worker caching for model weights.
- [ ] **Keyboard Shortcuts** — `B` for brush, `S` for slider, `[` / `]` to resize brush, `Ctrl+Z` for undo, `Space` to pan.
- [ ] **Dark / Light Theme Toggle** — User-selectable theme beyond the current dark-slate default.
- [ ] **Drag-to-Reorder Results Gallery** — Keep a gallery of recent cutouts in the current session for quick re-download.
- [ ] **Mobile-Optimized Touch UI** — Responsive layout with larger touch targets, gesture controls, and mobile-friendly brush interaction.

---

## 💡 Notes for Future Conversations & Development

If extending this application in future chats, here are useful entry points:
- **`src/App.vue`**: Contains the full UI and background removal pipeline in `processImage(file)`.
- **Edge refinement / Feathering**: Can be added before exporting by manipulating alpha matte channels on an HTML5 `<canvas>`.
- **Batch Processing**: Multiple images can be processed sequentially by accepting `FileList` in `onDrop` / `onFileSelect` and looping through `removeBackground()`.
