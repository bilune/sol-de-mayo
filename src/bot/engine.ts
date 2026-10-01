import { arcRender, type ArcRender, type DotRender } from './decor'
import { blendExpression, type BotExpression } from './expressions'
import { eyeOffset } from './eyefit'
import { NEUTRAL_MOUTH, lerpMouth } from './mouth'
import { NEUTRAL_SOL_EYE, lerpSolEye } from './soleyes'
import { solFace } from './solface'
import { EYE_H, EYE_SPLIT, EYE_W, blinkScale, eyePoses, headFrame, liveliness } from './face'
import { clamp, easings, lerp, r2 } from './math'
import {
  blend,
  capsulePath,
  closedPath,
  radiusAtAngle,
  toPoints,
  type Point,
  type Silhouette
} from './shape'
import { STATE_BY_ID, type EyeCfg, type Pose, type StateDef, type StateId } from './states'
import { flagToSphere, type FeatureRender, type RaysRender } from './sun'

export interface RenderedEye {
  d: string
  matrix: string
  alpha: number
}

export interface BotFrame {
  bodyPath: string
  bodyAlpha: number
  eyes: RenderedEye[]
  dots: DotRender[]
  /** true = the dots go behind the body (burst particles) */
  dotsBehind: boolean
  arcs: ArcRender[]
  notif: { x: number; y: number; r: number } | null
  notch: { x: number; y: number; r: number } | null
  /** Sol de Mayo corona (`sun.ts`), drawn behind the body; null when off */
  rays: RaysRender | null
  /** Sol de Mayo brows, nose, lips and chin, wrapped on the same sphere as the eyes */
  features: FeatureRender[]
}

/**
 * How much a brow rises per unit of extra eye WIDTH, on top of the extra height:
 * a wider capsule has a flatter, higher top. Tuned by eye.
 */
const BROW_LIFT_PER_WIDTH = 0.3

/**
 * A face feature starts fading this far from the sphere's centre (in sphere
 * radii) and is gone by `FEATURE_EDGE`.
 */
const FEATURE_FADE = 0.84
const FEATURE_EDGE = 0.93

/** Flag units -> sphere, pinned to the bot's resting eye spacing. */
const FLAG_SPHERE = flagToSphere(EYE_SPLIT)

/**
 * Where the bot looks when something external drives it: the mouse pointer,
 * today.
 *
 * `yaw` and `pitch` are ABSOLUTE directions, which replace the pose's own as
 * `mix` rises. Two reasons, each a trap already fallen into:
 *
 * - the ENGINE must do this blend, not the caller, because only it knows the
 *   pose AT THIS INSTANT. A caller compensating for the expression's orientation
 *   would read its target value while the morph is still in progress, and the
 *   eyes jumped on every mood change;
 * - and it must be absolute on BOTH axes. In relative mode, the eye height
 *   followed each expression's: "neutral" looks at +28.6deg while the others
 *   are between -9 and +9, so the eyes dropped abruptly on the first mood
 *   change. What gives an expression its character during tracking is the
 *   SHAPE of its eyes (squinted, round, asymmetric), not where it looks: the
 *   cursor decides that.
 *
 * `mix` says how much the outside controls the DIRECTION (0 = not at all).
 *
 * `wander` says, separately, how much automatic drift remains. The two must not
 * be conflated: when the pointer moves, the drift must fade out; combined, the
 * bot would look like it was searching for the cursor without ever holding it.
 * But when there is NO pointer (arrival by keyboard, touch, or mouse out of the
 * window), the head must stay turned AND keep living. Conflating them froze the
 * gaze as soon as the view opened.
 *
 * `spin` is a turn to travel ALONG THE WAY, in degrees, faded out to 0 on
 * arrival. Since the eyes live on a sphere, a turn takes them behind the ball
 * and back around the other side, and since `-360deg` is the same angle as
 * `0`, it changes nothing about where they land.
 */
