// Model router — the pure logic: classifier, routing decision, audit rows.
//
// Ported from the Python hooks of auto-model-router 0.9.2 (MIT, iuriiturok, see LICENSE-ROUTER).
// No imports on purpose: a test can load this file, and everything that touches
// the disk, stdin or the clock is passed in (see router-hook.js, the thin wrapper).
// It is ESM because the test loader cannot import CommonJS; the hooks load it with import().

export const MODEL_TIERS = {
  haiku: { effort: 'low', agent: 'router-haiku', autoRoutable: true },
  sonnet: { effort: 'medium', agent: 'router-sonnet', autoRoutable: true },
  opus: { effort: 'high', agent: 'router-opus', autoRoutable: true },
  fable: { effort: 'high', agent: 'router-fable', autoRoutable: false },
}
// Cheapest first. Injection is downhill-only: a routed model at or above the session's rank buys nothing.
export const TIER_RANK = Object.fromEntries(Object.keys(MODEL_TIERS).map((name, i) => [name, i]))
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh']
export const DEFAULT_PARENT_MODEL = 'opus'
export const SYNTHETIC_MODEL = '<synthetic>'
export const NAMESPACE = 'unified-band'
export const BUDGET_THROTTLE_PROMPTS = 10
export const FOLLOWUP_MAX_WORDS = 8

// Python's \w, \s and \b are Unicode-aware; the JS ones are ASCII, so spell them out.
const WORD = '\\p{L}\\p{N}_'
const SPACE = '\\t\\n\\v\\f\\r \\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000'
const B = `(?:(?<=[${WORD}])(?![${WORD}])|(?<![${WORD}])(?=[${WORD}]))`
// Python's ^ with re.M: the start, or right after a \n (JS also breaks on \r and U+2028).
const LINE = '(?<![^\\n])'
const re = (source, flags = 'u') => new RegExp(source, flags)
// Russian is matched by stems (a verb has many endings), so a stem takes any letters after it.
// This is the one place the port goes beyond the Python original, which knew English words only:
// a Russian prompt gets the decision its English translation would get (tests/router-russian.test.ts).
const RW = `[${WORD}]*`
const ru = stems => stems.map(stem => stem.replaceAll('*', RW)).join('|')

