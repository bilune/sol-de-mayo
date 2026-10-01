import { describe, expect, it } from 'vitest'
import {
  MAX_BLOCK,
  MAX_BLOCK_COUNT,
  MAX_CYCLES,
  MIN_BLOCK,
  blockAt,
  blocksWith,
  clampDuration,
  defaultCycle,
  makeBlock,
  minDurationOf,
  moveBlock,
  nextCycleId,
  parseCycles,
  totalDuration,
  type Cycle,
  uniqueName
} from './cycles'
import { SEQUENCE, STATES, STATE_BY_ID } from './states'

describe('default cycle', () => {
  it('takes the catalogue sequence, in order', () => {
    expect(defaultCycle().blocks.map((b) => b.state)).toEqual(SEQUENCE)
  })

  it('holds each state for its measured duration', () => {
    for (const block of defaultCycle().blocks) {
      expect(block.duration).toBe(STATE_BY_ID.get(block.state)!.duration)
    }
  })

  it('is rebuilt identically on every call', () => {
    expect(defaultCycle()).toEqual(defaultCycle())
    // ...without sharing objects, otherwise editing an edit would touch the seed
    expect(defaultCycle().blocks[0]).not.toBe(defaultCycle().blocks[0])
  })

  it('always leaves room for a new cycle, without collision', () => {
    const reference = defaultCycle()
    const one: Cycle = {
      id: nextCycleId([reference]),
      name: uniqueName('Mon cycle', [reference]),
      blocks: []
    }
    const two: Cycle = {
      id: nextCycleId([reference, one]),
      name: uniqueName('Mon cycle', [reference, one]),
      blocks: []
    }
    expect(one.id).not.toBe(reference.id)
    expect(two.id).not.toBe(one.id)
    expect(two.name).not.toBe(one.name)
  })
})

describe('durations', () => {
  it('does not go below the engine floor', () => {
    // below it, the block is shorter than the entry crossfade of the next one
    expect(clampDuration('idle', 0.1)).toBe(MIN_BLOCK)
    expect(clampDuration('idle', -5)).toBe(MIN_BLOCK)
  })

  it('respects the measure of states that need to complete', () => {
    // the "!" returns at 2.0, the body recomposes at 2.4
    expect(minDurationOf('alert')).toBe(2)
    expect(minDurationOf('burst')).toBe(2.4)
    expect(clampDuration('orbit', 1)).toBe(2.5)
    // a state that ignores time only has the floor
    expect(minDurationOf('idle')).toBe(MIN_BLOCK)
  })

  it('lets no state go below its measure', () => {
    for (const state of SEQUENCE) {
      expect(clampDuration(state, 0)).toBeGreaterThanOrEqual(minDurationOf(state))
    }
  })

  it('caps and lands on the step, without float residue', () => {
    expect(clampDuration('idle', 999)).toBe(MAX_BLOCK)
    expect(clampDuration('idle', 2.44)).toBe(2.4)
    expect(clampDuration('idle', 2.46)).toBe(2.5)
  })
})

describe('playback', () => {
  const cycle: Cycle = {
    id: 'c1',
    name: 'Test',
    blocks: [
      { state: 'idle', duration: 2 },
      { state: 'wink', duration: 1 },
      { state: 'egg', duration: 3 }
    ]
  }

  it('adds up the blocks', () => {
    expect(totalDuration(cycle.blocks)).toBe(6)
  })

  it('finds the playing block and the time elapsed in it', () => {
    expect(blockAt(cycle.blocks, 0)).toEqual({ index: 0, elapsed: 0 })
    expect(blockAt(cycle.blocks, 1.9)).toEqual({ index: 0, elapsed: 1.9 })
    // the boundary belongs to the next block
    expect(blockAt(cycle.blocks, 2)).toEqual({ index: 1, elapsed: 0 })
    expect(blockAt(cycle.blocks, 3.5)).toEqual({ index: 2, elapsed: 0.5 })
  })

  it('loops past the last block', () => {
    expect(blockAt(cycle.blocks, 6)).toEqual({ index: 0, elapsed: 0 })
    expect(blockAt(cycle.blocks, 8)).toEqual({ index: 1, elapsed: 0 })
  })

  it('does not break on an empty cycle', () => {
    expect(blockAt([], 3)).toEqual({ index: 0, elapsed: 0 })
    expect(totalDuration([])).toBe(0)
  })

  it('moves a block without touching the original list', () => {
    const blocks = cycle.blocks
    expect(moveBlock(blocks, 0, 2).map((b) => b.state)).toEqual(['wink', 'egg', 'idle'])
    expect(moveBlock(blocks, 2, 0).map((b) => b.state)).toEqual(['egg', 'idle', 'wink'])
    expect(blocks.map((b) => b.state)).toEqual(['idle', 'wink', 'egg'])
  })
})

