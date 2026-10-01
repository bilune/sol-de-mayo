/**
 * Assembly of the exported animation: an SVG whose eyes are animated in CSS.
 *
 * Everything is pure — string in, string out — so it is testable in `node` like the
 * rest of `src/ui/`. Capturing the keyframes is what needs the DOM, and that lives
 * in `capture.ts`.
 */

/** Writes an unsigned integer on `n` bytes, little-endian. */
function littleEndian(value: number, n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push((value / 2 ** (8 * i)) & 0xff)
  return out
}

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0))

/**
 * Injects the eye animation into an already rendered SVG.
 *
 * We do NOT rebuild the drawing: we start from the SVG that `SolDeMayo` produced for
 * the first frame and replace each eye's `transform` with an animated class. A
 * single drawing source, so no drift is possible — it is the same rule as for the
 * still export.
 *
 * Only the eyes move, and that is measured: at rest the silhouette moves only
 * 1.17 units on a radius of 100 over three seconds, i.e. about one and a half
 * pixels at export size. The body is therefore left as is, which makes the file
 * tiny — all the weight of a bot animation is in its gaze.
 *
 * Interpolation is done by the BROWSER: that is what makes the animation smooth at
 * the screen's refresh rate instead of jumping from frame to frame like a flip
 * book. That is the whole point compared to a WebP or a GIF.
 */
export function animatedSvg(base: string, matrices: string[][], duration: number): string {
  if (matrices.length < 2) throw new Error('at least two keyframes are needed')

  const mask = base.match(/<mask[\s\S]*?<\/mask>/)
  if (!mask) throw new Error('mask not found')

  // The eyes are the only shapes in the mask that carry a `transform`: the body
  // has none. We number them in document order.
  let n = 0
  const animatedMask = mask[0].replace(/transform="matrix\([^)]*\)"/g, () => `class="eye${n++}"`)
  if (n === 0) throw new Error('no eye to animate')

  const perFrame = matrices[0]!.length
  if (perFrame !== n) throw new Error(`${n} eyes in the mask, ${perFrame} per keyframe`)

  const step = 100 / (matrices.length - 1)
  const rules = Array.from({ length: n }, (_, eye) => {
    const steps = matrices
      .map((m, i) => `${+(i * step).toFixed(3)}%{transform:${m[eye]}}`)
      .join('')
    return `@keyframes eye${eye}{${steps}}`
  })

  const style =
    '<style>' +
    // `transform-box`/`transform-origin` are not decorative: without them, a CSS
    // transform on an SVG element rotates around the center of its box instead of
    // the origin of the coordinate system, and the eye flies to the other end of
    // the ball.
    `.eye0,.eye1{transform-box:view-box;transform-origin:0 0;` +
    // `alternate` gives a SEAMLESS loop: the gaze drift is not periodic (its
    // periods are coprime so it never repeats), so a plain loop would show a jump
    // at the seam. Played forward then backward, it loops back exactly onto
    // itself — and a blink played backward is still a blink.
    `animation-duration:${duration}s;animation-iteration-count:infinite;` +
    `animation-timing-function:linear;animation-direction:alternate}` +
    Array.from({ length: n }, (_, i) => `.eye${i}{animation-name:eye${i}}`).join('') +
    rules.join('') +
    '</style>'

  return base.replace(mask[0], animatedMask).replace('</svg>', `${style}</svg>`)
}

/* ------------------------------------------------------------------- gif */

/**
 * GIF LZW compression: VARIABLE-length codes, written bit by bit starting with the
 * least significant bit, and grouped into sub-blocks of at most 255 bytes.
 */
