import type { ExpressionId } from './expressions'
import { clamp, lerp } from './math'
import type { Point } from './shape'

/**
 * The Sol de Mayo's mouth, alive.
 *
 * The flag's mouth is line art: the top contour of the upper lip (with its
 * cupid's bow), the parting line, and the bottom contour of the lower lip, all
 * as brush strokes that swell in the middle and taper to nothing at the corners.
 * This module draws the SAME three strokes from a handful of parameters, so a
 * resting mouth reads as the flag's while every expression gets its own: a
 * smile lifts the corners and bends the parting line, an open mouth splits the
 * parting line into a dark opening, a pout thickens the lower lip.
 *
 * Every parameter is a number and every mouth has the same number of points, so
 * two mouths blend by plain interpolation: the mouth glides from one expression
 * to the next with the eyes and brows, never jumps.
 *
 * All geometry is in flag units (face radius 65, y down), centred on the flag's
 * mouth at (0, 30). Design values, tuned by eye.
 */

export interface MouthCfg {
  /** -1 = corners well down (grief), 0 = level, 1 = broad smile */
  smile: number
  /** 0 = closed, 1 = wide open */
  open: number
  /** width relative to the flag's mouth */
  width: number
  /** -1..1: the right corner rises and the left drops (a smirk), or the reverse */
  skew: number
  /** 0..1: the lower lip pushes out and weighs down (a pout) */
  pout: number
  /** 0..1: the opening rounds into an "o" and the mouth narrows */
  round: number
}

export const NEUTRAL_MOUTH: MouthCfg = { smile: 0, open: 0, width: 1, skew: 0, pout: 0, round: 0 }

const m = (
  smile: number,
  open: number,
  width: number,
  skew = 0,
  pout = 0,
  round = 0
): MouthCfg => ({
  smile,
  open,
  width,
  skew,
  pout,
  round
})

/** One mouth per expression. */
export const MOUTHS: Record<ExpressionId, MouthCfg> = {
  neutral: NEUTRAL_MOUTH,
  attentive: m(0.12, 0, 0.94),
  surprised: m(0, 0.62, 0.62, 0, 0, 1),
  excited: m(0.85, 0.7, 1.12, 0, 0, 0.15),
  happy: m(0.8, 0, 1.08),
  hilarious: m(1, 1, 1.18, 0, 0.15, 0.1),
  angry: m(-0.58, 0.17, 0.96),
  sad: m(-0.85, 0, 0.88, 0, 0.85),
  scared: m(-0.35, 0.82, 0.74, 0, 0, 0.72),
  wary: m(0.05, 0, 0.84, 0.75),
  confused: m(-0.2, 0.12, 0.8, -0.8, 0, 0.3),
  curious: m(0.12, 0.34, 0.56, 0.3, 0, 0.9),
  proud: m(0.45, 0, 1.04, 0.55, 0.2),
  shy: m(0.42, 0, 0.6),
  jaded: m(-0.08, 0, 1, 0.18),
  sleepy: m(-0.12, 0.26, 0.7, 0, 0.3, 0.55)
}

export function lerpMouth(a: MouthCfg, b: MouthCfg, t: number): MouthCfg {
  return {
    smile: lerp(a.smile, b.smile, t),
    open: lerp(a.open, b.open, t),
    width: lerp(a.width, b.width, t),
    skew: lerp(a.skew, b.skew, t),
    pout: lerp(a.pout, b.pout, t),
    round: lerp(a.round, b.round, t)
  }
}

/** Where the flag's mouth sits, flag units: the anchor it is pinned to the sphere by. */
export const MOUTH_ANCHOR = { x: 0, y: 30 }

/** Samples along the mouth, corner to corner. */
const N = 28
/** The flag mouth's half-width. */
const HALF_WIDTH = 16.5
/** How high the corners climb at full smile, and how far a skew tilts them. */
const CORNER_LIFT = 7
const SKEW_LIFT = 4.5
/** Tallest opening, at `open` 1. */
const GAP = 14
/** Lip heights at the middle (the flag's: upper ~7.5 at the bow's peaks, lower ~6.5). */
const UPPER_LIP = 7.4
const LOWER_LIP = 6.2

/** 0 at both corners, 1 in the middle; `p` < 1 fills out, > 1 sharpens. */
const bell = (t: number, p: number) => Math.pow(Math.max(0, Math.sin(Math.PI * t)), p)

/**
 * A brush stroke along `center`, `half` wide on each side, tapering where `half`
 * does. Normals come from neighbouring samples.
 */
