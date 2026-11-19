import { atom, update } from 'claude-code'
import type { EngineInterface, TurnCompleteInput } from 'claude-code'

import type { Live } from '../../types'

type Options = { readonly [field: string]: unknown }

export const EMPTY_LIVE: Live = { branch: '', root: '', limits: [], tasks: null, prompts: 0, compactions: 0 }

export const live = atom({ plugin: 'unified-band', key: 'live' } as const, EMPTY_LIVE)

// What auto-model-router decided in this session, read from the audit log it writes. Absent log: the router has never run.
// shortcut: $.fs.read refuses a log over 4 MiB (the router rotates at 5 MiB), then the card shows "No Log".
async function readRouter($: EngineInterface): Promise<Live['router']> {
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  const dir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${home}/.claude`
  const text = await $.fs.read(`${dir}/cache/router/audit.jsonl`).catch(() => undefined)
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


// Runs when a session starts or a turn ends: the part of the band that is not Ponytail's tracking.
export async function afterStart($: EngineInterface, options: Options) {
  await refresh($, options)
}

export async function afterTurn($: EngineInterface, e: TurnCompleteInput, options: Options) {
  await refresh($, options)
  // A subagent's turn is not the session's last turn.
  if (e.agentId !== undefined) return
  const u = e.usage
  const total = u ? u.input + u.cacheRead + u.cacheWrite : 0
  const at = await $.clock.now()
  await update($, live, l => ({ ...l, lastTurn: { ms: e.durationMs, cache: total > 0 && u ? Math.round((u.cacheRead / total) * 100) : undefined, at } }))
}
