// RepFuel AI proxy (Cloudflare Worker).
// Holds the Gemini key so it never reaches the browser. Two jobs:
//   POST { mode: "text",  text }               -> estimate for one described food (kept for older app versions)
//   POST { mode: "meal",  text, foods }        -> the meal split into items; `foods` = the user's saved foods, one per line
//   POST { mode: "label", image, mimeType }    -> exact values read from a nutrition-facts photo (kept for older app versions)
//   POST { mode: "photo", image, mimeType, foods } -> STREAMED (text/event-stream): the AI decides if the photo is a label,
//        food, or neither, and the app sees each step live. Events: start, kind, seen, item, retry, done, error (see photoStream).
// Reply: { food: {...}, model } for text/label, { meal: { name, note, items: [...] }, model } for meal

const RULES_TEXT = `You estimate calories and macros for foods eaten by a gym-goer in Egypt.
Rules:
- Be realistic: give your best honest estimate, not a padded one, and assume normal Egyptian portions.
- Home cooking and restaurant food: always include the cooking oil, butter, ghee or sauce it is normally made with (the usual hidden calories).
- For branded products, chains and restaurants (e.g. Abou Tarek), use what you know about their typical portions and recipes.
- Give values for exactly what the user described (one serving = the amount they said, or a normal Egyptian portion).
- Round kcal up to the nearest 5 and grams up to whole numbers.
- confidence: "high" for branded/known items, "medium" for typical dishes, "low" for vague descriptions.
- gramsPerServing: realistic weight in grams of that one serving (for drinks, its volume in ml).
- liquid: true for drinks and soups you measure in ml, else false.
Reply as JSON:
{"name": string (short, clear, in English), "servingLabel": string (e.g. "1 medium plate"), "kcal": number, "protein": number, "carbs": number, "fat": number, "confidence": "high"|"medium"|"low", "note": string (one short line on assumptions)}`

const RULES_MEAL = `You estimate calories and macros for a meal eaten by a gym-goer in Egypt.
Split the meal into its separate items (e.g. "koshary and a pepsi" = 2 items; "chicken, rice and salad" = 3 items). A dish eaten as one thing (a sandwich, a plate of koshary) is ONE item.
Rules:
- Be realistic: give your best honest estimate, not a padded one, and assume normal Egyptian portions.
- Home cooking and restaurant food: always include the cooking oil, butter, ghee or sauce it is normally made with (the usual hidden calories).
- For branded products, chains and restaurants (e.g. Abou Tarek), use what you know about their typical portions and recipes.
- The user's saved foods are listed below as "#id | name | numbers per amount". If an item clearly IS one of them, set matchId to that id and amount to how much was eaten in that food's unit (grams for "per 100 g", ml for "per 100 ml", servings for "per 1 serving"). Then still fill the other fields with your best values, including eatenGrams (the TOTAL grams or ml eaten).
- Otherwise matchId = 0 and amount = 0. Give eatenGrams = the TOTAL weight eaten in grams (TOTAL ml for drinks), and kcal/protein/carbs/fat for that WHOLE eaten amount (e.g. "300ml milk" -> eatenGrams 300 and the kcal of all 300 ml). servingLabel = ONE countable unit (e.g. "1 egg", "1 medium plate", "1 glass") and gramsPerServing = the weight of ONE such unit, or 0 if it is not countable (e.g. rice by weight).
- servingLabel is always "1 <thing>", e.g. "1 banana", "1 egg", "1 medium plate".
- statedWeight: true if the user wrote this item's amount as a weight or volume (g, kg, ml, L, e.g. "120g banana"), else false.
- liquid: true for drinks and soups you measure in ml.
- name: short, clear, in English. mealName: a short name for the whole meal (e.g. "Koshary lunch").
- confidence per item: "high" for branded/known items, "medium" for typical dishes, "low" for vague ones.
- note per item: one short line on what you assumed, or "".`

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

