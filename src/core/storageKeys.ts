/**
 * Canonical `localStorage` keys for PureCut.
 *
 * These strings were previously duplicated across `App.vue`, `SettingsModal.vue`
 * and `aiEngine.js`, where a typo would silently produce a "reset" that showed no
 * error. Import from here instead of writing the literal.
 *
 * NOT covered by this module (deliberately):
 *   - `index.html` has an inline bootstrap script that reads
 *     `purecut_font_size` before any module loads, to avoid a flash of
 *     wrongly-sized UI. It cannot import from here, so that one copy is
 *     intentionally duplicated. If you rename the key, update index.html too.
 *   - Transformers.js / ONNX write their own cache entries via the CacheStorage
 *     and IndexedDB APIs. Those are not managed here.
 */

/** Keys holding a single scalar value. */
export const STORAGE_KEYS = {
  /** Optional Hugging Face access token, used to work around 429 rate limits. */
  hfToken: 'purecut_hf_token',
  /** UI font scale. One of {@link FONT_SIZES}. Mirrored in index.html. */
  fontSize: 'purecut_font_size',
  /** Whether to confirm before re-running the model on a model switch: 'true' | 'false'. */
  promptModelChange: 'purecut_prompt_model_change',
  /** Whether two-pass TTA Flip Fusion is active: 'true' | 'false'. */
  ttaFlipFusion: 'purecut_tta_flip_fusion'
} as const

/**
 * Per-model "weights are cached" flag, one key per model id.
 * @example cachedModelKey('briaai/RMBG-1.4') // 'purecut_cached_briaai/RMBG-1.4'
 */
export const cachedModelKey = (modelId: string): string => `purecut_cached_${modelId}`

/** Valid values for {@link STORAGE_KEYS.fontSize}. */
export const FONT_SIZES = ['compact', 'normal', 'medium', 'large'] as const

/** Element of {@link FONT_SIZES}. */
export type FontSize = (typeof FONT_SIZES)[number]

/** Applied when nothing is stored yet, or when the stored value is unusable. */
export const DEFAULT_FONT_SIZE: FontSize = 'normal'
