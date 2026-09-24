/**
 * rmbg2-report.mjs — the self-contained HTML report for the RMBG-2.0 lab.
 *
 * One dependency-free file: previews embedded as data URIs, full-size PNGs linked
 * by relative path. It has to open by double-clicking from a folder that is not
 * served, which is why nothing here is loaded from a CDN.
 *
 * Split out of `rmbg2.mjs` when that file crossed the repo's 800-line budget.
 * Pure presentation over the run results - no I/O, no ONNX, no sharp.
 */

export function buildReport({ session, results }) {
  const ok = results.filter((r) => !r.error)
  const totalInference = ok.reduce((sum, r) => sum + r.timings.inferenceMs, 0)

  const cards = results.map(renderCard).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex, nofollow">
<title>PureCut x RMBG-2.0 local report</title>
<style>
  :root { color-scheme: dark }
  body { margin:0; padding:32px; background:#080c14; color:#f1f5f9;
         font:14px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif }
  h1 { margin:0 0 4px; font-size:22px }
  .sub { color:#8b9bb4; margin:0 0 24px }
  .card { background:#0e1420; border:1px solid #1e293b; border-radius:14px;
          padding:20px; margin-bottom:22px }
  .card.fail { border-color:#7f1d1d }
  header { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:16px }
  header h2 { margin:0; font-size:15px; font-weight:600 }
  .badge { font-size:11px; padding:3px 9px; border-radius:99px;
           background:#1a2434; color:#9fb2cc; border:1px solid #24344c }
  .badge.warn { background:#3a2a12; color:#f0c274; border-color:#5c4218 }
  .badge.bad { background:#3a1414; color:#f0a0a0; border-color:#5c1818 }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:14px }
  figure { margin:0 }
  figure img { width:100%; border-radius:9px; display:block; background:#0b1120 }
  figcaption { font-size:11px; color:#8b9bb4; margin-top:7px }
  .meta { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
          gap:8px 20px; margin:18px 0 0; padding-top:16px; border-top:1px solid #1e293b }
  .meta div { display:flex; justify-content:space-between; gap:12px }
  dt { color:#8b9bb4; font-size:12px }
  dd { margin:0; font-size:12px; font-variant-numeric:tabular-nums;
       word-break:break-all; text-align:right }
  a { color:#7fb3e8 }
  pre.err { background:#160c0c; border:1px solid #4c1d1d; border-radius:9px;
            padding:12px; color:#f0a0a0; white-space:pre-wrap; margin:0 }
  .legend { color:#8b9bb4; font-size:12px; margin:0 0 22px; max-width:88ch }
  .legend code { background:#131c2b; padding:1px 5px; border-radius:4px }
</style>
</head>
<body>
  <h1>PureCut &times; RMBG-2.0 &mdash; local CPU report</h1>
  <p class="sub">
    ${escapeHtml(session.model)} &rarr; ${escapeHtml(session.file)} &middot;
    provider <strong>${escapeHtml(session.provider)}</strong><br>
    session load ${(session.loadMs / 1000).toFixed(1)}s &middot;
    ${ok.length}/${results.length} succeeded &middot;
    ${(totalInference / 1000).toFixed(1)}s total inference &middot;
    generated ${new Date().toISOString()}
  </p>
  ${
    session.provider === 'cpu'
      ? ''
      : `<p class="legend"><strong>Non-CPU provider.</strong> These timings come from
         <code>${escapeHtml(session.provider)}</code>, so they are NOT comparable with the
         CPU figures recorded in AGENTS.md, and a GPU provider can change mask values
         slightly. Re-check the anchor sample before trusting quality.</p>`
  }
  <p class="legend">
    <strong>coverage</strong> is the share of pixels the mask calls subject
    (alpha &ge; 0.5). <strong>mean alpha</strong> is its average, which is a
    different number whenever the mask does not saturate. A
    <strong>weak separation</strong> badge means the mask never gets near 0 or 1,
    so the model is unsure - judge those against the raw mask, not the number.
  </p>
${cards}
</body>
</html>`
}

function renderCard(result) {
  if (result.error) {
    return `<article class="card fail">
  <header><h2>${escapeHtml(result.name)}</h2><span class="badge bad">failed</span></header>
  <pre class="err">${escapeHtml(result.error)}</pre>
</article>`
  }

  const total = result.timings.preprocessMs + result.timings.inferenceMs + result.timings.postprocessMs
  const slow = result.timings.inferenceMs > total * 0.9
  const weak = result.mask.separation !== 'strong'

  return `<article class="card">
  <header>
    <h2>${escapeHtml(result.name)}</h2>
    <span class="badge">${result.width}&times;${result.height}</span>
    <span class="badge ${slow ? 'warn' : ''}">inference ${(result.timings.inferenceMs / 1000).toFixed(1)}s</span>
    <span class="badge ${weak ? 'warn' : ''}">coverage ${(result.mask.coverage * 100).toFixed(1)}%</span>
    <span class="badge ${weak ? 'warn' : ''}">${result.mask.separation} separation</span>
  </header>

  <div class="grid">
    <figure><img src="data:image/jpeg;base64,${result.previews.original}" alt="original"><figcaption>original</figcaption></figure>
    <figure><img src="data:image/png;base64,${result.previews.cutout}" alt="cutout"><figcaption>cutout (alpha over checkerboard)</figcaption></figure>
    <figure><img src="data:image/png;base64,${result.previews.mask}" alt="mask"><figcaption>raw mask</figcaption></figure>
  </div>

  <dl class="meta">
    <div><dt>provider</dt><dd>${escapeHtml(result.timings.provider || 'cpu')}</dd></div>
    <div><dt>preprocess</dt><dd>${result.timings.preprocessMs} ms</dd></div>
    <div><dt>inference</dt><dd>${(result.timings.inferenceMs / 1000).toFixed(2)} s</dd></div>
    <div><dt>postprocess</dt><dd>${result.timings.postprocessMs} ms</dd></div>
    <div><dt>total</dt><dd>${(total / 1000).toFixed(2)} s</dd></div>
    <div><dt>output tensor</dt><dd>${escapeHtml(result.mask.outputName)} ${JSON.stringify(result.mask.dims)}</dd></div>
    <div><dt>mask range</dt><dd>${result.mask.min} .. ${result.mask.max}</dd></div>
    <div><dt>coverage (alpha &ge; 0.5)</dt><dd>${(result.mask.coverage * 100).toFixed(1)}%</dd></div>
    <div><dt>mean alpha</dt><dd>${(result.mask.meanAlpha * 100).toFixed(1)}%</dd></div>
    <div><dt>files</dt><dd><a href="${result.files.cutout}">${result.files.cutout}</a></dd></div>
  </dl>
</article>`
}

/**
 * The results carry model ids and file names, but also error messages, which can
 * quote a URL. Escaping all four HTML-significant characters keeps a narrow
 * injection (e.g. a crafted `--model=`) from turning into markup.
 */
export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
}