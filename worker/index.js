// RepFuel AI proxy (Cloudflare Worker).
// Holds the Gemini key so it never reaches the browser. Two jobs:
//   POST { mode: "text",  text }               -> estimate for one described food (kept for older app versions)
//   POST { mode: "meal",  text, foods }        -> the meal split into items; `foods` = the user's saved foods, one per line (kept for older app versions)
//   POST { mode: "search", text, fix?, current?, image?, mimeType? } -> the meal split into items, looked up on the web (Tavily);
//        saved foods are NOT used. With a fix, `image` is an optional photo (a label or the food) that the correction is based on.
//        fix = the user's correction ("it was 3 eggs, no oil"), current = the result as they have it now; only what the fix touches changes.
//   POST { mode: "label", image, mimeType }    -> exact values read from a nutrition-facts photo (kept for older app versions)
//   POST { mode: "photo", image, mimeType, foods } -> STREAMED (text/event-stream): the AI decides if the photo is a label,
//        food, or neither, and the app sees each step live. Events: start, kind, seen, item, retry, done, error (see photoStream).
// Reply: { food: {...}, model } for text/label, { meal: { name, note, items: [...] }, model } for meal and search

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
- Judge each portion from the photo using what is in the frame for scale: a dinner plate is about 26 cm, a fork about 19 cm, a hand about 18 cm, a can 330 ml, a baladi bread about 20 cm. Count pieces where you can. Be realistic, not padded; assume normal Egyptian portions.
- Portion size is the biggest source of error, so in note give the size you assumed (e.g. "about 250 g rice, half a plate").
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

const RULES_PLAN = `A gym-goer in Egypt wants to log what they ate. Write web search queries to find real nutrition facts for it.
- At most 3 queries in total, the item with the most calories first.
- A single restaurant or branded item: use 2 queries for it, its exact name with "calories", and the place with "menu calories" (menu sites like elmenus or talabat often list them).
- Branded products, chains and restaurants: name the brand and item exactly, plus size and "calories", e.g. "Abou Tarek koshary medium calories", "Juhayna full cream milk nutrition facts per 100ml", "Zain el Sham chicken shawarma sandwich calories".
- Egyptian dishes without a brand: the dish name plus "calories per 100g", e.g. "molokhia with chicken calories per 100g".
- Generic foods: aim at nutrition databases, e.g. "boiled egg USDA calories protein per egg", "cooked white rice calories per 100g USDA".
- Packaged products (drinks, bars, yogurt, protein shakes): one query with brand + product + "nutrition facts" + "Egypt", and one with brand + product + "openfoodfacts" (label data).
- If a correction is given: search ONLY for items it adds or renames (or a new size of a restaurant/branded item whose numbers are not already known). If it only changes how many or how much of items already in the current result (e.g. "it was 3 eggs", "half a plate", "300 g not 200 g", "no oil"), return an empty list: the numbers are already known and just need scaling.
- If the correction says the numbers are WRONG (without giving numbers), search again with DIFFERENT words than before: add "Egypt", the bottle or pack size, "nutrition facts label", "per 100ml", or "openfoodfacts".`

const PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: { queries: { type: 'ARRAY', items: { type: 'STRING' } } },
  required: ['queries'],
}

