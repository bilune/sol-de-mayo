import { describe, expect, it } from 'vitest'
import { BotEngine } from '@/bot/engine'
import { EXPRESSIONS, EXPRESSION_BY_ID, type ExpressionId } from '@/bot/expressions'
import { SHAPE_BY_ID } from '@/bot/skins'
import { STATE_BY_ID } from '@/bot/states'
import {
  MOODS,
  lookTarget,
  PITCH,
  SPIN,
  TOUR_TIME,
  turnLook,
  TURN,
  YAW_MAX,
  type Aim
} from './gaze'

const circle = () => SHAPE_BY_ID.get('circle')!.radii

/** Resting aim: pointer at the bot's center, half-turn completed. */
const aim = (o: Partial<Aim> = {}): Aim => ({ nx: 0, ny: 0, turn: 1, pointer: true, ...o })

describe('gaze target', () => {
  it('lets the pose command before the arrival begins', () => {
    // without a pointer: nothing is driven at all, neither direction nor drift
    const target = lookTarget(aim({ turn: 0, pointer: false }))
    // zero hold: whatever the aimed direction, the pose is in sole command...
    expect(target.mix).toBe(0)
    // ...and a whole turn remains to travel, which is the same angle as zero
    expect(target.spin).toBe(SPIN)

    // what matters is not the field values but the rendered image: at the start,
    // it must be that of a bot that is not driven at all
    const bare = new BotEngine(100, 'idle', circle(), EXPRESSION_BY_ID.get('neutral')!)
    const start = new BotEngine(100, 'idle', circle(), EXPRESSION_BY_ID.get('neutral')!)
    start.setLook(target, 0)
    expect(start.sample(1).eyes[0]!.matrix).toBe(bare.sample(1).eyes[0]!.matrix)
  })

  it('turns the head to the left, toward the panel', () => {
    // negative yaw = the bot looks left
    expect(lookTarget(aim()).yaw).toBe(-TURN)
  })

  it('follows the cursor in the right direction on both axes', () => {
    const left = lookTarget(aim({ nx: -1 }))
    const right = lookTarget(aim({ nx: 1 }))
    expect(right.yaw).toBeGreaterThan(left.yaw)

    // positive pitch = looking up, whereas screen y goes down: this is the sign
    // people get wrong
    expect(lookTarget(aim({ ny: -1 })).pitch).toBeGreaterThan(0)
    expect(lookTarget(aim({ ny: 1 })).pitch).toBeLessThan(0)
  })

  it('unwinds the turn as the arrival progresses', () => {
    expect(lookTarget(aim({ turn: 0.5 })).spin).toBe(SPIN / 2)
    expect(lookTarget(aim({ turn: 1 })).spin).toBe(0)
  })
})

describe('both eyes stay visible', () => {
  /**
   * The invariant that protects the feature: past a certain yaw, the outer eye
   * goes behind the sphere's limb and the engine REMOVES it from the image — the
   * bot ends up one-eyed. So we sweep the 16 expressions across the four corners
   * of the screen, half-turn included.
   */
  it('across the 16 expressions, at the four corners of the screen', () => {
    for (const e of EXPRESSIONS) {
      for (const nx of [-1, 0, 1]) {
        for (const ny of [-1, 0, 1]) {
          const engine = new BotEngine(100, 'idle', circle(), EXPRESSION_BY_ID.get(e.id)!)
          engine.setLook(lookTarget(aim({ nx, ny })), 0)
          const image = engine.sample(1)
          expect(image.eyes, `${e.id} nx=${nx} ny=${ny}`).toHaveLength(2)
          // ...and not merely present: still clearly opaque
          for (const eye of image.eyes) {
            expect(eye.alpha, `${e.id} nx=${nx} ny=${ny}`).toBeGreaterThan(0.5)
          }
        }
      }
    }
  })

  it('keeps a margin: tracking does not go to the breaking point', () => {
    // if this margin disappears, YAW_MAX or TURN has been pushed too far
    const engine = new BotEngine(100, 'idle', circle(), EXPRESSION_BY_ID.get('neutral')!)
    engine.setLook({ yaw: -(TURN + YAW_MAX) - 25, pitch: 0, mix: 1, spin: 0, wander: 0 }, 0)
    expect(engine.sample(1).eyes).toHaveLength(2)
  })
})

describe('the spin on itself', () => {
  it('sends the eyes behind the ball, then brings them back to the left', () => {
    /**
     * This is intended, and it is what makes the swirl: mid-turn the eyes are on
     * the other side of the sphere, so the engine removes them from the image.
     * This test is here so that nobody "fixes" that disappearance thinking it is a
     * bug — and to check that they do come back, in the right place.
     */
    const image = (turn: number) => {
      const engine = new BotEngine(100, 'idle', circle(), EXPRESSION_BY_ID.get('neutral')!)
      engine.setLook(lookTarget(aim({ turn })), 0)
      return engine.sample(1)
    }
    expect(image(0).eyes).toHaveLength(2)
    // halfway, the face is opposite the viewer
    expect(image(0.5).eyes).toHaveLength(0)
    expect(image(1).eyes).toHaveLength(2)

    // ...and a full turn sets the eyes down exactly where a simple half-turn
    // would have put them: that is what makes the landing exact without tuning
    const full = image(1).eyes[0]!.matrix
    const withoutTurn = new BotEngine(100, 'idle', circle(), EXPRESSION_BY_ID.get('neutral')!)
    withoutTurn.setLook({ yaw: -TURN, pitch: PITCH, mix: 1, spin: 0, wander: 0 }, 0)
    expect(full).toBe(withoutTurn.sample(1).eyes[0]!.matrix)
  })
})

