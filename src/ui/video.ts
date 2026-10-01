/**
 * Video encoding of the animation, as MP4.
 *
 * The only module in the project that depends on something other than React, and
 * it does so through a DYNAMIC import: mediabunny weighs 43 kB gzip as a static
 * import, more than the 34 kB that got `view-i18n` dropped in favor of an in-house
 * layer. Loaded on demand, it costs only 0.7 kB at site load and only arrives the
 * day someone exports a video.
 *
 * Writing the container by hand as for the GIF and the WebP was not sustainable
 * here: an MP4 requires the whole ISO BMFF box tree and its sample tables, whereas
 * a GIF fits in a few hundred lines.
 *
 * The video is necessarily OPAQUE. Verified on the spot: `VideoEncoder` refuses
 * `alpha: 'keep'`, in H.264 as in VP9. That is why the video export imposes a
 * background, whereas the GIF leaves the choice.
 */

import { throwIfAborted } from './export'

/**
 * Explicit QUANTIZER, not a `QUALITY_*` level.
 *
 * This is not a tuning detail, it is the key to quality here. mediabunny's named
 * levels do NOT set a bitrate: when the browser can encode at a fixed quantizer —
 * Chrome 117 and later for all these codecs — they translate into
 * `bitrateMode: 'quantizer'` and the computed bitrate only serves to pick the AVC
 * level of the codec string. `QUALITY_HIGH` therefore set a QP of 22, and raising
 * a bitrate would have changed nothing.
 *
 * Measured on a frame of the bot, edge error against the source:
 * QP 22 → 3.06 · QP 16 → 1.75 · QP 10 → 0.58. We take 12, almost transparent,
 * for about 50 % more bytes than at 22 — an offline export has no size
 * constraint, and the edge of the shapes is what makes the whole impression of
 * cleanliness.
 *
 * The bitrate accompanies the quantizer as a FALLBACK: if a browser cannot encode
 * at a fixed quantizer, mediabunny switches to it instead of failing. Six megabits
 * for 1024 at 30 frames is generous on flat fills.
 */
const QP = 12
const FALLBACK_BITRATE = 6_000_000

/**
 * Encodes a sequence of frames into MP4.
 *
 * `render` draws frame `i` INTO the provided canvas, then yields. Frames are never
 * accumulated: each one is encoded and discarded before the next, otherwise a
 * thirty-second cycle would hold 255 MB of raw pixels in memory.
 */
export async function toMp4(
  canvas: HTMLCanvasElement,
  images: number,
  fps: number,
  render: (index: number) => void | Promise<void>,
  advance?: (done: number, total: number) => void,
  /** Abort requested by the user. See `throwIfAborted` below. */
  signal?: AbortSignal
): Promise<Blob> {
  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality } = await import(
    'mediabunny'
  )

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })
  const source = new CanvasSource(canvas, {
    codec: 'avc',
    quality: new Quality({ quantizer: QP, bitrate: FALLBACK_BITRATE })
  })
  output.addVideoTrack(source, { frameRate: fps })
  await output.start()

  /*
   * From here on the encoder is OPEN, so every exit path must go through `cancel`.
   * Without it, a frame that failed to render left the `VideoEncoder` behind: Chrome
   * caps the number of simultaneous hardware encoders, so after a few failures the
   * following exports failed at `start()` for a reason that had nothing to do with the
   * actual cause anymore. The offscreen player in `capture.ts` is closed in a `finally`
   * for the same reason; the encoder had no equivalent.
   */
  try {
    const duration = 1 / fps
    for (let i = 0; i < images; i++) {
      throwIfAborted(signal)
      await render(i)
      // `await` on each frame rather than in a batch: that is what applies the
      // encoder's backpressure, hence what bounds memory.
      await source.add(i * duration, duration)
      advance?.(i + 1, images)
    }
    throwIfAborted(signal)

    await output.finalize()
    const buffer = output.target.buffer
    if (!buffer) throw new Error('empty mp4 encoding')
    return new Blob([buffer], { type: 'video/mp4' })
  } catch (e) {
    await output.cancel()
    throw e
  }
}
