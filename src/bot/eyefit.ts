/**
 * Where to place the face on a customizer shape.
 *
 * The eyes live on a sphere, and `radiusAtAngle` snaps them back onto the real outline in
 * proportion to the local radius. That proportion places their CENTER correctly, but the eye
 * has a size: the margin left in front of the edge is multiplied by the same factor, so a
 * silhouette that is narrow in its direction pushes it against the edge until the mask
 * opens it outward. The capsule showed up as a notch in the body on `capsule`, `triangle`,
 * `cloud` and `droplet`.
 *
 * This module solves the problem ONCE, at load time, and returns a table of offsets.
 * That choice is the heart of the fix, far more than the geometry that follows:
 *
 * Solved in the render loop, the correction reacts to everything that moves at sixty
 * frames per second — gaze drift, the pointer, the expression mid-morph, the nearest
 * edge changing, the most constrained eye changing. Seven variants were written that way
 * and all of them produced a visible motion artifact: permanent jitter, a 26-unit jump
 * in direction when the reference edge flipped, sudden growth when size entered the
 * computation. The flaw was in none of their geometries, it was in solving per frame.
 *
 * The rest of the engine does not work like that: poses are DECLARED and it only
 * interpolates them with known curves. A tabulated offset fits that mold. It does not
 * move when the gaze drifts or when the pointer moves, and on a change of shape or
 * expression it only goes from one table entry to another, along that morph's curve.
 * Jitter becomes impossible by construction instead of being pushed back: interpolating
 * between two constants is monotonic, whereas re-solving the problem on a gaze that is
 * mid-interpolation is not.
 *
 * Pleasant corollary: the solver no longer has any continuity constraint, since it does
 * not run during animation. It can therefore probe a whole fan of directions and cover
 * the worst case of gaze drift, which a per-frame version could not afford.
 *
 * The table is a module constant, built at import from pure data: the same nature as
 * the blink schedule in `face.ts`, deterministic and stateless, so it has no effect on
 * the purity of `engine.sample(t)`.
 */

import { EXPRESSIONS, type BotExpression } from './expressions'
import { eyePoses } from './face'
import { radiusAtAngle, toPoints, type Point } from './shape'
import { SHAPES } from './skins'
import { STATES, type Pose, type StateDef, type StateId } from './states'

/** Reference radius of the solver. The returned offset is in units of this radius. */
const R = 100

/**
 * Maximum amplitudes of idle liveliness, read from `liveliness`: `loopNoise` is bounded
 * by 1 in absolute value, so these sums are exact bounds and not estimates.
 *
 * They must be covered, otherwise the correction is right on the nominal pose and wrong a
 * second later: 7 degrees of yaw move the eye by a dozen units on a ball of radius 100.
 * That is precisely what made `capsule` + `scared` overflow while a single-instant
 * measurement declared it fine.
 */
const DRIFT_YAW = 5.5 + 1.6
const DRIFT_PITCH = 4.2 + 1.3
/** Center float, in ball-radius units. */
const DRIFT_X = 0.006
const DRIFT_Y = 0.007

/** The face of a pose, what the solver needs to place its capsules. */
interface Face {
  gaze: Pose['gaze']
  split: number
  eyes: Pose['eyes']
}

/**
 * A capsule ready to be measured: the segment of its axis, and what is needed to compute
 * the radius to clear IN A GIVEN DIRECTION.
 *
 * A capsule is exactly a segment thickened by a disc of radius `r`. Its image under the
 * tangent matrix is therefore a segment thickened by an ELLIPSE, and the radius to clear
 * depends on the direction: it is the support function of that ellipse, `r * |A^T u|`.
 *
 * Taking its largest singular value instead would be conservative but wrong in the only
 * direction that matters, and that costs dearly: the reference margin on the circle came
 * out NEGATIVE, so the requirement became toothless and 34 combinations kept
 * overflowing.
 */
interface Footprint {
  /** center, in viewBox units */
  x: number
  y: number
  /** axis half-vector */
  ax: number
  ay: number
  /** radius of the local disc, before transformation */
  r: number
  /** columns of the tangent matrix, for the support function */
  m: [number, number, number, number]
}

/**
 * Footprints of both eyes of a face, placed on a profile.
 *
 * A capsule is exactly a segment thickened by a disc of radius `r`. Its image under the
 * tangent matrix is therefore a segment thickened by an ELLIPSE, and a disc with the
 * radius of its major axis covers it: hence the largest singular value. The measurement
 * thus stays conservative in the strict sense, a positive margin guaranteeing that the
 * capsule is inside.
 *
 * Blinking is not included: a closed eye does not need room made for it.
 */
