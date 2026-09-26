import { pipeline, env, AutoModelForSemanticSegmentation, RawImage } from '@huggingface/transformers';
import { STORAGE_KEYS } from './core/storageKeys.js';
import { modelOptions } from './constants.js';
import { fuseTtaMask } from './core/maskOps.js';
import { isSkillsafeModel, preloadSkillsafeModel, runSkillsafeModel, resetSkillsafeModels } from './skillsafeEngine.js';

/**
 * Some ONNX graphs contain ops the WebGPU WGSL shader compiler rejects - notably `Pad`
 * and `GatherND`, which BiRefNet-style backbones use heavily. Those models must run on
 * multi-threaded WASM SIMD whatever device was requested, or inference dies with
 * "ShaderModule with 'Pad' label is invalid".
 *
 * A model option can declare this with `forceWasm: true`. Ids without that flag are still
 * matched by substring, which is how the older BiRefNet checkpoints are caught.
 * U2-Net models also use MaxPool with ceil_mode=True which requires WASM SIMD.
 */
const WASM_ONLY_ID_HINTS = ['BiRefNet', 'u2net'];

function isWasmOnlyModel(modelId) {
  if (modelOptions.find((m) => m.id === modelId)?.forceWasm) return true;
  return WASM_ONLY_ID_HINTS.some((hint) => !!modelId && modelId.includes(hint));
}

// Ensure SegformerForSemanticSegmentation is properly registered for image-segmentation tasks (used by RMBG-1.4 and related checkpoints)
if (AutoModelForSemanticSegmentation?.MODEL_CLASS_MAPPINGS?.[0]) {
  AutoModelForSemanticSegmentation.MODEL_CLASS_MAPPINGS[0].set('SegformerForSemanticSegmentation', 'SegformerForSemanticSegmentation');
}

// Configure transformers.js for browser environment
if (typeof window !== 'undefined') {
  env.allowLocalModels = false;
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.proxy = false;
    env.backends.onnx.wasm.numThreads = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
  }
  
  // Custom Fetch Interceptor to inject Hugging Face Access Token
  const originalFetch = env.fetch || window.fetch;
  env.fetch = async (url, init) => {
    const token = localStorage.getItem(STORAGE_KEYS.hfToken);
    if (token && url.includes('huggingface.co')) {
      init = init || {};
      init.headers = init.headers || {};
      init.headers['Authorization'] = `Bearer ${token.trim()}`;
    }
    return originalFetch(url, init);
  };
}

const loadedPipelines = {};

/**
 * Clear in-memory cached model instances
 */
export function resetLoadedModels() {
  for (let key in loadedPipelines) delete loadedPipelines[key];
  resetSkillsafeModels();
}

/**
 * Determine best device for model, checking WebGPU limits if needed
 */
async function resolveModelDevice(requestedDevice, modelId) {
  let wantsGpu = requestedDevice === 'gpu' || requestedDevice === 'webgpu';
  
  // BiRefNet (Swin backbone) and U2-Net models (ceil_mode MaxPool) are incompatible with WebGPU WGSL shader compilers.
  // Always route to multi-threaded WASM SIMD for rock-solid stability and zero shader errors.
  if (isWasmOnlyModel(modelId)) {
    return 'wasm';
  }

  if (wantsGpu) {
    if (typeof navigator !== 'undefined' && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
          return 'webgpu';
        }
      } catch (e) {
        console.warn('[PureCut] WebGPU requestAdapter failed, fallback to WASM:', e);
      }
    }
    return 'wasm';
  }

  return 'wasm';
}

/**
 * Preload model
 */
export async function preloadTransformersModel(modelId, dtype = 'q8', disableOptimization = false, device = 'webgpu', onProgress) {
  if (isSkillsafeModel(modelId)) {
    return await preloadSkillsafeModel(modelId, device, onProgress);
  }

  const targetDevice = await resolveModelDevice(device, modelId);
  const pipelineKey = `${modelId}_${targetDevice}`;

  if (!loadedPipelines[pipelineKey]) {
    const options = {
      device: targetDevice,
      progress_callback: onProgress,
      dtype: dtype
    };
    if (disableOptimization) {
      options.session_options = { graphOptimizationLevel: 'disabled' };
    }
    loadedPipelines[pipelineKey] = await pipeline('image-segmentation', modelId, options);
  }
  return true;
}

/**
 * Run Transformers.js Models (RMBG, ModNet, BiRefNet, U2Net)
 */
