import { describe, expect, it } from 'vitest'
import { RADIUS } from '@/bot/coords'
import { SHAPES } from '@/bot/skins'
import {
  ACTIONS,
  WHITE,
  CYCLE_FPS,
  CYCLE_SIZE,
  HALF_SCREEN,
  CYCLE_FORMATS,
  DEFAULT_CYCLE_FORMAT,
  cycleSupportsTransparency,
  cycleImages,
  GIF_BACKGROUNDS,
  DEFAULT_GIF_BACKGROUND,
  backgroundColor,
  ACTION_BY_ID,
  DEFAULT_ACTION,
  HALF_FRAME,
  MAX_RADIUS,
  fileName,
  withoutComments,
  viewBoxExport
} from './export'

/** Radius of the ball at rest, see the `R` in SolDeMayo.tsx. */


/** Half-side of the viewBox displayed on screen, see the `VB` in SolDeMayo.tsx. */
const VB_SCREEN = 158

describe('export frame', () => {
  /*
   * THE test of this file: the frame is tighter than the screen, so it decides
   * what fits. A shape added to `skins.ts` with a radius larger than the margin
   * would get silently cropped in the exported image.
   */
  it('contains every shape of the customizer', () => {
    for (const shape of SHAPES) {
      const radius = Math.max(...shape.radii) * RADIUS
      expect(radius, `shape « ${shape.id} » overflows the frame`).toBeLessThan(HALF_FRAME)
    }
  })

  it('leaves a margin for the circular crop of a profile picture', () => {
    // The ball at rest must not touch the edge: between 70 % and 90 % of the frame.
    const padding = RADIUS / HALF_FRAME
    expect(padding).toBeGreaterThan(0.7)
    expect(padding).toBeLessThan(0.9)
  })

  it('is tighter than the screen viewBox', () => {
    // The screen margin houses the rings of the animated states, absent at rest:
    // keeping it would fill the export with emptiness.
    expect(HALF_FRAME).toBeLessThan(VB_SCREEN)
  })

  it('frames on the most spread-out shape, not on the circle', () => {
    // The squircle peaks at 1.15 on its diagonal: a frame computed on the circle
    // alone (1.0) would crop it.
    expect(MAX_RADIUS).toBeGreaterThan(1)
    expect(MAX_RADIUS).toBe(Math.max(...SHAPES.map((f) => Math.max(...f.radii))))
  })

  it('produces a square viewBox centered on the ball', () => {
    expect(viewBoxExport(125)).toBe('-125 -125 250 250')
    expect(viewBoxExport()).toBe(`${-HALF_FRAME} ${-HALF_FRAME} ${HALF_FRAME * 2} ${HALF_FRAME * 2}`)
  })
})

describe('export catalog', () => {
  it('has unique ids', () => {
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(ACTIONS.length)
  })

  it('exposes a default action that exists', () => {
    expect(ACTION_BY_ID.get(DEFAULT_ACTION)).toBeDefined()
  })

  /*
   * A single PNG size: offering 1024 and 2048 made the user settle a question
   * that is not theirs.
   */
  it('offers only one png to download', () => {
    const pngs = ACTIONS.filter((a) => a.mode === 'download' && a.extension === 'png')
    expect(pngs).toHaveLength(1)
  })

  /* The image clipboard can only write bitmaps; the SVG goes through as text. */
  it('copies the bitmap as an image and the vector as text', () => {
    for (const action of ACTIONS) {
      if (action.mode === 'copyImage') expect(action.extension).toBe('png')
      if (action.mode === 'copyText') expect(action.extension).toBe('svg')
    }
  })

  it('offers to copy both formats', () => {
    expect(ACTIONS.some((a) => a.mode === 'copyImage')).toBe(true)
    expect(ACTIONS.some((a) => a.mode === 'copyText')).toBe(true)
  })

  it('gives every action a usable size', () => {
    for (const action of ACTIONS) {
      expect(action.size).toBeGreaterThan(0)
      expect(Number.isFinite(action.size)).toBe(true)
    }
  })
})

