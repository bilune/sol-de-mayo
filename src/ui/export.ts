/**
 * Framing and naming of exported images. Everything is pure: no DOM, so testable
 * in a `node` environment like the rest of `src/ui/`. Rasterization lives in
 * `capture.ts`, because it needs a canvas.
 */

import { HALF_VIEWBOX, RADIUS } from '@/bot/coords'
import { SHAPES } from '@/bot/skins'

/**
 * Margin around the widest shape. Eight percent: that is what lets the circular
 * crop of a profile picture (Discord, Slack, GitHub) avoid biting into the
 * silhouette.
 */
const MARGIN = 1.08

/**
 * Radius of the most spread-out shape, in ball-radius units. Computed rather than
 * hardcoded: adding a wider shape moves the frame by itself instead of getting
 * cropped.
 */
export const MAX_RADIUS = Math.max(...SHAPES.map((shape) => Math.max(...shape.radii)))

/**
 * Half-side of the export frame, in viewBox units.
 *
 * It is TIGHTER than the screen viewBox (158), and on purpose: the screen margin
 * houses the rings of the animated states, which do not exist at rest. Keeping it
 * would make an export that is 63 % empty, and a tiny ball in a profile-picture
 * crop.
 *
 * A single frame for all eight shapes, not a per-shape reframing: the radii in
 * `skins.ts` are normalized so that "all shapes weigh the same to the eye", and
 * reframing them separately would bring each one back to the same size and break
 * that tuning.
 */
export const HALF_FRAME = Math.ceil(RADIUS * MAX_RADIUS * MARGIN)

/** viewBox of the exported document, centered on the ball. */
export function viewBoxExport(half = HALF_FRAME) {
  return `${-half} ${-half} ${half * 2} ${half * 2}`
}

/**
 * Half-side of the SCREEN viewBox.
 *
 * This is the one needed to export a CYCLE, not the tight frame: the margin the
 * tight frame removes is precisely the one that houses the rings of the animated
 * states. They reach 1.4 times the ball's radius, i.e. 140 — so beyond the 125 of
 * the tight frame, which would crop them. A test locks it in.
 */
export const HALF_SCREEN = HALF_VIEWBOX

export type ActionId = 'png' | 'svg' | 'animated' | 'gif' | 'copy' | 'copySvg'

/** What we do with the image once produced. */
export type ExportMode = 'download' | 'animated' | 'gif' | 'copyImage' | 'copyText'

export interface ActionExport {
  id: ActionId
  mode: ExportMode
  /** Side of the image in pixels. */
  size: number
  extension: 'png' | 'svg' | 'gif'
  /**
   * Appended to the file name. The animation is an SVG too: without this suffix it
   * would overwrite the still export in the downloads folder.
   */
  suffix?: string
}

/**
 * KEYframes per second — not a playback rate.
 *
 * The exported animation is an SVG: the browser interpolates between the keys, so
 * the motion is smooth at the screen's refresh rate whatever their number. That is
 * the whole difference with a bitmap flip book, where a 20-frames-per-second
 * animation stutters because the blink lasts only 0.18 s (`BLINK_DUR`, face.ts)
 * and so has only three or four frames to play out.
 *
 * 30 per second because it costs almost nothing — a key is a text matrix — and it
 * faithfully follows the blink curve, which closes fast and reopens more slowly.
 */
export const ANIM_KEYS_PER_SEC = 30

/**
 * Captured duration. The first blink lands at 1.4 s, then the next ones every
 * 1.9 to 4.6 s (`BLINKS`, face.ts): three seconds therefore always contain at
 * least one. Any shorter and we would often export a ball that merely drifts.
 *
 * The loop, for its part, is seamless despite a non-periodic drift: the animation
 * is played back and forth (`animation-direction: alternate`), so it loops back
 * exactly onto itself. See `animatedSvg`.
 */
export const ANIM_SECONDS = 3

export const ANIM_FRAMES = ANIM_KEYS_PER_SEC * ANIM_SECONDS
export const ANIM_STEP = 1 / ANIM_KEYS_PER_SEC