const LOOKUP_VERBS = re(
  `^(what is|where is|is there|does|list|show|what|where|when|who|which|find|` +
    `count|how many|status|read|print|display|tell me|summari[sz]e|name |give me|` +
    `do you have|check|grep|search|ls|cat|open|view|` +
    ru(['что такое', 'что', 'где', 'есть ли', 'покажи', 'выведи', 'сколько', 'кто', 'когда', 'какой', 'какая', 'какое', 'какие', 'найди', 'поищи', 'перечисли', 'прочитай', 'прочти', 'скажи', 'открой', 'проверь']) +
    `)${B}`,
  'iu',
)
const COMPLEX_VERBS = re(
  `${B}(refactor|redesign|migrate|integrate|implement|optimi[sz]e|rewrite|restructure|port|extract|consolidate|` +
    ru(['рефактор*', 'перепиш*', 'переработ*', 'перестро*', 'перепроектир*', 'реализ*', 'мигрир*', 'перенес*', 'перенос*', 'оптимиз*', 'интегрир*', 'консолидир*', 'вынес*', 'вынос*', 'извлеч*', 'переосмысл*']) +
    `)${B}`,
  'iu',
)
// Breadth signals keep a short "complex" verb on Opus instead of Sonnet.
const BREADTH_SIGNAL = re(
  `${B}(architect[${WORD}]*|whole|entire|subsystem|infrastructure|platform|multi[- ]?tenant|end[- ]to[- ]end|system[- ]wide|codebase|` +
    ru(['архитектур*', 'весь', 'вся', 'всю', 'всей', 'целиком', 'полностью', 'подсистем*', 'инфраструктур*', 'платформ*', 'мультитенант*', 'сквозн*', 'кодов* баз*', 'кодбейс*', 'по всему', 'во всем', 'во всём']) +
    `)${B}`,
  'iu',
)
const DEEP_VERBS = re(
  `${B}(plan|architect|design|investigate|brainstorm|analy[sz]e|audit|profile|diagnose|root[- ]cause|` +
    ru(['спланир*', 'планир*', 'спроектир*', 'проектир*', 'исследуй*', 'исследов*', 'обдума*', 'продума*', 'проанализир*', 'анализир*', 'аудит*', 'профилир*', 'диагностир*', 'первопричин*', 'корневая причина', 'брейншторм*']) +
    `)${B}`,
  'iu',
)
const OVERRIDE_PATTERN = re(`#model=(${Object.keys(MODEL_TIERS).join('|')})${B}`, 'iu')
const FILE_PATH = re(
  `(?<![:${WORD}])(?:~|\\.{0,2}/)[${WORD}./~-]+|${B}[${WORD}-]+\\.(?:py|ts|tsx|js|jsx|md|json|yaml|yml|sh|rs|go|java|cpp|c|h)${B}`,
  'gu',
)
const EFFORT_HEAVY_VERBS = re(
  `${B}(refactor|migrate|investigate|audit|architect|integrate|restructure|optimi[sz]e|across|consolidate|review|rewrite|redesign|implement|port|extract|build|` +
    ru(['рефактор*', 'мигрир*', 'исследов*', 'исследуй*', 'аудит*', 'интегрир*', 'перестро*', 'оптимиз*', 'по всем', 'по всему', 'во всех', 'консолидир*', 'ревью', 'проревью*', 'перепиш*', 'переработ*', 'перепроектир*', 'реализ*', 'перенес*', 'вынес*', 'постро*', 'разработ*']) +
    `)${B}`,
  'iu',
)
const TEST_VERIFY = re(`${B}(test|tests|verify|verification|spec|specs|${ru(['тест*', 'проверк*', 'проверь*', 'верифиц*', 'спек*'])})${B}`, 'iu')
const NUMBERED_ITEM = re(`${LINE}[${SPACE}]*\\p{Nd}+[.)][${SPACE}]+[^${SPACE}]`, 'gu')
const BULLET_ITEM = re(`${LINE}[${SPACE}]*[-*•][${SPACE}]+[^${SPACE}]`, 'gu')
const FOR_EACH = re(`${B}(for (each|all of|every|both)|для (каждого|каждой|каждое|каждых|обоих|обеих))${B}`, 'iu')
const IMPERATIVE_VERB = re(
  `${B}(add|update|fix|create|write|refactor|remove|delete|rename|bump|implement|build|run|test|` +
    `document|review|check|move|generate|wire|replace|migrate|extract|install|configure|set up|` +
    ru(['добав*', 'обнов*', 'исправ*', 'созда*', 'напиш*', 'удал*', 'переимен*', 'реализ*', 'собер*', 'запуст*', 'протестир*', 'задокументир*', 'проверь*', 'перемест*', 'сгенерир*', 'замен*', 'мигрир*', 'вынес*', 'установ*', 'настро*', 'рефактор*']) +
    `)${B}`,
  'giu',
)
// Harness events reach UserPromptSubmit like typed prompts but are not: a task
// notification, a scheduled-task run, a system notice, maybe wrapped in <system-reminder>.
const HARNESS_EVENT = re(`^[${SPACE}]*(?:<system-reminder>[${SPACE}]*)?(?:<task-notification|<scheduled-task|\\[SYSTEM NOTIFICATION)`)
// A short opening acknowledgement or back-reference continues the work in flight.
const FOLLOWUP = re(`^[${SPACE}]*(yes|ok|okay|continue|also|now|then|that|this|it|again|go|do it|proceed|fix that|same|${ru(['да', 'ок', 'окей', 'ладно', 'продолжай*', 'продолжи', 'также', 'ещё', 'еще', 'теперь', 'потом', 'тогда', 'это', 'снова', 'давай*', 'делай*', 'дальше', 'то же', 'так же'])})${B}`, 'iu')
const ULTRACODE = re(`${B}ultracode${B}`, 'iu')

