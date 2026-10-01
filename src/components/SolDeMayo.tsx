'use client'

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react'
import { NOTIF_BLUE } from '@/bot/decor'
import { BotEngine, type BotFrame } from '@/bot/engine'
import { clamp, easings } from '@/bot/math'
import { t, useLanguage } from '@/i18n'
import { lookTarget, TURN_TIME, type GazeScript } from '@/ui/gaze'
import { DEFAULT_EXPRESSION, EXPRESSION_BY_ID } from '@/bot/expressions'
import { COLOR_BY_ID, DEFAULT_COLOR, DEFAULT_SHAPE, SHAPE_BY_ID, mixHex } from '@/bot/skins'
import { blockAt, defaultCycle, offsetOf, type Block } from '@/bot/cycles'
import { HALF_VIEWBOX, RADIUS } from '@/bot/coords'
import Corona3D from '@/components/Corona3D'
import {
  FLAG_FACE,
  FLAG_FACE_LINE,
  FLAG_RAY_LINE,
  FLAG_STRAIGHT,
  FLAG_STRAIGHT_INNER,
  FLAG_TURNS,
  FLAG_WAVY,
  FLAG_WAVY_INNER,
  FLAG_WAVY_TURN,
  SUN,
  SUN_COLORS,
  SUN_EYES,
  SUN_SCALE
} from '@/bot/sun'
import { STATE_BY_ID, type StateId } from '@/bot/states'

/** What a parent can drive imperatively: the playhead, the offline renderer, the node. */
export interface SolDeMayoHandle {
  seek: (index: number, offset?: number) => void
  renderAt: (t: number) => void
  /** The live `<svg>`, serialised as-is by the still exports. */
  readonly svg: SVGSVGElement | null
}

export interface SolDeMayoProps {
  size?: number
  /** customiser shape id */
  shape?: string
  /** customiser colour id */
  color?: string
  /** customiser rest expression id */
  expression?: string
  /** page background, used for the particles' depth haze and behind the eye holes */
  paper?: string
  /**
   * Freezes the render at this date (seconds since the state began). The engine
   * being a pure function of time, this yields a pixel-reproducible image with no
   * animation loop: used for the state board, the customiser tiles and tests.
   */
  frozenAt?: number
  /**
   * Montage played by the player: a sequence of states, each held for its block's
   * duration. Falls back to the default cycle.
   */
  cycle?: Block[]
  /**
   * The gaze follows the pointer. Out of reach of frozen tiles, which have no
   * animation loop: wiring them would wake as many loops as there are tiles.
   */
  follow?: boolean
  /**
   * Scripted gaze of the arrival, evaluated every frame with the time elapsed
   * since it was set. Independent from `follow`.
   */
  gaze?: GazeScript | null
  className?: string
  /**
   * Sol de Mayo corona. Off, the ball takes back its full size (thumbnails,
   * where the rays would hide the face). Read once, at mount.
   */
  rays?: boolean
  /**
   * Draw the corona in real 3D (WebGL, `Corona3D`) instead of flat SVG. Only for
   * the live avatar: the SVG export and the thumbnails keep the flat corona.
   */
  corona3d?: boolean
  /** Extra pixel density of the 3D corona, for when the avatar is scaled up in CSS. */
  coronaResolution?: number

  /*
   * The four "models". Each one is a value plus a
   * change callback. The component keeps its own copy, updated immediately when it
   * writes, and re-reads the prop whenever the parent changes it.
   */

  /**
   * The playback cursor is a BLOCK INDEX, not a state: a montage can play the same
   * state twice, and you then need to know which of the two you're in. `state`
   * follows the current block — it's an output; the outside drives playback
   * through `block`.
   */
  block?: number
  onBlockChange?: (block: number) => void
  state?: StateId
  onStateChange?: (state: StateId) => void
  /** Read-only here: the component never writes it, unlike the three others. */
  playing?: boolean
  /** Time elapsed in the current block, for the timeline's playhead. */
  elapsed?: number
  onElapsedChange?: (elapsed: number) => void

  ref?: Ref<SolDeMayoHandle | null>
}

