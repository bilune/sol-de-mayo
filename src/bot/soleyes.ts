import type { ExpressionId } from './expressions'
import { clamp, lerp } from './math'
import { samplePath, strokeOf, strokePolygon } from './flagpath'
import type { Point } from './shape'

/**
 * The Sol de Mayo's own eyes, alive.
 *
 * The flag draws each eye as four strokes around a round pupil: the fold of the
 * upper eyelid (the heaviest line), the upper and lower contours of the almond,
 * and a lighter line under the eye for the lower lid. This module draws those
 * same strokes from a few parameters, so a resting eye reads as the flag's while
 * each expression gets its own: the lids open wide in surprise, slant in anger
 * and grief, droop with sleep or disdain, a smile pushes the lower lid up into a
 * crescent, the pupils shrink with fear, dilate with delight, and glance aside.
 *
 * Every eye has the same number of points, so two eyes blend by plain
 * interpolation and the change of expression is a glide. A blink closes the
 * almond onto its corner line while the fold stays: the closed eye is a line
 * under a lid, as a drawn eye should be.
 *
 * Geometry in flag units (face radius 65, y down), for the RIGHT eye, x pointing
 * away from the nose; the left eye is its mirror. Design values, tuned by eye.
 */

export interface SolEyeCfg {
  /** opening, 1 = the flag's almond; 0 = shut */
  open: number
  /** width relative to the flag's */
  width: number
  /** lid slant, degrees: + drops the inner end (anger), - the outer end (grief) */
  tilt: number
  /** 0..1: the lower lid rises into a crescent (a smiling eye) */
  smile: number
  /** 0..1: the upper lid comes down flat over the eye (sleep, disdain) */
  heavy: number
  /** pupil size, 1 = the flag's */
  pupil: number
  /** where the pupil looks inside the eye, -1..1 on SCREEN axes (x right, y down) */
  lookX: number
  lookY: number
  /** height of the lid fold above the eye, 1 = the flag's */
  crease: number
}

const e = (open: number, o: Partial<Omit<SolEyeCfg, 'open'>> = {}): SolEyeCfg => ({
  open,
  width: 1,
  tilt: 0,
  smile: 0,
  heavy: 0,
  pupil: 1,
  lookX: 0,
  lookY: 0,
  crease: 1,
  ...o
})

export const NEUTRAL_SOL_EYE: SolEyeCfg = e(1)

const both = (cfg: SolEyeCfg): [SolEyeCfg, SolEyeCfg] => [cfg, cfg]

