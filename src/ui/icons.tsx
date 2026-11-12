const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

export const IconToday = () => (
  <svg {...base}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
)
export const IconWeek = () => (
  <svg {...base}><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
)
export const IconFoods = () => (
  <svg {...base}><path d="M5 6h14M5 12h14M5 18h9" /></svg>
)
export const IconMore = () => (
  <svg {...base}><circle cx="5.5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18.5" cy="12" r="1.2" /></svg>
)
export const IconPlus = () => (
  <svg {...base} strokeWidth={2.6}><path d="M12 5v14M5 12h14" /></svg>
)
