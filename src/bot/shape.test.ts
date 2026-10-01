import { describe, expect, it } from 'vitest'
import { TAU } from './math'
import { PROFILE_SAMPLES } from './profiles'
import { radiusAtAngle, silhouette } from './shape'
import { SHAPES } from './skins'

/**
 * `radiusAtAngle`, the function that snaps everything placed "on" the body (the eyes and
 * the notification badge) back onto the real outline.
 *
 * It had no test, even though the engine calls it with `atan2(y, x) - pose.sil.rot` and
 * `orbit` pushes `rot` down to about -30 rad: its argument therefore goes well outside
 * `[0, 2*PI)`. Any simplification of its double modulo would detach the eyes from the
 * silhouette during the orbit, which is exactly the failure this function exists to
 * prevent.
 */

/** A clearly non-circular profile: on a circle, every angle would give 1. */
const TRIANGLE = silhouette('triangle').radii

describe('radiusAtAngle', () => {
  it('returns the radius of the profile, not a constant', () => {
    const seen = new Set(Array.from({ length: 16 }, (_, i) => radiusAtAngle(TRIANGLE, (i / 16) * TAU)))
    expect(seen.size).toBeGreaterThan(8)
  })

  it('wraps negative angles', () => {
    expect(radiusAtAngle(TRIANGLE, -0.1)).toBeCloseTo(radiusAtAngle(TRIANGLE, TAU - 0.1), 12)
    expect(radiusAtAngle(TRIANGLE, -1)).toBeCloseTo(radiusAtAngle(TRIANGLE, TAU - 1), 12)
  })

  /**
   * The `orbit` case: several turns into the negatives. This is what the double modulo of
   * `((x % 1) + 1) % 1` handles and a single modulo breaks.
   */
  it('wraps over several turns, in both directions', () => {
    for (const base of [-30, -12.5, 7.3]) {
      for (const turns of [-3, -1, 1, 5]) {
        expect(
          radiusAtAngle(TRIANGLE, base),
          `base=${base} turns=${turns}`
        ).toBeCloseTo(radiusAtAngle(TRIANGLE, base + turns * TAU), 10)
      }
    }
  })

  /**
   * Continuous when crossing zero, where wrapping makes the index jump from 63 to 0. A
   * simplification that returned a fallback value (typically 1) would show up here as a
   * 0.22 step on this profile.
   *
   * Eight decimals, not nine: the measured gap is 7e-10, float noise on indices computed
   * by modulo. That is three orders of magnitude below what a real discontinuity would
   * produce.
   */
  it('is continuous across zero', () => {
    expect(radiusAtAngle(TRIANGLE, -1e-9)).toBeCloseTo(radiusAtAngle(TRIANGLE, 1e-9), 8)
    // and the value there is indeed the profile's, not a fallback
    expect(radiusAtAngle(TRIANGLE, 0)).toBeCloseTo(TRIANGLE[0]!, 12)
  })
})

/**
 * The customizer shapes are built analytically, without going through the generator that
 * produces `profiles.ts`. Nothing checked their sampling.
 *
 * That is what makes the check necessary: `blend` interpolates by INDEX and falls back to
 * `?? 1` when the index is missing, so a shape built with a different number of samples
 * silently morphs toward a unit circle instead of failing. It would be correct at rest and
 * wrong in all its transitions: the worst of both worlds, because nobody would think to
 * look at a morph.
 */
describe('customizer shape profiles', () => {
  it('all have the same angular sampling, finite and positive', () => {
    for (const shape of SHAPES) {
      expect(shape.radii, shape.id).toHaveLength(PROFILE_SAMPLES)
      for (const [i, r] of shape.radii.entries()) {
        expect(Number.isFinite(r), `${shape.id}[${i}] = ${r}`).toBe(true)
        expect(r, `${shape.id}[${i}]`).toBeGreaterThan(0)
      }
    }
  })

  /**
   * Wide bounds, only there to catch an aberrant shape: a radius under 0.3 would push the
   * eyes out, a radius beyond 1.6 would leave the viewBox. These are not measurements;
   * they are the domain in which the rest of the folder makes sense.
   */
  it('stay within a range where the rest of the engine holds', () => {
    for (const shape of SHAPES) {
      const min = Math.min(...shape.radii)
      const max = Math.max(...shape.radii)
      expect(min, `${shape.id} min`).toBeGreaterThan(0.3)
      expect(max, `${shape.id} max`).toBeLessThan(1.6)
    }
  })
})
