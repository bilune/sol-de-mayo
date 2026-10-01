import { describe, expect, it } from 'vitest'
import { animatedGif, animatedSvg } from './animated'

/** Minimal SVG with the same structure as SolDeMayo's: body + two eyes. */
const BASE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-125 -125 250 250">' +
  '<defs><mask id="m" maskUnits="userSpaceOnUse">' +
  '<path d="M61 0C62 2Z" fill="#fff"/>' +
  '<path d="M-9 -11A9 9Z" fill="#000" transform="matrix(0.86,-0.32,0.45,0.84,14.85,-27.88)"/>' +
  '<path d="M-9 -11A9 9Z" fill="#000" transform="matrix(0.62,-0.05,0.45,0.84,35.2,-29.43)"/>' +
  '</mask></defs>' +
  '<g opacity="1"><path d="M61 0C62 2Z" fill="#f9f9f9"/>' +
  '<g mask="url(#m)"><rect x="-125" y="-125" width="250" height="250" fill="#0a0a0c"/></g></g>' +
  '</svg>'

const MATRICES = [
  ['matrix(1,0,0,1,0,0)', 'matrix(1,0,0,1,10,0)'],
  ['matrix(1,0,0,0.35,0,0)', 'matrix(1,0,0,0.35,10,0)'],
  ['matrix(1,0,0,1,2,0)', 'matrix(1,0,0,1,12,0)']
]

describe('animated svg', () => {
  const output = animatedSvg(BASE, MATRICES, 3)

  it('replaces the transform of each eye with a class', () => {
    expect(output).toContain('class="eye0"')
    expect(output).toContain('class="eye1"')
    // no more hardcoded transform in the mask
    expect(output.match(/<mask[\s\S]*?<\/mask>/)![0]).not.toContain('transform="matrix')
  })

  it('leaves the body intact', () => {
    // the silhouette does not move enough to be animated: 1.17u on a radius of 100
    expect(output).toContain('<path d="M61 0C62 2Z" fill="#fff"/>')
    expect(output).toContain('fill="#0a0a0c"')
    expect(output).toContain('mask="url(#m)"')
  })

  it('writes one keyframes rule per eye, at the right percentages', () => {
    expect(output).toContain('@keyframes eye0{0%{transform:matrix(1,0,0,1,0,0)}')
    expect(output).toContain('50%{transform:matrix(1,0,0,0.35,0,0)}')
    expect(output).toContain('100%{transform:matrix(1,0,0,1,2,0)}')
    expect(output).toContain('@keyframes eye1{')
  })

  /*
   * Without these two properties a CSS transform on an SVG element rotates around
   * the center of its box instead of the origin of the coordinate system.
   */
  it('anchors the CSS transform reference on the viewBox', () => {
    expect(output).toContain('transform-box:view-box')
    expect(output).toContain('transform-origin:0 0')
  })

  /* The drift is not periodic: without `alternate`, the seam would jump. */
  it('loops back and forth to hide the seam', () => {
    expect(output).toContain('animation-direction:alternate')
    expect(output).toContain('animation-iteration-count:infinite')
    expect(output).toContain('animation-duration:3s')
  })

  it('stays a well-formed, self-contained SVG', () => {
    expect(output.startsWith('<svg xmlns=')).toBe(true)
    expect(output.endsWith('</svg>')).toBe(true)
    expect(output.indexOf('<style>')).toBeLessThan(output.indexOf('</svg>'))
  })

  it('weighs a fraction of a bitmap animation', () => {
    // 3 keyframes here, but the order of magnitude is the point: a few kB
    expect(output.length).toBeLessThan(4000)
  })

  it('refuses what it cannot animate', () => {
    expect(() => animatedSvg(BASE, [MATRICES[0]!], 3)).toThrow()
    expect(() => animatedSvg('<svg></svg>', MATRICES, 3)).toThrow()
    // as many matrices per keyframe as there are eyes in the mask
    expect(() => animatedSvg(BASE, [['matrix(1,0,0,1,0,0)'], ['matrix(1,0,0,1,1,0)']], 3)).toThrow()
  })
})