/**
 * The GIF, on the other hand, is a true flip book: its frame rate IS its
 * smoothness, and nothing interpolates it. Twenty frames per second is its useful
 * ceiling here — its delay is counted in hundredths of a second, so 20 (5
 * hundredths) lands exactly where 30 would not, and every added frame adds weight.
 */
export const GIF_FPS = 20
export const GIF_FRAMES = GIF_FPS * ANIM_SECONDS
export const GIF_STEP = 1 / GIF_FPS

/**
 * The GIF is exported LARGER than its display size, on purpose. Its transparency
 * is one bit: the ball's anti-aliased edge is cut sharp and comes out as a
 * staircase. A Discord avatar is displayed between 40 and 128 px, so the browser's
 * downscaling smooths that edge again — which a file exported at the final size
 * would not get.
 */
export const GIF_SIZE = 320

/* -------------------------------------------------------- cycle export */

/**
 * Export formats for a CYCLE. No animated SVG here, and that is measured: over a
 * cycle the body morphs on every frame, and its path weighs 2.5 kB — six hundred
 * frames would make 1.5 MB, not counting the arcs. Animated SVG only holds up for
 * the resting avatar, where the silhouette is still.
 */
export type CycleFormat = 'mp4' | 'gif'

export const CYCLE_FORMATS: CycleFormat[] = ['mp4', 'gif']
export const DEFAULT_CYCLE_FORMAT: CycleFormat = 'mp4'

/**
 * Frame rate and size, SEPARATE per format — sharing them was a mistake: the GIF
 * is constrained by its weight, the video not at all.
 *
 * GIF: 20 frames per second and 320 px. Its delay is counted in hundredths of a
 * second, and every added frame weighs in full in the file.
 *
 * MP4: 30 frames per second and 1024 px. A video compresses motion instead of
 * storing each frame, so raising resolution and frame rate costs little —
 * measured on a clean disk, going from 320 to 1024 and from 20 to 30 frames only
 * raises the bitrate from 93 to 342 kbps. At 320 px and 93 kbps, the export had
 * the definition of a thumbnail: that is what gave it a GIF look.
 */
export const CYCLE_FPS = { gif: 20, mp4: 30 } as const
export const CYCLE_SIZE = { gif: 320, mp4: 1024 } as const

export const cycleStep = (format: CycleFormat) => 1 / CYCLE_FPS[format]

/** How many frames for a cycle of `duration` seconds. */
export const cycleImages = (duration: number, format: CycleFormat) =>
  Math.max(1, Math.round(duration * CYCLE_FPS[format]))

/**
 * Video is ALWAYS opaque: `VideoEncoder` refuses `alpha: 'keep'`, in H.264 as in
 * VP9. The GIF, for its part, keeps the background choice.
 */
export const cycleSupportsTransparency = (format: CycleFormat) => format === 'gif'

/**
 * GIF background, chosen by the user.
 *
 * It is the only export where the question arises: the others have 8 bits of
 * alpha and a perfectly smooth edge on a transparent background. The GIF has only
 * one, so its transparent edge is hard and shows — the solid background is the
 * way to smooth it, at the cost of a color baked into the image.
 *
 * `white` by default: it is the one that looks clean everywhere, whereas
 * transparent shows its staircase on a colored background.
 */
export type GifBackground = 'white' | 'transparent'

export const GIF_BACKGROUNDS: GifBackground[] = ['white', 'transparent']
export const DEFAULT_GIF_BACKGROUND: GifBackground = 'white'

/** Pure white, not the site's `--paper`: "white background" must be white. */
export const WHITE = '#ffffff'

/** The color to paint under the ball, or `null` to paint nothing. */
export const backgroundColor = (background: GifBackground) => (background === 'white' ? WHITE : null)

/**
 * ONE single PNG size, on purpose: offering 1024 and 2048 forced the user to
 * settle a question that is not theirs. 1024 covers every profile-picture spec
 * (Discord 128, X 400, GitHub 500, Slack 512) while downscaling cleanly, and a
 * flat vector fill at that size weighs only a few kB. Whoever wants bigger takes
 * the SVG, which has no size.
 *
 * No STILL GIF: 256 colors and a 1-bit transparency, so a staircase edge where
 * the PNG has 8 bits of alpha. The GIF exists here only ANIMATED, and only because
 * Discord or Slack animated avatars refuse SVG.
 *
 * The catalog only carries **ids**: labels are resolved by `t('export.<id>')`,
 * and the literal union above makes the compiler check that each one has its
 * translation in all three languages.
 */
