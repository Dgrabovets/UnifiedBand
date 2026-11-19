import { expect, test } from 'claude-code/testing'

import { buildAgentRow, buildStopRow, classifySubagent, extractUsage, lastInjectedId, reconcileRows, scanAuditTail, sumInlineUsage, sumWorkerUsage, unresolvedDecisions } from '../hooks/router-audit.mjs'
import { decide, detectFanout, gate, mergeConfig, pyDumps, pyStrip, scanTranscript, scoreEffort, sessionState } from '../hooks/router-core.mjs'
import { computeWaves, needsWorktree, parseFiles, partitionBatches, planExecution } from '../hooks/router-waves.mjs'
import { cases } from './router-fixture'
import type { Case } from './router-fixture'

const CYRILLIC = /[Ѐ-ӿ]/
const deps = { now: () => 'T', sha: () => 'S', id: () => 'x', budgetGate: () => true }

// What router-hook.js does for one prompt, with the disk replaced by the case: the same steps, in the same order.
function route(c: Case, transcript = c.transcript) {
  const prompt = pyStrip(c.prompt)
  const [done, optout] = gate(prompt, deps)
  if (done) return { row: optout, context: null }
  const config = mergeConfig(c.config ?? {}, {}, c.config ? '<config>' : undefined)
  if (config.disabled === true) return { row: null, context: null }
  const [parent, ctxTokens] = sessionState(scanTranscript(transcript))
  return decide({ prompt, sessionId: 'sid', turns: 1, parent, ctxTokens, planMode: c.plan, config }, deps)
}

// The ts and the hash differ per run and are not part of the comparison.
const strip = (row: Record<string, unknown> | null) => {
  if (!row) return null
  const { ts, prompt_sha, ...rest } = row
  return rest
}

test('the port decides like the Python original on every prompt of the differential corpus', () => {
  expect(cases.length > 60).toBe(true)
  // A Cyrillic prompt is decided differently on purpose (the port reads Russian, the original did not): tests/router-russian.test.ts.
  const different = cases.filter(c => !CYRILLIC.test(c.prompt)).flatMap(c => {
    const got = route(c)
    const same = JSON.stringify({ row: strip(got.row), context: got.context }) === JSON.stringify(c.expected)
    return same ? [] : [`${c.name} (${c.parent}, plan ${c.plan}): ${JSON.stringify({ row: strip(got.row), context: got.context })} instead of ${JSON.stringify(c.expected)}`]
  })
  expect(different.join('\n')).toBe('')
})

test('the corpus covers the branches: routed, kept inline, plan mode, override, opt-out, fan-out and rules', () => {
  const rows = cases.flatMap(c => (c.expected.row ? [c.expected.row] : []))
  const seen = new Set(rows.map(r => `${r.outcome}/${r.outcome_hint ?? ''}/${r.decision.tier}`))
  for (const key of ['injected//standard', 'injected//complex', 'injected//deep', 'injected//override', 'silent/same_or_higher_inline/standard', 'silent/followup_inline/followup', 'plan_mode//deep', 'silent//optout', 'injected//project_rule', 'silent/project_default_inline/project_default']) {
    expect(seen.has(key)).toBe(true)
  }
  expect(rows.some(r => r.decision.fanout === true)).toBe(true)
  expect(cases.some(c => c.expected.context?.includes('context 800k > 600k'))).toBe(true)
  expect(cases.some(c => c.expected.row === null)).toBe(true)
})

test('a cheaper pick is injected under a dearer session and stays silent under an equal or cheaper one', () => {
  const ask = (prompt: string, parent: string) => decide({ prompt, parent }, deps)
  const down = ask('fix the typo in the README title', 'opus')
  expect(down.row.outcome).toBe('injected')
  expect(down.context).toBe('AUTO-ROUTE: Agent(subagent_type="unified-band:router-sonnet") per auto-model-routing skill.\n<router-decision>{"decision_id":"r_x","model":"sonnet","effort":"low","band":"auto","parent":"opus","ctx":0}</router-decision>')
  expect(ask('fix the typo in the README title', 'sonnet').row.outcome_hint).toBe('same_or_higher_inline')
  expect(ask('fix the typo in the README title', 'haiku').row.outcome_hint).toBe('same_or_higher_inline')
  // Only an inline tag may route up.
  expect(ask('fix the typo in the README title #model=opus', 'haiku').row.outcome).toBe('injected')
})

