// Router differential test: the original Python hook against this repo's port.
//
//   node scripts/router-differential.mjs <original plugin folder>           write tests/router-fixture.ts
//   node scripts/router-differential.mjs <original plugin folder> --hooks   run both hook sets end to end and compare
//
// The first form runs the ORIGINAL hooks/auto-router.py over scripts/router-corpus.mjs and writes
// what it did (audit row, injected text) into tests/router-fixture.ts, which tests/router.test.ts
// checks the port against without Python. The second form needs Python too: it runs the Python
// hook and hooks/router-hook.js on every case and compares the audit lines they write, then does
// the same for the Agent, SubagentStop and Stop hooks on one scripted session.
// Both use throwaway folders; nothing touches the real Claude config.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import prompts, { extra } from './router-corpus.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const original = process.argv[2]
const hooksMode = process.argv.includes('--hooks')
if (!original) {
  console.error('usage: node scripts/router-differential.mjs <original plugin folder> [--hooks]')
  process.exit(2)
}
const pythonHook = join(original, 'hooks', 'auto-router.py')

const assistant = (model, ctx = 0, id = 'm1') => JSON.stringify({ type: 'assistant', message: { id, role: 'assistant', model, usage: { input_tokens: ctx, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 5 } } })
const user = JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } })

function transcriptFor({ parent, ctx = 0, transcript }) {
  const model = `claude-${parent ?? 'opus'}-5-5`
  if (transcript === 'garbage') return 'not json\n{broken\n[1,2]\n'
  if (transcript === 'mythos') return [user, assistant('claude-mythos-5', ctx)].join('\n') + '\n'
  if (transcript === 'synthetic-last') return [user, assistant(model, ctx), assistant('<synthetic>', 0, 'm2')].join('\n') + '\n'
  if (transcript === 'assistant-in-the-middle') return [assistant('claude-opus-5-5', 10, 'a'), assistant(model, ctx, 'b'), user].join('\n') + '\n'
  return parent ? [user, assistant(model, ctx)].join('\n') + '\n' : ''
}

const cases = [
  ...prompts.flatMap(p => [{ ...p, parent: null }, { ...p, parent: 'sonnet' }]),
  ...extra.map(([name, options]) => ({ ...prompts.find(p => p.name === name), ...options })),
].map((c, i) => ({ id: i, plan: false, ctx: 0, ...c }))

// ts and the random decision id differ on every run; the session id and config path are per run.
function normalize(row, sessionId) {
  const out = JSON.parse(JSON.stringify(row))
  delete out.ts
  delete out.prompt_sha
  if (out.session_id === sessionId) out.session_id = 'sid'
  if (out.decision_id) out.decision_id = 'r_x'
  if (out.decision?.decision_id) out.decision.decision_id = 'r_x'
  if (out.decision?.project_config) out.decision.project_config = '<config>'
  return out
}
const normalizeContext = text => (text ? text.replace(/r_[0-9a-f]{10}/, 'r_x').replace('auto-model-router:router-', 'unified-band:router-') : null)