export const ACTIONS: ActionExport[] = [
  { id: 'png', mode: 'download', size: 1024, extension: 'png' },
  { id: 'svg', mode: 'download', size: HALF_FRAME * 2, extension: 'svg' },
  { id: 'animated', mode: 'animated', size: HALF_FRAME * 2, extension: 'svg', suffix: 'animated' },
  { id: 'gif', mode: 'gif', size: GIF_SIZE, extension: 'gif' },
  { id: 'copy', mode: 'copyImage', size: 1024, extension: 'png' },
  { id: 'copySvg', mode: 'copyText', size: HALF_FRAME * 2, extension: 'svg' }
]

export const ACTION_BY_ID = new Map<string, ActionExport>(ACTIONS.map((a) => [a.id, a]))

/** What the main button does; the others are in the menu. */
export const DEFAULT_ACTION: ActionId = 'png'

/**
 * State of the export bar. A download is not necessarily visible — depending on
 * the browser it lands in a folder without showing anything — hence this
 * confirmation: without it, the user clicks again thinking nothing happened.
 */
export type ExportState = 'ready' | 'busy' | 'exported' | 'copy' | 'error'

/**
 * Strips XML comments. The bot's SVG carries long ones, which explain the mask to
 * whoever reads the component — they have no business in a file delivered to the
 * user.
 */
export function withoutComments(markup: string) {
  return markup.replace(/<!--[\s\S]*?-->/g, '')
}

/**
 * `sol-de-mayo-droplet-neutral-ink.png`.
 *
 * Built on the **ids** and not on the translated labels: the file name must not
 * change with the interface language.
 *
 * The ids are filtered even though they come from literal unions, because
 * `App.tsx` reads them back from `localStorage` without validating them: a
 * tampered value must not be able to compose the downloaded file's name.
 */
export function fileName(
  shape: string,
  expression: string,
  color: string,
  extension: string,
  suffix = ''
) {
  const clean = (v: string) =>
    v
      .toLowerCase()
      // Accented letters become bare letters rather than being erased: a montage
      // name like "Naïve café" must stay readable in the downloads folder,
      // not become "navecaf".
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
  const parts = [clean(shape), clean(expression), clean(color), clean(suffix)].filter(
    Boolean
  )
  return `sol-de-mayo${parts.map((m) => `-${m}`).join('')}.${extension}`
}

/**
 * Can the browser encode a video here?
 *
 * This guard lives HERE and not in `video.ts`, and it is not a matter of tidiness:
 * the slightest static import of `video.ts` pulls mediabunny into the entry chunk.
 * `video.ts` only loads the lib inside `toMp4`, but Rollup can no longer split
 * out a module that is both statically and dynamically imported — it flags it with
 * `INEFFECTIVE_DYNAMIC_IMPORT` — and the 43 kB gzip go back into the first load.
 * It happened once, for this two-line function.
 */
export function videoPossible() {
  return typeof VideoEncoder !== 'undefined'
}

/* ------------------------------------------------------------- export abort */

/**
 * Error for an export aborted by the user.
 *
 * A class and not a boolean return value: the abort must bubble up the whole
 * encoding stack, whose `finally` blocks release the video encoder and the
 * offscreen player along the way. The caller recognizes it so as NOT to display an
 * error — we do not tell someone they got what they asked for.
 *
 * It lives HERE and not in `video.ts` for the same reason as `videoPossible` just
 * above: `capture.ts` needs it as a static import, and a static import of
 * `video.ts` pulls mediabunny into the entry chunk.
 */
export class Abandon extends Error {
  constructor() {
    super('export aborted')
    this.name = 'Abandon'
  }
}

/** Throws if the user requested an abort. */
export function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new Abandon()
}