/** Eyes per expression, [screen-left eye, screen-right eye]. */
export const SOL_EYES: Record<ExpressionId, [SolEyeCfg, SolEyeCfg]> = {
  // the flag's gaze, calm and level
  neutral: both(NEUTRAL_SOL_EYE),
  // a touch wider, pupils up at you
  attentive: both(e(1.12, { pupil: 1.06, crease: 1.15, lookY: -0.15 })),
  // wide open, fold thrown high, pupils pinned small in the middle
  surprised: both(e(1.5, { width: 1.04, pupil: 0.68, crease: 1.55 })),
  // bright and wide, pupils dilated, cheeks already lifting
  excited: both(e(1.28, { pupil: 1.32, crease: 1.3, smile: 0.2, lookY: -0.1 })),
  // the lower lid rises: a smiling crescent
  happy: both(e(0.7, { smile: 0.85, crease: 0.95 })),
  // laughing: squeezed into arcs
  hilarious: both(e(0.12, { smile: 1, pupil: 0.9, crease: 0.85 })),
  // lids slammed down toward the nose, pupils hard and small
  angry: both(e(0.82, { tilt: 24, heavy: 0.18, pupil: 0.82, crease: 0.55 })),
  // lids falling toward the temples, eyes down
  sad: both(e(0.86, { tilt: -22, heavy: 0.22, lookY: 0.4, crease: 0.9, pupil: 1.05 })),
  // as wide as they go, tiny pupils, a worried slant
  scared: both(e(1.6, { width: 1.05, pupil: 0.52, crease: 1.65, tilt: -9 })),
  // one eye narrowed, both cutting sideways
  wary: [
    e(0.92, { lookX: 0.6, crease: 1.05 }),
    e(0.46, { heavy: 0.5, tilt: 10, lookX: 0.6, crease: 0.8 })
  ],
  // one eye wide, one squinting, looking up for the answer
  confused: [
    e(1.18, { crease: 1.35, lookX: -0.3, lookY: -0.35 }),
    e(0.7, { tilt: 9, lookX: -0.3, lookY: -0.35, crease: 0.9 })
  ],
  // leaning in: wide, dilated, glancing up and aside
  curious: [
    e(1.2, { pupil: 1.15, crease: 1.25, lookX: 0.35, lookY: -0.25 }),
    e(1.08, { pupil: 1.12, crease: 1.15, lookX: 0.35, lookY: -0.25 })
  ],
  // half-lidded and pleased with itself
  proud: both(e(0.72, { heavy: 0.38, smile: 0.3, crease: 0.85 })),
  // looking away and down, a shy smile in the lids
  shy: both(e(0.86, { lookX: -0.5, lookY: 0.45, smile: 0.25, tilt: -6 })),
  // flat heavy lids, eyes off to the side
  jaded: both(e(0.6, { heavy: 0.62, lookX: 0.5, pupil: 0.92, crease: 0.9 })),
  // barely open, lids sinking, drifting down
  sleepy: both(e(0.36, { heavy: 0.78, tilt: -6, lookY: 0.3, crease: 0.9 }))
}

export function lerpSolEye(a: SolEyeCfg, b: SolEyeCfg, t: number): SolEyeCfg {
  return {
    open: lerp(a.open, b.open, t),
    width: lerp(a.width, b.width, t),
    tilt: lerp(a.tilt, b.tilt, t),
    smile: lerp(a.smile, b.smile, t),
    heavy: lerp(a.heavy, b.heavy, t),
    pupil: lerp(a.pupil, b.pupil, t),
    lookX: lerp(a.lookX, b.lookX, t),
    lookY: lerp(a.lookY, b.lookY, t),
    crease: lerp(a.crease, b.crease, t)
  }
}

/** Centre of the flag's right eye (the almond's middle), flag units. */
export const SOL_EYE_CENTER = { x: 22.75, y: -9.5 }

/**
 * The flag's right eye, stroke by stroke, copied from the official drawing: the
 * lid fold, the almond's upper and lower contours, the lower lid. The pupil is
 * the flag's disc of radius 4.5 at (22, -9).
 */
const FLAG_FOLD =
  'M 23,-17 C 16.5,-17 15,-15.5 12,-13 S 7.5,-11 7,-10.5 S 7,-8.5 8,-9 S 11,-10.5 14,-13 S 20,-15.5 23,-15.5 C 32,-15.5 37,-8 38,-8.5 S 33,-17 23,-17'
const FLAG_UPPER = 'M 34.5,-8.5 C 28,-15.5 16,-16 11,-8 H 13 C 18,-16 30,-12.5 31,-9 v 1'
const FLAG_LOWER = 'M 11,-8 C 16,-3.5 27,-3 34.5,-8.5 L 31,-9 C 26,-3.5 18,-4 13,-8 v -1'
const FLAG_LID = 'M 35,-6 C 26.5,0.5 18,0 13,-3 S 8,-7 9,-7 S 11,-6 15,-4 S 25,-2 35,-6'
const FLAG_PUPIL = { x: 22, y: -9, r: 4.5 }

/** Samples along each stroke. */
const N = 64
const fold = strokeOf(samplePath(FLAG_FOLD)[0]!, N)
const upper = strokeOf(samplePath(FLAG_UPPER)[0]!, N)
const lower = strokeOf(samplePath(FLAG_LOWER)[0]!, N)
const lid = strokeOf(samplePath(FLAG_LID)[0]!, N)