function lzw(indices: Uint8Array, bitsPerPixel: number): number[] {
  const clear = 1 << bitsPerPixel
  const end = clear + 1
  let size = bitsPerPixel + 1
  let next = end + 1
  let dict = new Map<string, number>()

  const bytes: number[] = []
  let reserve = 0
  let bits = 0
  const write = (code: number) => {
    reserve |= code << bits
    bits += size
    while (bits >= 8) {
      bytes.push(reserve & 0xff)
      reserve >>= 8
      bits -= 8
    }
  }

  write(clear)
  let prefix = String(indices[0])
  for (let i = 1; i < indices.length; i++) {
    const c = indices[i]!
    const key = `${prefix},${c}`
    const known = dict.get(key)
    if (known !== undefined) {
      prefix = String(known)
      continue
    }
    write(Number(prefix))
    if (next < 4096) {
      dict.set(key, next++)
      // The code width grows one step AFTER the dictionary has exceeded what it
      // can address, and that offset is the format's trap: the encoder records
      // its entry right after emitting a code, whereas the decoder only records
      // its own when reading the NEXT code. It is therefore always one entry
      // behind, and the encoder must widen late too. Writing `=== (1 << size)`
      // desynchronizes the two and the stream becomes unreadable — verified by a
      // round-trip test.
      if (next > 1 << size && size < 12) size++
    } else {
      // Dictionary full: we reset it, and the decoder does the same when it sees
      // the clear code.
      write(clear)
      dict = new Map()
      size = bitsPerPixel + 1
      next = end + 1
    }
    prefix = String(c)
  }
  write(Number(prefix))
  write(end)
  if (bits > 0) bytes.push(reserve & 0xff)

  // Split into sub-blocks: each one is preceded by its length, and a zero byte
  // ends the series.
  const output: number[] = [bitsPerPixel]
  for (let i = 0; i < bytes.length; i += 255) {
    const block = bytes.slice(i, i + 255)
    output.push(block.length, ...block)
  }
  output.push(0)
  return output
}

/**
 * Palette shared by all frames, index 0 reserved for transparency.
 *
 * It is built in TWO passes — tally the colors, then index the frames — because a
 * GIF requires a shared palette: every frame must be seen before a single one can
 * be encoded. Over a thirty-second cycle, keeping them as raw pixels would cost
 * 255 MB; tallied then indexed, they weigh only one byte per pixel.
 */
export interface GifPalette {
  /** How many pixels per shade, during the tally. */
  views: Map<number, number>
  /** RGB packed on 24 bits -> index, once the palette is frozen. */
  index: Map<number, number>
  /** Resolution of missing shades to the closest retained one. */
  nearby: Map<number, number>
  /** At least one transparent pixel has been seen. */
  transparency: boolean
}

export const newPalette = (): GifPalette => ({
  views: new Map(),
  index: new Map(),
  nearby: new Map(),
  transparency: false
})

/**
 * Tallies the colors of a frame, COUNTING the pixels.
 *
 * The counting is not a detail: a first-come palette would have filled up with the
 * anti-aliasing shades of the first frames, and the ring shades — which only
 * appear mid-cycle — would all have landed in the same slot. Measured: a cycle
 * exceeds 255 colors, so we MUST choose which ones to keep.
 */
export function tally(palette: GifPalette, px: Uint8ClampedArray) {
  for (let p = 0; p < px.length; p += 4) {
    if (px[p + 3]! < 128) {
      palette.transparency = true
      continue
    }
    const key = (px[p]! << 16) | (px[p + 1]! << 8) | px[p + 2]!
    palette.views.set(key, (palette.views.get(key) ?? 0) + 1)
  }
}

/** Freezes the palette on the 255 most frequent shades. */
function freezePalette(palette: GifPalette) {
  if (palette.index.size) return
  const tries = [...palette.views.entries()].sort((a, b) => b[1] - a[1]).slice(0, 255)
  for (const [key] of tries) palette.index.set(key, palette.index.size + 1)
}

/** Index of the closest shade among the retained ones, cached. */
function nearest(palette: GifPalette, key: number) {
  const known = palette.nearby.get(key)
  if (known !== undefined) return known
  const r = (key >> 16) & 0xff
  const v = (key >> 8) & 0xff
  const b = key & 0xff
  let best = 1
  let gap = Infinity
  for (const [other, i] of palette.index) {
    const dr = r - ((other >> 16) & 0xff)
    const dv = v - ((other >> 8) & 0xff)
    const db = b - (other & 0xff)
    const d = dr * dr + dv * dv + db * db
    if (d < gap) {
      gap = d
      best = i
    }
  }
  // The cache bounds the cost: each missing shade is resolved only once, even if
  // it comes back over hundreds of frames.
  palette.nearby.set(key, best)
  return best
}

