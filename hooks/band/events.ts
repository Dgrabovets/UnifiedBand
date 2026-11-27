import type { EngineInterface } from 'claude-code'

// One line of the journal. `t` says what happened: turn, prompt, compact, model (a /model command) or run (a review or audit).
export type Ev = { t: string; ts: number; session: string; project: string; [field: string]: unknown }

// A review or audit ends with this line, which skills/ponytail-review and ponytail-audit ask for.
export const RESULT = /PONYTAIL_RESULT\s+kind=(review|audit)\s+findings=(\d+)(?:\s+high=(\d+))?/

// A short reply that pushes back on the last answer. Only the flag is kept, never the text.
export const NEGATIVE = /^(нет|не так|не то|неправильно|неверно|стоп|откати|no|nope|wrong|not that|stop|undo|revert)(\s|[.,!]|$)/i

// The project's folder name, from a path with either kind of separator.
export const baseName = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() || path

// Where the ledgers and the board live. shortcut: ~/.config only, as Ponytail writes it.
export async function bandDir($: EngineInterface) {
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  return `${(await $.env.get('XDG_CONFIG_HOME')) ?? `${home}/.config`}/ponytail/band`
}

// One file per session and day, so two sessions never write the same file and a file stays small.
// A read that fails on a file that exists must not turn into an overwrite: the event is dropped instead.
export async function logEvent($: EngineInterface, ev: Ev) {
  const name = `events-${new Date(ev.ts).toISOString().slice(0, 10)}-${(ev.session.slice(0, 8) || 'none').replace(/[^\w-]/g, '_')}.jsonl`
  const file = `${await bandDir($)}/${name}`
  const old = (await $.fs.exists(file)) ? await $.fs.read(file).catch(() => undefined) : ''
  if (old !== undefined) await $.fs.write(file, `${old}${JSON.stringify(ev)}\n`)
}

// The router's audit log: CC_ROUTER_CACHE_DIR when set (the router honours it), else <claude config>/cache/router.
export async function routerLogPath($: EngineInterface) {
  const set = await $.env.get('CC_ROUTER_CACHE_DIR')
  if (set) return `${set}/audit.jsonl`
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  return `${(await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${home}/.claude`}/cache/router/audit.jsonl`
}

type LogRow = { [field: string]: any }

const isLaunch = (r: LogRow) => r.kind === 'router' && (r.outcome === 'delegated' || r.outcome === 'delegated_failed' || r.outcome === 'worker_usage')

// The router's log, linked: the prompts it classified and what its workers did.
// An order ran when a worker with its id shows up before the session's next prompt and before the log closed it as inline:
// a later worker started by name gets the same id and must not count.
export function routerRows(log: LogRow[]) {
  const rows = log.map(r => ({ ...r, ts: Date.parse(r.ts) }) as LogRow).sort((a, b) => a.ts - b.ts)
  const ran = new Set<LogRow>()
  const auto = new Set<LogRow | string>()
  rows.forEach((order, at) => {
    const id = order.decision?.decision_id
    if (order.outcome !== 'injected' || !id) return
    for (let i = at + 1; i < rows.length; i++) {
      const r = rows[i] as LogRow
      if (r.decision && r.session_id === order.session_id) break
      if (r.decision_id !== id) continue
      if (r.outcome === 'auto_inline_unattributed' && !ran.has(order)) break
      if (!isLaunch(r) || r.outcome === 'delegated_failed') continue
      ran.add(order)
      auto.add(r.agent_id ?? r)
    }
  })

  // A continued worker stops again with larger totals: only its newest usage row counts.
  const newest = new Map<string, LogRow>()
  for (const r of rows) if (r.outcome === 'worker_usage' && r.agent_id) newest.set(r.agent_id, r)
  // A launch row names no session, the worker's usage row does.
  const sessions = new Map([...newest].map(([agent, r]) => [agent, r.session_id]))

  const parents = new Map<string, string>()
  const audit: LogRow[] = []
  const workers: LogRow[] = []
  for (const r of rows) {
    if (r.decision) {
      const d = r.decision
      parents.set(r.session_id, d.parent)
      audit.push({ ts: r.ts, session: r.session_id, parent: d.parent, model: d.model, effort: d.effort, tier: d.tier, conf: d.confidence, outcome: r.outcome, hint: r.outcome_hint, reason: d.reason, fanout: d.fanout === true, ran: ran.has(r) })
    } else if (isLaunch(r) && !(r.outcome === 'worker_usage' && r.agent_id && newest.get(r.agent_id) !== r)) {
      const session = r.session_id ?? sessions.get(r.agent_id)
      const u = r.usage ?? {}
      workers.push({ ts: r.ts, session, outcome: r.outcome, model: r.model, actual: r.model_actual, ms: r.duration_ms, agent: r.agent_id, auto: auto.has(r.agent_id ?? r), parent: parents.get(session), fresh: u.tokens_in ?? 0, write: u.cache_write ?? 0, read: u.cache_read ?? 0, output: u.tokens_out ?? 0, input: (u.tokens_in ?? 0) + (u.cache_write ?? 0) })
    }
  }
  return { audit, workers }
}

// The router's log with its rotated files, oldest first. A file that cannot be read counts as empty.
async function routerLog($: EngineInterface): Promise<LogRow[]> {
  const current = await routerLogPath($)
  const dir = current.slice(0, current.lastIndexOf('/'))
  const rotated = (await $.fs.list(dir).catch(() => [])).filter(x => x.kind === 'file' && /^audit\.jsonl\.\d{8}T\d{6}Z$/.test(x.name)).map(x => x.name).sort()
  const texts = await Promise.all([...rotated.map(name => `${dir}/${name}`), current].map(file => $.fs.read(file).catch(() => '')))
  return texts.flatMap(text => (text as string).split('\n').flatMap(line => {
    try {
      return [JSON.parse(line)]
    } catch {
      return []
    }
  }))
}

// What the Board adds to the task ledger: the journal, the router's decisions and the owner's board.json.
// shortcut: reads whole files; $.fs.read refuses one over 4 MiB, so an oversize router log is left out.
// `since` skips the journal files of earlier days, for a reader that needs recent history only.
export async function boardExtra($: EngineInterface, since = 0) {
  const dir = await bandDir($)
  const first = `events-${new Date(since).toISOString().slice(0, 10)}`
  const events: unknown[] = []
  for (const f of (await $.fs.list(dir).catch(() => [])).filter(x => x.kind === 'file' && /^events-\d{4}-\d{2}(-\d{2}-[\w-]+)?\.jsonl$/.test(x.name) && (since === 0 || x.name >= first)).sort((a, b) => a.name.localeCompare(b.name))) {
    for (const line of (await $.fs.read(`${dir}/${f.name}`).catch(() => '')).split('\n')) {
      try {
        if (line !== '') events.push(JSON.parse(line))
      } catch {}
    }
  }
  const { audit, workers } = routerRows(await routerLog($))
  // A broken board.json costs only the config, not the journal and the router log.
  const config = await $.fs.read(`${dir}/board.json`).then(JSON.parse).catch(() => ({}))
  return { events: events.sort((a, b) => ((a as Ev).ts ?? 0) - ((b as Ev).ts ?? 0)), audit, workers, config }
}
