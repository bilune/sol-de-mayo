import { EYE_H, EYE_SPLIT, EYE_W, REST_GAZE, type HeadGaze } from './face'
import { BROWS } from './sun'
import { MOUTHS, NEUTRAL_MOUTH, lerpMouth, type MouthCfg } from './mouth'
import { NEUTRAL_SOL_EYE, SOL_EYES, lerpSolEye } from './soleyes'
import { lerp } from './math'
import type { EyeCfg } from './states'

/**
 * The bot's resting expression.
 *
 * The face is only two capsules, so everything comes down to four levers: head
 * orientation, eye spacing, eye proportions, and each eye's own tilt. The last one
 * is what enables anger and sadness: they require MIRRORED tilts (tops converging
 * or diverging), impossible with head roll alone, which tilts both eyes to the
 * same side.
 *
 * Only the idle state carries this expression. The other expressive states
 * (wink, wide eyes, notification) keep their own: that is what we set out to
 * reproduce.
 *
 * The amplitudes are based on bible-strong-avatar-lab, which exposes the same
 * model (head X/Y/Z, width and height per eye, spacing, angle per eye): there,
 * width ranges from 0.8 to 2.7 times neutral, height from 0.3 to 1.5, and angles
 * up to ±80°. We stay within that envelope.
 */
/** Enumerated so the i18n layer checks their translations at compile time. */
export type ExpressionId =
  | 'neutral'
  | 'attentive'
  | 'surprised'
  | 'excited'
  | 'happy'
  | 'hilarious'
  | 'angry'
  | 'sad'
  | 'scared'
  | 'wary'
  | 'confused'
  | 'curious'
  | 'proud'
  | 'shy'
  | 'jaded'
  | 'sleepy'

export interface BotExpression {
  id: ExpressionId
  gaze: HeadGaze
  split: number
  eyes: [EyeCfg, EyeCfg]
  /** Sol de Mayo mouth (`mouth.ts`) */
  mouth?: MouthCfg
}

/** `tilt` in degrees, positive = the top of the capsule leans to the right. */
const eye = (w: number, h: number, tilt = 0, open = 1): EyeCfg => ({ w, h, tilt, open })

/** Both eyes identical, with mirrored tilts if `tilt` is provided. */
const pair = (w: number, h: number, tilt = 0, open = 1): [EyeCfg, EyeCfg] => [
  eye(w, h, tilt, open),
  eye(w, h, -tilt, open)
]

