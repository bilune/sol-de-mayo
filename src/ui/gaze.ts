import type { Look } from '@/bot/engine'
import type { ExpressionId } from '@/bot/expressions'
import { clamp, easings } from '@/bot/math'

/**
 * Where the bot looks when it follows the cursor. Pure, like `src/ui/timeline.ts`:
 * the pointer position comes in as already normalized coordinates, so the rule is
 * testable without a DOM — and it needs to be, because two signs are easy to get
 * wrong here.
 */

/**
 * Head orientation angles in degrees. CHOSEN, not measured: the measured
 * animation has no cursor tracking at all. Wide enough to stand out from the resting drift
 * (±7deg of yaw, ±5.5 of pitch), restrained enough that no eye goes behind the
 * sphere's limb.
 */
export const YAW_MAX = 16
export const PITCH_MAX = 13

/**
 * Height at which the gaze holds, cursor at the center. CHOSEN: slightly above the
 * equator, which gives an attentive bot rather than an absent one.
 *
 * It is an ABSOLUTE value, and that is the whole point: in relative terms, the eye
 * height followed that of each expression, and since "neutral" looks at +28.6deg
 * while the moods are between -9 and +9, the eyes dropped abruptly at the first
 * mood change.
 */
export const PITCH = 10

/**
 * Direction the head settles in on the settings view: the bot stops looking up and
 * to the right (its resting pose) to look LEFT, toward the panel.
 *
 * This is not a mirror of the image: the eyes really go around the sphere, so they
 * keep their `\\` tilt and their depth compression. Flipping the image would have
 * laid them down as `//`.
 */
export const TURN = 26

/**
 * Full turn traveled ON THE WAY: the eyes do not slide across the face, they go
 * around the ball before arriving.
 *
 * It comes for free because the eyes live on a sphere: past 90deg of yaw they
 * cross the limb, the engine removes them from the image, then they reappear on
 * the other side. The swirl is therefore not an effect laid on top, it is the same
 * orthographic projection pushed one full turn.
 *
 * And above all: it LANDS EXACTLY by construction, `-360deg` being the same angle
 * as `0`. That is what sets it apart from a gaze pose written into a state, which
 * leaves the eyes wherever its curve ends.
 */
export const SPIN = 360

/**
 * Duration of the turn. A bit shorter than the entry block (`swirl`): the eyes
 * must be settled on the left before the rings fade out.
 */
export const TURN_TIME = 1.1

/**
 * Moods the bot goes through while it follows the cursor.
 *
 * All of them have ZERO ROLL, and that is the selection criterion. Yaw and pitch
 * are neutralized by the tracking (they are absolute), but not roll — it tilts the
 * head, so it moves the eyes vertically, and a mood at -15deg followed by one at
 * +8 makes them jump. What remains to tell the moods apart is the SHAPE of the
 * eyes: round, squinting, wide open, flattened. That is more than enough, and it
 * is what reads.
 *
 * So this is not a list of preferences: adding "curious" (roll -15deg) to it would
 * bring the jump back.
 */
export const MOODS: readonly ExpressionId[] = [
  'surprised',
  'happy',
  'hilarious',
  'excited',
  'proud',
  'jaded'
]

/* ------------------------------------------------------- arrival gazes */

/**
 * A SCRIPTED gaze: evaluated on every frame with the time elapsed since the start
 * of the arrival, in seconds. The script therefore carries its own clock and can
 * chain several movements — the component only evaluates it and has no duration
 * to know about.
 *
 * RULE, and it is what makes a script maintenance-free: it must END at `mix: 0`,
 * where the state's pose is in sole command. There is then never anything to
 * release, and that release — which would show up as a last slide of the eyes,
 * right when everything should be settled — does not exist.
 *
 * The type stays general even though there is only one script today: four were
 * written and compared side by side before keeping one, and this shape is what
 * made it possible to try them without touching the engine.
 */
export type GazeScript = (t: number) => Look

