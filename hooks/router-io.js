#!/usr/bin/env node
// model router — everything that touches the disk or the clock
//
// Ported from the Python hooks of auto-model-router 0.9.2 (MIT, iuriiturok, see LICENSE-ROUTER).
// The logic lives in router-core.mjs and router-audit.mjs (no imports there, so tests load them);
// this file is the other half, shared by router-hook.js and router-cli.js.
//
// Where things live (all under the Claude config dir, ~/.claude by default):
//   cache/router/audit.jsonl        the audit log the Board reads (CC_ROUTER_CACHE_DIR moves the folder)
//   cache/router/sessions/<id>.json per-session turn counter and the model the session started on
//   cache/router/agent-marks/       start times of Agent calls
//   router.json                     global rules (CC_ROUTER_GLOBAL_CONFIG moves the file)

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getClaudeDir } = require('./ponytail-config');

// 3 MiB, not the original's 5: the band and the Board read this log with an engine call that refuses a file over 4 MiB.
const AUDIT_ROTATE_BYTES = intEnv('CC_ROUTER_AUDIT_MAX_BYTES', 3 * 1024 * 1024);
const AUDIT_RETAIN_DAYS = intEnv('CC_ROUTER_AUDIT_RETAIN_DAYS', 30);
const TRANSCRIPT_TAIL_BYTES = 64 * 1024;
// Second, wider read for when the tail holds no assistant record.
const TRANSCRIPT_WIDE_BYTES = 4 * 1024 * 1024;
const PROJECT_CONFIG = path.join('.claude', 'router.json');
// The plugin id the original ships under; any marketplace suffix counts.
const ORIGINAL_PLUGIN = 'auto-model-router@';

function intEnv(name, fallback) {
  const n = parseInt(process.env[name], 10);
  return Number.isNaN(n) ? fallback : n;
}

function expandUser(p) {
  return typeof p === 'string' && /^~(?=$|[\\/])/.test(p) ? os.homedir() + p.slice(1) : p;
}

const cacheDir = () => expandUser(process.env.CC_ROUTER_CACHE_DIR) || path.join(getClaudeDir(), 'cache', 'router');
const auditLog = () => path.join(cacheDir(), 'audit.jsonl');
const globalConfigPath = () => expandUser(process.env.CC_ROUTER_GLOBAL_CONFIG) || path.join(getClaudeDir(), 'router.json');

// Python's datetime.now(utc).isoformat(): microseconds and +00:00, which the Board and the original's readers parse.
const now = () => new Date().toISOString().replace(/Z$/, '000+00:00');
const sha = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12);
const newId = () => crypto.randomBytes(5).toString('hex');

// Both routers enabled would run every hook twice. When the original plugin is enabled, this one steps back and
// leaves everything to it. Claude Code lets the narrower settings win (local over project over user), so the
// first of those files that names the original decides: it can be switched off for one project.
// shortcut: only the project root (CLAUDE_PROJECT_DIR or the hook's cwd) is checked, not parent folders or managed settings.
function originalEnabled() {
  const project = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const files = [
    path.join(project, '.claude', 'settings.local.json'),
    path.join(project, '.claude', 'settings.json'),
    path.join(getClaudeDir(), 'settings.json'),
  ];
  for (const file of files) {
    let named = [];
    try {
      const plugins = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')).enabledPlugins;
      named = Object.entries(plugins || {}).filter(([id]) => id.startsWith(ORIGINAL_PLUGIN));
    } catch (e) {}
    if (named.length) return named.some(([, on]) => on === true);
  }
  return false;
}

function disabled() {
  return process.env.CC_ROUTER_DISABLE === '1' || originalEnabled();
}

// The last `bytes` of a file as text; with trim, the partial first line is dropped.
function readTail(file, bytes, trim) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    const text = buf.toString('utf8');
    if (!trim || start === 0) return text;
    const nl = text.indexOf('\n');
    return nl < 0 ? '' : text.slice(nl + 1);
  } finally {
    fs.closeSync(fd);
  }
}

const readText = file => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    return '';
  }
};

function readJson(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (e) {
    return {};
  }
}

// ---- audit log ----

