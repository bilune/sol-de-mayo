import { describe, expect, it } from 'vitest'
import { blockAt, minDurationOf, offsetOf } from '@/bot/cycles'
import { BotEngine } from '@/bot/engine'
import { EXPRESSION_BY_ID } from '@/bot/expressions'
import { SHAPE_BY_ID } from '@/bot/skins'
import { STATE_BY_ID } from '@/bot/states'
import { TOUR_TIME, type GazeScript } from './gaze'
import { INTRO, INTRO_GAZE, POSE_AT, introDue, type Arrival } from './intro'

/** Ordinary arrival: bare URL, direct visit, no reduced-motion preference. */
const arrival = (o: Partial<Arrival> = {}): Arrival => ({
  named: false,
  gallery: false,
  reload: false,
  calm: false,
  ...o
})

describe('arrival trigger', () => {
  it('plays when coming to the site', () => {
    expect(introDue(arrival())).toBe(true)
  })

  it('does not replay on an already open page', () => {
    // reload, back, forward: we are not ARRIVING, we are coming back
    expect(introDue(arrival({ reload: true }))).toBe(false)
  })

  it('makes way for links that target the player or the board', () => {
    // `#state=` already describes a playback: the welcome staging must not be
    // layered on top, otherwise the link does not open what it asks for
    expect(introDue(arrival({ named: true }))).toBe(false)
    // `#board` is the visual verification path: it depends on nothing
    expect(introDue(arrival({ gallery: true }))).toBe(false)
  })

  it('stays quiet when less animation is requested', () => {
    expect(introDue(arrival({ calm: true }))).toBe(false)
  })
})

describe('arrival montage', () => {
  it('lets every animation complete', () => {
    for (const b of INTRO) {
      expect(b.duration, b.state).toBeGreaterThanOrEqual(minDurationOf(b.state))
    }
  })

  /*
   * The engine keeps only one slot of history: a block shorter than the next one's
   * entry fade jumps in the image instead of blending. The general floor
   * (`MIN_BLOCK`) is enough for the catalog states, but the arrival writes its
   * durations by hand.
   */
  it('has no block shorter than the fade of the next one', () => {
    for (let i = 0; i < INTRO.length - 1; i++) {
      const next = STATE_BY_ID.get(INTRO[i + 1]!.state)!
      expect(INTRO[i]!.duration, INTRO[i]!.state).toBeGreaterThanOrEqual(next.morph)
    }
  })

  /*
   * THE lesson from comparing variants, and what would break by slipping a state
   * "that looks nice" into the montage: any state other than rest brings its OWN
   * gaze pose, hence a jump of the eyes on the change. The blink meant to hide it
   * lasts only 0.2 s while the fade lasts 0.3: the eyes reopen midway and it reads
   * as a teleport.
   */
  it('plays only rest, from start to end', () => {
    for (const b of INTRO) {
      expect(b.state, 'another state brings its own gaze pose, hence a jump').toBe('idle')
    }
  })

  it('keeps the chosen shape AND expression', () => {
    // corollary of the previous one, but it is what we SEE: the ball that appears
    // is indeed the user's avatar, with no silhouette or face morph
    for (const b of INTRO) {
      const def = STATE_BY_ID.get(b.state)!
      expect(def.baseBody, b.state).toBe(true)
      expect(def.baseFace, b.state).toBe(true)
    }
  })

  it('places the interface on a block that exists', () => {
    expect(POSE_AT).toBeGreaterThan(0)
    expect(POSE_AT).toBeLessThan(INTRO.length)
  })

  it('lets the gaze turn finish before placing the interface', () => {
    // otherwise the ball leaves to take its place while its eyes are still
    // making the turn: two movements at once, and the turn cut short
    expect(offsetOf(INTRO, POSE_AT)).toBeGreaterThanOrEqual(TOUR_TIME)
  })

  it('hands control back quickly', () => {
    // What matters is not the total duration but the time the interface arrives:
    // after that, the page is usable. So THAT time is what we bound. The Sol de
    // Mayo's arrival is a small scene (the sunrise, `SUNRISE_TIME`), hence 5 s where
    // a plain turn would allow 2.
    expect(offsetOf(INTRO, POSE_AT)).toBeLessThanOrEqual(5)
  })
})

/**
 * The test that locks down the original complaint: "all of a sudden, bam, it
 * teleports".
 *
 * We replay the arrival frame by frame the way the player does — same block
 * sequence, same gaze script — and measure the eyes' displacement from one frame
 * to the next. A jump is exactly that: a single frame where they cover a large
 * distance.
 *
 * The playback logic is reproduced here rather than imported because it lives in
 * a React component, out of reach of these DOM-less tests. It fits in a few
 * lines and follows `SolDeMayo.apply`.
 */