const SPACE_RUN = re(`[${SPACE}]+`, 'u')
const SPACE_EDGES = re(`^[${SPACE}]+|[${SPACE}]+$`, 'gu')

// Python str.split() / strip() / len() semantics.
export const words = text => text.split(SPACE_RUN).filter(Boolean).length
export const pyStrip = text => text.replace(SPACE_EDGES, '')
export const pyRstrip = text => text.replace(re(`[${SPACE}]+$`), '')
const chars = text => [...text].length
const matchCount = (pattern, text) => (text.match(pattern) || []).length
// Python truthiness, for values that came out of JSON.
export const truthy = v => !(v == null || v === false || v === 0 || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length))
export const pyOr = (...vals) => vals.find(truthy) ?? vals[vals.length - 1]

// Python's json.dumps defaults (", " and ": " separators, ASCII only), so audit lines and
// response_chars come out as the original wrote them. undefined values are skipped like in JSON.
export function pyDumps(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'string') {
    let out = '"'
    for (let i = 0; i < v.length; i++) {
      const c = v.charCodeAt(i)
      const ch = v[i]
      if (ch === '"') out += '\\"'
      else if (ch === '\\') out += '\\\\'
      else if (ch === '\n') out += '\\n'
      else if (ch === '\r') out += '\\r'
      else if (ch === '\t') out += '\\t'
      else if (ch === '\b') out += '\\b'
      else if (ch === '\f') out += '\\f'
      else if (c < 0x20 || c > 0x7e) out += c === 0x7f ? ch : '\\u' + c.toString(16).padStart(4, '0')
      else out += ch
    }
    return out + '"'
  }
  if (Array.isArray(v)) return '[' + v.map(pyDumps).join(', ') + ']'
  if (typeof v === 'object') {
    return '{' + Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => `${pyDumps(String(k))}: ${pyDumps(x)}`).join(', ') + '}'
  }
  return String(v)
}

export const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)
const tierEffort = model => (typeof model === 'string' && hasOwn(MODEL_TIERS, model) ? MODEL_TIERS[model].effort : 'medium')
// Python's round(x, 2): half to even on an exact tie, otherwise the nearest.
const round2 = x => {
  if ((x * 8) % 2 === 1) {
    const lo = Math.floor(x * 100)
    return (lo % 2 === 0 ? lo : lo + 1) / 100
  }
  return Number(x.toFixed(2))
}

// Tier (haiku/sonnet/opus/fable) of a model id or alias; undefined if unknown. Mythos ids are the Fable tier.
export function modelTier(model) {
  const name = String(model ?? '').toLowerCase().replaceAll('mythos', 'fable')
  return Object.keys(TIER_RANK).find(tier => name.includes(tier))
}

export const isHarnessEvent = prompt => HARNESS_EVENT.test(prompt)
export const isFollowup = prompt => words(prompt) <= FOLLOWUP_MAX_WORDS && FOLLOWUP.test(prompt)
export const hasOverride = prompt => OVERRIDE_PATTERN.test(prompt)

// A prompt that decomposes into independent subtasks: [is_fanout, subtask count hint (0 = unknown)].
export function detectFanout(prompt) {
  const numbered = matchCount(NUMBERED_ITEM, prompt)
  if (numbered >= 2) return [true, numbered]
  const bullets = matchCount(BULLET_ITEM, prompt)
  if (bullets >= 3) return [true, bullets]
  if (FOR_EACH.test(prompt)) return [true, 0]
  const conjunction = prompt.toLowerCase().includes(' and ') || prompt.includes(';')
  const verbs = new Set([...prompt.matchAll(IMPERATIVE_VERB)].map(m => m[1].toLowerCase()))
  if (conjunction && verbs.size >= 3) return [true, verbs.size]
  return [false, 0]
}

