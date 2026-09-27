import { chromium } from 'playwright'
import path from 'node:path'

const baseUrl = process.env.PURECUT_URL || 'http://localhost:5177'
const imagePath = path.resolve('public/Example1.jpg')
const outputDirectory = path.resolve('public')
const models = [
  ['briaai/RMBG-1.4', 'rmbg'],
  ['onnx-community/ISNet-ONNX', 'isnet'],
  ['Xenova/modnet', 'modnet'],
  ['onnx-community/BiRefNet_512x512-ONNX', 'birefnet']
]

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 900 }
})

try {
  for (const [modelId, modelName] of models) {
    console.log(`Generating Winter ${modelName}...`)
    const page = await context.newPage()
    await page.goto(baseUrl, { waitUntil: 'networkidle' })
    await page.locator('.model-picker-select').selectOption(modelId)
    await page.locator('.dropzone-card input[type=file]').setInputFiles(imagePath)
    await page.locator('.result-img').waitFor({ timeout: 900_000 })

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.btn-cta[download]').click()
    ])
    const outputPath = path.join(outputDirectory, `winter-${modelName}-tta.png`)
    await download.saveAs(outputPath)
    await page.close()
    console.log(`Saved ${outputPath}`)
  }
} finally {
  await context.close()
  await browser.close()
}