describe('storage reload', () => {
  it('does not break on empty or invalid JSON', () => {
    expect(parseCycles(null)).toEqual([])
    expect(parseCycles('')).toEqual([])
    expect(parseCycles('{not json')).toEqual([])
    expect(parseCycles('{"id":"c1"}')).toEqual([])
  })

  it('drops blocks whose state no longer exists', () => {
    const raw = '[{"id":"c1","name":"A","blocks":[{"state":"idle","duration":2},' +
      '{"state":"disparu","duration":2}]}]'
    expect(parseCycles(raw)[0]!.blocks.map((b) => b.state)).toEqual(['idle'])
  })

  it('brings outlier durations back within bounds', () => {
    const raw = '[{"id":"c1","name":"A","blocks":[{"state":"idle","duration":-4},' +
      '{"state":"egg","duration":9999}]}]'
    expect(parseCycles(raw)[0]!.blocks.map((b) => b.duration)).toEqual([MIN_BLOCK, MAX_BLOCK])
  })

  it('drops an empty, unnamed or duplicate cycle', () => {
    expect(parseCycles('[{"id":"c1","name":"A","blocks":[]}]')).toEqual([])
    expect(parseCycles('[{"id":"c1","blocks":[{"state":"idle","duration":2}]}]')).toEqual([])
    const duplicate = '[{"id":"c1","name":"A","blocks":[{"state":"idle","duration":2}]},' +
      '{"id":"c1","name":"B","blocks":[{"state":"egg","duration":2}]}]'
    expect(parseCycles(duplicate).map((c) => c.name)).toEqual(['A'])
  })

  it('keeps only the fields of the model, not what is slipped in on top', () => {
    const raw = '[{"id":"defaut","name":"Mon montage","locked":true,"secret":1,' +
      '"blocks":[{"state":"idle","duration":2,"vitesse":3}]}]'
    const cycle = parseCycles(raw)[0]!
    expect(Object.keys(cycle).sort()).toEqual(['blocks', 'id', 'name'])
    expect(Object.keys(cycle.blocks[0]!).sort()).toEqual(['duration', 'state'])
  })

  /*
   * Storage is editable and holds a few megabytes, while nothing downstream is sized for
   * that. A single cycle of 150,000 blocks (about 4 MB of JSON, so within budget) gave a
   * 1,500,000 s duration, as many ticks to allocate and a 29,700,000 px track: the tab
   * froze when entering the Animations view.
   */
  it('bounds the size of a reloaded edit', () => {
    const blocks = Array.from({ length: 200_000 }, () => ({ state: 'idle', duration: 10 }))
    const raw = JSON.stringify([{ id: 'c1', name: 'A', blocks: blocks }])
    expect(parseCycles(raw)[0]!.blocks).toHaveLength(MAX_BLOCK_COUNT)
  })

  /*
   * The floor is DERIVED from the longest `morph`; it is no longer hand-written. This test
   * keeps the link visible: it used to be hardcoded to 0.6, which only worked because 0.6
   * happened to be the morph of `orbit`. A state that morphs more slowly moves it.
   */
  it('the block floor covers the longest crossfade in the catalog', () => {
    const longest = Math.max(...STATES.map((s) => s.morph))
    expect(MIN_BLOCK).toBeGreaterThanOrEqual(longest)
    // and it is not needlessly larger: it is exactly that crossfade
    expect(MIN_BLOCK).toBe(longest)
  })

  it('also bounds adding from the editor, not only reloading', () => {
    let blocks = Array.from({ length: MAX_BLOCK_COUNT }, () => makeBlock('idle'))
    expect(blocksWith(blocks, 'egg')).toHaveLength(MAX_BLOCK_COUNT)
    // and adding just below the bound is still possible
    blocks = blocks.slice(0, MAX_BLOCK_COUNT - 1)
    expect(blocksWith(blocks, 'egg')).toHaveLength(MAX_BLOCK_COUNT)
  })

  it('bounds the number of reloaded edits', () => {
    const raw = JSON.stringify(
      Array.from({ length: 5000 }, (_, i) => ({
        id: `c${i}`,
        name: `A${i}`,
        blocks: [{ state: 'idle', duration: 2 }]
      }))
    )
    expect(parseCycles(raw)).toHaveLength(MAX_CYCLES)
  })

  /*
   * `swirl` is the settings entry transition, deliberately outside `SEQUENCE`: a test keeps
   * it out of the palette and the sheet. A user edit is only built from the palette, so it
   * can only get here through hand-tampered storage, and it is refused here as everywhere
   * else.
   */
  it('rejects a state outside the catalog, `swirl` included', () => {
    const raw = '[{"id":"c1","name":"A","blocks":[{"state":"swirl","duration":2},' +
      '{"state":"idle","duration":2}]}]'
    expect(parseCycles(raw)[0]!.blocks.map((b) => b.state)).toEqual(['idle'])
    // an edit containing ONLY that becomes empty, so it is dropped
    expect(parseCycles('[{"id":"c1","name":"A","blocks":[{"state":"swirl","duration":2}]}]')).toEqual(
      []
    )
  })
})