/** The almond's corners, where both contours meet: the eye opens and closes on the line between them. */
const INNER = { x: 11, y: -8 }
const OUTER = { x: 34.5, y: -8.5 }
const cornerY = (x: number) => lerp(INNER.y, OUTER.y, (x - INNER.x) / (OUTER.x - INNER.x))
/** 0 at the inner corner, 1 at the outer; beyond them for the fold and the lid. */
const along = (x: number) => (x - INNER.x) / (OUTER.x - INNER.x)

/** A stroke's centreline height over the corner line, as a function of x (0 past its ends). */
function heightOver(center: Point[]): (x: number) => number {
  const pts = [...center].sort((p, q) => p.x - q.x)
  return (x: number) => {
    if (x <= pts[0]!.x || x >= pts[pts.length - 1]!.x) return 0
    let i = 1
    while (pts[i]!.x < x) i++
    const a = pts[i - 1]!
    const b = pts[i]!
    const y = lerp(a.y, b.y, (x - a.x) / (b.x - a.x || 1))
    return y - cornerY(x)
  }
}
const upperOver = heightOver(upper.center)
const lowerOver = heightOver(lower.center)
/** The upper contour's peak height, to normalise its shape. */
const UPPER_PEAK = Math.max(...upper.center.map((p) => -(p.y - cornerY(p.x))))

/** How high a full smile arches the eye in its middle. */
const ARCH = 4.2

const bell = (t: number, p: number) => Math.pow(Math.max(0, Math.sin(Math.PI * clamp(t))), p)

export interface SolEyeRender {
  /** separate filled shapes, absolute flag units */
  polys: Point[][]
  /** highest point of the eye (its fold), relative to the eye's centre: the brow keeps clear of it */
  top: number
}

/**
 * One eye. `side` 1 = the screen-right eye (drawn as the flag draws it), -1 = the
 * screen-left one (mirrored). `blink` 1 = open, 0 = shut, from the engine's lid.
 *
 * Every stroke is the flag's own, moved along its centreline: the neutral eye IS
 * the flag's eye, point for point, and every expression is that drawing bent.
 */
