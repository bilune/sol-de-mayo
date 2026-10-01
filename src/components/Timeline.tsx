'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import CycleMenu from '@/components/CycleMenu'
import NameDialog from '@/components/NameDialog'
import TimelineTrack from '@/components/TimelineTrack'
import ZoomSlider from '@/components/ZoomSlider'
import {
  blocksWith,
  makeBlock,
  nextCycleId,
  offsetOf,
  totalDuration,
  uniqueName,
  type Block,
  type Cycle
} from '@/bot/cycles'
import type { StateId } from '@/bot/states'
import { MAX_ZOOM, MIN_ZOOM, mmss } from '@/ui/timeline'
import { cycleName, plural, t, useLanguage } from '@/i18n'

interface TimelineProps {
  /** time elapsed in the current block, for the counter */
  elapsed: number
  shape: string
  color: string
  expression: string
  cycles: Cycle[]
  onCyclesChange: (cycles: Cycle[]) => void
  activeId: string
  onActiveIdChange: (id: string) => void
  block: number
  onBlockChange: (block: number) => void
  playing: boolean
  onPlayingChange: (playing: boolean) => void
  /**
   * `onSeek`: playhead moved, only the player knows how to re-sync the engine.
   * `onPreview`: the whole page stages itself, it's the one deciding.
   */
  onSeek: (seconds: number) => void
  onPreview: () => void
  onExport: () => void
}

/**
 * Montage bar: it holds the cycles (choice, creation, renaming, removal) and
 * playback. The track itself is in `TimelineTrack` — here we know nothing of the
 * gestures, there nothing of the cycles.
 *
 * It re-renders on every animation frame (`elapsed`): only the counters and the
 * track's playhead depend on it, so the handlers are stable and the heavy children
 * memoized.
 */