function stroke(center: Point[], half: number[]): Point[] {
  const left: Point[] = []
  const right: Point[] = []
  for (let i = 0; i < center.length; i++) {
    const a = center[Math.max(0, i - 1)]!
    const b = center[Math.min(center.length - 1, i + 1)]!
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const nx = -(b.y - a.y) / len
    const ny = (b.x - a.x) / len
    const h = half[i]!
    const c = center[i]!
    left.push({ x: c.x + nx * h, y: c.y + ny * h })
    right.push({ x: c.x - nx * h, y: c.y - ny * h })
  }
  return [...left, ...right.reverse()]
}

export interface MouthRender {
  /** separate filled shapes, flag units (kept apart so overlaps never punch holes) */
  polys: Point[][]
  /** how far the jaw drops, flag units: the chin follows it */
  drop: number
}

export function mouthPaths(cfg: MouthCfg): MouthRender {
  const open = clamp(cfg.open)
  const round = clamp(cfg.round)
  const pout = clamp(cfg.pout)
  const smile = clamp(cfg.smile, -1, 1)
  const skew = clamp(cfg.skew, -1, 1)

  const cy = MOUTH_ANCHOR.y
  const w = HALF_WIDTH * cfg.width * (1 - 0.42 * round)
  const lift = smile * CORNER_LIFT
  const L = { x: -w, y: cy - lift + skew * SKEW_LIFT }
  const R = { x: w, y: cy - lift - skew * SKEW_LIFT }
  // The parting line is a curve through both corners: a smile sags its middle
  // below them, grief arches it above. A skew slides the low point sideways.
  const C = { x: skew * 3, y: cy + smile * 3.2 }

  const gap = GAP * open
  // an "o" opens fully almost to the corners; a grin opens as a crescent
  const openShape = 0.95 - 0.55 * round

  const base: Point[] = []
  const upperInner: Point[] = []
  const lowerInner: Point[] = []
  const upperTop: Point[] = []
  const lowerBottom: Point[] = []
  const lineHalf: number[] = []
  const topHalf: number[] = []
  const bottomHalf: number[] = []

  for (let i = 0; i < N; i++) {
    const t = i / (N - 1)
    const u = 1 - t
    const x = u * u * L.x + 2 * u * t * C.x + t * t * R.x
    const y = u * u * L.y + 2 * u * t * C.y + t * t * R.y
    base.push({ x, y })

    const o = bell(t, openShape) * gap
    // the upper lip barely moves when the jaw drops: most of the gap is below
    const ui = y - o * 0.3
    const li = y + o * 0.7
    upperInner.push({ x, y: ui })
    lowerInner.push({ x, y: li })

    // cupid's bow: the upper lip dips in the middle, between two peaks
    const bow = 1 - 0.3 * Math.exp(-(((t - 0.5) / 0.075) ** 2))
    const upper = UPPER_LIP * bell(t, 0.6) * bow * (1 - 0.35 * open) * (1 - 0.25 * round)
    upperTop.push({ x, y: ui - upper })

    const lower = (LOWER_LIP + 2.8 * pout) * bell(t, 0.75) * (1 - 0.3 * open)
    lowerBottom.push({ x, y: li + lower + pout * 1.2 * bell(t, 1) })

    lineHalf.push(0.95 * bell(t, 0.4))
    topHalf.push(0.8 * bell(t, 0.5))
    bottomHalf.push((0.95 + 0.45 * pout) * bell(t, 0.45))
  }

  const polys: Point[][] = []

  // The opening: the upper and lower inner edges, never thinner than the
  // parting line, so a closed mouth is the flag's middle stroke.
  const top: Point[] = upperInner.map((p, i) => ({ x: p.x, y: p.y - lineHalf[i]! }))
  const bottom: Point[] = lowerInner.map((p, i) => ({ x: p.x, y: p.y + lineHalf[i]! }))
  polys.push([...top, ...bottom.reverse()])

  polys.push(stroke(upperTop, topHalf))
  polys.push(stroke(lowerBottom, bottomHalf))

  // Creases at the corners, like brackets: they cup a smile and hang off a
  // frown, and fade out on a level mouth.
  const crease = clamp((Math.abs(smile) - 0.18) / 0.6)
  if (crease > 0.02) {
    const dir = Math.sign(smile)
    for (const side of [-1, 1] as const) {
      const corner = side < 0 ? L : R
      const pts: Point[] = []
      const halves: number[] = []
      for (let k = 0; k < 9; k++) {
        const s = k / 8
        const a = (s - 0.5) * Math.PI * 0.9
        pts.push({
          x: corner.x + side * (2.2 + Math.cos(a) * 2.2),
          y: corner.y + Math.sin(a) * 4.2 * dir - dir * 0.6
        })
        halves.push(0.62 * crease * bell(s, 0.6))
      }
      polys.push(stroke(pts, halves))
    }
  }

  return { polys, drop: gap * 0.55 + pout * 1.5 }
}
