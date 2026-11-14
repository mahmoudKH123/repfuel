import type { Macros, Unit } from '../db/types'
import type { AiMeal } from './meal'

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

type AiRequest =
  | { mode: 'meal'; text: string; foods: string }

async function post(req: AiRequest): Promise<Record<string, unknown>> {
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
  if (!res.ok) throw new Error(data.error ?? `AI error (${res.status}).`)
  return data
}

/** Splits a described meal into items. `foods` = your saved foods (see foodsContext) so matches use your numbers. */
export async function askMeal(text: string, foods: string): Promise<AiMeal> {
  if (isMock()) return mockMeal(text)
  const data = await post({ mode: 'meal', text, foods })
  const meal = data.meal as AiMeal | undefined
  if (!meal?.items?.length) throw new Error('AI found no food in that. Try describing it differently.')
  return meal
}

export type PhotoKind = 'label' | 'food' | 'none'

/** Live steps while the AI looks at a photo (streamed from the Worker). */
export type PhotoEvent =
  | { t: 'start' }
  | { t: 'kind'; kind: PhotoKind }
  | { t: 'seen'; text: string }
  | { t: 'item'; i: number; name: string; kcal?: number }
  | { t: 'retry' }

export type PhotoResult = { kind: 'label'; food: AiFood } | { kind: 'food'; meal: AiMeal } | { kind: 'none'; note: string }

/** Any photo: the AI decides if it is a nutrition label, food, or neither, and reports each step as it goes. */
export async function askPhoto(img: { image: string; mimeType: string }, foods: string, onEvent: (e: PhotoEvent) => void): Promise<PhotoResult> {
  if (isMock()) return mockPhoto(onEvent)
  if (!AI_URL) throw new Error('AI is not set up yet.')
  const pass = getPass()
  if (!pass) throw new Error('Enter your AI passcode in Settings → AI first.')
  let res: Response
  try {
    res = await fetch(AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-RepFuel-Pass': pass },
      body: JSON.stringify({ mode: 'photo', ...img, foods }),
      signal: AbortSignal.timeout(60_000),
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') throw new Error('AI took too long. Try again, or add it by hand.')
    throw new Error('Could not reach the AI. You may be offline. Check your internet and try again.')
  }
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? `AI error (${res.status}).`)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let cut
      while ((cut = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, cut).trim()
        buf = buf.slice(cut + 2)
        if (!line.startsWith('data:')) continue
        let e: Record<string, unknown>
        try { e = JSON.parse(line.slice(5)) } catch { continue }
        if (e.t === 'error') throw new Error(String(e.error ?? 'AI error.'))
        if (e.t === 'done') {
          if (e.kind === 'label' && e.food) return { kind: 'label', food: e.food as AiFood }
          if (e.kind === 'food' && (e.meal as AiMeal | undefined)?.items?.length) return { kind: 'food', meal: e.meal as AiMeal }
          return { kind: 'none', note: String(e.note ?? 'No food or nutrition label found in this photo.') }
        }
        onEvent(e as PhotoEvent)
      }
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') throw new Error('AI took too long. Try again, or add it by hand.')
    if (e instanceof Error && e.message) throw e
    throw new Error('Lost the connection to the AI. Try again.')
  }
  throw new Error('Lost the connection to the AI. Try again.')
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

async function mockMeal(text: string): Promise<AiMeal> {
  await new Promise((r) => setTimeout(r, 900))
  const base = { matchId: 0, amount: 0, liquid: false, confidence: 'medium' as const, note: '' }
  if (!/,| and /i.test(text)) return { name: 'Koshary (dev sample)', items: [{ ...base, name: 'Koshary, medium (dev sample)', eatenGrams: 450, servingLabel: '1 medium plate', gramsPerServing: 450, kcal: 780, protein: 24, carbs: 135, fat: 16, note: 'Assumed fried onions and oil in sauce.' }] }
  return {
    name: 'Breakfast (dev sample)',
    items: [
      { ...base, name: 'Fried eggs', eatenGrams: 100, servingLabel: '1 egg', gramsPerServing: 50, kcal: 180, protein: 12, carbs: 1, fat: 14, note: 'Fried in a little butter.', confidence: 'high' },
      { ...base, name: 'Baladi bread', eatenGrams: 90, servingLabel: '1 loaf', gramsPerServing: 90, kcal: 240, protein: 8, carbs: 48, fat: 1.5 },
      { ...base, name: 'Tea with milk and sugar', eatenGrams: 250, servingLabel: '1 glass', gramsPerServing: 250, liquid: true, kcal: 70, protein: 2, carbs: 12, fat: 2, note: '2 tsp sugar.' },
    ],
  }
}

async function mockPhoto(on: (e: PhotoEvent) => void): Promise<PhotoResult> {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  on({ t: 'start' }); await wait(1200)
  on({ t: 'kind', kind: 'food' }); await wait(300)
  on({ t: 'seen', text: 'A banana and a glass of milk (dev sample)' }); await wait(500)
  on({ t: 'item', i: 0, name: 'Banana' }); await wait(400)
  on({ t: 'item', i: 0, name: 'Banana', kcal: 105 }); await wait(400)
  on({ t: 'item', i: 1, name: 'Milk' }); await wait(400)
  on({ t: 'item', i: 1, name: 'Milk', kcal: 150 }); await wait(500)
  const base = { matchId: 0, amount: 0, statedWeight: false, confidence: 'medium' as const, note: '' }
  return { kind: 'food', meal: { name: 'Snack (dev sample)', items: [
    { ...base, name: 'Banana', eatenGrams: 120, servingLabel: '1 banana', gramsPerServing: 120, liquid: false, kcal: 105, protein: 1.3, carbs: 27, fat: 0.4 },
    { ...base, name: 'Milk', eatenGrams: 250, servingLabel: '1 glass', gramsPerServing: 250, liquid: true, kcal: 150, protein: 8, carbs: 12, fat: 8 },
  ] } }
}
