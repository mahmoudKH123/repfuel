// RepFuel AI proxy (Cloudflare Worker).
// Holds the Gemini key so it never reaches the browser. Two jobs:
//   POST { mode: "text",  text }               -> estimate for a described food (overestimates on purpose)
//   POST { mode: "label", image, mimeType }    -> exact values read from a nutrition-facts photo
// Reply: { food: { name, baseAmount, unit, servingLabel, defaultAmount, kcal, protein, carbs, fat, confidence, note }, model }

const RULES_TEXT = `You estimate calories and macros for foods eaten by a gym-goer in Egypt.
Rules:
- ALWAYS overestimate to be safe: when unsure, pick the higher realistic value for calories and fat, and assume generous Egyptian portions.
- Home cooking and restaurant food: always include cooking oil, butter or ghee.
- For branded products, chains and restaurants (e.g. Abou Tarek), use what you know about their typical portions and recipes.
- Give values for exactly what the user described (one serving = the amount they said, or a normal Egyptian portion).
- Round kcal up to the nearest 5 and grams up to whole numbers.
- confidence: "high" for branded/known items, "medium" for typical dishes, "low" for vague descriptions.
- gramsPerServing: realistic weight in grams of that one serving (for drinks, its volume in ml).
- liquid: true for drinks and soups you measure in ml, else false.
Reply as JSON:
{"name": string (short, clear, in English), "servingLabel": string (e.g. "1 medium plate"), "kcal": number, "protein": number, "carbs": number, "fat": number, "confidence": "high"|"medium"|"low", "note": string (one short line on assumptions)}`

const RULES_LABEL = `Read the nutrition facts label in this photo (it may be in English and/or Arabic).
Rules:
- Copy the numbers EXACTLY as printed. Do not pad or round them.
- Prefer the "per 100 g" (or per 100 ml) column. If only "per serving" exists, convert to per 100 g using the serving size in grams; if the serving size in grams is unknown, return values per serving instead.
- kcal: use kcal, not kJ. If only kJ is printed, divide by 4.184.
- "Carbohydrate" means total carbs. Protein, carbs and fat in grams.
- servingGrams: the serving size in g or ml if printed, else null.
- name: the product name if visible on the photo, else a short description.
- confidence: "high" if the label is clear, "medium" if some numbers were hard to read, "low" if guessed.
- If this is not a nutrition label, set confidence "low" and explain in note.`

const LABEL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    basis: { type: 'STRING', enum: ['per100g', 'per100ml', 'perServing'] },
    servingGrams: { type: 'NUMBER', nullable: true },
    kcal: { type: 'NUMBER' },
    protein: { type: 'NUMBER' },
    carbs: { type: 'NUMBER' },
    fat: { type: 'NUMBER' },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    note: { type: 'STRING' },
  },
  required: ['name', 'basis', 'kcal', 'protein', 'carbs', 'fat', 'confidence', 'note'],
}

const TEXT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    servingLabel: { type: 'STRING' },
    kcal: { type: 'NUMBER' },
    protein: { type: 'NUMBER' },
    carbs: { type: 'NUMBER' },
    fat: { type: 'NUMBER' },
    gramsPerServing: { type: 'NUMBER' },
    liquid: { type: 'BOOLEAN' },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    note: { type: 'STRING' },
  },
  required: ['name', 'servingLabel', 'gramsPerServing', 'liquid', 'kcal', 'protein', 'carbs', 'fat', 'confidence', 'note'],
}

// Low thinking keeps answers fast (default "medium" took 2+ minutes). Each model gets 25 s before we move on.
const THINKING = { thinkingConfig: { thinkingLevel: 'low' } }
const MODEL_TIMEOUT_MS = 25_000