export function classifyHeuristic(prompt) {
  const lower = prompt.toLowerCase()
  const wordCount = words(prompt)
  const length = chars(prompt)
  const lines = prompt.split('\n').length
  const hasCode = prompt.includes('```')
  const hasPath = matchCount(FILE_PATH, prompt) > 0
  const nontrivial = wordCount > 12 || hasCode || lines > 3

  if (DEEP_VERBS.test(lower)) {
    // Long, file-anchored design and audit requests are the highest-signal Opus work.
    return { tier: 'deep', model: 'opus', effort: 'high', confidence: wordCount > 25 && hasPath ? 0.95 : 0.85, source: 'heuristic', reasoning: 'explicit design/plan/investigate intent' }
  }
  if (COMPLEX_VERBS.test(lower)) {
    if (hasCode || nontrivial || BREADTH_SIGNAL.test(lower)) {
      return { tier: 'complex', model: 'opus', effort: 'high', confidence: hasCode ? 0.92 : 0.85, source: 'heuristic', reasoning: 'complex task verb (refactor/implement/migrate/etc.)' }
    }
    return { tier: 'complex', model: 'sonnet', effort: 'medium', confidence: 0.82, source: 'heuristic', reasoning: 'light single-surface complex verb; Sonnet 5.5 (escalates if deep)' }
  }
  // Short lookups stay inline: a cold worker cannot answer a continuity question.
  if (wordCount <= 20 && length <= 140 && !hasCode && lines <= 2 && LOOKUP_VERBS.test(lower)) return null
  if (wordCount >= 5 && wordCount <= 60 && !hasCode && lines <= 5) {
    return { tier: 'standard', model: 'sonnet', effort: 'medium', confidence: 0.75, source: 'heuristic', reasoning: 'moderate scope, no complex signals' }
  }
  return null
}

// Effort from work-shape signals, independent of the tier: [level, confidence, reason].
export function scoreEffort(prompt) {
  const lower = prompt.toLowerCase()
  const wordCount = words(prompt)
  const lines = prompt.split('\n').length
  const paths = matchCount(FILE_PATH, prompt)

  let score = 0
  if (prompt.includes('```')) score += 2
  if (paths >= 3) score += 2
  else if (paths >= 1) score += 1
  if (EFFORT_HEAVY_VERBS.test(lower)) score += 2
  if (wordCount > 80) score += 1
  if (lines > 6) score += 1
  if (TEST_VERIFY.test(lower)) score += 1
  if (wordCount < 10 && pyRstrip(prompt).endsWith('?')) score -= 1

  if (score <= 0) return ['low', 0.95, `effort_score=${score} (clearly light)`]
  if (score === 1) return ['low', 0.85, `effort_score=${score} (light)`]
  if (score === 2) return ['medium', 0.8, `effort_score=${score} (near low/medium boundary)`]
  if (score === 3) return ['medium', 0.9, `effort_score=${score} (clearly medium)`]
  if (score === 4) return ['high', 0.85, `effort_score=${score} (heavy)`]
  if (score === 5) return ['high', 0.8, `effort_score=${score} (near high/xhigh boundary)`]
  return ['xhigh', 0.95, `effort_score=${score} (very heavy)`]
}

// router.json rules: first match wins, checked against the lowercase prompt before the heuristics.
// shortcut: a rule's regex is JavaScript syntax now (the original used Python's), a pattern that does not compile never matches.
export function applyProjectRules(prompt, cfg) {
  const lower = prompt.toLowerCase()
  for (const rule of Array.isArray(cfg.rules) ? cfg.rules : []) {
    if (!isObject(rule) || !truthy(rule.match) || typeof rule.match !== 'string') continue
    let matched = false
    if (truthy(rule.regex)) {
      try {
        matched = re(rule.match, 'iu').test(lower)
      } catch {
        try {
          matched = re(rule.match, 'i').test(lower)
        } catch {}
      }
    } else {
      matched = lower.includes(rule.match.toLowerCase())
    }
    if (!matched) continue
    const model = 'model' in rule ? rule.model : 'sonnet'
    const confidence = Number('confidence' in rule ? rule.confidence : 0.95)
    return {
      tier: 'project_rule',
      model,
      effort: 'effort' in rule ? rule.effort : tierEffort(model),
      confidence: Number.isNaN(confidence) ? 0.95 : confidence,
      source: 'project_config',
      reasoning: 'reason' in rule ? rule.reason : `project rule matched: ${rule.match}`,
    }
  }
  return null
}

