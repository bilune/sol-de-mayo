@AGENTS.md

# Sol de Mayo (Next.js): notes for Claude

Next.js 16 + React 19 + TS strict + Tailwind 4, pnpm. Style: 2 spaces, single quotes,
no semicolons. Everything is in English (code, identifiers, ids, comments, tests); other
languages live only in `src/i18n/locales/`. No ESLint and no Prettier: `tsc` is the only
gate, so run `pnpm build` before concluding.

```bash
pnpm dev     # 5190
pnpm test    # vitest; only ui/capture.test.ts asks for a DOM (happy-dom)
pnpm build   # tsc --noEmit && next build — run before concluding
```

## The most important rule

**The bot's numeric constants are measurements, not settings.** Gaze angles, eye
sizes, radii, timings, colours: nothing was drawn by eye. Don't round them, don't simplify them, don't replace them
with values that look tidier: it breaks the resemblance, which is the only
success criterion here.

The verified traps that must not be "corrected" are listed in
[docs/measurements.md](docs/measurements.md). Read it before touching a number in
`src/bot/`.

One deliberate exception: **`--ink` (`globals.css`) is the interface colour, chosen,
not measured**, a night blue. The bot's black lives in `skins.ts`
(`ink`, `#0a0a0c`). Retouching one doesn't touch the other.

## Engine invariants

Details and the reasoning behind each are in [docs/](docs/):

