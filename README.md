# PureCut — In-Browser AI Background Remover Studio

PureCut is a private, client-side AI tool for removing image backgrounds directly in the web browser. It is inspired by tools like BG Poof, but designed with a custom modern dark-slate studio theme, zero external server dependencies, and full client-side execution.

---

## 🌟 Key Features

- **100% Private & In-Browser**: Images never leave the device. No data is sent to any server or API.
- **Easy Uploads**:
  - Drag-and-drop images anywhere into the upload card.
  - File picker dialog.
  - **Clipboard Paste**: Press `Ctrl + V` (or `⌘ + V` on Mac) to paste images copied from the web or clipboard.
- **Interactive Split Comparison Slider**: Seamlessly inspect the original image vs. the background-removed cutout.
- **Backdrop Switcher**: Preview the transparent cutout against:
  - Checkerboard Transparency Grid
  - Pure White
  - Deep Dark
  - Vibrant Gradient
- **High-Resolution PNG Download**: Preserves the original image dimensions without watermarks or compression limits.
- **Clipboard Export**: 1-click "Copy Cutout" to copy the transparent PNG directly to your system clipboard.
- **Image Metadata**: Live display of original image resolution ($W \times H$), file size, and AI inference duration.

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
