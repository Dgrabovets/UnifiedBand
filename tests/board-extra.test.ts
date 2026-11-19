import { expect, test } from 'claude-code/testing'

import { boardExtra } from '../hooks/band/events'

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

test('boardExtra with no journal, no router log and no board.json gives empty data, not an error', async () => {
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