function footprints(face: Face, sil: Pose['sil'], radii: number[]): Footprint[] {
  const out: Footprint[] = []
  const poses = eyePoses(face.gaze, R, face.split)
  for (let i = 0; i < 2; i++) {
    const e = poses[i]!
    if (e.depth <= 0.02) continue
    const cfg = face.eyes[i]!
    const phi = ((cfg.tilt ?? 0) * Math.PI) / 180
    const cp = Math.cos(phi)
    const sp = Math.sin(phi)
    const ax = e.a * cp + e.c * sp
    const ay = e.b * cp + e.d * sp
    const cx = -e.a * sp + e.c * cp
    const cy = -e.b * sp + e.d * cp

    const hw = Math.max(cfg.w * R, 0.01) / 2
    const hh = Math.max(cfg.h * R, 0.01) / 2
    const r = Math.min(hw, hh)
    // the axis is that of the largest dimension
    const long = hh > hw
    const half = long ? hh - r : hw - r
    // proportional to the local radius, exactly as the engine does it
    const fit = radiusAtAngle(radii, Math.atan2(e.y, e.x) - sil.rot)
    out.push({
      x: e.x * fit,
      y: e.y * fit,
      ax: (long ? cx : ax) * half,
      ay: (long ? cy : ay) * half,
      r,
      m: [ax, ay, cx, cy]
    })
  }
  return out
}

/**
 * Closest approach between an outline and a segment: the distance, and the vector going
 * from the outline toward the segment — the direction that clears.
 *
 * Both come out of the SAME pass. Computing them separately doubled the only real cost
 * of this module, which is this sweep.
 */
function approach(pts: Point[], x0: number, y0: number, x1: number, y1: number) {
  const sx = x1 - x0
  const sy = y1 - y0
  const len2 = sx * sx + sy * sy
  let best = Infinity
  let vx = 0
  let vy = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    let t = len2 > 0 ? ((p.x - x0) * sx + (p.y - y0) * sy) / len2 : 0
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const ex = x0 + t * sx - p.x
    const ey = y0 + t * sy - p.y
    const d2 = ex * ex + ey * ey
    if (d2 < best) {
      best = d2
      vx = ex
      vy = ey
    }
  }
  const d = Math.sqrt(best)
  return { d, ux: d > 1e-9 ? vx / d : 0, uy: d > 1e-9 ? vy / d : 0 }
}

/** A trial: capsules to fit inside an outline, and the reference outline. */
interface Trial {
  footprints: Footprint[]
  reference: Footprint[]
  outline: Point[]
  calOutline: Point[]
}

/**
 * Idle center float, in viewBox units. It is added to the capsule radius: less than one
 * unit, so absorbing it this way costs less than multiplying the trials by its four
 * corners.
 */
const WOBBLE = Math.hypot(DRIFT_X, DRIFT_Y) * R

/** Margin of the tightest capsule, and the direction that clears it. */
function worst(pts: Point[], footprints: Footprint[], tx: number, ty: number) {
  let margin = Infinity
  let ux = 0
  let uy = 0
  for (const e of footprints) {
    const x = e.x + tx
    const y = e.y + ty
    const a = approach(pts, x - e.ax, y - e.ay, x + e.ax, y + e.ay)
    // support function of the ellipse in the direction of the approach
    const [m0, m1, m2, m3] = e.m
    const radius =
      e.r * Math.hypot(m0 * a.ux + m1 * a.uy, m2 * a.ux + m3 * a.uy) + WOBBLE
    if (a.d - radius < margin) {
      margin = a.d - radius
      ux = a.ux
      uy = a.uy
    }
  }
  return { margin, ux, uy }
}

/**
 * Probed directions and bisection steps. Their product is the construction cost of the
 * table, the only number to watch here.
 */
const DIRECTIONS = 12
const BISECTION = 8