// Project .claude/router.json over the global one: scalars from the project, rules project-first.
export function mergeConfig(project, global, source) {
  const merged = { ...global }
  for (const [key, value] of Object.entries(project)) if (key !== 'rules') merged[key] = value
  merged.rules = [...(Array.isArray(project.rules) ? project.rules : []), ...(Array.isArray(global.rules) ? global.rules : [])]
  if (source) merged._source = source
  return merged
}

export const bandFor = (confidence, floor = 0.6) => (confidence >= floor ? 'auto' : 'none')

// The routing is skipped before any state is read: [done, audit row to write or null].
// Order as in the original: harness event, #noshift, ultracode/goal, too short.
export function gate(prompt, deps) {
  if (!prompt) return [true, null]
  if (isHarnessEvent(prompt)) return [true, null]
  const lower = prompt.toLowerCase()
  if (lower.includes('#noshift') || lower.includes('#noroute')) return [true, null]
  if (ULTRACODE.test(lower) || lower.startsWith('/goal') || lower.includes('/goal-driven')) {
    return [true, { ts: deps.now(), prompt_sha: deps.sha(prompt), decision: { band: 'none', tier: 'optout', model: null, reason: 'ultracode/goal-driven turn — must stay on parent' }, outcome: 'silent' }]
  }
  if (words(prompt) < 3 && !prompt.endsWith('?')) return [true, null]
  return [false, null]
}

