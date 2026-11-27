// Model router — the pure parts of the audit hooks (Agent dispatch, SubagentStop, Stop).
//
// Ported from post-agent-audit.py, subagent-stop-audit.py and reconcile-outcomes.py of
// auto-model-router 0.9.2 (MIT, iuriiturok, see LICENSE-ROUTER). The line format of
// ~/.claude/cache/router/audit.jsonl is the original's. File reads, the clock and the
// audit file itself belong to router-hook.js; here they come in through `deps`.

import { SYNTHETIC_MODEL, isObject, pyDumps, pyOr, pyStrip, truthy } from './router-core.mjs'

// Bare, the original's namespace, or this plugin's.
const ROUTER_TYPE = /^(?:(?:auto-model-router|unified-band):)?router-(.+)$/
const ESCALATION = /(Stopped: too complex|Done with caveats|RESULT:|OPEN QUESTIONS:|ARTIFACTS:|NEXT STEP:)/
const GROUP_TAG = /^\s*\[grp:([^\]]+)\]\s*/
// Outcomes that mark a decision as accounted for.
const TERMINAL_OUTCOMES = new Set(['delegated', 'delegated_failed', 'same_model_inline', 'continuity_inline', 'skipped_trivial', 'worker_failed', 'auto_inline_unattributed'])

const lines = text => text.split(/\r\n|\n|\r/)
const parseLine = line => {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}
const num = v => Number(pyOr(v, 0)) || 0

// ["router", model] for a router worker, else ["native", null].
export function classifySubagent(type) {
  const m = ROUTER_TYPE.exec(type)
  return m ? ['router', m[1] || '?'] : ['native', null]
}

// A text view of the subagent's response, however it is shaped.
export function extractResponseText(response) {
  if (typeof response === 'string') return response
  if (!isObject(response)) return ''
  if (Array.isArray(response.content)) {
    const parts = response.content.flatMap(block => (isObject(block) && block.type === 'text' ? [block.text ?? ''] : typeof block === 'string' ? [block] : []))
    if (parts.length) return parts.join('')
  }
  for (const key of ['output', 'text', 'result', 'message']) if (typeof response[key] === 'string') return response[key]
  return ''
}

export function extractUsage(response) {
  if (!isObject(response)) return {}
  const u = pyOr(response.usage, response.Usage)
  if (!isObject(u)) return {}
  const found = {
    tokens_in: pyOr(u.input_tokens, u.inputTokens),
    tokens_out: pyOr(u.output_tokens, u.outputTokens),
    cache_read: pyOr(u.cache_read_input_tokens, u.cacheReadInputTokens),
    cache_write: pyOr(u.cache_creation_input_tokens, u.cacheCreationInputTokens),
  }
  return Object.fromEntries(Object.entries(found).filter(([, v]) => v !== undefined && v !== null))
}

// The model a subagent transcript recorded on its last assistant turn.
export function lastModel(text) {
  let model = null
  for (const line of lines(text)) {
    const rec = parseLine(pyStrip(line))
    if (isObject(rec) && rec.type === 'assistant') {
      const m = (isObject(rec.message) ? rec.message : {}).model
      if (truthy(m) && m !== SYNTHETIC_MODEL) model = m
    }
  }
  return model
}

// The decision_id of the newest injected decision of this session in a tail of the audit log.
// Without a session id any session matches; with one, only its own (honest "unknown" beats a wrong join).
export function lastInjectedId(text, sessionId) {
  for (const line of lines(text).reverse()) {
    const rec = parseLine(line)
    if (!isObject(rec) || rec.outcome !== 'injected') continue
    if (sessionId != null && rec.session_id !== sessionId) continue
    return (isObject(rec.decision) ? rec.decision : {}).decision_id ?? null
  }
  return null
}