/**
 * "The turn": the ball looks like it spins on itself.
 *
 * `mix` stays at ZERO from start to finish: no direction is imposed, only `spin`
 * fades, which moves the eyes BEHIND the ball before bringing them back exactly
 * where the chosen expression puts them.
 *
 * Ease-in-OUT and not the exponential ease-out used in the rest of the project:
 * this is not a value settling, it is an object turning. With ease-out, two thirds
 * of the turn were swallowed in 0.3 s — a jolt, not a rotation.
 *
 * It is BRISK as it crosses the limb — 20 px between two frames on a ball of
 * radius 100 — and that is not a tuning defect: near the edge, a small angle
 * becomes a large on-screen displacement, and the eye disappears then reappears on
 * the other side. Slowing down changes nothing, the trajectory is what causes it,
 * and that is precisely what makes the effect. Do not try to soften it.
 *
 * Essential corollary: this turn only plays on a CIRCLE. The eyes are stuck back
 * onto the actual outline (`radiusAtAngle`), so on a non-circular shape they
 * follow the profile while turning and hop. See `shape` in `App.tsx`.
 */
export const TOUR_TIME = 1.5

export const turnLook: GazeScript = (t) => ({
  yaw: 0,
  pitch: 0,
  mix: 0,
  spin: SPIN * (1 - easings.easeInOutCubic(clamp(t / TOUR_TIME))),
  wander: 1
})

/**
 * "The sunrise": the Sol de Mayo's arrival, on the anthem's opening chords (see
 * `SUNRISE` in `./intro`). It faces you the whole way, head level: a sun that
 * looked up would tilt its 3D corona backwards. Then the expression's own pose
 * takes over, `mix: 0`, as every script must end.
 */
export const SUNRISE_TIME = 4.6

/** [time in seconds, yaw, pitch, mix] */
const SUNRISE_KEYS: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 0, 1], // straight at you, head level
  [3.9, 0, 0, 1],
  [SUNRISE_TIME, 0, 0, 0] // the expression takes over
]

/** Facing you, held: the sun waits hidden like this, so it starts the sunrise already facing. */
export const facingLook: GazeScript = () => ({ yaw: 0, pitch: 0, mix: 1, spin: 0, wander: 1 })

export const sunriseLook: GazeScript = (t) => {
  let i = 1
  while (i < SUNRISE_KEYS.length - 1 && SUNRISE_KEYS[i]![0] < t) i++
  const a = SUNRISE_KEYS[i - 1]!
  const b = SUNRISE_KEYS[i]!
  const k = easings.easeInOutCubic(clamp((t - a[0]) / (b[0] - a[0] || 1)))
  return {
    yaw: a[1] + (b[1] - a[1]) * k,
    pitch: a[2] + (b[2] - a[2]) * k,
    mix: a[3] + (b[3] - a[3]) * k,
    spin: 0,
    wander: 1
  }
}

export interface Aim {
  /** horizontal offset of the pointer from the bot's center, -1 to 1 (right positive) */
  nx: number
  /** vertical offset, -1 to 1, in screen direction (down positive) */
  ny: number
  /** progress of the arrival, 0 to 1 */
  turn: number
  /** false = no known pointer: the head stays turned, but it comes back to life */
  pointer: boolean
}

/**
 * Gaze target.
 *
 * `turn` drives everything: it raises the hold on the pose (`mix`) and fades the
 * traveled turn (`spin`) at the same time. At 0 the state's pose is in sole
 * command; at 1 the head is settled to the left and follows the cursor.
 *
 * Nothing here compensates for the displayed expression: the engine does the
 * blending, because only it knows the pose at time t. Doing it here would require
 * reading the expression's TARGET yaw while the engine is still morphing — and the
 * eyes jumped on every mood change.
 */
export function lookTarget({ nx, ny, turn, pointer }: Aim): Look {
  return {
    yaw: -TURN + nx * YAW_MAX,
    // positive pitch = looking up, whereas screen y goes down
    pitch: PITCH - ny * PITCH_MAX,
    mix: turn,
    spin: SPIN * (1 - turn),
    // Without a pointer the head stays turned toward the panel, but we give it
    // back its drift: otherwise the bot stares at a dead point, and arriving via
    // keyboard or touch gave a completely still avatar.
    wander: pointer ? 0 : 1
  }
}
