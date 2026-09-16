export const appVersion = '1.3.0'

export const modelOptions = [
  { id: 'briaai/RMBG-1.4', name: 'BRIA RMBG-1.4 (SOTA · Recommended)', size: '43 MB', engine: 'rmbg', desc: 'State-of-the-art accuracy on difficult clothes, hair, reflections, and complex poses.' },
  { id: 'isnet_quint8', name: 'ISNet Quantized (Fast)', size: '41 MB', engine: 'isnet', desc: 'Fast salient object detector for simple studio backgrounds.' },
  { id: 'isnet_fp16', name: 'ISNet FP16 (High Precision)', size: '82 MB', engine: 'isnet', desc: 'Higher precision floating-point ISNet model.' },
  { id: 'isnet', name: 'ISNet Full FP32', size: '176 MB', engine: 'isnet', desc: 'Full 32-bit floating point model for benchmark verification.' }
]

export const changelog = [
  {
    version: '1.3.0',
    date: '2026-09-15',
    tag: 'Latest',
    changes: [
      { type: 'new', text: 'Smart Magnetic Lasso: Snaps marching ants automatically to detected object contours' },
      { type: 'new', text: 'Dotted "Marching Ants" Marquee Selection Tool: Magnetic, Freehand Lasso, and Rectangle modes' },
      { type: 'new', text: 'Instant Region Erase & Restore: 1-click cutout manipulation for enclosed regions with Delete/Enter key support' },
      { type: 'fix', text: 'Fixed brush coordinate offset on zoomed, panned, and letterboxed viewports' },
      { type: 'perf', text: 'Debounced high-res PNG blob rendering with instant GPU preview on Undo/Reset' },
      { type: 'fix', text: 'Fixed model download progress percentage overflow glitch (10000% bug)' },
      { type: 'new', text: 'Browser/Page zoom indicator and reset assistance in top bar' }
    ]
  },
  {
    version: '1.2.0',
    date: '2026-09-15',
    tag: 'Previous',
    changes: [
      { type: 'new', text: 'Interactive Zoom & Pan engine: Mouse wheel zoom, Pan drag tool, Zoom In/Out & Reset Zoom controls' },
      { type: 'perf', text: 'Modularized codebase: Extracted InfoModal & data constants reducing App.vue lines and token footprint' },
      { type: 'fix', text: 'Refined version badge vertical alignment and dropzone UI clarity' }
    ]
  },
  {
    version: '1.1.0',
    date: '2026-09-15',
    tag: 'Previous',
    changes: [
      { type: 'perf', text: 'Magic Brush now runs at 60 FPS — replaced per-pixel CPU compositing with GPU-accelerated canvas preview' },
      { type: 'perf', text: 'Brush strokes use native vector path rendering instead of looping circle interpolation' },
      { type: 'perf', text: 'PNG encoding deferred to pointer release — zero toBlob() calls during painting' },
      { type: 'perf', text: 'requestAnimationFrame batching coalesces multiple pointer events per frame' },
      { type: 'fix', text: 'Fixed brush coordinate mapping for letterboxed/pillarboxed images (object-fit: contain)' },
      { type: 'new', text: 'Added in-app Version, Changelog & Roadmap panel' },
      { type: 'new', text: 'Added AI Storage & Cache Manager: live storage meter with 1-click cache purge for IndexedDB and CacheStorage' }
    ]
  },
  {
    version: '1.0.0',
    date: '2026-09-14',
    tag: 'Initial',
    changes: [
      { type: 'new', text: 'BRIA RMBG-1.4 as default SOTA model with Transformers.js' },
      { type: 'new', text: 'Interactive Magic Brush with Erase & Restore modes' },
      { type: 'new', text: 'Multi-level undo system for brush strokes' },
      { type: 'new', text: 'Model cache status indicator & preloader in navbar' },
      { type: 'new', text: 'Standard quick presets & Power User live sliders' },
      { type: 'new', text: 'Split comparison slider for before/after inspection' },
      { type: 'new', text: 'Backdrop switcher (Grid, White, Dark, Gradient)' },
      { type: 'new', text: 'Live hardware telemetry & resource monitor' },
      { type: 'new', text: 'Drag-drop, file picker & clipboard paste upload' },
      { type: 'new', text: 'High-res PNG download & 1-click clipboard copy' }
    ]
  }
]

export const roadmap = [
  {
    category: '🎯 Selection & Detection',
    items: [
      { text: 'Dotted cutout outline — marching ants animation around detected subject', status: 'done' },
      { text: 'Multi-subject detection — pick which subjects to keep or remove', status: 'done' },
      { text: 'Polygon / Lasso selection tool for precise manual boundaries', status: 'done' },
      { text: 'Magic Wand — color-based region selection', status: 'done' },
    ]
  },
  {
    category: '🖌️ Brush & Editing',
    items: [
      { text: 'Brush hardness / softness slider for edge falloff', status: 'planned' },
      { text: 'Pressure-sensitive stylus support for tablets', status: 'planned' },
      { text: 'Visual undo history panel with thumbnails', status: 'planned' },
    ]
  },
  {
    category: '🖼️ Canvas & Viewport',
    items: [
      { text: 'Zoom & Pan — scroll zoom, drag pan, and 1-click reset zoom', status: 'done' },
      { text: 'Custom background replacement — upload a new background', status: 'planned' },
      { text: 'Multi-layer compositing — stack cutouts on one canvas', status: 'planned' },
    ]
  },
  {
    category: '📦 Batch & Workflow',
    items: [
      { text: 'Batch processing — process multiple images → ZIP download', status: 'planned' },
      { text: 'Preset export profiles — save named tuning combinations', status: 'planned' },
    ]
  },
  {
    category: '⚡ Performance',
    items: [
      { text: 'WebGPU compute shader post-processing', status: 'planned' },
      { text: 'Web Worker offloading for compositing', status: 'planned' },
    ]
  },
  {
    category: '🚀 Export & Sharing',
    items: [
      { text: 'Multi-format export — JPEG, WebP, SVG', status: 'planned' },
      { text: 'Custom resolution export — resize to specific dimensions', status: 'planned' },
    ]
  },
  {
    category: '📱 Platform & UX',
    items: [
      { text: 'Keyboard shortcuts — B, S, [ ], Ctrl+Z, Space', status: 'up-next' },
      { text: 'Progressive Web App (PWA) — offline installable', status: 'planned' },
      { text: 'Mobile-optimized touch UI', status: 'planned' },
    ]
  }
]