const MAX_IMAGE_B64 = 4_000_000 // ~3 MB photo; the app shrinks photos well below this

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? ''
    const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-RepFuel-Pass',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    }
    const reply = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') return reply(405, { error: 'Use POST.' })
    if (!allowed.includes(origin)) return reply(403, { error: 'Not allowed.' })
    if (!(await samePass(request.headers.get('X-RepFuel-Pass') ?? '', env.PASSCODE ?? ''))) {
      return reply(401, { error: 'Wrong passcode. Check it in More.' })
    }

    let body
    try { body = await request.json() } catch { return reply(400, { error: 'Bad request.' }) }

    let payload
    if (body.mode === 'text' && typeof body.text === 'string' && body.text.trim()) {
      payload = {
        contents: [{ parts: [{ text: `${RULES_TEXT}\n\nFood: ${body.text.trim().slice(0, 500)}` }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: TEXT_SCHEMA, ...THINKING },
      }
    } else if (body.mode === 'label' && typeof body.image === 'string' && body.image.length < MAX_IMAGE_B64) {
      payload = {
        contents: [{ parts: [{ text: RULES_LABEL }, { inline_data: { mime_type: body.mimeType || 'image/jpeg', data: body.image } }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: LABEL_SCHEMA, ...THINKING },
      }
    } else {
      return reply(400, { error: 'Bad request.' })
    }

    let lastStatus = 0
    for (const model of env.MODELS.split(',').map((m) => m.trim())) {
      let res
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
        })
      } catch {
        console.log(JSON.stringify({ model, status: 'timeout' }))
        lastStatus = 504
        continue
      }
      lastStatus = res.status
      if (!res.ok) {
        // Google's error text only (never the key), visible with `wrangler tail`.
        const detail = await res.clone().json().catch(() => ({}))
        console.log(JSON.stringify({ model, status: res.status, error: String(detail.error?.message ?? '').slice(0, 300) }))
      }
      // 429 = free limit used up, 404 = model retired, 5xx = Google hiccup. Try the next model.
      if (res.status === 429 || res.status === 404 || res.status >= 500) continue
      if (!res.ok) return reply(502, { error: `AI error (${res.status}).` })
      const data = await res.json()
      const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
      const raw = parseJson(text)
      if (!raw) return reply(502, { error: 'AI gave an unreadable answer. Try again.' })
      return reply(200, { food: body.mode === 'label' ? fromLabel(raw) : fromText(raw), model })
    }
    return reply(503, {
      error: lastStatus === 429 ? 'Free AI limit reached for today. Add it by hand, or try again tomorrow.' : 'AI is unavailable right now. Try again later.',
    })
  },
}

const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v) * 10) / 10 : 0)
const conf = (v) => (['high', 'medium', 'low'].includes(v) ? v : 'low')

function fromText(r) {
  return {
    name: String(r.name ?? 'Food').slice(0, 80),
    baseAmount: 1,
    unit: 'serving',
    servingLabel: String(r.servingLabel ?? '1 serving').slice(0, 60),
    defaultAmount: 1,
    gramsPerServing: num(r.gramsPerServing) || undefined,
    liquid: r.liquid === true,
    kcal: num(r.kcal), protein: num(r.protein), carbs: num(r.carbs), fat: num(r.fat),
    confidence: conf(r.confidence),
    note: String(r.note ?? '').slice(0, 200),
  }
}

function fromLabel(r) {
  const serving = num(r.servingGrams)
  const per100 = r.basis === 'per100g' || r.basis === 'per100ml'
  const unit = r.basis === 'per100ml' ? 'ml' : per100 ? 'g' : 'serving'
  return {
    name: String(r.name ?? 'Product').slice(0, 80),
    baseAmount: per100 ? 100 : 1,
    unit,
    servingLabel: per100 ? `100 ${unit}` : serving ? `1 serving (${serving} g)` : '1 serving',
    defaultAmount: per100 ? (serving || 100) : 1,
    gramsPerServing: serving || undefined,
    liquid: r.basis === 'per100ml',
    kcal: num(r.kcal), protein: num(r.protein), carbs: num(r.carbs), fat: num(r.fat),
    confidence: conf(r.confidence),
    note: String(r.note ?? '').slice(0, 200),
  }
}

/** Pulls the JSON object out of a reply, even if wrapped in ```json fences or extra words. */
function parseJson(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(text.slice(start, end + 1)) } catch { return null }
}

/** Compares passcodes via SHA-256 so timing doesn't leak how much matched. */
async function samePass(a, b) {
  if (!b) return false
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', enc.encode(s))))
  const x = new Uint8Array(ha), y = new Uint8Array(hb)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}
