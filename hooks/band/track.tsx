import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { boardHtml, tasksFrom } from './board'
import type { Band } from '../../types'
import { boardExtra } from './events'
import { afterPrompt, afterStart, afterTurn, countEdit } from './live'
import {
  GREP_DEFS,
  NO_TOKENS,
  addTokens,
  addedLines,
  callsIn,
  defsIn,
  hits,
  inProject,
  isCode,
  isSource,
  isTestCommand,
  mainModel,
  lastCache,
  parseDefs,
  percent,
  resume,
  snapshot,
  testCounts,
  sessionTitle,
  taskKey,
  TITLE_RECORD,
  upsertCsv,
  webhookRequest,
} from './metrics'

const LEVELS = ['off', 'lite', 'full', 'ultra']
const EMPTY: Band = {
  level: 'off',
  model: '',
  cost: 0,
  spent: 0,
  turns: 0,
  turnCosts: [],
  tokens: NO_TOKENS,
  busyMs: 0,
  name: '',
  project: '',
  session: '',
  transcript: '',
  reused: [],
  created: [],
  removed: [],
  openCallers: [],
  tests: { state: 'none' },
  details: false,
}
// The counters of one task: what a new session or /clear starts over.
const TASK = {
  spent: 0,
  turns: 0,
  turnCosts: [],
  tokens: NO_TOKENS,
  busyMs: 0,
  name: '',
  model: '',
  reused: [],
  created: [],
  removed: [],
  openCallers: [],
  tests: { state: 'none' as const },
}
const band = atom({ plugin: 'unified-band', key: 'band' } as const, EMPTY)
// State kept from an older version of the band lacks newer fields.
const load = async ($: EngineInterface): Promise<Band> => ({ ...EMPTY, ...(await read($, band)) })

const union = (a: string[], b: string[]) => [...new Set([...a, ...b])]
const base = (path: string) => path.replace(/\/+$/, '').split('/').pop() ?? path

