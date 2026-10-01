import { SEQUENCE, STATES, STATE_BY_ID, type StateId } from './states'

/**
 * A cycle is an edit: a sequence of blocks, each one a state held for a chosen
 * duration. This is the "editor" part of the folder, and it keeps its rules: pure
 * data, no clock, no React import. The same cycle must be readable by the tests, by
 * the player and by the timeline.
 *
 * A block has no identifier: it is a position in a list, and the render key is
 * the index. That keeps the localStorage JSON readable and the tests
 * deterministic.
 */
export interface Block {
  state: StateId
  duration: number
}

export interface Cycle {
  id: string
  name: string
  blocks: Block[]
}

/**
 * Floor shared by all blocks. The engine keeps only one history slot
 * (`BotEngine.setState` overwrites `prev`), so a block shorter than the next block's
 * entry crossfade jumps to the frame instead of blending.
 *
 * DERIVED from the catalog, not hand-written. The value used to be 0.6, which only
 * worked because 0.6 happened to be the longest `morph` in the catalog (the one of
 * `orbit`). Nothing guaranteed it: adding a state that morphs in 0.8 s would have made
 * the editor stutter without any test flinching. Now the floor follows.
 */
export const MIN_BLOCK = Math.max(...STATES.map((s) => s.morph))

/**
 * Editor guardrail, not a measurement: lengthening a block is safe (states
 * saturate their ramps and hold their final pose), but a track of one-minute
 * blocks is no longer readable.
 */
export const MAX_BLOCK = 10

/**
 * How many blocks and edits we accept, both when editing and when reading back.
 *
 * These are not product limits but bounds against hostile storage, which is editable
 * and holds a few megabytes while nothing downstream is sized for that: a single cycle
 * of 150,000 blocks, about 4 MB of JSON, gives a 1,500,000 s duration, as many ticks to
 * allocate and a track 29,700,000 px wide. The tab froze when entering the Animations
 * view.
 *
 * 200 blocks make half an hour of editing, far beyond any real use.
 */
export const MAX_BLOCK_COUNT = 200
export const MAX_CYCLES = 50

/** Step for the mouse wheel and resizing, in seconds. */
export const STEP = 0.1

const DEFAULT_CYCLE_ID = 'defaut'

/** Minimum duration of a block: the engine floor, or the state's measurement. */
export function minDurationOf(state: StateId): number {
  return Math.max(MIN_BLOCK, STATE_BY_ID.get(state)?.minDuration ?? MIN_BLOCK)
}

/** Brings a duration within its bounds and onto the step, without float residue. */
export function clampDuration(state: StateId, seconds: number): number {
  const snapped = Math.round(seconds / STEP) * STEP
  const bounded = Math.min(MAX_BLOCK, Math.max(minDurationOf(state), snapped))
  return Math.round(bounded * 100) / 100
}

export function makeBlock(state: StateId): Block {
  // the reference duration is the one measured for this state
  return { state, duration: clampDuration(state, STATE_BY_ID.get(state)?.duration ?? 2) }
}

/**
 * The default montage: the order of `SEQUENCE`, each state held for its
 * measured duration. It seeds the first launch, then it belongs to the user: it is
 * edited and stored like the others. The reference itself stays in the code:
 * clearing storage brings it back.
 */
export function defaultCycle(): Cycle {
  return {
    /**
     * Empty name = "never named by the user", so it is displayed in the current
     * language. Writing "Cycle par defaut" here would have frozen it: the name goes to
     * localStorage on the first visit and becomes user data again, which switching
     * language would no longer retranslate.
     */
    name: '',
    id: DEFAULT_CYCLE_ID,
    blocks: SEQUENCE.map(makeBlock)
  }
}

export function totalDuration(blocks: Block[]): number {
  return blocks.reduce((sum, b) => sum + b.duration, 0)
}

/** Start time of a block within the edit. */
export function offsetOf(blocks: Block[], index: number): number {
  let acc = 0
  for (let i = 0; i < index && i < blocks.length; i++) acc += blocks[i]!.duration
  return acc
}

/**
 * Block playing at time `t` and time elapsed within it. Past the last block we
 * fall back to the start: playback loops. The caller checks that the edit is not
 * empty.
 */
