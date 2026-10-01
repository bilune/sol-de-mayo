'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { HALF_VIEWBOX } from '@/bot/coords'
import {
  FLAG_FACE,
  FLAG_FACE_LINE,
  FLAG_STRAIGHT,
  FLAG_STRAIGHT_INNER,
  FLAG_TURNS,
  FLAG_WAVY,
  FLAG_WAVY_INNER,
  FLAG_WAVY_TURN,
  SUN_COLORS,
  type RaysRender
} from '@/bot/sun'

/**
 * The Sol de Mayo corona as real 3D: every ray is a round solid (a cone for the
 * straight ones, a winding tube for the wavy ones) whose thickness at each point
 * is the width of the flag's own outline there. Seen head-on, each ray has
 * exactly the flag's silhouette; turned, it shows its volume. The rays lie in the
 * head's plane, so they turn with the face.
 *
 * It is a WebGL canvas laid exactly under the bot's SVG, sharing its viewBox
 * through an orthographic camera: one SVG unit is one scene unit, so the corona
 * lines up with the ball to the pixel. The canvas lies OVER the SVG: an invisible
 * sphere the size of the ball fills the depth buffer, so the rays' roots and
 * whatever passes behind the ball are hidden, and a ray tilted toward the viewer
 * comes out in front of the face, as it would on a real sphere.
 *
 * The flag's brown inner strokes (each ray's ridge line) are laid on the rays'
 * surface, see `stripeGeometry`.
 */

/** Samples along a ray, and around it. */
const ALONG = 64
const AROUND = 20
/** Brown outline around each ray, in flag units (the flag's stroke is 1.5 wide). */
const OUTLINE = 0.75
/** Tube radius of the ring around the head, flag units: exactly the face's outline weight. */
const RING_TUBE = FLAG_FACE_LINE / 2
/**
 * The ring lies right on the ball. A line this thin would sink into the sphere
 * that hides the ring's far half, so that sphere is drawn this much smaller
 * (flag units): enough to keep the near half whole, far too little to let the
 * far half show through the head.
 */
const RING_SINK = 1.5
/** How far the inner stroke floats above the ray's surface, so it never flickers into it. */
const STRIPE_LIFT = 0.3
/** Samples across the inner stroke. */
const ACROSS = 5

type P2 = { x: number; y: number }

/** The flag's outline as a polyline, in the flag's own (SVG, y-down) space. */
function outlineOf(d: string): P2[] {
  const data = new SVGLoader().parse(
    `<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`
  )
  const shape = data.paths.flatMap((p) => p.toShapes())[0]!
  return shape.getPoints(24).map((v) => ({ x: v.x, y: v.y }))
}

/** `n` points evenly spaced along a polyline. */
function resample(chain: P2[], n: number): P2[] {
  const lengths = [0]
  for (let i = 1; i < chain.length; i++) {
    lengths.push(
      lengths[i - 1]! + Math.hypot(chain[i]!.x - chain[i - 1]!.x, chain[i]!.y - chain[i - 1]!.y)
    )
  }
  const total = lengths[lengths.length - 1]!
  const out: P2[] = []
  let k = 1
  for (let i = 0; i < n; i++) {
    const at = (i / (n - 1)) * total
    while (k < chain.length - 1 && lengths[k]! < at) k++
    const a = chain[k - 1]!
    const b = chain[k]!
    const span = lengths[k]! - lengths[k - 1]! || 1
    const t = Math.min(1, Math.max(0, (at - lengths[k - 1]!) / span))
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  }
  return out
}

/**
 * A round solid with the outline's silhouette. The outline runs down one edge to
 * the tip (its lowest point: the rays point down) and back up the other; pairing
 * the two edges point for point gives a centreline and a radius at every step.
 */
interface Profile {
  center: P2[]
  radius: number[]
}

function profileOf(d: string): Profile {
  const pts = outlineOf(d)
  let tip = 0
  for (let i = 1; i < pts.length; i++) if (pts[i]!.y > pts[tip]!.y) tip = i
  const left = resample(pts.slice(0, tip + 1), ALONG)
  const right = resample(pts.slice(tip).reverse(), ALONG)
  return {
    center: left.map((l, i) => ({ x: (l.x + right[i]!.x) / 2, y: (l.y + right[i]!.y) / 2 })),
    radius: left.map((l, i) => Math.hypot(l.x - right[i]!.x, l.y - right[i]!.y) / 2)
  }
}