describe('arrival smoothness', () => {
  const circle = SHAPE_BY_ID.get('circle')!.radii
  const neutral = EXPRESSION_BY_ID.get('neutral')!
  const IMAGE = 1 / 60

  /**
   * Largest displacement of the inner eye between two frames, in px.
   *
   * `duringMorph` restricts the measurement to frames following a state change.
   * That is WHERE the teleport happened, and the only window where a large
   * displacement is necessarily a defect: elsewhere it can be the intended
   * trajectory — the gaze turn moves 20 px per frame as it crosses the limb,
   * because a small angle there becomes a large on-screen displacement.
   */
  function worstJump(gaze: GazeScript | null = INTRO_GAZE, duringMorph = false): number {
    const engine = new BotEngine(100, INTRO[0]!.state, circle, neutral)
    const end = offsetOf(INTRO, INTRO.length - 1) + 1
    let currentCycle = 0
    let before: { x: number; y: number } | null = null
    let worst = 0
    /** End time of the current fade, or -1 if no recent state change. */
    let morphUntil = -1

    // seed dated one catch-up earlier, like the component: otherwise the first
    // frame comes out at rest and the second on the script
    if (gaze) engine.setLook(gaze(0), -IMAGE, IMAGE)

    for (let t = 0; t < end; t += IMAGE) {
      const { index } = blockAt(INTRO, t)
      if (index !== currentCycle) {
        const incoming = INTRO[index]!.state
        // `setState` ignores an unchanged state: no fade, hence no window
        if (incoming !== engine.state) morphUntil = t + STATE_BY_ID.get(incoming)!.morph
        engine.setState(incoming, t)
        currentCycle = index
      }
      if (gaze) engine.setLook(gaze(t), t, IMAGE)

      const eye = engine.sample(t).eyes[0]
      if (!eye) {
        // eyes gone behind the ball: nothing to compare, start over cleanly
        before = null
        continue
      }
      const p = /matrix\(([^)]+)\)/.exec(eye.matrix)![1]!.split(',').map(Number)
      const here = { x: p[4]!, y: p[5]! }
      if (before && (!duringMorph || t <= morphUntil)) {
        worst = Math.max(worst, Math.hypot(here.x - before.x, here.y - before.y))
      }
      before = here
    }
    return worst
  }

  it('makes the eyes jump on no state change', () => {
    const jump = worstJump(INTRO_GAZE, true)
    expect(jump, `${jump.toFixed(1)} px during a fade`).toBeLessThan(4)
  })

  /*
   * And the counter-test, without which the previous one would pass on its own:
   * since the montage only has rest blocks, there is NO entry fade to watch. That
   * is precisely what makes the arrival smooth, and it must stay true.
   */
  it('and there is precisely no state fade to go through', () => {
    expect(new Set(INTRO.map((b) => b.state)).size).toBe(1)
  })

  /*
   * Why the ball is ROUND during the turn, whatever the chosen shape (see `shape`
   * in `App.tsx`).
   *
   * The eyes are stuck back onto the actual outline so as not to overflow the
   * silhouette (`radiusAtAngle`). On a circle that radius is constant, so the turn
   * is smooth. On a non-circular shape, they follow the profile and hop — that is
   * what this test measures, and it is an observation, not a defect to fix:
   * `radiusAtAngle` does exactly what it is there for.
   */
  it('a turn on a non-circular shape would make the eyes hop', () => {
    /** Y coordinate of the inner eye frame by frame, `NaN` when it is hidden. */
    const trajectory = (shape: string) => {
      const m = new BotEngine(100, 'idle', SHAPE_BY_ID.get(shape)!.radii, neutral)
      const ys: number[] = []
      for (let t = 0; t < TOUR_TIME; t += IMAGE) {
        m.setLook(INTRO_GAZE(t), t, IMAGE)
        const e = m.sample(t).eyes[0]
        if (!e) {
          ys.push(NaN)
          continue
        }
        ys.push(Number(/matrix\(([^)]+)\)/.exec(e.matrix)![1]!.split(',')[5]))
      }
      return ys
    }

    const rond = trajectory('circle')
    const droplet = trajectory('droplet')
    let gap = 0
    for (let i = 0; i < rond.length; i++) {
      if (Number.isNaN(rond[i]!) || Number.isNaN(droplet[i]!)) continue
      gap = Math.max(gap, Math.abs(droplet[i]! - rond[i]!))
    }
    // on a ball of radius 100: dozens of px, not one or two
    expect(gap, `${gap.toFixed(1)} px of vertical gap from the circle`).toBeGreaterThan(15)
  })

  it('the sunrise keeps the head level, with no jump', () => {
    // The Sol de Mayo rises facing you, head level (a sun looking up would tilt
    // its 3D corona backwards), then hands over to its expression: no jump.
    const look = INTRO_GAZE(1)
    expect(look.pitch).toBe(0)
    expect(look.yaw).toBe(0)
    expect(INTRO_GAZE(10).mix, 'the script ends by handing control back').toBe(0)
    expect(worstJump(INTRO_GAZE), 'no jump').toBeLessThan(5)
  })

})