- **`src/bot/` has no framework and no clock.** `engine.sample(t)` is a pure
  function of time. That's what makes `frozenAt`, the state board and the
  DOM-less tests work. No real-time state, no `Date.now()`, no React import. And
  **`sample()` must not mutate**: purging a stale previous state during playback
  makes the engine non-replayable (there's a dedicated test). Shared UI code goes
  in `src/ui/`.
- **The montage holds or cuts, it never scales time** (`cycles.ts`). Hence
  `MIN_BLOCK` (0.6 s) and `StateDef.minDuration`, which is read off the state's
  `pose()` constants. Fill it in for any new narrative state.
- **All silhouettes share the same angular sampling** (`PROFILE_SAMPLES`), which is
  what makes morphing a linear interpolation of radii. A new shape must go through
  a radial profile, or `profileFromPolygon`.
- **The eyes are holes in a `<mask>`**, not white shapes on top. That's what makes
  them clip against the silhouette on their own.
- **The render frame lives in `src/bot/coords.ts`**: `RADIUS` (100) and `HALF_VIEWBOX`
  (158) define what `sample()` returns. The avatar component is a client of the engine,
  not its definition.
- **Anything sitting "on" the body must follow its real radius**: `radiusAtAngle`
  (defined in `shape.ts`, applied by `engine.ts`) for the eyes and the notification
  pastille. A new element anchored to the outline needs the same treatment.
- **That pro-rata places the eye's centre, not the eye.** Since the margin in front of the
  edge is multiplied by the same factor, a narrow shape pushed the eye out through the mask.
  `src/bot/eyefit.ts` adds a **common offset to both eyes** — a translation, so an isometry —
  only on a customiser shape. **It is a table built at import, not a solver in the render
  loop**, and that distinction *is* the fix: seven per-frame versions all trembled, because
  everything they read (gaze drift, pointer, expression mid-morph, which edge is nearest)
  moves every frame. The engine reads the table on the **boundaries** of each morph and
  interpolates with that morph's own curve — never on the interpolated value, which has no
  identity and exists in no table. `docs/architecture.md` lists the six variants that were
  measured and rejected; don't re-try them. `skins.test.ts` locks the lot, and it sweeps
  **time as well as combinations** — one instant per combination is what let
  `capsule` + `scared` through.
- **States declare `ArcSpec`; only the engine rasterises.** Don't call `arcRender`
  from `states.ts`.
- **A state change landing inside a fade blends from the FROZEN composite pose**
  (`setState`), not from the full pose of the state being left — the engine has one slot of
  history, and using it naively jumped 26–43 px where a spaced change moves 10–14. It
  freezes **only** when a fade is in progress: doing it always would halt the outgoing
  state's own animation for the whole fade. Spaced playback is byte-identical, and a test
  locks both halves.
- **Transitions are exponential ease-outs and the body never overshoots.** The one
  spring is the notification pop (`NOTIF_POP = 1.14`). There is deliberately no
  spring engine. A new bouncing effect belongs in the state that needs it.
- **Two sources of shapes, not to be mixed.** `profiles.ts` holds measured profiles
  and drives the animated states; `skins.ts` holds the customiser's shapes,
  built analytically. A user's shape only replaces the body on `baseBody` states
  (`idle`, `wink`, `wide`, `notify`, `swirl`); elsewhere the silhouette IS the
  animation.
- **Among catalogue states only `idle` carries `baseFace: true`** (`swirl` does too,
  but it isn't in the catalogue). The other face states have a measured expression.
  That's the point.
- **A tilt is only visible on an elongated eye.** `expressions.test.ts` enforces it:
  width/height outside `[0.6, 1.7]` for a tilt of 20°+, outside `[0.8, 1.25]` below.
  Already went wrong once.
- **Labels don't live in `src/bot/`.** The catalogues carry ids and the display
  resolves `t('states.orbit')`. Their ids are **literal unions** so the compiler
  checks that every entry has a label in every language. Adding a shape
  without its label doesn't compile.
- **One state isn't measured: `swirl`**, the settings view's entry transition. It's
  deliberately outside `SEQUENCE` (a test locks that) and carries both `baseBody`
  and `baseFace`.
- **`Look` aims in ABSOLUTE terms on both axes, and the engine does the mixing**:
  only it knows the pose at instant t. `mix` and `wander` are distinct, and drift is
  added *after* the mix. **`setLook` refuses a non-finite target**: the engine keeps
  the last one, so a single `NaN` would settle in forever.

## React invariants

- **`SolDeMayo.tsx` owns the animation loop** (rAF) and reads everything it needs from
  refs, so props changing every frame never restart it. Its "watchers" are layout
  effects guarded by the last value seen, declared in a fixed order; keep that order.
- **Models are `x` + `onXChange`.** The component writes its local copy immediately and
  notifies the parent; the parent's echo re-runs the watcher, which is a no-op by design
  (see the comments on `apply`).
- **`App` re-renders every frame** (the `elapsed` model). Anything heavy under it must
  be memoised and receive stable callbacks (state setters, `useCallback`, or the
  per-id handler maps), or the frozen thumbnails redraw at 60 fps.
- **Off-screen export renders use their own React root + `flushSync`** (`src/ui/capture.ts`).
  Don't replace that with a screenshot of the live avatar: the exported render must be
  the component's own, from t = 0.
- **`mediabunny` must stay a DYNAMIC import** (`src/ui/video.ts`). Imported statically it
  adds about 43 kB gzip to the initial bundle; behind `await import(...)` it only arrives
  when someone exports a video.
- **Client-only app.** Don't move browser reads (`location`, `localStorage`,
  `matchMedia`, `navigator`) into server components; `src/app/ClientApp.tsx` loads `App`
  with `ssr: false`.

## Interface invariants

- **Don't declare `role="menu"` without the keyboard contract.** Those roles *promise*
  arrow-key navigation and focus moved into the menu on open, and they stop exposing the
  children as ordinary buttons. The popups are plain button lists, with
  `aria-haspopup="true"` and `aria-expanded`. `Settings.tsx` shows the other route: a real
  `radiogroup` with a moving `tabindex`. Pick one, never the label alone.
- **64rem is the only breakpoint, and it separates two different layouts, not two sizes.**
  Above it the scene is the three-column grid and the page never scrolls (`#app { overflow:
  clip }`): things can float in the margins and be anchored to the window. Below it
  everything stacks and the page scrolls for real, which breaks exactly those three
  assumptions — so the rail becomes a top bar, the montage bar gets an opaque background
  (without one, content scrolls visibly through it), and the wordmark returns to the flow.
  Anything new that is `fixed`, or anchored to the bottom of `#app`, needs its own answer
  below 64rem. `--timeline` also changes there (236 → 200 px); the fine positioning that
  reads it lives inside the `>= 64rem` query and never sees the other value.
- **`prefers-reduced-motion` is followed at runtime, not read once**, and it draws a line:
  it cancels box transitions and the settings view's `swirl` entry, which are decoration;
  it does **not** cancel the breathing, gaze drift and blinking, which are what the bot IS.
- **A UI element that must appear once uses a `transition`, not an `animation`.** An
  animation replays on every mount: every view change, every reload. A transition
  doesn't run on an element's first computed style, so it stays quiet there. That's
  why `.panel` and `.export-bar` are built that way, and why the latter is
  mounted-but-hidden during the arrival rather than absent.

## Where to read more

| | |
|---|---|
| [docs/architecture.md](docs/architecture.md) | The engine, morphing, mask eyes, `Look` |
| [docs/measurements.md](docs/measurements.md) | What was measured, the traps, regenerating `profiles.ts` |
| [docs/intro.md](docs/intro.md) | The arrival sequence, and why it plays only `idle` |
| [docs/interface.md](docs/interface.md) | Three-column scene, CSS traps, icons |
| [docs/export.md](docs/export.md) | The export bar, SVG/PNG/GIF/MP4, why the still export has no GIF |
| [docs/i18n.md](docs/i18n.md) | The hand-rolled translation layer |

## Tests

`pnpm test` runs in `node` by default. **One file asks for a DOM** and says so on its first
line (`// @vitest-environment happy-dom`): `ui/capture.test.ts`, which mounts
`SolDeMayo.tsx` to check the off-screen player. Keep the DOM per-file: a global DOM
environment would slow the whole suite for one test. It is the test that catches what
nothing else can — the export defects are invisible short of stepping through an MP4
frame by frame.

## Generated files

`src/bot/profiles.ts` holds measured radial profiles (see
[docs/measurements.md](docs/measurements.md)). Don't edit it or "tidy" it by hand.

`docs/demo.gif` and `docs/states.png` are rendered by walking `engine.sample(t)` and
writing the SVG layers in the avatar component's order, then `rsvg-convert` + `ffmpeg`.
They are **not** browser captures: a hidden browser pane suspends
`requestAnimationFrame`, so an animation can't be captured there at all. To redo them,
drive the engine, don't reach for a screenshot.

Same pane, related trap: when it is hidden it also **clamps `setTimeout` to ~1 s**
and freezes CSS transitions. So no sub-second timing can be measured there. Assert on
the *state* instead (a `MutationObserver` still fires; an `animation-delay` of `-1.5s`
samples an animation mid-way while it is frozen).

## Useful URLs

- `#board`: the 14 states side by side, frozen. The only safe path: it doesn't
  depend on any montage.
- `#arrival`: replays the arrival. It otherwise only plays on a genuine visit.
- `#state=<id>&stop`: opens one state, playback paused. It looks the state up in the
  user's montages, which are all editable: if they've removed it everywhere, the
  link doesn't apply.