export interface Look {
  yaw: number
  pitch: number
  mix: number
  spin: number
  wander: number
}

const NO_LOOK: Look = { yaw: 0, pitch: 0, mix: 0, spin: 0, wander: 1 }

const lerpLook = (a: Look, b: Look, t: number): Look => ({
  yaw: lerp(a.yaw, b.yaw, t),
  pitch: lerp(a.pitch, b.pitch, t),
  mix: lerp(a.mix, b.mix, t),
  spin: lerp(a.spin, b.spin, t),
  wander: lerp(a.wander, b.wander, t)
})

const lerpEye = (a: Pose['eyes'][number], b: Pose['eyes'][number], t: number) => ({
  w: lerp(a.w, b.w, t),
  h: lerp(a.h, b.h, t),
  open: lerp(a.open, b.open, t),
  tilt: lerp(a.tilt ?? 0, b.tilt ?? 0, t),
  browLift: lerp(a.browLift ?? 0, b.browLift ?? 0, t),
  browTilt: lerp(a.browTilt ?? 0, b.browTilt ?? 0, t),
  sol: lerpSolEye(a.sol ?? NEUTRAL_SOL_EYE, b.sol ?? NEUTRAL_SOL_EYE, t)
})

/** Interpolation of two poses. The decor cross-fades in opacity, not in geometry. */
function blendPose(a: Pose, b: Pose, t: number): Pose {
  const out = 1 - t
  return {
    sil: blend(a.sil, b.sil, t),
    offX: lerp(a.offX, b.offX, t),
    offY: lerp(a.offY, b.offY, t),
    gaze: {
      yaw: lerp(a.gaze.yaw, b.gaze.yaw, t),
      pitch: lerp(a.gaze.pitch, b.gaze.pitch, t),
      roll: lerp(a.gaze.roll, b.gaze.roll, t)
    },
    split: lerp(a.split, b.split, t),
    eyes: [lerpEye(a.eyes[0], b.eyes[0], t), lerpEye(a.eyes[1], b.eyes[1], t)],
    eyeAlpha: lerp(a.eyeAlpha, b.eyeAlpha, t),
    bodyAlpha: lerp(a.bodyAlpha, b.bodyAlpha, t),
    dots: [
      ...a.dots.map((d) => ({ ...d, opacity: d.opacity * out })),
      ...b.dots.map((d) => ({ ...d, opacity: d.opacity * t }))
    ],
    arcs: [
      ...a.arcs.map((r) => ({ ...r, id: `a${r.id}`, opacity: r.opacity * out })),
      ...b.arcs.map((r) => ({ ...r, id: `b${r.id}`, opacity: r.opacity * t }))
    ],
    // the badge belongs to only one of the two states, it does not blend
    notif: t < 0.5 ? a.notif : b.notif,
    dotsBehind: t < 0.5 ? a.dotsBehind : b.dotsBehind,
    mouth: lerpMouth(a.mouth ?? NEUTRAL_MOUTH, b.mouth ?? NEUTRAL_MOUTH, t)
  }
}

/**
 * Clockless engine: `sample(t)` is a pure function of time.
 *
 * Practical consequence: pause, resume, slow motion and jumping to an arbitrary
 * time give exactly the same image, and rendering is testable without a DOM.
 */
export class BotEngine {
  /** radius of the resting ball, in viewBox units */
  readonly scale: number

  private cur: StateId
  private prev: StateId | null = null
  /**
   * FROZEN starting pose, set only when a state change arrives while a fade is already
   * in progress. See `setState`.
   */
  private frozenStart: Pose | null = null
  private tCur = 0
  private tPrev = 0
  private blinkAt = -10
  private pts: Point[] = []
  private shape: number[] | null = null
  private shapePrev: number[] | null = null
  private shapeAt = -10
  private expr: BotExpression | null = null
  private exprPrev: BotExpression | null = null
  private exprAt = -10
  private look: Look = NO_LOOK
  private lookPrev: Look = NO_LOOK
  private lookAt = -10
  /** current catch-up duration; see `LOOK_MORPH`, its default value */
  private lookMorph = 0.24

