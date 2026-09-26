import * as ort from 'onnxruntime-web/all';

const CACHE_NAME = 'purecut-skillsafe-cache-v1';

export const SKILLSAFE_MODELS = {
  'skillsafe-ai/u2netp': {
    name: 'U²-Net-p',
    filename: 'u2netp.onnx',
    url: 'https://huggingface.co/skillsafe-ai/u2netp/resolve/main/u2netp.onnx',
    sizeBytes: 4574861,
    sizeDisplay: '4.4 MB',
    inputWidth: 320,
    inputHeight: 320,
    inputName: 'input.1',
    outputName: '1959',
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    preferredDevice: 'wasm' // ceil_mode MaxPool unsupported in ONNX WebGPU JSEP
  },
  'skillsafe-ai/u2net': {
    name: 'U²-Net',
    filename: 'u2net.onnx',
    url: 'https://huggingface.co/skillsafe-ai/u2net/resolve/main/u2net.onnx',
    sizeBytes: 175997641,
    sizeDisplay: '176 MB',
    inputWidth: 320,
    inputHeight: 320,
    inputName: 'input.1',
    outputName: '1959',
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    preferredDevice: 'wasm' // ceil_mode MaxPool unsupported in ONNX WebGPU JSEP
  },
  'skillsafe-ai/u2net-human-seg': {
    name: 'U²-Net Human Seg',
    filename: 'u2net_human_seg.onnx',
    url: 'https://huggingface.co/skillsafe-ai/u2net-human-seg/resolve/main/u2net_human_seg.onnx',
    sizeBytes: 175997641,
    sizeDisplay: '176 MB',
    inputWidth: 320,
    inputHeight: 320,
    inputName: 'input.1',
    outputName: '1959',
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    preferredDevice: 'wasm' // ceil_mode MaxPool unsupported in ONNX WebGPU JSEP
  },
  'skillsafe-ai/isnet-general-use': {
    name: 'IS-Net General',
    filename: 'isnet-general-use.onnx',
    url: 'https://huggingface.co/skillsafe-ai/isnet-general-use/resolve/main/isnet-general-use.onnx',
    sizeBytes: 178648008,
    sizeDisplay: '179 MB',
    inputWidth: 1024,
    inputHeight: 1024,
    inputName: 'input_image',
    outputName: 'output_image',
    mean: [0.5, 0.5, 0.5],
    std: [1.0, 1.0, 1.0],
    preferredDevice: 'wasm' // ceil_mode MaxPool is not supported by ONNX Runtime WebGPU JSEP
  }
};

export function isSkillsafeModel(modelId) {
  return Boolean(SKILLSAFE_MODELS[modelId]);
}

const activeSessions = new Map();