test('effort is scored from the shape of the prompt and fan-out is detected', () => {
  expect(scoreEffort('what is this?')[0]).toBe('low')
  expect(scoreEffort('refactor ./a.py ./b.py ./c.py and verify the tests')[0]).toBe('high')
  expect(scoreEffort('refactor ./a.py ./b.py ./c.py and verify the tests\n```x```')[0]).toBe('xhigh')
  expect(detectFanout('1. one\n2. two')).toEqual([true, 2])
  expect(detectFanout('for each file')).toEqual([true, 0])
  expect(detectFanout('read the file and tell me what it does')).toEqual([false, 0])
})

test('the session model comes from the last real assistant record of the transcript', () => {
  const assistant = (model: string, tokens: number) => JSON.stringify({ type: 'assistant', message: { model, usage: { input_tokens: tokens, cache_read_input_tokens: 10 } } })
  const text = [assistant('claude-sonnet-5-5', 5), assistant('<synthetic>', 0), 'not json'].join('\n')
  expect(sessionState(scanTranscript(text))).toEqual(['sonnet', 15])
  expect(sessionState(scanTranscript('{broken'), 'haiku')).toEqual(['haiku', 0])
  expect(sessionState(scanTranscript(assistant('claude-mythos-5', 1)))[0]).toBe('fable')
})

test('audit rows are written the way Python wrote them: separators, ASCII only, and the length of a response', () => {
  expect(pyDumps({ a: [1, 'x'], b: null, c: { d: 'é—\n"' }, e: undefined })).toBe('{"a": [1, "x"], "b": null, "c": {"d": "\\u00e9\\u2014\\n\\""}}')
  expect(pyDumps('😀')).toBe('"\\ud83d\\ude00"')
})

test('a dispatch is a router row for this plugin, the original and a bare name, and a native one for any other agent', () => {
  expect(classifySubagent('unified-band:router-sonnet')).toEqual(['router', 'sonnet'])
  expect(classifySubagent('auto-model-router:router-haiku')).toEqual(['router', 'haiku'])
  expect(classifySubagent('router-opus')).toEqual(['router', 'opus'])
  expect(classifySubagent('Explore')).toEqual(['native', null])
  expect(classifySubagent('other-plugin:router-opus')).toEqual(['native', null])

  const audit = { now: () => 'T', decisionId: () => 'r_1', modelActual: () => 'claude-sonnet-5-5', wallMs: () => 1500 }
  const payload = {
    tool_name: 'Agent',
    session_id: 's',
    tool_use_id: 'u',
    tool_input: { subagent_type: 'unified-band:router-sonnet', description: '[grp:g1] fix the bug' },
    tool_response: { agentId: 'a1', totalTokens: 10, totalDurationMs: 20, usage: { input_tokens: 5, output_tokens: 0 }, content: [{ type: 'text', text: 'Stopped: too complex for Sonnet' }] },
  }
  const row = buildAgentRow(payload, audit)
  expect(row.outcome).toBe('delegated')
  expect(row.model).toBe('sonnet')
  expect(row.decision_id).toBe('r_1')
  expect(row.group_id).toBe('g1')
  expect(row.description).toBe('fix the bug')
  expect(row.escalation).toBe('Stopped: too complex')
  expect(row.wall_ms).toBe(1500)
  // A zero count falls through to the next spelling and is dropped, as in the original.
  expect(JSON.stringify(row.usage)).toBe('{"tokens_in":5}')
  expect(Object.keys(row).join()).toBe('ts,outcome,kind,subagent_type,response_chars,decision_id,model,agent_id,agent_type,total_tokens,duration_ms,model_actual,wall_ms,usage,escalation,group_id,description')

  expect(buildAgentRow({ ...payload, tool_response: { error: 'boom' } }, audit)?.outcome).toBe('delegated_failed')
  expect(buildAgentRow({ ...payload, tool_input: { subagent_type: 'Explore' } }, audit)?.outcome).toBe('native_dispatch')
  expect(buildAgentRow({ ...payload, tool_name: 'Bash' }, audit)).toBe(null)
  expect(buildAgentRow({ ...payload, tool_input: {} }, audit)).toBe(null)
  expect(extractUsage({ Usage: { inputTokens: 3, cacheReadInputTokens: 4 } })).toEqual({ tokens_in: 3, cache_read: 4 })
})