export default function Timeline({
  elapsed,
  shape,
  color,
  expression,
  cycles,
  onCyclesChange,
  activeId,
  onActiveIdChange,
  block,
  onBlockChange,
  playing,
  onPlayingChange,
  onSeek,
  onPreview,
  onExport
}: TimelineProps) {
  const language = useLanguage()

  const [zoom, setZoom] = useState(1)

  const cycle = useMemo(
    () => cycles.find((c) => c.id === activeId) ?? cycles[0]!,
    [cycles, activeId]
  )
  const blocks = cycle.blocks
  const total = useMemo(() => totalDuration(blocks), [blocks])
  const at = offsetOf(blocks, block) + elapsed

  /**
   * Naming a cycle: same dialog for creation and renaming, the latter carrying the
   * target id. Creation only happens on submit — cancelling must not leave an empty
   * cycle behind.
   */
  const [naming, setNaming] = useState<{ mode: 'create' | 'rename'; id?: string } | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [nameOpen, setNameOpen] = useState(false)

  /** Montage awaiting removal confirmation. */
  const [removing, setRemoving] = useState<Cycle | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  /* Latest props and state, for the stable handlers below. */
  const L = useRef({ cycles, cycle, activeId, naming, removing, onCyclesChange, onActiveIdChange, onBlockChange, onSeek })
  useLayoutEffect(() => {
    L.current = { cycles, cycle, activeId, naming, removing, onCyclesChange, onActiveIdChange, onBlockChange, onSeek }
  })

  /*
   * Built once: they only read `L` and state setters. Stable identities are what
   * let the memoized `CycleMenu` and the track's cards skip the per-frame renders.
   */
  const [h] = useState(() => {
    /** Replaces the current cycle: cycles are values, never mutated. */
    function edit(next: Partial<Cycle>) {
      const { cycles, cycle } = L.current
      L.current.onCyclesChange(cycles.map((c) => (c.id === cycle.id ? { ...c, ...next } : c)))
    }

    function select(id: string) {
      L.current.onActiveIdChange(id)
      L.current.onBlockChange(0)
    }

    return {
      select,
      askCreate() {
        setNaming({ mode: 'create' })
        setNameDraft(uniqueName(t('cycles.newName'), L.current.cycles))
        setNameOpen(true)
      },
      askRename(id: string) {
        setNaming({ mode: 'rename', id })
        const aim = L.current.cycles.find((c) => c.id === id)
        // the seed montage has no name of its own: start from the displayed one,
        // otherwise renaming would begin on an empty field
        setNameDraft(aim ? cycleName(aim) : '')
        setNameOpen(true)
      },
      onNamed(name: string) {
        const { cycles, naming: request } = L.current
        setNaming(null)
        if (!request) return
        if (request.mode === 'create') {
          // never an empty cycle: the player would have a montage with nothing to play
          const created: Cycle = {
            id: nextCycleId(cycles),
            name: uniqueName(name, cycles),
            blocks: [makeBlock('idle')]
          }
          L.current.onCyclesChange([...cycles, created])
          select(created.id)
          return
        }
        const others = cycles.filter((c) => c.id !== request.id)
        const unique = uniqueName(name, others)
        L.current.onCyclesChange(cycles.map((c) => (c.id === request.id ? { ...c, name: unique } : c)))
      },
      /** Removing a montage: never without confirmation, it's irreversible. */
      askRemove(id: string) {
        setRemoving(L.current.cycles.find((c) => c.id === id) ?? null)
        setConfirmOpen(true)
      },
      onRemove() {
        const { cycles, activeId, removing: target } = L.current
        setRemoving(null)
        if (!target) return
        const remaining = cycles.filter((c) => c.id !== target.id)
        L.current.onCyclesChange(remaining)
        if (target.id === activeId) select(remaining[0]!.id)
      },
      blocksChange(b: Block[]) {
        edit({ blocks: b })
      },
      add(s: StateId) {
        edit({ blocks: blocksWith(L.current.cycle.blocks, s) })
      },
      seek(seconds: number) {
        L.current.onSeek(seconds)
      }
    }
  })

  // Nothing here depends on the frame: kept out of the per-frame render.
  const zoomSlider = useMemo(
    () => <ZoomSlider zoom={zoom} min={MIN_ZOOM} max={MAX_ZOOM} onZoomChange={setZoom} />,
    [zoom]
  )

  const dialogs = useMemo(
    () => (
      <>
        <NameDialog
          open={nameOpen}
          onOpenChange={setNameOpen}
          value={nameDraft}
          onValueChange={setNameDraft}
          title={naming?.mode === 'rename' ? t('dialog.nameRenameTitle') : t('dialog.nameCreateTitle')}
          label={t('dialog.nameField')}
          submitLabel={naming?.mode === 'rename' ? t('dialog.nameRename') : t('dialog.nameCreate')}
          onSubmit={h.onNamed}
        />

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={t('dialog.removeTitle', { name: removing ? cycleName(removing) : '' })}
          detail={plural('dialog.removeDetail', removing?.blocks.length ?? 0)}
          confirmLabel={t('dialog.removeConfirm')}
          onConfirm={h.onRemove}
        />
      </>
    ),
    // `language`: the labels are resolved here, outside the dialogs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nameOpen, nameDraft, naming, confirmOpen, removing, h, language]
  )

  return (
    /*
      Montage bar: fixed at the bottom, with no background nor frame — it must read
      as part of the page, like the right-hand panel, before whose column it stops
      (panel width + gutter + margin). The scene reserves its height (`--timeline`)
      in this view, and the avatar strip reserves it everywhere else — otherwise the
      centred avatar would jump from one tab to the other.

      `lg:left-[4.5rem]` answers `lg:right-[24.5rem]`: the strip covers EXACTLY the
      avatar's column, so the play button falls right under the ball. Without it the
      strip started at the window's edge and its centre was 20 px off.

      4.5rem = the scene's margin (2rem) + the grid gutter (2.5rem): the left column
      has ZERO width outside the settings, but the grid keeps its `column-gap`, so the
      avatar column starts at 72 px, not 32. It's the mirror of 24.5rem = panel (20) +
      gutter (2.5) + margin (2).

      The BACKGROUND only appears below 64rem, and it's not a styling choice. Above
      it, the page doesn't scroll (`#app { overflow: clip }`) and the scene reserves
      exactly this strip: nothing ever passes behind, so a transparent bar reads as
      part of the page. Below, the page really scrolls, and the animation palette
      showed straight through the track — the zoom slider and the tiles' labels
      overlapped. The top rule says where the page stops scrolling.
    */
    <div className="fixed inset-x-0 bottom-0 z-30 h-[var(--timeline)] px-6 pt-3 pb-5 max-lg:border-t max-lg:border-[var(--line)] max-lg:bg-[var(--paper)] max-lg:px-5 lg:right-[24.5rem] lg:left-[4.5rem]">
      {/* playback: floating above the track, centred, elapsed time on the left and
          total duration on the right.

          Both counters disappear below 64rem: they stick out of the top of the bar,
          so out of the background that makes it readable, and they fell on the
          palette scrolling behind. The button stays — a solid disc reads over
          anything, and it's the view's main control. The same pair of values is
          shown in the toolbar anyway, bottom right. */}
      <div className="absolute -top-5 left-1/2 flex -translate-x-1/2 items-center gap-3">
        <span className="text-sm font-medium tabular-nums max-lg:hidden">{mmss(at)}</span>
        <button
          type="button"
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-[var(--ink)] text-[var(--paper)] shadow-sm transition hover:scale-105 active:scale-95"
          aria-label={playing ? t('timeline.pause') : t('timeline.play')}
          onClick={() => onPlayingChange(!playing)}
        >
          {/*
            Play / pause: solid Solar (`solar:play-bold`, `solar:pause-bold`), the same
            library as the side rail. Paths copied as-is from Iconify, as there — don't
            redraw them. Same size for both: their boxes are both 20 units high out of
            24, so both glyphs have the same optical height. The triangle is off-centre
            to the right in its box (middle at x = 13.45) and that's intended: a
            triangle's centre of mass is left of its frame, "re-centring" it would make
            it look too far left.
          */}
          {!playing ? (
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21.4086 9.35258C23.5305 10.5065 23.5305 13.4935 21.4086 14.6474L8.59662 21.6145C6.53435 22.736 4 21.2763 4 18.9671L4 5.0329C4 2.72368 6.53435 1.26402 8.59661 2.38548L21.4086 9.35258Z"
              />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <g fill="currentColor">
                <path d="M2 6C2 4.11438 2 3.17157 2.58579 2.58579C3.17157 2 4.11438 2 6 2C7.88562 2 8.82843 2 9.41421 2.58579C10 3.17157 10 4.11438 10 6V18C10 19.8856 10 20.8284 9.41421 21.4142C8.82843 22 7.88562 22 6 22C4.11438 22 3.17157 22 2.58579 21.4142C2 20.8284 2 19.8856 2 18V6Z" />
                <path d="M14 6C14 4.11438 14 3.17157 14.5858 2.58579C15.1716 2 16.1144 2 18 2C19.8856 2 20.8284 2 21.4142 2.58579C22 3.17157 22 4.11438 22 6V18C22 19.8856 22 20.8284 21.4142 21.4142C20.8284 22 19.8856 22 18 22C16.1144 22 15.1716 22 14.5858 21.4142C14 20.8284 14 19.8856 14 18V6Z" />
              </g>
            </svg>
          )}
        </button>
        <span className="text-sm tabular-nums text-[var(--muted)] max-lg:hidden">{mmss(total)}</span>
      </div>

      {/* nothing gets selected in a toolbar: it helps no one and highlights
          everything as soon as a card or the playhead is dragged */}
      <div className="flex h-full flex-col gap-2 select-none">
        {/*
          The montage's name on the left, what to do with it on the right: export is
          an action on the CYCLE, like renaming or removing it, not a display setting.
          At the bottom it sat next to the zoom and the preview, which only change the
          way of looking — and it read as one more icon.
        */}
        <div className="flex items-center justify-between gap-1">
          <CycleMenu
            activeId={activeId}
            onActiveIdChange={onActiveIdChange}
            cycles={cycles}
            current={cycle}
            onCreate={h.askCreate}
            onRename={h.askRename}
            onRemove={h.askRemove}
          />

          <button
            type="button"
            className="flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-[var(--ink)] pr-3.5 pl-3 text-sm font-medium text-[var(--paper)] shadow-sm transition hover:opacity-90 active:scale-95 max-sm:w-8 max-sm:justify-center max-sm:px-0"
            onClick={onExport}
          >
            {/* solar:download-minimalistic-linear, the same as the export bar */}
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <g
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
              >
                <path d="M3 15C3 17.8284 3 19.2426 3.87868 20.1213C4.75736 21 6.17157 21 9 21H15C17.8284 21 19.2426 21 20.1213 20.1213C21 19.2426 21 17.8284 21 15" />
                <path d="M12 3V16M8 11.625L12 16L16 11.625" />
              </g>
            </svg>
            {/* `sr-only` and not `hidden`: below 40rem the button shrinks to its icon,
                but the label stays its accessible NAME — a button whose whole content
                is hidden is no longer announced at all, and it would then have
                neither `aria-label` nor text. */}
            <span className="max-sm:sr-only">{t('timeline.export')}</span>
          </button>
        </div>

        <TimelineTrack
          block={block}
          onBlockChange={onBlockChange}
          zoom={zoom}
          onZoomChange={setZoom}
          blocks={blocks}
          elapsed={elapsed}
          shape={shape}
          color={color}
          expression={expression}
          onBlocksChange={h.blocksChange}
          onAdd={h.add}
          onSeek={h.seek}
        />

        {/* toolbar, in the corner: zoom, counter, preview */}
        <div className="flex shrink-0 items-center justify-end gap-4 max-sm:gap-2">
          {zoomSlider}

          <p className="text-xs tabular-nums text-[var(--muted)]">
            <span className="text-[var(--ink)]">{mmss(at)}</span> / {mmss(total)}
          </p>

          {/* tooltip on hover AND on keyboard focus, like the side rail */}
          <span className="group relative flex">
            <button
              type="button"
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-black/5 hover:text-[var(--ink)]"
              aria-label={t('timeline.preview')}
              onClick={onPreview}
            >
              {/*
                Preview: Solar's solid eye (`solar:eye-bold`), same library as the side
                rail. The eyelid is hollowed around the pupil (`fill-rule="evenodd"`):
                the solid disc filling it is the second path, don't merge the two.
              */}
              <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
                <g fill="currentColor">
                  <path d="M9.75 12C9.75 10.7574 10.7574 9.75 12 9.75C13.2426 9.75 14.25 10.7574 14.25 12C14.25 13.2426 13.2426 14.25 12 14.25C10.7574 14.25 9.75 13.2426 9.75 12Z" />
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M2 12C2 13.6394 2.42496 14.1915 3.27489 15.2957C4.97196 17.5004 7.81811 20 12 20C16.1819 20 19.028 17.5004 20.7251 15.2957C21.575 14.1915 22 13.6394 22 12C22 10.3606 21.575 9.80853 20.7251 8.70433C19.028 6.49956 16.1819 4 12 4C7.81811 4 4.97196 6.49956 3.27489 8.70433C2.42496 9.80853 2 10.3606 2 12ZM12 8.25C9.92893 8.25 8.25 9.92893 8.25 12C8.25 14.0711 9.92893 15.75 12 15.75C14.0711 15.75 15.75 14.0711 15.75 12C15.75 9.92893 14.0711 8.25 12 8.25Z"
                  />
                </g>
              </svg>
            </button>
            <span
              className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 translate-y-1 rounded-lg bg-[var(--ink)] px-2.5 py-1.5 text-xs whitespace-nowrap text-[var(--paper)] opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
              role="tooltip"
            >
              {t('timeline.preview')}
            </span>
          </span>
        </div>
      </div>

      {dialogs}
    </div>
  )
}