export function blockAt(blocks: Block[], t: number): { index: number; elapsed: number } {
  const total = totalDuration(blocks)
  if (!blocks.length || total <= 0) return { index: 0, elapsed: 0 }
  // the modulo is only applied when needed: on a time already inside the cycle it
  // would only add float residue to the elapsed time
  const wrapped = t >= 0 && t < total ? t : ((t % total) + total) % total
  let acc = 0
  for (let i = 0; i < blocks.length; i++) {
    const end = acc + blocks[i]!.duration
    if (wrapped < end) return { index: i, elapsed: wrapped - acc }
    acc = end
  }
  return { index: blocks.length - 1, elapsed: 0 }
}

/**
 * Appends an animation to the end of the edit (right-hand palette or "+" card).
 *
 * Capped at `MAX_BLOCK_COUNT`, like the read-back. Without it the editor let you build an
 * edit larger than what storage returns on reload, and the work silently
 * disappeared. A read-back bound that is not also an editing bound is a trap, not a
 * protection.
 */
export function blocksWith(blocks: Block[], state: StateId): Block[] {
  if (blocks.length >= MAX_BLOCK_COUNT) return blocks
  return [...blocks, makeBlock(state)]
}

/** Moves a block, returning a new list (state is replaced, never mutated). */
export function moveBlock(blocks: Block[], from: number, to: number): Block[] {
  const next = blocks.slice()
  const [moved] = next.splice(from, 1)
  if (!moved) return blocks
  next.splice(Math.min(Math.max(to, 0), next.length), 0, moved)
  return next
}

/** `Mon cycle`, `Mon cycle 2`, `Mon cycle 3`...: never the same name twice. */
export function uniqueName(base: string, cycles: Cycle[]): string {
  const taken = new Set(cycles.map((c) => c.name))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

/** Collision-free identifier, including against a hand-tampered localStorage. */
export function nextCycleId(cycles: Cycle[]): string {
  const taken = new Set(cycles.map((c) => c.id))
  let n = 1
  while (taken.has(`c${n}`)) n++
  return `c${n}`
}

/* ------------------------------------------------------- reading storage */

function parseBlock(raw: unknown): Block | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { state, duration } = raw as { state?: unknown; duration?: unknown }
  /*
   * Validated against SEQUENCE, not `STATE_BY_ID`: the latter contains `swirl`, which is
   * deliberately outside the catalog (it is the settings entry transition, and a test
   * locks it out of the palette and the sheet). A user edit is only built from the
   * palette, so a `swirl` can only get there through hand-tampered storage, and there is
   * no reason to tolerate it here when it is excluded everywhere else.
   */
  if (typeof state !== 'string' || !SEQUENCE.includes(state as StateId)) return null
  if (typeof duration !== 'number' || !Number.isFinite(duration)) return null
  return { state: state as StateId, duration: clampDuration(state as StateId, duration) }
}

function parseCycle(raw: unknown, seen: Cycle[]): Cycle | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { id, name, blocks } = raw as { id?: unknown; name?: unknown; blocks?: unknown }
  if (typeof id !== 'string' || !id) return null
  // the name may be empty: that is the seed edit, which follows the language
  if (typeof name !== 'string') return null
  if (!Array.isArray(blocks)) return null
  // truncate BEFORE parsing: validating 150,000 blocks to keep only 200 would be
  // doing exactly the work we are trying to avoid
  const kept = blocks
    .slice(0, MAX_BLOCK_COUNT)
    .map(parseBlock)
    .filter((b): b is Block => b !== null)
  if (!kept.length) return null
  if (seen.some((c) => c.id === id)) return null
  return { id, name, blocks: kept }
}

/**
 * localStorage is editable by hand: we do not trust it, same rule as for the URL
 * hash. Anything that does not parse is silently dropped rather than breaking the
 * app at startup.
 */
export function parseCycles(raw: string | null): Cycle[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const out: Cycle[] = []
  for (const item of data.slice(0, MAX_CYCLES)) {
    const cycle = parseCycle(item, out)
    if (cycle) out.push(cycle)
  }
  return out
}
