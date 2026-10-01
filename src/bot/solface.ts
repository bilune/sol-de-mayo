import { clamp } from './math'
import { mouthPaths, NEUTRAL_MOUTH } from './mouth'
import { samplePath } from './flagpath'
import type { Point } from './shape'
import { NEUTRAL_SOL_EYE, SOL_EYE_CENTER, solEyePaths } from './soleyes'
import type { EyeCfg, Pose } from './states'
import {
  FLAG_BROW,
  FLAG_BROW_NOSE,
  FLAG_CHIN,
  FLAG_NOSE,
  HIDDEN_FEATURES,
  SHOW_NOSE,
  SUN_EYES
} from './sun'

/**
 * The whole Sol de Mayo face for one frame, in FLAG units (face radius 65,
 * y down), before it is wrapped onto the sphere by the engine.
 *
 * Every part is a set of polygons drawn from the flag's own strokes, deformed by
 * the expression. Working in one shared space is what lets parts JOIN: the brow
 * and the side of the nose are one stroke on the flag, and here they stay one
 * stroke, whatever the brow does.
 */

export interface FacePart {
  id: string
  polys: Point[][]
  /** where the part sits, flag units: its depth decides its fade at the sphere's edge */
  anchor: Point
}

/** Brow pivot, flag units: the middle of the right brow. */
const BROW_PIVOT = { x: 22, y: -14 }

/**
 * Where the brow's pose stops and the nose begins, along the stroke that runs
 * down between the eyes: at the brow's inner end the stroke moves with the brow,
 * at the nostril it stays put, and in between it bends smoothly, like skin.
 */
const BRIDGE_TOP = -17
const BRIDGE_FOOT = 9.5
/** Points of the stroke right of this belong to the brow itself. */
const BROW_BODY_X = 9

const smoothstep = (t: number) => {
  const u = clamp(t)
  return u * u * (3 - 2 * u)
}

const mirror = (poly: Point[]): Point[] => poly.map((p) => ({ x: -p.x, y: p.y }))
const shift = (poly: Point[], dy: number): Point[] => poly.map((p) => ({ x: p.x, y: p.y + dy }))

const BROW_NOSE_POLYS = samplePath(FLAG_BROW_NOSE)
const BROW_POLYS = samplePath(FLAG_BROW)
const NOSE_POLYS = samplePath(FLAG_NOSE)
const CHIN_POLYS = samplePath(FLAG_CHIN)

/**
 * The right brow, lifted by `lift` and turned by `tiltDeg` (positive raises the
 * inner end) about its middle, flag units. With the nose shown, the stroke
 * running down to the nostril follows the brow at its top and the nose at its
 * foot, so the two stay one line.
 */
function browPolys(lift: number, tiltDeg: number, withNose: boolean): Point[][] {
  // SVG turns are clockwise with y down: a positive turn lifts the inner (left) end
  const a = (tiltDeg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const move = (p: Point): Point => {
    const dx = p.x - BROW_PIVOT.x
    const dy = p.y - BROW_PIVOT.y
    return { x: BROW_PIVOT.x + dx * cos - dy * sin, y: BROW_PIVOT.y + dx * sin + dy * cos - lift }
  }
  const weight = (p: Point) =>
    p.x >= BROW_BODY_X ? 1 : smoothstep((BRIDGE_FOOT - p.y) / (BRIDGE_FOOT - BRIDGE_TOP))
  const source = withNose ? BROW_NOSE_POLYS : BROW_POLYS
  return source.map((poly) =>
    poly.map((p) => {
      const w = withNose ? weight(p) : 1
      const m = move(p)
      return { x: p.x + (m.x - p.x) * w, y: p.y + (m.y - p.y) * w }
    })
  )
}

export interface FaceInput {
  pose: Pose
  /** 1 = eyes open, 0 = shut: the engine's blink */
  blink: number
  /**
   * Extra lift of each brow, flag units, [screen-left, screen-right]: what keeps
   * them clear of the bot's capsule eyes when the sun wears those.
   */
  capsuleClearance: [number, number]
  /** sphere units -> flag units, for the brow poses stored in sphere units */
  perFlagUnit: number
}

/** The top of the flag eye's fold at rest, relative to its centre: the brows sit above it. */
const SOL_EYE_TOP = solEyePaths(NEUTRAL_SOL_EYE, 1, 1).top

export function solFace({ pose, blink, capsuleClearance, perFlagUnit }: FaceInput): FacePart[] {
  const parts: FacePart[] = []
  const flagEyes = SUN_EYES === 'flag'

  const eyes = flagEyes
    ? ([
        solEyePaths(pose.eyes[0].sol ?? NEUTRAL_SOL_EYE, -1, blink),
        solEyePaths(pose.eyes[1].sol ?? NEUTRAL_SOL_EYE, 1, blink)
      ] as const)
    : null
  if (eyes) {
    parts.push({
      id: 'eyeLeft',
      polys: eyes[0].polys,
      anchor: { x: -SOL_EYE_CENTER.x, y: SOL_EYE_CENTER.y }
    })
    parts.push({ id: 'eyeRight', polys: eyes[1].polys, anchor: SOL_EYE_CENTER })
  }

  // Brows: each keeps clear of its eye (the flag eye's fold, or the capsule),
  // then takes the expression's own lift and tilt.
  const withNose = SHOW_NOSE && !HIDDEN_FEATURES.has('nose')
  for (const side of [0, 1] as const) {
    const eye: EyeCfg = pose.eyes[side]
    const clearance = eyes ? Math.max(0, SOL_EYE_TOP - eyes[side].top) : capsuleClearance[side]
    const lift = clearance + (eye.browLift ?? 0) / perFlagUnit
    const polys = browPolys(lift, eye.browTilt ?? 0, withNose)
    parts.push({
      id: side === 0 ? 'browLeft' : 'browRight',
      polys: side === 0 ? polys.map(mirror) : polys,
      anchor: { x: side === 0 ? -BROW_PIVOT.x : BROW_PIVOT.x, y: BROW_PIVOT.y }
    })
  }

  if (withNose) {
    parts.push({
      id: 'nose',
      polys: [...NOSE_POLYS, ...NOSE_POLYS.map(mirror)],
      anchor: { x: 0, y: 13 }
    })
  }

  const mouth = mouthPaths(pose.mouth ?? NEUTRAL_MOUTH)
  if (!HIDDEN_FEATURES.has('lips')) {
    parts.push({ id: 'lips', polys: mouth.polys, anchor: { x: 0, y: 30 } })
  }
  if (!HIDDEN_FEATURES.has('chin')) {
    // the chin follows the jaw when the mouth opens
    const chin = [...CHIN_POLYS, ...CHIN_POLYS.map(mirror)].map((p) => shift(p, mouth.drop))
    parts.push({ id: 'chin', polys: chin, anchor: { x: 0, y: 46 + mouth.drop } })
  }

  return parts
}