/** Small image: an opaque square on a transparent background, like the ball. */
function image(side: number, color: [number, number, number], offset = 0) {
  const px = new Uint8ClampedArray(side * side * 4)
  for (let y = 2; y < side - 2; y++) {
    for (let x = 2 + offset; x < side - 2; x++) {
      const p = (y * side + x) * 4
      px[p] = color[0]
      px[p + 1] = color[1]
      px[p + 2] = color[2]
      px[p + 3] = 255
    }
  }
  return px
}

/** Reads back the structure of a GIF: header, extensions, frame count. */
function readGif(f: Uint8Array) {
  const txt = (o: number, n: number) => String.fromCharCode(...f.subarray(o, o + n))
  const bits = (f[10]! & 0x07) + 1
  let o = 13 + 3 * (1 << bits)
  let images = 0
  let loop: number | null = null
  let delay: number | null = null
  let transparent: number | null = null
  let disposal: number | null = null
  while (o < f.length && f[o] !== 0x3b) {
    if (f[o] === 0x21 && f[o + 1] === 0xff) {
      loop = f[o + 16]! + f[o + 17]! * 256
      o += 19
    } else if (f[o] === 0x21 && f[o + 1] === 0xf9) {
      disposal = (f[o + 3]! >> 2) & 0x07
      transparent = f[o + 3]! & 0x01 ? f[o + 6]! : null
      delay = f[o + 4]! + f[o + 5]! * 256
      o += 8
    } else if (f[o] === 0x2c) {
      images++
      // 10 bytes of descriptor, separator included, then the code size
      o += 11
      // explicit bound: a malformed stream would make this skip loop forever
      while (o < f.length && f[o] !== 0) o += 1 + f[o]!
      o++
    } else break
  }
  return {
    header: txt(0, 6),
    width: f[6]! + f[7]! * 256,
    height: f[8]! + f[9]! * 256,
    hasTable: !!(f[10]! & 0x80),
    tableColors: 1 << bits,
    images,
    loop,
    delay,
    transparent,
    disposal,
    endFound: f[f.length - 1] === 0x3b
  }
}

describe('animated gif', () => {
  const frames = [image(16, [10, 10, 12]), image(16, [10, 10, 12], 2), image(16, [249, 249, 249])]

  it('produces a well-formed, terminated GIF89a', () => {
    const g = readGif(animatedGif(frames, 16, 16, 50))
    expect(g.header).toBe('GIF89a')
    expect(g.width).toBe(16)
    expect(g.height).toBe(16)
    expect(g.images).toBe(3)
    expect(g.endFound).toBe(true)
  })

  it('carries a global palette', () => {
    const g = readGif(animatedGif(frames, 16, 16, 50))
    expect(g.hasTable).toBe(true)
    // two shades + transparent fit in four entries
    expect(g.tableColors).toBe(4)
  })

  /* Without a transparent index, the background would be painted. */
  it('declares index 0 transparent', () => {
    expect(readGif(animatedGif(frames, 16, 16, 50)).transparent).toBe(0)
  })

  /*
   * Without "restore to background", transparent areas show the previous frame
   * and the ball leaves a trail behind it.
   */
  it('disposes of each frame by restoring to background', () => {
    expect(readGif(animatedGif(frames, 16, 16, 50)).disposal).toBe(2)
  })

  it('loops forever', () => {
    expect(readGif(animatedGif(frames, 16, 16, 50)).loop).toBe(0)
  })

  /* GIF delay is counted in hundredths of a second, not in milliseconds. */
  it('converts the delay to hundredths', () => {
    expect(readGif(frames.length ? animatedGif(frames, 16, 16, 50) : new Uint8Array()).delay).toBe(5)
    expect(readGif(animatedGif(frames, 16, 16, 100)).delay).toBe(10)
  })

  /* A delay of 0 or 1 hundredth is not handled the same way by every player. */
  it('does not go below two hundredths', () => {
    expect(readGif(animatedGif(frames, 16, 16, 5)).delay).toBe(2)
  })

  it('refuses an empty animation', () => {
    expect(() => animatedGif([], 16, 16, 50)).toThrow()
  })

  /**
   * Transparency is INFERRED from the pixels. Frames already flattened onto a
   * background must not declare a transparent index, and above all must not be
   * disposed "restore to background" in between — which would make the background
   * flicker.
   */
  it('does not announce transparency on opaque images', () => {
    const side = 8
    const opaque = new Uint8ClampedArray(side * side * 4).fill(255)
    const g = readGif(animatedGif([opaque, opaque], side, side, 50))
    expect(g.transparent).toBeNull()
    expect(g.disposal).toBe(1) // "do not dispose"
  })

  it('announces transparency as soon as an image has some', () => {
    const g = readGif(animatedGif(frames, 16, 16, 50))
    expect(g.transparent).toBe(0)
    expect(g.disposal).toBe(2) // "restore to background"
  })

  it('stays under the 256 color limit even on a gradient', () => {
    const gradient = new Uint8ClampedArray(64 * 64 * 4)
    for (let i = 0; i < 64 * 64; i++) {
      gradient[i * 4] = i % 256
      gradient[i * 4 + 1] = (i * 7) % 256
      gradient[i * 4 + 2] = (i * 13) % 256
      gradient[i * 4 + 3] = 255
    }
    const g = readGif(animatedGif([gradient], 64, 64, 50))
    expect(g.tableColors).toBeLessThanOrEqual(256)
    expect(g.images).toBe(1)
  })
})