export function solEyePaths(cfg: SolEyeCfg, side: 1 | -1, blink: number): SolEyeRender {
  const open = clamp(cfg.open, 0, 1.8) * clamp(blink)
  const smile = clamp(cfg.smile)
  const heavy = clamp(cfg.heavy)
  const width = clamp(cfg.width, 0.7, 1.12)
  const creaseK = clamp(cfg.crease, 0.3, 1.8)
  const cx = SOL_EYE_CENTER.x
  const halfW = (OUTER.x - INNER.x) / 2
  // positive tilt drops the inner end (the inner end is at small x)
  const slant = Math.tan((clamp(cfg.tilt, -35, 35) * Math.PI) / 180) * halfW * 0.95
  const tiltY = (x: number) => ((cx - x) / halfW) * slant
  // the lid's slant lives on the OPEN eye: closing it lays the lid flat on the
  // corner line instead of twisting it across the lower one
  const tiltK = clamp(open / 0.7)
  // a smile bends the whole eye upward into an arch ("^")
  const arch = (x: number) => smile * ARCH * bell(along(x), 1)

  /** The deformed upper contour's height over the corner line at x. */
  const upperAt = (x: number) => {
    const d = upperOver(x)
    const s = clamp(-d / UPPER_PEAK)
    // a heavy lid lowers the contour and flattens its top
    const shaped = UPPER_PEAK * Math.pow(s, 1 - 0.55 * heavy)
    return -shaped * open * (1 - 0.62 * heavy) + tiltY(x) * s * tiltK
  }
  const lowerAt = (x: number) => {
    const d = lowerOver(x) * open * (1 - 0.65 * smile)
    // the lower contour never crosses the upper one: at least a hairline apart
    return Math.max(d, upperAt(x) + 0.9 * bell(along(x), 0.5))
  }

  // Each point of a centreline keeps its height ABOVE or BELOW the contour it
  // rides on (the fold over the upper contour, the lid under the lower one), so
  // the gaps of the drawing survive any opening.
  const moveUpper = (p: Point) => ({ x: p.x, y: cornerY(p.x) + upperAt(p.x) - arch(p.x) })
  const moveLower = (p: Point) => ({ x: p.x, y: cornerY(p.x) + lowerAt(p.x) - arch(p.x) })
  const moveFold = (p: Point) => {
    const gap = p.y - cornerY(p.x) - upperOver(p.x)
    // the fold slants with the lid, a little more, even on a closed eye
    const s = bell(along(p.x), 0.8)
    return {
      x: p.x,
      y:
        cornerY(p.x) +
        upperAt(p.x) +
        // closing the eye barely draws the fold in: it never lands on the lid line
        gap * creaseK * (0.85 + 0.15 * Math.min(open, 1.4)) -
        arch(p.x) +
        tiltY(p.x) * s * 0.35
    }
  }
  const moveLid = (p: Point) => {
    const gap = p.y - cornerY(p.x) - lowerOver(p.x)
    return { x: p.x, y: cornerY(p.x) + lowerAt(p.x) + gap * (1 - 0.35 * smile) - arch(p.x) * 0.85 }
  }

  // width: every stroke stretches about the eye's centre
  const widen = (p: Point): Point => ({ x: cx + (p.x - cx) * width, y: p.y })
  const draw = (stroke: typeof fold, move: (p: Point) => Point, weight = 1) =>
    strokePolygon(
      stroke,
      stroke.center.map((p) => widen(move(p))),
      () => weight
    )

  // A shut eye is ONE line, as drawn eyes close: the lower contour thins away
  // into the upper one as the lids meet, instead of doubling it.
  const lowerWeight = clamp((open - 0.08) / 0.4)
  const polys: Point[][] = [
    draw(fold, moveFold),
    draw(upper, moveUpper),
    ...(lowerWeight > 0.02 ? [draw(lower, moveLower, lowerWeight)] : []),
    draw(lid, moveLid)
  ]
  let top = 0
  for (const p of polys[0]!) top = Math.min(top, p.y - SOL_EYE_CENTER.y)

  // The pupil: the flag's disc, looking around inside the almond and cut by the
  // lids, sampled as a circle whose points are held between the two contours.
  if (open > 0.06) {
    const lookX = clamp(cfg.lookX, -1, 1) * side
    const lookY = clamp(cfg.lookY, -1, 1)
    const r = FLAG_PUPIL.r * clamp(cfg.pupil, 0.4, 1.5) * clamp(0.55 + 0.45 * open, 0, 1.15)
    const px = FLAG_PUPIL.x + lookX * Math.max(0, halfW - r - 2.2)
    const py = FLAG_PUPIL.y + lookY * 2.4 + heavy * 1.2 - smile * 0.8
    const disc: Point[] = []
    const M = 40
    for (let j = 0; j < M; j++) {
      const a = (j / M) * Math.PI * 2
      const x = clamp(px + Math.cos(a) * r, INNER.x + 1, OUTER.x - 1)
      // held inside the contours' inner edges (their centrelines, less half their weight)
      const lo = cornerY(x) + upperAt(x) - arch(x) + 0.55
      const hi = cornerY(x) + lowerAt(x) - arch(x) - 0.45
      disc.push(widen({ x, y: clamp(py + Math.sin(a) * r, lo, Math.max(lo, hi)) }))
    }
    polys.push(disc)
  }

  // the flag draws the right eye; the left one is its mirror
  return {
    polys: side === 1 ? polys : polys.map((poly) => poly.map((p) => ({ x: -p.x, y: p.y }))),
    top
  }
}