const RULES_PHOTO = `Look at this photo from a gym-goer in Egypt who wants to log what they ate.
First decide what it shows:
- kind "label": a nutrition facts panel (English and/or Arabic). Fill "label" and leave items empty.
- kind "food": food or drink (a fruit, a plate, a meal, a packaged product without a readable label). Fill mealName and items, label = null.
- kind "none": no food, drink or nutrition label (or too blurry to tell). label = null, items empty, explain in note.
seen: what is in the photo in a few plain words, e.g. "A banana", "Koshary with a Pepsi", "Nutrition label, Juhayna yogurt".
For a label:
- Copy the numbers EXACTLY as printed. Do not pad or round them.
- Prefer the "per 100 g" (or per 100 ml) column. If only "per serving" exists, convert to per 100 g using the serving size in grams; if the serving size in grams is unknown, return values per serving instead.
- kcal: use kcal, not kJ. If only kJ is printed, divide by 4.184. "Carbohydrate" means total carbs.
- servingGrams: the serving size in g or ml if printed, else null. name: the product name if visible, else a short description.
- confidence: "high" if the label is clear, "medium" if some numbers were hard to read, "low" if guessed.
For food:
- Split it into the separate things you can see (a banana = 1 item; chicken, rice and salad = 3 items; a sandwich or a plate of koshary = 1 item).
- Judge each portion from the photo (plate size, pieces you can count). Be realistic, not padded; assume normal Egyptian portions.
- Home cooking and restaurant food: include the cooking oil, butter, ghee or sauce it is normally made with.
- The user's saved foods are listed below as "#id | name | numbers per amount". If an item clearly IS one of them, set matchId to that id and amount to how much is shown in that food's unit (grams for "per 100 g", ml for "per 100 ml", servings for "per 1 serving"). Otherwise matchId = 0 and amount = 0.
- eatenGrams = the TOTAL weight shown in grams (TOTAL ml for drinks); kcal/protein/carbs/fat for that WHOLE amount.
- servingLabel is always "1 <thing>" (e.g. "1 banana", "1 medium plate") and gramsPerServing = the weight of ONE such unit, or 0 if not countable.
- statedWeight: false. liquid: true for drinks and soups. name: short, clear, in English. mealName: a short name for the whole meal.
- confidence per item: "high" for branded/known items, "medium" for typical dishes, "low" if hard to see. note per item: one short line on what you assumed, or "".`

const PHOTO_ITEM = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    kcal: { type: 'NUMBER' },
    eatenGrams: { type: 'NUMBER' },
    matchId: { type: 'INTEGER' },
    amount: { type: 'NUMBER' },
    servingLabel: { type: 'STRING' },
    gramsPerServing: { type: 'NUMBER' },
    liquid: { type: 'BOOLEAN' },
    statedWeight: { type: 'BOOLEAN' },
    protein: { type: 'NUMBER' },
    carbs: { type: 'NUMBER' },
    fat: { type: 'NUMBER' },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    note: { type: 'STRING' },
  },
  required: ['name', 'kcal', 'eatenGrams', 'matchId', 'amount', 'servingLabel', 'gramsPerServing', 'liquid', 'statedWeight', 'protein', 'carbs', 'fat', 'confidence', 'note'],
  propertyOrdering: ['name', 'kcal', 'eatenGrams', 'matchId', 'amount', 'servingLabel', 'gramsPerServing', 'liquid', 'statedWeight', 'protein', 'carbs', 'fat', 'confidence', 'note'],
}

