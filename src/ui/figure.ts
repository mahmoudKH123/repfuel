/* The workout figure on Today (ui/FuelFigure.tsx): an athlete posed in 3D, seen turned 45° (a three-quarter view,
   facing left), holding the one moment that says the day best. This file only does geometry: it returns the SVG
   pieces, each with how near the viewer it is, so nearer pieces draw over farther ones. */

export type FigureKind = 'push' | 'pull' | 'legs' | 'cb' | 'arms' | 'rest'
export type PieceKind = 'body' | 'steel' | 'post' | 'plate' | 'pad'
export interface Piece { kind: PieceKind; d: string; z: number; deco?: string; decoA?: number; far?: boolean; alpha?: number }
export interface Figure { pieces: Piece[]; shadow: { cx: number; rx: number } }

type V = number[]
type Pose = Record<'at' | 'hc' | 'nk' | 's' | 'h' | 'ep' | 'p' | 'f' | 'kp', V>
type Joints = Record<'hc' | 'nk' | 'sL' | 'sR' | 'eL' | 'eR' | 'hL' | 'hR' | 'pL' | 'pR' | 'kL' | 'kR' | 'fL' | 'fR', V>

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/* ===== 3D ===== */
const ANG = (45 * Math.PI) / 180, CO = Math.cos(ANG), SI = Math.sin(ANG), CX = 100
const a3 = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const s3 = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const m3 = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k]
const d3 = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const n3 = (a: V) => Math.hypot(a[0], a[1], a[2])
const u3 = (a: V) => m3(a, 1 / (n3(a) || 1))
const x3 = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const mid3 = (a: V, b: V) => m3(a3(a, b), 0.5)
const mir = (p: V): V => [-p[0], p[1], p[2]]
const proj = (p: V): V => [CX + p[0] * CO - p[2] * SI, p[1]] // where a point lands on screen
const dproj = (v: V): V => [v[0] * CO - v[2] * SI, v[1]] // where a direction points on screen
const depth = (p: V) => p[0] * SI + p[2] * CO // how close to the viewer
/** Two-bone reach (shoulder-elbow-hand, hip-knee-foot): fixed bone lengths, the joint bends toward `pole`. */
function ik(A: V, C: V, l1: number, l2: number, pole: V): V {
  const d = s3(C, A), D = Math.max(0.001, n3(d)), u = m3(d, 1 / D)
  const Dc = clamp(D, Math.abs(l1 - l2) + 1, l1 + l2 - 0.3)
  const x = (l1 * l1 - l2 * l2 + Dc * Dc) / (2 * Dc), h = Math.sqrt(Math.max(0, l1 * l1 - x * x))
  let w = s3(pole, m3(u, d3(pole, u)))
  if (n3(w) < 1e-3) w = [0, 0, 1]
  return a3(a3(A, m3(u, x)), m3(u3(w), h))
}

/* ===== poses (near side; the far side mirrors it). x = to the side, y = down, z = forward.
   at = where the body stands, s shoulder, h hand, p hip, f ankle; ep / kp = which way the elbow / knee points. ===== */
const STAND: Pose = { at: [0, 0, 0], hc: [0, 54, 3], nk: [0, 79, 0], s: [27, 96, 0], h: [29, 191, 4], ep: [0.3, 0, -1], p: [12, 190, 0], f: [13, 336, 0], kp: [0, 0, 1] }
const P = (o: Partial<Pose>): Pose => ({ ...STAND, ...o })
const BAR_Y = 36, BENCH_X = -16, CB_BAR_X = 34
const RACK_Y = 151, RACK_Z = -56 // the rack hooks, at lockout height
const LIE: Partial<Pose> = { hc: [0, 241, -101], nk: [0, 244, -76], s: [27, 245, -58], p: [12, 247, 36], f: [20, 336, 92], kp: [0.2, -1, 0.4] }
/* The one moment that says each day best. The figure holds it: it only draws itself in, it never moves. */
const PRESS_TOP = P({ ...LIE, at: [BENCH_X, 0, 0], h: [31, 160, -54], ep: [1, 0.3, 0] }) // bench press, just short of lockout
const PULL_TOP = P({ hc: [0, 8, -6], nk: [0, 32, -7], s: [26, 50, -8], h: [44, BAR_Y, 2], ep: [0.8, 0.6, -0.7], p: [12, 144, -12], f: [12, 262, -46] }) // chin over the bar, body behind it
const SQUAT_LOW = P({ hc: [0, 142, 32], nk: [0, 164, 24], s: [27, 178, 14], h: [58, 174, 4], ep: [0.5, 1, -0.6], p: [12, 252, -44], f: [16, 336, 0], kp: [0.35, 0, 1] }) // bottom of a back squat
const CURL_MID = P({ h: [29, 129, 41], ep: [0, 1, -0.6] }) // curl at its hardest point: forearm level, elbow pinned
type Kit = 'bench' | 'pullbar' | 'squatbar' | 'dumbbells'
const DAYS: Record<FigureKind, { kit: Kit[]; barX?: number; pose: Pose }> = {
  push: { kit: ['bench'], pose: PRESS_TOP },
  pull: { kit: ['pullbar'], barX: 0, pose: PULL_TOP },
  legs: { kit: ['squatbar'], pose: SQUAT_LOW },
  cb: { kit: ['bench', 'pullbar'], barX: CB_BAR_X, pose: PRESS_TOP },
  arms: { kit: ['dumbbells'], pose: CURL_MID },
  rest: { kit: [], pose: P({ h: [32, 189, 9], ep: [0.4, 0, -1] }) },
}
/** Full skeleton for a pose: mirror the far side, keep the torso and neck their real length, then let the
 *  elbows and knees find their place. */
