// Checks the ledger repair end to end, the way hooks.json runs it, on a throwaway ledger and transcript:
// a row without a model gets one, every other byte stays, and a session with no transcript stays empty.
// Needs only Node. Usage: node scripts/repair-check.mjs
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { CSV_HEADER } = createRequire(import.meta.url)(join(ROOT, 'hooks', 'ponytail-band-import.js'))
const work = mkdtempSync(join(tmpdir(), 'repair-check-'))
const ledger = join(work, 'xdg', 'ponytail', 'band')
const project = join(work, 'claude', 'projects', 'p')
mkdirSync(ledger, { recursive: true })
mkdirSync(project, { recursive: true })
const reply = model => JSON.stringify({ type: 'assistant', message: { model } })
writeFileSync(join(project, 'aaaaaaaa-1.jsonl'), [reply('claude-opus-5-5'), reply('<synthetic>'), reply('claude-opus-5-5'), reply('claude-sonnet-5-5'), 'not json'].join('\n'))

const row = (key, name, model) => `${key},2026-11-10 10:00,demo,${name},1.00,1,1.0,10,5,,0,0,0,not run,full,${model}`
const hole = row('aaaaaaaa-1', '"a, quoted ""name"""', '')
// An older row one column short: it also ends in a comma, but its last column is not the model.
writeFileSync(join(project, 'cccccccc-1.jsonl'), reply('claude-opus-5-5'))
const short = 'cccccccc-1,2026-11-10 10:00,demo,short,1.00,1,1.0,10,5,,0,0,0,not run,'
const before = [CSV_HEADER, hole, row('aaaaaaaa-2', 'kept', 'claude-haiku-5-5'), row('bbbbbbbb-1', 'no transcript', ''), short, ''].join('\n')
const expected = before.replace(hole, `${hole}claude-opus-5-5`)
const file = join(ledger, 'demo-aaaaaaaa.csv')
writeFileSync(file, before)

const env = { ...process.env, CLAUDE_PLUGIN_ROOT: ROOT, CLAUDE_CONFIG_DIR: join(work, 'claude'), XDG_CONFIG_HOME: join(work, 'xdg') }
const hooks = JSON.parse(readFileSync(join(ROOT, 'hooks', 'hooks.json'), 'utf8')).hooks
const hook = hooks.SessionStart.flatMap(group => group.hooks).find(h => h.command.endsWith(' repair'))
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

const started = spawnSync(hook.command, { shell: true, env, input: '{}', timeout: 5000 })
check('the hook returns at once and prints nothing', started.status === 0 && String(started.stdout) === '' && String(started.stderr) === '')
// The repair itself runs detached: wait for it.
for (let i = 0; i < 100 && readFileSync(file, 'utf8') !== expected; i++) await new Promise(done => setTimeout(done, 100))
check('only the empty model with a transcript is filled', readFileSync(file, 'utf8') === expected)
check('no temporary file is left', readdirSync(ledger).join() === 'demo-aaaaaaaa.csv')
const again = spawnSync(process.execPath, [join(ROOT, 'hooks', 'ponytail-band-import.js'), '--repair'], { env, timeout: 20000 })
check('a second run changes nothing', again.status === 0 && readFileSync(file, 'utf8') === expected, String(again.stdout).trim())
const none = spawnSync(hook.command, { shell: true, env: { ...env, XDG_CONFIG_HOME: join(work, 'nothing') }, input: '{}', timeout: 5000 })
check('a machine with no ledger is fine', none.status === 0)

// shortcut: a folder still held by the last detached run is left to the system.
try {
  rmSync(work, { recursive: true, force: true })
} catch {}
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
