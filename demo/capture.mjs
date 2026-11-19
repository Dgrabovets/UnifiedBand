// Takes the screenshots of the Board for the README and the video.
// Usage: npm run board && npm run shots   (needs Chrome or Edge; set CHROME_PATH to use another browser)
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '..', 'docs', 'images')
mkdirSync(out, { recursive: true })

const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)
const executablePath = candidates.find(existsSync)
if (!executablePath) throw new Error('No Chrome or Edge found. Set CHROME_PATH.')

const browser = await puppeteer.launch({ executablePath, headless: true, defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1.5 } })
const page = await browser.newPage()
await page.goto(pathToFileURL(join(here, 'board-demo.html')).href)
const wait = ms => new Promise(r => setTimeout(r, ms))
await wait(1500)

const tab = async id => {
  await page.evaluate(i => document.querySelector(`[data-tab="${i}"]`).click(), id)
  await wait(2600)
  await page.evaluate(() => window.scrollTo(0, 0))
}
const shot = async name => page.screenshot({ path: join(out, `${name}.png`) })

await tab('overview')
await wait(3500)
await shot('overview')
const section = await page.$('#sec-projects')
await section.scrollIntoView()
await wait(600)
await section.screenshot({ path: join(out, 'projects.png') })

for (const id of ['context', 'reuse', 'router', 'plans', 'runs', 'extras']) {
  await tab(id)
  await shot(id)
}

await tab('overview')
await page.evaluate(() => document.getElementById('export-all').click())
await wait(900)
await shot('export')
await page.evaluate(() => document.getElementById('export-close').click())
await wait(400)

await page.evaluate(() => document.getElementById('share').click())
await wait(2800)
await shot('share-card')
await browser.close()
console.log('Screenshots written to', out)