function expand(q: Pose): Joints {
  const o = q.at, A = (v: V) => a3(v, o), M = (v: V) => a3(mir(v), o)
  let sL = A(q.s), sR = M(q.s)
  const hL = A(q.h), hR = M(q.h), pL = A(q.p), pR = M(q.p), fL = A(q.f), fR = M(q.f)
  const B = mid3(pL, pR), T = mid3(sL, sR), Tn = a3(B, m3(u3(s3(T, B)), 94)), dT = s3(Tn, T)
  sL = a3(sL, dT); sR = a3(sR, dT)
  const nk = a3(Tn, m3(u3(s3(A(q.nk), T)), 17)), hc = a3(nk, m3(u3(s3(q.hc, q.nk)), 25))
  return { hc, nk, sL, sR, hL, hR, pL, pR, fL, fR,
    eL: ik(sL, hL, 49, 47, q.ep), eR: ik(sR, hR, 49, 47, mir(q.ep)),
    kL: ik(pL, fL, 74, 72, q.kp), kR: ik(pR, fR, 74, 72, mir(q.kp)) }
}

/* ===== 2D drawing helpers ===== */
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]]
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]]
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k]
const len = (a: V) => Math.hypot(a[0], a[1])
const unit = (a: V) => mul(a, 1 / (len(a) || 1))
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1]
const f1 = (p: V) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`
/** Every closed shape winds the same way, so overlapping pieces of one part merge into one silhouette. */
function wind(pts: V[]) {
  let A = 0
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; A += p[0] * q[1] - q[0] * p[1] }
  return A < 0 ? pts.slice().reverse() : pts
}
/** A smooth closed curve through the points (Catmull-Rom as cubic Béziers). */
function smooth(pts0: V[]) {
  const pts = wind(pts0), n = pts.length
  let d = `M${f1(pts[0])}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n]
    d += ` C${f1(add(p1, mul(sub(p2, p0), 1 / 6)))} ${f1(sub(p2, mul(sub(p3, p1), 1 / 6)))} ${f1(p2)}`
  }
  return d + 'Z'
}
const poly = (pts: V[]) => 'M' + wind(pts).map(f1).join(' L') + 'Z'
const line = (pts: V[]) => 'M' + pts.map(f1).join(' L')
function ellipsePts(c: V, rx: number, ry: number, angDeg = 0, n = 12) {
  const a = (angDeg * Math.PI) / 180, pts: V[] = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2
    pts.push([c[0] + Math.cos(t) * rx * Math.cos(a) - Math.sin(t) * ry * Math.sin(a), c[1] + Math.cos(t) * rx * Math.sin(a) + Math.sin(t) * ry * Math.cos(a)])
  }
  return pts
}
const ellipse = (c: V, rx: number, ry: number, ang = 0) => smooth(ellipsePts(c, rx, ry, ang))
const TS = [0, 0.15, 0.35, 0.55, 0.75, 0.9, 1]
const THICK = 1.12 // how solid the limbs are
/* Half-widths along each bone, front side (o) and back side (i). */
const W = {
  ua: { o: [7.0, 7.6, 8.9, 9.2, 7.7, 6.2, 5.8], i: [8.6, 9.8, 9.5, 8.6, 7.4, 6.4, 6.0] }, // biceps in front, triceps behind
  fa: { o: [6.3, 7.8, 7.3, 6.0, 4.9, 4.4, 4.2], i: [6.0, 6.9, 6.5, 5.4, 4.6, 4.2, 4.0] },
  th: { o: [12.2, 12.9, 12.4, 11.0, 9.1, 7.5, 7.1], i: [10.4, 10.8, 9.8, 8.6, 7.4, 6.6, 6.4] }, // quad in front
  ca: { o: [6.4, 7.0, 7.0, 6.2, 5.2, 4.4, 4.2], i: [6.8, 8.8, 9.4, 7.6, 5.6, 4.4, 4.2] }, // shin in front, calf belly behind
}
interface Bone { A: V; B: V; L: number; u: V; n: V; at: (t: number, off?: number) => V; ang: number }
/** A bone on screen. Its side normal points to the limb's front, worked out from the joint it bends at
 *  (so the quad stays on the quad side however the leg turns; no flipping when a bone passes level). */