/**
 * The offset to apply to both eyes for this shape, this state and this expression.
 *
 * A TRANSLATION shared by both eyes, hence an isometry: the spacing between the eyes,
 * sizes and tilts are preserved to the pixel. The face is merely placed a little lower
 * on a body that has no room at the top, which is the gesture one would make by hand.
 * The variants that bounded each eye separately spread the pair apart, and those that
 * scaled the face shrank the eyes — visibly.
 *
 * The target margin is that of the ORIGINAL profile, not a strict clearance: on the
 * circle the outer eye already grazes the edge, 17.3 units for a ball of radius 100, and
 * that is intended, it is what gives the volume. It is capped by what the shape offers at
 * its center, otherwise the requirement is untenable on a flat body.
 *
 * DIRECTIONAL SEARCH, not descent. We look for the smallest-norm translation that fits,
 * so we probe a ring of directions and bisect the distance along each one. A gradient
 * descent was written first and it does not converge: clearing the pair from one edge
 * brings it closer to the other, so it gropes around and only keeps its best attempt —
 * cutting its iterations from 40 to 18 was enough to bring back 34 overflows. Here the
 * result does not depend on convergence: each direction is solved exactly, up to the
 * bisection step.
 */
function resolve(trials: Trial[]): { x: number; y: number } {
  if (!trials.length) return { x: 0, y: 0 }

  /** The tightest margin across all trials, for a given translation. */
  const margin = (tx: number, ty: number) => {
    let m = Infinity
    for (const ep of trials) m = Math.min(m, worst(ep.outline, ep.footprints, tx, ty).margin)
    return m
  }

  // Required margin: the tightest the original profile tolerates, across all trials.
  // Then capped by the most clearance the shape can offer the pair, its center.
  let required = Infinity
  for (const ep of trials) {
    required = Math.min(required, worst(ep.calOutline, ep.reference, 0, 0).margin)
  }
  /*
   * The travel must be able to reach the center of the body: `wide` has capsules 87
   * units long, and on a triangle they only fit toward the middle, about fifty units
   * from their nominal position. A fixed travel left them outside.
   */
  let mx = 0
  let my = 0
  const footprints = trials[0]!.footprints
  for (const e of footprints) {
    mx -= e.x / footprints.length
    my -= e.y / footprints.length
  }
  const course = Math.max(0.35 * R, Math.hypot(mx, my) * 1.25)

  // Cap on the requirement: what the shape offers at its center, always reachable.
  required = Math.min(required, margin(mx, my))

  /*
   * Already fine: the circle case, and any wide enough shape. The capsule must FIT in
   * addition to not being tighter than on the original profile — without that second
   * condition, a shape where nothing fits satisfies the first one degenerately and we
   * gave up. `wide` has capsules 87 units long, `notify` 50 in diameter: on a triangle
   * or a drop they overflow no matter what, and we must then aim for the least bad, not
   * give up.
   */
  const start = margin(0, 0)
  if (start >= required && start >= 0) return { x: 0, y: 0 }
  const target = Math.max(required, 0)

  let bestX = 0
  let bestY = 0
  let bestNorm = Infinity
  // fallback when nothing fits: the translation that clears the most, probed along the way
  let fallbackX = 0
  let fallbackY = 0
  let fallback = start

  for (let d = 0; d < DIRECTIONS; d++) {
    const a = (d / DIRECTIONS) * Math.PI * 2
    const ux = Math.cos(a)
    const uy = Math.sin(a)
    if (margin(ux * course, uy * course) < target) {
      // this direction leads nowhere; we still keep the best clearance
      // no solution this way, but maybe a better clearance
      for (const k of [0.3, 0.6, 1]) {
        const m = margin(ux * course * k, uy * course * k)
        if (m > fallback) {
          fallback = m
          fallbackX = ux * course * k
          fallbackY = uy * course * k
        }
      }
      continue
    }
    // the shortest distance that fits, along this direction
    let bottom = 0
    let top = course
    for (let i = 0; i < BISECTION; i++) {
      const mid = (bottom + top) / 2
      if (margin(ux * mid, uy * mid) >= target) top = mid
      else bottom = mid
    }
    if (top < bestNorm) {
      bestNorm = top
      bestX = ux * top
      bestY = uy * top
    }
  }

  const x = bestNorm === Infinity ? fallbackX : bestX
  const y = bestNorm === Infinity ? fallbackY : bestY
  // returned in BALL-RADIUS units: the engine scales it back
  return { x: +(x / R).toFixed(6), y: +(y / R).toFixed(6) }
}

/**
 * The face to cover: the expression's if the state accepts it, its own otherwise.
 *
 * ONE table entry per expression, not a worst case shared by all. A worst case seemed
 * safer — a constant offset cannot move when the expression changes — but it is
 * untenable: on a capsule, `neutral` has its eyes high and asks to move down while
 * `scared` has them low and asks to move up. No single translation satisfies both, and
 * the measurement confirms it (4 overflows of 4.8 units).
 *
 * One entry per expression is no less smooth for that: the engine interpolates between
 * TWO CONSTANTS, which is monotonic by construction. What jittered was re-solving the
 * problem on a gaze that was mid-interpolation.
 */
