import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { buildFigure, type FigureKind } from './figure'
import { afterIntro } from './introGate'

const LABEL: Record<FigureKind, string> = {
  push: 'Bench press', pull: 'Pull-up', legs: 'Squat', cb: 'Bench press beside a pull-up bar', arms: 'Bicep curl', rest: 'Standing, resting',
}

/** Today's workout as one still figure (geometry in ui/figure.ts). It never moves: it draws itself in, piece by piece
 *  from the back to the front, each outline first, then its fill, then the faint muscle lines. Tap to see it again.
 *  On a cold start it waits for the launch intro to hand over the page. */
export function FuelFigure({ kind }: { kind: FigureKind }) {
  const fig = useMemo(() => buildFigure(kind), [kind])
  const [ready, setReady] = useState(false)
  const [play, setPlay] = useState(0)
  useEffect(() => afterIntro(() => setReady(true)), [])
  const step = 0.055, details = fig.pieces.length * step + 0.5
  return (
    <div className="ff" role="img" aria-label={LABEL[kind]} onClick={() => setPlay((p) => p + 1)}>
      <svg key={`${kind}-${play}`} className={ready ? 'ff-in' : undefined} viewBox="0 0 180 356" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
        <ellipse className="ff-shadow" cx={fig.shadow.cx} cy={349} rx={fig.shadow.rx} ry={4.5} />
        {fig.pieces.map((p, i) => (
          <g key={i} opacity={p.alpha}>
            <path className={`ff-${p.kind}${p.far ? ' far' : ''}`} d={p.d} pathLength={1} style={{ '--d': `${(i * step).toFixed(3)}s` } as CSSProperties} />
            {p.deco && <path className="ff-deco" d={p.deco} style={{ '--o': (0.3 * (p.decoA ?? 1)).toFixed(3), '--d': `${(details + i * 0.02).toFixed(3)}s` } as CSSProperties} />}
          </g>
        ))}
      </svg>
    </div>
  )
}