function bone(A: V, B: V, ref: V): Bone {
  const d = sub(B, A), L = len(d), u = L > 0.01 ? mul(d, 1 / L) : [0, 1]
  let n: V = [-u[1], u[0]]
  if (dot(n, ref) < 0) n = mul(n, -1)
  return { A, B, L, u, n, at: (t, off = 0) => add(add(A, mul(u, L * t)), mul(n, off)), ang: (Math.atan2(u[1], u[0]) * 180) / Math.PI }
}
/** Which way is "front" for a bone: toward (sign +1) or away from (-1) the neighbouring bone, leaning to screen-left when straight. */
function frontRef(A: V, B: V, joint: V, other: V, sign: number): V {
  const u = unit(sub(B, A)), v = sub(other, joint), perp = sub(v, mul(u, dot(v, u)))
  return add(mul(perp, sign), [-5, 0])
}
/** A limb as one smooth shape: rounded at both ends, its outline following the muscle profile. */
function limb(b: Bone, w: { o: number[]; i: number[] }) {
  const g = THICK, pts: V[] = [sub(b.A, mul(b.u, w.o[0] * g * 0.8))]
  TS.forEach((t, k) => pts.push(b.at(t, w.o[k] * g)))
  pts.push(add(b.B, mul(b.u, w.o[6] * g * 0.75)))
  for (let k = TS.length - 1; k >= 0; k--) pts.push(b.at(TS[k], -w.i[k] * g))
  return smooth(pts)
}
/** A rounded fist, centred just past the wrist so whatever he holds runs right through his grip. */
const hand = (hp: V, fa: Bone) => ellipse(add(hp, mul(fa.u, 2.2)), 7.8, 6.8, fa.ang)
/** A rounded foot under the ankle, pointing forward: flat on the floor, pointing down when he hangs. */
function foot(k: V, f: V) {
  const shin = u3(s3(f, k)), t = clamp((f[1] - 326) / 8)
  const fw = u3(a3(m3(u3(x3([1, 0, 0], shin)), 1 - t), m3([0, 0, 1], t)))
  const dn = u3(a3(m3(shin, 1 - t), m3([0, 1, 0], t)))
  const dir = dproj(fw), dl = len(dir)
  return ellipse(proj(a3(a3(f, m3(fw, 6)), m3(dn, 6.5))), 6.4 + 5 * dl, 5.8, (Math.atan2(dir[1], dir[0]) * 180) / Math.PI)
}

/* ===== the torso: cross-sections down the spine (width, chest depth, back depth), seen from the side angle ===== */
const LEVELS = [ // y down the spine (shoulder line = 0, hips = 94), half width, front depth, back depth
  [-5, 7.5, 6, 6], [-2.5, 16.5, 7.5, 9.5], [5, 30, 11, 11], [19, 29.5, 18, 13.5], [31, 29, 16, 14.5], [68, 22, 12, 11.5], [90, 23, 11, 16]]
