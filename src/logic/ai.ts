import type { Macros, Unit } from '../db/types'

/** The RepFuel AI Worker (Cloudflare). If empty, dev builds use a fake reply. */
export const AI_URL = 'https://repfuel-ai.repfuel-app.workers.dev'

const PASS_KEY = 'rf-ai-pass'

export interface AiFood extends Macros {
  name: string
  baseAmount: number
  unit: Unit
  servingLabel: string
  defaultAmount: number
  gramsPerServing?: number
  liquid?: boolean
  confidence: 'high' | 'medium' | 'low'
  note: string
}

export function getPass(): string {
  try { return localStorage.getItem(PASS_KEY) ?? '' } catch { return '' }
}

export function setPass(v: string): void {
  try {
    if (v) localStorage.setItem(PASS_KEY, v)
    else localStorage.removeItem(PASS_KEY)
  } catch { /* storage blocked: passcode just won't be remembered */ }
}

const isMock = () => !AI_URL && import.meta.env.DEV

export async function askAi(req: { mode: 'text'; text: string } | { mode: 'label'; image: string; mimeType: string }): Promise<AiFood> {
  if (isMock()) return mock(req.mode)
  if (!AI_URL) throw new Error('AI is not set up yet.')
  const pass = getPass()
  if (!pass) throw new Error('Enter your AI passcode in Settings → AI first.')
  let res: Response
  try {
    res = await fetch(AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-RepFuel-Pass': pass },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(60_000),
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') throw new Error('AI took too long. Try again, or add it by hand.')
    throw new Error('Could not reach the AI. You may be offline. Check your internet and try again.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.food) throw new Error(data.error ?? `AI error (${res.status}).`)
  return data.food as AiFood
}

/** Shrinks a photo to max 1280px JPEG and returns base64 (no data: prefix). Keeps uploads small and fast. */
export async function photoToBase64(file: File): Promise<{ image: string; mimeType: string }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const url = canvas.toDataURL('image/jpeg', 0.85)
  return { image: url.slice(url.indexOf(',') + 1), mimeType: 'image/jpeg' }
}

async function mock(mode: 'text' | 'label'): Promise<AiFood> {
  await new Promise((r) => setTimeout(r, 900))
  return mode === 'label'
    ? { name: 'Juhayna Greek Yogurt (dev sample)', baseAmount: 100, unit: 'g', servingLabel: '100 g', defaultAmount: 170, gramsPerServing: 170, kcal: 97, protein: 9, carbs: 4, fat: 5, confidence: 'high', note: 'Read per 100 g column. Serving is 170 g.' }
    : { name: 'Koshary, medium (dev sample)', baseAmount: 1, unit: 'serving', servingLabel: '1 medium plate', defaultAmount: 1, gramsPerServing: 450, kcal: 905, protein: 26, carbs: 150, fat: 24, confidence: 'medium', note: 'Assumed fried onions and oil in sauce. Leaned high.' }
}
