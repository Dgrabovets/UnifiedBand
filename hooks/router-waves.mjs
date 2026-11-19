// Model router — wave and non-interference batching.
//
// Ported from waves.py of auto-model-router 0.9.2 (MIT, iuriiturok, see LICENSE-ROUTER).
// A plan is a list of steps with dependencies and the files each one writes. This turns it into
// waves (dependency levels), each split into batches that can run at the same time:
//   - a read-only step conflicts with nothing;
//   - two writers conflict only when their file sets overlap;
//   - a step that depends on another lands in a later wave.
// A step is { id, depends_on?: id[], files?: string[] | "a, b" | "none", read_only?: boolean }.

// A `Files:` field as a list of paths. "none" and empty values give [].
export function parseFiles(value) {
  if (value == null) return []
  const items = Array.isArray(value) ? value : String(value).split(',')
  return items.map(v => String(v).trim()).filter(p => p && p.toLowerCase() !== 'none')
}

export const isReadOnly = step => ('read_only' in step ? Boolean(step.read_only) : parseFiles(step.files).length === 0)

const conflicts = (a, b) => {
  if (isReadOnly(a) || isReadOnly(b)) return false
  const files = new Set(parseFiles(a.files))
  return parseFiles(b.files).some(f => files.has(f))
}

// Steps into dependency waves, input order kept inside each wave. Throws on a cycle, an unknown or duplicate id.
export function computeWaves(steps) {
  const byId = new Map()
  for (const s of steps) {
    if (!('id' in s)) throw new Error("every step needs an 'id'")
    if (byId.has(s.id)) throw new Error(`duplicate step id: ${JSON.stringify(s.id)}`)
    byId.set(s.id, s)
  }
  const level = new Map()
  const resolve = (id, trail) => {
    if (level.has(id)) return level.get(id)
    if (trail.includes(id)) throw new Error(`dependency cycle: ${[...trail, id].join(' -> ')}`)
    const step = byId.get(id)
    if (!step) throw new Error(`unknown depends_on id: ${JSON.stringify(id)}`)
    const deps = step.depends_on || []
    const lvl = deps.length ? 1 + Math.max(...deps.map(d => resolve(d, [...trail, id]))) : 0
    level.set(id, lvl)
    return lvl
  }
  for (const s of steps) resolve(s.id, [])
  const waves = Array.from({ length: Math.max(-1, ...level.values()) + 1 }, () => [])
  for (const s of steps) waves[level.get(s.id)].push(s)
  return waves
}

// Greedy first fit: each step joins the first batch whose members it does not conflict with.
export function partitionBatches(steps) {
  const batches = []
  for (const step of steps) {
    const batch = batches.find(b => b.every(other => !conflicts(step, other)))
    if (batch) batch.push(step)
    else batches.push([step])
  }
  return batches
}

// waves[batches[steps]]: a batch is what the parent dispatches as one message of concurrent Agent calls.
export const planExecution = steps => computeWaves(steps).map(partitionBatches)

// True when some wave has writers that must be serialized, the point where a worktree becomes the alternative.
export const needsWorktree = steps => computeWaves(steps).some(wave => partitionBatches(wave).length > 1)
