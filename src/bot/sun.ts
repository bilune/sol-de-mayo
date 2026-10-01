import type { ExpressionId } from './expressions'

/**
 * "Sol de Mayo" variant: the bot wears the sun's corona from the Argentine flag.
 *
 * The rays are the flag's own drawing, copied path for path from Wikimedia's
 * "Sol de Mayo-Bandera de Argentina.svg" (public domain, `public/sol-de-mayo.svg`).
 * Don't redraw them: they must stay identical to the flag.
 */

/** Master switch. Off, the bot is the plain ball, without corona. */
export const SUN = true

/**
 * Ball radius in viewBox units while the corona is on. The screen viewBox is
 * fixed (half-side 158) and the plain ball (100) leaves no room for rays: on
 * the flag they reach 2.5 times the face's radius, so the ball shrinks instead.
 */
export const SUN_SCALE = 60

export const SUN_COLORS = {
  body: '#fcbf49',
  line: '#843511'
} as const

/** The flag's face radius, in its own units: the rays below are drawn against it. */
export const FLAG_FACE = 65

/** Outline widths, in flag units: 1.5 for the rays, 1 for the face. */
export const FLAG_RAY_LINE = 1.5
export const FLAG_FACE_LINE = 1

/**
 * One straight ray and one wavy ray (with their brown inner strokes), pointing
 * down, in flag units. The flag repeats this pair 16 times, every 22.5 degrees;
 * the wavy one sits 11.5 degrees round from the straight one.
 */
export const FLAG_STRAIGHT = 'M -8,0 L -2,159.5 c 0,0 0,3 2,3 s 2,-3 2,-3 L 8,0'
export const FLAG_STRAIGHT_INNER = 'M -4,0 L 0,109.5 L 4,0'
export const FLAG_WAVY_TURN = 11.5
export const FLAG_WAVY =
  'M -4.5,53.5 C -9.5,75 1.5,89.5 -4,108.5 S -1,140.5 0,148.5 -5,160 -3,161.5 5,158 5.5,147 -1.5,131.25 5,108 1,77 8,56'
export const FLAG_WAVY_INNER = 'M -1,58 C -4,79 6,90.5 0,109 C 8,95 -2,81 3,59'

/** The 16 turns of the pair, in degrees, as the flag's nested `<use>` produce them. */
export const FLAG_TURNS = Array.from({ length: 16 }, (_, i) => i * 22.5)

/** Where the corona is centred, in viewBox units: on the body, wherever it drifts. */
export interface RaysRender {
  x: number
  y: number
  /**
   * The head's frame, in screen space (x right, y down, z toward the viewer):
   * the 3D corona lies in the plane of `right` and `down`, facing `f`, so it
   * turns with the face. The flat SVG corona ignores it.
   */
  right: [number, number, number]
  down: [number, number, number]
  f: [number, number, number]
}

/* ------------------------------------------------------------------- face */

/**
 * The flag's eyebrow and the side of the nose: one stroke on the flag, from the
 * brow's outer tip down between the eyes to the nostril. Copied path for path.
 * The face (`solface.ts`) keeps it whole: the brow moves with the expression and
 * the part running down to the nose stretches to stay joined to it.
 */
export const FLAG_BROW_NOSE =
  'M 41,-14 C 29.5,-24 15,-25.5 7,-18 A 140,50 10 0,0 8.5,8.5 C 8,8.5 7,9 6.5,9.5 A 80,50 10 0,1 4,-19 C 15,-28 30,-29 41,-14'

/**
 * The eyebrow alone, for a face without its nose: the two arcs running down
 * between the eyes are cut, the brow's two edges are the flag's.
 */
export const FLAG_BROW = 'M 41,-14 C 29.5,-24 15,-25.5 7,-18 L 4,-19 C 15,-28 30,-29 41,-14 Z'

/** The flag's nose and chin, RIGHT halves (the face mirrors them). Flag units. */
export const FLAG_NOSE =
  'M 10.5,9 A 3,3 0 1,1 6.5,12 C 6,13 4,16 0,16 h -1 l 1,1.5 C 1,17.5 4,17.5 6,16 A 4.5,4.5 0 1,0 10.5,9'
export const FLAG_CHIN = 'M 9,46 a 9,9 0 0,0 -18,0 a 9.25,9.25 0 0,1 18,0'

/** One eyebrow's pose: see `EyeCfg.browLift` / `browTilt`. */
export interface Brow {
  lift: number
  tilt: number
}

const brow = (lift: number, tilt = 0): Brow => ({ lift, tilt })
const both = (lift: number, tilt = 0): [Brow, Brow] => [brow(lift, tilt), brow(lift, tilt)]

/**
 * Eyebrows per expression, [screen-left eye, screen-right eye]. Design choices,
 * tuned by eye. Eyes bigger than at rest also push their brow up on their own
 * (engine), so these only carry the MEANING: worry lifts the inner end, anger
 * drops it, doubt splits the pair.
 */
export const BROWS: Record<ExpressionId, [Brow, Brow]> = {
  neutral: both(0),
  attentive: both(0.02),
  surprised: both(0.06),
  excited: both(0.04),
  happy: both(0.02),
  hilarious: both(0.03),
  angry: both(-0.03, -14),
  sad: both(0.02, 14),
  scared: both(0.03, 10),
  wary: [brow(0.04), brow(-0.03, -8)],
  confused: [brow(0.05, 6), brow(-0.01, -4)],
  curious: [brow(0.05), brow(0.02)],
  proud: both(-0.01),
  shy: both(0.01, 8),
  jaded: both(-0.03),
  sleepy: both(-0.02, 4)
}

/**
 * Which eyes the sun wears: `'flag'` draws the flag's own eyes, alive
 * (`soleyes.ts`); `'bot'` keeps the bot's capsule eyes, painted brown. Flip to
 * roll back; nothing else changes.
 */
export const SUN_EYES: 'bot' | 'flag' = 'flag'

/** Switches for the flag's lower face. The mouth is the lips and the chin. */
export const SHOW_NOSE = true
export const SHOW_MOUTH = true

/** Features kept in the data but not drawn, from the switches above. */
export const HIDDEN_FEATURES: ReadonlySet<string> = new Set([
  ...(SHOW_NOSE ? [] : ['nose']),
  ...(SHOW_MOUTH ? [] : ['lips', 'chin'])
])

/** The flag's eye centre (right eye), in flag units: what gets pinned to the bot's eye. */
const FLAG_EYE = { x: 22, y: -9 }

/**
 * The bot's eyes are much taller than the flag's: pinned at the flag's own
 * proportions the nose touched them and the mouth read tiny. Tuned by eye.
 */
const FACE_SCALE = 1.3

/**
 * Flag units -> unit-sphere units. Chosen so the flag's eye spacing lands on the
 * bot's (`EYE_SPLIT`), which keeps nose and mouth where they belong relative to
 * the eyes.
 */
export function flagToSphere(eyeSplitDeg: number) {
  const k = (Math.sin((eyeSplitDeg * Math.PI) / 180) / FLAG_EYE.x) * FACE_SCALE
  return {
    k,
    /** a flag point, in head-local sphere coordinates (x right, y down) */
    at: (x: number, y: number) => ({ x: x * k, y: (y - FLAG_EYE.y) * k })
  }
}

export interface FeatureRender {
  id: string
  /** filled shapes, already wrapped onto the sphere: viewBox units */
  paths: string[]
  alpha: number
}