function runCase(c, kind) {
  const dir = mkdtempSync(join(tmpdir(), 'router-diff-'))
  try {
    const cache = join(dir, 'cache')
    const project = join(dir, 'project')
    mkdirSync(join(project, '.claude'), { recursive: true })
    mkdirSync(join(dir, 'claude'))
    if (c.config) writeFileSync(join(project, '.claude', 'router.json'), JSON.stringify(c.config))
    const transcript = join(dir, 'transcript.jsonl')
    writeFileSync(transcript, c.transcript)
    const sessionId = `sid-${c.id}`
    const payload = { hook_event_name: 'UserPromptSubmit', prompt: c.prompt, cwd: project, session_id: sessionId, permission_mode: c.plan ? 'plan' : 'default' }
    if (c.transcript) payload.transcript_path = transcript
    const env = { ...process.env, CC_ROUTER_CACHE_DIR: cache, CC_ROUTER_GLOBAL_CONFIG: join(dir, 'none.json'), CLAUDE_CONFIG_DIR: join(dir, 'claude'), PYTHONUTF8: '1' }
    delete env.CLAUDE_PROJECT_DIR
    delete env.CC_ROUTER_DISABLE
    const [cmd, args] = kind === 'python' ? ['python', [pythonHook]] : ['node', [join(root, 'hooks', 'router-hook.js'), 'prompt']]
    const run = spawnSync(cmd, args, { input: JSON.stringify(payload), cwd: project, env, encoding: 'utf8' })
    if (run.status !== 0) throw new Error(`${kind} exited ${run.status} on ${c.name}: ${run.stderr}`)
    let log = ''
    try {
      log = readFileSync(join(cache, 'audit.jsonl'), 'utf8')
    } catch {}
    return { sessionId, project, stdout: run.stdout.trim(), lines: log.split(/\r?\n/).filter(Boolean) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}


// The other four hooks on one scripted session: the audit lines each set writes must match.
const AGENT_STEPS = [
  ['pre-agent-mark.py', 'pre-agent', { tool_name: 'Agent', tool_use_id: 'u1', tool_input: { subagent_type: 'auto-model-router:router-sonnet' } }],
  ['post-agent-audit.py', 'post-agent', { tool_name: 'Agent', tool_use_id: 'u1', tool_input: { subagent_type: 'auto-model-router:router-sonnet', description: '[grp:g7] fix the café bug' }, tool_response: { agentId: 'a1', agentType: 'router-sonnet', totalTokens: 99, totalDurationMs: 1234, usage: { input_tokens: 5, output_tokens: 0, cache_read_input_tokens: 3 }, content: [{ type: 'text', text: 'Done: ok\nRESULT: fine' }] } }],
  ['post-agent-audit.py', 'post-agent', { tool_name: 'Agent', tool_input: { subagent_type: 'Explore', description: 'look around' }, tool_response: 'plain text answer' }],
  ['post-agent-audit.py', 'post-agent', { tool_name: 'Agent', tool_input: { subagent_type: 'auto-model-router:router-haiku' }, tool_response: { is_error: true } }],
  ['post-agent-audit.py', 'post-agent', { tool_name: 'Agent', tool_input: { subagent_type: 'router-opus' }, tool_response: { Usage: { inputTokens: 2 }, agentId: 'a2' } }],
  ['post-agent-audit.py', 'post-agent', { tool_name: 'Bash', tool_input: { command: 'ls' } }],
  ['subagent-stop-audit.py', 'subagent', { agent_type: 'auto-model-router:router-sonnet', agent_id: 'a1' }],
  ['subagent-stop-audit.py', 'subagent', { agent_type: 'auto-model-router:router-sonnet', agent_id: 'a1' }],
  ['subagent-stop-audit.py', 'subagent', { agent_type: 'Explore', agent_id: 'a3' }],
  ['reconcile-outcomes.py', 'reconcile', {}],
]

function runAgentScenario(kind) {
  const dir = mkdtempSync(join(tmpdir(), 'router-diff-agent-'))
  try {
    const cache = join(dir, 'cache')
    mkdirSync(cache)
    mkdirSync(join(dir, 'claude'))
    mkdirSync(join(dir, 'sess', 'subagents'), { recursive: true })
    const blocks = [assistant('claude-sonnet-5-5', 10, 'w1'), assistant('claude-sonnet-5-5', 10, 'w1'), assistant('claude-sonnet-5-5', 4, 'w2')]
    writeFileSync(join(dir, 'sess', 'subagents', 'agent-a1.jsonl'), blocks.join('\n') + '\n')
    writeFileSync(join(dir, 'sess', 'subagents', 'agent-a2.jsonl'), assistant('claude-opus-5-5', 1, 'o1') + '\n')
    const transcript = join(dir, 'parent.jsonl')
    writeFileSync(transcript, [user, assistant('claude-opus-5-5', 50, 'p1'), JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result' }] } }), assistant('claude-opus-5-5', 70, 'p2')].join('\n') + '\n')
    const injected = (id, model) => JSON.stringify({ ts: 'x', session_id: 'sess', turns: 1, decision: { band: 'auto', model, decision_id: id }, outcome: 'injected' })
    writeFileSync(join(cache, 'audit.jsonl'), [injected('r_aaaaaaaaaa', 'haiku'), injected('r_bbbbbbbbbb', 'sonnet')].join('\n') + '\n')
    const env = { ...process.env, CC_ROUTER_CACHE_DIR: cache, CLAUDE_CONFIG_DIR: join(dir, 'claude'), PYTHONUTF8: '1' }
    delete env.CLAUDE_PROJECT_DIR
    delete env.CC_ROUTER_DISABLE
    for (const [script, event, body] of AGENT_STEPS) {
      const payload = { session_id: 'sess', transcript_path: transcript, ...body }
      const [cmd, args] = kind === 'python' ? ['python', [join(original, 'hooks', script)]] : ['node', [join(root, 'hooks', 'router-hook.js'), event]]
      const run = spawnSync(cmd, args, { input: JSON.stringify(payload), cwd: dir, env, encoding: 'utf8' })
      if (run.status !== 0) throw new Error(`${kind} ${script} exited ${run.status}: ${run.stderr}`)
    }
    return readFileSync(join(cache, 'audit.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(l => l.replace(/"ts": "[^"]*"/, '"ts": "T"').replace(/"wall_ms": \d+/, '"wall_ms": 0'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// The conflict guard: with the original plugin enabled in settings, the port writes and says nothing.
// `layers` is a list of [scope, enabledPlugins]: the narrower settings win over the wider ones, as in Claude Code.
function guardRows(layers) {
  const dir = mkdtempSync(join(tmpdir(), 'router-diff-guard-'))
  try {
    const claude = join(dir, 'claude')
    const project = join(dir, 'project')
    mkdirSync(claude)
    mkdirSync(join(project, '.claude'), { recursive: true })
    for (const [scope, enabledPlugins] of layers) {
      const settings = scope === 'user' ? join(claude, 'settings.json') : join(project, '.claude', scope === 'project' ? 'settings.json' : 'settings.local.json')
      writeFileSync(settings, JSON.stringify({ enabledPlugins }))
    }
    const env = { ...process.env, CC_ROUTER_CACHE_DIR: join(dir, 'cache'), CC_ROUTER_GLOBAL_CONFIG: join(dir, 'none.json'), CLAUDE_CONFIG_DIR: claude }
    delete env.CC_ROUTER_DISABLE
    env.CLAUDE_PROJECT_DIR = project
    const payload = { hook_event_name: 'UserPromptSubmit', prompt: 'fix the typo in the README title please', session_id: 'g', cwd: project }
    const run = spawnSync('node', [join(root, 'hooks', 'router-hook.js'), 'prompt'], { input: JSON.stringify(payload), cwd: project, env, encoding: 'utf8' })
    let log = ''
    try {
      log = readFileSync(join(dir, 'cache', 'audit.jsonl'), 'utf8')
    } catch {}
    return `${run.status}|${run.stdout.length > 0}|${log.length > 0}`
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

for (const c of cases) c.transcript = transcriptFor(c)

if (!hooksMode) {
  for (const c of cases) {
    const r = runCase(c, 'python')
    if (r.lines.length > 1) throw new Error(`more than one audit row for ${c.name}`)
    const context = r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : null
    c.expected = { row: r.lines.length ? normalize(JSON.parse(r.lines[0]), r.sessionId) : null, context: normalizeContext(context) }
  }
  const body = JSON.stringify(cases.map(({ id, ...c }) => c), null, 1)
  writeFileSync(
    join(root, 'tests', 'router-fixture.ts'),
    `// Generated by scripts/router-differential.mjs from the original auto-model-router 0.9.2 hook. Do not edit.\n` +
      `// A case is the input of one prompt; expected is what the Python hook wrote and said.\n` +
      `// The injected text names unified-band: workers where the original named auto-model-router:, on purpose.\n` +
      `export type Case = { name: string; prompt: string; parent: string | null; plan: boolean; ctx: number; transcript: string; config?: Record<string, unknown>; expected: { row: Record<string, any> | null; context: string | null } }\n\n` +
      `export const cases: Case[] = ${body}\n`,
  )
  console.log(`wrote ${cases.length} cases`)
} else {
  // End to end: the raw audit line and the stdout, character for character, apart from what differs per run.
  // One accepted difference: Python writes a float like 1.0, JavaScript writes 1.
  const fix = (line, r) =>
    line
      .replace(/"ts": "[^"]*"/, '"ts": "T"')
      .replace(/r_[0-9a-f]{10}/g, 'r_x')
      .replace(`"${r.sessionId}"`, '"sid"')
      .replace(/"project_config": "[^"]*"/, '"project_config": "<config>"')
      .replace(/"confidence": 1\.0/, '"confidence": 1')
      .replace('auto-model-router:router-', 'unified-band:router-')
  let same = 0
  const bad = []
  for (const c of cases) {
    const py = runCase(c, 'python')
    const js = runCase(c, 'node')
    const a = { lines: py.lines.map(l => fix(l, py)), out: fix(py.stdout, py) }
    const b = { lines: js.lines.map(l => fix(l, js)), out: fix(js.stdout, js) }
    if (JSON.stringify(a) === JSON.stringify(b)) same++
    else bad.push({ name: c.name, parent: c.parent, a, b })
  }
  console.log(`${same} of ${cases.length} prompt cases identical`)
  for (const d of bad) console.log(JSON.stringify(d, null, 1))

  const [pyLines, jsLines] = [runAgentScenario('python'), runAgentScenario('node')]
  const agentSame = pyLines.length === jsLines.length && pyLines.every((l, i) => l === jsLines[i])
  console.log(`agent, subagent and stop hooks: ${agentSame ? `${jsLines.length} audit lines identical` : 'DIFFERENT'}`)
  if (!agentSame) console.log(JSON.stringify({ python: pyLines, node: jsLines }, null, 1))

  const on = { 'auto-model-router@auto-model-router-mp': true }
  const off = { 'auto-model-router@auto-model-router-mp': false }
  const guard = [
    ['user on', [['user', on]], '0|false|false'],
    ['project on', [['project', on]], '0|false|false'],
    ['local on', [['local', on]], '0|false|false'],
    ['user off', [['user', off]], '0|true|true'],
    ['another plugin', [['user', { 'other@market': true }]], '0|true|true'],
    ['nothing set', [], '0|true|true'],
    ['user on, project off', [['user', on], ['project', off]], '0|true|true'],
    ['user off, project on', [['user', off], ['project', on]], '0|false|false'],
    ['user on, local off', [['user', on], ['local', off]], '0|true|true'],
    ['project on, local off', [['project', on], ['local', off]], '0|true|true'],
    ['user off, project on, local off', [['user', off], ['project', on], ['local', off]], '0|true|true'],
    ['user on, project off, local on', [['user', on], ['project', off], ['local', on]], '0|false|false'],
  ].map(([name, layers, want]) => {
    const got = guardRows(layers)
    return `${name}: ${got === want ? 'ok' : 'WRONG ' + got}`
  })
  console.log(`conflict guard:${guard.map(g => '\n  ' + g).join('')}`)
  process.exit(bad.length || !agentSame || guard.some(g => g.includes('WRONG')) ? 1 : 0)
}
