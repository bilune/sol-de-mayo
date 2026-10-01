'use client'

import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'
import BlockPicker from '@/components/BlockPicker'
import SolDeMayo from '@/components/SolDeMayo'
import {
  clampDuration,
  moveBlock,
  offsetOf,
  STEP,
  totalDuration,
  type Block
} from '@/bot/cycles'
import { POSES, type StateId } from '@/bot/states'
import { BASE_SCALE, clampZoom, ticksFor } from '@/ui/timeline'
import { cx } from '@/ui/dom'
import { formatSeconds, formatSecondsShort, t, useLanguage } from '@/i18n'

interface TimelineTrackProps {
  blocks: Block[]
  onBlocksChange: (blocks: Block[]) => void
  /** time elapsed in the current block, for the playhead */
  elapsed: number
  shape: string
  color: string
  expression: string
  /** Playback cursor and zoom: the bar displays them, the track manipulates them. */
  block: number
  onBlockChange: (block: number) => void
  zoom: number
  onZoomChange: (zoom: number) => void
  /** date aimed at on the ruler */
  onSeek: (seconds: number) => void
  onAdd: (state: StateId) => void
}

/**
 * Drag and drop: during the gesture, the montage is NOT modified. The grabbed card
 * follows the pointer and the others move aside by its width — that's what gives
 * the feeling of moving an object. The montage is only recomposed on release:
 * reordering live would make the card jump from slot to slot under the finger.
 */
type Drag = { from: number; to: number; startX: number; dx: number; moved: boolean }
type Resize = { index: number; startX: number; startDuration: number }

/**
 * Event handlers of the cards and the ruler. Stable for the component's lifetime
 * (they read the latest props from a ref), so the memoized cards and ruler don't
 * re-render on every frame of the playhead.
 */
interface Handlers {
  blockDown: (index: number, e: ReactPointerEvent<HTMLElement>) => void
  blockMove: (e: ReactPointerEvent<HTMLElement>) => void
  blockUp: (index: number) => void
  blockCancel: () => void
  cardKey: (index: number, e: ReactKeyboardEvent<HTMLElement>) => void
  resizeDown: (index: number, e: ReactPointerEvent<HTMLElement>) => void
  resizeMove: (e: ReactPointerEvent<HTMLElement>) => void
  resizeEnd: () => void
  resizeKey: (index: number, delta: number) => void
  remove: (index: number) => void
  rulerDown: (e: ReactPointerEvent<HTMLElement>) => void
  rulerMove: (e: ReactPointerEvent<HTMLElement>) => void
  rulerEnd: () => void
  add: (state: StateId) => void
}

/**
 * The track: a graduated ruler, the montage's cards, and the gestures that go with
 * them (move, stretch, scrub the playhead, zoom). It knows neither the cycles nor
 * the player — it receives a sequence of blocks and returns the one obtained after
 * the gesture.
 *
 * It re-renders on every animation frame (`elapsed`), but only the playhead and the
 * scrub bubble depend on it: the ruler and the cards are memoized.
 */