describe('cycle export', () => {
  /*
   * THE cycle trap: the rings of the animated states reach 1.4 times the ball's
   * radius, i.e. 140 — beyond the tight frame of the still export, which would
   * crop them. A cycle must therefore use the screen viewBox.
   */
  it('exports on the screen viewBox, not on the tight frame', () => {
    const ARC_RADIUS = 140
    expect(HALF_SCREEN).toBeGreaterThan(ARC_RADIUS)
    expect(HALF_FRAME).toBeLessThan(ARC_RADIUS)
  })


  it('offers neither animated SVG nor any non-video format', () => {
    // the body morphs on every frame: 2.5 kB of path times six hundred frames
    expect(CYCLE_FORMATS).toEqual(['mp4', 'gif'])
    expect(CYCLE_FORMATS).toContain(DEFAULT_CYCLE_FORMAT)
  })

  /* Video has no alpha: `VideoEncoder` refuses `alpha: 'keep'`. */
  it('leaves the background choice to the gif only', () => {
    expect(cycleSupportsTransparency('gif')).toBe(true)
    expect(cycleSupportsTransparency('mp4')).toBe(false)
  })

  it('counts frames from the duration and the format', () => {
    expect(cycleImages(31.2, 'mp4')).toBe(Math.round(31.2 * CYCLE_FPS.mp4))
    expect(cycleImages(31.2, 'gif')).toBe(Math.round(31.2 * CYCLE_FPS.gif))
    // a tiny montage must still yield one frame
    expect(cycleImages(0, 'mp4')).toBe(1)
  })

  /*
   * Settings are SEPARATE per format, and that fixes a real mistake: the MP4 had
   * inherited the GIF's 320 px / 20 fps, justified there by weight. At a measured
   * 93 kbps, the video had the definition of a thumbnail. A video compresses
   * motion, it does not have that constraint.
   */
  it('exports the video larger and smoother than the gif', () => {
    expect(CYCLE_SIZE.mp4).toBeGreaterThan(CYCLE_SIZE.gif)
    expect(CYCLE_FPS.mp4).toBeGreaterThan(CYCLE_FPS.gif)
    expect(CYCLE_SIZE.mp4).toBeGreaterThanOrEqual(1024)
  })

  /* A GIF's delay is counted in hundredths: 20 fps lands exactly, 30 does not. */
  it('keeps a gif frame rate expressible in hundredths of a second', () => {
    expect(Number.isInteger(100 / CYCLE_FPS.gif)).toBe(true)
  })
})

describe('gif background', () => {
  /* The GIF is the ONLY format that raises the question: only it has 1 bit of alpha. */
  it('only concerns the gif', () => {
    const animated = ACTIONS.filter((a) => a.mode === 'animated' || a.mode === 'gif')
    expect(animated.filter((a) => a.extension === 'gif')).toHaveLength(1)
  })

  it('offers white and transparent, white by default', () => {
    expect(GIF_BACKGROUNDS).toEqual(['white', 'transparent'])
    expect(GIF_BACKGROUNDS).toContain(DEFAULT_GIF_BACKGROUND)
    expect(DEFAULT_GIF_BACKGROUND).toBe('white')
  })

  /* "White background" must be WHITE, not the site's slightly off-white `--paper`. */
  it('paints pure white, and nothing at all when transparent', () => {
    expect(backgroundColor('white')).toBe(WHITE)
    expect(WHITE).toBe('#ffffff')
    expect(backgroundColor('transparent')).toBeNull()
  })
})

describe('markup cleanup', () => {
  it('removes comments without touching the drawing', () => {
    const markup =
      '<defs><!-- the eyes are real holes --><mask id="m">' +
      '<path d="M0 0" fill="#fff"/></mask></defs>' +
      '<g mask="url(#m)"><rect fill="#0a0a0c"/></g>'
    const clean = withoutComments(markup)
    expect(clean).not.toContain('<!--')
    expect(clean).not.toContain('holes')
    // What makes up the drawing must survive intact.
    expect(clean).toContain('fill="#fff"')
    expect(clean).toContain('fill="#0a0a0c"')
    expect(clean).toContain('mask="url(#m)"')
    expect(clean).toContain('d="M0 0"')
  })

  it('removes a multiline comment', () => {
    expect(withoutComments('<a/><!--\n  two\n  lines\n--><b/>')).toBe('<a/><b/>')
  })

  it('leaves a markup without comments as is', () => {
    expect(withoutComments('<circle r="100"/>')).toBe('<circle r="100"/>')
  })
})

describe('file name', () => {
  it('is built on ids, not on labels', () => {
    expect(fileName('droplet', 'neutral', 'ink', 'png')).toBe('sol-de-mayo-droplet-neutral-ink.png')
    expect(fileName('circle', 'hilarious', 'violet', 'svg')).toBe('sol-de-mayo-circle-hilarious-violet.svg')
  })

  /*
   * `App.tsx` reads shape / expression / color back from localStorage without
   * validating them: a tampered value must not be able to compose a path.
   */
  it('lets no path separator through', () => {
    const name = fileName('../../etc/passwd', 'neutral', 'ink', 'png')
    expect(name).not.toContain('/')
    // A single dot, the extension's.
    expect(name.split('.')).toHaveLength(2)
    expect(name.endsWith('.png')).toBe(true)
  })

  /* A montage name must stay readable: "Naïve café", not "navecaf". */
  it('transliterates accents and separates words', () => {
    expect(fileName('Naïve café', '', '', 'mp4')).toBe('sol-de-mayo-naive-cafe.mp4')
    expect(fileName('Über 2026', '', '', 'gif')).toBe('sol-de-mayo-uber-2026.gif')
  })

  it('survives empty ids', () => {
    expect(fileName('', '', '', 'png')).toBe('sol-de-mayo.png')
  })
})
