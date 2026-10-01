/**
 * Capture of the avatar as an image. This is the DOM layer of the export: it needs
 * a canvas and the clipboard, so nothing here is testable in `node` — framing and
 * naming, for their part, live in `export.ts` and are.
 *
 * The exported SVG is the SCREEN one, reframed: we serialize the live node rather
 * than rebuilding a render alongside. Two drawing sources would have drifted, and
 * the engine is already the only one that counts. It is possible because the bot's
 * SVG is already self-contained: no `var(--...)`, no class, each shape carries its
 * `fill` in hex.
 */

import { createElement, createRef } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import SolDeMayo, { type SolDeMayoHandle } from '@/components/SolDeMayo'
import type { Block } from '@/bot/cycles'
import { animatedGif, indexedGif, indexed, newPalette, tally, animatedSvg } from './animated'
import { throwIfAborted, HALF_SCREEN, withoutComments, viewBoxExport } from './export'

/**
 * Serializes the displayed SVG into a standalone document, reframed on the ball.
 *
 * `width`/`height` are set explicitly and that is not cosmetic: without an
 * intrinsic dimension, Firefox refuses to rasterize an SVG loaded into an `<img>`,
 * and the canvas comes out empty.
 */
export function standaloneSvg(svg: SVGSVGElement, size: number, viewBox = viewBoxExport()) {
  const clone = svg.cloneNode(true) as SVGSVGElement
  // The page's Tailwind classes do not exist in the delivered file.
  clone.removeAttribute('class')
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('viewBox', viewBox)
  clone.setAttribute('width', String(size))
  clone.setAttribute('height', String(size))
  return withoutComments(new XMLSerializer().serializeToString(clone))
}

/**
 * Rasterizes an SVG into a canvas and returns its context.
 *
 * Goes through a blob and not a `data:` URL: `btoa` breaks on the accents of the
 * `aria-label`, and percent-encoding a whole SVG is needlessly long. The URL is
 * released in a `finally` — an unrevoked object keeps the blob in memory until
 * the page is reloaded.
 *
 * The canvas is never tainted: the bot's SVG has neither `<foreignObject>` nor
 * `<image>`, the only two things that would make `toBlob` fail.
 */
async function draw(
  markup: string,
  size: number,
  canvas: HTMLCanvasElement,
  background: string | null = null
) {
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()

    canvas.width = size
    canvas.height = size
    // Default `alpha`: that is what leaves the background transparent when no
    // color is requested. The bot is then exported as a cut-out sticker.
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas unavailable')
    // The canvas is reused from one frame to the next for the animated export:
    // without clearing, a frame with closed eyes would keep open eyes underneath.
    ctx.clearRect(0, 0, size, size)
    if (background) {
      ctx.fillStyle = background
      ctx.fillRect(0, 0, size, size)
    }
    ctx.drawImage(img, 0, 0, size, size)
    return ctx
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Rasterizes an SVG to PNG. PNG is lossless, it has no quality to tune. */
export async function toPng(markup: string, size: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  await draw(markup, size, canvas)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encodage png impossible'))),
      'image/png'
    )
  })
}