// Configure ONNX wasm environment matching Transformers.js CDN resolution
if (typeof window !== 'undefined' && ort.env?.wasm) {
  ort.env.wasm.proxy = false;
  const ortVersion = ort.env.versions?.web || '1.21.0';
  ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ortVersion}/dist/`;
  if (navigator.hardwareConcurrency) {
    ort.env.wasm.numThreads = Math.max(1, navigator.hardwareConcurrency - 1);
  }
}

/**
 * Clear cached in-memory session instances
 */
export function resetSkillsafeModels() {
  for (const session of activeSessions.values()) {
    try {
      session.release();
    } catch (_) {}
  }
  activeSessions.clear();
}

/**
 * Fetch model weights with progress reporting and CacheStorage persistence
 */
async function getModelBuffer(config, onProgress) {
  const modelUrl = config.url;

  // Check CacheStorage first
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(modelUrl);
      if (cachedResponse) {
        if (onProgress) {
          onProgress({
            status: 'cached',
            message: `Loading ${config.name} weights from browser cache...`,
            pct: 100,
            progress: 1.0
          });
        }
        return await cachedResponse.arrayBuffer();
      }
    } catch (err) {
      console.warn('[PureCut] CacheStorage check failed:', err);
    }
  }

  // Download from Hugging Face with progress
  if (onProgress) {
    onProgress({
      status: 'downloading',
      message: `Downloading ${config.name} model (${config.sizeDisplay})...`,
      pct: 0,
      progress: 0
    });
  }

  const response = await fetch(modelUrl);
  if (!response.ok) {
    throw new Error(`Failed to download ${config.name} model: ${response.status} ${response.statusText}`);
  }

  const contentLength = Number(response.headers.get('content-length')) || config.sizeBytes;
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    const pct = Math.min(100, Math.round((loaded / contentLength) * 100));
    if (onProgress) {
      onProgress({
        status: 'downloading',
        message: `Downloading ${config.name} model: ${pct}%...`,
        pct,
        progress: pct / 100,
        loadedMB: (loaded / (1024 * 1024)).toFixed(1),
        totalMB: (contentLength / (1024 * 1024)).toFixed(1)
      });
    }
  }

  const modelBuffer = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    modelBuffer.set(chunk, offset);
    offset += chunk.length;
  }

  // Persist into CacheStorage
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(
        modelUrl,
        new Response(modelBuffer.buffer.slice(0), {
          headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(loaded) }
        })
      );
    } catch (err) {
      console.warn('[PureCut] CacheStorage put failed:', err);
    }
  }

  return modelBuffer.buffer;
}

/**
 * Preload or retrieve ONNX InferenceSession for a given SkillSafe model
 */
async function getOrCreateSession(modelId, requestedDevice = 'webgpu', onProgress) {
  const config = SKILLSAFE_MODELS[modelId];
  if (!config) {
    throw new Error(`Unknown SkillSafe model: ${modelId}`);
  }

  let effectiveDevice = 'wasm';
  if (config.preferredDevice === 'wasm') {
    effectiveDevice = 'wasm';
  } else {
    let wantsGpu = (requestedDevice === 'gpu' || requestedDevice === 'webgpu');
    if (wantsGpu && typeof navigator !== 'undefined' && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        effectiveDevice = adapter ? 'webgpu' : 'wasm';
      } catch (_) {
        effectiveDevice = 'wasm';
      }
    } else {
      effectiveDevice = 'wasm';
    }
  }

  const sessionKey = `${modelId}_${effectiveDevice}`;
  if (activeSessions.has(sessionKey)) {
    return { session: activeSessions.get(sessionKey), device: effectiveDevice, config };
  }

  // Ensure wasmPaths is set matching Transformers.js CDN resolution
  if (typeof window !== 'undefined' && ort.env?.wasm && !ort.env.wasm.wasmPaths) {
    const ortVersion = ort.env.versions?.web || '1.21.0';
    ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ortVersion}/dist/`;
  }

  const buffer = await getModelBuffer(config, onProgress);

  if (onProgress) {
    onProgress({
      status: 'init',
      message: `Initializing ${config.name} session (${effectiveDevice === 'webgpu' ? 'WebGPU' : 'CPU WASM'})...`
    });
  }

  try {
    const sessionOptions = {
      executionProviders: effectiveDevice === 'webgpu' ? ['webgpu'] : ['wasm'],
      graphOptimizationLevel: 'all'
    };
    const session = await ort.InferenceSession.create(new Uint8Array(buffer), sessionOptions);
    activeSessions.set(sessionKey, session);
    return { session, device: effectiveDevice, config };
  } catch (gpuErr) {
    if (effectiveDevice === 'webgpu') {
      console.warn(`[PureCut] WebGPU session creation failed for ${config.name}, falling back to WASM:`, gpuErr);
      if (onProgress) {
        onProgress({ status: 'fallback', message: 'GPU initialization failed. Falling back to CPU WASM...' });
      }
      const session = await ort.InferenceSession.create(new Uint8Array(buffer), {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
      });
      activeSessions.set(`${modelId}_wasm`, session);
      return { session, device: 'wasm', config };
    }
    throw gpuErr;
  }
}

/**
 * Preload SkillSafe model weights
 */
export async function preloadSkillsafeModel(modelId, device = 'webgpu', onProgress) {
  await getOrCreateSession(modelId, device, onProgress);
  return true;
}

/**
 * Run SkillSafe model inference and return mask blob with original dimensions
 */
