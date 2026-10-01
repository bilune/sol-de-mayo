// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { BotEngine } from '@/bot/engine'
import { blockAt, defaultCycle, offsetOf, type Block } from '@/bot/cycles'
import { RADIUS } from '@/bot/coords'
import { SUN, SUN_EYES, SUN_SCALE } from '@/bot/sun'
import { SHAPE_BY_ID } from '@/bot/skins'
import { EXPRESSION_BY_ID } from '@/bot/expressions'
import { openCycle } from './capture'
import { HALF_SCREEN, viewBoxExport } from './export'

/**
 * The offscreen player, the one that renders the frames of a montage export.
 *
 * It is the only test in the repo that needs a DOM, hence the `happy-dom` environment at
 * the top of the file: the rest of the suite runs in `node`, which made `capture.ts` — and
 * with it the whole export chain — untestable.
 *
 * What it catches is not visible any other way than by watching an MP4 frame by frame,
 * and that is precisely what let it slip through: three defects silently damaged every
 * exported video.
 */

const SETTINGS = { shape: 'circle', color: 'ink', expression: 'neutral' }
const SIZE = 128

/** The body's `d`, as the component put it in the mask. */
function bodyOf(svg: SVGSVGElement) {
  return svg.querySelector('mask path')!.getAttribute('d')!
}

/** The eye matrices, in document order. */
function eyesOf(svg: SVGSVGElement) {
  // the bot's capsules carry their placement in a matrix; the sun's flag eyes are
  // drawn already in place, so their first stroke stands in for it
  return [...svg.querySelectorAll('mask [transform], [data-eye]')].map(
    (e) => e.getAttribute('transform') ?? e.querySelector('path')!.getAttribute('d')!
  )
}

/** The engine alone, set up the way `renderAt` does: each state dated at its absolute offset. */
function engineAtSameInstant(blocks: Block[], t: number) {
  // same ball size and corona as the component, whichever variant is on
  const e = new BotEngine(
    SUN ? SUN_SCALE : RADIUS,
    blocks[0]!.state,
    SHAPE_BY_ID.get(SETTINGS.shape)!.radii,
    EXPRESSION_BY_ID.get(SETTINGS.expression)!,
    SUN
  )
  const { index } = blockAt(blocks, t)
  for (let i = 1; i <= index; i++) e.setState(blocks[i]!.state, offsetOf(blocks, i))
  return e.sample(t)
}

/**
 * The frame of a CYCLE export must be the one the component DRAWS, not a number that
 * looks like it.
 *
 * `HALF_SCREEN` was a hardcoded 158 facing a `VB = 158` written by hand in the component,
 * and nothing tied the two together. The regression targeted: someone widens the viewBox
 * for a new state with bigger rings, the export keeps the previous frame and adds empty
 * bands to every video, with all tests green.
 *
 * Compared here to the `viewBox` actually emitted, and not to the constant: both now come
 * from the same module, so an assertion between them would be a tautology. What can still
 * drift is the TEMPLATE.
 */
describe('export frame', () => {
  it('exports the cycle on the viewBox the component draws', async () => {
    const player = await openCycle(SETTINGS, defaultCycle().blocks, SIZE)
    try {
      const svg = await player.render(0)
      expect(svg.getAttribute('viewBox')).toBe(viewBoxExport(HALF_SCREEN))
    } finally {
      player.close()
    }
  })
})

describe('off-screen player', () => {
  /**
   * Replaying the sequence must give back exactly the same frames.
   *
   * The GIF export depends on it: it makes TWO passes, one to tally the palette and one to
   * index, and the first one's palette only holds if the second renders the same frames.
   * A single player served both, but it remembers the last block laid and the engine
   * remembers the previous state: replaying frame 0 after a full pass dated the first
   * state at instant 0 with the LAST one as previous state, and so rendered the latter's
   * pose. The default GIF opened on an EYELESS ball — the comet has a zero `eyeAlpha`.
   */
  it('replays the sequence identically', async () => {
    const blocks = defaultCycle().blocks
    const created = await openCycle(SETTINGS, blocks, SIZE)
    const reference = { body: bodyOf(await created.render(0)), eyes: eyesOf(await created.render(0)) }
    created.close()

    const replay = await openCycle(SETTINGS, blocks, SIZE)
    try {
      // a full pass, coarsely sampled: what matters is having gone through every
      // block before coming back to the start
      for (let t = 0; t < 30; t += 1.5) await replay.render(t)
      const after = await replay.render(0)
      expect(bodyOf(after)).toBe(reference.body)
      expect(eyesOf(after)).toEqual(reference.eyes)
      expect(eyesOf(after)).toHaveLength(2)
    } finally {
      replay.close()
    }
  })

  /**
   * The rendered frame must be the engine's, including ON a block join.
   *
   * At the joins, the component did set the state at its absolute offset and then sampled
   * at the right time — but the `state` effect, flushed by the export's synchronous
   * re-render, came along afterwards with a non-inert `redrawFrozen()` (the player is
   * mounted with `frozenAt: 0`). And `sample(0)` right after a change dated later gives a
   * zero blend ratio, hence the PREVIOUS state's pose: a wrong frame at every join,
   * thirteen times in the default montage.
   */
  it('renders exactly what the engine renders, joins included', async () => {
    const blocks = defaultCycle().blocks
    const player = await openCycle(SETTINGS, blocks, SIZE)
    try {
      // the join times themselves, plus a point in the middle of each block
      const dates = blocks.flatMap((b, i) => {
        const start = offsetOf(blocks, i)
        return i === 0 ? [start + b.duration / 2] : [start, start + b.duration / 2]
      })
      for (const t of dates) {
        const svg = await player.render(t)
        const expected = engineAtSameInstant(blocks, t)
        expect(bodyOf(svg), `t=${t.toFixed(2)}`).toBe(expected.bodyPath)
        // the sun's flag eyes are drawn as face features, not as the bot's capsules
        const eyes =
          SUN && SUN_EYES === 'flag'
            ? expected.features.filter((f) => f.id.startsWith('eye')).map((f) => f.paths[0])
            : expected.eyes.map((e) => e.matrix)
        expect(eyesOf(svg), `t=${t.toFixed(2)}`).toEqual(eyes)
      }
    } finally {
      player.close()
    }
  })

  /**
   * Frame 0 is the montage's FIRST state, not a rest that morphs toward it.
   *
   * The player was mounted without a `state` prop, so the model took its `idle` default
   * and the engine was built on it: a montage starting with the orbit opened on a resting
   * ball that morphed toward the triangle for 0.6 s. On-screen playback does not do that,
   * it seeds the state on the current block.
   */
  it('opens on the first state of the edit, without morphing from rest', async () => {
    for (const start of ['orbit', 'egg', 'hexagon'] as const) {
      const blocks = [
        { state: start, duration: 2 },
        { state: 'idle' as const, duration: 2 }
      ]
      const player = await openCycle(SETTINGS, blocks, SIZE)
      try {
        const svg = await player.render(0)
        expect(bodyOf(svg), start).toBe(engineAtSameInstant(blocks, 0).bodyPath)
      } finally {
        player.close()
      }
    }
  })
})