const BASE: BotExpression[] = [
  {
    // the measured pose
    id: 'neutral',
    gaze: { ...REST_GAZE },
    split: EYE_SPLIT,
    eyes: [eye(EYE_W, EYE_H), eye(EYE_W, EYE_H)]
  },
  {
    id: 'attentive',
    gaze: { yaw: 4, pitch: 5, roll: -4 },
    split: 16,
    eyes: pair(0.21, 0.44)
  },
  {
    id: 'surprised',
    gaze: { yaw: 3, pitch: -3, roll: 0 },
    split: 19,
    eyes: pair(0.45, 0.47)
  },
  {
    id: 'excited',
    gaze: { yaw: 6, pitch: -14, roll: 0 },
    split: 19.5,
    eyes: pair(0.4, 0.56, -10)
  },
  {
    // eyes squinted into arcs: the tops converge slightly
    id: 'happy',
    gaze: { yaw: 5, pitch: 9, roll: 0 },
    split: 17,
    eyes: pair(0.27, 0.17, 14)
  },
  {
    id: 'hilarious',
    gaze: { yaw: 4, pitch: 14, roll: 0 },
    split: 18,
    eyes: pair(0.34, 0.13, 20)
  },
  {
    // eye tops converging strongly toward the center + narrowed eyes
    id: 'angry',
    gaze: { yaw: 3, pitch: 7, roll: 0 },
    split: 17,
    eyes: pair(0.34, 0.15, 30)
  },
  {
    // the opposite: the tops diverge, and the gaze drops
    id: 'sad',
    gaze: { yaw: 3, pitch: -13, roll: 0 },
    split: 16,
    eyes: pair(0.22, 0.4, -28)
  },
  {
    id: 'scared',
    gaze: { yaw: 2, pitch: -20, roll: 0 },
    split: 20.5,
    eyes: pair(0.4, 0.6)
  },
  {
    // one eye clearly more closed than the other
    id: 'wary',
    gaze: { yaw: 12, pitch: 6, roll: -6 },
    split: 16,
    eyes: [eye(0.21, 0.4), eye(0.22, 0.15)]
  },
  {
    // asymmetric on both axes: mismatched sizes AND tilts.
    // The squinted eye is deliberately flat (ratio 1.6): at a ratio close to 1 it
    // would be round, and its tilt would not show.
    id: 'confused',
    gaze: { yaw: -14, pitch: 3, roll: 8 },
    split: 16.5,
    eyes: [eye(0.2, 0.44, -18), eye(0.28, 0.17, 14)]
  },
  {
    // the head tilts: roll is what carries the curiosity
    id: 'curious',
    gaze: { yaw: 16, pitch: -9, roll: -15 },
    split: 16.5,
    eyes: [eye(0.24, 0.46, -8), eye(0.2, 0.38, -8)]
  },
  {
    id: 'proud',
    gaze: { yaw: 5, pitch: 17, roll: 0 },
    split: 17,
    eyes: pair(0.3, 0.15, 18)
  },
  {
    id: 'shy',
    gaze: { yaw: -19, pitch: -14, roll: -7 },
    split: 14,
    eyes: pair(0.17, 0.3)
  },
  {
    // horizontal slits and a gaze drifting to the side
    id: 'jaded',
    gaze: { yaw: -22, pitch: 2, roll: 0 },
    split: 16,
    eyes: pair(0.3, 0.12)
  },
  {
    // half-drooping eyelids: this goes through `open`, i.e. the on-screen vertical
    // squash, the same mechanism as blinking
    id: 'sleepy',
    gaze: { yaw: 6, pitch: -9, roll: -3 },
    split: 16,
    eyes: pair(0.2, 0.42, 0, 0.42)
  }
]

/** The expressions, with the Sol de Mayo eyebrows (`sun.ts`) and mouth (`mouth.ts`). */
export const EXPRESSIONS: BotExpression[] = BASE.map((e) => {
  const [left, right] = BROWS[e.id]
  return {
    ...e,
    mouth: MOUTHS[e.id],
    eyes: [
      { ...e.eyes[0], browLift: left.lift, browTilt: left.tilt, sol: SOL_EYES[e.id][0] },
      { ...e.eyes[1], browLift: right.lift, browTilt: right.tilt, sol: SOL_EYES[e.id][1] }
    ]
  }
})

export const EXPRESSION_BY_ID = new Map<string, BotExpression>(EXPRESSIONS.map((e) => [e.id, e]))
export const DEFAULT_EXPRESSION = 'neutral'

const lerpEyeCfg = (a: EyeCfg, b: EyeCfg, t: number): EyeCfg => ({
  w: lerp(a.w, b.w, t),
  h: lerp(a.h, b.h, t),
  tilt: lerp(a.tilt ?? 0, b.tilt ?? 0, t),
  open: lerp(a.open, b.open, t),
  browLift: lerp(a.browLift ?? 0, b.browLift ?? 0, t),
  browTilt: lerp(a.browTilt ?? 0, b.browTilt ?? 0, t),
  sol: lerpSolEye(a.sol ?? NEUTRAL_SOL_EYE, b.sol ?? NEUTRAL_SOL_EYE, t)
})

/** Interpolates two expressions: the change happens as a glide. */
export function blendExpression(a: BotExpression, b: BotExpression, t: number): BotExpression {
  return {
    id: b.id,
    gaze: {
      yaw: lerp(a.gaze.yaw, b.gaze.yaw, t),
      pitch: lerp(a.gaze.pitch, b.gaze.pitch, t),
      roll: lerp(a.gaze.roll, b.gaze.roll, t)
    },
    split: lerp(a.split, b.split, t),
    eyes: [lerpEyeCfg(a.eyes[0], b.eyes[0], t), lerpEyeCfg(a.eyes[1], b.eyes[1], t)],
    mouth: lerpMouth(a.mouth ?? NEUTRAL_MOUTH, b.mouth ?? NEUTRAL_MOUTH, t)
  }
}