describe('arrival turn on the site', () => {
  const bot = (id: ExpressionId) => new BotEngine(100, 'idle', circle(), EXPRESSION_BY_ID.get(id)!)

  /**
   * THE rule of a gaze script, and what makes it maintenance-free: it ends at
   * `mix: 0`, where the state's pose is in sole command. So there is nothing to
   * release — and a release would show up as a last slide of the eyes, right when
   * everything should be settled.
   */
  it('hands control back to the pose at the end', () => {
    expect(turnLook(TOUR_TIME).mix).toBe(0)
    expect(turnLook(TOUR_TIME + 5).spin).toBe(0)
  })

  it('sets the eyes back on the chosen expression, whichever it is', () => {
    for (const id of EXPRESSIONS.map((e) => e.id)) {
      const play = bot(id)
      play.setLook(turnLook(TOUR_TIME), 0)
      expect(play.sample(1).eyes[0]!.matrix, id).toBe(bot(id).sample(1).eyes[0]!.matrix)
    }
  })

  it('lets the bot live during the turn', () => {
    // the drift is not switched off: there is no pointer to follow, so nothing
    // justifies freezing the gaze the way `lookTarget` does
    expect(turnLook(TOUR_TIME / 2).wander).toBe(1)
  })

  it('imposes no direction, at any time', () => {
    // `mix` at zero along the whole path: only `spin` works, which moves the eyes
    // behind the ball instead of sliding them across
    for (const k of [0, 0.25, 0.5, 0.75, 1]) {
      expect(turnLook(k * TOUR_TIME).mix, `turn ${k}`).toBe(0)
    }
  })

  it('the turn starts from a FULL turn, which is already the right angle', () => {
    // -360deg is the same angle as 0: the first frame is already set exactly,
    // and that is what makes the turn land without tuning
    expect(turnLook(0).spin).toBe(SPIN)
    const start = bot('neutral')
    start.setLook(turnLook(0), 0)
    expect(start.sample(1).eyes[0]!.matrix).toBe(bot('neutral').sample(1).eyes[0]!.matrix)
  })

  it('the turn sends the eyes BEHIND the ball', () => {
    // halfway they have crossed the limb, so the engine no longer draws them at
    // all: that is the proof that the turn is a real path ON THE SPHERE and not a
    // slide across the face
    const middle = bot('neutral')
    middle.setLook(turnLook(TOUR_TIME / 2), 0)
    expect(middle.sample(1).eyes).toHaveLength(0)
  })

  /**
   * Why the arrival plays ONLY the rest state, and what we would break by slipping
   * one more state into it.
   *
   * A gaze script can bring the eyes wherever it wants, except on one axis: `Look`
   * deliberately does not touch ROLL — the tilted head is the bot's signature and
   * follows neither the cursor nor a script. Yet each state has its own roll (the
   * wink tilts at +6.7deg whereas rest tilts at -13). Those degrees cannot be
   * anticipated: they jump on the state change, under a 0.2 s blink that does not
   * cover a 0.3 fade.
   */
  it('cannot anticipate the roll, hence an arrival with no state change', () => {
    expect(STATE_BY_ID.get('wink')!.pose(0).gaze.roll).not.toBe(
      EXPRESSION_BY_ID.get('neutral')!.gaze.roll
    )
    expect(turnLook(0)).not.toHaveProperty('roll')
  })
})

describe('gaze stability across expressions', () => {
  /** Y coordinate of the inner eye, in viewBox px (y goes down on screen). */
  const eyeY = (m: BotEngine) =>
    +/matrix\([^,]+,[^,]+,[^,]+,[^,]+,-?[\d.]+,(-?[\d.]+)/.exec(m.sample(1).eyes[0]!.matrix)![1]!

  it('keeps the eyes at the same height, whatever the displayed mood', () => {
    /**
     * The bug we lock down: when pitch was an OFFSET, the eye height followed the
     * expression's. "Neutre" looks at +28.6deg and the moods between -9 and +9, so
     * the eyes dropped abruptly at the first mood change — which reads as a
     * defect, not as an expression.
     */
    const heights = MOODS.map((id) => {
      const m = new BotEngine(100, 'idle', circle(), EXPRESSION_BY_ID.get(id)!)
      m.setLook(lookTarget(aim()), 0)
      return eyeY(m)
    })
    const gap = Math.max(...heights) - Math.min(...heights)
    // on a ball of radius 100: a few pixels, not thirty
    expect(gap, `height gap of ${gap.toFixed(1)} px`).toBeLessThan(4)
  })

  it('without driving, expressions do keep different heights', () => {
    // the counter-test: it is the TRACKING that stabilizes, not the expressions
    // having lost their vertical character
    const heights = EXPRESSIONS.map((e) =>
      eyeY(new BotEngine(100, 'idle', circle(), EXPRESSION_BY_ID.get(e.id)!))
    )
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(30)
  })

  it('only keeps moods with zero roll, otherwise the head tilts', () => {
    // this is the list's criterion, and it cannot be guessed: roll is not
    // neutralized by the tracking, unlike yaw and pitch
    for (const id of MOODS) {
      expect(EXPRESSION_BY_ID.get(id)!.gaze.roll, id).toBe(0)
    }
  })
})