/** Translates a frame into palette indices, one byte per pixel. */
export function indexed(palette: GifPalette, px: Uint8ClampedArray): Uint8Array {
  freezePalette(palette)
  const out = new Uint8Array(px.length / 4)
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    // 0 = transparent, and that is already the array's default value
    if (px[p + 3]! < 128) continue
    const key = (px[p]! << 16) | (px[p + 1]! << 8) | px[p + 2]!
    out[i] = palette.index.get(key) ?? nearest(palette, key)
  }
  return out
}

/**
 * Assembles frames into an animated GIF.
 *
 * GIF transparency is ONE bit: a pixel is opaque or invisible, nothing in between.
 * On a transparent background, the ball's anti-aliased edge is therefore cut at
 * 50 % opacity and comes out as a staircase. That is not a defect to fix, it is
 * the format — hence the choice left to the user between that hard edge and a
 * solid background, where the edge stays smooth because it has something to blend
 * into.
 *
 * Transparency is INFERRED from the frames, not requested: frames already
 * flattened onto a background have no reason to declare a transparent index, and
 * above all no reason to be disposed "restore to background" in between — which
 * would make the background flicker.
 *
 * The GIF only exists for places that refuse animated SVG, such as Discord or
 * Slack animated avatars. Everywhere else the SVG is better.
 */
export function animatedGif(
  images: Uint8ClampedArray[],
  width: number,
  height: number,
  delayMs: number
): Uint8Array<ArrayBuffer> {
  if (!images.length) throw new Error('no frame to pack')
  const palette = newPalette()
  for (const px of images) tally(palette, px)
  return indexedGif(
    palette,
    images.map((px) => indexed(palette, px)),
    width,
    height,
    delayMs
  )
}

/**
 * Same thing, but on ALREADY indexed frames — the bounded-memory path, for long
 * sequences. See `GifPalette`.
 */
export function indexedGif(
  palette: GifPalette,
  images: Uint8Array[],
  width: number,
  height: number,
  delayMs: number
): Uint8Array<ArrayBuffer> {
  if (!images.length) throw new Error('no frame to pack')

  freezePalette(palette)
  const transparency = palette.transparency
  const colors = palette.index
  // A GIF palette has a power-of-two size, and at least two bits per pixel are
  // needed for the clear code to fit.
  const bits = Math.max(2, Math.ceil(Math.log2(colors.size + 1)))
  const tableSize = 1 << bits

  const table: number[] = [0, 0, 0] // index 0: transparent, color irrelevant
  for (const key of colors.keys()) table.push((key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff)
  while (table.length < tableSize * 3) table.push(0)

  const out: number[] = [
    ...ascii('GIF89a'),
    ...littleEndian(width, 2),
    ...littleEndian(height, 2),
    0x80 | (bits - 1), // global table present, and its size
    0, // background index: transparent
    0, // no aspect ratio
    ...table,
    // Endless loop, through the Netscape extension — nothing else can express it.
    0x21,
    0xff,
    0x0b,
    ...ascii('NETSCAPE2.0'),
    0x03,
    0x01,
    ...littleEndian(0, 2),
    0x00
  ]

  // GIF delay is counted in HUNDREDTHS of a second: that is what limits its frame
  // rate, a delay of 0 or 1 being handled differently depending on the player.
  const delay = Math.max(2, Math.round(delayMs / 10))

  for (const indices of images) {
    out.push(
      0x21,
      0xf9,
      0x04,
      // On a transparent background: "restore to background" disposal (2) and a
      // declared transparent index, otherwise empty areas show the previous
      // frame and the ball leaves a trail behind it.
      //
      // On a solid background: "do not dispose" (1), and above all NO restore to
      // background — each frame covers the whole canvas, so clearing in between
      // only makes the background flicker.
      transparency ? (2 << 2) | 0x01 : 1 << 2,
      ...littleEndian(delay, 2),
      0, // transparent index
      0x00,
      0x2c,
      ...littleEndian(0, 2),
      ...littleEndian(0, 2),
      ...littleEndian(width, 2),
      ...littleEndian(height, 2),
      0, // no local table, no interlacing
      ...lzw(indices, bits)
    )
  }

  out.push(0x3b)
  return new Uint8Array(out)
}
