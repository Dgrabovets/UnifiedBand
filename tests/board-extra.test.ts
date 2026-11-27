import { expect, test } from 'claude-code/testing'

import { boardExtra, routerRows } from '../hooks/band/events'

test('boardExtra reads every month of the journal, maps the router log and parses board.json', async () => {
  const files: Record<string, string> = {
    '/cfg/ponytail/band/events-2026-10.jsonl': '{"t":"turn","ts":1}\nnot json\n',
    '/cfg/ponytail/band/events-2026-11.jsonl': '{"t":"prompt","ts":2}\n',
    '/cfg/ponytail/band/board.json': '{"projects":{"A":{"label":"Alpha"}}}',
    '/home/.claude/cache/router/audit.jsonl':
      JSON.stringify({ ts: '2026-11-19T10:00:00+00:00', session_id: 's', decision: { parent: 'sonnet', model: 'opus', effort: 'high', tier: 'complex', confidence: 0.9, reason: 'r' }, outcome: 'routed' }) + '\n',
  }
  const env: Record<string, string> = { XDG_CONFIG_HOME: '/cfg', HOME: '/home' }
  // A stand-in for `$`: boardExtra touches only env.get, fs.list and fs.read.
  const $ = {
    env: { get: async (name: string) => env[name] },
    fs: {
      list: async () => [
        { name: 'events-2026-11.jsonl', kind: 'file' },
        { name: 'events-2026-10.jsonl', kind: 'file' },
        { name: 'board.json', kind: 'file' },
      ],
      read: async (path: string) => {
        if (path in files) return files[path]
        throw new Error('missing')
      },
    },
  } as never

  const r = await boardExtra($)
  // The unreadable line is skipped and the months come in order.
  expect(r.events.map(e => (e as { t: string }).t)).toEqual(['turn', 'prompt'])
  expect(r.audit.length).toBe(1)
  expect(r.audit[0]).toMatchObject({ session: 's', parent: 'sonnet', model: 'opus', outcome: 'routed', conf: 0.9 })
  expect((r.config as { projects: { A: { label: string } } }).projects.A.label).toBe('Alpha')
})

const at = (minute: number) => `2026-11-19T10:${String(minute).padStart(2, '0')}:00.000000+00:00`
const order = (minute: number, id: string, session = 's', parent = 'opus') => ({ ts: at(minute), session_id: session, decision: { parent, model: 'sonnet', decision_id: id }, outcome: 'injected' })
const launch = (minute: number, id: string | null, agent: string) => ({ ts: at(minute), kind: 'router', outcome: 'delegated', model: 'sonnet', agent_id: agent, decision_id: id })
const usage = (minute: number, id: string | null, agent: string, output: number, session = 's') => ({ ts: at(minute), kind: 'router', outcome: 'worker_usage', model: 'sonnet', agent_id: agent, session_id: session, decision_id: id, usage: { tokens_in: 1, tokens_out: output, cache_read: 3, cache_write: 4 } })
const inline = (minute: number, id: string) => ({ ts: at(minute), outcome: 'auto_inline_unattributed', session_id: 's', decision_id: id })

test('an order ran only when its worker started before the turn closed it and before the next prompt', () => {
  const r = routerRows([
    // r_1 runs a worker in its own turn.
    order(0, 'r_1'), launch(1, 'r_1', 'a1'), usage(2, 'r_1', 'a1', 10),
    // r_2 is ignored; a worker started by name later carries its id.
    order(3, 'r_2'), inline(4, 'r_2'), launch(5, 'r_2', 'a2'), usage(6, 'r_2', 'a2', 20),
    // r_1 again, three prompts later: still not that order's worker.
    launch(7, 'r_1', 'a3'),
    // A foreground worker writes its usage row before its launch row.
    order(8, 'r_3'), usage(9, 'r_3', 'a4', 30), launch(10, 'r_3', 'a4'),
    order(11, 'r_4'), { ...launch(12, 'r_4', 'a5'), outcome: 'delegated_failed' },
  ])
  expect(r.audit.map(a => a.ran)).toEqual([true, false, true, false])
  expect(r.workers.filter(w => w.outcome === 'worker_usage').map(w => [w.agent, w.auto])).toEqual([['a1', true], ['a2', false], ['a4', true]])
  expect(r.workers.find(w => w.agent === 'a3')?.auto).toBe(false)
})

test('a continued worker counts once with its newest totals, and its launch row gets its session', () => {
  const r = routerRows([order(0, 'r_1', 's', 'sonnet'), launch(1, 'r_1', 'a1'), usage(2, 'r_1', 'a1', 10), order(3, 'r_2'), usage(20, 'r_1', 'a1', 50)])
  const [first, last] = r.workers
  expect(r.workers.length).toBe(2)
  expect([first?.session, last?.output, last?.fresh, last?.write, last?.read, last?.auto, last?.parent]).toEqual(['s', 50, 1, 4, 3, true, 'opus'])
})

