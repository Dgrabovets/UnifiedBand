import { existsSync } from 'node:fs'
import { Config } from '@remotion/cli/config'

// The screenshots live in ../docs/images, so the docs folder is the public folder.
Config.setPublicDir('../docs')
Config.setVideoImageFormat('jpeg')
Config.setOverwriteOutput(true)

// Remotion's own headless shell does not unpack on every machine; a Chrome that is already installed does the job.
const chrome = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(path => path && existsSync(path))
if (chrome) Config.setBrowserExecutable(chrome)