// PostToolUse on Agent: one outcome row per dispatch, router worker or native subagent.
// deps: now(), decisionId(sessionId), modelActual(transcriptPath, sessionId, agentId), wallMs(toolUseId).
export function buildAgentRow(payload, deps) {
  if (!isObject(payload)) return null
  if (pyOr(payload.tool_name, payload.toolName, payload.tool, '') !== 'Agent') return null
  const rawInput = pyOr(payload.toolInput, payload.tool_input, {})
  const toolInput = isObject(rawInput) ? rawInput : {}
  const subagentType = pyStrip(String(toolInput.subagent_type ?? ''))
  if (!subagentType) return null

  const [kind, model] = classifySubagent(subagentType)
  const response = pyOr(payload.toolResponse, payload.tool_response, {})
  const ok = isObject(response) ? !(truthy(response.error) || truthy(response.is_error)) : truthy(response)
  const respLen = truthy(response) ? pyDumps(response).length : 0
  const text = extractResponseText(response)
  const escalation = text ? ESCALATION.exec(text)?.[1] : undefined

  const sessionId = pyOr(payload.session_id, payload.sessionId)
  const row = {
    ts: deps.now(),
    outcome: kind === 'router' ? (ok ? 'delegated' : 'delegated_failed') : 'native_dispatch',
    kind,
    subagent_type: subagentType,
    response_chars: respLen,
    decision_id: deps.decisionId(sessionId),
  }
  if (kind === 'router') row.model = model

  let agentId
  if (isObject(response)) {
    agentId = response.agentId
    // Join key for the SubagentStop row: a background worker's launch row has no usage.
    if (truthy(agentId)) row.agent_id = agentId
    row.agent_type = pyOr(response.agentType, subagentType)
    if (response.totalTokens != null) row.total_tokens = response.totalTokens
    if (response.totalDurationMs != null) row.duration_ms = response.totalDurationMs
  } else {
    row.agent_type = subagentType
  }
  row.model_actual = deps.modelActual(pyOr(payload.transcript_path, payload.transcriptPath), sessionId, truthy(agentId) ? agentId : undefined) ?? null

  const wall = deps.wallMs(pyOr(payload.toolUseId, payload.tool_use_id))
  if (wall != null) row.wall_ms = wall
  const usage = extractUsage(response)
  if (Object.keys(usage).length) row.usage = usage
  if (escalation) row.escalation = escalation

  let desc = toolInput.description
  if (truthy(desc)) {
    desc = String(desc)
    // "[grp:<id>]" prefixes the description of every dispatch in one parallel batch.
    const m = GROUP_TAG.exec(desc)
    if (m) {
      row.group_id = pyStrip(m[1])
      desc = desc.slice(m[0].length)
    }
    row.description = [...desc].slice(0, 80).join('')
  }
  return row
}

// The finished worker's usage from its own transcript: [{tokens_in, ...}, last model], or null.
// One API response is written once per content block with the same message.id and usage, so fold per id.
export function sumWorkerUsage(text) {
  const messages = new Map()
  let model = null
  lines(text).forEach((line, i) => {
    if (!line.includes('"usage"')) return
    const rec = parseLine(line)
    if (!isObject(rec) || rec.type !== 'assistant') return
    const msg = isObject(rec.message) ? rec.message : {}
    if (msg.model === SYNTHETIC_MODEL || !isObject(msg.usage)) return
    const key = pyOr(msg.id, `_${i}`)
    if (!messages.has(key)) messages.set(key, { tokens_in: 0, tokens_out: 0, cache_read: 0, cache_write: 0 })
    const cur = messages.get(key)
    for (const [field, src] of [['tokens_in', 'input_tokens'], ['tokens_out', 'output_tokens'], ['cache_read', 'cache_read_input_tokens'], ['cache_write', 'cache_creation_input_tokens']]) {
      cur[field] = Math.max(cur[field], num(msg.usage[src]))
    }
    if (truthy(msg.model)) model = msg.model
  })
  if (!messages.size) return null
  const totals = { tokens_in: 0, tokens_out: 0, cache_read: 0, cache_write: 0 }
  for (const m of messages.values()) for (const k of Object.keys(totals)) totals[k] += m[k]
  return [totals, model]
}

// [decision_id for the worker's row, the usage already recorded for it or null].
// With no row of the worker the session's newest injected decision stands in.
export function scanAuditTail(text, sessionId, agentId) {
  let fallback = null
  let launch = null
  for (const line of lines(text).reverse()) {
    const rec = parseLine(line)
    if (!isObject(rec)) continue
    if (agentId && rec.agent_id === agentId) {
      if (rec.outcome === 'worker_usage') return [rec.decision_id ?? null, rec.usage ?? {}]
      launch ??= rec
    }
    if (fallback === null && rec.outcome === 'injected' && (sessionId == null || rec.session_id === sessionId)) {
      fallback = (isObject(rec.decision) ? rec.decision : {}).decision_id ?? null
    }
  }
  return [launch ? launch.decision_id ?? null : fallback, null]
}