const RULES_SEARCH = `You work out calories and macros for a meal eaten by a gym-goer in Egypt, using LIVE WEB RESULTS (listed below). Accuracy matters more than anything.
Split the meal into its separate items (e.g. "koshary and a pepsi" = 2 items; "chicken, rice and salad" = 3 items). A dish eaten as one thing (a sandwich, a plate of koshary) is ONE item.
For each item:
- Find it in the web results: the exact product, brand, restaurant or dish. Best sources, in order: the brand or restaurant's own page or pack label; nutrition databases (USDA FoodData Central, FatSecret, Nutritionix, MyFitnessPal, CalorieKing); then anything else. Ignore recipe blogs when a database or brand source exists.
- Read the source's basis carefully (per 100 g, per piece, per serving, per cup) and convert to the amount actually eaten.
- Sanity check: kcal should be close to 4 x protein + 4 x carbs + 9 x fat. If a source's numbers don't add up, prefer another source.
- Choosing between sources, always in this order, so the same meal gives the same answer every time: 1) exact product/restaurant AND size match, 2) best source type in the order above, 3) if two equally good sources still disagree, the HIGHER values (safer for calorie counting).
- Named brand or restaurant but no source for THAT brand (only generic numbers): use the generic numbers only as a base, take the HIGH end, and add what that place typically adds (bigger restaurant portions, garlic sauce / toum, tahini, oil, butter, fries inside). Confidence "medium", and note says "No <brand> data, high end of generic".
- source: the short site name you used (e.g. "fdc.nal.usda.gov", "elmenus.com"), or "" if no result matched this item.
- sourceUrl: the exact page URL (from the web results) you took the numbers from, or "".
- sourceType: what kind of source it is: "restaurant" (a restaurant or menu site such as elmenus or talabat), "brand" (the brand's own site or product page), "database" (USDA, FatSecret, Nutritionix, MyFitnessPal, CalorieKing, Open Food Facts...), "label" (a label photo), "user" (numbers the user gave), "estimate" (no matching source), or "other".
- note: one short line saying what you used, e.g. "USDA large boiled egg 78 kcal x 2" or "elmenus: medium box 650 kcal".
- No matching result: estimate at the HIGH end of a realistic range for that portion (safe for calorie counting, still believable), always count the cooking oil, butter, ghee or sauce it is normally made with, confidence at most "medium", and start note with "High-end estimate".
- Assume normal Egyptian portions unless the user gives an amount.
- Products sold in several versions (sizes, countries, or variants such as "Protein Milk" vs "Muscle Milk"): pick the version that best matches the user's words, prefer the one sold in Egypt, and put the exact product and size in name (e.g. "Almarai Protein Milk Chocolate 400 ml") so the user can see which one you used. Mention the other version in note if it is close.
Fields:
- matchId = 0 and amount = 0 always.
- eatenGrams = the TOTAL weight eaten in grams (TOTAL ml for drinks), and kcal/protein/carbs/fat for that WHOLE amount (e.g. "300ml milk" -> eatenGrams 300 and the kcal of all 300 ml).
- servingLabel is always ONE countable unit, "1 <thing>" (e.g. "1 egg", "1 medium plate", "1 sandwich"), and gramsPerServing = the weight of ONE such unit, or 0 if it is not countable (e.g. rice by weight).
- statedWeight: true if the user wrote this item's amount as a weight or volume (g, kg, ml, L), else false. liquid: true for drinks and soups you measure in ml.
- name: short, clear, in English. mealName: a short name for the whole meal.
- confidence: "high" when an exact-match source was used, "medium" for a close match or a typical dish, "low" for vague descriptions.
Corrections:
- If a correction and the current result are given, apply the correction to the current result. Keep every item it does not touch exactly as it is (same name, amount and numbers). Change, add or remove only what the correction says, and look up anything new in the web results.
- If the correction gives numbers (kcal, protein, carbs, fat, size, per 100 ml or per bottle), use them EXACTLY, scaled to the amount eaten, with source "your numbers" and confidence "high". Do not "correct" the user's numbers.
- If a PHOTO is attached to the correction: a nutrition label = copy its numbers EXACTLY (prefer per 100 g/ml, convert kJ to kcal, scale to the amount eaten, use the pack size printed on it when the user didn't say), source "label photo", confidence "high". A photo of the food = use it to judge what and how much was eaten.
- If the correction says the result is wrong without numbers, do NOT repeat the same numbers: use a different matching source or the other product version from the web results, and say in note which one you switched to.`

const SOURCE_TYPES = ['restaurant', 'brand', 'database', 'label', 'user', 'estimate', 'other']

const SEARCH_SCHEMA = {
  ...MEAL_SCHEMA,
  properties: {
    ...MEAL_SCHEMA.properties,
    items: {
      ...MEAL_SCHEMA.properties.items,
      items: {
        ...MEAL_SCHEMA.properties.items.items,
        properties: {
          ...MEAL_SCHEMA.properties.items.items.properties,
          source: { type: 'STRING' },
          sourceUrl: { type: 'STRING' },
          sourceType: { type: 'STRING', enum: SOURCE_TYPES },
        },
        required: [...MEAL_SCHEMA.properties.items.items.required, 'source', 'sourceUrl', 'sourceType'],
      },
    },
  },
}