test('a dispatch joins the injected decision of its own session only', () => {
  const log = [
    JSON.stringify({ outcome: 'injected', session_id: 'a', decision: { decision_id: 'r_a' } }),
    JSON.stringify({ outcome: 'injected', session_id: 'b', decision: { decision_id: 'r_b' } }),
    JSON.stringify({ outcome: 'silent', session_id: 'a', decision: { decision_id: 'r_s' } }),
  ].join('\n')
  expect(lastInjectedId(log, 'a')).toBe('r_a')
  expect(lastInjectedId(log, 'c')).toBe(null)
  expect(lastInjectedId(log, undefined)).toBe('r_b')
})

test('a finished worker is summed once per message id, recorded once, and joined to its launch row', () => {
  const block = (id: string, input: number, output: number) => JSON.stringify({ type: 'assistant', message: { id, model: 'claude-haiku-5-5', usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: 7 } } })
  // One response written as three content blocks, output growing while it streamed.
  const text = [block('m1', 10, 1), block('m1', 10, 4), block('m1', 10, 9), block('m2', 3, 2), JSON.stringify({ type: 'assistant', message: { model: '<synthetic>', usage: { input_tokens: 99 } } })].join('\n')
  const summed = sumWorkerUsage(text)
  expect(JSON.stringify(summed)).toBe('[{"tokens_in":13,"tokens_out":11,"cache_read":14,"cache_write":0},"claude-haiku-5-5"]')
  expect(sumWorkerUsage('nothing')).toBe(null)

  const launch = JSON.stringify({ outcome: 'delegated', agent_id: 'a1', decision_id: 'r_1' })
  expect(scanAuditTail(launch, 's', 'a1')).toEqual(['r_1', false])
  expect(scanAuditTail(launch + '\n' + JSON.stringify({ outcome: 'worker_usage', agent_id: 'a1' }), 's', 'a1')).toEqual([null, true])
  expect(scanAuditTail(JSON.stringify({ outcome: 'injected', session_id: 's', decision: { decision_id: 'r_9' } }), 's', 'zz')).toEqual(['r_9', false])

  const row = buildStopRow({ agent_type: 'unified-band:router-haiku', agent_id: 'a1', session_id: 's' }, summed!, 'r_1', 'T')
  expect(row?.outcome).toBe('worker_usage')
  expect(row?.model).toBe('haiku')
  expect(buildStopRow({ agent_type: 'Explore' }, summed!, null, 'T')).toBe(null)
})

