import { atom, read, update } from 'claude-code'
import type { EngineInterface, TurnCompleteInput } from 'claude-code'

import type { Band, Live } from '../../types'
import { NEGATIVE, RESULT, baseName, logEvent, routerLogPath } from './events'

type Options = { readonly [field: string]: unknown }

export const EMPTY_LIVE: Live = { branch: '', root: '', limits: [], tasks: null, prompts: 0, compactions: 0 }

export const live = atom({ plugin: 'unified-band', key: 'live' } as const, EMPTY_LIVE)

// What the model router decided in this session, read from the audit log it writes. Absent log: the router has never run.
// shortcut: $.fs.read refuses a log over 4 MiB (the built-in router rotates at 3 MiB; the original plugin at 5), then the card shows "No Log".
async function readRouter($: EngineInterface): Promise<Live['router']> {
  const text = await $.fs.read(await routerLogPath($)).catch(() => undefined)
  if (text === undefined) return undefined
  const id = await $.session.id()
  const rows = text
    .split('\n')
    .slice(-400)
    .flatMap(line => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })
    .filter(r => r.session_id === id)
  const last = rows[rows.length - 1]
  return {
    total: rows.length,
    routed: rows.filter(r => r.outcome !== 'silent').length,
    last: last && {
      model: String(last.decision?.model ?? ''),
      parent: String(last.decision?.parent ?? ''),
      tier: String(last.decision?.tier ?? ''),
      confidence: Number(last.decision?.confidence ?? 0),
      effort: String(last.decision?.effort ?? ''),
      reason: String(last.decision?.reason ?? ''),
      outcome: String(last.outcome ?? ''),
      at: Date.parse(last.ts),
    },
  }
}

// Pulls everything this band shows that is not Ponytail's: branch, usage, context and the checklist.
export async function refresh($: EngineInterface, options: Options) {
  const usage = await $.session.usage().catch(() => undefined)
  const repo = await $.session.repo().catch(() => null)
  const root = repo?.root ?? (await $.session.cwd())
  const git = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD']).catch(() => undefined)
  const file = typeof options.progressFile === 'string' && options.progressFile !== '' ? options.progressFile : 'PLAN.md'
  const text = await $.fs.read(`${root}/${file}`).catch(() => '')
  const boxes = text.match(/^\s*[-*]\s+\[[ xX]\]/gm) ?? []
  const done = boxes.filter(b => /x/i.test(b)).length
  const prompts = await $.session.turns().catch(() => 0)
  const router = await readRouter($)
  await update($, live, l => ({
    ...l,
    router,
    branch: git?.exitCode === 0 ? git.stdout.trim() : '',
    root,
    context: usage?.context.percent,
    limits: usage?.rateLimits ?? [],
    tasks: boxes.length > 0 ? { done, total: boxes.length } : null,
    startedAt: usage?.startedAt,
    prompts,
  }))
}


// A review or audit asked for in this turn, and the edits made in it. Both start over when the turn ends.
let pendingRun: 'review' | 'audit' | undefined
let edits = 0

// Called by the tool hook for every edit that lands in the project.
export const countEdit = () => {
  edits += 1
}

// Runs when a session starts or a turn ends: the part of the band that is not Ponytail's tracking.
export async function afterStart($: EngineInterface, options: Options) {
  await refresh($, options)
}

async function where($: EngineInterface) {
  const l = await read($, live)
  return { session: await $.session.id(), project: baseName(l.root), root: l.root, ts: await $.clock.now() }
}

// A prompt: whether a review or audit was asked for, and whether it was a short push back on the last answer.
export async function afterPrompt($: EngineInterface, e: { text: string }) {
  const text = e.text.trim()
  const run = /^[/@$](?:unified-band:)?ponytail-(review|audit)\b/.exec(text)
  if (run) pendingRun = run[1] === 'audit' ? 'audit' : 'review'
  if (text === '' || text.startsWith('/')) return
  const words = text.split(/\s+/).length
  await logEvent($, { t: 'prompt', ...(await where($)), words, neg: words <= 6 && NEGATIVE.test(text) })
}

// `tailCache` is the cache share read from the transcript, for an engine whose turn event carries no usage.
export async function afterTurn($: EngineInterface, e: TurnCompleteInput, options: Options, b: Band, tailCache?: number) {
  await refresh($, options)
  // A subagent's turn is not the session's last turn; the journal keeps its size for the Extras section.
  if (e.agentId !== undefined) {
    await logEvent($, { t: 'agent', ...(await where($)), ms: e.durationMs, tokens: e.usage ? e.usage.input + e.usage.output : 0 })
    return
  }
  const u = e.usage
  const total = u ? u.input + u.cacheRead + u.cacheWrite : 0
  const cache = total > 0 && u ? Math.round((u.cacheRead / total) * 100) : tailCache
  const at = await $.clock.now()
  await update($, live, l => ({ ...l, lastTurn: { ms: e.durationMs, cache, at } }))

  const l = await read($, live)
  const w = { session: b.session, project: baseName(l.root), root: l.root, ts: at }
  const five = l.limits.find(x => x.kind === 'five_hour')
  const seven = l.limits.find(x => x.kind === 'seven_day')
  const hit = RESULT.exec(e.text ?? '')
  const kind = hit ? hit[1] : pendingRun
  await logEvent($, {
    t: 'turn',
    ...w,
    ms: e.durationMs,
    cost: b.spent,
    turns: b.turns,
    level: b.level,
    model: b.model,
    ctx: l.context,
    five: five?.percentUsed,
    fiveReset: five?.resetsAt,
    seven: seven?.percentUsed,
    sevenReset: seven?.resetsAt,
    compactions: l.compactions,
    cache,
    tests: b.tests.state,
    reused: b.reused.length,
    created: b.created.length,
    callers: b.openCallers.length,
    edits,
    plan: l.tasks ?? undefined,
    router: l.router?.last,
  })
  if (kind) {
    await logEvent($, {
      t: 'run',
      ...w,
      kind,
      ms: e.durationMs,
      findings: hit ? Number(hit[2]) : undefined,
      high: hit && hit[3] !== undefined ? Number(hit[3]) : undefined,
      edits,
    })
  }
  pendingRun = undefined
  edits = 0
}

export async function afterCompact($: EngineInterface) {
  const l = await read($, live)
  await logEvent($, { t: 'compact', ...(await where($)), ctx: l.context })
}

export async function afterModelCommand($: EngineInterface, args: string) {
  await logEvent($, { t: 'model', ...(await where($)), arg: args.trim().slice(0, 40) })
}