const MAX_WEB_TEXT = 16_000 // web snippets (with their page links) sent to the model
const MAX_CTX_WEB = 24_000 // all pages read in one search conversation (first search + fixes)
const SEARCH_TIMEOUT_MS = 8_000
// Social media, video and Q&A sites: anyone can post numbers there, so they are never used as a source.
const UNTRUSTED_SITES = ['facebook.com', 'instagram.com', 'tiktok.com', 'youtube.com', 'pinterest.com', 'reddit.com', 'quora.com', 'x.com', 'twitter.com', 'threads.net', 'linkedin.com']

const MAX_FOODS_TEXT = 15_000 // saved-food list sent with meal requests

// Low thinking keeps answers fast (default "medium" took 2+ minutes). Each model gets 25 s before we move on.
const THINKING = { thinkingConfig: { thinkingLevel: 'low' } }

// Claude (opt-in): PROVIDER = "claude" uses Claude with the ANTHROPIC_API_KEY secret. Without it, everything stays on Gemini.
// One model only, no Gemini fallback (user's choice 21/11/2026): when Claude can't answer, the app shows why.
const CLAUDE_MODEL = 'claude-sonnet-5-5'
const CLAUDE_TIMEOUT_MS = 45_000
const CREDITS_MSG = 'AI credits used up for now. Top up or raise the limit in the Anthropic Console, or add it by hand.'
const isClaude = (env) => env.PROVIDER === 'claude'
const modelList = (env) => (isClaude(env) ? [env.CLAUDE_MODEL || CLAUDE_MODEL] : env.MODELS.split(',').map((m) => m.trim()))
const keyFor = (env) => (isClaude(env) ? env.ANTHROPIC_API_KEY : env.GEMINI_API_KEY)
const timeoutFor = (env) => (isClaude(env) ? CLAUDE_TIMEOUT_MS : MODEL_TIMEOUT_MS)
const limitMsg = (env, status) => (isClaude(env)
  ? (status === 429 ? 'AI is busy right now. Try again in a minute.' : 'AI is unavailable right now. Try again later.')
  : (status === 429 ? 'Free AI limit reached for today. Add it by hand, or try again tomorrow.' : 'AI is unavailable right now. Try again later.'))
// Same seed every call: the same words give the same queries and the same answer (15/11: one shake gave 292, then 330).
const SEED = { seed: 7 }
const MODEL_TIMEOUT_MS = 25_000
const TOTAL_BUDGET_MS = 50_000 // the app gives up at 60 s, so always answer before that

/** Labels: kcal should be close to 4 x protein + 4 x carbs + 9 x fat. Fibre and polyols explain small gaps, not big ones. */
const labelOff = (l) => {
  const calc = 4 * num(l.protein) + 4 * num(l.carbs) + 9 * num(l.fat)
  return Math.abs(num(l.kcal) - calc) > Math.max(25, 0.2 * Math.max(num(l.kcal), calc))
}

const RULES_RECHECK = (first) => `A first reading of this nutrition label gave: ${JSON.stringify({ basis: first.basis, servingGrams: first.servingGrams, kcal: first.kcal, protein: first.protein, carbs: first.carbs, fat: first.fat })}.
${labelOff(first) ? `That does not add up: 4 x protein + 4 x carbs + 9 x fat = ${Math.round(4 * num(first.protein) + 4 * num(first.carbs) + 9 * num(first.fat))} kcal, not ${num(first.kcal)}.` : 'It was marked as hard to read.'}
Read the label again from scratch, slowly. Check each number: decimal points and commas (3,6 = 3.6), kJ vs kcal, which column (per 100 g vs per serving), and that you did not take sugars or saturated fat instead of total carbs or total fat.
If the label itself really is printed that way, copy it as printed and say so in note.`