/**
 * Minimal LZW decoder, to verify by ROUND TRIP that the produced stream is
 * readable. A subtly wrong LZW encoder outputs a file that players refuse, and
 * nothing in the structure shows it.
 */
function decodeGif(f: Uint8Array) {
  const bits = (f[10]! & 0x07) + 1
  let o = 13 + 3 * (1 << bits)
  const images: number[][] = []
  while (o < f.length && f[o] !== 0x3b) {
    if (f[o] === 0x21) {
      o += 2
      while (o < f.length && f[o] !== 0) o += 1 + f[o]!
      o++
    } else if (f[o] === 0x2c) {
      o += 10
      const min = f[o]!
      o++
      const data: number[] = []
      while (o < f.length && f[o] !== 0) {
        const n = f[o]!
        for (let k = 1; k <= n; k++) data.push(f[o + k]!)
        o += 1 + n
      }
      o++

      const clear = 1 << min
      const eoi = clear + 1
      let size = min + 1
      let dict: number[][] = []
      const reset = () => {
        dict = []
        for (let i = 0; i < clear; i++) dict[i] = [i]
        dict[clear] = []
        dict[eoi] = []
        size = min + 1
      }
      reset()
      const output: number[] = []
      let reserve = 0
      let bitCount = 0
      let previous: number[] | null = null
      for (let i = 0; i <= data.length; i++) {
        if (i < data.length) {
          reserve |= data[i]! << bitCount
          bitCount += 8
        }
        while (bitCount >= size) {
          const code = reserve & ((1 << size) - 1)
          reserve >>= size
          bitCount -= size
          if (code === eoi) { bitCount = 0; break }
          if (code === clear) { reset(); previous = null; continue }
          let entry = dict[code]
          if (!entry) {
            if (!previous) throw new Error('unknown code without a previous one')
            entry = [...previous, previous[0]!]
          }
          output.push(...entry)
          if (previous) dict.push([...previous, entry[0]!])
          if (dict.length === 1 << size && size < 12) size++
          previous = entry
        }
      }
      images.push(output)
    } else break
  }
  return images
}

describe('LZW round trip', () => {
  it('recovers exactly the pixels of a simple image', () => {
    const px = image(16, [10, 10, 12])
    const gif = animatedGif([px], 16, 16, 50)
    const [decode] = decodeGif(gif)
    expect(decode).toHaveLength(16 * 16)
    // rebuild the expected indices: 0 outside, 1 inside
    const expected: number[] = []
    for (let i = 0; i < 16 * 16; i++) expected.push(px[i * 4 + 3]! < 128 ? 0 : 1)
    expect(decode).toEqual(expected)
  })

  it('recovers the pixels of an image with many colors', () => {
    const side = 40
    const px = new Uint8ClampedArray(side * side * 4)
    for (let i = 0; i < side * side; i++) {
      px[i * 4] = (i * 5) % 200
      px[i * 4 + 1] = (i * 11) % 200
      px[i * 4 + 2] = (i * 17) % 200
      px[i * 4 + 3] = 255
    }
    const [decode] = decodeGif(animatedGif([px], side, side, 50))
    expect(decode).toHaveLength(side * side)
    // no transparent index: everything is opaque
    expect(decode!.every((v) => v > 0)).toBe(true)
  })
})
