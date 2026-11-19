import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'unified-band',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 } },
} as const

const PONYTAIL = {
  level: 'ultra', model: '', cost: 1.2, spent: 1.2, turns: 3, turnCosts: [0.1, 0.08],
  tokens: { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 }, busyMs: 120000, name: '', project: 'Steward',
  session: 's', transcript: '', reused: ['a'], created: ['a', 'b'], removed: [], openCallers: [],
  tests: { state: 'pass', passed: 128 }, details: false,
}

const LIVE = { branch: 'main', root: '/Users/admin', context: 28, limits: [{ kind: 'five_hour', percentUsed: 13 }, { kind: 'seven_day', percentUsed: 24 }], tasks: { done: 31, total: 50 }, startedAt: 0, prompts: 14, compactions: 1, lastTurn: { ms: 19000, cache: 100, at: 0 }, router: { total: 6, routed: 0, last: { model: 'sonnet', effort: 'low', reason: 'moderate scope', outcome: 'silent', at: 0 } } }

const seed = (on: (event: 'state.get', hook: (_: unknown, e: { key: string }) => unknown) => unknown) =>
  on('state.get', (_, e) => ({ value: { value: e.key === 'band' ? PONYTAIL : e.key === 'live' ? LIVE : undefined, version: 1 } }))

test('the band draws every Ponytail button on each surface', async ($, on) => {
  on('clock.now', () => ({ value: 0 }))
  seed(on as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    for (const key of ['level-off', 'level-lite', 'level-full', 'level-ultra', 'copy', 'review', 'audit', 'board', 'compact']) {
      expect(await ui.find({ type: 'Button', key })).toBeDefined()
    }
    expect(await ui.find({ type: 'Text', text: /Context/ })).toBeDefined()
    await ui.unmount()
  }
})

test('every card and info line draws, with an SVG meter on the desktop', async ($, on) => {
  on('clock.now', () => ({ value: 60000 }))
  seed(on as never)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  for (const label of [/Context/, /5-Hour Limit/, /Weekly Limit/, /14 Prompts/, /Model Router/, /Folder|Branch/, /Model Router/, /Project/]) {
    expect(await ui.find({ type: 'Text', text: label })).toBeDefined()
  }
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.unmount()
})

test('a short band window drops the spacing and frame first, then the facts, then the body', async ($, on) => {
  on('clock.now', () => ({ value: 60000 }))
  seed(on as never)

  const dense = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 8 }, surface: 'desktop' })
  expect(await dense.find({ type: 'Text', text: /Model Router/ })).toBeDefined()
  await dense.unmount()

  const tiny = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 4 }, surface: 'desktop' })
  expect(await tiny.find({ type: 'Text', text: /Model Router/ })).toBeUndefined()
  expect(await tiny.find({ type: 'Text', text: /Context/ })).toBeDefined()
  await tiny.unmount()
})

test('compact is the buttons alone', async ($, on) => {
  on('clock.now', () => ({ value: 60000 }))
  on('state.get', (_, e) => ({ value: { value: e.key === 'band' ? PONYTAIL : e.key === 'live' ? LIVE : e.key === 'compact' ? true : undefined, version: 1 } }))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', key: 'compact' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Context|Cost|\$/ })).toBeUndefined()
  await ui.unmount()
})
