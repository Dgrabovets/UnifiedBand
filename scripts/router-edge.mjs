// Edge-case checks for the built-in router hooks, run the way hooks.json runs them: bad input, UTF-8,
// rotation, concurrent appends, opt-outs and the conflict guard, and the latency of one hook.
// Needs only Node. Usage: node scripts/router-edge.mjs [plugin root, default: this repository]
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), '..')
const work = mkdtempSync(join(tmpdir(), 'router-edge-'))
const cmd = ev => `node -e "require(require('path').join(process.env.CLAUDE_PLUGIN_ROOT.split(String.fromCharCode(92)).join('/'), 'hooks/router-hook.js'))" ${ev}`
let failures = 0
const check = (name, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

function run(ev, input, env = {}, cwd = work) {
  const cache = env.CC_ROUTER_CACHE_DIR
  const t0 = Date.now()
  const r = spawnSync(cmd(ev), { shell: true, input: Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8'), cwd, timeout: 20000, env: { ...process.env, CLAUDE_PLUGIN_ROOT: ROOT, CLAUDE_CONFIG_DIR: join(work, 'cfg'), ...env } })
  return { status: r.status, out: r.stdout.toString('utf8'), err: r.stderr.toString('utf8'), ms: Date.now() - t0, cache }
}
const payload = (o = {}) => JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 's1', cwd: work, permission_mode: 'default', ...o })
const lines = file => (existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean) : [])

// 1. Bad input never blocks and never prints.
{
  const cache = join(work, 'c1')
  for (const [name, input] of [['empty', ''], ['not json', 'not json'], ['array', '[]'], ['null', 'null'], ['number', '42'], ['truncated', '{"prompt": "hel'], ['binary', Buffer.from([0, 255, 254, 1, 2, 3])], ['no prompt field', payload({ prompt: undefined })], ['prompt is a number', payload({ prompt: 5 })], ['prompt is null', payload({ prompt: null })], ['huge prompt', payload({ prompt: 'refactor the module '.repeat(300000) })]]) {
    const r = run('prompt', input, { CC_ROUTER_CACHE_DIR: cache })
    check(`bad input: ${name}`, r.status === 0 && r.err === '' && (name === 'huge prompt' || r.out === ''), `exit ${r.status} stderr ${JSON.stringify(r.err.slice(0, 80))} ${r.ms}ms`)
  }
  for (const ev of ['pre-agent', 'post-agent', 'subagent', 'reconcile']) {
    for (const input of ['', 'junk', '{}', '[]', JSON.stringify({ session_id: 'x', tool_name: 'Agent' })]) {
      const r = run(ev, input, { CC_ROUTER_CACHE_DIR: cache })
      check(`bad input to ${ev}: ${JSON.stringify(input).slice(0, 30)}`, r.status === 0 && r.err === '' && r.out === '')
    }
  }
  const bad = lines(join(cache, 'audit.jsonl')).filter(l => { try { JSON.parse(l); return false } catch { return true } })
  check('audit log has no broken lines after bad input', bad.length === 0, `${lines(join(cache, 'audit.jsonl')).length} lines`)
}

// 2. Non-English text through the real pipe as UTF-8.
{
  const cache = join(work, 'c2')
  const cases = [
    ['Перепиши весь модуль платежей на новую архитектуру и добавь тесты для всех веток', 'complex'],
    ['Переименуй переменную x в y', 'trivial-ish'],
    ['请重构整个支付模块并为所有分支添加测试', 'cjk'],
    ['Refactor the whole payment module and add tests for every branch', 'ascii twin'],
  ]
  for (const [i, [prompt, label]] of cases.entries()) {
    const r = run('prompt', payload({ prompt, session_id: 'u' + i }), { CC_ROUTER_CACHE_DIR: cache })
    const last = lines(join(cache, 'audit.jsonl')).at(-1)
    const row = last ? JSON.parse(last) : null
    check(`utf-8 prompt (${label})`, r.status === 0 && row && row.decision, row ? `tier ${row.decision.tier}, model ${row.decision.model}, ${row.decision.reason}` : 'no row')
  }
}