export default function TimelineTrack({
  blocks,
  onBlocksChange,
  elapsed,
  shape,
  color,
  expression,
  block,
  onBlockChange,
  zoom,
  onZoomChange,
  onSeek,
  onAdd
}: TimelineTrackProps) {
  useLanguage()

  const scale = BASE_SCALE * zoom
  const total = useMemo(() => totalDuration(blocks), [blocks])
  const at = offsetOf(blocks, block) + elapsed
  const ticks = useMemo(() => ticksFor(total, scale), [total, scale])

  const track = useRef<HTMLDivElement | null>(null)
  /** Track overflow, to show the gradients only when they're useful. */
  const [overflow, setOverflow] = useState({ left: false, right: false })
  /**
   * Track scroll. The time bubble can't live inside it — the container clips what
   * overflows vertically, and the bubble floats above the ruler — so it's positioned
   * outside, and must subtract this scroll.
   */
  const [scrolled, setScrolled] = useState(0)
  /**
   * Last known `scrollLeft`, read by the zoom anchor. React runs its effects AFTER
   * the DOM update: by then a zoom-out has already
   * shrunk the track and the browser may have clamped the live value.
   */
  const scrollLeft = useRef(0)

  const [drag, setDragState] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const resize = useRef<Resize | null>(null)
  const [scrubbing, setScrubbingState] = useState(false)
  const scrubbingRef = useRef(false)

  /**
   * Anchor of the next scale change, in screen coordinates: the second found there
   * must stay there. Without it, zooming on a given card makes it flee off screen.
   * `null` = the centre of what's visible, the right compromise when the zoom comes
   * from the bar's slider.
   */
  const anchorX = useRef<number | null>(null)

  /** Card to focus once the list is rebuilt, after a keyboard move. */
  const pendingFocus = useRef<number | null>(null)

  /*
   * Latest props, for the stable handlers and the window/native listeners. Refreshed
   * before any effect of this render reads it.
   */
  const L = useRef({ blocks, block, scale, total, at, zoom, onBlocksChange, onBlockChange, onZoomChange, onSeek, onAdd })
  useLayoutEffect(() => {
    L.current = { blocks, block, scale, total, at, zoom, onBlocksChange, onBlockChange, onZoomChange, onSeek, onAdd }
  })

  function setDrag(d: Drag | null) {
    dragRef.current = d
    setDragState(d)
  }

  function setScrubbing(on: boolean) {
    scrubbingRef.current = on
    setScrubbingState(on)
  }

  /* -------------------------------------------------------- scroll, zoom */

  function onScroll() {
    const el = track.current
    if (!el) return
    scrollLeft.current = el.scrollLeft
    setScrolled(el.scrollLeft)
    const left = el.scrollLeft > 4
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
    setOverflow((o) => (o.left === left && o.right === right ? o : { left, right }))
  }

  function setZoom(next: number, clientX?: number) {
    anchorX.current = clientX ?? null
    L.current.onZoomChange(clampZoom(next))
  }

  const seenScale = useRef(scale)
  useLayoutEffect(() => {
    const before = seenScale.current
    if (before === scale) return
    seenScale.current = scale
    const el = track.current
    if (!el) return
    const left = el.getBoundingClientRect().left
    const x = (anchorX.current ?? left + el.clientWidth / 2) - left
    const second = (scrollLeft.current + x) / before
    anchorX.current = null
    el.scrollLeft = second * scale - x
    onScroll()
  })

  /**
   * Wheel and trackpad on the track:
   * - trackpad pinch (the browser reports it as a wheel + `ctrl`, that's the
   *   convention) or `ctrl`/`cmd` + wheel → zoom;
   * - two fingers horizontally → scroll, that's already `deltaX`;
   * - mouse wheel, which has no horizontal axis → its `deltaY` is sent to the
   *   track's scroll, otherwise it would be useless here.
   * `deltaMode` is 1 when the system counts in lines rather than pixels (some mice
   * under Firefox): without the factor, the gesture would be fifteen times too slow.
   *
   * A native listener: React registers `wheel` as passive, so `preventDefault`
   * would be ignored there.
   */
  useEffect(() => {
    const el = track.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      const el = track.current
      if (!el) return
      const unit = e.deltaMode === 1 ? 16 : 1
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        setZoom(L.current.zoom * Math.exp((-e.deltaY * unit) / 180), e.clientX)
        return
      }
      if (el.scrollWidth <= el.clientWidth) return
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (!d) return
      e.preventDefault()
      el.scrollLeft += d * unit
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // on mount, then whenever the montage changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(onScroll, [total, blocks])

  // The current card stays visible when the track overflows the window.
  const seenBlock = useRef(block)
  useEffect(() => {
    if (seenBlock.current === block) return
    seenBlock.current = block
    const el = track.current
    const b = blocks[block]
    if (!el || !b) return
    const x = offsetOf(blocks, block) * scale
    if (x < el.scrollLeft || x + b.duration * scale > el.scrollLeft + el.clientWidth) {
      el.scrollTo({ left: Math.max(0, x - 24), behavior: 'smooth' })
    }
  })

  // Keyboard move: the focus follows the moved card, once the list is rebuilt.
  useLayoutEffect(() => {
    const target = pendingFocus.current
    if (target === null) return
    pendingFocus.current = null
    const list = track.current?.querySelectorAll<HTMLButtonElement>('[data-card]')
    list?.[target]?.focus()
  })

  /* ------------------------------------------------------------- montage */

  function removeBlock(index: number) {
    const { blocks, block } = L.current
    // the last card doesn't go: an empty montage would have nothing to play
    if (blocks.length < 2) return
    L.current.onBlocksChange(blocks.filter((_, i) => i !== index))
    // the cursor follows: a card removed before it shifts it by one, and it must
    // never point past the track
    if (index < block) L.current.onBlockChange(block - 1)
    else if (block >= blocks.length - 1) L.current.onBlockChange(blocks.length - 2)
  }

  function setDuration(index: number, wanted: number) {
    const { blocks } = L.current
    const b = blocks[index]
    if (!b) return
    const duration = clampDuration(b.state, wanted)
    if (duration === b.duration) return
    L.current.onBlocksChange(blocks.map((old, i) => (i === index ? { ...old, duration } : old)))
  }

  /* ------------------------------------------------------ drag / stretch */

  /** Index of the card under a position, in seconds from the start of the track. */
  function indexAt(seconds: number) {
    const { blocks } = L.current
    let acc = 0
    for (let i = 0; i < blocks.length; i++) {
      acc += blocks[i]!.duration
      if (seconds < acc) return i
    }
    return blocks.length - 1
  }

  function pointerSeconds(e: ReactPointerEvent) {
    const el = track.current
    const box = el?.getBoundingClientRect()
    if (!box) return 0
    return (e.clientX - box.left + (el?.scrollLeft ?? 0)) / L.current.scale
  }

  function onBlockDown(index: number, e: ReactPointerEvent<HTMLElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ from: index, to: index, startX: e.clientX, dx: 0, moved: false })
  }

  function onBlockMove(e: ReactPointerEvent<HTMLElement>) {
    const d = dragRef.current
    if (!d) return
    // a few pixels of tolerance: a click always trembles a little
    if (!d.moved && Math.abs(e.clientX - d.startX) <= 4) return
    setDrag({
      ...d,
      moved: true,
      dx: e.clientX - d.startX,
      to: Math.max(0, indexAt(pointerSeconds(e)))
    })
  }

  function onBlockUp(index: number) {
    const d = dragRef.current
    setDrag(null)
    if (!d) return
    // a click without movement is a jump of the playhead
    if (!d.moved) {
      L.current.onBlockChange(index)
      return
    }
    if (d.to === d.from) return
    // the cursor follows the moved card, otherwise playback would jump elsewhere
    const { blocks, block } = L.current
    const tracking = block === d.from ? d.to : block
    L.current.onBlocksChange(moveBlock(blocks, d.from, d.to))
    L.current.onBlockChange(tracking)
  }

  function onResizeDown(index: number, e: ReactPointerEvent<HTMLElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    resize.current = { index, startX: e.clientX, startDuration: L.current.blocks[index]!.duration }
  }

  function onResizeMove(e: ReactPointerEvent<HTMLElement>) {
    const r = resize.current
    if (!r) return
    setDuration(r.index, r.startDuration + (e.clientX - r.startX) / L.current.scale)
  }

  /** The keyboard stretches too: the handle is a button, not just an area. */
  function onResizeKey(index: number, delta: number) {
    setDuration(index, L.current.blocks[index]!.duration + delta)
  }

  /* ---------------------------------------------------------- keyboard */

  /**
   * Reordering and seeking WITH THE KEYBOARD.
   *
   * Drag and drop had no equivalent: a block could be added, removed and stretched —
   * the handle already takes the arrows — but never REORDERED, and precise seeking
   * only existed with the pointer, on the ruler. It was the editor's one
   * inaccessible gesture.
   *
   * `Alt` + arrows moves the card, bare arrows move the playhead by `STEP`. Alt and
   * not bare arrows for the move: a card is a button in a list, and arrows there are
   * first for navigating.
   *
   * The focus FOLLOWS the moved card, otherwise the next press pushes another one.
   * It has to wait for the render: the list is rebuilt, so the destination button
   * doesn't exist yet (see the `pendingFocus` effect).
   *
   * The card carries `aria-keyshortcuts`: a shortcut nothing announces is not an
   * affordance. It's the attribute made for that, and it avoids lengthening the
   * label, which is re-read on every card of the track.
   */
  function onCardKey(index: number, e: ReactKeyboardEvent<HTMLElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      L.current.onBlockChange(index)
      return
    }
    const direction = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    if (!direction) return
    e.preventDefault()

    const { blocks, total, at } = L.current
    if (!e.altKey) {
      // seeking: the playhead moves one step, across the whole montage
      L.current.onSeek(Math.max(0, Math.min(total - 0.001, at + direction * STEP)))
      return
    }

    const target = index + direction
    if (target < 0 || target >= blocks.length) return
    L.current.onBlocksChange(moveBlock(blocks, index, target))
    L.current.onBlockChange(target)
    pendingFocus.current = target
  }

  /* ------------------------------------------------------------- scrub */

  function scrubTo(e: ReactPointerEvent) {
    L.current.onSeek(Math.max(0, Math.min(L.current.total - 0.001, pointerSeconds(e))))
  }

  function onRulerDown(e: ReactPointerEvent<HTMLElement>) {
    // without this, scrubbing the playhead highlights the graduations on the way:
    // the browser starts a text selection on the induced `mousedown`
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setScrubbing(true)
    scrubTo(e)
  }

  function onRulerMove(e: ReactPointerEvent<HTMLElement>) {
    if (scrubbingRef.current) scrubTo(e)
  }

  /*
   * Built once: every function above only reads refs and state setters, so the
   * first render's closures stay valid for the component's lifetime.
   */
  const [h] = useState<Handlers>(() => ({
    blockDown: onBlockDown,
    blockMove: onBlockMove,
    blockUp: onBlockUp,
    blockCancel: () => setDrag(null),
    cardKey: onCardKey,
    resizeDown: onResizeDown,
    resizeMove: onResizeMove,
    resizeEnd: () => {
      resize.current = null
    },
    resizeKey: onResizeKey,
    remove: removeBlock,
    rulerDown: onRulerDown,
    rulerMove: onRulerMove,
    rulerEnd: () => setScrubbing(false),
    add: (state) => L.current.onAdd(state)
  }))

  /** Offset to apply to a card while another one is being moved. */
  function shiftOf(i: number) {
    const d = drag
    if (!d?.moved) return 0
    if (i === d.from) return d.dx
    const w = blocks[d.from]!.duration * scale
    if (d.to > d.from && i > d.from && i <= d.to) return -w
    if (d.to < d.from && i >= d.to && i < d.from) return w
    return 0
  }

  // Everything below depends on the montage and the gesture, never on the frame.
  const cards = useMemo(
    () => (
      <ul className="flex flex-1 items-stretch">
        {blocks.map((b, i) => (
          <Card
            key={`${i}-${b.state}`}
            b={b}
            i={i}
            scale={scale}
            selected={i === block}
            shift={shiftOf(i)}
            lifted={Boolean(drag?.moved) && i === drag?.from}
            removable={blocks.length > 1}
            shape={shape}
            color={color}
            expression={expression}
            h={h}
          />
        ))}

        <li className="w-[72px] shrink-0 pl-1">
          <BlockPicker shape={shape} color={color} expression={expression} onPick={h.add} />
        </li>
      </ul>
    ),
    // `shiftOf` only reads `drag`, `blocks` and `scale`
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blocks, scale, block, drag, shape, color, expression, h]
  )

  return (
    <div className="relative flex-1">
      <div
        ref={track}
        className="h-full overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
        onScroll={onScroll}
      >
        {/* the track keeps room for the "+" card after it */}
        <div className="relative flex h-full flex-col" style={{ width: `${total * scale + 76}px` }}>
          <Ruler ticks={ticks} scale={scale} h={h} />

          {cards}

          {/*
            Playhead: only its transform changes from one frame to the next, and it
            lives in the track, so it scrolls with it. Its handle is in the ruler,
            where it's grabbed.
          */}
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-0.5 rounded-full bg-[var(--ink)]"
            style={{ transform: `translateX(${at * scale}px)` }}
          >
            <span className="absolute -top-0.5 -left-[5px] h-3 w-3 rounded-full border-2 border-[var(--paper)] bg-[var(--ink)]" />
          </div>
        </div>
      </div>

      {/*
        Exact time while scrubbing: to the tenth, where the bar's counter rounds to
        the second. It floats above the ruler, so outside the scrolling container —
        hence the subtracted `scrolled`.
      */}
      {scrubbing && (
        <div
          className="pointer-events-none absolute top-0 left-0 z-10"
          style={{ transform: `translate(${at * scale - scrolled}px, -70%)` }}
        >
          <span className="block -translate-x-1/2 rounded-md bg-[var(--ink)] px-2 py-1 text-xs tabular-nums text-[var(--paper)] shadow-sm">
            {formatSeconds(at)}
          </span>
        </div>
      )}

      {/* overflow gradients: the track continues that way */}
      {overflow.left && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[var(--paper)] to-transparent" />
      )}
      {overflow.right && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[var(--paper)] to-transparent" />
      )}
    </div>
  )
}

