#!/usr/bin/env node
// model router — command hook entry
//
// Ported from the Python hooks of auto-model-router 0.9.2 (MIT, iuriiturok, see LICENSE-ROUTER).
// One script, the event name as the first argument:
//   prompt      UserPromptSubmit and SessionStart: classify the prompt, maybe inject an AUTO-ROUTE order
//   pre-agent   PreToolUse on Agent: write the start time of the dispatch
//   post-agent  PostToolUse on Agent: audit the dispatch (router worker or native subagent)
//   subagent    SubagentStop: audit a finished router worker's usage
//   reconcile   Stop: close the decisions that never got an outcome row
// Every path ends in exit 0: a router problem must never block a prompt or a tool call.

const fs = require('fs');
const path = require('path');
const io = require('./router-io');

const EVENTS = { prompt, 'pre-agent': preAgent, 'post-agent': postAgent, subagent, reconcile };

function loadCore() {
  return Promise.all([import('./router-core.mjs'), import('./router-audit.mjs')]).then(([core, audit]) => ({ core, audit }));
}

const emit = (core, context) => io.writeOut(core.pyDumps({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context } }) + '\n');

// The folder holding a subagent's transcript, next to the parent's.
const subagentTranscript = (parent, sessionId, agentId) => path.join(path.dirname(parent), String(sessionId), 'subagents', `agent-${agentId}.jsonl`);

function markFile(toolUseId) {
  return path.join(io.cacheDir(), 'agent-marks', String(toolUseId).replace(/[^\w.-]/g, '_') + '.ts');
}

// The session's own state off its transcript: [model family, context tokens]. The fallback on any problem.
function readParent(core, transcriptPath, fallback) {
  try {
    if (!transcriptPath) return [fallback, 0];
    const file = io.expandUser(transcriptPath);
    let last = core.scanTranscript(io.readTail(file, io.TRANSCRIPT_TAIL_BYTES, true));
    if (!last && fs.statSync(file).size > io.TRANSCRIPT_TAIL_BYTES) last = core.scanTranscript(io.readTail(file, io.TRANSCRIPT_WIDE_BYTES, true));
    return core.sessionState(last, fallback);
  } catch (e) {
    return [fallback, 0];
  }
}

async function prompt(payload) {
  const { core } = await loadCore();
  if (payload.hook_event_name === 'SessionStart') {
    // The first prompt of a session has no assistant record to read the model from, so remember the one it starts on.
    const tier = core.modelTier(payload.model);
    if (tier && payload.session_id) {
      io.sessionWrite(String(payload.session_id), Object.assign(io.sessionRead(String(payload.session_id)), { model: tier, ts: Math.floor(Date.now() / 1000) }));
    }
    return;
  }
  const text = core.pyStrip(typeof payload.prompt === 'string' ? payload.prompt : '');
  const deps = { now: io.now, sha: io.sha, id: io.newId, budgetGate: turns => io.budgetGate(payload.session_id ? String(payload.session_id) : '', turns, core.BUDGET_THROTTLE_PROMPTS) };
  const [done, row] = core.gate(text, deps);
  if (row) io.appendAudit(row, core.pyDumps, true);
  if (done) return;

  const projectPath = io.findProjectConfig(payload.cwd);
  const globalPath = io.globalConfigPath();
  const source = projectPath || (fs.existsSync(globalPath) ? globalPath : undefined);
  const config = core.mergeConfig(projectPath ? io.readJson(projectPath) : {}, io.readJson(globalPath), source);
  if (config.disabled === true) return;

  const sessionId = payload.session_id ?? null;
  const startedOn = sessionId ? io.sessionRead(String(sessionId)).model : null;
  const [parent, ctxTokens] = readParent(core, payload.transcript_path, Object.hasOwn(core.TIER_RANK, startedOn) ? startedOn : core.DEFAULT_PARENT_MODEL);
  const turns = sessionId ? io.sessionBump(String(sessionId)) : 0;
  const input = {
    prompt: text,
    sessionId,
    turns,
    parent,
    ctxTokens,
    planMode: payload.permission_mode === 'plan',
    config,
    ctxWarnTokens: parseInt(process.env.CC_ROUTER_CTX_WARN, 10) || undefined,
    routeFloor: Number.isNaN(parseFloat(process.env.CC_ROUTER_ROUTE_FLOOR)) ? undefined : parseFloat(process.env.CC_ROUTER_ROUTE_FLOOR),
  };
  const { row: decided, context } = core.decide(input, deps);
  io.appendAudit(decided, core.pyDumps, true);
  if (context) emit(core, context);
}

