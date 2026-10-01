import type { Point } from './shape'

/**
 * The flag's SVG paths, read into polygons.
 *
 * The Sol de Mayo face is drawn from the flag's own strokes, but it has to be
 * bent: wrapped point by point onto the sphere, and deformed by the expression
 * (a lid opening, a brow rising). Both need points, not path strings, so the
 * flag's paths are sampled once here. Supports what the flag uses: M L H V C S A
 * and Z, absolute and relative, with implicit repeats.
 */

const TOKEN = /[MmLlHhVvCcSsAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g

/** Samples per curve segment. */
const STEPS = 12

function cubic(p0: Point, p1: Point, p2: Point, p3: Point, out: Point[]) {
  for (let i = 1; i <= STEPS; i++) {
    const t = i / STEPS
    const u = 1 - t
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
    })
  }
}

/** SVG elliptical arc, endpoint form, sampled through its centre form (SVG spec F.6.5). */
function arc(
  p0: Point,
  rx: number,
  ry: number,
  rotDeg: number,
  wide: boolean,
  sweep: boolean,
  p1: Point,
  out: Point[]
) {
  if (rx === 0 || ry === 0) {
    out.push(p1)
    return
  }
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  const phi = (rotDeg * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (p0.x - p1.x) / 2
  const dy = (p0.y - p1.y) / 2
  const x1 = cos * dx + sin * dy
  const y1 = -sin * dx + cos * dy
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
  if (lambda > 1) {
    rx *= Math.sqrt(lambda)
    ry *= Math.sqrt(lambda)
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1
  let k = Math.sqrt(Math.max(0, num / den))
  if (wide === sweep) k = -k
  const cx1 = (k * rx * y1) / ry
  const cy1 = (-k * ry * x1) / rx
  const cx = cos * cx1 - sin * cy1 + (p0.x + p1.x) / 2
  const cy = sin * cx1 + cos * cy1 + (p0.y + p1.y) / 2
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    return a
  }
  const t1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
  let dt = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
  if (!sweep && dt > 0) dt -= 2 * Math.PI
  if (sweep && dt < 0) dt += 2 * Math.PI
  const n = Math.max(STEPS, Math.ceil((Math.abs(dt) / Math.PI) * 24))
  for (let i = 1; i <= n; i++) {
    const t = t1 + (dt * i) / n
    const ex = rx * Math.cos(t)
    const ey = ry * Math.sin(t)
    out.push({ x: cos * ex - sin * ey + cx, y: sin * ex + cos * ey + cy })
  }
}

/** Every subpath of `d` as a polygon (closed or not, the fill closes it). */
export function samplePath(d: string): Point[][] {
  const tokens = d.match(TOKEN) ?? []
  const polys: Point[][] = []
  let poly: Point[] = []
  let cur: Point = { x: 0, y: 0 }
  let start: Point = cur
  let lastCtrl: Point | null = null
  let cmd = ''
  let i = 0
  const num = () => Number(tokens[i++])
  const isCmd = (s: string | undefined) => s !== undefined && /[A-Za-z]/.test(s)

  while (i < tokens.length) {
    if (isCmd(tokens[i])) cmd = tokens[i++]!
    const rel = cmd === cmd.toLowerCase()
    const at = (x: number, y: number): Point => (rel ? { x: cur.x + x, y: cur.y + y } : { x, y })
    switch (cmd.toUpperCase()) {
      case 'M': {
        if (poly.length) polys.push(poly)
        cur = at(num(), num())
        start = cur
        poly = [cur]
        lastCtrl = null
        // further pairs after a moveto are linetos
        cmd = rel ? 'l' : 'L'
        break
      }
      case 'L': {
        cur = at(num(), num())
        poly.push(cur)
        lastCtrl = null
        break
      }
      case 'H': {
        const x = num()
        cur = { x: rel ? cur.x + x : x, y: cur.y }
        poly.push(cur)
        lastCtrl = null
        break
      }
      case 'V': {
        const y = num()
        cur = { x: cur.x, y: rel ? cur.y + y : y }
        poly.push(cur)
        lastCtrl = null
        break
      }
      case 'C': {
        const c1 = at(num(), num())
        const c2 = at(num(), num())
        const p = at(num(), num())
        cubic(cur, c1, c2, p, poly)
        lastCtrl = c2
        cur = p
        break
      }
      case 'S': {
        const c1 = lastCtrl ? { x: 2 * cur.x - lastCtrl.x, y: 2 * cur.y - lastCtrl.y } : cur
        const c2 = at(num(), num())
        const p = at(num(), num())
        cubic(cur, c1, c2, p, poly)
        lastCtrl = c2
        cur = p
        break
      }
      case 'A': {
        const rx = num()
        const ry = num()
        const rot = num()
        const wide = num() !== 0
        const sweep = num() !== 0
        const p = at(num(), num())
        arc(cur, rx, ry, rot, wide, sweep, p, poly)
        lastCtrl = null
        cur = p
        break
      }
      case 'Z': {
        cur = start
        lastCtrl = null
        break
      }
      default:
        i++
    }
  }
  if (poly.length) polys.push(poly)
  return polys
}

/** `n` points evenly spaced along a polyline. */
export function resample(chain: Point[], n: number): Point[] {
  const lengths = [0]
  for (let i = 1; i < chain.length; i++) {
    lengths.push(
      lengths[i - 1]! + Math.hypot(chain[i]!.x - chain[i - 1]!.x, chain[i]!.y - chain[i - 1]!.y)
    )
  }
  const total = lengths[lengths.length - 1]!
  const out: Point[] = []
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
 * A brush stroke read back as a centreline carrying its two edges: the outline
 * is split at its leftmost and rightmost points into two edges, paired point for
 * point, and each edge point is kept as an offset from the centre between them.
 * Move the centreline and the edges follow at their exact distance, so an
 * undeformed stroke redraws the flag's outline point for point, and a deformed
 * one bends like a brush stroke instead of squashing.
 */
export interface Stroke {
  center: Point[]
  /** offsets of the two edges from the centre, sample by sample */
  a: Point[]
  b: Point[]
}

export function strokeOf(poly: Point[], n: number): Stroke {
  let lo = 0
  let hi = 0
  for (let i = 1; i < poly.length; i++) {
    if (poly[i]!.x < poly[lo]!.x) lo = i
    if (poly[i]!.x > poly[hi]!.x) hi = i
  }
  const walk = (from: number, to: number, dir: 1 | -1): Point[] => {
    const out: Point[] = []
    const len = poly.length
    for (let i = from; ; i = (i + dir + len) % len) {
      out.push(poly[i]!)
      if (i === to) break
    }
    return out
  }
  const ea = resample(walk(lo, hi, 1), n)
  const eb = resample(walk(lo, hi, -1), n)
  const center = ea.map((p, i) => ({ x: (p.x + eb[i]!.x) / 2, y: (p.y + eb[i]!.y) / 2 }))
  return {
    center,
    a: ea.map((p, i) => ({ x: p.x - center[i]!.x, y: p.y - center[i]!.y })),
    b: eb.map((p, i) => ({ x: p.x - center[i]!.x, y: p.y - center[i]!.y }))
  }
}

/**
 * The stroke's outline around a (possibly moved) centreline. `thin` scales the
 * edges' distance, 1 = the flag's weight.
 */
export function strokePolygon(
  stroke: Stroke,
  center: Point[],
  thin: (i: number) => number = () => 1
): Point[] {
  const a = center.map((c, i) => {
    const k = thin(i)
    return { x: c.x + stroke.a[i]!.x * k, y: c.y + stroke.a[i]!.y * k }
  })
  const b = center.map((c, i) => {
    const k = thin(i)
    return { x: c.x + stroke.b[i]!.x * k, y: c.y + stroke.b[i]!.y * k }
  })
  return [...a, ...b.reverse()]
}
