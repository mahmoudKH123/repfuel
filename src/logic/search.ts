// Flexible food search: words in any order, partial words, small typos.
// "d toast" -> "D protein toast", "yog greek" -> Greek yogurts, "chiken" -> chicken.

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .split(' ')
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean)
}

/** Edit distance with an early exit once it exceeds max. */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      best = Math.min(best, cur[j])
    }
    if (best > max) return false
    prev = cur
  }
  return prev[b.length] <= max
}

/** How well one typed word matches the name's words; 0 = no match. */
function wordScore(token: string, nameWords: string[], joined: string): number {
  let best = 0
  const typos = token.length >= 7 ? 2 : token.length >= 4 ? 1 : 0
  for (const w of nameWords) {
    if (w === token) return 4
    if (w.startsWith(token)) best = Math.max(best, 3)
    else if (typos && (within(token, w, typos) || (w.length > token.length && within(token, w.slice(0, token.length), typos)))) best = Math.max(best, 1.5)
  }
  if (!best && token.length >= 3 && joined.includes(token)) best = 1
  return best
}

/** Score a name against a query; 0 = not a match. */
export function matchScore(query: string, name: string): number {
  const tokens = words(query)
  if (!tokens.length) return 0
  const nameWords = words(name)
  const joined = nameWords.join('')
  let total = 0
  for (const t of tokens) {
    const s = wordScore(t, nameWords, joined)
    if (!s) return 0
    total += s
  }
  // Small bonuses: name starts with the first typed word, and shorter names.
  if (nameWords[0]?.startsWith(tokens[0])) total += 1
  return total + 1 / (nameWords.length + 1)
}

/** True when every typed word matches without a typo (exact, prefix or inside a word). */
function clean(query: string, name: string): boolean {
  const nameWords = words(name)
  const joined = nameWords.join('')
  return words(query).every((t) => nameWords.some((w) => w.startsWith(t)) || (t.length >= 3 && joined.includes(t)))
}

export function searchByName<T extends { name: string }>(items: T[], query: string, limit = 40): T[] {
  const hits = items.map((item) => ({ item, score: matchScore(query, item.name) })).filter((x) => x.score > 0)
  // Typo matches only help when nothing matches properly ("ghee" shouldn't list Greek yogurt).
  const exact = hits.filter((x) => clean(query, x.item.name))
  return (exact.length ? exact : hits)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map((x) => x.item)
}