  /** morph duration when the body shape changes */
  static readonly SHAPE_MORPH = 0.45

  /**
   * Catch-up duration of the gaze toward its target. Shorter than `SHAPE_MORPH`:
   * a tracking gaze must feel attentive, not viscous. Since the target is reset
   * on every mouse move, this duration is what gives the tracking its inertia:
   * the gaze never quite reaches a moving cursor.
   */
  static readonly LOOK_MORPH = 0.24

  constructor(
    scale = 100,
    initial: StateId = 'idle',
    shape: number[] | null = null,
    expression: BotExpression | null = null,
    readonly sun = false
  ) {
    this.scale = scale
    this.cur = initial
    this.shape = shape
    this.expr = expression
  }

  /**
   * Resting expression chosen in the customizer. Like the shape, it glides
   * toward the new value instead of jumping.
   */
  setExpression(expression: BotExpression | null, now = 0) {
    if (expression === this.expr) return
    this.exprPrev = this.expr
    this.expr = expression
    this.exprAt = now
  }

  /** Effective expression at instant `now`, including any morph in progress. */
  private exprAtTime(now: number): BotExpression | null {
    const to = this.expr
    const from = this.exprPrev
    if (!to || !from) return to
    const k = (now - this.exprAt) / BotEngine.SHAPE_MORPH
    if (k >= 1) return to
    return blendExpression(from, to, easings.easeOutQuint(clamp(k)))
  }

  /**
   * Shape chosen in the customizer. It only replaces the body on resting states
   * (`baseBody`): on the others, the silhouette IS the animation and must not be
   * overwritten.
   *
   * The change is a morph, not a cut: since all shapes are sampled at the same
   * angles, interpolating the radii is enough.
   */
  setShape(radii: number[] | null, now = 0) {
    if (radii === this.shape) return
    this.shapePrev = this.shape
    this.shape = radii
    this.shapeAt = now
  }

  /**
   * Effective shape at instant `now`, including any morph in progress.
   *
   * Does NOT reset `shapePrev` to null at the end of the morph: `sample` must stay
   * a pure function of time, so re-reading a past time must give back the
   * intermediate image. We just keep one extra reference.
   */
  private shapeAtTime(now: number): number[] | null {
    const to = this.shape
    const from = this.shapePrev
    if (!to || !from) return to
    const k = (now - this.shapeAt) / BotEngine.SHAPE_MORPH
    if (k >= 1) return to
    const t = easings.easeOutQuint(clamp(k))
    // allocates only during the morph; outside of it the array is returned as is
    return to.map((r, i) => lerp(from[i] ?? r, r, t))
  }

  /**
   * New gaze target, `null` to go back to the state's own.
   *
   * It restarts from the CURRENT value, not from the previous target like
   * `setShape`: this method is called on every pointer move, and restarting
   * from the old target would pull the gaze back one notch before each
   * catch-up, so the tracking would tremble instead of glide.
   *
   * Same contract as `setShape` otherwise: external state comes in through a
   * timestamped setter, never through a variable read during `sample`,
   * otherwise the engine stops being a pure function of time.
   */
  setLook(look: Look | null, now: number, morph = BotEngine.LOOK_MORPH) {
    /*
     * A non-finite target is rejected. The engine KEEPS the last one: a `NaN`
     * set a single time would propagate to every frame and the bot would never
     * settle again. It really happened: a `getBoundingClientRect` on a
     * zero-size box gives `0 / 0` in the caller. That one is fixed, but the
     * engine should not depend on its callers' caution to stay replayable.
     */
    if (look && !Number.isFinite(look.yaw + look.pitch + look.mix + look.spin + look.wander)) {
      return
    }
    this.lookPrev = this.lookAtTime(now)
    this.look = look ?? NO_LOOK
    this.lookAt = now
    this.lookMorph = morph
  }