test('at the end of a turn every injected decision without an outcome gets one, with the usage of the inline turn', () => {
  const log = [
    JSON.stringify({ outcome: 'injected', session_id: 's', decision: { band: 'auto', decision_id: 'r_1', model: 'sonnet' } }),
    JSON.stringify({ outcome: 'injected', session_id: 's', decision: { band: 'auto', decision_id: 'r_2', model: 'haiku' } }),
    JSON.stringify({ outcome: 'injected', session_id: 'other', decision: { band: 'auto', decision_id: 'r_3', model: 'haiku' } }),
    JSON.stringify({ outcome: 'delegated', decision_id: 'r_2' }),
  ].join('\n')
  const open = unresolvedDecisions(log, 's')
  expect(JSON.stringify(open)).toBe('[["r_1","sonnet"]]')

  const user = JSON.stringify({ type: 'user', message: { content: 'go' } })
  const toolResult = JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result' }] } })
  const reply = (id: string, out: number) => JSON.stringify({ type: 'assistant', message: { id, model: 'claude-opus-5-5', usage: { input_tokens: 4, output_tokens: out, cache_read_input_tokens: 100, cache_creation_input_tokens: 6 } } })
  const old = JSON.stringify({ type: 'assistant', message: { id: 'old', model: 'x', usage: { input_tokens: 1000 } } })
  const usage = sumInlineUsage([old, user, reply('m1', 1), reply('m1', 8), toolResult, reply('m2', 2)].join('\n'))
  expect(JSON.stringify(usage)).toBe('{"model":"claude-opus-5-5","input":8,"output":10,"cache_read":200,"cache_write":12,"context_tokens":110}')
  expect(sumInlineUsage(user)).toBe(null)
  expect(JSON.stringify(reconcileRows(open, 's', null, 'T'))).toBe('[{"ts":"T","session_id":"s","decision_id":"r_1","model":"sonnet","outcome":"auto_inline_unattributed"}]')
})

// Ported from tests/test_waves.py of the original.
const ids = (groups: { id: unknown }[][]) => groups.map(g => g.map(s => s.id))

test('waves: read-only steps and disjoint writers share a batch, overlapping writers split', () => {
  expect(ids(partitionBatches([{ id: 'a', files: [] }, { id: 'b', files: 'none' }, { id: 'c' }]))).toEqual([['a', 'b', 'c']])
  const disjoint = [{ id: 'a', files: ['x.py'] }, { id: 'b', files: ['y.py'] }]
  const overlap = [{ id: 'a', files: ['x.py'] }, { id: 'b', files: ['x.py', 'z.py'] }]
  expect(ids(partitionBatches(disjoint))).toEqual([['a', 'b']])
  expect(ids(partitionBatches(overlap))).toEqual([['a'], ['b']])
  const mixed = [{ id: 'r', files: [] }, { id: 'w1', files: ['x.py'] }, { id: 'w2', files: ['y.py'] }, { id: 'w3', files: ['x.py'] }]
  expect(ids(partitionBatches(mixed))).toEqual([['r', 'w1', 'w2'], ['w3']])
  expect(needsWorktree(overlap)).toBe(true)
  expect(needsWorktree(disjoint)).toBe(false)
})

test('waves: a dependency lands in a later wave, a diamond makes three, a cycle or an unknown id throws', () => {
  expect(ids(computeWaves([{ id: 1, files: ['a.py'] }, { id: 2, files: ['b.py'], depends_on: [1] }]))).toEqual([[1], [2]])
  const diamond = [{ id: 1 }, { id: 2, depends_on: [1] }, { id: 3, depends_on: [1] }, { id: 4, depends_on: [2, 3] }]
  expect(ids(computeWaves(diamond))).toEqual([[1], [2, 3], [4]])
  expect(planExecution(diamond).map(wave => ids(wave))).toEqual([[[1]], [[2, 3]], [[4]]])
  expect(() => computeWaves([{ id: 1, depends_on: [2] }, { id: 2, depends_on: [1] }])).toThrow()
  expect(() => computeWaves([{ id: 1, depends_on: [99] }])).toThrow()
  expect(() => computeWaves([{ id: 1 }, { id: 1 }])).toThrow()
})

test('waves: a Files field is normalised', () => {
  expect(parseFiles('a.py, b.py')).toEqual(['a.py', 'b.py'])
  expect(parseFiles('none')).toEqual([])
  expect(parseFiles('')).toEqual([])
  expect(parseFiles(null)).toEqual([])
  expect(parseFiles(['a.py', ' b.py '])).toEqual(['a.py', 'b.py'])
})