export async function runSkillsafeModel(file, modelId, device = 'webgpu', onProgress, { tta = true } = {}) {
  const objectUrl = URL.createObjectURL(file);

  try {
    let { session: currentSession, device: currentDevice, config } = await getOrCreateSession(modelId, device, onProgress);

    const executeOrtRun = async (inputFeeds) => {
      try {
        return await currentSession.run(inputFeeds);
      } catch (runErr) {
        if (currentDevice === 'webgpu') {
          console.warn(`[PureCut] WebGPU execution failed for ${config.name}, retrying on WASM:`, runErr);
          if (onProgress) {
            onProgress({ status: 'fallback', message: 'GPU execution failed. Retrying on CPU WASM...' });
          }
          const wasmRes = await getOrCreateSession(modelId, 'wasm', onProgress);
          currentSession = wasmRes.session;
          currentDevice = 'wasm';
          return await currentSession.run(inputFeeds);
        }
        throw runErr;
      }
    };

    if (onProgress) {
      onProgress({
        status: 'inference',
        message: `Executing ${config.name} neural cutout${tta ? ' (Pass 1/2: Standard)' : ''} (${currentDevice === 'webgpu' ? 'WebGPU' : 'CPU WASM'})...`
      });
    }

    // Decode original image
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = () => resolve(true);
      img.onerror = () => reject(new Error(`Failed to load image for ${config.name} inference`));
      img.src = objectUrl;
    });

    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;
    const { inputWidth, inputHeight, mean, std } = config;

    // Rescale input image to required model input resolution
    const canvas = document.createElement('canvas');
    canvas.width = inputWidth;
    canvas.height = inputHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, inputWidth, inputHeight);

    const imgData = ctx.getImageData(0, 0, inputWidth, inputHeight).data;
    const channelSize = inputWidth * inputHeight;
    const floatData = new Float32Array(3 * channelSize);

    // CHW normalization: (pixel / 255.0 - mean) / std
    for (let i = 0; i < channelSize; i++) {
      const idx = i * 4;
      floatData[i] = (imgData[idx] / 255.0 - mean[0]) / std[0];
      floatData[channelSize + i] = (imgData[idx + 1] / 255.0 - mean[1]) / std[1];
      floatData[channelSize * 2 + i] = (imgData[idx + 2] / 255.0 - mean[2]) / std[2];
    }

    const inputName = config.inputName || currentSession.inputNames[0];
    const inputTensor = new ort.Tensor('float32', floatData, [1, 3, inputHeight, inputWidth]);
    const feeds = { [inputName]: inputTensor };

    const results = await executeOrtRun(feeds);

    // Extract primary prediction mask
    const outputName = config.outputName || currentSession.outputNames[0];
    const outputTensor = results[outputName] || results[currentSession.outputNames[0]];
    const rawMask = outputTensor.data;

    // Normalize output mask to [0, 1] range (normPRED min-max normalization)
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < rawMask.length; i++) {
      const v = rawMask[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min || 1;

    // TTA Flip Fusion: Second pass with horizontally mirrored input
    let rawMaskFlop = null;
    let minFlop = Infinity;
    let maxFlop = -Infinity;
    let rangeFlop = 1;

    if (tta) {
      try {
        if (onProgress) {
          onProgress({
            status: 'inference',
            message: `Executing ${config.name} neural cutout (Pass 2/2: TTA Flip Fusion)...`
          });
        }
        const flipCanvas = document.createElement('canvas');
        flipCanvas.width = inputWidth;
        flipCanvas.height = inputHeight;
        const fCtx = flipCanvas.getContext('2d', { willReadFrequently: true });
        fCtx.translate(inputWidth, 0);
        fCtx.scale(-1, 1);
        fCtx.drawImage(canvas, 0, 0);

        const flipImgData = fCtx.getImageData(0, 0, inputWidth, inputHeight).data;
        const floatDataFlop = new Float32Array(3 * channelSize);
        for (let i = 0; i < channelSize; i++) {
          const idx = i * 4;
          floatDataFlop[i] = (flipImgData[idx] / 255.0 - mean[0]) / std[0];
          floatDataFlop[channelSize + i] = (flipImgData[idx + 1] / 255.0 - mean[1]) / std[1];
          floatDataFlop[channelSize * 2 + i] = (flipImgData[idx + 2] / 255.0 - mean[2]) / std[2];
        }

        const inputTensorFlop = new ort.Tensor('float32', floatDataFlop, [1, 3, inputHeight, inputWidth]);
        const flopResults = await executeOrtRun({ [inputName]: inputTensorFlop });
        const flopTensor = flopResults[outputName] || flopResults[currentSession.outputNames[0]];
        rawMaskFlop = flopTensor.data;

        for (let i = 0; i < rawMaskFlop.length; i++) {
          const v = rawMaskFlop[i];
          if (v < minFlop) minFlop = v;
          if (v > maxFlop) maxFlop = v;
        }
        rangeFlop = maxFlop - minFlop || 1;
      } catch (ttaErr) {
        console.warn(`[PureCut] SkillSafe TTA pass skipped for ${config.name}:`, ttaErr);
      }
    }

    // Render RGBA mask canvas
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = inputWidth;
    maskCanvas.height = inputHeight;
    const maskCtx = maskCanvas.getContext('2d');
    const maskImageData = maskCtx.createImageData(inputWidth, inputHeight);
    const dst = maskImageData.data;

    for (let y = 0; y < inputHeight; y++) {
      const rowOffset = y * inputWidth;
      for (let x = 0; x < inputWidth; x++) {
        const idx1 = rowOffset + x;
        const norm1 = (rawMask[idx1] - min) / range;
        let finalNorm = norm1;
        if (rawMaskFlop) {
          const idx2 = rowOffset + (inputWidth - 1 - x);
          const norm2 = (rawMaskFlop[idx2] - minFlop) / rangeFlop;
          finalNorm = Math.max(norm1, norm2);
        }
        const alpha = Math.round(Math.min(255, Math.max(0, finalNorm * 255)));
        const pIdx = idx1 * 4;
        dst[pIdx] = 255;
        dst[pIdx + 1] = 255;
        dst[pIdx + 2] = 255;
        dst[pIdx + 3] = alpha;
      }
    }
    maskCtx.putImageData(maskImageData, 0, 0);

    // Upscale mask to original dimensions W x H with high-quality smoothing
    const fullMaskCanvas = document.createElement('canvas');
    fullMaskCanvas.width = origW;
    fullMaskCanvas.height = origH;
    const fullCtx = fullMaskCanvas.getContext('2d');
    fullCtx.imageSmoothingEnabled = true;
    fullCtx.imageSmoothingQuality = 'high';
    fullCtx.drawImage(maskCanvas, 0, 0, origW, origH);

    const maskBlob = await new Promise((resolve) => fullMaskCanvas.toBlob(resolve, 'image/png'));

    return {
      maskBlob,
      width: origW,
      height: origH,
      deviceUsed: currentDevice
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
