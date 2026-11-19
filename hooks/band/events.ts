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
