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

// shortcut: reads the month's file and writes it back whole; a month of turns stays far under the 4 MiB read limit.
export async function logEvent($: EngineInterface, ev: Ev) {
  const file = `${await bandDir($)}/events-${new Date(ev.ts).toISOString().slice(0, 7)}.jsonl`
  const old = await $.fs.read(file).catch(() => '')
  await $.fs.write(file, `${old}${JSON.stringify(ev)}\n`)
}

// What the Board adds to the task ledger: the journal, the router's decisions and the owner's board.json.
// shortcut: reads whole files; $.fs.read refuses one over 4 MiB, so an oversize router log is left out.
export async function boardExtra($: EngineInterface) {
  const dir = await bandDir($)
  const events: unknown[] = []
  for (const f of (await $.fs.list(dir).catch(() => [])).filter(x => x.kind === 'file' && /^events-\d{4}-\d{2}\.jsonl$/.test(x.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    for (const line of (await $.fs.read(`${dir}/${f.name}`).catch(() => '')).split('\n')) {
      try {
        if (line !== '') events.push(JSON.parse(line))
      } catch {}
    }
  }
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  const claude = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${home}/.claude`
  const audit = ((await $.fs.read(`${claude}/cache/router/audit.jsonl`).catch(() => '')) as string)
    .split('\n')
    .flatMap(line => {
      try {
        const r = JSON.parse(line)
        return [{ ts: Date.parse(r.ts), session: r.session_id, parent: r.decision?.parent, model: r.decision?.model, effort: r.decision?.effort, tier: r.decision?.tier, conf: r.decision?.confidence, outcome: r.outcome, reason: r.decision?.reason }]
      } catch {
        return []
      }
    })
  const config = JSON.parse((await $.fs.read(`${dir}/board.json`).catch(() => '{}')) || '{}')
  return { events, audit, config }
}