/** Re-reads a label that doesn't add up (or was hard to read) with deeper thinking. Returns the better reading. */
async function recheckLabel(first, image, mimeType, env, deadline) {
  if (!labelOff(first) && first.confidence === 'high') return first
  const payload = {
    contents: [{ parts: [{ text: `${RULES_LABEL}\n\n${RULES_RECHECK(first)}` }, { inline_data: { mime_type: mimeType || 'image/jpeg', data: image } }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: LABEL_SCHEMA, thinkingConfig: { thinkingLevel: 'high' } },
  }
  for (const model of modelList(env).reverse()) {
    const left = deadline - Date.now()
    if (left < 4_000) break
    const t0 = Date.now()
    const r = await callModel(model, payload, keyFor(env), Math.min(timeoutFor(env), left))
    console.log(JSON.stringify({ mode: 'recheck', model, status: r.status, ms: Date.now() - t0, firstOff: labelOff(first) }))
    if (r.status !== 200) continue
    const second = parseJson((r.data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join(''))
    if (!second) break
    if (!labelOff(second)) return second
    // Still doesn't add up after two careful reads: keep it, but say so.
    return { ...second, confidence: 'medium', note: "Calories and macros on this label don't add up. Check them against the pack." }
  }
  return labelOff(first) ? { ...first, confidence: 'low', note: "Calories and macros on this label don't add up. Check them against the pack." } : first
}

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
      return photoStream(payload, env, { image: body.image, mimeType: body.mimeType }, { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
    }

    let payload
    let search = null // search mode: the prepared request plus the sites and pages the AI may name as its source
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
    } else if (body.mode === 'search' && typeof body.text === 'string' && body.text.trim()) {
      // Live steps for apps that ask for them; older app versions get the plain JSON reply below.
      if (body.stream === true) return searchStream(body, env, { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      search = await searchPrep(body, env)
      payload = search.payload
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
    // Search: the fast model first. On the free tier the bigger one timed out (25 s) or was "high demand" on every call
    // (Vercel logs 15/11/2026), so it only wasted time; it stays as the fallback.
    const models = modelList(env)
    if (body.mode === 'search') models.reverse()
    for (const model of models) {
      const left = deadline - Date.now()
      if (left < 4_000) break
      const t0 = Date.now()
      const r = await callModel(model, payload, keyFor(env), Math.min(timeoutFor(env), left))
      // Status and timing only (never the key or food text), visible with `wrangler tail`.
      console.log(JSON.stringify({ mode: body.mode, model, status: r.status, ms: Date.now() - t0, error: r.error }))
      lastStatus = r.status
      // 429 = free limit used up, 404 = model retired, 5xx/504 = Google hiccup or too slow. Try the next model.
      if (r.status === 402) return reply(402, { error: CREDITS_MSG })
      if (r.status === 429 || r.status === 404 || r.status >= 500) continue
      if (r.status !== 200) return reply(502, { error: `AI error (${r.status}).` })
      const data = r.data
      const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
      const raw = parseJson(text)
      if (!raw) return reply(502, { error: 'AI gave an unreadable answer. Try again.' })
      if (body.mode === 'meal' || body.mode === 'search') {
        const meal = fromMeal(raw)
        if (search) checkSources(meal, search)
        if (!meal.items.length) return reply(502, { error: 'AI found no food in that. Try describing it differently.' })
        return reply(200, { meal, model, ...(search ? { ctx: search.next(text) } : {}) })
      }
      return reply(200, { food: body.mode === 'label' ? fromLabel(await recheckLabel(raw, body.image, body.mimeType, env, deadline)) : fromText(raw), model })
    }
    return reply(503, { error: limitMsg(env, lastStatus) })
  },
}

/** The search conversation the app keeps and sends back with a fix, so the AI continues where it left off. */
function cleanCtx(c) {
  if (!c || typeof c !== 'object' || typeof c.answer !== 'string') return null
  const list = (v, n) => (Array.isArray(v) ? v.map((x) => String(x).slice(0, 400)).slice(0, n) : [])
  return {
    web: String(c.web ?? '').slice(0, MAX_CTX_WEB),
    answer: c.answer.slice(0, 8_000),
    fixes: list(c.fixes, 5).map((f) => f.slice(0, 300)),
    sites: list(c.sites, 80),
    urls: list(c.urls, 80),
  }
}

/**
 * Builds a search request. A first search: rules + meal + web results. A fix that brings the conversation (`ctx`):
 * the first turn with the pages already read, the AI's last answer, then the correction with only the NEW web results,
 * so the AI keeps its sources and reasoning instead of starting over. `on` gets the live steps (plan, read).
 */
async function searchPrep(body, env, on) {
  // Saved foods are NOT used here: tapping Estimate means "look it up", the saved list is already shown above it.
  const text = body.text.trim().slice(0, 800)
  const fix = typeof body.fix === 'string' ? body.fix.trim().slice(0, 500) : ''
  const current = fix && typeof body.current === 'string' ? body.current.slice(0, 3_000) : ''
  // A photo only comes with a correction ("here's the label").
  const image = fix && typeof body.image === 'string' && body.image.length < MAX_IMAGE_B64 ? body.image : ''
  const prev = fix ? cleanCtx(body.ctx) : null
  const photoPart = image ? [{ inline_data: { mime_type: body.mimeType || 'image/jpeg', data: image } }] : []
  const ask = `Meal: ${text}${fix ? `\n\nCurrent result:\n${current || '(see meal)'}\n\nCorrection: ${fix}${image ? ' (photo attached)' : ''}` : ''}`
  // A photo with no other words is a label or the food itself: it has the answer, so skip the web search.
  let web
  if (image && /^\(photo\)$/.test(fix)) {
    web = { text: '', sites: new Set(), urls: new Set() }
    if (on) await on({ t: 'plan', queries: [] })
  } else {
    web = await webLookup(ask, env, on)
  }
  // Sites the AI may name as a source: this search's results, the pages read before, and sources already on screen.
  const sites = new Set([...web.sites, ...(prev?.sites ?? [])])
  for (const m of current.matchAll(/from ([a-z0-9.-]+\.[a-z]{2,})/gi)) sites.add(m[1].toLowerCase())
  const urls = new Set([...web.urls, ...(prev?.urls ?? [])])
  const contents = prev
    ? [
      { role: 'user', parts: [{ text: `${RULES_SEARCH}\n\nMeal: ${text}\n\nWeb results:\n${prev.web || '(none found)'}` }] },
      { role: 'model', parts: [{ text: prev.answer }] },
      { role: 'user', parts: [
        { text: `${prev.fixes.length ? `Earlier corrections (already in your last answer): ${prev.fixes.join(' | ')}\n\n` : ''}The result as it is on the user's screen now (they may have changed amounts by hand since your last answer):\n${current || '(same as your last answer)'}\n\nCorrection: ${fix}${image ? ' (photo attached)' : ''}\n\nNew web results for this correction:\n${web.text || '(no new search needed: use the results above)'}\n\nApply the correction and give the full updated meal in the same JSON shape.` },
        ...photoPart,
      ] },
    ]
    : [{ role: 'user', parts: [{ text: `${RULES_SEARCH}\n\n${ask}\n\nWeb results:\n${web.text || '(none found)'}` }, ...photoPart] }]
  return {
    sites,
    urls,
    payload: {
      contents,
      // Deeper reasoning here: reading sources and converting portions is where accuracy is won or lost.
      generationConfig: { responseMimeType: 'application/json', responseSchema: SEARCH_SCHEMA, thinkingConfig: { thinkingLevel: 'high' }, ...SEED },
    },
    /** The conversation to send back with the next fix: every page read so far and this answer. */
    next: (answer) => ({
      web: (prev ? `${prev.web}${web.text ? `\n${web.text}` : ''}` : web.text).slice(0, MAX_CTX_WEB),
      answer: answer.slice(0, 8_000),
      fixes: prev ? [...prev.fixes, fix].slice(-5) : fix ? [fix] : [],
      sites: [...sites].slice(0, 80),
      urls: [...urls].slice(0, 80),
    }),
  }
}

/**
 * A source the search never returned is made up (seen: "egmenus.com"): drop it, so the item counts as an estimate.
 * A page link is kept only if it was one of the real results. Every item ends with a sourceType the app can show.
 */
function checkSources(meal, { sites, urls }) {
  for (const i of meal.items) {
    if (i.source === 'your numbers') i.sourceType = 'user'
    else if (i.source === 'label photo') i.sourceType = 'label'
    else if (i.source && !knownSite(i.source, sites)) i.source = ''
    if (!i.source) { i.sourceType = 'estimate'; i.sourceUrl = '' }
    if (i.sourceUrl && !urls.has(i.sourceUrl)) i.sourceUrl = ''
    if (!i.sourceType || (i.source && i.sourceType === 'estimate')) i.sourceType = 'other'
  }
}

/**
 * Search with live steps, as SSE lines `data: {...}` (same transport as the photo stream):
 *   start                   the request reached the server
 *   plan  {queries}         what it will search for ([] = no web search needed)
 *   read  {count, sites}    how many results came back, and the top sites
 *   think                   the AI is reading them and working out the numbers
 *   item  {i, name, kcal?}  each item as it is written
 *   retry                   first model failed part way, the next starts over
 *   done  {meal, ctx}       the answer, plus the conversation to send back with a fix
 *   error {error}
 */
function searchStream(body, env, headers) {
  const { readable, writable } = new TransformStream()
  const out = writable.getWriter()
  const enc = new TextEncoder()
  const send = (e) => out.write(enc.encode(`data: ${JSON.stringify(e)}\n\n`))
  ;(async () => {
    let lastStatus = 0
    const deadline = Date.now() + TOTAL_BUDGET_MS
    try {
      await send({ t: 'start' })
      const search = await searchPrep(body, env, send)
      await send({ t: 'think' })
      let tried = false
      // Gemini: fast model first (see the main handler). Claude: one model.
      for (const model of modelList(env).reverse()) {
        const left = deadline - Date.now()
        if (left < 4_000) break
        if (tried) await send({ t: 'retry' })
        tried = true
        const t0 = Date.now()
        const r = await streamModel(model, search.payload, keyFor(env), Math.min(timeoutFor(env), left), deadline, send)
        console.log(JSON.stringify({ mode: 'search-stream', model, status: r.status, ms: Date.now() - t0, error: r.error }))
        lastStatus = r.status
        if (r.status === 402) return await send({ t: 'error', error: CREDITS_MSG })
        if (r.status === 429 || r.status === 404 || r.status >= 500) continue
        if (r.status !== 200) return await send({ t: 'error', error: `AI error (${r.status}).` })
        const raw = parseJson(r.text)
        if (!raw) return await send({ t: 'error', error: 'AI gave an unreadable answer. Try again.' })
        const meal = fromMeal(raw)
        checkSources(meal, search)
        if (!meal.items.length) return await send({ t: 'error', error: 'AI found no food in that. Try describing it differently.' })
        return await send({ t: 'done', meal, model, ctx: search.next(r.text) })
      }
      await send({ t: 'error', error: limitMsg(env, lastStatus) })
    } catch {
      await send({ t: 'error', error: 'AI is unavailable right now. Try again later.' }).catch(() => {})
    } finally {
      await out.close().catch(() => {})
    }
  })()
  return new Response(readable, { status: 200, headers })
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
    source: String(i.source ?? '').slice(0, 60),
    sourceUrl: /^https?:\/\//.test(String(i.sourceUrl ?? '')) ? String(i.sourceUrl).slice(0, 400) : '',
    sourceType: SOURCE_TYPES.includes(i.sourceType) ? i.sourceType : '',
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
 * Web lookup for search mode: a fast model writes up to 3 queries, Tavily runs them in parallel,
 * and the snippets come back as one text block. Any failure just means "no web results" (the estimate still works).
 */
async function webLookup(ask, env, on = async () => {}) {
  const sites = new Set()
  const urls = new Set()
  if (!env.TAVILY_API_KEY) { await on({ t: 'plan', queries: [] }); return { text: '', sites, urls } }
  const t0 = Date.now()
  // Fastest model first: planning is simple and every second counts here.
  let queries = []
  for (const model of modelList(env).reverse()) {
    const r = await callModel(model, {
      contents: [{ parts: [{ text: `${RULES_PLAN}\n\n${ask}` }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: PLAN_SCHEMA, ...THINKING, ...SEED },
    }, keyFor(env), isClaude(env) ? 15_000 : 10_000)
    if (r.status !== 200) continue
    const raw = parseJson((r.data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join(''))
    queries = (Array.isArray(raw?.queries) ? raw.queries : []).map((q) => String(q).trim().slice(0, 200)).filter(Boolean).slice(0, 3)
    break
  }
  await on({ t: 'plan', queries })
  const found = await Promise.all(queries.map((q) => tavily(q, env.TAVILY_API_KEY)))
  // Queries count and timing only (never the food text), visible with `wrangler tail`.
  console.log(JSON.stringify({ mode: 'search', queries: queries.length, results: found.map((f) => f.length), ms: Date.now() - t0 }))
  let out = ''
  found.forEach((results, n) => {
    if (!results.length) return
    out += `Search "${queries[n]}":\n`
    for (const x of results) {
      out += `- [${x.site}] ${x.title} (${x.url}): ${x.content}\n`
      if (x.site) sites.add(x.site.toLowerCase())
      if (x.url) urls.add(x.url)
    }
  })
  const all = found.flat()
  if (queries.length) await on({ t: 'read', count: all.length, sites: [...new Set(all.map((x) => x.site).filter(Boolean))].slice(0, 3) })
  return { text: out.slice(0, MAX_WEB_TEXT), sites, urls }
}

/** True when `source` is one of the sites (or a subdomain / parent of one), ignoring "www." and case. */
function knownSite(source, sites) {
  const s = source.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  for (const x of sites) if (s === x || s.endsWith(`.${x}`) || x.endsWith(`.${s}`)) return true
  return false
}

/** The lines of a web page that carry nutrition numbers (kcal, protein, carbs, fat, serving sizes), up to ~1,200 chars. */
const NUTRITION_WORDS = /(kcal|calor|energy|protein|carb|fat|fiber|sugar|serving|portion|per 100|سعر|بروتين|كربوهيدرات|دهون)/i
function nutritionLines(raw) {
  if (typeof raw !== 'string' || !raw) return ''
  const lines = raw.slice(0, 60_000).split(/\n|(?<=[.;|])\s+/).map((l) => l.replace(/\s+/g, ' ').trim())
  let out = ''
  for (const l of lines) {
    if (l.length < 6 || l.length > 300 || !/\d/.test(l) || !NUTRITION_WORDS.test(l)) continue
    if (out.length + l.length > 1_200) break
    out += ` | ${l}`
  }
  return out ? ` Page numbers:${out}` : ''
}

async function tavily(query, key) {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      // Basic depth = 1 credit. Raw page text is where the actual numbers usually are (snippets often cut them off).
      body: JSON.stringify({ query, search_depth: 'basic', max_results: 4, include_answer: false, include_raw_content: 'text', exclude_domains: UNTRUSTED_SITES }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).map((x) => {
      let site = ''
      try { site = new URL(x.url).hostname.replace(/^www\./, '') } catch { /* keep blank */ }
      const snippet = String(x.content ?? '').replace(/\s+/g, ' ').slice(0, 500)
      return { site, url: String(x.url ?? '').slice(0, 400), title: String(x.title ?? '').slice(0, 120), content: `${snippet}${nutritionLines(x.raw_content)}` }
    // Checked here too, in case the search returns one anyway (seen 21/11/2026: eggs "from facebook.com").
    }).filter((x) => !UNTRUSTED_SITES.some((u) => x.site === u || x.site.endsWith(`.${u}`)))
  } catch {
    return []
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
function photoStream(payload, env, photo, headers) {
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
      for (const model of modelList(env)) {
        const left = deadline - Date.now()
        if (left < 4_000) break
        if (tried) await send({ t: 'retry' })
        tried = true
        const t0 = Date.now()
        const r = await streamModel(model, payload, keyFor(env), Math.min(timeoutFor(env), left), deadline, send)
        console.log(JSON.stringify({ mode: 'photo', model, status: r.status, ms: Date.now() - t0, error: r.error }))
        lastStatus = r.status
        if (r.status === 402) return await send({ t: 'error', error: CREDITS_MSG })
        if (r.status === 429 || r.status === 404 || r.status >= 500) continue
        if (r.status !== 200) return await send({ t: 'error', error: `AI error (${r.status}).` })
        const raw = parseJson(r.text)
        if (!raw) return await send({ t: 'error', error: 'AI gave an unreadable answer. Try again.' })
        if (raw.kind === 'label' && raw.label) {
          await send({ t: 'check' })
          raw.label = await recheckLabel(raw.label, photo.image, photo.mimeType, env, deadline)
        }
        return await send(fromPhoto(raw))
      }
      await send({ t: 'error', error: limitMsg(env, lastStatus) })
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
  if (model.startsWith('claude-')) return streamClaude(model, payload, key, firstMs, deadline, send)
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
  if (model.startsWith('claude-')) return callClaude(model, payload, key, ms)
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

// ---- Claude ----------------------------------------------------------------------------------------------------
// The rest of this file builds Gemini-style payloads. These turn one into a Claude request and the answer back into
// Gemini's shape, so every mode, check and stream event works the same on both.

/** Gemini response schema (OBJECT, STRING, nullable...) -> the JSON Schema Claude's structured outputs take. */
function toJsonSchema(s) {
  const t = String(s.type).toLowerCase()
  let out
  if (t === 'object') {
    out = {
      type: 'object',
      properties: Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toJsonSchema(v)])),
      required: s.required ?? [],
      additionalProperties: false,
    }
  } else if (t === 'array') {
    out = { type: 'array', items: toJsonSchema(s.items) }
  } else {
    out = { type: t }
    if (s.enum) out.enum = s.enum
  }
  return s.nullable ? { anyOf: [out, { type: 'null' }] } : out
}

/** Gemini payload -> Claude Messages request. Gemini's "high" thinking -> effort high, everything else -> low. */
function toClaude(model, payload, stream) {
  const g = payload.generationConfig ?? {}
  // Each Gemini turn -> one Claude message ("model" = Claude's earlier answer). Images go before the text in a turn.
  const messages = (payload.contents ?? []).map((c) => {
    const parts = c.parts ?? []
    const images = parts.filter((p) => p.inline_data).map((p) => ({
      type: 'image', source: { type: 'base64', media_type: p.inline_data.mime_type || 'image/jpeg', data: p.inline_data.data },
    }))
    const texts = parts.filter((p) => p.text).map((p) => ({ type: 'text', text: p.text }))
    return { role: c.role === 'model' ? 'assistant' : 'user', content: [...images, ...texts] }
  })
  return {
    model,
    max_tokens: 16_000,
    ...(stream ? { stream: true } : {}),
    // Server-side fallback: if a safety check wrongly declines a food question, Anthropic retries it on another model.
    fallbacks: 'default',
    output_config: {
      effort: g.thinkingConfig?.thinkingLevel === 'high' ? 'high' : 'low',
      ...(g.responseSchema ? { format: { type: 'json_schema', schema: toJsonSchema(g.responseSchema) } } : {}),
    },
    messages,
  }
}

const claudeHeaders = (key) => ({
  'Content-Type': 'application/json',
  'x-api-key': key ?? '',
  'anthropic-version': '2026-10-21',
  'anthropic-beta': 'server-side-fallback-2026-07-01',
})

/** Claude error -> status the main loop understands. 402 = credits or monthly spend limit used up. */
function claudeFail(status, message) {
  const error = String(message ?? '').slice(0, 300)
  if (/credit balance|billing|usage limit|spend limit|spending limit/i.test(error)) return { status: 402, error }
  return { status, error }
}

/** Token counts only (never the key or food text), visible with `wrangler tail` / Vercel logs. Used to measure cost per food. */
const logUsage = (model, u, ms) => console.log(JSON.stringify({
  claude: model, ms, in: u?.input_tokens ?? 0, out: u?.output_tokens ?? 0,
  cacheRead: u?.cache_read_input_tokens ?? 0, cacheWrite: u?.cache_creation_input_tokens ?? 0,
}))

/** One Claude call with a hard time limit. Same return shape as callModel: { status, data } with data in Gemini's shape. */
async function callClaude(model, payload, key, ms) {
  const t0 = Date.now()
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: claudeHeaders(key),
      body: JSON.stringify(toClaude(model, payload, false)),
      signal: AbortSignal.timeout(ms),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return claudeFail(res.status, data.error?.message)
    logUsage(model, data.usage, Date.now() - t0)
    if (data.stop_reason === 'refusal') return { status: 502, error: 'refusal' }
    const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('')
    return { status: 200, data: { candidates: [{ content: { parts: [{ text }] } }] } }
  } catch {
    return { status: 504, error: 'network or timeout' }
  }
}

/** One streamed Claude call, same contract as streamModel: progress goes to `send` via the watcher, returns { status, text }. */
async function streamClaude(model, payload, key, firstMs, deadline, send) {
  const ctrl = new AbortController()
  let timer = setTimeout(() => ctrl.abort(), firstMs)
  const watch = makeWatcher(send)
  const t0 = Date.now()
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: claudeHeaders(key),
      body: JSON.stringify(toClaude(model, payload, true)),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return claudeFail(res.status, data.error?.message)
    }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    let text = ''
    let first = true
    const usage = {}
    let stop = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      if (first) {
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
        let e
        try { e = JSON.parse(line.slice(5)) } catch { continue }
        if (e.type === 'message_start') Object.assign(usage, e.message?.usage)
        else if (e.type === 'message_delta') { Object.assign(usage, e.usage); stop = e.delta?.stop_reason ?? stop }
        else if (e.type === 'error') return claudeFail(e.error?.type === 'overloaded_error' ? 529 : 502, e.error?.message)
        else if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') {
          text += e.delta.text
          await watch(text)
        }
      }
    }
    logUsage(model, usage, Date.now() - t0)
    if (stop === 'refusal') return { status: 502, error: 'refusal' }
    return text ? { status: 200, text } : { status: 502, error: 'empty stream' }
  } catch {
    return { status: 504, error: 'network or timeout' }
  } finally {
    clearTimeout(timer)
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
