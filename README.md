# Sol de Mayo

The Sol de Mayo from the Argentine flag, alive: 3D rays that turn with the face and 16
expressions drawn with the strokes of the official sun. Next.js 16 / React 19, no
animation library.

## Running it

```bash
pnpm install
pnpm dev        # http://localhost:5190
pnpm test       # vitest (211 tests)
pnpm build      # tsc --noEmit && next build
```

## Layout

| Path | What | Framework |
|---|---|---|
| `src/bot/` | The engine: shapes, states, eyes, montage. `engine.sample(t)` is a pure function of time. | none |
| `src/ui/` | Gaze rules, arrival, export (SVG/PNG/GIF/MP4), storage, timeline maths | none, except `capture.ts` (React roots for off-screen rendering) and `useModalDialog.ts` |
| `src/i18n/` | Hand-rolled translation layer (es/en/fr/zh). `useLanguage()` subscribes a component to language changes. | tiny external store |
| `src/components/` | UI. `App.tsx` is the root, `SolDeMayo.tsx` the avatar. | React 19 client components |
| `src/app/` | Next.js shell: metadata, `#app` root, client-only entry | App Router |
| `docs/` | Design notes: architecture, measurements, interface traps, export | |

The whole app renders client-side only (`src/app/ClientApp.tsx`, `ssr: false`): it reads
the URL fragment, `localStorage`, the navigation type and `matchMedia` before its first
frame.

## How the avatar component works

- Models are props `x` + `onXChange`. `SolDeMayo` keeps a local copy of each model and
  re-reads the prop when the parent changes it.
- Watchers are layout effects guarded by the last value seen (`useWatch` in `App.tsx`,
  the `seen*` refs in `SolDeMayo.tsx`), declared in a fixed order.
- `useImperativeHandle` exposes `seek`, `renderAt` and the live `<svg>`
  (`SolDeMayoHandle`) for the still exports.
- Off-screen export rendering (`src/ui/capture.ts`) uses a separate React root driven
  with `flushSync`, so each frame is in the DOM before it's serialised.
- Per-frame state (`elapsed`) re-renders `App` at 60 fps; tiles, the customiser and
  the timeline cards are memoised so only the player and the playhead actually redraw.

## Useful URLs

- `#board`: the 14 states side by side, frozen.
- `#arrival`: replays the arrival.
- `#state=orbit&stop`: opens one state, paused.
