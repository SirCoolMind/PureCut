/**
 * Image intake: file picker, drag & drop, paste, clipboard copy, and the two
 * confirmations that guard the current workspace: the "replace the current
 * image?" prompt for incoming files, and the "start over?" prompt for the New
 * button.
 *
 * `onFileSelect` / `onDrop` / `onPaste` all funnel into `confirmAndProcessImage()`,
 * which either hands the file straight to `processImage()` or stages it behind the
 * replace-image prompt when a cutout is already on screen. The staged thumbnail is
 * an object URL, so every exit path revokes it.
 *
 * Dependencies arrive as parameters rather than imports, so this module's
 * signature is its whole contract:
 *  - `originalUrl`  non-null once an image is loaded - that is what turns a new
 *                   file into a prompt instead of an immediate re-process
 *  - `resultBlob`   the PNG the compositor produced, copied by copyToClipboard
 *  - `copied`       from useWorkspaceUi; drives the "Copied!" button state
 *  - `processImage` the AI pipeline, owned by useProcessing
 *
 * `currentFileBlob` deliberately does NOT live here: useProcessing must be wired
 * before this module (it supplies processImage), and it needs the current file, so
 * App.vue declares that ref and passes it to both.
 *
 * `fileInput` is bound in the template (`ref="fileInput"`), so it must stay
 * exposed under that exact name.
 *
 * Extracted verbatim from App.vue's script during the AI-context refactor; no
 * behaviour was changed.
 */

import { ref, type Ref } from 'vue'

interface ImageInputDeps {
  /** Non-null once an image has been loaded. */
  originalUrl: Ref<string | null>
  /** PNG blob of the current cutout; null until one exists. */
  resultBlob: Ref<Blob | null>
  /** "Copied!" flag, owned by useWorkspaceUi. */
  copied: Ref<boolean>
  /** The AI pipeline. Called with the accepted file. */
  processImage: (file: File) => Promise<void>
}

export function useImageInput({ originalUrl, resultBlob, copied, processImage }: ImageInputDeps) {
  /** Template ref for the hidden file input. */
  const fileInput = ref<HTMLInputElement | null>(null)

  // Staged replacement, live only while the replace-image prompt is open
  const showReplaceImagePrompt = ref(false)
  const pendingNewImageFile = ref<File | null>(null)
  const pendingNewImageThumbnail = ref<string | null>(null)

  // "Start over?" confirmation, shown when New is pressed while a workspace is
  // open. It has nothing staged - the image already on screen is the one that
  // would be discarded, so it previews `originalUrl` itself.
  const showNewImagePrompt = ref(false)

  function requestNewImage() {
    showNewImagePrompt.value = true
  }

  function cancelNewImage() {
    showNewImagePrompt.value = false
  }

  /**
   * Close the prompt and let the caller discard the workspace.
   *
   * The actual reset stays in App.vue's `reset()`, because that is where every
   * per-image ref and the canvases are cleared - this composable only owns the
   * confirmation that guards it.
   */
  function confirmNewImage() {
    showNewImagePrompt.value = false
  }

  function confirmAndProcessImage(file: File) {
    if (originalUrl.value) {
      pendingNewImageFile.value = file
      if (pendingNewImageThumbnail.value) {
        URL.revokeObjectURL(pendingNewImageThumbnail.value)
      }
      pendingNewImageThumbnail.value = URL.createObjectURL(file)
      showReplaceImagePrompt.value = true
    } else {
      processImage(file)
    }
  }

  function confirmReplaceImage() {
    const file = pendingNewImageFile.value
    showReplaceImagePrompt.value = false
    if (pendingNewImageThumbnail.value) {
      URL.revokeObjectURL(pendingNewImageThumbnail.value)
      pendingNewImageThumbnail.value = null
    }
    pendingNewImageFile.value = null
    if (file) {
      processImage(file)
    }
  }

  function cancelReplaceImage() {
    showReplaceImagePrompt.value = false
    if (pendingNewImageThumbnail.value) {
      URL.revokeObjectURL(pendingNewImageThumbnail.value)
      pendingNewImageThumbnail.value = null
    }
    pendingNewImageFile.value = null
  }

  // Event Handlers
  function onFileSelect(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) confirmAndProcessImage(file)
  }

  function onDrop(e: DragEvent) {
    const file = e.dataTransfer?.files?.[0]
    if (file) confirmAndProcessImage(file)
  }

  function onPaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          confirmAndProcessImage(file)
          break
        }
      }
    }
  }

  async function copyToClipboard() {
    if (!resultBlob.value) return
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': resultBlob.value })
      ])
      copied.value = true
      setTimeout(() => (copied.value = false), 2000)
    } catch (err) {
      console.error('Clipboard copy failed:', err)
    }
  }

  return {
    fileInput,
    showReplaceImagePrompt,
    showNewImagePrompt,
    pendingNewImageFile,
    pendingNewImageThumbnail,
    confirmAndProcessImage,
    confirmReplaceImage,
    cancelReplaceImage,
    requestNewImage,
    confirmNewImage,
    cancelNewImage,
    onFileSelect,
    onDrop,
    onPaste,
    copyToClipboard
  }
}