  /** Effective gaze at instant `now`, including any catch-up in progress. */
  private lookAtTime(now: number): Look {
    const k = (now - this.lookAt) / this.lookMorph
    if (k >= 1) return this.look
    return lerpLook(this.lookPrev, this.look, easings.easeOutQuint(clamp(k)))
  }

  private posed(
    def: StateDef,
    t: number,
    shape: number[] | null,
    expr: BotExpression | null
  ): Pose {
    let pose = def.pose(t)
    if (def.baseBody && shape) {
      // keep the pose (rotation, offset, squash) and swap only the profile
      pose = { ...pose, sil: { ...pose.sil, radii: shape } }
    }
    if (def.baseFace && expr) {
      pose = { ...pose, gaze: expr.gaze, split: expr.split, eyes: expr.eyes, mouth: expr.mouth }
    }
    return pose
  }

  /**
   * Eye offset at instant `now` for a given state, in ball-radius units.
   *
   * It is READ from a table and interpolated, never recomputed: `eyefit.ts` explains
   * why this distinction is the whole fix. All that remains here is to interpolate it
   * along the shape axis, with exactly the curve and duration of the silhouette morph,
   * since it is the same cause and so must be the same motion.
   *
   * The table is queried at the morph's ENDPOINTS (`shapePrev` and `shape`) and not at
   * the profile returned by `shapeAtTime`: that one is a fresh array allocated every
   * frame, so it has no identity and exists in no table.
   */
  private offsetAtTime(now: number, state: StateId): { x: number; y: number } {
    /**
     * One morph axis: read the table at its two ENDPOINTS and interpolate with its
     * curve. Never at the interpolated value: that one has no identity and exists in
     * no table, and feeding it that value is what made previous versions tremble.
     */
    const onAxis = (
      start: number,
      duration: number,
      a: { x: number; y: number },
      b: { x: number; y: number }
    ) => {
      if (a === b) return b
      const k = (now - start) / duration
      if (k >= 1) return b
      const t = easings.easeOutQuint(clamp(k))
      return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }
    }

    // expression axis, for each of the two shapes involved
    const perShape = (radii: number[] | null) =>
      onAxis(
        this.exprAt,
        BotEngine.SHAPE_MORPH,
        eyeOffset(radii, state, this.exprPrev?.id ?? null),
        eyeOffset(radii, state, this.expr?.id ?? null)
      )

