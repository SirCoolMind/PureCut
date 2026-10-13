/**
 * Custom background replacement: a user-supplied photo shown behind the cutout,
 * and a flattened export of the two.
 *
 * The background is cover-fitted to the cutout's own dimensions (centred, cropped,
 * never stretched), the same way the viewport previews it, so the download looks
 * like what is on screen. The flattened image is fully opaque, so it is encoded as
 * JPEG: a 12 MP photo-on-photo PNG would be several times larger for no gain.
 *
 * `compositeUrl` follows `resultBlob`, so brush edits and tuning changes reach the
 * export as soon as the compositor publishes a new cutout. A generation counter
 * drops a stale render that finishes after a newer one started.
 *
 * The chosen background outlives the image: it is a backdrop preference, so the
 * next photo opens on the same one until the user clears or replaces it.
 */

import { ref, watch, type Ref } from 'vue'

interface CustomBackgroundDeps {
  /** PNG blob of the current cutout, from the compositor. */
  resultBlob: Ref<Blob | null>
}

/** Draw `img` over the whole `w` x `h` canvas, centred and cropped like CSS `object-fit: cover`. */
function drawCover(ctx: CanvasRenderingContext2D, img: ImageBitmap, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

export function useCustomBackground({ resultBlob }: CustomBackgroundDeps) {
  /** Object URL of the chosen background photo; null when none is set. */
  const backgroundUrl = ref<string | null>(null)
  /** Object URL of the flattened cutout-on-background JPEG; null until rendered. */
  const compositeUrl = ref<string | null>(null)

  let backgroundFile: File | null = null
  let generation = 0

  async function renderComposite() {
    const run = ++generation
    const cutout = resultBlob.value
    if (!cutout || !backgroundFile) {
      setComposite(null)
      return
    }
    try {
      const [fg, bg] = await Promise.all([createImageBitmap(cutout), createImageBitmap(backgroundFile)])
      const canvas = document.createElement('canvas')
      canvas.width = fg.width
      canvas.height = fg.height
      const ctx = canvas.getContext('2d')!
      drawCover(ctx, bg, fg.width, fg.height)
      ctx.drawImage(fg, 0, 0)
      fg.close()
      bg.close()
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
      if (run === generation) setComposite(blob ? URL.createObjectURL(blob) : null)
    } catch (err) {
      console.error('[PureCut] Background composite failed:', err)
      if (run === generation) setComposite(null)
    }
  }

  function setComposite(url: string | null) {
    if (compositeUrl.value) URL.revokeObjectURL(compositeUrl.value)
    compositeUrl.value = url
  }

  function setBackgroundFile(file: File) {
    if (!file.type.startsWith('image/')) return
    if (backgroundUrl.value) URL.revokeObjectURL(backgroundUrl.value)
    backgroundFile = file
    backgroundUrl.value = URL.createObjectURL(file)
    renderComposite()
  }

  function clearBackground() {
    if (backgroundUrl.value) URL.revokeObjectURL(backgroundUrl.value)
    backgroundUrl.value = null
    backgroundFile = null
    renderComposite()
  }

  watch(resultBlob, renderComposite)

  return { backgroundUrl, compositeUrl, setBackgroundFile, clearBackground }
}
