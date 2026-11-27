import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Live } from '../types'
import { EMPTY_LIVE, afterCompact, afterModelCommand, refresh, refreshReview } from './band/live'
import { bandDir } from './band/events'
import { track, writeBoard } from './band/track'

const NAME = 'unified-band'
const LEVELS = ['off', 'lite', 'full', 'ultra'] as const
// Same key as band/live.tsx: the scan needs each module's atoms spelled in the module itself.
const live = atom({ plugin: 'unified-band', key: 'live' } as const, EMPTY_LIVE)
const compact = atom({ plugin: 'unified-band', key: 'compact' } as const, false)
// The tracked task state; band/track.tsx writes it, this file only draws it.
const ponytail = atom(
  { plugin: 'unified-band', key: 'band' } as const,
  {
    level: 'off',
    model: '',
    cost: 0,
    spent: 0,
    turns: 0,
    turnCosts: [] as number[],
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    busyMs: 0,
    name: '',
    project: '',
    session: '',
    transcript: '',
    reused: [] as string[],
    created: [] as string[],
    removed: [] as string[],
    openCallers: [] as string[],
    tests: { state: 'none' as 'none' | 'pass' | 'fail' | 'stale', passed: undefined as number | undefined, failed: undefined as number | undefined },
    details: false,
  },
)

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const bar = (percent: number, width = 10) => {
  const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}
