import { clampDuration, makeBlock, type Block } from '@/bot/cycles'
import { SUNRISE_TIME, sunriseLook } from './gaze'

/**
 * The arrival on the site: the ball appears alone at the center of the page, the
 * eyes make a full turn around it and settle in the middle — it looks like it is
 * spinning on itself — then it glides to its place while the interface appears
 * around it.
 *
 * Pure, like `gaze.ts` and `timeline.ts`: the montage and the trigger rule are
 * decided here and tested without a DOM or a component. `App.tsx` only wires them
 * up, the staging itself being CSS (`.scene--alone`, `.avatar--intro` in
 * `globals.css`).
 */

/**
 * The montage. Two RESTING blocks and nothing else: the whole entrance lives in the
 * gaze script, not in a sequence of states.
 *
 * It is the result of a comparison — four entrances were tried side by side — and
 * the lesson is worth keeping: **any state other than rest brings its own gaze
 * pose, hence a jump of the eyes on the change**. The blink meant to hide it lasts
 * only 0.2 s while the entry fade lasts 0.3: the eyes reopen midway and it reads
 * as a teleport, 15 px between two frames. A wink was indeed tried here, at
 * length; it was dropped for that reason.
 *
 * Both blocks therefore carry the same state, which has three intended
 * consequences: no silhouette morph (the chosen shape is what we see from start to
 * finish), no gaze jump, and since `idle` is the only `baseFace` state, the ball
 * already appears with the expression set by the user.
 *
 * The first block lasts a bit longer than the turn, so that it has time to finish
 * before the ball leaves to take its place.
 */
export const INTRO: Block[] = [
  { state: 'idle', duration: clampDuration('idle', SUNRISE_TIME + 0.3) },
  makeBlock('idle')
]

/**
 * Index of the block from which the ball takes its place and the interface
 * appears. Zero = it is still alone on stage.
 */
export const POSE_AT = 1

/**
 * What the eyes do during the arrival: the Sol de Mayo rising on the anthem
 * (`sunriseLook` in `./gaze`). It doesn't use `turnLook`, which spins the head,
 * and with it the 3D corona.
 */
export const INTRO_GAZE = sunriseLook

/**
 * The sunrise, on the first chords of the Himno Nacional Argentino
 * (`public/anthem-chords.mp3`: the official recording by the Coro Polifónico
 * Nacional and the Banda Militar, public domain, cut to its opening fanfare).
 * The three chords land at these times, measured on the clip's loudness; the
 * CSS keyframes (`sun-rise`, `glow`, `stripe-enter` in `globals.css`)
 * are timed on them.
 */
export const SUNRISE = {
  audio: '/anthem-chords.mp3',
  chords: [0.08, 1.33, 2.6] as const
}

/** What the application knows about the arrival when deciding. */
export interface Arrival {
  /** the URL names a state (`#state=`) */
  named: boolean
  /** the URL requests the board (`#board`) */
  gallery: boolean
  /** we are returning to an already open page: reload, or back/forward */
  reload: boolean
  /** the user asked for less animation */
  calm: boolean
}

/**
 * Does the arrival play? Four refusals, each for a different reason:
 *
 * - `named`: a `#state=` link targets the PLAYER and already describes what it
 *   plays. Imposing a welcome staging on it means not opening what it asks for.
 * - `gallery`: the board is a visual verification tool, it must remain the safe
 *   path that depends on nothing.
 * - `reload`: this is the request itself — an introduction, not a loading
 *   animation. So it plays on every VISIT to the site (typed URL, followed link,
 *   new tab) but never when landing back on a page we already had: reload, back,
 *   forward. Nothing is written to storage — the distinction is the browser's, not
 *   a memory of ours, and that is what prevents a single visit from switching the
 *   arrival off forever.
 * - `calm`: `prefers-reduced-motion` explicitly asks not to play a decorative
 *   animation.
 *
 * `#arrival` short-circuits it all: it is the link used to watch it again.
 */
export function introDue({ named, gallery, reload, calm }: Arrival): boolean {
  return !named && !gallery && !reload && !calm
}