/**
 * Graduated ruler: it's also a scrubbing area. Grab it anywhere to move the
 * playhead, as in a video editor — it's the only way to reach a PRECISE point of a
 * card, clicking a card only jumps to its start.
 */
const Ruler = memo(function Ruler({
  ticks,
  scale,
  h
}: {
  ticks: Array<{ t: number; major: boolean }>
  scale: number
  h: Handlers
}) {
  useLanguage()
  return (
    <div
      className="relative h-7 shrink-0 cursor-ew-resize pt-1 select-none"
      onPointerDown={h.rulerDown}
      onPointerMove={h.rulerMove}
      onPointerUp={h.rulerEnd}
      onPointerCancel={h.rulerEnd}
    >
      {ticks.map((tick) => (
        <span
          key={tick.t}
          className="absolute bottom-1.5 flex items-end gap-1"
          style={{ transform: `translateX(${tick.t * scale}px)` }}
        >
          <span className={cx('block w-px bg-[var(--line)]', tick.major ? 'h-3' : 'h-1.5')} />
          {tick.major && (
            <span className="-mb-0.5 text-xs leading-none text-[var(--muted)]">
              {formatSecondsShort(tick.t, Number.isInteger(tick.t) ? 0 : 1)}
            </span>
          )}
        </span>
      ))}
    </div>
  )
})

