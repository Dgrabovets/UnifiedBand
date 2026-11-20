#!/usr/bin/env node
// model router — what the /route and /route-status skills run
//
// Ported from commands/route.md and commands/route-status.md of auto-model-router 0.9.2
// (MIT, iuriiturok, see LICENSE-ROUTER). Nothing here writes to the audit log.
//   router-cli.js classify [--parent haiku|sonnet|opus|fable] [--plan] <prompt>
//   router-cli.js last [count]
//   router-cli.js status

const fs = require('fs');
const path = require('path');
const io = require('./router-io');

const rows = () => {
  const log = io.auditLog();
  const rotated = fs.existsSync(path.dirname(log)) ? fs.readdirSync(path.dirname(log)).filter(n => /^audit\.jsonl\.\d{8}T\d{6}Z$/.test(n)).sort().map(n => path.join(path.dirname(log), n)) : [];
  return [...rotated, log].flatMap(file => io.readText(file).split('\n').flatMap(line => {
    try {
      return [JSON.parse(line)];
    } catch (e) {
      return [];
    }
  }));
};

async function classify(args) {
  const core = await import('./router-core.mjs');
  const parentAt = args.indexOf('--parent');
  const parent = parentAt >= 0 ? args.splice(parentAt, 2)[1] : core.DEFAULT_PARENT_MODEL;
  const planAt = args.indexOf('--plan');
  const planMode = planAt >= 0 && args.splice(planAt, 1).length === 1;
  const prompt = core.pyStrip(args.join(' '));
  const deps = { now: io.now, sha: io.sha, id: io.newId, budgetGate: () => false };
  if (!Object.hasOwn(core.TIER_RANK, parent)) return console.log(`Unknown parent model "${parent}": use haiku, sonnet, opus or fable.`);
  if (core.gate(prompt, deps)[0]) return console.log('Skipped: the router ignores this prompt (empty, too short, #noshift, a goal turn or a harness event).');

  const projectPath = io.findProjectConfig(process.cwd());
  const globalPath = io.globalConfigPath();
  const config = core.mergeConfig(projectPath ? io.readJson(projectPath) : {}, io.readJson(globalPath), projectPath || (fs.existsSync(globalPath) ? globalPath : undefined));
  if (config.disabled === true) return console.log('Skipped: routing is disabled by router.json.');
  const { row, context } = core.decide({ prompt, parent, planMode, config }, deps);
  const d = row.decision;
  console.log(`tier=${d.tier} model=${d.model} effort=${d.effort} confidence=${d.confidence} band=${d.band} source=${d.source}`);
  console.log(`reason: ${d.reason}`);
  console.log(`session model assumed: ${parent}${d.fanout ? `; fan-out (${d.fanout_hint || 'unknown'} subtasks)` : ''}`);
  console.log(context ? `action: ${row.outcome === 'plan_mode' ? 'plan mode, no delegation' : `auto-delegate to ${core.NAMESPACE}:router-${d.model}`}` : `action: silent (${row.outcome_hint || row.outcome})`);
}

function last(args) {
  const count = parseInt(args[0], 10) || 5;
  const all = rows();
  if (!all.length) return console.log('No audit log yet.');
  for (const row of all.slice(-count)) console.log(JSON.stringify(row, null, 2));
}

function status() {
  const all = rows().filter(r => r.decision);
  if (!all.length) return console.log('No auto-router activity yet. Send a prompt to see decisions.');
  console.log('Last 20 decisions (newest first):');
  for (const r of all.slice(-20).reverse()) {
    const d = r.decision;
    console.log(`${r.ts}  ${d.band}  ${d.model}/${d.effort}  conf=${Number(d.confidence || 0).toFixed(2)}  ${String(d.reason || '').slice(0, 60)}`);
  }
  const cutoff = Date.now() - 7 * 86400000;
  const recent = all.filter(r => Date.parse(r.ts) >= cutoff);
  console.log(`\nDecisions in last 7d: ${recent.length}`);
  for (const [title, key] of [['By model', 'model'], ['By band', 'band']]) {
    const counts = {};
    for (const r of recent) counts[r.decision[key] ?? 'none'] = (counts[r.decision[key] ?? 'none'] || 0) + 1;
    console.log(`${title}:`);
    for (const [name, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${name.padEnd(8)} ${((n / recent.length) * 100).toFixed(1).padStart(5)}%  (${n})`);
  }
}

const [command, ...args] = process.argv.slice(2);
const run = { classify, last, status }[command];
if (!run) {
  console.log('Usage: router-cli.js classify [--parent haiku|sonnet|opus|fable] [--plan] <prompt> | last [count] | status');
  process.exit(1);
}
Promise.resolve(run(args)).catch(e => {
  console.error(`router-cli: ${e.message}`);
  process.exit(1);
});
