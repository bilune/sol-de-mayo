import { describe, expect, it } from 'vitest'
import { BotEngine, type RenderedEye } from './engine'
import { eyeOffset, FOR_TESTS } from './eyefit'
import { EXPRESSIONS } from './expressions'
import { DEFAULT_SHAPE, SHAPES, SHAPE_BY_ID } from './skins'
import { STATES, type StateId } from './states'

/**
 * The customizer shapes, measured against the body they replace.
 *
 * This file locks down two things, and the second cost far more than the first:
 *
 * 1. **The capsule does not stick out of the silhouette.** The eyes live on a sphere, and
 *    `radiusAtAngle` snaps them to the outline in proportion to the local radius, which
 *    divides their margin by the same ratio. A shape narrow in the eye's direction pushed
 *    it against the edge until the mask cut it open: the capsule showed up as a notch in
 *    the body.
 * 2. **The correction is never seen moving.** Seven versions computed it in the render
 *    loop and all of them jittered. The oscillation tests below are what disqualified
 *    them, and they compare against the CIRCLE, the shape the correction does not touch.
 *
 * Everything is about the RENDERED GEOMETRY, not the computation: we take the body
 * outline and each capsule's outline as the component draws them. It is the only way to
 * check what the eye sees, and it assumes nothing about the method used.
 */

const R = 100

/**
 * Body outline, read from `bodyPath`. `closedPath` emits `M x y` then one `C` per point,
 * so the curve points are the 3rd pair of each `C`.
 */
function bodyOutline(d: string) {
  const pts: Array<{ x: number; y: number }> = []
  for (const seg of d.slice(1).split('C')) {
    const n = seg.match(/-?\d+\.?\d*/g)?.map(Number) ?? []
    if (n.length >= 6) pts.push({ x: n[4]!, y: n[5]! })
    else if (n.length === 2) pts.push({ x: n[0]!, y: n[1]! })
  }
  return pts
}

/** Is the point inside the polygon? Ray casting. */
function inside(poly: Array<{ x: number; y: number }>, x: number, y: number) {
  let on = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) on = !on
  }
  return on
}

/**
 * Outline of a capsule in screen coordinates: a stadium, sampled then passed through the
 * rendered matrix. The dimensions are read back from the `d` that `capsulePath` produced
 * (`M-hw -hh+r A r r ...`), so as to depend only on the output.
 *
 * Thirty-two points are enough: on a 40-unit-long capsule they are less than three units
 * apart, while the smallest overflow we have measured is three.
 */
function eyeOutline(eye: RenderedEye, N = 32) {
  const g = eye.d.match(/-?\d+\.?\d*/g)!.map(Number)
  const hw = Math.abs(g[0]!)
  const r = Math.abs(g[2]!)
  const right = Math.abs(g[1]!)
  const m = eye.matrix.match(/-?\d+\.?\d*/g)!.map(Number)
  const [a, b, c, d, e, f] = m as [number, number, number, number, number, number]
  const out: Array<{ x: number; y: number }> = []
  for (let i = 0; i < N; i++) {
    const u = (i / N) * 4
    let x: number
    let y: number
    if (u < 1) {
      const t = Math.PI * (u - 0.5)
      x = Math.cos(t) * r
      y = -right + Math.sin(t) * r
    } else if (u < 2) {
      x = hw
      y = -right + (u - 1) * 2 * right
    } else if (u < 3) {
      const t = Math.PI * (u - 2 + 0.5)
      x = Math.cos(t) * r
      y = right + Math.sin(t) * r
    } else {
      x = -hw
      y = right - (u - 3) * 2 * right
    }
    out.push({ x: a * x + c * y + e, y: b * x + d * y + f })
  }
  return out
}

/** Three seconds at twenty frames per second: enough for several blinks. */
const INSTANTS = 60
const STEP_SIZE = 1 / 20

/**
 * How far the most overflowing capsule sticks out of the body, in viewBox units.
 *
 * Sweeps TIME, not just the combination. Gaze drift moves the eye by a dozen units, so a
 * single frame proves nothing: it was by measuring only at `POSES[state]` that
 * `capsule` + `scared` went unnoticed, even though it stuck out by 4.4 units a second
 * later.
 */