function levelAt(y: number) {
  if (y <= LEVELS[0][0]) return LEVELS[0]
  for (let i = 1; i < LEVELS.length; i++) if (y <= LEVELS[i][0]) {
    const A = LEVELS[i - 1], B = LEVELS[i], t = (y - A[0]) / (B[0] - A[0])
    return A.map((v, k) => lerp(v, B[k], t))
  }
  return LEVELS[LEVELS.length - 1]
}
function torsoFrame(j: Joints) {
  const T = mid3(j.sL, j.sR), B = mid3(j.pL, j.pR), L = n3(s3(B, T)), u = u3(s3(B, T))
  const l0 = s3(j.sL, j.sR), lat = u3(s3(l0, m3(u, d3(l0, u))))
  const f = x3(lat, u) // the way the chest faces (forward standing, up lying on the bench)
  const k = L / 94
  const us = unit(sub(proj(B), proj(T))), vs: V = [us[1], -us[0]]
  const lv = dot(dproj(lat), vs), fv = dot(dproj(f), vs)
  return { T, B, u, lat, f, k, lv, fv, vs,
    c: (y: number) => proj(a3(T, m3(u, y * k))),
    /** a point on the chest/back surface: y down the spine, phi around it (0 = near side, 90 = front) */
    surf(y: number, phiDeg: number) {
      const [, a, bf, bb] = levelAt(y), ph = (phiDeg * Math.PI) / 180, b = Math.sin(ph) >= 0 ? bf : bb
      return proj(a3(a3(a3(T, m3(u, y * k)), m3(lat, a * Math.cos(ph))), m3(f, b * Math.sin(ph))))
    } }
}
type Frame = ReturnType<typeof torsoFrame>
function torsoShape(F: Frame) {
  const ext = (a: number, bf: number, bb: number, side: number) => { const b = F.fv * side >= 0 ? bf : bb; return Math.sqrt((a * F.lv) ** 2 + (b * F.fv) ** 2) }
  const right: V[] = [], left: V[] = []
  for (const [y, a, bf, bb] of LEVELS) {
    const c = F.c(y)
    right.push(add(c, mul(F.vs, ext(a, bf, bb, 1)))); left.push(sub(c, mul(F.vs, ext(a, bf, bb, -1))))
  }
  const bottom = proj(a3(a3(F.T, m3(F.u, 100 * F.k)), m3(F.f, 1)))
  return smooth([bottom, ...right.reverse(), ...left])
}
/** Faint lines on the surface: the pecs, the line down the abs, two ab rows. They turn with the body. */
function curveOn(F: Frame, keys: number[][], steps = 6) {
  const pts: V[] = []
  for (let i = 0; i < keys.length - 1; i++) for (let s = 0; s < steps; s++) {
    const t = s / steps
    pts.push(F.surf(lerp(keys[i][0], keys[i + 1][0], t), lerp(keys[i][1], keys[i + 1][1], t)))
  }
  const e = keys[keys.length - 1]
  pts.push(F.surf(e[0], e[1]))
  return line(pts)
}
const defLines = (F: Frame) => [
  curveOn(F, [[28, 90], [32, 55], [21, 16]]), curveOn(F, [[28, 90], [31, 118], [24, 140]]),
  curveOn(F, [[36, 90], [78, 90]]),
  curveOn(F, [[47, 62], [48.5, 90], [47, 118]]), curveOn(F, [[59, 64], [60.5, 90], [59, 116]]),
].join(' ')