test('boardExtra reads the rotated router logs before the current one', async () => {
  const files: Record<string, string> = {
    '/home/.claude/cache/router/audit.jsonl.20261119T100000Z': `${JSON.stringify(order(0, 'r_1'))}\n`,
    '/home/.claude/cache/router/audit.jsonl': `${JSON.stringify(launch(1, 'r_1', 'a1'))}\n`,
  }
  const $ = {
    env: { get: async (name: string) => (name === 'HOME' ? '/home' : undefined) },
    fs: {
      list: async (dir: string) => (dir.endsWith('/router') ? ['audit.jsonl', 'audit.jsonl.20261119T100000Z', 'sessions'].map(name => ({ name, kind: 'file' })) : []),
      read: async (path: string) => {
        if (path in files) return files[path]
        throw new Error('missing')
      },
    },
  } as never
  const r = await boardExtra($)
  expect(r.audit.map(a => a.ran)).toEqual([true])
})

test('boardExtra with no journal,no router log and no board.json gives empty data, not an error', async () => {
  const $ = {
    env: { get: async () => undefined },
    fs: { list: async () => { throw new Error('missing') }, read: async () => { throw new Error('missing') } },
  } as never
  const r = await boardExtra($)
  expect([r.events.length, r.audit.length]).toEqual([0, 0])
  expect(r.config).toEqual({})
})

test('a broken board.json costs only the config, not the journal', async () => {
  const files: Record<string, string> = {
    '/cfg/ponytail/band/events-2026-11-19-s.jsonl': '{"t":"turn","ts":1}\n',
    '/cfg/ponytail/band/board.json': '{"title": ,}',
  }
  const $ = {
    env: { get: async (name: string) => (name === 'XDG_CONFIG_HOME' ? '/cfg' : name === 'HOME' ? '/home' : undefined) },
    fs: {
      list: async () => [{ name: 'events-2026-11-19-s.jsonl', kind: 'file' }],
      read: async (path: string) => {
        if (path in files) return files[path]
        throw new Error('missing')
      },
    },
  } as never
  const r = await boardExtra($)
  expect(r.events.length).toBe(1)
  expect(r.config).toEqual({})
})

test('boardExtra counts decisions only, not the outcome rows the router writes beside them', async () => {
  const decision = JSON.stringify({ ts: '2026-11-19T10:00:00+00:00', session_id: 's', decision: { parent: 'opus', model: 'haiku', tier: 'override' }, outcome: 'injected' })
  const delegated = JSON.stringify({ ts: '2026-11-19T10:00:05+00:00', session_id: 's', decision_id: 'r_1', model: 'haiku', outcome: 'delegated', kind: 'router' })
  const reconciled = JSON.stringify({ ts: '2026-11-19T10:00:09+00:00', session_id: 's', decision_id: 'r_1', model: 'haiku', outcome: 'auto_inline_unattributed' })
  const $ = {
    env: { get: async (name: string) => (name === 'CC_ROUTER_CACHE_DIR' ? '/r' : undefined) },
    fs: {
      list: async () => [],
      read: async (path: string) => {
        if (path === '/r/audit.jsonl') return [decision, delegated, reconciled].join('\n') + '\n'
        throw new Error('missing')
      },
    },
  } as never
  const r = await boardExtra($)
  expect(r.audit.length).toBe(1)
  expect(r.audit[0]).toMatchObject({ parent: 'opus', model: 'haiku', outcome: 'injected' })
})

test('the router log is read from CC_ROUTER_CACHE_DIR when it is set', async () => {
  const row = JSON.stringify({ ts: '2026-11-19T10:00:00+00:00', session_id: 's', decision: { parent: 'sonnet', model: 'sonnet' }, outcome: 'silent' }) + '\n'
  const env: Record<string, string> = { XDG_CONFIG_HOME: '/cfg', HOME: '/home', CC_ROUTER_CACHE_DIR: '/elsewhere' }
  const $ = {
    env: { get: async (name: string) => env[name] },
    fs: {
      list: async () => [],
      read: async (path: string) => {
        if (path === '/elsewhere/audit.jsonl') return row
        throw new Error('missing')
      },
    },
  } as never
  expect((await boardExtra($)).audit.length).toBe(1)
})

test('a reader that asks for recent history skips the older journal files', async () => {
  const asked: string[] = []
  const env: Record<string, string> = { XDG_CONFIG_HOME: '/cfg', HOME: '/home' }
  const names = ['events-2026-10-01-a.jsonl', 'events-2026-11-10-b.jsonl', 'events-2026-11-12-c.jsonl']
  const $ = {
    env: { get: async (name: string) => env[name] },
    fs: {
      list: async () => names.map(name => ({ name, kind: 'file' })),
      read: async (path: string) => {
        asked.push(path)
        return ''
      },
    },
  } as never
  await boardExtra($, Date.UTC(2026, 10, 10, 15))
  expect(asked.filter(p => p.includes('events-'))).toEqual(['/cfg/ponytail/band/events-2026-11-10-b.jsonl', '/cfg/ponytail/band/events-2026-11-12-c.jsonl'])
})
