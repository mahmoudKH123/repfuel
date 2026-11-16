/**
 * A short tap of the phone's haptic engine, no sound.
 * Android: Vibration API. iPhone (Safari 17.4+): toggling a hidden <input switch> plays the system tick;
 * iOS only does this inside a tap, so calls outside a user action do nothing there.
 */
let label: HTMLLabelElement | null = null

export function haptic(ms = 8): void {
  try {
    if (typeof navigator.vibrate === 'function') { navigator.vibrate(ms); return }
    if (!label) {
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.setAttribute('switch', '')
      input.id = 'rf-haptic'
      label = document.createElement('label')
      label.htmlFor = 'rf-haptic'
      for (const el of [input, label]) {
        el.setAttribute('aria-hidden', 'true')
        el.tabIndex = -1
        Object.assign(el.style, { position: 'fixed', left: '-100px', top: '0', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' })
      }
      document.body.append(input, label)
    }
    label.click()
  } catch { /* no haptics here */ }
}