/** Triggers the download of a blob under the given name. */
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
  } finally {
    // Deferred: Safari still reads the URL after the click on a large blob.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}

/** Can the clipboard write an image here? */
export function canCopy() {
  return (
    typeof ClipboardItem !== 'undefined' &&
    !!navigator.clipboard?.write &&
    // `supports` is recent: its absence is not a refusal.
    (ClipboardItem.supports?.('image/png') ?? true)
  )
}

/**
 * Copies an image to the clipboard.
 *
 * The blob is passed as a PROMISE and not awaited before the call: Safari requires
 * `write` to stem from the user's gesture, and any `await` slipped in between
 * loses that gesture and the copy is refused.
 */
export async function copy(blob: Promise<Blob>) {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

/**
 * Copies the SVG as TEXT and not as an image: that is the form in which Figma,
 * Illustrator and a code editor paste it as editable vector. Pasted as
 * `image/svg+xml`, it would come out flattened whereas here it comes out editable.
 */
export async function copyText(text: string) {
  await navigator.clipboard.writeText(text)
}

/** How many frames done out of how many, for the progress bar. */
export type Progress = (done: number, total: number) => void

/**
 * Exports the cycle as MP4.
 *
 * The background is REQUIRED, not optional: video has no alpha (verified,
 * `VideoEncoder` refuses `alpha: 'keep'`). Without a background, the bot would be
 * composited onto black.
 */
export async function cycleToMp4(
  settings: BotSettings,
  blocks: Block[],
  size: number,
  images: number,
  step: number,
  background: string,
  advance?: Progress,
  signal?: AbortSignal
): Promise<Blob> {
  const { toMp4 } = await import('./video')
  const canvas = document.createElement('canvas')
  const player = await openCycle(settings, blocks, size, background)
  try {
    return await toMp4(
      canvas,
      images,
      Math.round(1 / step),
      async (i) => {
        const svg = await player.render(i * step)
        await draw(standaloneSvg(svg, size, viewBoxExport(HALF_SCREEN)), size, canvas, background)
      },
      advance,
      signal
    )
  } finally {
    player.close()
  }
}

/**
 * Exports the cycle as GIF.
 *
 * TWO passes over the sequence, and it is for memory: a GIF needs a palette shared
 * by all frames, hence to have seen them all before encoding a single one. Keeping
 * them as raw pixels would cost 255 MB over a thirty-second cycle. The first pass
 * only records the colors, the second encodes — rendering is deterministic, so
 * replaying the sequence gives back exactly the same frames.
 *
 * That determinism relies on the PLAYER being idempotent: replaying frame 0 after a
 * full pass must give back exactly frame 0. That was not always the case — the engine
 * keeps the previous state for its fades, so the first state blended with the LAST one
 * and the default GIF opened on an eyeless ball, the comet having a zero `eyeAlpha`.
 * The palette, for its part, had been counted on frames that were not the ones
 * encoded. `renderAt` now rewinds, and `capture.test.ts` locks it in — otherwise this
 * module would have to open one player per pass to get by.
 */
export async function cycleToGif(
  settings: BotSettings,
  blocks: Block[],
  size: number,
  images: number,
  step: number,
  background: string | null,
  advance?: Progress,
  signal?: AbortSignal
): Promise<Blob> {
  // A single canvas and a single player for both passes: the canvas is reset on every
  // frame, and the player can rewind.
  const canvas = document.createElement('canvas')
  const view = viewBoxExport(HALF_SCREEN)
  const player = await openCycle(settings, blocks, size, background ?? undefined)

  /** One full pass over the sequence. */
  const pass = async (read: (index: number, pixels: Uint8ClampedArray) => void) => {
    for (let i = 0; i < images; i++) {
      // checked on every frame: a thirty-second cycle is twice six hundred frames,
      // and the abort must not wait for the end of a pass
      throwIfAborted(signal)
      const svg = await player.render(i * step)
      const ctx = await draw(standaloneSvg(svg, size, view), size, canvas, background)
      read(i, ctx.getImageData(0, 0, size, size).data)
    }
  }

  try {
    const palette = newPalette()
    await pass((i, pixels) => {
      tally(palette, pixels)
      advance?.(i + 1, images * 2)
    })

    const parts: Uint8Array[] = []
    await pass((i, pixels) => {
      parts.push(indexed(palette, pixels))
      advance?.(images + i + 1, images * 2)
    })

    return new Blob([indexedGif(palette, parts, size, size, Math.round(step * 1000))], {
      type: 'image/gif'
    })
  } finally {
    player.close()
  }
}

/** What the bot must wear in the exported animation. */
export interface BotSettings {
  shape: string
  color: string
  expression: string
}

/**
 * Renders the sequence frame by frame, on an OFFSCREEN instance.
 *
 * No capture of the displayed avatar, and that is deliberate: on screen the bot is
 * at an arbitrary clock time, whereas here we want a reproducible sequence that
 * starts at the beginning. It is possible because `engine.sample(t)` is a pure
 * function of time — the same time always gives back the same frame — and because
 * a `SolDeMayo` given `frozenAt` starts no animation loop and no listener: we step
 * it forward ourselves.
 *
 * The same component therefore serves the screen and the export: a single drawing
 * source, no chance of drift.
 */
export async function botSequence<T>(
  settings: BotSettings,
  size: number,
  count: number,
  step: number,
  read: (svg: SVGSVGElement, index: number) => T | Promise<T>,
  /**
   * Eye color. The eyes are HOLES filled with this shade, so on a solid-background
   * export it must be exactly the background color — otherwise the site's old
   * shade stays visible inside them, as a darker ring.
   */
  paper?: string
): Promise<T[]> {
  const host = document.createElement('div')
  // out of the flow and out of view, but RENDERED: a `display:none` would give no
  // SVG to serialize.
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:0;height:0;overflow:hidden'
  document.body.appendChild(host)

  // A React root of its own, rendered SYNCHRONOUSLY with `flushSync`: each frame
  // must be in the DOM before `read` serialises it.
  const root = createRoot(host)
  const render = (date: number) =>
    flushSync(() =>
      root.render(
        createElement(SolDeMayo, {
          ...settings,
          size: size,
          frozenAt: date,
          ...(paper ? { paper } : {})
        })
      )
    )

  try {
    const out: T[] = []
    for (let i = 0; i < count; i++) {
      render(i * step)
      const svg = host.querySelector('svg')
      if (!svg) throw new Error('off-screen bot not rendered')
      out.push(await read(svg, i))
    }
    return out
  } finally {
    root.unmount()
    host.remove()
  }
}

/**
 * Renders a CYCLE offscreen, frame by frame, calling `read` for each one.
 *
 * Frames are never accumulated: a thirty-second cycle is more than six hundred
 * frames, i.e. 255 MB of raw pixels if we kept them all. The caller decides what
 * to do with them as they come — encode, index, discard.
 *
 * Rendering goes through `renderAt` and not `frozenAt`: only `renderAt` walks the
 * blocks while timestamping each state change at its absolute offset, which gives
 * the same fades at the seams as real-time playback. See its doc in
 * `SolDeMayo.tsx`.
 */
export interface OffscreenPlayer {
  /** Renders instant `t` of the cycle and returns the SVG to read. */
  render: (t: number) => Promise<SVGSVGElement>
  close: () => void
}

export async function openCycle(
  settings: BotSettings,
  blocks: Block[],
  size: number,
  paper?: string
): Promise<OffscreenPlayer> {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:0;height:0;overflow:hidden'
  document.body.appendChild(host)

  const bot = createRef<SolDeMayoHandle>()
  const root = createRoot(host)
  flushSync(() =>
    root.render(
      createElement(SolDeMayo, {
        ...settings,
        size: size,
        cycle: blocks,
        /*
         * The engine is built on the state it's given, and frame 0 must be the
         * montage's FIRST state. Without this prop the model took its `idle`
         * default: a montage starting with the orbit opened on a resting ball that
         * morphed towards the triangle for 0.6 s. Same precaution as on screen,
         * where `state` is seeded on the current block (see `App.tsx`).
         */
        state: blocks[0]?.state ?? 'idle',
        frozenAt: 0,
        ref: bot,
        ...(paper ? { paper } : {})
      })
    )
  )

  const svg = host.querySelector('svg')
  if (!svg || !bot.current) {
    root.unmount()
    host.remove()
    throw new Error('off-screen bot not rendered')
  }

  return {
    render: async (t: number) => {
      flushSync(() => bot.current!.renderAt(t))
      return svg
    },
    close: () => {
      root.unmount()
      host.remove()
    }
  }
}

/**
 * The eye matrices of a frame, read from the mask.
 *
 * The eyes are the only shapes in the mask that carry a `transform` — the body has
 * none — so document order is enough to identify them.
 */
function eyeMatrices(svg: SVGSVGElement) {
  return [...svg.querySelectorAll('mask [transform]')].map((e) => e.getAttribute('transform')!)
}

/**
 * Assembles the bot's animation into an animated SVG.
 *
 * The body is the one from the first frame and is not animated: at rest the
 * silhouette moves only 1.17 units on a radius of 100, i.e. about one and a half
 * pixels. All the motion is in the eyes.
 */
export async function toAnimatedSvg(
  settings: BotSettings,
  size: number,
  count: number,
  step: number
): Promise<Blob> {
  let base = ''
  const matrices = await botSequence(settings, size, count, step, (svg, i) => {
    if (i === 0) base = standaloneSvg(svg, size)
    return eyeMatrices(svg)
  })
  const markup = animatedSvg(base, matrices, +((count - 1) * step).toFixed(3))
  return new Blob([markup], { type: 'image/svg+xml' })
}

/**
 * Assembles the bot's animation into an animated GIF.
 *
 * The GIF is a true flip book: every frame must therefore be rasterized, whereas
 * the animated SVG only collects matrices. It only exists for places that refuse
 * SVG — a Discord or Slack animated avatar — and its edge will be hard, its
 * transparency having only one bit.
 */
export async function toAnimatedGif(
  settings: BotSettings,
  size: number,
  count: number,
  step: number,
  background: string | null = null
): Promise<Blob> {
  // A single canvas for the whole sequence: creating one per frame leaves dozens
  // of contexts to the garbage collector during the export.
  const canvas = document.createElement('canvas')
  const images = await botSequence(
    settings,
    size,
    count,
    step,
    async (svg) => {
      const ctx = await draw(standaloneSvg(svg, size), size, canvas, background)
      return ctx.getImageData(0, 0, size, size).data
    },
    // the eyes take the background shade to blend into it exactly
    background ?? undefined
  )
  return new Blob([animatedGif(images, size, size, Math.round(step * 1000))], { type: 'image/gif' })
}