function faceOf(def: StateDef, pose: Pose, expr: BotExpression | null): Face {
  if (def.baseFace && expr) return { gaze: expr.gaze, split: expr.split, eyes: expr.eyes }
  return { gaze: pose.gaze, split: pose.split, eyes: pose.eyes }
}

/** The times to sample in a state: a single one if its pose does not move. */
function dates(def: StateDef): number[] {
  /** Everything the solver uses: if nothing moves, one time is enough. */
  const signature = (p: Pose) =>
    JSON.stringify([p.gaze, p.split, p.eyes, p.sil.rot, p.sil.cx, p.sil.cy, p.sil.sx, p.sil.sy])
  if (signature(def.pose(0)) === signature(def.pose(def.duration))) return [0]
  const n = 3
  return Array.from({ length: n }, (_, i) => (i / (n - 1)) * def.duration)
}

/** The offset of a shape for a state and an expression, drift included. */
function offsetFor(
  def: StateDef,
  radii: number[],
  expr: BotExpression | null
): { x: number; y: number } {
  const trials: Trial[] = []
  for (const t of dates(def)) {
    const pose = def.pose(t)
    const outline = toPoints({ ...pose.sil, radii }, R)
    const calOutline = toPoints(pose.sil, R)
    const v = faceOf(def, pose, expr)
    // The four corners of the drift bound the nominal pose, which is their center:
    // testing it as well would change no margin and costs one trial in five.
    const corners: Face[] = []
    for (const dy of [-DRIFT_YAW, DRIFT_YAW]) {
      for (const dp of [-DRIFT_PITCH, DRIFT_PITCH]) {
        corners.push({
          ...v,
          gaze: { yaw: v.gaze.yaw + dy, pitch: v.gaze.pitch + dp, roll: v.gaze.roll }
        })
      }
    }
    for (const c of corners) {
      trials.push({
        footprints: footprints(c, pose.sil, radii),
        reference: footprints(c, pose.sil, pose.sil.radii),
        outline,
        calOutline
      })
    }
  }
  return resolve(trials)
}

/** Zero, the value shared by everything that has nothing to correct. */
const ZERO = { x: 0, y: 0 } as const

/** Key of an entry: the state, and the expression when the state accepts it. */
const key = (state: StateId, expr: string | null) => `${state}|${expr ?? ''}`

/**
 * Table of offsets, built at import: one entry per (shape, base-body state, expression).
 * Only `idle` and `swirl` carry the resting face, so only they vary per expression — the
 * three other base-body states have a measured face and a single entry.
 *
 * Keyed by REFERENCE of the radii array, which is already the engine's convention: its
 * guards `radii === this.shape` and `expression === this.expr` rely on the same
 * stability. An unknown profile, or `null`, corrects nothing — the API accepts any array
 * and the engine should not depend on its callers' caution.
 */
function build(): Map<number[], Map<string, { x: number; y: number }>> {
  return new Map(
  SHAPES.map((shape) => {
    const offsets = new Map<string, { x: number; y: number }>()
    for (const def of STATES) {
      if (!def.baseBody) continue
      const expressions = def.baseFace ? [null, ...EXPRESSIONS] : [null]
      for (const expr of expressions) {
        offsets.set(key(def.id, expr?.id ?? null), offsetFor(def, shape.radii, expr))
      }
    }
    return [shape.radii, offsets]
  })
  )
}

const OFFSETS = build()

/**
 * Offset to apply to both eyes for this shape in this state, in ball-radius units — the
 * engine scales it back.
 *
 * It is zero whenever the shape is not in the catalog, which covers `null` and the
 * circle: on the circle both profiles are the same, so the margin is already the required
 * one and the descent exits on the first iteration. The measured shape
 * therefore does not move, with no special case.
 */
export function eyeOffset(
  radii: number[] | null,
  state: StateId,
  expr: string | null
): { x: number; y: number } {
  if (!radii) return ZERO
  const offsets = OFFSETS.get(radii)
  if (!offsets) return ZERO
  // a state without a resting face has only one entry, whatever the expression
  return offsets.get(key(state, expr)) ?? offsets.get(key(state, null)) ?? ZERO
}

/** For tests: a way to check the table without redoing the geometry. */
/** For tests: a way to time the construction of the table. */
export const FOR_TESTS = { build }
