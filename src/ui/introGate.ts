import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Intro } from './Intro'

/* Launch intro gate. While the intro plays, the page underneath is already rendered (so the logo knows where to fly)
   but its entrance motion is held: CSS animations pause via html[data-intro='build'], and number count-ups / bar fills
   (ui/motion.ts) wait in this queue. They all start together the moment the logo begins its flight. */
let queue: (() => void)[] | null = null

/** Runs `f` now, or when the intro releases the page. Returns a cancel function. */
export function afterIntro(f: () => void): () => void {
  if (!queue) { f(); return () => {} }
  queue.push(f)
  return () => { if (queue) queue = queue.filter((x) => x !== f) }
}

function release() {
  document.documentElement.dataset.intro = 'fly'
  const q = queue ?? []
  queue = null
  q.forEach((f) => f())
}

/** Cold start only: main.tsx runs once per launch, so this plays after the app was fully closed,
 *  not when it comes back from the background. Off when the phone has Reduce Motion on. */
export function mountIntro() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  queue = []
  document.documentElement.dataset.intro = 'build'
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  let done = false
  const finish = () => {
    if (done) return
    done = true
    if (queue) release()
    delete document.documentElement.dataset.intro
    root.unmount()
    host.remove()
  }
  root.render(createElement(Intro, { onRelease: release, onDone: finish }))
}
