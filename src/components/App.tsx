'use client'

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react'
import BotTile from '@/components/BotTile'
import Customizer from '@/components/Customizer'
import SolDeMayo, { type SolDeMayoHandle } from '@/components/SolDeMayo'
import ExportBar from '@/components/ExportBar'
import CycleDialog from '@/components/CycleDialog'
import GifDialog from '@/components/GifDialog'
import SettingsPanel from '@/components/Settings'
import SideRail, { type ViewId } from '@/components/SideRail'
import Timeline from '@/components/Timeline'
import { cycleName, t, useLanguage } from '@/i18n'
import {
  copy,
  copyText,
  cycleToGif,
  cycleToMp4,
  standaloneSvg,
  download,
  toAnimatedGif,
  toPng,
  toAnimatedSvg
} from '@/ui/capture'
import { cx } from '@/ui/dom'
import {
  ACTION_BY_ID,
  ANIM_FRAMES,
  ANIM_STEP,
  CYCLE_SIZE,
  DEFAULT_GIF_BACKGROUND,
  DEFAULT_CYCLE_FORMAT,
  GIF_FRAMES,
  GIF_STEP,
  WHITE,
  Abandon,
  backgroundColor,
  cycleImages,
  cycleStep,
  fileName,
  type ActionId,
  type ExportState,
  type GifBackground,
  type CycleFormat
} from '@/ui/export'
import { MOODS, facingLook } from '@/ui/gaze'
import { SUNRISE, INTRO, INTRO_GAZE, POSE_AT, introDue } from '@/ui/intro'
import { write, read, type StoredName } from '@/ui/storage'
import {
  blockAt,
  blocksWith,
  defaultCycle,
  makeBlock,
  parseCycles,
  totalDuration,
  type Block,
  type Cycle
} from '@/bot/cycles'
import { COLOR_BY_ID, DEFAULT_COLOR, DEFAULT_SHAPE, SHAPE_BY_ID } from '@/bot/skins'
import { POSES, SEQUENCE, STATES, type StateId } from '@/bot/states'

// Panels that don't depend on the per-frame state: kept out of the 60 fps re-render.
const Settings = memo(SettingsPanel)

/**
 * The left navigation rail (Customise / Animations / Settings). Hidden for now:
 * the app opens on the customise view, and `#state=` links still reach Animations.
 * Flip to `true` to bring it back; nothing else depends on it.
 */
const SHOW_RAIL = false

/** The avatar's export bar (PNG / SVG / GIF). Hidden for now, same deal. */
const SHOW_EXPORT = false

/**
 * The URL drives the view: `#state=orbit&stop` opens one state with the sequence
 * stopped, `#board` shows the state board. Re-read on every `hashchange` so the
 * browser's back/forward buttons really work.
 */
function readHash() {
  const params = new URLSearchParams(location.hash.slice(1))
  const asked = params.get('state') as StateId | null
  // never trust the URL: the state must exist
  const known = STATES.some((s) => s.id === asked)
  return {
    state: known ? asked! : ('idle' as StateId),
    named: known,
    playing: !params.has('stop'),
    gallery: params.has('board'),
    // `#arrival`: replay the arrival without leaving the site. It only plays on a
    // genuine VISIT, so without this link it can't be seen again in a session.
    arrival: params.has('arrival')
  }
}

/**
 * Shape, colour, expression and cycle survive a reload: it's the user's avatar,
 * not a session setting. Validated on load, an unknown id falls back to the default.
 */
function stored(name: StoredName, fallback: string, exists: (v: string) => boolean) {
  const v = read(name)
  return v && exists(v) ? v : fallback
}

/** Where to find a state for `#state=` links: in the current montage if it's there, else another. */
function locate(id: StateId, cycles: Cycle[], current: Cycle) {
  const order = [current, ...cycles.filter((c) => c.id !== current.id)]
  for (const c of order) {
    const index = c.blocks.findIndex((b) => b.state === id)
    if (index >= 0) return { id: c.id, index }
  }
  return null
}

const cycleOf = (cycles: Cycle[], id: string) => cycles.find((c) => c.id === id) ?? cycles[0]!

/**
 * Everything read once at startup (the URL, the navigation type, storage). Computed ONCE, on the first client render — the app never renders on
 * the server (see `src/app/page.tsx`).
 */
