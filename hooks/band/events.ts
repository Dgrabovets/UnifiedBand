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

// What the Board adds to the task ledger: the journal, the router's decisions and the owner's board.json.
// shortcut: reads whole files; $.fs.read refuses one over 4 MiB, so an oversize router log is left out.
export async function boardExtra($: EngineInterface) {
  const dir = await bandDir($)
  const events: unknown[] = []
  for (const f of (await $.fs.list(dir).catch(() => [])).filter(x => x.kind === 'file' && /^events-\d{4}-\d{2}(-\d{2}-[\w-]+)?\.jsonl$/.test(x.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    for (const line of (await $.fs.read(`${dir}/${f.name}`).catch(() => '')).split('\n')) {
      try {
        if (line !== '') events.push(JSON.parse(line))
      } catch {}
    }
  }
  const log = ((await $.fs.read(await routerLogPath($)).catch(() => '')) as string).split('\n').flatMap(line => {
    try {
      return [JSON.parse(line)]
    } catch {
      return []
    }
  })
  // Outcome rows (a delegated worker, a reconciled decision) carry no decision and are not prompts.
  const audit = log
    .filter(r => r.decision)
    .map(r => ({ ts: Date.parse(r.ts), session: r.session_id, parent: r.decision?.parent, model: r.decision?.model, effort: r.decision?.effort, tier: r.decision?.tier, conf: r.decision?.confidence, outcome: r.outcome, reason: r.decision?.reason, fanout: r.decision?.fanout === true }))
  // What the delegated workers did: the launch row (duration) and the usage row of a finished worker.
  const workers = log
    .filter(r => r.kind === 'router' && (r.outcome === 'delegated' || r.outcome === 'delegated_failed' || r.outcome === 'worker_usage'))
    .map(r => ({ ts: Date.parse(r.ts), session: r.session_id, outcome: r.outcome, model: r.model, actual: r.model_actual, ms: r.duration_ms, input: (r.usage?.tokens_in ?? 0) + (r.usage?.cache_write ?? 0), output: r.usage?.tokens_out ?? 0 }))
  // A broken board.json costs only the config, not the journal and the router log.
  const config = await $.fs.read(`${dir}/board.json`).then(JSON.parse).catch(() => ({}))
  return { events: events.sort((a, b) => ((a as Ev).ts ?? 0) - ((b as Ev).ts ?? 0)), audit, workers, config }
}
