import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { createPortal } from 'react-dom'
import { load, render, type Crop } from './photo'

const MAX_ZOOM = 4

type View = { x: number; y: number; z: number } // photo centre offset from the circle centre (px) and zoom

/** Full-screen "Move and Scale": drag to move, pinch (or the slider / mouse wheel) to zoom; the circle is what's kept. */
export function PhotoCrop({ src, start, onCancel, onDone }: {
  src: string; start?: Crop; onCancel: () => void; onDone: (picture: string, crop: Crop) => void
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, z: 1 })
  const [busy, setBusy] = useState(false)
  const viewRef = useRef(view)
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const stage = useRef<HTMLDivElement>(null)
  const D = Math.min(320, window.innerWidth - 48) // circle diameter on screen
  const base = size ? D / Math.min(size.w, size.h) : 1 // photo scale at zoom 1 (just covers the circle)
  const first = useRef({ start, D }) // framing to open with; read once per photo

  /** Keeps the circle fully covered by the photo. */
  const clamp = (v: View): View => {
    if (!size) return v
    const z = Math.min(MAX_ZOOM, Math.max(1, v.z))
    const mx = Math.max(0, (size.w * base * z - D) / 2)
    const my = Math.max(0, (size.h * base * z - D) / 2)
    return { z, x: Math.min(mx, Math.max(-mx, v.x)), y: Math.min(my, Math.max(-my, v.y)) }
  }
  const apply = (v: View) => { const c = clamp(v); viewRef.current = c; setView(c) }
  /** Zooms by k around a point p (relative to the circle centre), so what's under your fingers stays put. */
  const zoomAt = (k: number, px: number, py: number) => {
    const v = viewRef.current
    const z = Math.min(MAX_ZOOM, Math.max(1, v.z * k))
    const r = z / v.z
    apply({ z, x: px + (v.x - px) * r, y: py + (v.y - py) * r })
  }

  useEffect(() => {
    let live = true
    void load(src).then((img) => {
      if (!live) return
      const w = img.naturalWidth, h = img.naturalHeight
      setSize({ w, h })
      const { start, D } = first.current
      if (start) {
        const b = D / Math.min(w, h)
        const v = { z: start.zoom, x: (0.5 - start.u) * w * b * start.zoom, y: (0.5 - start.v) * h * b * start.zoom }
        viewRef.current = v
        setView(v)
      }
    })
    return () => { live = false }
  }, [src])

  const local = (e: { clientX: number; clientY: number }) => {
    const r = stage.current!.getBoundingClientRect()
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 }
  }
  const down = (e: PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); pts.current.set(e.pointerId, local(e)) }
  const move = (e: PointerEvent) => {
    const before = pts.current.get(e.pointerId)
    if (!before) return
    const now = local(e)
    const all = [...pts.current.entries()]
    if (all.length === 1) {
      const v = viewRef.current
      apply({ ...v, x: v.x + now.x - before.x, y: v.y + now.y - before.y })
    } else if (all.length === 2) {
      const other = all.find(([id]) => id !== e.pointerId)![1]
      const d0 = Math.hypot(before.x - other.x, before.y - other.y)
      const d1 = Math.hypot(now.x - other.x, now.y - other.y)
      const m0 = { x: (before.x + other.x) / 2, y: (before.y + other.y) / 2 }
      const m1 = { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 }
      const v = viewRef.current
      viewRef.current = { ...v, x: v.x + m1.x - m0.x, y: v.y + m1.y - m0.y }
      if (d0 > 0) zoomAt(d1 / d0, m1.x, m1.y)
      else apply(viewRef.current)
    }
    pts.current.set(e.pointerId, now)
  }
  const up = (e: PointerEvent) => { pts.current.delete(e.pointerId) }
  const wheel = (e: WheelEvent) => { const p = local(e); zoomAt(Math.exp(-e.deltaY / 300), p.x, p.y) }

  const done = async () => {
    if (!size || busy) return
    setBusy(true)
    const v = viewRef.current
    const crop = { zoom: v.z, u: 0.5 - v.x / (size.w * base * v.z), v: 0.5 - v.y / (size.h * base * v.z) }
    onDone(await render(src, crop), crop)
  }

  return createPortal(
    // Rendered inside the profile sheet's backdrop in React's tree, so clicks must not bubble up and close it.
    <div className="pc" role="dialog" aria-label="Move and scale photo" onClick={(e) => e.stopPropagation()}>
      <p className="pc-title">Move and Scale</p>
      <div
        ref={stage} className="pc-stage"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}
      >
        {size && (
          <img
            className="pc-img" src={src} alt="" draggable={false}
            style={{ width: size.w * base * view.z, height: size.h * base * view.z, transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px)` }}
          />
        )}
        <span className="pc-ring" style={{ width: D, height: D }} aria-hidden />
      </div>
      <label className="pc-zoom">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden><rect x="5" y="5" width="14" height="14" rx="3" /></svg>
        <input
          type="range" min={1} max={MAX_ZOOM} step={0.01} value={view.z} aria-label="Zoom"
          onChange={(e) => zoomAt(Number(e.target.value) / viewRef.current.z, 0, 0)}
        />
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><rect x="2" y="2" width="20" height="20" rx="4" /></svg>
      </label>
      <div className="pc-bar">
        <button onClick={onCancel}>Cancel</button>
        <button className="pc-reset" onClick={() => apply({ x: 0, y: 0, z: 1 })} disabled={view.z === 1 && view.x === 0 && view.y === 0}>Reset</button>
        <button className="pc-choose" onClick={done} disabled={!size || busy}>Choose</button>
      </div>
    </div>,
    document.body,
  )
}
