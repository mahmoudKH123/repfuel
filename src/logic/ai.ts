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
  | { mode: 'text'; text: string }
  | { mode: 'label'; image: string; mimeType: string }
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

export async function askAi(req: { mode: 'text'; text: string } | { mode: 'label'; image: string; mimeType: string }): Promise<AiFood> {
  if (isMock()) return mock(req.mode)
  const data = await post(req)
  if (!data.food) throw new Error('AI gave an unreadable answer. Try again.')
  return data.food as AiFood
}

/** Splits a described meal into items. `foods` = your saved foods (see foodsContext) so matches use your numbers. */
export async function askMeal(text: string, foods: string): Promise<AiMeal> {
  if (isMock()) return mockMeal(text)
  const data = await post({ mode: 'meal', text, foods })
  const meal = data.meal as AiMeal | undefined
  if (!meal?.items?.length) throw new Error('AI found no food in that. Try describing it differently.')
  return meal
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