export async function runTransformersModel(file, modelId, dtype = 'q8', disableOptimization = false, device = 'webgpu', onProgress, { tta = true } = {}) {
  if (isSkillsafeModel(modelId)) {
    return await runSkillsafeModel(file, modelId, device, onProgress, { tta });
  }

  const objectUrl = URL.createObjectURL(file);
  let effectiveDevice = await resolveModelDevice(device, modelId);
  let pipelineKey = `${modelId}_${effectiveDevice}`;

  const loadPipeline = async (dev) => {
    const key = `${modelId}_${dev}`;
    if (!loadedPipelines[key]) {
      if (onProgress) onProgress({ status: 'init', message: `Loading ${modelId.split('/')[1] || modelId} weights (${dev === 'webgpu' ? 'WebGPU' : 'CPU'})...` });

      const options = {
        device: dev,
        progress_callback: onProgress,
        dtype: dtype
      };

      if (disableOptimization) {
        options.session_options = { graphOptimizationLevel: 'disabled' };
      }

      loadedPipelines[key] = await pipeline('image-segmentation', modelId, options);
    }
    return loadedPipelines[key];
  };

  try {
    let pipeInstance;
    try {
      pipeInstance = await loadPipeline(effectiveDevice);
    } catch (loadErr) {
      // If WebGPU initialization fails (e.g. unsupported adapter or shader limit), auto-fallback to WASM
      if (effectiveDevice === 'webgpu') {
        console.warn('WebGPU pipeline initialization failed, falling back to WASM:', loadErr);
        delete loadedPipelines[pipelineKey];
        effectiveDevice = 'wasm';
        pipelineKey = `${modelId}_wasm`;
        pipeInstance = await loadPipeline(effectiveDevice);
      } else {
        throw loadErr;
      }
    }

    const runInferencePass = async (input) => {
      try {
        return await pipeInstance(input);
      } catch (err) {
        if (effectiveDevice === 'webgpu') {
          console.warn('WebGPU inference failed. Falling back automatically to CPU (WASM)...', err);
          delete loadedPipelines[pipelineKey];
          effectiveDevice = 'wasm';
          pipelineKey = `${modelId}_wasm`;

          if (onProgress) onProgress({ status: 'fallback', message: 'GPU shader/limit reached. Retrying automatically on CPU (WASM)...' });
          try {
            pipeInstance = await loadPipeline(effectiveDevice);
            return await pipeInstance(input);
          } catch (wasmErr) {
            delete loadedPipelines[pipelineKey];
            console.error('CPU WASM fallback failed:', wasmErr);
            throw wasmErr;
          }
        } else {
          delete loadedPipelines[pipelineKey];
          console.error('Inference crashed:', err);
          let friendlyMessage = err?.message || 'Processing Error.';
          if (friendlyMessage.includes('bad_alloc')) {
            friendlyMessage = `Ran out of memory trying to process this model. Please select a lighter model.`;
          } else if (friendlyMessage.includes('maxStorageBuffersPerShaderStage')) {
            friendlyMessage = `Your GPU does not support this specific model (Hardware limitation: maxStorageBuffersPerShaderStage).`;
          }
          throw new Error(friendlyMessage);
        }
      }
    };

    let inputToProcess = objectUrl;
    let needsMaskUpscale = false;
    let targetWidth = 0;
    let targetHeight = 0;
    let baseCanvas = null;

    // In browsers, 32-bit WASM memory limit (2GB address space) and WebGPU buffers crash with std::bad_alloc
    // on large images for models like MODNet, BiRefNet, and RMBG.
    // We decode via standard Image/Canvas (bypassing flaky fetch on blob: URLs) and downscale to max safe resolution.
    try {
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const tempImg = new Image();
        tempImg.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          tempImg.onload = () => resolve(true);
          tempImg.onerror = (e) => reject(e);
          tempImg.src = objectUrl;
        });

        targetWidth = tempImg.naturalWidth || tempImg.width;
        targetHeight = tempImg.naturalHeight || tempImg.height;

        const maxDimension = modelId.includes('BiRefNet') ? 512 : (modelId.includes('modnet') ? 768 : 1024);
        let processW = targetWidth;
        let processH = targetHeight;
        if (targetWidth > maxDimension || targetHeight > maxDimension) {
          const scale = maxDimension / Math.max(targetWidth, targetHeight);
          processW = Math.round(targetWidth * scale);
          processH = Math.round(targetHeight * scale);
          needsMaskUpscale = true;
          console.log(`[PureCut] Downscaled input from ${targetWidth}x${targetHeight} to ${processW}x${processH} for ${modelId}`);
        }

        baseCanvas = document.createElement('canvas');
        baseCanvas.width = processW;
        baseCanvas.height = processH;
        const sCtx = baseCanvas.getContext('2d');
        sCtx.drawImage(tempImg, 0, 0, processW, processH);

        // RawImage.fromCanvas operates natively in browser without network fetch!
        inputToProcess = RawImage.fromCanvas(baseCanvas);
      }
    } catch (preprocessErr) {
      console.warn('[PureCut] Image downscaling preprocess notice:', preprocessErr);
      inputToProcess = objectUrl;
    }

    if (onProgress) onProgress({ status: 'inference', message: `Executing neural segmentation${tta ? ' (Pass 1/2: Standard)' : ''} (${effectiveDevice === 'webgpu' ? 'WebGPU' : 'CPU WASM'})...` });

    const result = await runInferencePass(inputToProcess);

    // Pipeline usually returns an array of objects for image-segmentation, e.g., [{ mask: RawImage, label: '...' }, ...]
    // Or it might return a single object. Let's handle both.
    let maskImage;
    if (Array.isArray(result)) {
      // Find the foreground mask, or just use the first one
      const fg = result.find(r => r.label === 'foreground') || result[0];
      maskImage = fg.mask;
    } else {
      maskImage = result.mask || result;
    }

    // TTA Flip Fusion: Second pass with horizontally mirrored input
    if (tta && baseCanvas && maskImage) {
      try {
        if (onProgress) onProgress({ status: 'inference', message: `Executing neural segmentation (Pass 2/2: TTA Flip Fusion)...` });

        const flipCanvas = document.createElement('canvas');
        flipCanvas.width = baseCanvas.width;
        flipCanvas.height = baseCanvas.height;
        const fCtx = flipCanvas.getContext('2d');
        fCtx.translate(baseCanvas.width, 0);
        fCtx.scale(-1, 1);
        fCtx.drawImage(baseCanvas, 0, 0);

        const flippedInput = RawImage.fromCanvas(flipCanvas);
        const flopResult = await runInferencePass(flippedInput);

        let maskImageFlop;
        if (Array.isArray(flopResult)) {
          const fg = flopResult.find(r => r.label === 'foreground') || flopResult[0];
          maskImageFlop = fg.mask;
        } else {
          maskImageFlop = flopResult.mask || flopResult;
        }

        if (maskImageFlop && maskImageFlop.data && maskImage.data &&
            maskImage.width === maskImageFlop.width && maskImage.height === maskImageFlop.height) {
          fuseTtaMask(maskImage.data, maskImageFlop.data, maskImage.width, maskImage.height, maskImage.channels || 1);
        }
      } catch (ttaErr) {
        console.warn('[PureCut] TTA flip pass skipped due to notice:', ttaErr);
      }
    }

    // Upscale mask back to original dimensions if resized for memory stability
    if (needsMaskUpscale && maskImage && maskImage.resize && targetWidth > 0 && targetHeight > 0) {
      maskImage = await maskImage.resize(targetWidth, targetHeight);
    }

    // Now maskImage is a RawImage object with .width, .height, and .data or .canvas
    // Construct an RGBA mask canvas where the alpha channel holds the mask luminance / opacity
    const width = maskImage.width;
    const height = maskImage.height;
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d');
    const maskImageData = maskCtx.createImageData(width, height);
    const dst = maskImageData.data;
    const src = maskImage.data;
    const numPixels = width * height;

    if (maskImage.channels === 1) {
      for (let i = 0; i < numPixels; i++) {
        const val = src[i];
        const idx = i * 4;
        dst[idx] = 255;
        dst[idx + 1] = 255;
        dst[idx + 2] = 255;
        dst[idx + 3] = val; // Alpha channel holds the mask opacity
      }
    } else if (maskImage.channels === 4) {
      for (let i = 0; i < numPixels; i++) {
        const idx = i * 4;
        // If image has RGB luminance, use it or the alpha channel
        const val = src[idx + 3] !== undefined ? src[idx + 3] : src[idx];
        dst[idx] = 255;
        dst[idx + 1] = 255;
        dst[idx + 2] = 255;
        dst[idx + 3] = val;
      }
    } else {
      // 3 channels (RGB) - mask grayscale luminance
      for (let i = 0; i < numPixels; i++) {
        const srcIdx = i * maskImage.channels;
        const idx = i * 4;
        const val = src[srcIdx];
        dst[idx] = 255;
        dst[idx + 1] = 255;
        dst[idx + 2] = 255;
        dst[idx + 3] = val;
      }
    }
    maskCtx.putImageData(maskImageData, 0, 0);

    let maskBlob;
    if (maskCanvas instanceof HTMLCanvasElement && maskCanvas.toBlob) {
      maskBlob = await new Promise((resolve) => maskCanvas.toBlob(resolve, 'image/png'));
    } else if (maskCanvas && typeof maskCanvas.convertToBlob === 'function') {
      // OffscreenCanvas support
      maskBlob = await maskCanvas.convertToBlob({ type: 'image/png' });
    } else {
      // Fallback: draw onto a standard HTMLCanvasElement
      const standardCanvas = document.createElement('canvas');
      standardCanvas.width = maskCanvas?.width || maskImage.width;
      standardCanvas.height = maskCanvas?.height || maskImage.height;
      const ctx = standardCanvas.getContext('2d');
      if (maskCanvas) {
        ctx.drawImage(maskCanvas, 0, 0);
      }
      maskBlob = await new Promise((resolve) => standardCanvas.toBlob(resolve, 'image/png'));
    }

    return {
      maskBlob,
      width: maskCanvas?.width || maskImage.width,
      height: maskCanvas?.height || maskImage.height,
      deviceUsed: effectiveDevice
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}


