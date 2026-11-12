import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'
const KEY = 'rf-theme'
const BAR = { light: '#f2f2f7', dark: '#000000' }

const saved = (): Theme | null => {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : null
  } catch {
    return null
  }
}
const system = (): Theme => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

function apply(t: Theme) {
  document.documentElement.dataset.theme = t
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', BAR[t]))
}

/** Light/dark theme: follows the phone until the user picks one by tapping the logo, then remembers it. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => saved() ?? system())

  useEffect(() => { apply(theme) }, [theme])

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => { if (!saved()) setTheme(system()) }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    try { localStorage.setItem(KEY, next) } catch { /* private mode: applies for this visit only */ }
    const run = () => { apply(next); setTheme(next) }
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (doc.startViewTransition && !reduced) doc.startViewTransition(run)
    else run()
  }

  return [theme, toggle]
}