const tone = (percent: number) => (percent >= 85 ? 'error' : percent >= 70 ? 'warning' : undefined)
const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n))
const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`
const minutes = (ms: number) => (ms >= 3.6e6 ? `${(ms / 3.6e6).toFixed(1)}h` : `${Math.round(ms / 6e4)}m`)
const until = (iso: string | undefined, now: number) => {
  if (iso === undefined) return ''
  const left = Math.max(0, Date.parse(iso) - now)
  const hours = Math.floor(left / 3.6e6)
  return hours >= 24 ? `Resets In ${Math.floor(hours / 24)}d ${hours % 24}h` : `Resets In ${hours}h ${Math.round((left % 3.6e6) / 6e4)}m`
}

type Options = { readonly [field: string]: unknown }

// The same commands a person types, so Ponytail's own skills stay the only logic.
const run = ($: EngineInterface, command: string, args = '') => $.command.run({ command, args })

// The Board is rebuilt from the ledger and the journal at every press, so it is never older than the click.
async function openBoard($: EngineInterface) {
  const file = await writeBoard($, await bandDir($))
  const windows = (await $.env.get('OS')) === 'Windows_NT'
  await $.process.run(windows ? ['cmd', '/c', 'start', '', file] : ['xdg-open', file])
  // After the page is open, so the review never holds it back or stops it.
  await refreshReview($).catch(() => {})
}

// Opening works the review out again, so it is never older than the click.
async function toggleReview($: EngineInterface) {
  const open = (await read($, live)).reviewOpen !== true
  if (open) await refreshReview($)
  await update($, live, l => ({ ...l, reviewOpen: open }))
}

// A saving, or what was spent on top: the figure and which way it went.
const gain = (n: number) => `${money(Math.abs(n))} ${n < 0 ? 'More' : 'Saved'}`

// The three lines of the router review: what the router's orders did, what all its workers did, and what the figures are.
function reviewLines(r: Live['review']): string[] {
  const days = `Last ${r?.days ?? 30} Days`
  // A review kept from an older version of the band has other fields.
  if (r?.orders === undefined || (r.total === 0 && r.finished === 0)) return [`Router Review · ${days}`, 'No Router Decisions Recorded In This Period', ' ']
  const some = (priced: number, of: number) => (priced < of ? ` (${priced} Of ${of} Priced)` : '')
  const auto = r.ran === 0 ? `${money(0)} Saved` : r.autoPriced > 0 ? `${gain(r.autoSaved)}${some(r.autoPriced, r.autoWorkers)}` : 'Not Priced'
  const against = `${money(Math.abs(r.saved))} ${r.saved < 0 ? 'More' : 'Less'} Than On The Session Model`
  const all = r.finished === 0 ? 'None Finished' : r.priced === 0 ? `${r.finished} Finished, Not Priced` : against + some(r.priced, r.finished)
  return [
    r.orders === 0 ? 'Auto-Routed: No Orders Sent' : `Auto-Routed: ${r.ran} Of ${r.orders} Orders Ran On A Worker · ${auto}`,
    `All Router Workers, Auto And By Name: ${all}`,
    `Router Review · ${days} · ${r.corrected} Corrected By You · Estimate From Worker Tokens, Local Logs, No Model Call`,
  ]
}

export const register: Register = (on, options) => {
  track(on, options)

  on('session.compact', async ($, e, next) => {
    await update($, live, l => ({ ...l, compactions: l.compactions + 1 }))
    await afterCompact($)
    return next(e)
  }).catch(($, e, next) => next(e))

  // A /model command is how a person overrides the router, so it goes in the journal.
  on('command.run', { command: 'model' }, async ($, e, next) => {
    await afterModelCommand($, e.args ?? '')
    return next(e)
  }).catch(($, e, next) => next(e))

  // Limits and context move between turns, so they are pushed here, not polled.
  // A toast once per window when a limit crosses 80% and again at 95%, and again after the window resets lower.
  const warned = new Map<string, number>()
  on('session.measure', async ($, e, next) => {
    await update($, live, l => ({ ...l, context: e.context.percent, limits: e.rateLimits }))
    for (const limit of e.rateLimits) {
      const level = limit.percentUsed >= 95 ? 95 : limit.percentUsed >= 80 ? 80 : 0
      if (level > (warned.get(limit.kind) ?? 0)) $.ui.toast(`${limit.kind === 'five_hour' ? '5-Hour' : limit.kind === 'seven_day' ? 'Weekly' : limit.kind} Limit At ${Math.round(limit.percentUsed)}%`)
      warned.set(limit.kind, level)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (e.plugin !== undefined && e.plugin !== 'unified-band')) return next(e)

    const b = await read($, ponytail).catch(() => undefined)
    if (b === undefined) return next(e)
    const l = await read($, live)
    const isCompact = await read($, compact)
    const now = await $.clock.now()
    const five = l.limits.find(x => x.kind === 'five_hour')
    const week = l.limits.find(x => x.kind === 'seven_day')
    const reuse = b.created.length > 0 ? Math.round((b.reused.length / b.created.length) * 100) : undefined
    const tests =
      b.tests.state === 'pass'
        ? { value: `✓ ${b.tests.passed ?? ''}`.trim(), sub: 'After Last Change', color: 'success' as const }
        : b.tests.state === 'fail'
          ? { value: `✗ ${b.tests.failed ?? ''}`.trim(), sub: 'Last Run', color: 'error' as const }
          : b.tests.state === 'stale'
            ? { value: 'Stale', sub: 'Code Changed Since', color: 'warning' as const }
            : undefined
    const pct = l.tasks ? Math.round((l.tasks.done / l.tasks.total) * 100) : undefined

    // The band shows the new level at once; the command's own hooks then write the flag, and the turn confirms it.
    const setLevel = async (level: string) => {
      // Pressing the level already shown would only queue a turn that changes nothing.
      if (level === b.level) return
      await update($, ponytail, x => ({ ...x, level }))
      // Not awaited: the command runs a whole turn, and a press handler has ten seconds.
      void run($, 'unified-band:ponytail', level).catch(() => $.ui.toast('Could Not Switch The Level'))
    }
    const { Box, Text, Button } = $.ui.resolve(e)
    const width = e.surface === 'terminal' ? e.props.bodyColumns : undefined

    const progressFile = typeof options.progressFile === 'string' && options.progressFile !== '' ? options.progressFile : 'PLAN.md'
    const folder = l.root.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() ?? ''

    const header = (
      <Box flexDirection="row" alignItems="center" gap={1}>
        {LEVELS.map(level => (
          <Button
            key={`level-${level}`}
            label={cap(level)}
            {...(level === b.level ? { variant: 'primary' as const } : { plain: true as const, dimColor: true })}
            onPress={() => setLevel(level)}
          />
        ))}
        <Box flexGrow={1} />
        <Button key="review" plain label="Review" onPress={() => void run($, 'unified-band:ponytail-review').catch(() => $.ui.toast('Review Failed To Start'))} />
        <Button key="audit" plain label="Audit" onPress={() => void run($, 'unified-band:ponytail-audit').catch(() => $.ui.toast('Audit Failed To Start'))} />
        <Button key="router" plain label="Router" onPress={() => toggleReview($).catch(() => $.ui.toast('Router Review Failed'))} />
        <Button key="board" plain label="Board" onPress={() => openBoard($).catch(() => $.ui.toast('Could Not Open The Board'))} />
        <Button key="compact" plain label={isCompact ? 'Expand' : 'Compact'} onPress={() => update($, compact, c => !c)} />
      </Box>
    )

    // The review takes the place of the session lines and meters while it is open, also in a compact or short band.
    const review = l.reviewOpen ? (
      <Box flexDirection="column" paddingX={1}>
        {reviewLines(l.review).map((line, i) => (
          <Text key={`review-${i}`} bold={i < 2} dimColor={i === 2} wrap="truncate-end">
            {line}
          </Text>
        ))}
      </Box>
    ) : null

    // Compact is the buttons alone, and the review when it was asked for.
    if (isCompact) return <Box flexDirection="column" width={width}>{header}{review}</Box>

    // The desktop's proportional font breaks block and line glyphs; an SVG with a fixed pixel height draws real ones.
    const svg = (vw: number, vh: number, shapes: string, alt: string, px: number, wpx?: number) => {
      const { Svg } = $.ui.resolve(e)
      return <Svg source={`<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none">${shapes}</svg>`} alt={alt} height={px} {...(wpx === undefined ? {} : { width: wpx })} />
    }
    const meter = (percent: number, color?: 'success' | 'warning' | 'error') => {
      if (e.surface !== 'desktop') return <Text color={color}>{bar(percent, 20)}</Text>
      const fill = color === 'success' ? '#2e9e5b' : color === 'warning' ? '#d99a1c' : color === 'error' ? '#d64545' : '#4a7fe0'
      const w = Math.max(0, Math.min(100, percent)) * 10
      return svg(1000, 6, `<rect width="1000" height="6" rx="3" fill="#888" fill-opacity="0.3"/><rect width="${w}" height="6" rx="3" fill="${fill}"/>`, `${Math.round(percent)}%`, 6)
    }
    // Fixed columns: each cell is an equal share of the row. The first line is the label and value, the second a sub line or a meter,
    // and a tall cell has a third (the meter's sub line). The inner box clips, so a long sub line never runs over the next bar.
    const Cell = (p: { k: string; cols: number; grow?: number; first?: boolean; tall?: boolean; label: string; value: string; sub?: string; color?: 'success' | 'warning' | 'error'; percent?: number }) => (
      <Box key={p.k} flexDirection="row" {...(p.grow === undefined ? { width: `${Math.floor(100 / p.cols)}%` } : { flexGrow: p.grow, flexShrink: 1 })}>
        <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden" paddingRight={1}>
          <Box flexDirection="row" gap={1}>
            <Text dimColor wrap="truncate-end">
              {p.label}
            </Text>
            <Text bold color={p.color} wrap="truncate-end">
              {p.value}
            </Text>
          </Box>
          {p.percent !== undefined ? (
            meter(p.percent, p.color)
          ) : (
            <Text dimColor wrap="truncate-end">
              {p.sub === undefined || p.sub === '' ? ' ' : p.sub}
            </Text>
          )}
          {p.tall ? (
            <Text dimColor wrap="truncate-end">
              {p.percent !== undefined && p.sub ? p.sub : ' '}
            </Text>
          ) : null}
        </Box>
      </Box>
    )

    const session = [l.startedAt !== undefined ? `Session ${minutes(now - l.startedAt)}` : '', `${l.prompts} Prompts`].filter(x => x !== '').join(' · ')
    const router = l.router
    const routerValue = router?.last ? `${cap(router.last.model)} ${cap(router.last.effort)}` : router ? 'No Decision Yet' : 'No Log'
    const routerSub = router?.last
      ? `${router.last.outcome === 'silent' ? 'Kept Session Model' : router.last.outcome} · ${minutes(now - router.last.at)} Ago`
      : router
        ? 'Log Exists, None This Session'
        : 'Router Has Not Run'
    // One short figure, so the decision after it still fits; the two full lines are behind the Router button.
    const workers = l.review?.priced ? `~${gain(l.review.saved)} · ` : ''
    const callers = b.openCallers.length > 0 ? ` · ⚠ ${b.openCallers.length} Callers Open` : ''

    // One limit on one line: name, a long meter, the figure, and when it resets. Percent widths, so the columns line up row to row.
    const Limit = (k: string, label: string, percent: number | undefined, sub = '') => {
      const color = percent === undefined ? undefined : tone(percent)
      return (
        <Box key={k} flexDirection="row" alignItems="center">
          <Box width="19%">
            <Text dimColor wrap="truncate-end">
              {label}
            </Text>
          </Box>
          <Box width="42%" flexDirection="column" paddingRight={2}>
            {meter(percent ?? 0, color)}
          </Box>
          <Box width="9%">
            <Text bold color={color} wrap="truncate-end">
              {percent === undefined ? 'N/A' : `${Math.round(percent)}%`}
            </Text>
          </Box>
          <Box flexGrow={1}>
            <Text dimColor wrap="truncate-end">
              {sub === '' ? ' ' : sub}
            </Text>
          </Box>
        </Box>
      )
    }

    // Left: where the session is, as wide as its text. Right: the three limits. Three lines either side, inset one cell, like the text in the facts frame (its border and padding).
    const body = (
      <Box flexDirection="row" paddingX={1}>
        <Box flexDirection="column" flexShrink={0} paddingRight={3}>
          <Text dimColor wrap="truncate-end">
            {l.branch !== '' ? 'Branch' : 'Folder'}
          </Text>
          <Text bold wrap="truncate-end">
            {l.branch !== '' ? l.branch : folder}
          </Text>
          <Text dimColor wrap="truncate-end">
            {session}
          </Text>
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          {Limit('context', 'Context', l.context)}
          {Limit('five', '5-Hour Limit', five?.percentUsed, five ? until(five.resetsAt, now) : '')}
          {Limit('week', 'Weekly Limit', week?.percentUsed, week ? until(week.resetsAt, now) : '')}
        </Box>
      </Box>
    )

    const facts = (framed: boolean) => (
      <Box flexDirection="row" {...(framed ? { borderStyle: 'round', borderDimColor: true, paddingX: 1 } : {})}>
        {Cell({ k: 'tests', cols: 4, grow: 1, first: true, label: 'Tests', value: tests ? tests.value : 'Not Run', color: tests?.color, sub: tests ? tests.sub : 'No Test Command Seen' })}
        {Cell({ k: 'reuse', cols: 4, grow: 1, label: 'Reuse', value: reuse !== undefined ? `${reuse}%` : 'N/A', sub: `${reuse !== undefined ? `${b.reused.length} Of ${b.created.length}` : 'No New Code'}${callers}` })}
        {Cell({ k: 'router', cols: 4, grow: 1, label: 'Model Router', value: routerValue, color: router ? undefined : 'warning', sub: `${workers}${routerSub}` })}
        {Cell({ k: 'project', cols: 4, grow: 1, label: 'Project', value: pct !== undefined ? `${pct}%` : 'N/A', color: pct !== undefined ? 'success' : undefined, sub: l.tasks ? `${l.tasks.done} Of ${l.tasks.total} Done` : `No ${progressFile}` })}
      </Box>
    )

    // Cost, Tokens and Agent Time are tracked but not drawn here; they move to the Board.
    // What the window can hold decides the spacing, so the panel never needs scrolling:
    //   10 lines and up: a blank line between the blocks and a frame round the facts (1 + 1 + 3 + 1 + 4)
    //    8 lines: no blank lines, the frame stays (1 + 3 + 4)
    //    6 lines: no frame (1 + 3 + 2); less than that drops the facts, then the body.
    const rows = e.props.maxRows
    const airy = rows >= 10
    const framed = rows >= 8
    const gap = airy ? 1 : 0

    return (
      <Box flexDirection="column" width={width}>
        {header}
        {rows >= 4 || review ? <Box flexDirection="column" marginTop={gap}>{review ?? body}</Box> : null}
        {rows >= 6 ? <Box flexDirection="column" marginTop={gap}>{facts(framed)}</Box> : null}
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