// Field order matters: kind and seen come first so the app can show them while the rest is still being written.
const PHOTO_SCHEMA = {
  type: 'OBJECT',
  properties: {
    kind: { type: 'STRING', enum: ['label', 'food', 'none'] },
    seen: { type: 'STRING' },
    label: { ...LABEL_SCHEMA, nullable: true, propertyOrdering: ['name', 'basis', 'servingGrams', 'kcal', 'protein', 'carbs', 'fat', 'confidence', 'note'] },
    mealName: { type: 'STRING' },
    items: { type: 'ARRAY', items: PHOTO_ITEM },
    note: { type: 'STRING' },
  },
  required: ['kind', 'seen', 'mealName', 'items', 'note'],
  propertyOrdering: ['kind', 'seen', 'label', 'mealName', 'items', 'note'],
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

const MEAL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    mealName: { type: 'STRING' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          matchId: { type: 'INTEGER' },
          amount: { type: 'NUMBER' },
          eatenGrams: { type: 'NUMBER' },
          servingLabel: { type: 'STRING' },
          gramsPerServing: { type: 'NUMBER' },
          liquid: { type: 'BOOLEAN' },
          statedWeight: { type: 'BOOLEAN' },
          kcal: { type: 'NUMBER' },
          protein: { type: 'NUMBER' },
          carbs: { type: 'NUMBER' },
          fat: { type: 'NUMBER' },
          confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
          note: { type: 'STRING' },
        },
        required: ['name', 'matchId', 'amount', 'eatenGrams', 'servingLabel', 'gramsPerServing', 'liquid', 'statedWeight', 'kcal', 'protein', 'carbs', 'fat', 'confidence', 'note'],
      },
    },
  },
  required: ['mealName', 'items'],
}

const MAX_FOODS_TEXT = 15_000 // saved-food list sent with meal requests

