import type { Macros, Unit } from '../db/types'
import type { AiMeal } from './meal'

/**
 * The RepFuel AI server, same code on two hosts: Cloudflare first, Vercel as the backup when one is blocked
 * (workers.dev was blocked in Egypt on 15/11/2026). If empty, dev builds use a fake reply.
 */
export const AI_URLS: string[] = [
  'https://repfuel-ai.repfuel-app.workers.dev',
  'https://repfuel-ai.vercel.app/api/ai',
]

const PASS_KEY = 'rf-ai-pass'
const SERVER_KEY = 'rf-ai-server'

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

const isMock = () => !AI_URLS.length && import.meta.env.DEV

const OFFLINE = 'Could not reach the AI. You may be offline. Check your internet and try again.'

/** The server that answered last time (remembered), so most calls go straight to it. */
let chosen: string | null = (() => {
  try { const v = localStorage.getItem(SERVER_KEY); return v && AI_URLS.includes(v) ? v : null } catch { return null }
})()

/** Resolves with the URL if the server answers at all. A blocked host never answers (the connection just hangs), so it gives up after 5 s. */
const ping = (u: string) => fetch(u, { method: 'GET', mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(5_000) }).then(() => u)

/** Finds a server that can be reached: pings all at once and takes the first that answers. */
async function pickServer(avoid?: string): Promise<string> {
  const urls = AI_URLS.filter((u) => u !== avoid)
  try {
    chosen = await Promise.any(urls.map(ping))
  } catch {
    throw new Error(OFFLINE)
  }
  try { localStorage.setItem(SERVER_KEY, chosen) } catch { /* just won't be remembered */ }
  return chosen
}

/**
 * POSTs to the AI server. Uses the remembered one; if it can't be reached, finds one that can and tries once more.
 * Only connection failures switch servers: an answer from the server (even an error) is final.
 */
async function send(body: string, pass: string): Promise<Response> {
  const go = (url: string) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-RepFuel-Pass': pass },
    body,
    signal: AbortSignal.timeout(60_000),
  })
  // A blocked host doesn't fail, it hangs (45 s+ seen), so check the remembered one answers before sending.
  let url = chosen ? await ping(chosen).catch(() => null) : null
  url ??= await pickServer(chosen ?? undefined)
  try {
    return await go(url)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') throw new Error('AI took too long. Try again, or add it by hand.')
    // Can't connect: maybe this host got blocked. Try another one that answers.
    const failed = url
    chosen = null
    url = await pickServer(AI_URLS.length > 1 ? failed : undefined)
    try {
      return await go(url)
    } catch (e2) {
      if (e2 instanceof DOMException && e2.name === 'TimeoutError') throw new Error('AI took too long. Try again, or add it by hand.')
      chosen = null
      throw new Error(OFFLINE)
    }
  }
}

type AiRequest =
  | { mode: 'meal'; text: string; foods: string }
  | { mode: 'search'; text: string; foods: string; fix?: string; current?: string; image?: string; mimeType?: string }

async function post(req: AiRequest): Promise<Record<string, unknown>> {
  if (!AI_URLS.length) throw new Error('AI is not set up yet.')
  const pass = getPass()
  if (!pass) throw new Error('Enter your AI passcode in Settings → AI first.')
  const res = await send(JSON.stringify(req), pass)
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

/**
 * Like askMeal, but the Worker first searches the web for the items (real numbers when found, high-end estimate when not).
 * With `fix`, the AI corrects the current result (`current` = what the screen shows now) instead of starting over.
 */
export async function askSearch(text: string, foods: string, fix?: { text: string; current: string; photo?: { image: string; mimeType: string } }): Promise<AiMeal> {
  if (isMock()) return mockMeal(text, fix?.text)
  const data = await post({ mode: 'search', text, foods, ...(fix ? { fix: fix.text, current: fix.current, ...fix.photo } : {}) })
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
  /** A label's numbers didn't add up (or were hard to read): the AI is reading it again. */
  | { t: 'check' }

export type PhotoResult = { kind: 'label'; food: AiFood } | { kind: 'food'; meal: AiMeal } | { kind: 'none'; note: string }

/** Any photo: the AI decides if it is a nutrition label, food, or neither, and reports each step as it goes. */
export async function askPhoto(img: { image: string; mimeType: string }, foods: string, onEvent: (e: PhotoEvent) => void): Promise<PhotoResult> {
  if (isMock()) return mockPhoto(onEvent)
  if (!AI_URLS.length) throw new Error('AI is not set up yet.')
  const pass = getPass()
  if (!pass) throw new Error('Enter your AI passcode in Settings → AI first.')
  const res = await send(JSON.stringify({ mode: 'photo', ...img, foods }), pass)
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

async function mockMeal(text: string, fix?: string): Promise<AiMeal> {
  await new Promise((r) => setTimeout(r, 900))
  const base = { matchId: 0, amount: 0, liquid: false, confidence: 'medium' as const, note: '' }
  // Dev sample of a fix: "large" makes the koshary bigger, so the screen visibly updates in place.
  const big = fix && /large|big|كبير/i.test(fix) ? 1.4 : 1
  if (!/,| and /i.test(text)) return { name: 'Koshary (dev sample)', items: [{ ...base, name: `Koshary, ${big > 1 ? 'large' : 'medium'} (dev sample)`, eatenGrams: Math.round(450 * big), servingLabel: '1 plate', gramsPerServing: Math.round(450 * big), kcal: Math.round(780 * big), protein: Math.round(24 * big), carbs: Math.round(135 * big), fat: Math.round(16 * big), note: big > 1 ? 'Changed to large as you said.' : 'Abou Tarek medium bowl.', source: 'fatsecret.com' }] }
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
