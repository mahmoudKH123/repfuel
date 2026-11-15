import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { AvatarPhoto } from '../db/types'
import { PhotoCrop } from './PhotoCrop'
import { prepPhoto, type Crop } from './photo'

/** Built-in avatars: a flat glyph on one of the app's own colours. Stored in Settings.avatar by id. */
const AVATARS: { id: string; tone: string; label: string; glyph: ReactNode }[] = [
  { id: 'dumbbell', tone: 'kcal', label: 'Dumbbell', glyph: <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" /> },
  { id: 'kettlebell', tone: 'carbs', label: 'Kettlebell', glyph: <><circle cx="12" cy="14.5" r="5.5" /><path d="M9.2 9.8 8.8 7a3.2 3.2 0 0 1 6.4 0l-.4 2.8" /></> },
  { id: 'flame', tone: 'fat', label: 'Flame', glyph: <path d="M12 21a6 6 0 0 0 6-6c0-4-3-5.5-4-9-2.5 1.5-3.5 4-3 6.5-1-.5-2-1.5-2.2-3C7 11 6 13 6 15a6 6 0 0 0 6 6z" /> },
  { id: 'bolt', tone: 'protein', label: 'Bolt', glyph: <path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" /> },
  { id: 'plate', tone: 'teal', label: 'Plate', glyph: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2.5" /></> },
  { id: 'leaf', tone: 'water', label: 'Leaf', glyph: <path d="M5 19C5 11 10 5 20 5c0 10-6 15-14 15M5 19l8-8" /> },
  { id: 'heart', tone: 'look', label: 'Heart', glyph: <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" /> },
  { id: 'peak', tone: 'ai', label: 'Peak', glyph: <path d="M3 19 9.5 8l4 6.5 2-3L21 19z" /> },
]

const isPhoto = (a?: string) => !!a && a.startsWith('data:image/')

/** The profile picture: your photo, a built-in avatar, or your initial on green when neither is set. */
export function Avatar({ value, name, size }: { value?: string; name: string; size: number }) {
  const icon = AVATARS.find((a) => a.id === value)
  const style = { width: size, height: size, '--tc': icon ? `var(--${icon.tone})` : undefined } as CSSProperties
  if (isPhoto(value)) return <img className="av" src={value} alt="" style={style} />
  if (icon) {
    return (
      <span className="av av-icon" style={style}>
        <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} aria-hidden>{icon.glyph}</svg>
      </span>
    )
  }
  return <span className="av av-letter" style={{ ...style, fontSize: size * 0.4 }}>{name.trim()[0]?.toUpperCase() ?? 'M'}</span>
}

/** Profile sheet: your name, and a picture (photo from the library or camera, framed with Move and Scale; a built-in
 *  avatar; or back to the initial). Every change saves straight away; Done just closes. */
export function AvatarSheet({ value, photo, name, onPick, onName, onClose }: {
  value?: string; photo?: AvatarPhoto; name: string
  onPick: (v?: string, photo?: AvatarPhoto) => void; onName: (n: string) => void; onClose: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState(false)
  const [text, setText] = useState(name)
  const [framing, setFraming] = useState<{ src: string; start?: Crop } | null>(null)
  /** Saves the name if it changed; an empty box goes back to the saved name. */
  const commitName = () => {
    const n = text.trim().slice(0, 24)
    if (!n) setText(name)
    else if (n !== name) onName(n)
  }
  const close = () => { commitName(); onClose() }
  const choose = async (f?: File) => {
    if (!f) return
    try {
      setError(false)
      setFraming({ src: await prepPhoto(f) })
    } catch {
      setError(true)
    }
  }
  const canAdjust = isPhoto(value) && !!photo
  return createPortal(
    <div className="wd-backdrop" onClick={close}>
      <div className="wd-sheet av-sheet" role="dialog" aria-label="Profile" onClick={(e) => e.stopPropagation()}>
        <span className="wd-grab" aria-hidden />
        <h2 className="wd-title">Profile</h2>
        <div className="av-now">
          {canAdjust ? (
            <button className="av-now-btn" onClick={() => setFraming({ src: photo.src, start: photo })} aria-label="Adjust photo">
              <Avatar value={value} name={text || name} size={84} />
            </button>
          ) : <Avatar value={value} name={text || name} size={84} />}
        </div>
        <label className="av-name">
          <span>Name</span>
          <input
            value={text} maxLength={24} autoComplete="given-name" enterKeyHint="done" aria-label="Your name"
            onChange={(e) => setText(e.target.value)} onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          />
        </label>
        <div className={`av-photos${canAdjust ? ' two' : ''}`}>
          {canAdjust && (
            <button className="av-photo" onClick={() => setFraming({ src: photo.src, start: photo })}>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M6 2.5V18h15.5M2.5 6H18v15.5" /></svg>
              Adjust
            </button>
          )}
          <button className="av-photo" onClick={() => input.current?.click()}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z" /><circle cx="12" cy="12.5" r="3.5" /></svg>
            {isPhoto(value) ? 'New photo' : 'Choose photo'}
          </button>
        </div>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = '' }} />
        {error && <p className="av-error">That picture couldn&apos;t be opened. Try another one.</p>}
        <p className="av-or">or pick an avatar</p>
        <div className="av-grid">
          {AVATARS.map((a, i) => (
            <button key={a.id} className={`av-opt${value === a.id ? ' on' : ''}`} style={{ animationDelay: `${i * 30}ms` }} onClick={() => onPick(a.id)} aria-label={a.label}>
              <Avatar value={a.id} name={text || name} size={52} />
            </button>
          ))}
        </div>
        <div className={`wd-actions${value ? '' : ' one'}`}>
          {value && <button onClick={() => onPick(undefined)}>Remove</button>}
          <button className="primary" onClick={close}>Done</button>
        </div>
      </div>
      {framing && (
        <PhotoCrop
          src={framing.src} start={framing.start} onCancel={() => setFraming(null)}
          onDone={(picture, crop) => { onPick(picture, { src: framing.src, ...crop }); setFraming(null) }}
        />
      )}
    </div>,
    document.body,
  )
}