function rotateAuditIfNeeded() {
  try {
    const log = auditLog();
    if (fs.existsSync(log) && fs.statSync(log).size >= AUDIT_ROTATE_BYTES) {
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
      fs.renameSync(log, `${log}.${stamp}`);
    }
    const cutoff = Date.now() - AUDIT_RETAIN_DAYS * 86400000;
    for (const name of fs.readdirSync(cacheDir())) {
      if (!name.startsWith('audit.jsonl.')) continue;
      const file = path.join(cacheDir(), name);
      try {
        if (fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file);
      } catch (e) {}
    }
  } catch (e) {}
}

// One JSON line per row, written the way Python's json.dumps writes them. Silent on failure.
function appendAudit(rows, pyDumps, rotate) {
  try {
    fs.mkdirSync(cacheDir(), { recursive: true });
    if (rotate) rotateAuditIfNeeded();
    fs.appendFileSync(auditLog(), [].concat(rows).map(r => pyDumps(r) + '\n').join(''));
  } catch (e) {}
}

// ---- per-session state ----

const sessionsDir = () => path.join(cacheDir(), 'sessions');
// The id names a file, so keep it to plain characters.
const sessionFile = id => path.join(sessionsDir(), String(id).replace(/[^\w.-]/g, '_') + '.json');
const sessionRead = id => readJson(sessionFile(id));

function sessionWrite(id, state) {
  try {
    fs.mkdirSync(sessionsDir(), { recursive: true });
    fs.writeFileSync(sessionFile(id), JSON.stringify(state));
  } catch (e) {}
}

// Count one more turn of the session, pruning session files older than 24 hours. 0 when the disk fails.
function sessionBump(id) {
  try {
    fs.mkdirSync(sessionsDir(), { recursive: true });
    const cutoff = Date.now() - 24 * 3600 * 1000;
    for (const name of fs.readdirSync(sessionsDir())) {
      if (!name.endsWith('.json')) continue;
      try {
        const file = path.join(sessionsDir(), name);
        if (fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file);
      } catch (e) {}
    }
    const state = sessionRead(id);
    const turns = (Number.isFinite(Number(state.turns)) ? Math.trunc(Number(state.turns)) : 0) + 1;
    sessionWrite(id, Object.assign(state, { turns, ts: Math.floor(Date.now() / 1000) }));
    return turns;
  } catch (e) {
    return 0;
  }
}

// The context-budget warning fires at most once every `every` prompts per session.
function budgetGate(id, turns, every) {
  if (!id) return true;
  const state = sessionRead(id);
  if (Number.isInteger(state.budget_turn) && turns - state.budget_turn < every) return false;
  state.budget_turn = turns;
  sessionWrite(id, state);
  return true;
}

// ---- router.json ----

// Walk up from `start` for .claude/router.json, stopping before the home folder (that one is the global config).
function findProjectConfig(start) {
  let cur = path.resolve(start || process.cwd());
  const home = os.homedir();
  const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
  while (!same(cur, home)) {
    const candidate = path.join(cur, PROJECT_CONFIG);
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch (e) {}
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

// Reads stdin as JSON and calls done(payload); payload is null when there is none or it is broken.
// The fallback timer keeps a stuck stdin from holding the session (see ponytail-subagent.js).
function readPayload(done) {
  let input = '';
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    let payload = null;
    try {
      payload = JSON.parse(input.replace(/^﻿/, ''));
    } catch (e) {}
    done(payload);
  };
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', finish);
  process.stdin.on('error', finish);
  setTimeout(finish, 2000);
}

// Synchronous: the hook exits right after, and a pending pipe write would die with it (see ponytail-runtime.js).
const writeOut = text => fs.writeSync(1, text);

module.exports = {
  TRANSCRIPT_TAIL_BYTES,
  TRANSCRIPT_WIDE_BYTES,
  auditLog,
  budgetGate,
  cacheDir,
  disabled,
  expandUser,
  findProjectConfig,
  globalConfigPath,
  newId,
  now,
  originalEnabled,
  appendAudit,
  readJson,
  readPayload,
  readTail,
  readText,
  sessionBump,
  sessionRead,
  sessionWrite,
  sha,
  writeOut,
};
