const $ = (id) => document.getElementById(id)
const points = []
const maxPoints = 48

function pathFor(values, maximum) {
  if (!values.length) return ''
  return values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100
    const y = 39 - Math.min(1, value / maximum) * 36
    return `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
}

function update({ detail: sys }) {
  if (!sys?.ram || !sys?.cpu) return
  points.push({ ram: sys.ram.totalMb, cpu: sys.cpu.loadPercent })
  if (points.length > maxPoints) points.shift()

  const ramCeiling = Math.max(1024, ...points.map((point) => point.ram))
  $('ramLine').setAttribute('d', pathFor(points.map((point) => point.ram), ramCeiling))
  $('cpuLine').setAttribute('d', pathFor(points.map((point) => point.cpu), 100))
  $('timelineLatest').textContent = `${sys.ram.totalMb.toLocaleString()} MB · ${sys.cpu.loadPercent}% CPU`

  const active = sys.ram.activeRun
  $('timelineRun').textContent = active
    ? `${active.checkpoint} · ${active.image}`
    : sys.ram.engineWarm
      ? `Warm: ${sys.ram.activeModel || 'model loaded'}`
      : 'Idle — no model is running'
}

document.addEventListener('rmbg2:system', update)