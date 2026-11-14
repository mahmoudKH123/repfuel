import { useFill } from './motion'

const k = (v: number) => Math.round(v).toLocaleString('en-US')

/** Fuel-pump counter: every digit sits on its own wheel and rolls to the new value, the right-hand digit first. */
export function Odometer({ value, memo, delay }: { value: number; memo: string; delay: number }) {
  // Starts from the last value shown (0 on first open) and rolls once it is on screen.
  const v = Math.round(useFill(value, memo))
  const chars = k(v).split('')
  const cells = chars.map((c, i) => {
    if (c === ',') return <span key={`s${chars.length - i}`} className="odo-sep">,</span>
    // Position from the right (0 = units), so wheels keep their place as the number shrinks.
    const p = chars.slice(i + 1).filter((x) => x !== ',').length
    return (
      <span key={`d${p}`} className="odo-wheel">
        <span style={{ transform: `translate3d(0, ${-Number(c) * 10}%, 0)`, transitionDelay: `${delay + p * 0.04}s` }}>
          {'0123456789'.split('').map((d) => <i key={d}>{d}</i>)}
        </span>
      </span>
    )
  })
  return <span className="odo">{cells}</span>
}