/** Every piece of the body, each with how close it is. `grip` says how near the bar a hand holds is, so the hand draws over it. */
function bodyPieces(j: Joints, grip: (side: 'L' | 'R') => number) {
  const F = torsoFrame(j), out: Piece[] = []
  const pj = {} as Record<keyof Joints, V>
  for (const k in j) pj[k as keyof Joints] = proj(j[k as keyof Joints])
  // torso and neck; the ab lines fade as the chest turns away (lying on the bench it faces up)
  const hd = u3(s3(j.nk, j.hc)), headC = a3(j.hc, m3(hd, 4)), neckTop = a3(headC, m3(hd, 10))
  const nt = proj(neckTop), nb = proj(a3(F.T, m3(F.u, -3 * F.k)))
  const nd = unit(sub(nb, nt)), np: V = [-nd[1], nd[0]]
  const neck = poly([add(nt, mul(np, 8)), add(nb, mul(np, 12)), sub(nb, mul(np, 12)), sub(nt, mul(np, 8))])
  out.push({ kind: 'body', d: torsoShape(F) + ' ' + neck, deco: defLines(F), decoA: clamp(depth(F.f) / 0.6), z: depth(mid3(F.T, F.B)) })
  // head: a clean egg, full at the crown and tapering to the chin, the chin set a touch toward where he faces
  const hcp = proj(headC), fwd = unit(dproj(F.f)), tilt = (Math.atan2(nd[1], nd[0]) * 180) / Math.PI - 90
  const hp = ellipsePts(hcp, 13.6, 16.5, tilt, 16).map((p) => {
    const v = sub(p, hcp), t = dot(v, nd) / 16.5, along = mul(nd, dot(v, nd)), across = sub(v, along)
    return t <= 0 ? p : add(add(hcp, add(along, mul(across, 1 - 0.24 * t))), mul(fwd, 2 * t))
  })
  out.push({ kind: 'body', d: smooth(hp), z: depth(j.hc) + 12 })
  for (const side of ['L', 'R'] as const) {
    const s = j[`s${side}`], e = j[`e${side}`], h = j[`h${side}`], p = j[`p${side}`], k = j[`k${side}`], f = j[`f${side}`], sg = side === 'L' ? 1 : -1
    const S = pj[`s${side}`], E = pj[`e${side}`], Hh = pj[`h${side}`], Pp = pj[`p${side}`], K = pj[`k${side}`], Fp = pj[`f${side}`]
    const ua = bone(S, E, frontRef(S, E, E, Hh, 1)), fa = bone(E, Hh, frontRef(E, Hh, E, S, 1))
    const th = bone(Pp, K, frontRef(Pp, K, K, Fp, -1)), ca = bone(K, Fp, frontRef(K, Fp, K, Pp, -1))
    const delt = proj(a3(a3(s, m3(F.lat, 3 * sg)), m3(s3(e, s), 0.1)))
    const far = side === 'R'
    const Q = (b: Bone, a: [number, number], c: [number, number], z: [number, number]) => `M${f1(b.at(...a))} Q${f1(b.at(...c))} ${f1(b.at(...z))}`
    out.push({ kind: 'body', far, d: limb(ua, W.ua) + ' ' + ellipse(delt, 13, 11.2, ua.L > 6 ? ua.ang : 90), z: (depth(s) + depth(e)) / 2 + 1,
      deco: Q(ua, [0.02, 9.5], [0.62, 0], [0.02, -9.5]) + ' ' + Q(ua, [0.5, 4], [0.72, 6.5], [0.92, 3]) }) // deltoid's V, the biceps' edge
    out.push({ kind: 'body', far, d: limb(fa, W.fa), z: (depth(e) + depth(h)) / 2 + 2, deco: Q(fa, [0.08, 2.5], [0.35, 4.5], [0.75, 1]) })
    out.push({ kind: 'body', far, d: hand(Hh, fa), z: Math.max(depth(h) + 2, grip(side) + 0.5) })
    // the whole leg is one shape (thigh, shin, foot): no seam at the knee
    out.push({ kind: 'body', far, d: limb(th, W.th) + ' ' + limb(ca, W.ca) + ' ' + foot(k, f), z: (depth(p) + depth(k) + depth(f)) / 3,
      deco: [Q(th, [0.16, 6], [0.55, 8], [0.9, 2.5]), Q(th, [0.86, 2], [1.02, 7], [1.08, 1]), Q(ca, [0.1, -4.5], [0.32, -8.5], [0.62, -3])].join(' ') })
  }
  return { pieces: out, pj }
}

