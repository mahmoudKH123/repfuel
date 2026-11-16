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

export type ThemeMode = 'auto' | Theme

/** Light/dark theme: follows the phone ('auto') until the user picks one in Settings, then remembers it. */
export function useTheme(): [ThemeMode, (m: ThemeMode) => void] {
  const [mode, setModeState] = useState<ThemeMode>(() => saved() ?? 'auto')
  const [theme, setTheme] = useState<Theme>(() => saved() ?? system())

  useEffect(() => { apply(theme) }, [theme])

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => { if (!saved()) setTheme(system()) }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setMode = (m: ThemeMode) => {
    try {
      if (m === 'auto') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, m)
    } catch { /* private mode: applies for this visit only */ }
    setModeState(m)
    const next: Theme = m === 'auto' ? system() : m
    // Compare with what's on screen, not this render's state: an undo calls an older copy of this function.
    const shown = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
    if (next === shown) { setTheme(next); return }
    const run = () => { apply(next); setTheme(next) }
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (doc.startViewTransition && !reduced) doc.startViewTransition(run)
    else run()
  }
  return [mode, setMode]
}