// Everything after the gate. Returns the audit row and the text to inject (null = say nothing).
// input: prompt (stripped), sessionId, turns, parent, ctxTokens, planMode, config, ctxWarnTokens, routeFloor.
// deps: now(), sha(text), id(), budgetGate(turns).
export function decide(input, deps) {
  const { prompt, sessionId = null, turns = 0, parent, ctxTokens = 0, planMode = false, config = {} } = input
  const ctxWarn = input.ctxWarnTokens ?? 600000
  const ctxK = Math.floor(ctxTokens / 1000)
  const row = (decision, outcome, hint) => {
    const r = { ts: deps.now(), prompt_sha: deps.sha(prompt), session_id: sessionId, turns, decision, outcome }
    if (hint) r.outcome_hint = hint
    return r
  }

  // A short follow-up stays inline: the parent holds the context. An explicit #model= tag is never swallowed.
  if (isFollowup(prompt) && !OVERRIDE_PATTERN.test(prompt)) {
    return { row: row({ band: 'none', tier: 'followup', model: null, parent, ctx: ctxK, plan_mode: planMode, reason: 'short follow-up on work in flight — stays inline' }, 'silent', 'followup_inline'), context: null }
  }

  let result
  const override = OVERRIDE_PATTERN.exec(prompt)
  if (override) {
    const forced = override[1].toLowerCase()
    result = { tier: 'override', model: forced, effort: MODEL_TIERS[forced].effort, confidence: 1.0, source: 'override', reasoning: `user override #model=${forced}` }
  } else {
    // project_rule, then heuristic, then project_default (only when the heuristic found nothing), then cheap and silent.
    result = applyProjectRules(prompt, config) ?? classifyHeuristic(prompt)
    if (!result) {
      if (truthy(config.default_model)) {
        const pinned = config.default_model
        result = { tier: 'project_default', model: pinned, effort: tierEffort(pinned), confidence: 0.85, source: 'project_config', reasoning: `project default ${pinned} (no heuristic match)` }
      } else {
        result = { tier: 'default', model: 'haiku', effort: 'low', confidence: 0.55, source: 'default', reasoning: 'no heuristic match; below route floor, stay inline' }
      }
    }
  }

  // The scored effort replaces the tier's; a gap of two levels or more caps the confidence.
  if (result.tier !== 'override' && result.tier !== 'project_rule') {
    const tierLevel = result.effort
    const [scored, , why] = scoreEffort(prompt)
    result.effort = scored
    const gap = EFFORT_LEVELS.includes(tierLevel) ? Math.abs(EFFORT_LEVELS.indexOf(scored) - EFFORT_LEVELS.indexOf(tierLevel)) : 0
    if (gap >= 2) {
      result.confidence = Math.min(Number(result.confidence ?? 0.5), 0.85)
      result.reasoning = `${result.reasoning ?? ''}; effort ${tierLevel}->${scored}: ${why}`
    }
  }

  // Fable costs twice Opus: manual dispatch only, a classifier pick is clamped to Opus.
  if (result.model === 'fable' && result.source !== 'override' && result.source !== 'project_config') result.model = 'opus'

  const model = result.model
  const [fanout, fanoutHint] = detectFanout(prompt)
  let band = bandFor(Number(result.confidence ?? 0), input.routeFloor ?? 0.6)
  // default_model alone is no per-prompt signal: recorded, never injected.
  const pinnedDefault = result.tier === 'project_default'
  if (pinnedDefault) band = 'none'
  const decisionId = 'r_' + deps.id()

  const decision = {
    band,
    model,
    effort: result.effort,
    tier: result.tier,
    confidence: round2(Number(result.confidence ?? 0)),
    reason: result.reasoning ?? '',
    source: result.source ?? '',
    parent,
    ctx: ctxK,
    plan_mode: planMode,
    fanout,
    decision_id: decisionId,
    project_config: config._source ?? null,
  }
  if (fanout) decision.fanout_hint = fanoutHint

  // Plan mode owns the turn: the planner tags each step with its own model.
  if (planMode) {
    return { row: row(decision, 'plan_mode'), context: `[auto-router] plan mode: use the plan-with-models skill; no delegation.` }
  }
  if (band === 'none') return { row: row(decision, 'silent', pinnedDefault ? 'project_default_inline' : undefined), context: null }

  // Downhill only. The one exception is an inline #model= tag: the session cannot change its own model.
  const routedRank = hasOwn(TIER_RANK, model) ? TIER_RANK[model] : 99
  const parentRank = hasOwn(TIER_RANK, parent) ? TIER_RANK[parent] : 99
  const explicit = result.source === 'override'
  if (routedRank === parentRank || (routedRank > parentRank && !explicit)) {
    return { row: row(decision, 'silent', 'same_or_higher_inline'), context: null }
  }

  const budgetLine = ctxTokens >= ctxWarn && deps.budgetGate(turns)
    ? `\ncontext ${ctxK}k > ${Math.floor(ctxWarn / 1000)}k: delegate routable work; consider /wrap-session + a fresh session.`
    : ''
  const fanoutClause = fanout ? ' fanout: dispatch independent subtasks in one message.' : ''
  const block = JSON.stringify({ decision_id: decisionId, model, effort: result.effort, band, parent, ctx: ctxK })
  return {
    row: row(decision, 'injected'),
    context: `AUTO-ROUTE: Agent(subagent_type="${NAMESPACE}:router-${model}") per auto-model-routing skill.${fanoutClause}${budgetLine}\n<router-decision>${block}</router-decision>`,
  }
}

// ---- the parent session, read off its transcript ----

// The last real assistant message in a tail of transcript lines.
export function scanTranscript(text) {
  let last = null
  for (let line of text.split(/\r\n|\n|\r/)) {
    line = pyStrip(line)
    if (!line.startsWith('{')) continue
    let rec
    try {
      rec = JSON.parse(line)
    } catch {
      continue
    }
    if (!isObject(rec) || !isObject(rec.message)) continue
    if (pyOr(rec.type, rec.message.role) === 'assistant' && truthy(rec.message.model) && rec.message.model !== SYNTHETIC_MODEL) last = rec.message
  }
  return last
}

// [parent model family, context tokens] from that assistant message; the fallback when there is none.
export function sessionState(last, fallback = DEFAULT_PARENT_MODEL) {
  if (!last) return [fallback, 0]
  const parent = modelTier(last.model) ?? fallback
  let ctx = 0
  if (isObject(last.usage)) {
    for (const key of ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) {
      if (typeof last.usage[key] === 'number') ctx += Math.trunc(last.usage[key])
    }
  }
  return [parent, ctx]
}
