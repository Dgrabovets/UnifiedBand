import { expect, test } from 'claude-code/testing'

import { NEGATIVE, RESULT, baseName, logEvent } from '../hooks/band/events'

test('logEvent appends one JSON line per call to the file of the session and day', async () => {
  const files = new Map<string, string>()
  // A stand-in for `$`: logEvent touches only env.get, fs.exists, fs.read and fs.write.
  const $ = {
    env: { get: async (name: string) => (name === 'XDG_CONFIG_HOME' ? '/cfg' : undefined) },
    fs: {
      exists: async (path: string) => files.has(path),
      read: async (path: string) => files.get(path) ?? '',
      write: async (path: string, text: string) => void files.set(path, text),
    },
  } as never

  await logEvent($, { t: 'turn', ts: Date.UTC(2026, 10, 19, 12), session: 's', project: 'p', cost: 1 })
  await logEvent($, { t: 'prompt', ts: Date.UTC(2026, 10, 19, 13), session: 's', project: 'p', words: 2, neg: true })

  const lines = (files.get('/cfg/ponytail/band/events-2026-11-19-s.jsonl') ?? '').trim().split('\n')
  expect(lines.length).toBe(2)
  expect(JSON.parse(lines[1] ?? '{}').neg).toBe(true)
})

test('logEvent drops the event instead of overwriting a file it could not read', async () => {
  const writes: string[] = []
  const $ = {
    env: { get: async (name: string) => (name === 'XDG_CONFIG_HOME' ? '/cfg' : undefined) },
    fs: {
      exists: async () => true,
      read: async () => {
        throw new Error('too large')
      },
      write: async (path: string) => void writes.push(path),
    },
  } as never
  await logEvent($, { t: 'turn', ts: Date.UTC(2026, 10, 19), session: 's', project: 'p' })
  expect(writes).toEqual([])
})

test('a review result line and a push back are recognised, a plain prompt is not', () => {
  expect(RESULT.exec('report\nPONYTAIL_RESULT kind=review findings=7 high=2')?.slice(1, 4)).toEqual(['review', '7', '2'])
  expect(RESULT.exec('PONYTAIL_RESULT kind=audit findings=0')?.[3]).toBeUndefined()
  expect(NEGATIVE.test('нет, не так')).toBe(true)
  expect(NEGATIVE.test('No, wrong file')).toBe(true)
  expect(NEGATIVE.test('now add the export')).toBe(false)
})

test('baseName takes the folder name from either kind of path', () => {
  expect(baseName(String.raw`D:\MyRepositories\SipAndTell`)).toBe('SipAndTell')
  expect(baseName('/home/a/Steward')).toBe('Steward')
})
