import { expect, test } from 'claude-code/testing'

import { fmtTokens } from '../hooks/band/board'
import { lastCache, mainModel } from '../hooks/band/metrics'

const USAGE = (i: number, w: number, r: number) => `{"usage":{"input_tokens":${i},"cache_creation_input_tokens":${w},"cache_read_input_tokens":${r},"output_tokens":5}}`

test('lastCache reads the newest usage record of the transcript tail', () => {
  const tail = `${USAGE(100, 0, 0)}\n${USAGE(10, 10, 80)}\n`
  expect(lastCache(tail)).toBe(80)
  expect(lastCache('no usage here')).toBeUndefined()
})

test('mainModel picks the model that wrote most replies in the tail', () => {
  expect(mainModel('"model":"claude-opus-5-5" "model":"claude-sonnet-5-5" "model":"claude-opus-5-5"')).toBe('claude-opus-5-5')
  expect(mainModel('plain text')).toBe('')
})

test('fmtTokens switches to B from a billion', () => {
  expect([fmtTokens(999), fmtTokens(1500), fmtTokens(2_500_000), fmtTokens(1_250_000_000)]).toEqual(['999', '1.5k', '2.5M', '1.3B'])
})