interface CardProps {
  b: Block
  i: number
  scale: number
  selected: boolean
  shift: number
  lifted: boolean
  removable: boolean
  shape: string
  color: string
  expression: string
  h: Handlers
}

/**
 * One montage card. The <li>'s width is exactly the card's duration: the gutter is
 * an inner padding, otherwise the cards would shift the track and the playhead
 * would no longer line up.
 */
const Card = memo(function Card({
  b,
  i,
  scale,
  selected,
  shift,
  lifted,
  removable,
  shape,
  color,
  expression,
  h
}: CardProps) {
  useLanguage()
  const width = b.duration * scale
  const label = t(`states.${b.state}`)

  return (
    <li
      className={cx('group relative shrink-0 pr-1', lifted ? 'z-20' : 'transition-transform duration-150 ease-out')}
      style={{
        width: `${width}px`,
        transform: shift ? `translateX(${shift}px)` : undefined
      }}
    >
      <button
        type="button"
        className={cx(
          'flex h-full w-full cursor-grab flex-col justify-between overflow-hidden rounded-lg px-1.5 py-1 text-left transition select-none active:cursor-grabbing',
          selected
            ? 'bg-white ring-2 ring-[var(--ink)] ring-inset'
            : 'bg-black/[0.045] hover:bg-black/[0.08]',
          lifted ? 'scale-[1.02] opacity-75 shadow-lg' : ''
        )}
        aria-label={t('timeline.blockAria', { state: label, duration: formatSeconds(b.duration) })}
        aria-current={selected ? 'true' : undefined}
        onPointerDown={(e) => h.blockDown(i, e)}
        onPointerMove={h.blockMove}
        onPointerUp={() => h.blockUp(i)}
        onPointerCancel={h.blockCancel}
        data-card=""
        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight ArrowLeft ArrowRight"
        onKeyDown={(e) => h.cardKey(i, e)}
      >
        {/* the thumbnail IS the card's identity, like a page's thumbnail: the name
            would add nothing, it only stays in the button's label, for screen readers */}
        <span className="flex min-w-0 flex-1 items-center justify-center">
          {width > 44 && (
            <SolDeMayo
              className="shrink-0"
              state={b.state}
              size={Math.min(56, Math.max(30, width * 0.5))}
              shape={shape}
              color={color}
              expression={expression}
              paper={selected ? '#ffffff' : '#f2f2f2'}
              frozenAt={POSES[b.state]}
            />
          )}
        </span>
        {width > 50 && (
          <span
            className={cx(
              'truncate text-center text-xs leading-none font-semibold tabular-nums',
              selected ? 'text-[var(--ink)]' : 'text-[var(--muted)]'
            )}
          >
            {formatSeconds(b.duration)}
          </span>
        )}
      </button>

      {/* duration handle: a button in its own right, so usable with the keyboard */}
      <button
        type="button"
        className="absolute inset-y-2 right-0.5 w-1 cursor-ew-resize rounded-full bg-[var(--muted)] opacity-0 transition group-hover:opacity-60 hover:opacity-100! focus-visible:opacity-100"
        aria-label={t('timeline.blockDurationAria', { state: label, duration: formatSeconds(b.duration) })}
        onPointerDown={(e) => h.resizeDown(i, e)}
        onPointerMove={h.resizeMove}
        onPointerUp={h.resizeEnd}
        onPointerCancel={h.resizeEnd}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            h.resizeKey(i, -STEP)
          } else if (e.key === 'ArrowRight') {
            e.preventDefault()
            h.resizeKey(i, STEP)
          }
        }}
      />
      {removable && (
        <button
          type="button"
          className="absolute top-1 right-2 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-black/10 text-[var(--ink)] opacity-0 transition group-hover:opacity-100 hover:bg-black/20 focus-visible:opacity-100"
          aria-label={t('timeline.blockRemoveAria', { state: label })}
          onClick={() => h.remove(i)}
        >
          {/* drawn cross: the font's "×" glyph doesn't sit at the pill's optical centre */}
          <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
            <path
              d="M2.6 2.6 7.4 7.4M7.4 2.6 2.6 7.4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </li>
  )
})