function rayGeometry(profile: Profile, grow = 0): THREE.BufferGeometry {
  const center = profile.center
  const radius = profile.radius.map((r) => r + grow)

  const pos: number[] = []
  for (let i = 0; i < ALONG; i++) {
    const a = center[Math.max(0, i - 1)]!
    const b = center[Math.min(ALONG - 1, i + 1)]!
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    // in-plane normal to the centreline; the other axis of the ring is depth
    const nx = -(b.y - a.y) / len
    const ny = (b.x - a.x) / len
    for (let j = 0; j < AROUND; j++) {
      const phi = (j / AROUND) * Math.PI * 2
      const c = Math.cos(phi) * radius[i]!
      pos.push(center[i]!.x + nx * c, center[i]!.y + ny * c, Math.sin(phi) * radius[i]!)
    }
  }
  // the two ends, closed on a point each
  const rootIdx = pos.length / 3
  pos.push(center[0]!.x, center[0]!.y, 0)
  const last = center[ALONG - 1]!
  const prev = center[ALONG - 2]!
  const tl = Math.hypot(last.x - prev.x, last.y - prev.y) || 1
  const tipIdx = rootIdx + 1
  const r = radius[ALONG - 1]!
  pos.push(last.x + ((last.x - prev.x) / tl) * r, last.y + ((last.y - prev.y) / tl) * r, 0)

  const index: number[] = []
  for (let i = 0; i < ALONG - 1; i++) {
    for (let j = 0; j < AROUND; j++) {
      const a = i * AROUND + j
      const b = i * AROUND + ((j + 1) % AROUND)
      const c = a + AROUND
      const e = b + AROUND
      index.push(a, b, c, b, e, c)
    }
  }
  for (let j = 0; j < AROUND; j++) {
    index.push(rootIdx, j, (j + 1) % AROUND)
    const base = (ALONG - 1) * AROUND
    index.push(tipIdx, base + ((j + 1) % AROUND), base + j)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(index)
  geo.computeVertexNormals()
  return geo
}

/**
 * The flag's brown inner stroke, laid ON the ray: the flag's shape, lifted point
 * by point onto the tube's surface (both faces, whichever turns to the viewer). Head-on it is the flag's line; turned, it
 * curves with the ray like a ridge.
 */
function stripeGeometry(d: string, ray: Profile, side: 1 | -1): THREE.BufferGeometry {
  // the stroke is itself a thin tapered outline pointing down: same pairing as
  // the rays, then a fine grid across it, so it hugs the curve instead of cutting
  // through the tube between far-apart vertices
  const own = profileOf(d)
  const pos: number[] = []
  for (let i = 0; i < ALONG; i++) {
    const a = own.center[Math.max(0, i - 1)]!
    const b = own.center[Math.min(ALONG - 1, i + 1)]!
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const nx = -(b.y - a.y) / len
    const ny = (b.x - a.x) / len
    const width = own.radius[i]!
    for (let k = 0; k < ACROSS; k++) {
      const u = (k / (ACROSS - 1)) * 2 - 1
      const x = own.center[i]!.x + nx * width * u
      const y = own.center[i]!.y + ny * width * u
      // lift onto the ray: nearest centreline sample gives the local radius
      let bestD = Infinity
      let best = 0
      for (let c = 0; c < ray.center.length; c++) {
        const p = ray.center[c]!
        const dd = (p.x - x) ** 2 + (p.y - y) ** 2
        if (dd < bestD) {
          bestD = dd
          best = c
        }
      }
      const r = ray.radius[best]!
      pos.push(x, y, (Math.sqrt(Math.max(0, r * r - bestD)) + STRIPE_LIFT) * side)
    }
  }
  const index: number[] = []
  for (let i = 0; i < ALONG - 1; i++) {
    for (let k = 0; k < ACROSS - 1; k++) {
      const a = i * ACROSS + k
      const b = a + 1
      const c = a + ACROSS
      const e = c + 1
      index.push(a, c, b, b, c, e)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(index)
  return geo
}

/**
 * Everything a ray is made of is drawn only OUTSIDE the ring: the stencil holds
 * the disc the ring encloses (see `buildCorona`), and these materials skip it.
 * So a ray, its outline and its inner stroke all start exactly on the ring's
 * line, instead of poking past it over the face.
 */
const OUTSIDE_RING = {
  stencilWrite: true,
  stencilRef: 1,
  stencilFunc: THREE.NotEqualStencilFunc,
  stencilFail: THREE.KeepStencilOp,
  stencilZFail: THREE.KeepStencilOp,
  stencilZPass: THREE.KeepStencilOp
} as const

function buildCorona(): {
  disc: THREE.Group
  spokes: THREE.Group
  ring: THREE.Mesh
  dispose: () => void
} {
  const body = new THREE.MeshStandardMaterial({
    color: SUN_COLORS.body,
    // barely metallic: with no environment to reflect, metal just reads as dark
    metalness: 0.1,
    roughness: 0.5,
    ...OUTSIDE_RING
  })
  // outline: a slightly fatter copy seen from inside, the flag's brown stroke
  const line = new THREE.MeshBasicMaterial({
    color: SUN_COLORS.line,
    side: THREE.BackSide,
    ...OUTSIDE_RING
  })

  // the flag's inner stroke runs the ray's whole length: the ring's mask ends it
  const stripe = new THREE.MeshBasicMaterial({
    color: SUN_COLORS.line,
    side: THREE.DoubleSide,
    ...OUTSIDE_RING
    // no polygon offset: `STRIPE_LIFT` already floats it off the ray, and an
    // offset would also pull it through the ball where the ray enters it
  })

  // The disc inside the ring, in the rays' plane, drawn first into the stencil
  // only (no colour, no depth): seen at any tilt, it is exactly the ellipse the
  // ring draws on screen.
  const maskGeo = new THREE.CircleGeometry(FLAG_FACE, 160)
  const maskMat = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp
  })
  const mask = new THREE.Mesh(maskGeo, maskMat)
  mask.renderOrder = -2

  const straightProfile = profileOf(FLAG_STRAIGHT)
  const wavyProfile = profileOf(FLAG_WAVY)
  const geos = [
    rayGeometry(straightProfile),
    rayGeometry(straightProfile, OUTLINE),
    rayGeometry(wavyProfile),
    rayGeometry(wavyProfile, OUTLINE),
    stripeGeometry(FLAG_STRAIGHT_INNER, straightProfile, 1),
    stripeGeometry(FLAG_STRAIGHT_INNER, straightProfile, -1),
    stripeGeometry(FLAG_WAVY_INNER, wavyProfile, 1),
    stripeGeometry(FLAG_WAVY_INNER, wavyProfile, -1)
  ] as const
  const [straight, straightLine, wavy, wavyLine, sFront, sBack, wFront, wBack] = geos

  const disc = new THREE.Group()
  // the rays alone, apart from the mask
  const spokes = new THREE.Group()
  disc.add(spokes)
  for (const turn of FLAG_TURNS) {
    // the inner space is the flag's SVG space: a z rotation there is SVG's rotate()
    const pair = new THREE.Group()
    pair.rotation.z = THREE.MathUtils.degToRad(turn)
    pair.add(
      new THREE.Mesh(straight, body),
      new THREE.Mesh(straightLine, line),
      new THREE.Mesh(sFront, stripe),
      new THREE.Mesh(sBack, stripe)
    )
    const w = new THREE.Group()
    w.rotation.z = THREE.MathUtils.degToRad(FLAG_WAVY_TURN)
    w.add(
      new THREE.Mesh(wavy, body),
      new THREE.Mesh(wavyLine, line),
      new THREE.Mesh(wFront, stripe),
      new THREE.Mesh(wBack, stripe)
    )
    pair.add(w)
    spokes.add(pair)
  }
  disc.add(mask)

  // The ring the rays grow from: a thin brown torus around the ball, in the
  // rays' plane, right where they leave the sphere. Tilted toward the viewer it
  // passes in front of the face and draws the line between head and rays; tilted
  // away, the ball hides it and the SVG outline takes over.
  const ringGeo = new THREE.TorusGeometry(FLAG_FACE, RING_TUBE, 12, 160)
  const ringMat = new THREE.MeshBasicMaterial({ color: SUN_COLORS.line })
  const ring = new THREE.Mesh(ringGeo, ringMat)

  return {
    disc,
    spokes,
    ring,
    dispose: () => {
      for (const g of geos) g.dispose()
      ringGeo.dispose()
      ringMat.dispose()
      maskGeo.dispose()
      maskMat.dispose()
      body.dispose()
      line.dispose()
      stripe.dispose()
    }
  }
}

export interface Corona3DProps {
  rays: RaysRender | null
  /** ball radius in viewBox units */
  scale: number
  opacity: number
  /**
   * Called once, after the first frame the corona really drew. Until then the
   * caller shows the flat SVG corona: starting WebGL (and compiling its shaders)
   * can take a noticeable moment, and the sun must never appear bald.
   */
  onReady?: () => void
  /**
   * Extra pixel density: the arrival scales the avatar up in CSS (the sun starts
   * filling the screen), and a canvas drawn at its layout size would blur.
   */
  resolution?: number
}

export default function Corona3D({
  rays,
  scale,
  opacity,
  onReady,
  resolution = 1
}: Corona3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ready = useRef(false)
  const three = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.OrthographicCamera
    holder: THREE.Group
    spokes: THREE.Group
    ball: THREE.Mesh
    overlay: THREE.Scene
    ringHolder: THREE.Group
    ringBall: THREE.Mesh
    draw: () => void
  } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let renderer: THREE.WebGLRenderer
    try {
      // a stencil buffer for the ring's mask
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, stencil: true })
    } catch {
      return // no WebGL: the page simply shows no corona
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    // two passes per frame (see `draw`), so the canvas is cleared by hand
    renderer.autoClear = false

    const V = HALF_VIEWBOX
    // SVG y points down, three's up: the camera flips nothing, `holder` does
    const camera = new THREE.OrthographicCamera(-V, V, V, -V, -1000, 1000)
    camera.position.z = 500

    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffffff, 2))
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(-0.6, 0.8, 1)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xfff1d6, 0.8)
    rim.position.set(0.7, -0.4, 0.6)
    scene.add(rim)

    const holder = new THREE.Group()
    holder.matrixAutoUpdate = false
    const corona = buildCorona()
    holder.add(corona.disc)
    scene.add(holder)

    // The ball, invisible: it only writes depth, so rays passing behind it are
    // hidden while rays coming out in front of it are drawn over the SVG face.
    const ballGeo = new THREE.SphereGeometry(1, 48, 32)
    const ballMat = new THREE.MeshBasicMaterial({ colorWrite: false })
    const ball = new THREE.Mesh(ballGeo, ballMat)
    ball.renderOrder = -1
    scene.add(ball)

    // Second pass: the ring, over the rays. Its depth is cleared of the rays
    // first, so only the ball (drawn again, depth only) can hide it: the ring is
    // IN FRONT of the rays it holds, BEHIND the head where it goes round the back.
    const overlay = new THREE.Scene()
    const ringHolder = new THREE.Group()
    ringHolder.matrixAutoUpdate = false
    ringHolder.add(corona.ring)
    overlay.add(ringHolder)
    const ringBall = new THREE.Mesh(ballGeo, ballMat)
    ringBall.renderOrder = -1
    overlay.add(ringBall)

    const draw = () => {
      renderer.clear()
      renderer.render(scene, camera)
      renderer.clearDepth()
      renderer.render(overlay, camera)
    }

    three.current = {
      renderer,
      scene,
      camera,
      holder,
      spokes: corona.spokes,
      ball,
      overlay,
      ringHolder,
      ringBall,
      draw
    }

    const resize = () => {
      // layout size, not the on-screen one: a CSS scale is covered by `resolution`
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (width > 0 && height > 0) renderer.setSize(width, height, false)
      draw()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    return () => {
      ro.disconnect()
      corona.dispose()
      ballGeo.dispose()
      ballMat.dispose()
      renderer.dispose()
      three.current = null
    }
  }, [])

  // a finer drawing buffer while the avatar is scaled up in CSS
  useEffect(() => {
    const t = three.current
    if (!t) return
    // capped: a 3x canvas on a 2x screen is 36 times the pixels, too much for a phone
    t.renderer.setPixelRatio(Math.min(Math.min(window.devicePixelRatio, 2) * resolution, 3))
    const canvas = t.renderer.domElement
    if (canvas.clientWidth > 0) t.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
    t.draw()
  }, [resolution])

  // every frame the bot draws, the corona follows the head
  useLayoutEffect(() => {
    const t = three.current
    if (!t) return
    t.holder.visible = rays !== null && opacity > 0.01
    if (rays) {
      const k = scale / FLAG_FACE
      const { right: r, down: d, f } = rays
      // Screen space (x right, y down, z to the viewer) -> three (y up): flip y.
      // Columns: where the flag's x, y and depth axes go; then scale and place.
      // The depth column is negated too: flipping y alone would mirror the
      // corona, and a mirrored object turns three's face culling inside out. The
      // rays are round, so which way their depth points changes nothing else.
      // prettier-ignore
      t.holder.matrix.set(
        r[0] * k, d[0] * k, -f[0] * k, rays.x,
        -r[1] * k, -d[1] * k, f[1] * k, -rays.y,
        r[2] * k, d[2] * k, -f[2] * k, 0,
        0, 0, 0, 1
      )
      t.holder.matrixWorldNeedsUpdate = true
      t.ringHolder.matrix.copy(t.holder.matrix)
      t.ringHolder.matrixWorldNeedsUpdate = true
      for (const b of [t.ball, t.ringBall]) b.position.set(rays.x, -rays.y, 0)
      t.ball.scale.setScalar(scale)
      t.ringBall.scale.setScalar(scale * (1 - RING_SINK / FLAG_FACE))
    }
    t.ringHolder.visible = t.holder.visible
    t.renderer.domElement.style.opacity = String(opacity)
    t.draw()
    if (!ready.current && rays) {
      ready.current = true
      onReady?.()
    }
  })

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  )
}
