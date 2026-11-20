import { expect, test } from 'claude-code/testing'

import { decide } from '../hooks/router-core.mjs'

const deps = { now: () => 'T', sha: () => 'S', id: () => 'x', budgetGate: () => true }
const ask = (prompt: string, extra: Record<string, unknown> = {}) => decide({ prompt, parent: 'opus', ...extra }, deps)
const hint = (prompt: string) => ask(prompt).row.outcome_hint ?? ask(prompt).row.outcome

test('a prompt that points back at earlier turns stays on the session model', () => {
  expect(ask('fix the typo in the README title').row.outcome).toBe('injected')
  for (const p of ['please fix the function we discussed in the README file', 'rename the variable as before in the README', 'пожалуйста исправь ту функцию, которую мы обсуждали в README', 'сделай как раньше в README заголовок']) {
    expect(hint(p)).toBe('refers_back_inline')
  }
})

test('a pasted failure stays on the session model', () => {
  const trace = 'fix this error in the helper\nTraceback (most recent call last):\n  File "a.py", line 3, in <module>\nValueError: bad'
  expect(hint(trace)).toBe('pasted_failure_inline')
  expect(hint('fix this crash\n    at run (/app/src/main.js:10:5)\nTypeError: x is undefined')).toBe('pasted_failure_inline')
})

test('an explicit #model= is never swallowed by a guard', () => {
  expect(ask('#model=haiku fix that function we discussed').row.outcome).toBe('injected')
})

test('shadow mode logs what the router would do and injects nothing', () => {
  const r = ask('fix the typo in the README title', { shadow: true })
  expect([r.row.outcome, r.row.outcome_hint, r.context]).toEqual(['shadow', 'would_route', null])
  expect(r.row.decision.model).toBe('sonnet')
  expect(ask('fix the typo in the README title', { shadow: false }).row.outcome).toBe('injected')
})
