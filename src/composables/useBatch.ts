/**
 * Batch mode: run several images through the selected model and tuning, then
 * download every cutout in one ZIP.
 *
 * It deliberately bypasses the studio's per-image state (canvas store, undo,
 * subjects): each file is decoded, segmented and composited with `renderCutout`
 * in isolation, so a batch never disturbs whatever is open in the workspace.
 * Files run one at a time - the model holds a single session, and parallel
 * inference would only contend for the same GPU or WASM threads.
 *
 * The ZIP is built once the queue drains (or is cancelled) from the cutouts that
 * succeeded; failed files are listed with their error instead of aborting the run.
 */

import { reactive } from 'vue'
import { runTransformersModel } from '../aiEngine.js'
import { cachedModelKey } from '../core/storageKeys.js'
import { createZip, uniqueNames } from '../core/zip.js'
import { renderCutout, type Tuning } from './useCompositor.js'

type BatchStatus = 'queued' | 'running' | 'done' | 'error' | 'skipped'

interface BatchItem {
  name: string
  status: BatchStatus
  error?: string
}

interface BatchDeps {
  selectedModel: { value: string }
  selectedDevice: { value: string }
  currentModelMeta: { value: any }
  ttaFlipFusion: { value: boolean }
  cachedModels: Record<string, boolean>
  tuning: Tuning
}

/** "holiday.jpg" -> "holiday-cutout.png" */
function cutoutName(fileName: string) {
  const dot = fileName.lastIndexOf('.')
  return `${dot > 0 ? fileName.slice(0, dot) : fileName || 'image'}-cutout.png`
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png')
  )
}

export function useBatch({ selectedModel, selectedDevice, currentModelMeta, ttaFlipFusion, cachedModels, tuning }: BatchDeps) {
  const batch = reactive({
    /** Panel visible. */
    open: false,
    /** Queue still draining. */
    running: false,
    cancelRequested: false,
    items: [] as BatchItem[],
    /** Status line for the item in flight (model download / inference pass). */
    message: '',
    /** Object URL of the finished ZIP, revoked when the panel closes. */
    zipUrl: null as string | null,
    zipName: ''
  })

  async function processOne(file: File) {
    const bitmap = await createImageBitmap(file)
    try {
      const result = await runTransformersModel(
        file,
        selectedModel.value,
        currentModelMeta.value.dtype,
        currentModelMeta.value.disableOptimization,
        selectedDevice.value,
        (progress: any) => { if (progress?.message) batch.message = progress.message },
        { tta: ttaFlipFusion.value }
      )
      cachedModels[selectedModel.value] = true
      localStorage.setItem(cachedModelKey(selectedModel.value), 'true')

      const mask = await createImageBitmap(result.maskBlob)
      try {
        return await canvasToPng(renderCutout(bitmap, mask, bitmap.width, bitmap.height, tuning))
      } finally {
        mask.close()
      }
    } finally {
      bitmap.close()
    }
  }

  async function runBatch(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (!images.length || batch.running) return
    closeBatch()

    batch.items = images.map((f) => ({ name: f.name || 'image', status: 'queued' }))
    batch.open = true
    batch.running = true
    batch.cancelRequested = false

    const names = uniqueNames(images.map((f) => cutoutName(f.name)))
    const entries: { name: string; data: Uint8Array }[] = []

    for (let i = 0; i < images.length; i++) {
      const item = batch.items[i]
      if (batch.cancelRequested) {
        item.status = 'skipped'
        continue
      }
      item.status = 'running'
      batch.message = 'Preparing...'
      try {
        const png = await processOne(images[i])
        entries.push({ name: names[i], data: new Uint8Array(await png.arrayBuffer()) })
        item.status = 'done'
      } catch (err: any) {
        console.error(`[PureCut] Batch item failed: ${item.name}`, err)
        item.status = 'error'
        item.error = err?.message || 'Processing failed'
      }
    }

    batch.message = ''
    if (entries.length) {
      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
      batch.zipName = `purecut-batch-${stamp}.zip`
      batch.zipUrl = URL.createObjectURL(new Blob([createZip(entries)], { type: 'application/zip' }))
      downloadZip()
    }
    batch.running = false
  }

  function downloadZip() {
    if (!batch.zipUrl) return
    const a = document.createElement('a')
    a.href = batch.zipUrl
    a.download = batch.zipName
    a.click()
  }

  /** Stop after the image in flight; what finished so far still goes into the ZIP. */
  function cancelBatch() {
    batch.cancelRequested = true
  }

  function closeBatch() {
    if (batch.running) return
    if (batch.zipUrl) URL.revokeObjectURL(batch.zipUrl)
    batch.zipUrl = null
    batch.open = false
    batch.items = []
  }

  return { batch, runBatch, cancelBatch, closeBatch, downloadZip }
}
