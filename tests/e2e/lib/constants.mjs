/**
 * Shared constants and environment defaults for the PureCut e2e harness.
 *
 * Kept in one module so `regression.mjs` and every `checks/*.mjs` area agree on
 * the same values. Nothing here has side effects.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repository root (this file lives in tests/e2e/lib/). */
export const ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/** Where the app under test is served. The dev server must be running. */
export const BASE_URL = process.env.PURECUT_BASE_URL || 'http://localhost:5173'

/** Where screenshots land. Defaults under tests/artifacts/regression. */
export const ARTIFACTS = process.env.PURECUT_ARTIFACTS_DIR || path.join(ROOT, 'tests/artifacts/regression')

/**
 * Playwright profile directory. Kept OUT of the Vite-watched tree: writing
 * hundreds of cache files into the project root floods the dev server's file
 * watcher, which restarts the server mid-run and resets in-flight connections
 * (observed as ERR_CONNECTION_RESET while downloading model weights).
 * node_modules/ is gitignored and ignored by Vite's watcher by default.
 */
export const PROFILE = path.join(ROOT, 'node_modules/.cache/purecut-playwright-profile')

/** The image uploaded by the inference step. */
export const FIXTURE = path.join(ROOT, 'tests/fixtures/giselle-original.jpg')

/** First-run model download can be slow; give up only after five minutes. */
export const INFERENCE_TIMEOUT = 5 * 60 * 1000

/** Signature of a model-weights download failure (environment, not a regression). */
export const MODEL_FETCH_FAILURE = /ERR_CONNECTION_RESET|Failed to fetch|Processing error/i

/**
 * Known-benign network noise. Every entry is justified, and none of them can mask
 * a real failure because the outcome itself is asserted separately by the
 * "result image rendered" check:
 *   - tokenizer_config.json: an optional file transformers.js probes for on a
 *     segmentation checkpoint. Hugging Face returns 404 and the library continues.
 *   - favicon / ERR_ABORTED: browser housekeeping and navigation-cancelled requests.
 *   - ERR_CONNECTION_RESET: transformers.js retries these; if the download had
 *     genuinely failed, "result image rendered" would fail and so would the run.
 */
export const BENIGN_NOISE = [
  /tokenizer_config\.json/i,
  /favicon/i,
  /Download the React/i,
  /ERR_ABORTED/i,
  /ERR_CONNECTION_RESET/i
]

/** Visible label of each tool in the stage tool switcher. */
export const TOOL_LABELS = { slider: 'Compare', brush: 'Magic Brush', select: 'Select', pan: 'Pan' }

/** Font-scale cycle order, as written to the `data-font-size` attribute. */
export const FONT_ORDER = ['compact', 'normal', 'medium', 'large']

/** Font-scale cycle order, as shown in the badge. */
export const FONT_LABEL_ORDER = ['S', 'M', 'L', 'XL']

/** Backdrop switcher: className suffix -> visible button label. */
export const BACKDROPS = [
  ['white', 'White'],
  ['black', 'Dark'],
  ['gradient', 'Color'],
  ['checkerboard', 'Grid']
]

/** Tool switcher: tool key -> the interaction surface it must reveal. */
export const TOOLS = [
  ['brush', '.brush-interaction-surface'],
  ['select', '.selection-interaction-surface'],
  ['pan', '.pan-interaction-surface'],
  ['slider', '.slider-divider']
]

/**
 * Preset card -> the three power-user slider values and the de-fringe label it
 * promises to apply (threshold, feather, trim).
 */
export const PRESETS = [
  ['Fine Hair & Fur', ['0.4', '2', '-1'], 'Off'],
  ['Clean Product', ['0.6', '0', '1'], 'Active'],
  ['Deep / Cluttered BG', ['0.75', '0', '2'], 'Active'],
  ['Balanced', ['0.5', '1', '0'], 'Active']
]
