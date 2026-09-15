import { AutoModel, AutoProcessor, RawImage, env } from '@huggingface/transformers';
import { segmentForeground, preload as imglyPreload } from '@imgly/background-removal';

// Configure transformers.js for browser environment
if (typeof window !== 'undefined') {
  env.allowLocalModels = false;
  // Use browser Cache API for model caching
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.proxy = false;
  }
}

let rmbgModel = null;
let rmbgProcessor = null;

/**
 * Clear in-memory cached model instances
 */
export function resetLoadedModels() {
  rmbgModel = null;
  rmbgProcessor = null;
}

/**
 * Preload RMBG-1.4 model
 */
export async function preloadRMBG(onProgress) {
  if (!rmbgModel) {
    rmbgModel = await AutoModel.from_pretrained('briaai/RMBG-1.4', {
      progress_callback: onProgress,
    });
    rmbgProcessor = await AutoProcessor.from_pretrained('briaai/RMBG-1.4', {
      progress_callback: onProgress,
    });
  }
  return true;
}

/**
 * Run BRIA RMBG-1.4 (SOTA Model)
 */
export async function runRMBG(file, device = 'webgpu', onProgress) {
  const objectUrl = URL.createObjectURL(file);
  try {
    if (!rmbgModel || !rmbgProcessor) {
      if (onProgress) onProgress({ status: 'init', message: 'Loading RMBG-1.4 model weights (~43 MB)...' });
      rmbgModel = await AutoModel.from_pretrained('briaai/RMBG-1.4', {
        device: device === 'gpu' ? 'webgpu' : 'wasm',
        progress_callback: onProgress,
      });
      rmbgProcessor = await AutoProcessor.from_pretrained('briaai/RMBG-1.4', {
        progress_callback: onProgress,
      });
    }

    if (onProgress) onProgress({ status: 'processing', message: 'Reading and preprocessing image...' });
    const image = await RawImage.fromURL(objectUrl);

    if (onProgress) onProgress({ status: 'inference', message: 'Executing neural foreground segmentation...' });
    const { pixel_values } = await rmbgProcessor(image);
    const { output } = await rmbgModel({ input: pixel_values });

    // Output tensor to mask
    const rawMask = RawImage.fromTensor(output[0].mul(255).to('uint8'));
    const resizedMask = await rawMask.resize(image.width, image.height);

    // Create a black-and-white canvas mask image
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = image.width;
    maskCanvas.height = image.height;
    const maskCtx = maskCanvas.getContext('2d');
    const maskImageData = maskCtx.createImageData(image.width, image.height);
    const maskData = resizedMask.data;
    const pixels = maskImageData.data;

    for (let i = 0; i < maskData.length; i++) {
      const val = maskData[i];
      const idx = i * 4;
      pixels[idx] = 255;
      pixels[idx + 1] = 255;
      pixels[idx + 2] = 255;
      pixels[idx + 3] = val; // Alpha channel holds the mask
    }
    maskCtx.putImageData(maskImageData, 0, 0);

    const maskBlob = await new Promise((resolve) => maskCanvas.toBlob(resolve, 'image/png'));
    return {
      maskBlob,
      width: image.width,
      height: image.height,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Run ISNet (via @imgly)
 */
export async function runISNet(file, modelType = 'isnet_quint8', device = 'gpu', onProgress) {
  const maskBlob = await segmentForeground(file, {
    model: modelType,
    device: device,
    progress: (key, current, total) => {
      if (onProgress) {
        if (key.includes('fetch')) {
          const loadedMB = (current / (1024 * 1024)).toFixed(1);
          const totalMB = (total / (1024 * 1024)).toFixed(1);
          const pct = Math.min(100, Math.round((current / total) * 100) || 0);
          onProgress({
            status: 'fetch',
            loadedMB,
            totalMB,
            pct,
            message: `Downloading ISNet model: ${loadedMB} MB / ${totalMB} MB (${pct}%)`
          });
        } else {
          onProgress({ status: 'inference', message: 'Running ISNet neural segmentation...' });
        }
      }
    }
  });
  return { maskBlob };
}