// 3. Rotation keeps the log small and its lines whole.
{
  const cache = join(work, 'c3')
  for (let i = 0; i < 60; i++) run('prompt', payload({ prompt: `refactor the billing module part ${i} and add tests across the repo`, session_id: 'r' + (i % 3) }), { CC_ROUTER_CACHE_DIR: cache, CC_ROUTER_AUDIT_MAX_BYTES: '6000' })
  const files = readdirSync(cache).filter(f => f.startsWith('audit'))
  const size = statSync(join(cache, 'audit.jsonl')).size
  const broken = files.flatMap(f => lines(join(cache, f)).filter(l => { try { JSON.parse(l); return false } catch { return true } }))
  check('rotation: live log stays near the limit', size < 6000 + 2500, `${size} bytes, files: ${files.join(', ')}`)
  check('rotation: no broken lines in any file', broken.length === 0, `${broken.length} broken`)
}

// 4. Many hooks at the same moment append whole lines and lose none.
{
  const cache = join(work, 'c4')
  const N = 24
  await Promise.all(Array.from({ length: N }, (_, i) => new Promise(res => {
    const p = spawn(cmd('prompt'), { shell: true, cwd: work, env: { ...process.env, CLAUDE_PLUGIN_ROOT: ROOT, CLAUDE_CONFIG_DIR: join(work, 'cfg'), CC_ROUTER_CACHE_DIR: cache } })
    p.stdin.end(payload({ prompt: `implement feature number ${i} across the whole codebase with tests`, session_id: 'p' + i }))
    p.on('close', res)
  })))
  const ls = lines(join(cache, 'audit.jsonl'))
  const ok = ls.filter(l => { try { JSON.parse(l); return true } catch { return false } })
  check('concurrent appends: every hook wrote one whole line', ls.length === N && ok.length === N, `${ok.length} whole of ${ls.length} lines for ${N} hooks`)
}

// 5. Opt-outs and overrides do what the README says.
{
  const cache = join(work, 'c5')
  const env = { CC_ROUTER_CACHE_DIR: cache }
  const ask = (prompt, extra = {}, e = env, cwd = work) => run('prompt', payload({ prompt, ...extra }), e, cwd)
  const forced = ask('#model=haiku add a comment to the readme', { session_id: 'o1' })
  check('#model=haiku injects the unified-band worker', forced.out.includes('unified-band:router-haiku'), forced.out.slice(0, 160).replace(/\n/g, ' '))
  const off = ask('#noroute refactor everything in the repo and add tests', { session_id: 'o2' })
  check('#noroute injects nothing', off.out === '' && off.status === 0)
  const dis = ask('refactor everything in the repo and add tests', { session_id: 'o3' }, { ...env, CC_ROUTER_DISABLE: '1' })
  check('CC_ROUTER_DISABLE=1 injects nothing and logs nothing new', dis.out === '' && !lines(join(cache, 'audit.jsonl')).some(l => l.includes('"o3"')))
  const proj = join(work, 'proj')
  mkdirSync(join(proj, '.claude'), { recursive: true })
  writeFileSync(join(proj, '.claude', 'router.json'), JSON.stringify({ disabled: true }))
  const rj = ask('refactor everything in the repo and add tests', { session_id: 'o4', cwd: proj }, env, proj)
  check('router.json {"disabled": true} injects nothing', rj.out === '' && rj.status === 0)
  const bad = join(work, 'projbad')
  mkdirSync(join(bad, '.claude'), { recursive: true })
  writeFileSync(join(bad, '.claude', 'router.json'), '{ not json')
  const rb = ask('refactor everything in the repo and add tests', { session_id: 'o5', cwd: bad }, env, bad)
  check('a broken router.json does not break the hook', rb.status === 0 && rb.err === '', `exit ${rb.status}`)
  const plan = ask('plan how to migrate the database and then update all callers', { session_id: 'o6', permission_mode: 'plan' })
  check('plan mode still answers with exit 0', plan.status === 0, plan.out ? plan.out.slice(0, 100).replace(/\n/g, ' ') : '(silent)')
  // The original plugin enabled in the user's settings: the built-in hooks step back.
  const cfg = join(work, 'cfg2')
  mkdirSync(cfg, { recursive: true })
  writeFileSync(join(cfg, 'settings.json'), JSON.stringify({ enabledPlugins: { 'auto-model-router@auto-model-router-mp': true } }))
  const both = ask('refactor everything in the repo and add tests', { session_id: 'o7' }, { ...env, CLAUDE_CONFIG_DIR: cfg })
  check('original plugin enabled: built-in router steps back', both.out === '' && !lines(join(cache, 'audit.jsonl')).some(l => l.includes('"o7"')))
  writeFileSync(join(cfg, 'settings.json'), JSON.stringify({ enabledPlugins: { 'auto-model-router@auto-model-router-mp': false } }))
  const off2 = ask('refactor everything in the repo and add tests', { session_id: 'o8' }, { ...env, CLAUDE_CONFIG_DIR: cfg })
  check('original plugin disabled: built-in router works', lines(join(cache, 'audit.jsonl')).some(l => l.includes('"o8"')))
}

