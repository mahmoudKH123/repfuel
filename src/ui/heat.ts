/** Going over, the colour heats up the further past the goal: green at it, then yellow (5% over), orange (15%) and
 *  red (30% and beyond), blended smoothly in between. The shades are theme tokens (--hot1..3 in index.css). */
const HOT: [number, string][] = [[0, 'var(--kcal)'], [0.05, 'var(--hot1)'], [0.15, 'var(--hot2)'], [0.3, 'var(--hot3)']]
export function hot(over: number): string {
  if (over >= HOT[HOT.length - 1][0]) return HOT[HOT.length - 1][1]
  const i = Math.max(1, HOT.findIndex(([at]) => over <= at))
  const [a, A] = HOT[i - 1], [b, B] = HOT[i], t = Math.max(0, (over - a) / (b - a))
  return `color-mix(in srgb, ${A} ${((1 - t) * 100).toFixed(1)}%, ${B})`
}