/* ===== the equipment, in the same 3D space (plates are discs, so they turn into ellipses) ===== */
function plate(x0: number, y: number, z: number, R: number, t: number): Piece {
  const c1 = proj([x0 - t / 2, y, z]), c2 = proj([x0 + t / 2, y, z]), rx = R * SI
  return { kind: 'plate', d: ellipse(c1, rx, R) + ' ' + ellipse(c2, rx, R) + ' ' + poly([[c1[0], y - R], [c2[0], y - R], [c2[0], y + R], [c1[0], y + R]]), z: depth([x0, y, z]) }
}
const steel = (x1: number, x2: number, y: number, z: number): Piece => ({ kind: 'steel', d: `M${f1(proj([x1, y, z]))} L${f1(proj([x2, y, z]))}`, z: depth([(x1 + x2) / 2, y, z]) })
const seg = (A: V, B: V): Piece => ({ kind: 'steel', d: `M${f1(proj(A))} L${f1(proj(B))}`, z: depth(mid3(A, B)) })
/** A bar across the body at (cx, y, z): split where the hands are, with plates on both ends. */
function barbell(cx: number, hx: number, y: number, z: number, half: number, plates: number[][], bias: number) {
  const out = [steel(cx - half, cx - hx, y, z), steel(cx - hx, cx + hx, y, z), steel(cx + hx, cx + half, y, z)]
  for (const [x, R, t] of plates) { out.push(plate(cx + x, y, z, R, t)); out.push(plate(cx - x, y, z, R, t)) }
  out.forEach((o) => { o.z += bias })
  return { pieces: out, mid: out[1].z }
}
/** The bench (pad on two legs) and its rack, the bar in his hands. */
function bench(j: Joints) {
  const X = BENCH_X, out: Piece[] = []
  const x0 = X - 13, x1 = X + 13, y0 = 255, y1 = 265, z0 = -116, z1 = 46
  const near = [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]].map(proj), end = [[x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]].map(proj)
  out.push({ kind: 'pad', d: poly(near) + ' ' + poly(end), z: -1000 })
  for (const z of [-100, 32]) out.push({ ...seg([X, 265, z], [X, 340, z]), z: -1001 })
  for (const dx of [-40, 40]) { // rack uprights with a hook at lockout height
    out.push(seg([X + dx, 340, RACK_Z], [X + dx, RACK_Y - 8, RACK_Z]))
    out.push(seg([X + dx, RACK_Y + 3, RACK_Z], [X + dx, RACK_Y + 3, RACK_Z + 7]))
  }
  const bb = barbell(X, Math.abs(j.hL[0] - X), (j.hL[1] + j.hR[1]) / 2, (j.hL[2] + j.hR[2]) / 2, 70, [[62, 20, 6], [53, 14, 5]], 0)
  return { pieces: out.concat(bb.pieces), mid: bb.mid }
}
function kitPieces(kind: FigureKind, j: Joints) {
  const out: Piece[] = [], grips: Partial<Record<'L' | 'R', number>> = {}
  const day = DAYS[kind]
  for (const what of day.kit) {
    const from = out.length
    if (what === 'pullbar') {
      const X = day.barX ?? 0, Z = 2
      const pcs: Piece[] = [steel(X - 84, X + 84, BAR_Y, Z), { kind: 'post', z: 0, d: `M${f1(proj([X - 84, BAR_Y, Z]))} L${f1(proj([X - 84, 340, Z]))} M${f1(proj([X + 84, BAR_Y, Z]))} L${f1(proj([X + 84, 340, Z]))}` }]
      pcs.forEach((o) => { o.z = 22 }) // in front of the head and chest: he pulls up behind it
      out.push(...pcs)
      for (const s of ['L', 'R'] as const) if (Math.abs(j[`h${s}`][1] - BAR_Y) < 5) grips[s] = 22
    }
    if (what === 'bench') { const b = bench(j); out.push(...b.pieces); grips.L = grips.R = b.mid }
    if (what === 'squatbar') { // on the traps: behind the neck
      const b = barbell(0, Math.abs(j.hL[0]), (j.hL[1] + j.hR[1]) / 2, (j.hL[2] + j.hR[2]) / 2, 90, [[80, 24, 7], [71, 16, 5]], -22)
      out.push(...b.pieces); grips.L = grips.R = b.mid
    }
    if (what === 'dumbbells') for (const s of ['L', 'R'] as const) {
      const h = j[`h${s}`], hs = steel(h[0] - 8, h[0] + 8, h[1], h[2])
      out.push(hs, plate(h[0] - 9.5, h[1], h[2], 11, 6), plate(h[0] + 9.5, h[1], h[2], 11, 6))
      grips[s] = hs.z
    }
    // C&B: he's on the bench; the pull-up bar stands beside it, a step back
    if (kind === 'cb' && what === 'pullbar') for (let i = from; i < out.length; i++) out[i].alpha = 0.6
  }
  return { pieces: out, grip: (s: 'L' | 'R') => grips[s] ?? -1e9 }
}

/** The day's figure: every piece, farthest first, plus where its floor shadow goes. */
export function buildFigure(kind: FigureKind): Figure {
  const j = expand(DAYS[kind].pose), kit = kitPieces(kind, j), body = bodyPieces(j, kit.grip)
  const all = [...body.pieces, ...kit.pieces].map((p, i) => ({ p, i }))
  all.sort((a, b) => a.p.z - b.p.z || a.i - b.i)
  const fx = (body.pj.fL[0] + body.pj.fR[0]) / 2, onBench = DAYS[kind].kit.includes('bench')
  return { pieces: all.map((x) => x.p), shadow: { cx: onBench ? fx + 40 : fx + 4, rx: onBench ? 70 : 46 } }
}