// SubagentStop: the row for a finished router worker. null for any other agent.
export function buildStopRow(payload, summed, decisionId, now) {
  const m = ROUTER_TYPE.exec(pyStrip(String(pyOr(payload.agent_type, payload.subagent_type, ''))))
  if (!m) return null
  const [usage, modelActual] = summed
  return {
    ts: now,
    outcome: 'worker_usage',
    kind: 'router',
    subagent_type: pyStrip(String(pyOr(payload.agent_type, payload.subagent_type, ''))),
    model: m[1] || '?',
    agent_id: payload.agent_id ?? null,
    session_id: payload.session_id ?? null,
    decision_id: decisionId,
    model_actual: modelActual,
    usage,
  }
}

// ---- Stop: decisions that never got an outcome row ----

// A genuine user message: not a tool_result envelope.
function isHumanTurn(rec) {
  if (rec.type !== 'user') return false
  const content = (isObject(rec.message) ? rec.message : {}).content
  if (typeof content === 'string') return pyStrip(content) !== ''
  if (Array.isArray(content)) {
    const hasText = content.some(b => isObject(b) && b.type === 'text')
    const hasResult = content.some(b => isObject(b) && b.type === 'tool_result')
    return hasText && !hasResult
  }
  return false
}

// The assistant usage realized inline since the last human turn, folded per message id:
// {model, input, output, cache_read, cache_write, context_tokens}, or null.
export function sumInlineUsage(text) {
  const records = lines(text).flatMap(line => {
    const rec = parseLine(pyStrip(line))
    return isObject(rec) ? [rec] : []
  })
  let lastHuman = -1
  records.forEach((rec, i) => {
    if (isHumanTurn(rec)) lastHuman = i
  })
  const messages = new Map()
  let model = null
  records.slice(lastHuman + 1).forEach((rec, i) => {
    if (rec.type !== 'assistant') return
    const msg = isObject(rec.message) ? rec.message : {}
    if (msg.model === SYNTHETIC_MODEL) return
    const usage = pyOr(msg.usage, {})
    if (!truthy(usage)) return
    const key = pyOr(msg.id, `_${i}`)
    if (!messages.has(key)) messages.set(key, { input: 0, output: 0, cache_read: 0, cache_write: 0 })
    const cur = messages.get(key)
    cur.input = Math.max(cur.input, num(usage.input_tokens))
    cur.output = Math.max(cur.output, num(usage.output_tokens))
    cur.cache_read = Math.max(cur.cache_read, num(usage.cache_read_input_tokens))
    cur.cache_write = Math.max(cur.cache_write, num(usage.cache_creation_input_tokens))
    if (truthy(msg.model)) model = msg.model
  })
  if (!messages.size) return null
  const totals = { input: 0, output: 0, cache_read: 0, cache_write: 0 }
  for (const m of messages.values()) for (const k of Object.keys(totals)) totals[k] += m[k]
  const last = [...messages.values()].pop()
  return { model, ...totals, context_tokens: last.input + last.cache_read + last.cache_write }
}

// This session's injected auto decisions with no terminal row yet: [[decision_id, model], ...].
export function unresolvedDecisions(auditText, sessionId) {
  const mine = new Map()
  const resolved = new Set()
  for (const line of lines(auditText)) {
    const row = parseLine(pyStrip(line))
    if (!isObject(row)) continue
    const dec = isObject(row.decision) ? row.decision : {}
    if (row.outcome === 'injected') {
      if (row.session_id === sessionId && dec.band === 'auto' && truthy(dec.decision_id)) mine.set(dec.decision_id, dec.model)
    } else if (TERMINAL_OUTCOMES.has(row.outcome)) {
      const id = pyOr(row.decision_id, dec.decision_id)
      if (truthy(id)) resolved.add(id)
    }
  }
  return [...mine].filter(([id]) => !resolved.has(id))
}

export function reconcileRows(unresolved, sessionId, usage, now) {
  return unresolved.map(([id, model]) => {
    const row = { ts: now, session_id: sessionId, decision_id: id, model, outcome: 'auto_inline_unattributed' }
    if (usage) row.usage = usage
    return row
  })
}