// A worker's SubagentStop: one row, a second one only after the worker went on and its totals grew.
{
  const cache = join(work, 'c7')
  const transcript = join(work, 'agent-w1.jsonl')
  const reply = (id, output) => JSON.stringify({ type: 'assistant', message: { id, model: 'claude-sonnet-5-5', usage: { input_tokens: 1, output_tokens: output } } })
  const stop = () => run('subagent', JSON.stringify({ agent_type: 'unified-band:router-sonnet', agent_id: 'w1', session_id: 's1', agent_transcript_path: transcript }), { CC_ROUTER_CACHE_DIR: cache })
  const rows = () => lines(join(cache, 'audit.jsonl')).map(l => JSON.parse(l))
  writeFileSync(transcript, reply('m1', 10))
  const first = stop()
  check('a finished worker is recorded', first.status === 0 && first.err === '' && rows().length === 1 && rows()[0].usage.tokens_out === 10)
  writeFileSync(transcript, `${reply('m1', 10)}\n${reply('m2', 5)}`)
  stop()
  check('a continued worker gets a new row with its larger totals', rows().length === 2 && rows()[1].usage.tokens_out === 15)
  stop()
  check('a stop with nothing new adds no row', rows().length === 2)
}

// 6. Latency of one hook, cold, as Claude Code pays it on every prompt.
{
  const cache = join(work, 'c6')
  const ms = []
  for (let i = 0; i < 12; i++) ms.push(run('prompt', payload({ prompt: 'rename the variable total to sum in utils.js', session_id: 'l' + i }), { CC_ROUTER_CACHE_DIR: cache }).ms)
  ms.sort((a, b) => a - b)
  check('latency: the prompt hook answers well inside its 5 s limit', ms.at(-1) < 2500, `median ${ms[6]} ms, slowest ${ms.at(-1)} ms`)
  const pre = []
  for (let i = 0; i < 6; i++) pre.push(run('pre-agent', JSON.stringify({ tool_name: 'Agent', tool_use_id: 't' + i, tool_input: { subagent_type: 'general-purpose' } }), { CC_ROUTER_CACHE_DIR: cache }).ms)
  pre.sort((a, b) => a - b)
  check('latency: the Agent pre hook fits its 2 s limit', pre.at(-1) < 1500, `median ${pre[3]} ms, slowest ${pre.at(-1)} ms`)
}

rmSync(work, { recursive: true, force: true })
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