// Low thinking keeps answers fast (default "medium" took 2+ minutes). Each model gets 25 s before we move on.
const THINKING = { thinkingConfig: { thinkingLevel: 'low' } }
const MODEL_TIMEOUT_MS = 25_000
const TOTAL_BUDGET_MS = 50_000 // the app gives up at 60 s, so always answer before that

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

    if (body.mode === 'photo' && typeof body.image === 'string' && body.image.length < MAX_IMAGE_B64) {
      const foods = typeof body.foods === 'string' ? body.foods.slice(0, MAX_FOODS_TEXT) : ''
      const payload = {
        contents: [{ parts: [{ text: `${RULES_PHOTO}\n\nSaved foods:\n${foods || '(none)'}` }, { inline_data: { mime_type: body.mimeType || 'image/jpeg', data: body.image } }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: PHOTO_SCHEMA, ...THINKING },
      }
      return photoStream(payload, env, { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
    }

    let payload
    if (body.mode === 'text' && typeof body.text === 'string' && body.text.trim()) {
      payload = {
        contents: [{ parts: [{ text: `${RULES_TEXT}\n\nFood: ${body.text.trim().slice(0, 500)}` }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: TEXT_SCHEMA, ...THINKING },
      }
    } else if (body.mode === 'meal' && typeof body.text === 'string' && body.text.trim()) {
      const foods = typeof body.foods === 'string' ? body.foods.slice(0, MAX_FOODS_TEXT) : ''
      payload = {
        contents: [{ parts: [{ text: `${RULES_MEAL}\n\nSaved foods:\n${foods || '(none)'}\n\nMeal: ${body.text.trim().slice(0, 800)}` }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: MEAL_SCHEMA, ...THINKING },
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
    const deadline = Date.now() + TOTAL_BUDGET_MS
    for (const model of env.MODELS.split(',').map((m) => m.trim())) {
      const left = deadline - Date.now()
      if (left < 4_000) break
      const t0 = Date.now()
      const r = await callModel(model, payload, env.GEMINI_API_KEY, Math.min(MODEL_TIMEOUT_MS, left))
      // Status and timing only (never the key or food text), visible with `wrangler tail`.
      console.log(JSON.stringify({ mode: body.mode, model, status: r.status, ms: Date.now() - t0, error: r.error }))
      lastStatus = r.status
      // 429 = free limit used up, 404 = model retired, 5xx/504 = Google hiccup or too slow. Try the next model.
      if (r.status === 429 || r.status === 404 || r.status >= 500) continue
      if (r.status !== 200) return reply(502, { error: `AI error (${r.status}).` })
      const data = r.data
      const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
      const raw = parseJson(text)
      if (!raw) return reply(502, { error: 'AI gave an unreadable answer. Try again.' })
      if (body.mode === 'meal') {
        const meal = fromMeal(raw)
        if (!meal.items.length) return reply(502, { error: 'AI found no food in that. Try describing it differently.' })
        return reply(200, { meal, model })
      }
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

function fromMeal(r) {
  const items = (Array.isArray(r.items) ? r.items : []).slice(0, 15).map((i) => ({
    name: String(i.name ?? 'Food').slice(0, 80),
    matchId: Number.isInteger(i.matchId) && i.matchId > 0 ? i.matchId : 0,
    amount: num(i.amount),
    eatenGrams: num(i.eatenGrams),
    servingLabel: String(i.servingLabel ?? '1 serving').slice(0, 60),
    gramsPerServing: num(i.gramsPerServing) || undefined,
    liquid: i.liquid === true,
    statedWeight: i.statedWeight === true,
    kcal: num(i.kcal), protein: num(i.protein), carbs: num(i.carbs), fat: num(i.fat),
    confidence: conf(i.confidence),
    note: String(i.note ?? '').slice(0, 200),
  }))
  return { name: String(r.mealName ?? 'Meal').slice(0, 80), items }
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

/**
 * Photo mode: streams Gemini's answer and turns it into small progress events for the app, as SSE lines `data: {...}`.
 *   start              the photo reached the Worker and the AI is looking at it
 *   kind  {kind}       label | food | none, as soon as the AI has decided
 *   seen  {text}       what it sees, in a few words
 *   item  {i,name,kcal?} each item (or the label's product) as its name, then its kcal, are written
 *   retry              the model failed part way; the next model starts over (the app clears items)
 *   done  {kind, food | meal | note}   the final answer, same shapes as the label and meal modes
 *   error {error}
 */
function photoStream(payload, env, headers) {
  const { readable, writable } = new TransformStream()
  const out = writable.getWriter()
  const enc = new TextEncoder()
  const send = (e) => out.write(enc.encode(`data: ${JSON.stringify(e)}\n\n`))
  ;(async () => {
    let lastStatus = 0
    const deadline = Date.now() + TOTAL_BUDGET_MS
    try {
      await send({ t: 'start' })
      let tried = false
      for (const model of env.MODELS.split(',').map((m) => m.trim())) {
        const left = deadline - Date.now()
        if (left < 4_000) break
        if (tried) await send({ t: 'retry' })
        tried = true
        const t0 = Date.now()
        const r = await streamModel(model, payload, env.GEMINI_API_KEY, Math.min(MODEL_TIMEOUT_MS, left), deadline, send)
        console.log(JSON.stringify({ mode: 'photo', model, status: r.status, ms: Date.now() - t0, error: r.error }))
        lastStatus = r.status
        if (r.status === 429 || r.status === 404 || r.status >= 500) continue
        if (r.status !== 200) return await send({ t: 'error', error: `AI error (${r.status}).` })
        const raw = parseJson(r.text)
        if (!raw) return await send({ t: 'error', error: 'AI gave an unreadable answer. Try again.' })
        return await send(fromPhoto(raw))
      }
      await send({ t: 'error', error: lastStatus === 429 ? 'Free AI limit reached for today. Add it by hand, or try again tomorrow.' : 'AI is unavailable right now. Try again later.' })
    } catch {
      await send({ t: 'error', error: 'AI is unavailable right now. Try again later.' }).catch(() => {})
    } finally {
      await out.close().catch(() => {})
    }
  })()
  return new Response(readable, { status: 200, headers })
}

function fromPhoto(r) {
  const kind = ['label', 'food', 'none'].includes(r.kind) ? r.kind : 'none'
  const note = String(r.note ?? '').slice(0, 200)
  if (kind === 'label' && r.label) return { t: 'done', kind, food: fromLabel(r.label) }
  if (kind === 'food') {
    const meal = fromMeal(r)
    if (meal.items.length) return { t: 'done', kind, meal }
  }
  return { t: 'done', kind: 'none', note: note || 'No food or nutrition label found in this photo.' }
}

const JSON_STR = '"((?:[^"\\\\]|\\\\.)*)"'
const strField = (src, key) => {
  const m = new RegExp(`"${key}"\\s*:\\s*${JSON_STR}`).exec(src)
  if (!m) return undefined
  try { return JSON.parse(`"${m[1]}"`) } catch { return m[1] }
}

/** Reads the half-written JSON so far and sends only what is new since last time. */
function makeWatcher(send) {
  const sent = { kind: '', seen: '', names: [], kcals: [] }
  return async (text) => {
    if (!sent.kind) {
      const m = /"kind"\s*:\s*"(label|food|none)"/.exec(text)
      if (m) { sent.kind = m[1]; await send({ t: 'kind', kind: m[1] }) }
    }
    if (!sent.seen) {
      const v = strField(text, 'seen')
      if (v) { sent.seen = v; await send({ t: 'seen', text: v.slice(0, 80) }) }
    }
    // Items: each starts at a "name" key inside "items" (or inside "label" for a product name).
    const at = text.indexOf(sent.kind === 'label' ? '"label"' : '"items"')
    if (at < 0) return
    const parts = text.slice(at).split(/(?="name"\s*:)/).slice(1)
    for (let i = 0; i < parts.length && i < 15; i++) {
      const name = strField(parts[i], 'name')
      if (!name) break
      if (sent.names[i] === undefined) { sent.names[i] = name; await send({ t: 'item', i, name: name.slice(0, 40) }) }
      const k = /"kcal"\s*:\s*(\d+(?:\.\d+)?)\s*[,}]/.exec(parts[i])
      if (k && sent.kcals[i] === undefined) { sent.kcals[i] = Number(k[1]); await send({ t: 'item', i, name: name.slice(0, 40), kcal: Math.round(Number(k[1])) }) }
    }
  }
}

/**
 * One streamed Gemini call. `firstMs` = time allowed until the first piece arrives; the whole call must end by `deadline`.
 * Returns { status, text } or { status, error }.
 */
async function streamModel(model, payload, key, firstMs, deadline, send) {
  const ctrl = new AbortController()
  let timer = setTimeout(() => ctrl.abort(), firstMs)
  const watch = makeWatcher(send)
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { status: res.status, error: String(data.error?.message ?? '').slice(0, 300) }
    }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    let text = ''
    let first = true
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      if (first) {
        // Something arrived: from now on only the overall deadline applies.
        first = false
        clearTimeout(timer)
        timer = setTimeout(() => ctrl.abort(), Math.max(1_000, deadline - Date.now()))
      }
      buf += dec.decode(value, { stream: true })
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line.startsWith('data:')) continue
        let chunk
        try { chunk = JSON.parse(line.slice(5)) } catch { continue }
        const parts = chunk.candidates?.[0]?.content?.parts ?? []
        text += parts.filter((p) => !p.thought).map((p) => p.text ?? '').join('')
        await watch(text)
      }
    }
    return text ? { status: 200, text } : { status: 502, error: 'empty stream' }
  } catch {
    return { status: 504, error: 'network or timeout' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * One Gemini call with a HARD time limit covering the whole call (connect + body).
 * Returns { status, data } or { status, error }; 504 = too slow.
 */
async function callModel(model, payload, key, ms) {
  const ctrl = new AbortController()
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => { ctrl.abort(); resolve({ status: 504, error: 'timeout' }) }, ms)
  })
  const call = (async () => {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      })
      const data = await res.json().catch(() => ({}))
      return res.ok ? { status: 200, data } : { status: res.status, error: String(data.error?.message ?? '').slice(0, 300) }
    } catch {
      return { status: 504, error: 'network or timeout' }
    }
  })()
  try { return await Promise.race([call, timeout]) } finally { clearTimeout(timer) }
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