// Windows sets USERPROFILE, not HOME.
const home = async ($: EngineInterface) => (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
const claudeDir = async ($: EngineInterface) => (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await home($)}/.claude`

// The level ponytail's own hooks write. Absent flag = off.
// shortcut: the shared flag the statusline reads, so two sessions in different repos show the last switch; read the per-project flag if that matters.
async function readLevel($: EngineInterface): Promise<string> {
  const dir = await claudeDir($)
  try {
    const level = (await $.fs.read(`${dir}/.ponytail-active`)).trim()
    return LEVELS.includes(level) ? level : 'off'
  } catch {
    return 'off'
  }
}

type Options = { readonly [field: string]: unknown }

// The session's sidebar name. grep, because $.fs.read refuses files over 4 MiB and transcripts grow past that.
// shortcut: without grep (Windows) only a transcript under 4 MiB is read; findstr would lift that.
async function readTitle($: EngineInterface, transcript: string): Promise<string | undefined> {
  if (transcript === '') return undefined
  const grep = await $.process.run(['grep', '-F', TITLE_RECORD, transcript]).catch(() => undefined)
  const text = grep !== undefined && grep.exitCode <= 1 ? grep.stdout : await $.fs.read(transcript).catch(() => '')
  return sessionTitle(text)
}

// The end of the transcript. grep is not on Windows and $.fs.read refuses a file over 4 MiB, so node reads the tail itself.
// shortcut: the last 512 KiB only, so the model is the one of the recent replies; a node-less machine reads the whole file when it is small enough.
const TAIL_BYTES = 524288
const TAIL_SCRIPT =
  "const fs=require('fs');const f=fs.openSync(process.argv[1],'r');const s=fs.fstatSync(f).size;const b=Buffer.alloc(Math.min(Number(process.argv[2]),s));fs.readSync(f,b,0,b.length,s-b.length);process.stdout.write(b.toString('utf8'))"
async function readTail($: EngineInterface, transcript: string): Promise<string> {
  if (transcript === '') return ''
  const run = await $.process.run(['node', '-e', TAIL_SCRIPT, transcript, String(TAIL_BYTES)]).catch(() => undefined)
  return run?.exitCode === 0 ? run.stdout : await $.fs.read(transcript).catch(() => '')
}

// Where Claude Code keeps the session's transcript: on managed, Team and Enterprise machines its cc-plugin-sec-default skips every classic.* hook, so no hook hands the path over.
// First the folder its rule names, then every project folder: it hashes names past 200 characters, and /cd, worktrees and /resume can put the file elsewhere.
// shortcut: with persistence off there is no file, so every turn checks every folder, read the path from the engine once it offers one.
async function findTranscript($: EngineInterface, session: string): Promise<string> {
  const projects = `${await claudeDir($)}/projects`
  const exists = (file: string) => $.fs.exists(file).catch(() => false)
  const root = await $.session.root().catch(() => '')
  const named = `${projects}/${root.replace(/[^a-zA-Z0-9]/g, '-')}/${session}.jsonl`
  if (root !== '' && (await exists(named))) return named
  const dirs = (await $.fs.list(projects).catch(() => [])).filter(d => d.kind === 'dir')
  // One at a time: thousands of checks in flight at once are slower than in turn.
  for (const dir of dirs) {
    const file = `${projects}/${dir.name}/${session}.jsonl`
    if (await exists(file)) return file
  }
  return ''
}

// Where the task ledgers and the board live.
// shortcut: ~/.config only (XDG respected); Windows would want %APPDATA%.
async function ledgerDir($: EngineInterface) {
  return `${(await $.env.get('XDG_CONFIG_HOME')) ?? `${await home($)}/.config`}/ponytail/band`
}

// One file per project and session: two sessions of a project never write the same file. writeBoard merges them all.
const ledgerFile = (dir: string, project: string, session: string) => `${dir}/${project.replace(/[^\w.-]/g, '_')}-${session.slice(0, 8).replace(/[^\w-]/g, '_')}.csv`

// After every turn: the task's row in a CSV per project, and the same row to a webhook if one is set.
async function record($: EngineInterface, b: Band, options: Options) {
  const startedAt = (await $.session.usage()).startedAt
  const row = snapshot(b, startedAt)
  if (options.ledger !== false && b.project !== '') {
    const dir = await ledgerDir($)
    const file = ledgerFile(dir, b.project, b.session)
    // A read that fails on a file that exists must not turn into an overwrite.
    const existing = (await $.fs.exists(file)) ? await $.fs.read(file).catch(() => undefined) : ''
    // $.fs.write creates the directory: no mkdir, which Windows does not have.
    if (existing !== undefined) await $.fs.write(file, upsertCsv(existing, row))
  }
  const url = typeof options.webhookUrl === 'string' ? options.webhookUrl.trim() : ''
  if (url !== '') {
    const token = typeof options.webhookToken === 'string' ? options.webhookToken.trim() : ''
    const request = webhookRequest(url, token, options.sendNames !== false, row)
    if ('refused' in request) {
      $.ui.status(`unified band: ${request.refused}`)
      return
    }
    // Not awaited: a slow endpoint must never hold up the turn.
    void $.http
      .fetch(request.url, request.init)
      .then(r => $.ui.status(r.ok ? undefined : `unified band: webhook answered ${r.status}`))
      .catch(() => $.ui.status('unified band: webhook unreachable'))
  }
}

// Builds board.html from every ledger file; a row that sits in two files (an older ledger) counts once.
export async function writeBoard($: EngineInterface, dir: string) {
  const entries = await $.fs.list(dir).catch(() => [])
  const texts = await Promise.all(entries.filter(f => f.kind === 'file' && f.name.endsWith('.csv')).map(f => $.fs.read(`${dir}/${f.name}`).catch(() => '')))
  const file = `${dir}/board.html`
  await $.fs.write(file, boardHtml([...new Map(texts.flatMap(tasksFrom).map(t => [t.key, t])).values()], await $.clock.now(), await boardExtra($).catch(() => undefined)))
  return file
}

// Sets the band up for a session (level, project, task row, cost baseline); returns the definitions that exist now.
async function start($: EngineInterface): Promise<Map<string, string>> {
  const grep = await $.process.run(['git', 'grep', '--untracked', '-nE', GREP_DEFS]).catch(() => undefined)
  const level = await readLevel($)
  const details = (await $.store.get('details')) === true
  const repo = await $.session.repo().catch(() => null)
  const project = base(repo?.root ?? (await $.session.cwd()))
  const session = await $.session.id()
  // The cost so far is the baseline for the last turn's own cost.
  const usage = await $.session.usage().catch(() => undefined)
  const csv = usage ? await $.fs.read(ledgerFile(await ledgerDir($), project, session)).catch(() => '') : ''
  const key = usage ? taskKey(session, usage.startedAt) : ''
  await update($, band, b => resume({ ...EMPTY, ...b, level, details, project, session, cost: usage?.cost?.usd ?? b.cost }, csv, key))
  return grep?.exitCode === 0 ? parseDefs(grep.stdout) : new Map()
}

export const track: Register = (on, options) => {
  // Definitions that existed when the session started: what new code can reuse.
  let known = new Map<string, string>()

  on('session.start', async ($, e, next) => {
    known = await start($)
    await afterStart($, options)
    return next(e)
  }).catch(($, e, next) => next(e))

  // /clear, /resume and /branch go on under another session id with an empty band and no session.start, so the band
  // showed "off" until the first turn ended. Set it up again once one of them has moved the session.
  // Only these commands: the engine labels a command's output with every plugin its hook chain ran through, so a hook on
  // every command printed "ponytail+<plugin>:" before other plugins' commands.
  // shortcut: after /clear, ponytail-activate.js may reset the flag to the default level after this, so a level switched
  // before /clear can show until the first turn ends; a session skips a plugin's classic.SessionStart hook, the one later point.
  on('command.run', { command: ['clear', 'resume', 'branch'] }, async ($, e, next) => {
    const session = await $.session.id()
    const result = await next(e)
    if ((await $.session.id()) !== session) known = await start($).catch(() => known)
    return result
  }).catch(($, e, next) => next(e))

  // /clear starts a new task: the counters start over, the cost baseline stays.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await update($, band, b => ({ ...EMPTY, ...b, ...TASK }))
    return next(e)
  }).catch(($, e, next) => next(e))

  // The first prompt names the task until the session has a sidebar name.
  on('prompt.submit', async ($, e, next) => {
    const text = e.text.trim()
    if (e.origin.kind !== 'plugin' && text !== '' && !text.startsWith('/')) {
      const name = (text.split('\n')[0] ?? '').slice(0, 60)
      await update($, band, b => (b.name === '' ? { ...EMPTY, ...b, name } : b))
    }
    await afterPrompt($, e)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    if (e.tool === 'Bash') {
      const ran = await next(e)
      if (ran.deny === undefined && isTestCommand(e.command)) {
        const tests = { state: ran.isError ? ('fail' as const) : ('pass' as const), ...testCounts(ran.text ?? '') }
        await update($, band, b => ({ ...b, tests }))
      }
      return ran
    }

    if (e.tool !== 'Edit' && e.tool !== 'Write') return next(e)

    const file = e.file_path
    // A scratch script outside the project is never reused or called by it (#1300).
    const repo = await $.session.repo().catch(() => null)
    if (!inProject(file, repo?.root ?? (await $.session.cwd()))) return next(e)
    const before = e.tool === 'Write' ? await $.fs.read(file).catch(() => '') : e.old_string
    const after = e.tool === 'Write' ? e.content : e.new_string
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran
    countEdit()

    const oldDefs = defsIn(file, before)
    const newDefs = defsIn(file, after)
    const created = isSource(file) ? newDefs.filter(n => !oldDefs.includes(n)) : []
    const removed = oldDefs.filter(n => !newDefs.includes(n))
    const reused = isSource(file) ? callsIn(addedLines(before, after), known, newDefs) : []

    await update($, band, b => ({
      ...b,
      reused: union(b.reused, reused),
      created: union(b.created, created),
      removed: union(b.removed, removed),
      tests: isCode(file) && b.tests.state !== 'none' ? { ...b.tests, state: 'stale' as const } : b.tests,
    }))

    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const used = e.usage
    if (e.agentId !== undefined) {
      // A subagent's tokens count; its cost is already in the session cost the main turn reads.
      if (used) await update($, band, b => ({ ...EMPTY, ...b, tokens: addTokens(b.tokens ?? NO_TOKENS, used) }))
      return next(e)
    }

    const usage = await $.session.usage()
    const turns = await $.session.turns()
    const level = await readLevel($)
    const { removed, transcript: saved } = await load($)
    const session = await $.session.id()
    // Here, not at start: the first turn writes the file, and a new id (/clear, /resume) or a move (/cd, a worktree) changes it.
    const kept = base(saved) === `${session}.jsonl` && (await $.fs.exists(saved).catch(() => false))
    const transcript = kept ? saved : await findTranscript($, session)
    const title = await readTitle($, transcript)
    const tail = await readTail($, transcript)
    const model = mainModel(tail)

    // A removed or renamed definition that is not defined again but still called somewhere.
    // shortcut: name match with git grep, so a same-named call in another module counts too.
    const stillRemoved: string[] = []
    const open: string[] = []
    for (const name of removed) {
      const grep = await $.process.run(['git', 'grep', '--untracked', '-nw', '-e', name]).catch(() => undefined)
      const rows = hits(grep?.stdout ?? '')
      if (rows.some(r => defsIn(r.file, r.text.trimStart()).includes(name))) continue
      const call = new RegExp(`(?<![\\w$])${name.replace(/\$/g, '\\$')}\\s*\\(`)
      const refs = rows.filter(r => call.test(r.text)).map(r => `${r.file}:${r.line}`)
      if (refs.length > 0) {
        stillRemoved.push(name)
        open.push(...refs)
      }
    }

    const b = await update($, band, x => {
      const b = { ...EMPTY, ...x }
      const cost = usage.cost?.usd ?? b.cost
      // A cost below the baseline means the engine started its ledger over.
      const turn = cost >= b.cost ? cost - b.cost : cost
      return {
        ...b,
        level,
        transcript,
        cost,
        // Cost and turns are the session's own totals, so a reload or a second band never starts them over.
        spent: usage.cost?.usd ?? b.spent + turn,
        turns,
        turnCosts: [...b.turnCosts, turn].slice(-20),
        tokens: used ? addTokens(b.tokens, used) : b.tokens,
        busyMs: b.busyMs + e.durationMs,
        name: title ?? b.name,
        model: model || b.model,
        removed: stillRemoved,
        openCallers: open,
      }
    })
    await record($, b, options).catch(() => $.ui.status('unified band: could not write the task ledger'))
    await afterTurn($, e, options, b, lastCache(tail))

    return next(e)
  }).catch(($, e, next) => next(e))
}