function overflow(state: StateId, radii: number[], expr: (typeof EXPRESSIONS)[number] | null) {
  const e = new BotEngine(R, state, radii, expr)
  let worst = 0
  for (let i = 0; i < INSTANTS; i++) {
    const f = e.sample(i * STEP_SIZE)
    const body = bodyOutline(f.bodyPath)
    for (const eye of f.eyes) {
      for (const p of eyeOutline(eye)) {
        if (inside(body, p.x, p.y)) continue
        worst = Math.max(worst, Math.min(...body.map((q) => Math.hypot(q.x - p.x, q.y - p.y))))
      }
    }
  }
  return worst
}

/** The states whose body can be replaced by a customizer shape. */
const BASE_BODY = STATES.filter((s) => s.baseBody).map((s) => s.id)
/** The others: their silhouette IS the animation, as measured. */
const MEASURED_SILHOUETTE = STATES.filter((s) => !s.baseBody).map((s) => s.id)

describe('customizer shapes', () => {
  // 680 combinations x 60 instants x two outlines: the heaviest test in the repo, and the
  // only one that proves what the eye sees.
  it('no shape lets an eye leave the silhouette', () => {
    const offenders: string[] = []
    for (const state of BASE_BODY) {
      for (const shape of SHAPES) {
        for (const expr of [null, ...EXPRESSIONS]) {
          const output = overflow(state, shape.radii, expr)
          if (output > 0.05) {
            offenders.push(`${state}/${shape.id}/${expr?.id ?? 'pose'} ${output.toFixed(1)}`)
          }
        }
      }
    }
    // Five state x shape pairs overflowed: `wide`+`capsule` by 14.5 units on a ball of
    // radius 100, `wide`+`triangle` by 11.9, `idle`+`capsule` and `swirl`+`capsule` by 5.3,
    // `notify`+`droplet` by 3.3.
    expect(offenders).toEqual([])
  }, 30_000)

  /**
   * The circle is the measured shape, and the default body: choosing it in
   * the customizer must change NOTHING compared to choosing nothing. This is what
   * guarantees the correction is neutral on the reference, including its outer eye, which
   * already grazes the edge and must keep grazing it. It is also what protects
   * `public/favicon.svg`, whose two eye matrices are those of `sample(1)` on `idle`, down
   * to the byte.
   */
  it('choosing the circle renders exactly the same as choosing nothing', () => {
    expect(DEFAULT_SHAPE).toBe('circle')
    const circle = SHAPE_BY_ID.get('circle')!.radii
    for (const state of BASE_BODY) {
      for (const expr of [null, ...EXPRESSIONS]) {
        const withIt = new BotEngine(R, state, circle, expr).sample(1)
        const without = new BotEngine(R, state, null, expr).sample(1)
        expect(withIt.eyes, `${state}/${expr?.id ?? 'pose'}`).toEqual(without.eyes)
      }
      expect(eyeOffset(circle, state, null)).toEqual({ x: 0, y: 0 })
    }
  })

  /**
   * The measured silhouettes are not replaceable, so the chosen shape must not
   * reach them: neither their body nor their eyes. `orbit` is the case that matters: its
   * eye margin is tighter than the circle's and yet it is correct, since it was measured
   * that way. A margin rule applied indiscriminately would move it.
   */
  it('the chosen shape does not touch states with a measured silhouette', () => {
    for (const state of MEASURED_SILHOUETTE) {
      const bare = new BotEngine(R, state, null, null).sample(1)
      for (const shape of SHAPES) {
        const dressed = new BotEngine(R, state, shape.radii, null).sample(1)
        expect(dressed.eyes, `${state}/${shape.id}`).toEqual(bare.eyes)
        expect(dressed.bodyPath).toBe(bare.bodyPath)
      }
    }
  })

  /**
   * The correction must change NOTHING about eye size.
   *
   * One version scaled it along with the position: that kept all the face's proportions
   * and stayed stable, but the eyes became visibly smaller on a flat body, and changing
   * expression then animated that growth. It read as a defect.
   */
  it('eye size does not depend on the shape', () => {
    const sizes = new Set(
      SHAPES.map((f) =>
        new BotEngine(R, 'idle', f.radii, null)
          .sample(1)
          .eyes.map((y) => y.d)
          .join('|')
      )
    )
    expect(sizes.size).toBe(1)
  })

  /**
   * The real trap: the correction must be INVISIBLE in motion.
   *
   * What we measure is OSCILLATION, not speed. A morph moves the eyes fast anyway (the
   * expressions do not look at the same spot) and that is intended motion. Jittering means
   * going and COMING BACK. So we count direction changes frame by frame, and compare them
   * to the circle, which the correction does not touch.
   *
   * The measure discriminates very well: 0 to 1 back-and-forth on the reference engine, 4
   * to 14 with reversals of up to 26 units on the versions that jittered.
   */
  it('the correction does not make the eyes oscillate', () => {
    const step = 1 / 60

    const trajectory = (build: () => BotEngine, duration = BotEngine.SHAPE_MORPH) => {
      const e = build()
      const out: Array<Array<{ x: number; y: number }>> = []
      for (let t = 0; t <= duration + step; t += step) {
        out.push(
          e.sample(t).eyes.map((eye) => {
            const n = eye.matrix.match(/-?\d+\.?\d*/g)!.map(Number)
            return { x: n[4]!, y: n[5]! }
          })
        )
      }
      return out
    }

    /** How many times an eye moves backward, and by how much at most. */
    const roundTrips = (frames: Array<Array<{ x: number; y: number }>>) => {
      let n = 0
      let amplitude = 0
      const eyes = Math.min(...frames.map((f) => f.length))
      for (let j = 0; j < eyes; j++) {
        let px = 0
        let py = 0
        for (let i = 1; i < frames.length; i++) {
          const dx = frames[i]![j]!.x - frames[i - 1]![j]!.x
          const dy = frames[i]![j]!.y - frames[i - 1]![j]!.y
          const len = Math.hypot(dx, dy)
          if (len <= 0.05) continue
          if ((px || py) && dx * px + dy * py < 0) {
            n++
            amplitude = Math.max(amplitude, len)
          }
          px = dx
          py = dy
        }
      }
      return { n, amplitude }
    }

    const circle = SHAPE_BY_ID.get('circle')!.radii
    const shapeMorph = (radii: number[]) =>
      roundTrips(
        trajectory(() => {
          const e = new BotEngine(R, 'idle', circle, null)
          e.setShape(radii, 0)
          return e
        })
      )
    const atRest = (radii: number[]) =>
      roundTrips(trajectory(() => new BotEngine(R, 'idle', radii, null), 3))
    const expressionMorphs = (radii: number[]) =>
      EXPRESSIONS.map((expr) =>
        roundTrips(
          trajectory(() => {
            const e = new BotEngine(R, 'idle', radii, EXPRESSIONS[0]!)
            e.setExpression(expr, 0)
            return e
          })
        )
      ).reduce((a, b) => ({ n: a.n + b.n, amplitude: Math.max(a.amplitude, b.amplitude) }), {
        n: 0,
        amplitude: 0
      })

    /*
     * On the CIRCLE, nothing at all: the correction is zero there, so it cannot add any
     * motion, and it is the reference for all three comparisons.
     */
    expect(expressionMorphs(circle).n, 'circle : morphs d expression').toBe(0)

    for (const shape of SHAPES) {
      // At rest, the only thing moving is the gaze drift. A correction that followed it
      // would make the eyes jitter constantly: the most visible defect of all, and the
      // first one we had.
      expect(atRest(shape.radii).n, `${shape.id}: drift at rest`).toBeLessThanOrEqual(
        atRest(circle).n + 1
      )
      // A shape change moves the offset, but along the same curve as the silhouette: no
      // more back-and-forth than the circle.
      expect(shapeMorph(shape.radii).n, `shape morph to ${shape.id}`).toBeLessThanOrEqual(
        shapeMorph(circle).n + 1
      )
      /*
       * An expression change moves the offset from one table entry to another. Seven shapes
       * out of eight gain no back-and-forth from it; `droplet` goes from one 6.3-unit
       * reversal (already present without the correction) to two of 11.1. The bound lets
       * that through and nothing more: the faulty versions were at 26.
       */
      expect(
        expressionMorphs(shape.radii).amplitude,
        `${shape.id}: expression morphs`
      ).toBeLessThan(14)
    }
  })

  /**
   * The table is a module constant. It must stay fast enough to build not to weigh on the
   * first render: it is the only cost this fix adds to the engine, which afterwards only
   * reads two entries from it and interpolates them.
   */
  it('the table builds in a few milliseconds', () => {
    const t = performance.now()
    FOR_TESTS.build()
    expect(performance.now() - t).toBeLessThan(200)
  })
})
