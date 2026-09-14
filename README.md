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
- **Model Cache Status & Preloader**:
  - Live indicator in navbar: shows whether model is cached locally (`🟢 Cached & Ready`) or not yet downloaded (`⚡ Not Downloaded`).
  - Pre-download button: allows users to download the ~43 MB model weights ahead of time.
  - Transparent size indicator with exact percentage during downloads.
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

## 💡 Notes for Future Conversations & Development

If extending this application in future chats, here are useful entry points:
- **`src/App.vue`**: Contains the full UI and background removal pipeline in `processImage(file)`.
- **Edge refinement / Feathering**: Can be added before exporting by manipulating alpha matte channels on an HTML5 `<canvas>`.
- **Batch Processing**: Multiple images can be processed sequentially by accepting `FileList` in `onDrop` / `onFileSelect` and looping through `removeBackground()`.