const DEFAULT_CYCLE = defaultCycle().blocks

// The frame of reference comes from `src/bot/`: it defines what the engine
// renders, the component is only a client of it. The short names stay, they're
// everywhere in the markup.
const VB = HALF_VIEWBOX
/**
 * Framing without the corona: the screen margin houses rays and rings, which a
 * thumbnail doesn't draw, so it frames the ball tight and the face reads bigger.
 */
const VB_WITHOUT_RAYS = 112

/**
 * Short catch-up, where pointer tracking uses the engine's own: the script IS
 * the animation, and letting the engine smooth it by a further second would
 * delay its start. Not zero though: at zero, `lookAtTime` divides zero by zero on
 * the frame the target is set, and a `NaN` settles in the engine for good.
 */
const SCRIPT_MORPH = 1 / 60

/** Sentinel for "this effect has never run", so the first pass always runs. */
const NEVER = Symbol('never')

export default function SolDeMayo({
  size = 320,
  shape = DEFAULT_SHAPE,
  color = DEFAULT_COLOR,
  expression: expressionId = DEFAULT_EXPRESSION,
  paper = '#f9f9f9',
  frozenAt,
  cycle = DEFAULT_CYCLE,
  follow = false,
  gaze = null,
  className,
  rays = true,
  corona3d = false,
  coronaResolution = 1,
  block: blockProp,
  onBlockChange,
  state: stateProp,
  onStateChange,
  playing: playingProp,
  elapsed: elapsedProp,
  onElapsedChange,
  ref
}: SolDeMayoProps) {
  useLanguage()

  // the ball shrinks to make room for the corona, only when the corona is drawn
  const R = SUN && rays ? SUN_SCALE : RADIUS
  const shapeRadii = SHAPE_BY_ID.get(shape)?.radii ?? null
  const ink = SUN ? SUN_COLORS.body : (COLOR_BY_ID.get(color)?.hex ?? '#0a0a0c')
  const expression = EXPRESSION_BY_ID.get(expressionId) ?? null

  /*
   * Everything the animation loop reads lives in refs: the loop runs outside
   * React's render cycle, and must always see the latest props without being
   * restarted. `p` is refreshed by the first layout effect below, before any of
   * the "watchers" read it.
   */
  const p = useRef({
    cycle,
    follow,
    gaze,
    frozenAt,
    blockProp,
    onBlockChange,
    onStateChange,
    onElapsedChange
  })

  // Local copies of the models: written immediately by the component, then
  // overwritten by the parent's value when it changes.
  const block = useRef(blockProp ?? 0)
  const state = useRef<StateId>(stateProp ?? 'idle')
  const playing = useRef(playingProp ?? false)
  const elapsed = useRef(elapsedProp ?? 0)

  const engineRef = useRef<BotEngine | null>(null)
  if (!engineRef.current) {
    engineRef.current = new BotEngine(R, state.current, shapeRadii, expression, SUN)
  }
  const engine = engineRef.current

  const [frame, setFrame] = useState<BotFrame>(() => engine.sample(frozenAt ?? 0))
  const [uid] = useState(() => Math.random().toString(36).slice(2, 8))
  // the flat corona stands in until the 3D one has drawn its first frame
  const [corona3dReady, setCorona3dReady] = useState(false)
  const maskId = `bot-mask-${uid}`
  const svgRef = useRef<SVGSVGElement | null>(null)

  /*
   * Mutable player state, kept outside React's render cycle. One
   * object so every helper below can be a plain closure over it.
   */
  const m = useRef({
    raf: 0,
    nextAt: Infinity,
    last: 0,
    clock: 0,
    /** Clock date at which the current block started. */
    blockStart: 0,
    /** Offset waiting for the `block` watcher, see `seek`. */
    pendingOffset: 0,
    /** Last block `renderAt` laid on the engine. */
    lastBlock: -1,
    /** Last known pointer position, in client coordinates. */
    pointer: null as { x: number; y: number } | null,
    /** true = a target is set on the engine, so there's something to release. */
    aiming: false,
    /** Clock date at which the half-turn started. */
    turnSince: 0,
    /** Clock date at which the gaze script was set. */
    gazeSince: 0,
    /** true = a script is running, so there's something to release. */
    scripted: false
  }).current

  /* ---------------------------------------------------------- model writes */

  function setBlock(i: number) {
    block.current = i
    p.current.onBlockChange?.(i)
  }
  function setState(id: StateId) {
    if (state.current === id) return
    state.current = id
    p.current.onStateChange?.(id)
  }
  function setElapsed(v: number) {
    elapsed.current = v
    p.current.onElapsedChange?.(v)
  }

  /* -------------------------------------------------------------- playback */

  /**
   * Lays block `i`: state, engine, and end date. Called by the loop as well as by
   * the watcher, hence no side effect on `block` — the caller decides whether it
   * moves the cursor.
   */
  function apply(i: number, from = 0) {
    const b = p.current.cycle[i]
    if (!b) {
      m.nextAt = Infinity
      return
    }
    m.blockStart = m.clock - from
    setElapsed(from)
    setState(b.state)
    engine.setState(b.state, m.clock)
    m.nextAt = playing.current ? m.blockStart + b.duration : Infinity
  }

  /** Moves the cursor and re-syncs the engine in one go, without the watcher. */
  function goToBlock(i: number) {
    setBlock(i)
    apply(i)
  }

  /**
   * Playhead moved from the timeline: we land in the middle of a block, not at its
   * start. The offset goes through a variable rather than a direct `apply`:
   * changing `block` fires the watcher, which must lay the same date as us —
   * otherwise it would reset the block to zero right after.
   */
  function seek(index: number, offset = 0) {
    if (block.current === index) {
      apply(index, offset)
      return
    }
    m.pendingOffset = offset
    setBlock(index)
    // Uncontrolled: no parent will echo the change back, so run the watcher now.
    if (p.current.blockProp === undefined) onBlock(index)
  }

  /**
   * Renders the MONTAGE at absolute date `t`, with no clock. That's what allows
   * capturing a whole cycle off-screen, frame by frame and faster than real time.
   *
   * Why a separate method rather than `frozenAt`: `frozenAt` freezes time INSIDE
   * the current state, it doesn't walk the blocks. And going through `seek`
   * wouldn't do — `apply` sets the engine on `clock`, which only advances in the
   * loop and so stays at zero in frozen mode. Every state change would be recorded
   * at instant 0, and the fades at block joins would be wrong.
   *
   * Hence the `setState` at the block's ABSOLUTE offset: the engine dates the
   * transition where it really happens in the cycle, and `sample(t)` lands on the
   * same image real-time playback would have produced.
   */
  function renderAt(time: number) {
    const blocks = p.current.cycle
    if (!blocks.length) return
    const { index } = blockAt(blocks, time)
    if (index !== m.lastBlock) {
      const b = blocks[index]!
      setState(b.state)
      /*
       * Going BACKWARDS restarts without history, where a normal advance keeps the
       * state being left to blend it. Without that, replaying frame 0 after a full
       * pass dated the first state at 0 with the LAST one as previous state, and
       * rendered that one's pose: the GIF export, which does two passes, opened on
       * an eyeless ball. The player is thus idempotent.
       */
      if (index < m.lastBlock) engine.reset(b.state, offsetOf(blocks, index))
      else engine.setState(b.state, offsetOf(blocks, index))
      m.lastBlock = index
    }
    setFrame(engine.sample(time))
  }

  useImperativeHandle(
    ref,
    () => ({
      seek,
      renderAt,
      get svg() {
        return svgRef.current
      }
    }),
    // the helpers only read refs, so one handle for the component's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  /* -------------------------------------------------------- pointer gaze */

  function onPointerMove(event: PointerEvent) {
    // Touch has no lingering cursor: a lifted finger would leave the gaze frozen
    // on the last point touched, which reads as a bug.
    if (event.pointerType === 'touch') return
    m.pointer = { x: event.clientX, y: event.clientY }
  }

  function onPointerLeave() {
    m.pointer = null
  }

  function release() {
    if (!m.aiming) return
    // same duration as on the way out: the head comes back as the ball settles
    engine.setLook(null, m.clock, TURN_TIME)
    m.aiming = false
  }

  /**
   * Aims at the pointer. Only does the DOM part of the job — measuring where the
   * ball and the cursor are — the gaze rule itself lives in `@/ui/gaze`.
   *
   * The rect is re-read every frame rather than cached: the avatar slides and
   * grows during the view transition. Normalisation is over the half-window, not
   * the avatar's size: the gaze must saturate when the cursor reaches the edge of
   * the screen, whatever room the ball takes.
   */
  function aim() {
    // The gaze is only driven on REST-FACE states. Elsewhere the gaze pose IS the
    // measured animation, and overriding it would muddle it.
    if (!STATE_BY_ID.get(state.current)?.baseFace) {
      release()
      return
    }
    const box = svgRef.current?.getBoundingClientRect()
    /*
     * A box with no area: nothing to aim at, and above all the normalisation below
     * would become `0 / 0`, so `NaN`. The engine KEEPS the last target: one NaN set
     * once stays forever and the bot never rests again. It really happens when the
     * browser pane is hidden — `getBoundingClientRect` then returns zeros.
     */
    if (!box || box.width === 0 || box.height === 0) return
    // the turn starts on entering the view, together with the rings
    if (!m.aiming) m.turnSince = m.clock
    const halfWidth = Math.max(1, window.innerWidth / 2)
    const halfHeight = Math.max(1, window.innerHeight / 2)
    const ptr = m.pointer
    engine.setLook(
      lookTarget({
        nx: ptr ? clamp((ptr.x - (box.left + box.width / 2)) / halfWidth, -1, 1) : 0,
        ny: ptr ? clamp((ptr.y - (box.top + box.height / 2)) / halfHeight, -1, 1) : 0,
        turn: easings.easeOutQuint(clamp((m.clock - m.turnSince) / TURN_TIME)),
        pointer: ptr !== null
      }),
      m.clock
    )
    m.aiming = true
  }

  /**
   * The script decides everything, including its duration: we only hand it the
   * elapsed time. The rule itself is in `@/ui/gaze`, like the tracking one.
   */
  function scriptedGaze(run: GazeScript) {
    engine.setLook(run(m.clock - m.gazeSince), m.clock, SCRIPT_MORPH)
  }

  /* ------------------------------------------------------------ the loop */

  function tick(ms: number) {
    m.raf = requestAnimationFrame(tick)
    // Scene clock with a bounded delta: a tab hidden then shown again resumes
    // without jumping ahead (rAF is suspended meanwhile).
    const dt = m.last ? Math.min((ms - m.last) / 1000, 0.064) : 0
    m.last = ms
    m.clock += dt

    // Stopping doesn't freeze the clock: stopped, the bot keeps breathing and
    // blinking. Only the montage's sequencing and the playhead are suspended.
    const { cycle: blocks, follow: follows, gaze: script } = p.current
    if (playing.current) {
      if (m.clock >= m.nextAt && blocks.length) {
        goToBlock((block.current + 1) % blocks.length)
      } else {
        setElapsed(m.clock - m.blockStart)
      }
    }

    // Tracking wins: both write the same target, and the arrival is over long
    // before a following view opens.
    if (follows) aim()
    else if (script) scriptedGaze(script)

    setFrame(engine.sample(m.clock))
  }

  /** Redraws without the loop: frozen tiles when their shape changes. */
  function redrawFrozen() {
    const at = p.current.frozenAt
    if (at === undefined) return
    setFrame(engine.sample(at))
  }

  /* ------------------------------------------------------------ watchers */
  /*
   * Each watcher is a layout effect guarded by the last value it saw, declared in
   * a fixed order: they then run in that order,
   * before paint, so a frozen tile never shows a stale frame.
   */

  useLayoutEffect(() => {
    p.current = {
      cycle,
      follow,
      gaze,
      frozenAt,
      blockProp,
      onBlockChange,
      onStateChange,
      onElapsedChange
    }
  })

  /**
   * Start and release of the gaze script. Runs on mount because the page already
   * opens in its arrival — that's even its only use — and releases because a
   * script cut short (block shortened, view change) would otherwise leave the eyes
   * frozen where it stopped: the engine KEEPS the last target.
   */
  const seenGaze = useRef<GazeScript | null | typeof NEVER>(NEVER)
  useLayoutEffect(() => {
    if (seenGaze.current === gaze) return
    seenGaze.current = gaze
    if (gaze) {
      m.gazeSince = m.clock
      m.scripted = true
      /*
       * Initial value dated ONE CATCH-UP EARLIER, so it is already fully applied on
       * the first frame. Without it the eyes jump between the first frame (neutral)
       * and the second (scripted) — 127 px at once on a script that starts looking
       * away.
       */
      engine.setLook(gaze(0), m.clock - SCRIPT_MORPH, SCRIPT_MORPH)
      return
    }
    if (!m.scripted) return
    engine.setLook(null, m.clock)
    m.scripted = false
  })

  // Cursor moved from outside: click on a timeline block. When `goToBlock` moved
  // it, `apply` already ran and runs again here with no effect (setState exits if
  // the state is unchanged, the end date is the same).
  function onBlock(i: number) {
    apply(i, m.pendingOffset)
    m.pendingOffset = 0
  }
  const seenBlock = useRef(blockProp)
  useLayoutEffect(() => {
    if (blockProp === undefined || blockProp === seenBlock.current) return
    seenBlock.current = blockProp
    block.current = blockProp
    onBlock(blockProp)
  })

  // State change coming from a prop: the frozen tiles' case, which have no cursor.
  // During playback, `apply` has already done the work.
  //
  // The guard isn't an optimisation: without it the export corrupted one frame at
  // EVERY block join. `renderAt` sets the state on the engine at its ABSOLUTE offset,
  // and a `redrawFrozen()` right after would sample the PREVIOUS state's pose.
  const seenState = useRef(stateProp)
  useLayoutEffect(() => {
    if (stateProp === undefined || stateProp === seenState.current) return
    seenState.current = stateProp
    state.current = stateProp
    // `renderAt` or `apply` already applied it, and at the right date
    if (engine.state === stateProp) return
    engine.setState(stateProp, m.clock)
    redrawFrozen()
  })

  // Resume where the playhead stopped, not at the block's start.
  const seenPlaying = useRef(playingProp)
  useLayoutEffect(() => {
    if (playingProp === undefined || playingProp === seenPlaying.current) return
    seenPlaying.current = playingProp
    playing.current = playingProp
    if (playingProp) apply(block.current, elapsed.current)
    else m.nextAt = Infinity
  })

  // `elapsed` has no watcher: it's only an input at mount. Keep the local
  // copy in sync so a remount or a resume reads the parent's value.
  useLayoutEffect(() => {
    if (elapsedProp !== undefined) elapsed.current = elapsedProp
  }, [elapsedProp])

  // The montage changed under us: block deleted, duration dragged, another cycle
  // picked. Keep the cursor in bounds and re-set the end date on the new duration —
  // if the block was shortened below the current position, the loop moves on at
  // the next frame, which is the intended behaviour.
  const seenCycle = useRef(cycle)
  useLayoutEffect(() => {
    if (seenCycle.current === cycle) return
    seenCycle.current = cycle
    if (!cycle.length) {
      m.nextAt = Infinity
      return
    }
    const i = Math.min(block.current, cycle.length - 1)
    if (i !== block.current) {
      goToBlock(i)
      return
    }
    m.nextAt = playing.current ? m.blockStart + cycle[i]!.duration : Infinity
  })

  const seenRadii = useRef(shapeRadii)
  useLayoutEffect(() => {
    if (seenRadii.current === shapeRadii) return
    seenRadii.current = shapeRadii
    // pass the clock: the engine morphs towards the new shape instead of snapping
    engine.setShape(shapeRadii, m.clock)
    redrawFrozen()
  })

  const seenExpression = useRef(expression)
  useLayoutEffect(() => {
    if (seenExpression.current === expression) return
    seenExpression.current = expression
    engine.setExpression(expression, m.clock)
    redrawFrozen()
  })

  /**
   * Moving `frozenAt` redraws: the animated export advances an off-screen instance
   * frame by frame through it.
   */
  const seenFrozen = useRef(frozenAt)
  useLayoutEffect(() => {
    if (seenFrozen.current === frozenAt) return
    seenFrozen.current = frozenAt
    redrawFrozen()
  })

  /**
   * Pointer listening only lives while tracking. The guard on `frozenAt`: a frozen
   * tile has no loop to consume the target, so nothing to listen to.
   */
  const listen = follow && frozenAt === undefined
  useEffect(() => {
    if (!listen) return
    window.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerleave', onPointerLeave)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerleave', onPointerLeave)
      release()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listen])

  useEffect(() => {
    if (p.current.frozenAt !== undefined) return
    // the cursor may arrive already set (URL, cycle read from storage)
    apply(block.current, elapsed.current)
    m.last = 0
    m.raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(m.raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* -------------------------------------------------------------- render */

  /**
   * A dot is a plain disc, unless the state provides a shape (the tilted "!"'s
   * drop): the path is then in ball-radius units centred on the origin, so it's
   * placed with translate/rotate/scale.
   *
   * The colour follows the body's by default; `depth` is for the particles, which
   * fade into the background as they recede.
   */
  function dot(d: BotFrame['dots'][number], key: string) {
    const fill = d.color ?? (d.depth === undefined ? ink : mixHex(paper, ink, d.depth))
    return d.d ? (
      <path
        key={key}
        fill={fill}
        opacity={d.opacity}
        d={d.d}
        transform={`translate(${d.x} ${d.y}) rotate(${d.rot ?? 0}) scale(${R})`}
      />
    ) : (
      <circle key={key} fill={fill} opacity={d.opacity} cx={d.x} cy={d.y} r={d.r} />
    )
  }

  const svgEl = (
    <svg
      ref={svgRef}
      className={className}
      width={size}
      height={size}
      viewBox={
        rays
          ? `${-VB} ${-VB} ${VB * 2} ${VB * 2}`
          : `${-VB_WITHOUT_RAYS} ${-VB_WITHOUT_RAYS} ${VB_WITHOUT_RAYS * 2} ${VB_WITHOUT_RAYS * 2}`
      }
      role="img"
      aria-label={t('app.botAria')}
    >
      <defs>
        {/*
          The eyes are real holes cut in the body, not white shapes
          laid on top: they stay automatically clipped by the silhouette when they
          slide towards the edge.
        */}
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-VB} y={-VB} width={VB * 2} height={VB * 2}>
          <path d={frame.bodyPath} fill="#fff" />
          {/* the sun's eyes are drawn, not cut (see the face group below) */}
          {!SUN &&
            frame.eyes.map((eye, i) => (
              <path key={i} d={eye.d} transform={eye.matrix} opacity={eye.alpha} fill="#000" />
            ))}
          {frame.notch && (
            <circle cx={frame.notch.x} cy={frame.notch.y} r={frame.notch.r} fill="#000" />
          )}
        </mask>
        {SUN && (
          <clipPath id={`${maskId}-clip`}>
            <path d={frame.bodyPath} />
          </clipPath>
        )}

        {frame.arcs.map((arc) => (
          <linearGradient
            key={arc.id}
            id={`${uid}-${arc.id}`}
            gradientUnits="userSpaceOnUse"
            x1={arc.grad.x1}
            y1={arc.grad.y1}
            x2={arc.grad.x2}
            y2={arc.grad.y2}
          >
            {arc.grad.stops.map((c, i) => (
              <stop key={i} offset={i / (arc.grad.stops.length - 1)} stopColor={c} />
            ))}
          </linearGradient>
        ))}
      </defs>

      {/* Sol de Mayo corona: behind everything, the body covers the rays' roots */}
      {frame.rays && rays && !(corona3d && corona3dReady) && (
        <g
          transform={`translate(${frame.rays.x} ${frame.rays.y}) scale(${R / FLAG_FACE})`}
          fill={SUN_COLORS.body}
          stroke={SUN_COLORS.line}
          strokeWidth={FLAG_RAY_LINE}
          opacity={frame.bodyAlpha}
        >
          {FLAG_TURNS.map((turn) => (
            <g key={turn} transform={`rotate(${turn})`}>
              <path d={FLAG_STRAIGHT} />
              <path d={FLAG_STRAIGHT_INNER} fill={SUN_COLORS.line} stroke="none" />
              <g transform={`rotate(${FLAG_WAVY_TURN})`}>
                <path d={FLAG_WAVY} />
                <path d={FLAG_WAVY_INNER} fill={SUN_COLORS.line} stroke="none" />
              </g>
            </g>
          ))}
        </g>
      )}

      {/* back half of the orbits: drawn before the body, so occluded by it */}
      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path
            key={`b${arc.id}`}
            d={arc.back}
            stroke={`url(#${uid}-${arc.id})`}
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}
      </g>

      {/* burst particles: they pass behind the core */}
      {frame.dotsBehind && <g>{frame.dots.map((d, i) => dot(d, `pb${i}`))}</g>}

      <g opacity={frame.bodyAlpha}>
        {/*
          Opaque backing in the body's exact shape, under the body itself. The eyes
          are HOLES, so they show whatever is drawn behind — and the back half of the
          rings and the burst particles are, precisely to be occluded by the body.
          Without this backing, a ring passing behind the ball reappears INSIDE the
          eyes. Filled with `paper`, not pure white: that's what the eyes showed
          until now, the page's background.
        */}
        <path d={frame.bodyPath} fill={paper} />
        <g mask={`url(#${maskId})`}>
          <rect x={-VB} y={-VB} width={VB * 2} height={VB * 2} fill={ink} />
        </g>
        {/* Sol de Mayo eyes, brows, nose, lips and chin: drawn ON the body, clipped to it */}
        {SUN && (
          <g clipPath={`url(#${maskId}-clip)`} fill={SUN_COLORS.line}>
            {/* the bot's own eyes, same shape and motion, filled brown; with the
                flag's eyes (`SUN_EYES`) they come as face features instead */}
            {SUN_EYES === 'bot' &&
              frame.eyes.map((eye, i) => (
                <path
                  key={`eye${i}`}
                  data-eye
                  d={eye.d}
                  transform={eye.matrix}
                  opacity={eye.alpha}
                />
              ))}
            {/* the face, already wrapped onto the sphere by the engine */}
            {frame.features.map((feat) => (
              <g
                key={feat.id}
                data-eye={feat.id.startsWith('eye') ? '' : undefined}
                opacity={feat.alpha}
              >
                {feat.paths.map((d, i) => (
                  <path key={i} d={d} />
                ))}
              </g>
            ))}
          </g>
        )}
        {frame.rays && (
          <path
            d={frame.bodyPath}
            fill="none"
            stroke={SUN_COLORS.line}
            strokeWidth={(FLAG_FACE_LINE * R) / FLAG_FACE}
          />
        )}
      </g>

      {!frame.dotsBehind && <g>{frame.dots.map((d, i) => dot(d, `pf${i}`))}</g>}

      {frame.notif && (
        <circle cx={frame.notif.x} cy={frame.notif.y} r={frame.notif.r} fill={NOTIF_BLUE} />
      )}

      {/* front half of the orbits */}
      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path
            key={`f${arc.id}`}
            d={arc.front}
            stroke={`url(#${uid}-${arc.id})`}
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}
      </g>
    </svg>
  )

  if (!(SUN && rays && corona3d)) return svgEl
  // the 3D corona lies over the SVG, in a box of the SVG's own size: it hides
  // behind the ball on its own (see Corona3D)
  return (
    <div className="relative" style={{ width: size, maxWidth: '100%', aspectRatio: '1' }}>
      <div className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full">{svgEl}</div>
      <Corona3D
        rays={frame.rays}
        scale={R}
        opacity={frame.bodyAlpha}
        onReady={() => setCorona3dReady(true)}
        resolution={coronaResolution}
      />
    </div>
  )
}