    // then the shape axis
    return onAxis(
      this.shapeAt,
      BotEngine.SHAPE_MORPH,
      perShape(this.shapePrev),
      perShape(this.shape)
    )
  }

  get state(): StateId {
    return this.cur
  }

  /**
   * Restarts on `id` WITHOUT a previous state, like a fresh engine set on that state.
   *
   * This is what "rewind" means for this engine. `setState` alone cannot do it: it keeps
   * the state it left in order to fade it, which is exactly its role during playback,
   * and exactly what must not happen when going back to the start of a sequence.
   * Replaying frame 0 after a full pass blended the first state with the LAST one, and
   * the GIF export opened on an eyeless ball, since the comet has a zero `eyeAlpha`.
   *
   * `sample` stays a pure function of time: like `setState`, this is a TIMESTAMPED
   * setter, called by the sequence driver, never during sampling.
   */
  reset(id: StateId, now: number) {
    this.cur = id
    this.prev = null
    this.frozenStart = null
    this.tCur = now
    this.tPrev = now
    this.blinkAt = -10
  }

  /**
   * Origin of the fade in progress: the frozen pose if there is one, otherwise the state
   * being left, evaluated at its own elapsed time, so still animating, which is intended.
   */
  private origin(now: number, shape: number[] | null, expr: BotExpression | null): Pose | null {
    if (this.frozenStart) return this.frozenStart
    if (!this.prev) return null
    const prevDef = STATE_BY_ID.get(this.prev)!
    return this.posed(prevDef, Math.max(0, now - this.tPrev), shape, expr)
  }

  /**
   * Composite pose at instant `now`, including any fade in progress: exactly what `sample`
   * blends, before the resting-life and gaze layer. Extracted so that `setState` can
   * freeze it.
   */
  private compositePose(now: number): Pose {
    const def = STATE_BY_ID.get(this.cur)!
    const shape = this.shapeAtTime(now)
    const expr = this.exprAtTime(now)
    const pose = this.posed(def, Math.max(0, now - this.tCur), shape, expr)
    const since = now - this.tCur
    if (since >= def.morph) return pose
    const origin = this.origin(now, shape, expr)
    if (!origin) return pose
    return blendPose(origin, pose, easings.easeOutQuint(clamp(since / def.morph)))
  }

  /**
   * Timestamped state change.
   *
   * The engine keeps only ONE slot of history, so a change arriving during a fade used to
   * replace the blend's origin with the FULL pose of the state being left, instead of the
   * partially blended image that was on screen. Measured on `idle -> wide -> idle` at
   * 100 ms: a 35.9 px jump versus 8.0 px of normal motion.
   *
   * So the current composite pose is frozen and blended from. Continuous by construction,
   * however many changes are chained.
   *
   * And ONLY in that case. Freezing on every change would abruptly stop the animation of
   * the state being left for the whole fade (the "!" of `alert` would freeze mid-course),
   * while there is nothing to correct outside a morph: the state being left is already
   * exactly the displayed image there. Playing back a montage, whose blocks last at least
   * as long as the longest fade (`MIN_BLOCK`), therefore never freezes anything and
   * renders bit for bit what it used to.
   */
  setState(id: StateId, now: number) {
    if (id === this.cur) return
    const morph = STATE_BY_ID.get(this.cur)!.morph
    const midFade = this.prev !== null && now - this.tCur < morph
    this.frozenStart = midFade ? this.compositePose(now) : null
    this.prev = this.cur
    this.tPrev = this.tCur
    this.cur = id
    this.tCur = now
    // Every shape change is masked by a blink.
    if (STATE_BY_ID.get(id)?.blinkIn) this.blinkAt = now
  }

  sample(now: number): BotFrame {
    const R = this.scale
    const def = STATE_BY_ID.get(this.cur)!
    const shape = this.shapeAtTime(now)
    const expr = this.exprAtTime(now)
    let pose = this.posed(def, Math.max(0, now - this.tCur), shape, expr)
    let offset = this.offsetAtTime(now, this.cur)

    // --- transition -------------------------------------------------------
    const since = now - this.tCur
    // The previous state is never purged: `since < def.morph` is enough to
    // ignore it once the fade is over, and forgetting it would make the engine
    // non-replayable: re-reading a time before the end of the fade would no
    // longer find it. The optimization that looks innocent and breaks everything.
    const origin = since < def.morph ? this.origin(now, shape, expr) : null
    if (origin) {
      // Exponential ease-out: this is the measured curve. The body
      // has no overshoot (only the badge and the eye opening do).
      // The ratio is clamped: re-reading a time BEFORE the state change would
      // give a negative ratio, which the ease-out extrapolates, and the
      // silhouette then flies thirty times too far.
      const ratio = easings.easeOutQuint(clamp(since / def.morph))
      pose = blendPose(origin, pose, ratio)
      // The eye offset follows the SAME curve as the silhouette that drives it. It comes
      // from the state being left, which `setState` always sets together with the origin;
      // the check is there for typing, not for a real case.
      const leaving = this.prev
      if (leaving) {
        const before = this.offsetAtTime(now, leaving)
        offset = {
          x: lerp(before.x, offset.x, ratio),
          y: lerp(before.y, offset.y, ratio)
        }
      }
    }

    // --- resting life -----------------------------------------------------
    const alive = pose.eyeAlpha > 0.01
    const look = this.lookAtTime(now)
    const life = liveliness(now, { wander: alive ? look.wander : 0, blink: alive })

    const gaze = {
      // Both aims REPLACE the pose's instead of adding to them (see `Look`), and
      // the spin is subtracted along the way. The drift is added AFTER the blend,
      // otherwise the target would cancel it along with the pose, and it must
      // survive a turned head with no pointer.
      yaw: lerp(pose.gaze.yaw, look.yaw, look.mix) + life.dYaw - look.spin,
      pitch: lerp(pose.gaze.pitch, look.pitch, look.mix) + life.dPitch,
      // the roll, for its part, follows nothing: the bot's head is tilted -13deg,
      // and rolling it with the cursor breaks that signature. The
      // Sol de Mayo, though, stands upright, as on the flag: no roll at all.
      roll: this.sun ? 0 : pose.gaze.roll + life.dRoll
    }

    // blink triggered by the state change, on top of the schedule
    const forced = clamp((now - this.blinkAt) / 0.2)
    const forcedLid = forced < 1 ? Math.abs(forced * 2 - 1) : 1
    const lid = Math.min(life.lid, forcedLid)

    const offX = pose.offX + life.driftX
    const offY = pose.offY + life.driftY

    // --- body -------------------------------------------------------------
    const sil: Silhouette = {
      ...pose.sil,
      cx: pose.sil.cx + offX,
      cy: pose.sil.cy + offY,
      sy: pose.sil.sy * life.breath
    }
    const bodyPath = closedPath(toPoints(sil, R, this.pts))

    // --- eyes -------------------------------------------------------------
    // The eyes live on a sphere of radius 1; as soon as the silhouette is no
    // longer a circle, they are scaled to the actual radius in their direction,
    // otherwise they overflow and the mask clips them.
    const bodyRadius = (x: number, y: number) =>
      radiusAtAngle(pose.sil.radii, Math.atan2(y, x) - pose.sil.rot)

    const eyes: RenderedEye[] = []
    if (pose.eyeAlpha > 0.01) {
      const poses = eyePoses(gaze, R, pose.split)
      for (let i = 0; i < 2; i++) {
        const e = poses[i]!
        if (e.depth <= 0.02) continue
        const cfg = pose.eyes[i]!
        const fit = bodyRadius(e.x, e.y)
        // The eye's own tilt: the tangent frame is composed with a rotation in
        // the eye's plane (Basis x Rot). This is what allows mirrored tilts
        // between the two eyes.
        const phi = ((cfg.tilt ?? 0) * Math.PI) / 180
        const cp = Math.cos(phi)
        const sp = Math.sin(phi)
        const ax = e.a * cp + e.c * sp
        const ay = e.b * cp + e.d * sp
        const cx2 = -e.a * sp + e.c * cp
        const cy2 = -e.b * sp + e.d * cp
        // The blink is applied AFTER all that: it is a vertical squash on
        // screen, not along the capsule's axis.
        const k = blinkScale(Math.min(lid, cfg.open))
        eyes.push({
          d: capsulePath(cfg.w * R, cfg.h * R),
          matrix: `matrix(${r2(ax)},${r2(ay * k)},${r2(cx2)},${r2(cy2 * k)},${r2(e.x * fit + (offX + offset.x) * R)},${r2(e.y * fit + (offY + offset.y) * R)})`,
          alpha: pose.eyeAlpha * clamp(e.depth / 0.12)
        })
      }
    }

    // --- Sol de Mayo face ----------------------------------------------------
    // The face is drawn in the flag's own units (`solface.ts`), then wrapped onto
    // the same sphere as the eyes, POINT BY POINT: every point of every stroke
    // lands where it would on a real ball, so strokes curve with the head and
    // parts that touch on the flag (the brow and the side of the nose) stay
    // joined whatever the head does. It fades with the eyes, so states without a
    // face (thinking, alert...) lose it too.
    const features: FeatureRender[] = []
    if (this.sun && pose.eyeAlpha > 0.01) {
      const { f, right, down } = headFrame(gaze)
      const k = FLAG_SPHERE.k
      const capsule = (eye: EyeCfg) =>
        Math.max(0, (eye.h - EYE_H) / 2 + (eye.w - EYE_W) * BROW_LIFT_PER_WIDTH) / k
      const parts = solFace({
        pose,
        blink: blinkScale(lid),
        capsuleClearance: [capsule(pose.eyes[0]), capsule(pose.eyes[1])],
        perFlagUnit: k
      })
      const ox = (offX + offset.x) * R
      const oy = (offY + offset.y) * R

      // a flag point on the sphere, then on screen
      const wrap = (fx: number, fy: number) => {
        const at = FLAG_SPHERE.at(fx, fy)
        let x = at.x
        let y = at.y
        // held just inside the edge: past it the sphere has no surface to land on
        const reach = Math.hypot(x, y)
        if (reach > FEATURE_EDGE) {
          x *= FEATURE_EDGE / reach
          y *= FEATURE_EDGE / reach
        }
        const z = Math.sqrt(Math.max(0, 1 - x * x - y * y))
        const px = x * right[0] + y * down[0] + z * f[0]
        const py = x * right[1] + y * down[1] + z * f[1]
        const pz = x * right[2] + y * down[2] + z * f[2]
        const fit = bodyRadius(px, py)
        return { x: px * fit * R + ox, y: py * fit * R + oy, z: pz, reach }
      }

      for (const part of parts) {
        // Near the sphere's edge a part fades out where it is, judged at its
        // anchor: moving it back in would pile it onto its neighbours.
        const anchor = wrap(part.anchor.x, part.anchor.y)
        const fade = clamp(1 - (anchor.reach - FEATURE_FADE) / (FEATURE_EDGE - FEATURE_FADE))
        const alpha = pose.eyeAlpha * clamp(anchor.z / 0.12) * fade
        if (alpha <= 0.01) continue
        features.push({
          id: part.id,
          paths: part.polys.map((poly) => closedPath(poly.map((p) => wrap(p.x, p.y)))),
          alpha
        })
      }
    }

    // --- decor ------------------------------------------------------------
    const dots = pose.dots
      .filter((p) => p.opacity > 0.01 && p.r > 0.0005)
      .map((p) => ({ ...p, x: (p.x + offX) * R, y: (p.y + offY) * R, r: p.r * R }))

    // the badge sits on the outline, so it follows the shape too
    const nFit = pose.notif ? bodyRadius(pose.notif.x, pose.notif.y) : 1
    const nx = pose.notif ? (pose.notif.x * nFit + offX) * R : 0
    const ny = pose.notif ? (pose.notif.y * nFit + offY) * R : 0
    const notif = pose.notif ? { x: nx, y: ny, r: pose.notif.r * R } : null
    const notch = pose.notif ? { x: nx, y: ny, r: pose.notif.notch * R } : null

    return {
      bodyPath,
      bodyAlpha: pose.bodyAlpha,
      eyes,
      dots,
      dotsBehind: pose.dotsBehind,
      // States declare arcs in ball-radius units; the engine is the only one
      // that knows the viewBox scale, so it does the drawing.
      arcs: pose.arcs
        .filter((a) => a.opacity > 0.01)
        .map((a) => arcRender(a.seed, a.t, R, a.id, a.opacity)),
      notif,
      notch,
      rays: this.sun ? this.raysAt(sil, gaze) : null,
      features
    }
  }

  /** The corona sits on the body's centre, drift included. */
  private raysAt(sil: Silhouette, gaze: { yaw: number; pitch: number; roll: number }): RaysRender {
    // the head's actual orientation, the same one that places the eyes
    const { right, down, f } = headFrame(gaze)
    return { x: sil.cx * this.scale, y: sil.cy * this.scale, right, down, f }
  }
}