function startup() {
  const initial = readHash()

  /*
   * "Reduced motion" is FOLLOWED at runtime (see the `calm` listener below). What it
   * cancels is DECORATION: box transitions and the settings view's entry swirl. What
   * it doesn't cancel is CONTENT: breathing, gaze drift and blinking are what the
   * bot IS.
   */
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /*
   * "Arriving" on the site is something the browser knows: `navigate` covers a
   * typed URL, a followed link and a new tab, while `reload` and `back_forward`
   * return to a page we already had. Nothing goes to storage — a persistent flag
   * would turn the arrival off forever after one visit. Falling back to `navigate`:
   * when in doubt, play it.
   */
  const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
  const navigation = nav?.type ?? 'navigate'

  const intro =
    // `#arrival` explicitly asks for it, even after a reload
    initial.arrival ||
    introDue({
      named: initial.named,
      gallery: initial.gallery,
      reload: navigation !== 'navigate',
      calm
    })

  /**
   * The default montage is only a seed: on first launch it fills the
   * list, afterwards the user's montages are authoritative — including their edits
   * of that one.
   */
  const restored = parseCycles(read('cycles'))
  const cycles = restored.length ? restored : [defaultCycle()]

  let activeId = stored('cycle', cycles[0]!.id, (v) => cycles.some((c) => c.id === v))
  let block = 0

  // a link to a specific state opens the montage that contains it
  if (initial.named) {
    const found = locate(initial.state, cycles, cycleOf(cycles, activeId))
    if (found) {
      activeId = found.id
      block = found.index
    }
  }

  // Customisation is the landing view, unless the URL names a specific state: the
  // link then clearly targets the player.
  const view: ViewId = initial.named ? 'animations' : 'customize'

  return {
    initial,
    calm,
    intro,
    cycles,
    activeId,
    block,
    view,
    /*
     * The state is an output of the player: the current block commands. Seeded on
     * that block so we don't enter morphing from a state never displayed. Except on
     * arrival, which starts from REST whatever the user's montage: the ball must
     * APPEAR as it will stay, morphing nothing.
     */
    state: intro ? ('idle' as StateId) : (cycleOf(cycles, activeId).blocks[block]?.state ?? 'idle'),
    // Same rule as on view change: the sequence doesn't play in customisation,
    // the shape would be unreadable.
    // The arrival waits for a tap (its anthem needs one, see `waiting` in App), so
    // it doesn't play from the start either.
    playing: !intro && initial.playing && view === 'animations',
    shape: stored('shape', DEFAULT_SHAPE, (v) => SHAPE_BY_ID.has(v)),
    color: stored('color', DEFAULT_COLOR, (v) => COLOR_BY_ID.has(v)),
    // The Sol de Mayo always starts attentive, whatever was picked last visit:
    // it is the face it wakes up with after the sunrise.
    expression: START_EXPRESSION
  }
}

/**
 * Outside the player the played montage is a single resting block: the user's
 * cycle may contain no resting state at all, and it's the only one where the
 * chosen shape shows (`baseBody`).
 */
const REST = [makeBlock('idle')]

/**
 * Entering the settings: the swirl, then rest. `swirl` carries the rest face, so
 * cursor tracking applies from its first frame and the eyes do a full turn before
 * settling left (see `src/ui/gaze.ts`). The resting block that follows picks up the
 * exact same pose: the join doesn't show.
 */
const ENTRY = [makeBlock('swirl'), makeBlock('idle')]
/** Under "reduced motion" the entry goes straight to rest: the swirl is decoration. */
const CALM_ENTRY = [makeBlock('idle')]

/**
 * Product name, in capitals for the big footer word. NOT translated — it's a brand.
 * In prose the name is written "Sol de Mayo", which is what `app.name` carries.
 */
/** The expression every visit starts with. */
const START_EXPRESSION = 'attentive'

const NAME = 'SOL DE MAYO'

/** Duration of a mood. Long enough to be noticed without fidgeting. */
const MOOD_MS = 4200

/**
 * Delay before the export bar reveals itself after the arrival: the time for the
 * avatar to reach its place. The ONLY moment it animates.
 */
const ARRIVAL_DELAY = 400

/** How long the export confirmation stays on screen. */
const CONFIRMATION_MS = 1800

const ORDER = SEQUENCE.map((id) => STATES.find((s) => s.id === id)!)

/**
 * Remembers the previous value of `value` across renders and calls `fn(now, before)`
 * when it changes (not on the first render). Layout effect: cascaded state updates
 * land before paint.
 */
function useWatch<T>(value: T, fn: (now: T, before: T) => void) {
  const previous = useRef(value)
  useLayoutEffect(() => {
    if (Object.is(previous.current, value)) return
    const before = previous.current
    previous.current = value
    fn(value, before)
  })
}

