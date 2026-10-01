/**
 * The coordinate frame of everything the engine renders.
 *
 * `engine.sample()` outputs coordinates in viewBox units, and these two numbers define
 * them: without them, an engine output means nothing.
 *
 * They live here because `src/bot/` is what gets read and consumed from outside: the avatar
 * component is ONE client of the engine, not its definition.
 */

/**
 * Radius of the resting ball, in viewBox units. This is the `scale` the component passes
 * to `BotEngine`.
 *
 * Chosen rather than measured: it is the working unit. Everything else in the folder is
 * expressed as fractions of this radius, which makes the measurements
 * independent of the display size.
 */
export const RADIUS = 100

/**
 * Half-side of the displayed viewBox. The margin beyond the radius houses the rings.
 *
 * This is not a free value: the orbit rings and the comet swoosh reach 1.4 times the
 * radius, i.e. 140. Nothing bounds them at runtime; it is the hand tuning of the `RINGS`
 * and `SWOOSH` arrays (`decor.ts`) that keeps them under 158, and a test locks it in.
 */
export const HALF_VIEWBOX = 158