async function preAgent(payload) {
  const { core } = await loadCore();
  const tool = core.pyOr(payload.tool_name, payload.toolName, payload.tool, '');
  const rawInput = core.pyOr(payload.toolInput, payload.tool_input, {});
  const toolUseId = core.pyOr(payload.toolUseId, payload.tool_use_id);
  if (tool !== 'Agent' || !core.isObject(rawInput) || !core.pyStrip(String(rawInput.subagent_type ?? '')) || !toolUseId) return;
  try {
    fs.mkdirSync(path.join(io.cacheDir(), 'agent-marks'), { recursive: true });
    fs.writeFileSync(markFile(toolUseId), String(Date.now() / 1000));
  } catch (e) {}
}

async function postAgent(payload) {
  const { core, audit } = await loadCore();
  const row = audit.buildAgentRow(payload, {
    now: io.now,
    decisionId: sessionId => {
      try {
        return audit.lastInjectedId(io.readTail(io.auditLog(), 262144, false), sessionId);
      } catch (e) {
        return null;
      }
    },
    modelActual: (transcriptPath, sessionId, agentId) => {
      if (!transcriptPath || !sessionId || !agentId) return null;
      try {
        return audit.lastModel(io.readTail(subagentTranscript(transcriptPath, sessionId, agentId), 2000000, false));
      } catch (e) {
        return null;
      }
    },
    wallMs: toolUseId => {
      if (!toolUseId) return null;
      try {
        const started = parseFloat(fs.readFileSync(markFile(toolUseId), 'utf8').trim());
        if (Number.isNaN(started)) return null;
        try {
          fs.unlinkSync(markFile(toolUseId));
        } catch (e) {}
        return Math.trunc((Date.now() / 1000 - started) * 1000);
      } catch (e) {
        return null;
      }
    },
  });
  if (row) io.appendAudit(row, core.pyDumps, false);
}

async function subagent(payload) {
  const { core, audit } = await loadCore();
  const agentType = core.pyStrip(String(core.pyOr(payload.agent_type, payload.subagent_type, '')));
  if (audit.classifySubagent(agentType)[0] !== 'router') return;
  const { agent_id: agentId, session_id: sessionId } = payload;
  let file = payload.agent_transcript_path ? io.expandUser(payload.agent_transcript_path) : null;
  if (!file && payload.transcript_path && sessionId && agentId) file = subagentTranscript(io.expandUser(payload.transcript_path), sessionId, agentId);
  if (!file) return;
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return;
  }
  const summed = audit.sumWorkerUsage(text);
  if (!summed) return;
  let tail = '';
  try {
    tail = io.readTail(io.auditLog(), 2 * 1024 * 1024, false);
  } catch (e) {}
  const [decisionId, already] = audit.scanAuditTail(tail, sessionId, agentId);
  if (already) return;
  io.appendAudit(audit.buildStopRow(payload, summed, decisionId, io.now()), core.pyDumps, false);
}

async function reconcile(payload) {
  const { core, audit } = await loadCore();
  const sessionId = payload.session_id;
  if (!sessionId || !fs.existsSync(io.auditLog())) return;
  const unresolved = audit.unresolvedDecisions(io.readText(io.auditLog()), sessionId);
  if (!unresolved.length) return;
  let usage = null;
  const transcript = core.pyOr(payload.transcript_path, payload.transcriptPath);
  if (transcript) {
    try {
      usage = audit.sumInlineUsage(io.readTail(transcript, 2000000, false));
    } catch (e) {}
  }
  io.appendAudit(audit.reconcileRows(unresolved, sessionId, usage, io.now()), core.pyDumps, false);
}

// `node -e "require(...)" prompt` puts the name at argv[1], `node router-hook.js prompt` at argv[2].
const handler = EVENTS[process.argv.slice(1).find(arg => Object.hasOwn(EVENTS, arg))];
if (handler && !io.disabled()) {
  io.readPayload(payload => {
    const run = payload && typeof payload === 'object' && !Array.isArray(payload) ? handler(payload) : Promise.resolve();
    run.catch(() => {}).finally(() => process.exit(0));
  });
} else {
  process.exit(0);
}