export default function App() {
  useLanguage()

  const [init] = useState(startup)
  const { initial } = init

  const [gallery, setGallery] = useState(initial.gallery)
  const [calm, setCalm] = useState(init.calm)
  const [intro, setIntro] = useState(init.intro)
  /**
   * The arrival waits for a tap before the sun rises. Browsers only let a page
   * play sound after the visitor does something, and the sunrise rides the
   * anthem's opening chords: the tap is what lets them sound. Until then the
   * flag stands empty, with one button.
   */
  const [waiting, setWaiting] = useState(init.intro)
  const anthem = useRef<HTMLAudioElement | null>(null)
  useEffect(() => {
    if (!waiting) return
    // loaded while the visitor looks at the flag, so it starts on the tap
    const a = new Audio(SUNRISE.audio)
    a.preload = 'auto'
    anthem.current = a
  }, [waiting])
  /**
   * How much the arrival scales the sun up: enough for its upper half (face and
   * rays) to fill the screen's height from the bottom edge, the way the
   * Teletubbies' sun rises over the hill, without going past the top. Measured,
   * since it depends on the window and on the avatar's size.
   */
  const avatarRef = useRef<HTMLDivElement | null>(null)
  const [sunriseScale, setSunriseScale] = useState(3.5)
  useLayoutEffect(() => {
    if (!intro) return
    const measure = () => {
      const box = avatarRef.current?.offsetWidth ?? 0
      // The corona reaches 0.47 of the box from the centre (flag rays, 158
      // viewBox), and the centre sits 0.1 of the box above the bottom edge (so the
      // eyes show): together they must stay under the top of the screen.
      if (box > 0) setSunriseScale((0.95 * window.innerHeight) / (0.57 * box))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [intro])

  const raiseTheSun = useCallback(() => {
    void anthem.current?.play().catch(() => {
      // no sound (blocked, or no audio device): the sunrise plays anyway
    })
    setWaiting(false)
    setPlaying(true)
  }, [])
  const [cycles, setCycles] = useState<Cycle[]>(init.cycles)
  const [activeId, setActiveId] = useState(init.activeId)
  const [block, setBlock] = useState(init.block)
  const [elapsed, setElapsed] = useState(0)
  const [state, setState] = useState<StateId>(init.state)
  const [view, setView] = useState<ViewId>(init.view)
  const [preview, setPreview] = useState(false)
  // Below 64rem the expressions live in a bottom sheet, opened from a button
  const [expressionsMenu, setExpressionsMenu] = useState(false)
  const [playing, setPlaying] = useState(init.playing)
  const [shape, setShape] = useState(init.shape)
  const [color, setColor] = useState(init.color)
  const [expression, setExpression] = useState(init.expression)
  const [mood, setMood] = useState<string | null>(null)
  const [barHidden, setBarHidden] = useState(false)

  const cycle = cycleOf(cycles, activeId)
  const bot = useRef<SolDeMayoHandle | null>(null)

  /** Latest values for window listeners, which outlive any single render. */
  const latest = useRef({ cycles, activeId, cycle, view })
  latest.current = { cycles, activeId, cycle, view }

  /* ------------------------------------------------------ reduced motion */

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const follows = (e: MediaQueryListEvent) => setCalm(e.matches)
    query.addEventListener('change', follows)
    return () => query.removeEventListener('change', follows)
  }, [])

  /* ------------------------------------------------------------- cycles */

  /**
   * Deferred write: dragging a card replaces the cycle on every mouse move, and
   * `localStorage` is synchronous — writing it sixty times a second during a drag
   * would block rendering for nothing.
   */
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined)
  const saveCycles = useCallback(() => {
    clearTimeout(pending.current)
    write('cycles', JSON.stringify(latest.current.cycles))
  }, [])
  useWatch(cycles, () => {
    clearTimeout(pending.current)
    pending.current = setTimeout(saveCycles, 250)
  })
  useWatch(activeId, (v) => write('cycle', v))

  /*
   * The deferred write is flushed on close, otherwise the last edit is lost when the
   * tab goes within 250 ms. `pagehide` rather than `beforeunload`: it's the only one
   * that also fires when the page enters the back/forward cache on mobile.
   */
  useEffect(() => {
    window.addEventListener('pagehide', saveCycles)
    return () => window.removeEventListener('pagehide', saveCycles)
  }, [saveCycles])

  /* -------------------------------------------------------------- views */

  // Preview: the scene alone. Left with Escape or its button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreview(false)
        setExpressionsMenu(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /**
   * Preview drives playback BOTH WAYS: entering plays (you only go there to watch,
   * and no control is shown), leaving pauses (you come back to EDIT). A watcher
   * rather than two handler calls: it's left by the button AND by Escape.
   */
  useWatch(preview, (on) => setPlaying(on))

  /**
   * The last fragment WE wrote, awaiting its `hashchange`. Without it the player
   * can't get past a state appearing TWICE in the montage: `location.replace` fires
   * a `hashchange` read as an incoming navigation, and `locate` returns the FIRST
   * occurrence. Consumed on first read: one write fires at most one event, and a
   * later browser Back to that same state is a real navigation.
   */
  const writtenByUs = useRef('')

  // The URL is shareable, so it follows the state AND playback. `replace`, not
  // `push`: no history entry per state.
  const playback = `${state}|${playing}`
  useWatch(playback, () => {
    // The URL describes the PLAYER. Outside it the displayed state is only view
    // decoration, and writing it fired a `hashchange` that put the playhead back on
    // the user's montage indices while the view plays its own.
    if (view !== 'animations') return
    writtenByUs.current = `#state=${state}${playing ? '' : '&stop'}`
    location.replace(writtenByUs.current)
  })

  useEffect(() => {
    const onHash = () => {
      // our own write isn't a navigation: see `writtenByUs`
      if (location.hash === writtenByUs.current) {
        writtenByUs.current = ''
        return
      }
      const next = readHash()
      /*
       * The arrival stages the page OPENING: replaying it hot would mean rebuilding
       * the whole set. Reload, which replays it exactly as a visitor would see it.
       */
      if (next.arrival && !initial.arrival) {
        location.reload()
        return
      }
      setGallery(next.gallery)
      if (next.gallery) return
      // Only a link that NAMES a state moves playback. Without this guard, coming
      // back from the board (`#board` then `#`) would rewind the montage.
      if (!next.named) return
      const { cycles: all, cycle: currentCycle } = latest.current
      const found = locate(next.state, all, currentCycle)
      if (!found) return
      // a link that NAMES a state targets the player: go there, even from another view
      setView('animations')
      setActiveId(found.id)
      setBlock(found.index)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [initial.arrival])

  /*
   * The player opens STOPPED: landing on the tab isn't asking to watch the montage
   * play — the play button asks that. Then `resume` does its job, and coming back to
   * the tab restores playback as it was left. Only exception, a link that NAMES a
   * state (`#state=`), which already describes its playback.
   */
  const resume = useRef(initial.named && initial.playing)
  const resumeBlock = useRef(init.block)

  const played: Block[] = intro
    ? INTRO
    : view === 'animations'
      ? cycle.blocks
      : view !== 'settings'
        ? REST
        : calm
          ? CALM_ENTRY
          : ENTRY

  useWatch(view, (now, before) => {
    // Changing view interrupts the arrival: it only makes sense on the landing page.
    setIntro(false)
    // The position is only remembered when LEAVING the player.
    if (before === 'animations') {
      resume.current = playing
      resumeBlock.current = block
    }
    if (now === 'animations') {
      setPlaying(resume.current)
      setBlock(resumeBlock.current)
      return
    }
    setBlock(0)
    // only the settings play something outside the player: their entry swirl
    setPlaying(now === 'settings')
  })

  /**
   * An entry plays only once: as soon as the player reaches its resting block,
   * sequencing stops. Without it the montage would loop and the view replay its
   * entry forever. For the site arrival, the last block simply hands over.
   */
  useWatch(block, (i) => {
    if (intro) {
      if (i >= INTRO.length - 1) {
        setIntro(false)
        setPlaying(false)
      }
      return
    }
    if (view === 'settings' && i > 0) setPlaying(false)
  })

  /**
   * Is the ball still alone on stage? Not a second flag to keep in sync: the PLAYER'S
   * POSITION says it. While on the first block the ball appears; as soon as it enters
   * the wink, the interface is there — the wink's closed eyes MASK the setup.
   */
  const bare = intro && block < POSE_AT

  /**
   * Which panel is open. One column has a width at a time, and while the ball is
   * alone neither: giving the right panel its width back is what slides it into place.
   */
  const left = !bare && view === 'settings'
  const right = !bare && view !== 'settings'

  /* -------------------------------------------------------------- skins */

  useWatch(shape, (v) => write('shape', v))
  useWatch(color, (v) => write('color', v))
  useWatch(expression, (v) => write('expression', v))
  // picking a face closes the mobile sheet: the point is to see it on the sun
  useWatch(expression, () => setExpressionsMenu(false))

  /**
   * The ball turns ROUND again for a turn, whatever the chosen shape — in the
   * settings as on arrival. The user's choice isn't touched, only what's displayed:
   * it comes back intact afterwards, MORPHING back. On a non-circular shape the eyes
   * follow the real outline (`radiusAtAngle`) and would bob up to 25 px during the turn.
   */
  const shownShape = view === 'settings' || bare ? DEFAULT_SHAPE : shape

  /* ------------------------------------------------------------- moods */

  /**
   * In the settings the bot changes mood now and then while its eyes follow the
   * cursor. Page varnish, NOT a setting: the user's expression is neither replaced
   * nor stored. The choice of moods is explained in `MOODS` (`src/ui/gaze.ts`).
   */
  useEffect(() => {
    if (view !== 'settings') {
      // back to the user's expression, morphing like the rest
      setMood(null)
      return
    }
    // start from THEIR expression and drift afterwards: the change is noticed
    let i = 0
    const timer = setInterval(() => {
      setMood(MOODS[i % MOODS.length]!)
      i++
    }, MOOD_MS)
    return () => clearInterval(timer)
  }, [view])

  /** Appends an animation to the end of the current montage. */
  const addBlock = useCallback((id: StateId) => {
    setCycles((all) => {
      const currentCycle = cycleOf(all, latest.current.activeId).id
      return all.map((c) => (c.id === currentCycle ? { ...c, blocks: blocksWith(c.blocks, id) } : c))
    })
  }, [])

  // One stable handler per tile, so the memoised tiles skip the per-frame render.
  const addHandlers = useMemo(
    () => Object.fromEntries(ORDER.map((s) => [s.id, () => addBlock(s.id)])),
    [addBlock]
  )

  /**
   * Playhead moved from the ruler. The player is the only one able to re-sync the
   * engine (it holds the clock), hence the direct call.
   */
  const onSeek = useCallback((time: number) => {
    const { index, elapsed: offset } = blockAt(latest.current.cycle.blocks, time)
    bot.current?.seek(index, offset)
  }, [])

  /**
   * Replays the entry on EVERY arrival in the settings. Without this re-sync the
   * player keeps the block start date and `elapsed` inherited from the previous view:
   * the swirl block is born already expired and the entry is consumed in one frame.
   * A passive effect: the player must have received the new montage first.
   */
  const seenView = useRef(view)
  useEffect(() => {
    if (seenView.current === view) return
    seenView.current = view
    if (view === 'settings') bot.current?.seek(0, 0)
  }, [view])

  /* ------------------------------------------------------------- export */

  const barTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  /* End of the arrival: the ball is no longer alone on stage. */
  useWatch(bare, (now, previous) => {
    if (!previous || now) return
    setBarHidden(true)
    clearTimeout(barTimer.current)
    barTimer.current = setTimeout(() => setBarHidden(false), ARRIVAL_DELAY)
  })

  /* ---------------------------------------------------- montage export */

  const [cycleDialog, setCycleDialog] = useState(false)
  const [cycleFormat, setCycleFormat] = useState<CycleFormat>(DEFAULT_CYCLE_FORMAT)
  const [cycleBackground, setCycleBackground] = useState<GifBackground>(DEFAULT_GIF_BACKGROUND)
  /** `null` while not encoding; otherwise the fraction done, for the progress bar. */
  const [cycleProgress, setCycleProgress] = useState<number | null>(null)
  /**
   * Did the last montage export fail? A state of its own rather than `exportState`:
   * that one drives `ExportBar`, which only exists in the Customise view.
   */
  const [cycleError, setCycleError] = useState(false)
  /** How to abort the running encode. */
  const abandonCycle = useRef<AbortController | null>(null)
  const encoding = useRef(false)

  /**
   * Exports the MONTAGE, not the avatar: the current cycle is replayed off-screen
   * from start to end. A cycle lasts tens of seconds, so the box stays open and shows
   * its progress instead of leaving the page frozen.
   */
  async function exportCycle() {
    if (encoding.current) return
    encoding.current = true
    setCycleError(false)
    const control = new AbortController()
    abandonCycle.current = control
    const blocks = cycle.blocks
    const format = cycleFormat
    const images = cycleImages(totalDuration(blocks), format)
    const step = cycleStep(format)
    const size = CYCLE_SIZE[format]
    const settings = { shape, color, expression }
    const follows = (done: number, total: number) => setCycleProgress(done / total)

    setCycleProgress(0)
    try {
      const mp4 = format === 'mp4'
      // Video has no alpha: it forces white. The GIF keeps the choice.
      const file = mp4
        ? await cycleToMp4(settings, blocks, size, images, step, WHITE, follows, control.signal)
        : await cycleToGif(
            settings,
            blocks,
            size,
            images,
            step,
            backgroundColor(cycleBackground),
            follows,
            control.signal
          )
      download(file, fileName(cycleName(cycle), '', '', mp4 ? 'mp4' : 'gif'))
      setCycleDialog(false)
    } catch (e) {
      // An abort isn't a failure: don't tell someone they got what they asked for.
      if (!(e instanceof Abandon)) setCycleError(true)
    } finally {
      setCycleProgress(null)
      abandonCycle.current = null
      encoding.current = false
    }
  }

  /** Abort requested from the box: Escape, or its button. */
  function cancelCycle() {
    abandonCycle.current?.abort()
  }

  /*
   * The failure belongs to the ATTEMPT, not to the box: reopening it must make it new.
   */
  useWatch(cycleDialog, (open) => {
    if (open) setCycleError(false)
  })

  const [exportState, setExportState] = useState<ExportState>('ready')
  const busy = useRef(false)
  const confirmation = useRef<ReturnType<typeof setTimeout>>(undefined)

  /**
   * GIF background, and the box that asks for it. The GIF is the ONLY format to ask:
   * it alone has one-bit transparency, so a hard edge to arbitrate.
   */
  const [gifBackground, setGifBackground] = useState<GifBackground>(DEFAULT_GIF_BACKGROUND)
  const [gifDialog, setGifDialog] = useState(false)

  /**
   * Exports the avatar as DISPLAYED: `ExportBar` only asks for a format, the SVG to
   * capture is here. What the user sees is what they get, framing aside — the live
   * node is serialised, not a second render mounted beside it.
   */
  async function runExport(id: ActionId, confirmed = false) {
    // SYNCHRONOUS guard, on top of the button's `disabled`: that one only exists
    // after a render, so two clicks in the same frame downloaded twice.
    if (busy.current) return

    // The GIF asks for its background first, and the box calls back with `confirmed`.
    if (!confirmed && ACTION_BY_ID.get(id)?.mode === 'gif') {
      setGifDialog(true)
      return
    }
    const action = ACTION_BY_ID.get(id)
    const svg = bot.current?.svg
    if (!action || !svg) return

    clearTimeout(confirmation.current)
    busy.current = true
    setExportState('busy')
    const name = () => fileName(shape, expression, color, action.extension, action.suffix)
    const settings = { shape, color, expression }
    let end: ExportState = 'exported'
    try {
      if (action.mode === 'animated') {
        // The animation does NOT start from the displayed SVG: it's replayed from the
        // start on an off-screen instance. See `botSequence`.
        download(await toAnimatedSvg(settings, action.size, ANIM_FRAMES, ANIM_STEP), name())
      } else if (action.mode === 'gif') {
        const background = backgroundColor(gifBackground)
        download(await toAnimatedGif(settings, action.size, GIF_FRAMES, GIF_STEP, background), name())
      } else {
        const markup = standaloneSvg(svg, action.size)
        if (action.mode === 'copyImage') {
          // The blob goes as a PROMISE, not awaited here: see `copy` in capture.ts.
          await copy(toPng(markup, action.size))
          end = 'copy'
        } else if (action.mode === 'copyText') {
          await copyText(markup)
          end = 'copy'
        } else {
          const file =
            action.extension === 'svg'
              ? new Blob([markup], { type: 'image/svg+xml' })
              : await toPng(markup, action.size)
          download(file, name())
        }
      }
    } catch {
      // A clipboard refusal or an impossible encode must not leave the bar stuck
      // on "busy".
      end = 'error'
    }
    busy.current = false
    setExportState(end)
    confirmation.current = setTimeout(() => setExportState('ready'), CONFIRMATION_MS)
  }

  /* ------------------------------------------------------------- render */

  if (gallery) {
    return (
      <div className="p-5">
        <a className="text-xs text-[var(--muted)] underline underline-offset-2" href="#">
          {t('gallery.back')}
        </a>
        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
          {ORDER.map((s) => (
            <figure key={s.id} className="flex flex-col items-center">
              <SolDeMayo
                state={s.id}
                size={210}
                shape={shape}
                color={color}
                expression={expression}
                frozenAt={POSES[s.id]}
              />
              <figcaption className="text-xs text-[var(--muted)]">{t(`states.${s.id}`)}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* structural title: the page deliberately shows no heading, but a document
          without an h1 isn't navigable with a screen reader */}
      <h1 className="sr-only">{t('app.name')}</h1>

      {/* During the arrival the rail stays MOUNTED — it's `fixed`, unmounting frees
          no room — but faded and above all inert: otherwise it would stay in the tab
          order while invisible. */}
      {!preview ? (
        SHOW_RAIL && <SideRail view={view} onViewChange={setView} className="rail" inert={bare} />
      ) : (
        // Preview exit: the only element left on screen with the avatar.
        <button
          type="button"
          className="fixed top-5 right-5 z-30 flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1.5 text-xs text-[var(--muted)] shadow-sm backdrop-blur transition hover:text-[var(--ink)]"
          onClick={() => setPreview(false)}
        >
          {t('preview.exit')}
          <kbd className="rounded bg-black/5 px-1 py-0.5 text-[10px]">{t('preview.key')}</kbd>
        </button>
      )}

      {/* The montage bar's room is reserved ONLY where it exists (the Animations
          view). `max-lg:px-5`: 2rem of side margin on a 375 px window is a sixth of
          the width for nothing. */}
      <div
        className={cx(
          // below 64rem: the flag alone, full screen; the panel becomes a bottom sheet
          'scene min-h-full items-stretch justify-center max-lg:block',
          !preview && view === 'animations' && 'pb-[calc(var(--timeline)_+_1rem)]',
          // Below 64rem the rail becomes a TOP bar and floats: the scene reserves its
          // height. Except in preview, the only case where the rail is UNMOUNTED.
          !preview && SHOW_RAIL && 'max-lg:pt-20',
          bare || preview ? 'scene--alone' : view === 'settings' && 'scene--left'
        )}
      >
        {/*
          Settings panel, LEFT column: opening this column is what pushes the avatar
          right. It stays mounted when the view changes, otherwise there'd be nothing
          to slide — its column's width hides it, not a conditional render.

          Centred on the AVATAR'S BAND (same height as `main`) rather than on the
          column, then nudged up: dead centre falls below the eye line. `lg:pl-14`:
          the rail floats over the scene, and this panel is the only content that
          reaches far enough left to pass under it, so IT moves aside.
        */}
        {!preview && (
          <aside
            className={cx(
              'panel scene__left w-full lg:flex lg:h-[calc(100dvh_-_3rem_-_var(--timeline))] lg:w-80 lg:shrink-0 lg:flex-col lg:justify-center lg:self-start lg:-translate-y-12 lg:pl-14',
              left ? 'panel--open max-lg:order-2' : 'max-lg:hidden'
            )}
          >
            <Settings />
          </aside>
        )}

        {/* The scene. Its height must not depend on the right panel, or the centred
            avatar would move from one tab to the next. */}
        <main
          className={cx(
            // `flag`: the flag is painted on the stage only, the panel stays out
            'scene__avatar relative flex flex-1 items-center justify-center max-lg:h-dvh max-lg:w-full max-lg:flex-col max-lg:gap-4 lg:self-start',
            // On the arrival the stage starts white and its bands come in at the
            // end (`.stripe-intro`); the huge sun must not make the page scroll.
            bare ? 'overflow-clip bg-[var(--white)]' : 'flag',
            // the montage bar's room is only kept where the bar exists, so the
            // ball sits in the middle of the flag everywhere else
            preview || view !== 'animations'
              ? 'lg:min-h-dvh'
              : 'lg:min-h-[calc(100dvh_-_var(--timeline))]'
          )}
        >
          {/* the arrival: the sun rises from behind the flag's lower band */}
          {/* the arrival: the sky-blue bands come in as the sun settles */}
          {bare && !waiting && !preview && (
            <>
              <div className="stripe-intro stripe-intro--top" aria-hidden="true" />
              <div className="stripe-intro stripe-intro--bottom" aria-hidden="true" />
            </>
          )}

          {waiting && !preview && (
            <button type="button" className="sunrise-button" onClick={raiseTheSun}>
              {t('sunrise.start')}
            </button>
          )}

          {/* the avatar fits the available height: on a short window the montage bar
              takes enough room for a 460 square to overflow and scroll the page */}
          <div
            ref={avatarRef}
            // the arrival's giant sun: how much to scale it (see `sunriseScale`)
            style={bare ? ({ '--s': sunriseScale } as CSSProperties) : undefined}
            className={cx(
              'avatar flex aspect-square w-full items-center justify-center',
              preview
                ? 'max-w-[min(560px,calc(100dvh_-_6rem))]'
                : // on a phone the sun takes all the width it can get
                  'max-w-[min(460px,calc(100dvh_-_var(--timeline)_-_7rem))] max-lg:max-w-[min(100vw,100dvh)]',
              bare && (waiting ? 'avatar--waiting' : 'avatar--intro'),
              view === 'settings' && !preview && 'avatar--giant'
            )}
          >
            <SolDeMayo
              ref={bot}
              corona3d
              className="h-auto max-w-full"
              state={state}
              onStateChange={setState}
              block={block}
              onBlockChange={setBlock}
              elapsed={elapsed}
              onElapsedChange={setElapsed}
              playing={playing}
              cycle={played}
              size={preview ? 560 : 440}
              shape={shownShape}
              color={color}
              expression={mood ?? expression}
              follow={view === 'settings'}
              gaze={intro ? (waiting ? facingLook : INTRO_GAZE) : null}
              // the sun starts huge on the arrival: a finer 3D corona holds up
              coronaResolution={bare ? 2 : 1}
            />
          </div>

          {/*
            The export bar does NOT shift the avatar: it's out of the flow, pinned to
            the avatar's COLUMN (fine positioning in globals.css, `.export-bar`).
            Mounted during the arrival but HIDDEN, not absent: that's the starting
            state of its transition. `inert` with the mask: an element at
            `opacity: 0` stays clickable and keyboard-reachable.
          */}
          {SHOW_EXPORT && view === 'customize' && !preview && (
            <div
              className={cx('export-bar', (bare || barHidden) && 'export-bar--hidden')}
              inert={bare || barHidden}
            >
              <ExportBar status={exportState} onExport={(id) => void runExport(id)} />
            </div>
          )}

          {/*
            Both boxes live OUTSIDE the export bar, although it opens the second one:
            the bar carries `inert` when hidden, and `inert` applies to the whole
            subtree — including an element promoted to the top layer.
          */}
          {view === 'animations' && !preview && (
            <CycleDialog
              open={cycleDialog}
              onOpenChange={setCycleDialog}
              format={cycleFormat}
              onFormatChange={setCycleFormat}
              background={cycleBackground}
              onBackgroundChange={setCycleBackground}
              progress={cycleProgress}
              error={cycleError}
              onConfirm={() => void exportCycle()}
              onCancel={cancelCycle}
            />
          )}

          {/* Avatar export: the GIF is the only format that asks for its background. */}
          {view === 'customize' && !preview && (
            <GifDialog
              open={gifDialog}
              onOpenChange={setGifDialog}
              background={gifBackground}
              onBackgroundChange={setGifBackground}
              onConfirm={() => void runExport('gif', true)}
            />
          )}
        </main>

        {/* Phone: the button that opens the expressions sheet, and the veil behind it */}
        {!preview && right && view === 'customize' && (
          <>
            {expressionsMenu && (
              <div
                className="fixed inset-0 z-30 bg-black/30 lg:hidden"
                aria-hidden="true"
                onClick={() => setExpressionsMenu(false)}
              />
            )}
            <button
              type="button"
              className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-20 -translate-x-1/2 cursor-pointer rounded-full bg-[var(--paper)] px-5 py-2.5 text-sm font-semibold text-[var(--ink)] shadow-lg lg:hidden"
              aria-expanded={expressionsMenu}
              onClick={() => setExpressionsMenu(true)}
            >
              {t('panel.expressionsMenu')}
            </button>
          </>
        )}

        {/* fixed width, identical in both views: otherwise the scene shifts on tab
            change. A full-height sidebar on paper, beside the flag, not over it. */}
        {!preview && (
          <aside
            className={cx(
              'panel scene__right w-full bg-[var(--paper)] lg:h-dvh lg:w-80 lg:shrink-0 lg:border-l lg:border-[var(--line)] lg:p-6',
              // phone: a bottom sheet over the flag, only while the menu is open
              'max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:max-h-[75dvh] max-lg:overflow-y-auto max-lg:rounded-t-2xl max-lg:p-5 max-lg:pb-[max(1.25rem,env(safe-area-inset-bottom))] max-lg:shadow-[0_-8px_30px_rgb(0_0_0/0.15)]',
              right ? 'panel--open' : 'max-lg:hidden',
              !expressionsMenu && 'max-lg:hidden'
            )}
          >
            {view === 'animations' ? (
              // palette: a tile appends to the end of the montage
              <>
                <h2 className="text-sm font-semibold">{t('panel.animations')}</h2>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {ORDER.map((s) => (
                    <BotTile
                      key={s.id}
                      label={t(`states.${s.id}`)}
                      selected={s.id === state}
                      state={s.id}
                      shape={shape}
                      color={color}
                      expression={expression}
                      frozenAt={POSES[s.id]}
                      onClick={addHandlers[s.id]}
                    />
                  ))}
                </div>
              </>
            ) : (
              <Customizer
                shape={shape}
                onShapeChange={setShape}
                color={color}
                onColorChange={setColor}
                expression={expression}
                onExpressionChange={setExpression}
              />
            )}
          </aside>
        )}
      </div>

      {/*
        The project's name, big, pinned to the bottom of the screen. At PAGE level and
        not in the panel: the panel carries a `transform`, which would become the
        containing block of a `fixed` child. `aria-hidden`: purely graphic.
      */}
      {view === 'settings' && !preview && (
        <p className="wordmark" aria-hidden="true">
          {NAME}
        </p>
      )}

      {view === 'animations' && !preview && (
        <Timeline
          cycles={cycles}
          onCyclesChange={setCycles}
          activeId={activeId}
          onActiveIdChange={setActiveId}
          block={block}
          onBlockChange={setBlock}
          playing={playing}
          onPlayingChange={setPlaying}
          elapsed={elapsed}
          shape={shape}
          color={color}
          expression={expression}
          onSeek={onSeek}
          onPreview={() => setPreview(true)}
          onExport={() => setCycleDialog(true)}
        />
      )}
    </>
  )
}
