import type { FoodCategory, Unit } from './types'

export interface SeedFood {
  seedKey: string
  name: string
  category: FoodCategory
  baseAmount: number
  unit: Unit
  servingLabel?: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  estimate?: boolean
  needsReview?: boolean
  note?: string
}

type Opts = Pick<SeedFood, 'servingLabel' | 'estimate' | 'needsReview' | 'note'>

const f = (
  seedKey: string,
  name: string,
  category: FoodCategory,
  baseAmount: number,
  unit: Unit,
  [kcal, protein, carbs, fat]: [number, number, number, number],
  opts: Opts = {},
): SeedFood => ({ seedKey, name, category, baseAmount, unit, kcal, protein, carbs, fat, ...opts })

/** Bump when the seed list changes; the app adds new seed foods on next launch. */
export const SEED_VERSION = 2

/**
 * Built-in foods taken out of the list because their data was wrong or incomplete.
 * On next launch they're hidden (archived) on phones that already have them, unless the user edited them.
 * Past log entries keep their own macros, so history is unaffected.
 */
export const REMOVED_SEED_KEYS: string[] = ['reef-protein-bread', 'bf-pesto-chicken']

/** Mahmoud's food database (last updated Nov 5, 2026). */
export const SEED_FOODS: SeedFood[] = [
  // Branded / packaged
  f('d-protein-toast', 'D protein toast', 'branded', 1, 'serving', [85, 4.6, 14.2, 1.1], { servingLabel: '1 slice, 30g' }),
  f('juhayna-greek', 'Juhayna Greek yogurt', 'branded', 1, 'serving', [160, 12, 23, 3], { servingLabel: '1 cup' }),
  f('juhayna-zero', 'Juhayna Zero high-protein plain', 'branded', 1, 'serving', [90, 15, 6.5, 0.4], { servingLabel: '180g cup' }),
  f('yopolis-peach', 'Yopolis Greek yogurt, peach', 'branded', 1, 'serving', [93, 11, 13, 0], { servingLabel: '1 cup' }),
  f('almarai-greek', 'Almarai Greek yogurt', 'branded', 1, 'serving', [88, 10.54, 10.54, 0.34], { servingLabel: '170g cup, pink label' }),
  f('real-choco-pops', 'Real Choco Pops', 'branded', 1, 'serving', [120, 8, 18, 1.5]),
  f('cerelac', 'Cerelac', 'branded', 30, 'g', [130, 5.1, 18, 4.2]),
  f('kg-shake-choc', 'KeepGoing chocolate shake (milk)', 'branded', 1, 'serving', [194, 31, 14, 2], { note: 'Default shake' }),
  f('kg-shake-straw', 'KeepGoing strawberry shake', 'branded', 1, 'serving', [189, 33, 11, 2], { servingLabel: '200ml lactose-free low-fat milk + 1 scoop' }),
  f('kg-shake-water', 'KeepGoing shake (water)', 'branded', 1, 'serving', [193, 31, 14, 2], { note: 'Only when specified' }),
  f('kg-bar', 'KeepGoing protein bar', 'branded', 1, 'serving', [232, 19, 22, 8]),
  f('hipro-shake', 'HiPro protein shake', 'branded', 1, 'serving', [187, 20, 18, 4]),
  f('byld-bar', 'BYLD protein bar', 'branded', 1, 'serving', [246, 21, 27, 6]),
  f('lychee-bar', 'Lychee protein bar', 'branded', 1, 'serving', [240, 20, 21, 9]),
  f('fit-bar-choc', 'FIT Bar whey protein bar, chocolate', 'branded', 1, 'serving', [240, 18, 25, 8]),
  f('asn-brownie', 'ASN chocolate brownie', 'branded', 1, 'serving', [270, 16, 39, 6]),
  f('asn-jelly', 'ASN protein jelly', 'branded', 1, 'serving', [72, 18, 0, 0], { servingLabel: '23g serving' }),
  f('apn-whey', 'APN whey protein', 'branded', 1, 'serving', [135, 27, 5, 1], { servingLabel: '1 scoop, 36g' }),
  f('sunshine-tuna', 'Sunshine diet tuna', 'branded', 1, 'serving', [140, 26, 2, 2], { servingLabel: '1 can' }),
  f('domty-mozz', 'Domty light mozzarella', 'branded', 100, 'g', [200, 22, 2, 12]),
  f('dina-cottage', 'Dina Farms cottage cheese', 'branded', 100, 'g', [106, 11, 3, 4]),
  f('richbake-protein-toast', 'Rich Bake protein toast', 'branded', 1, 'serving', [70, 6, 9, 2]),
  f('own-protein-chunk', 'Own protein chunk', 'branded', 1, 'serving', [49, 4, 5, 2]),
  f('tortilla', 'Tortilla bread', 'branded', 1, 'serving', [250, 7, 55, 0.5], { servingLabel: '1 piece, 90g', note: 'Earlier Rich Bake tortilla: 250 / 7P / 53C / 1F' }),
  f('pastirma', 'Pastirma', 'branded', 20, 'g', [45, 5.6, 0.3, 2.5], { estimate: true }),
  f('richbake-pita', 'Rich Bake pita bread', 'branded', 1, 'serving', [116, 3, 26, 0]),
  f('gedy-bread', 'Gedy bread', 'branded', 1, 'serving', [98, 3, 19, 1]),
  f('halo-rice-cake', 'Halo organic rice cake', 'branded', 1, 'serving', [27, 0, 6, 0.2]),
  f('halo-puffs', 'Halo protein puffs', 'branded', 1, 'serving', [160, 8, 21, 5]),
  f('balance-puffs', 'Balance protein puffs', 'branded', 70, 'g', [280, 20.3, 42.8, 3]),
  f('healthy-choc-spread', 'Healthy chocolate spread', 'branded', 15, 'g', [60, 4, 4, 3]),
  f('lakanto-spread', 'Lakanto chocolate hazelnut spread', 'branded', 10, 'g', [43, 1.2, 2, 4.2]),
  f('wonderfit-icecream', 'Wonderfit chocolate ice cream', 'branded', 1, 'serving', [139, 6, 9, 9]),
  f('belgian-icecream', 'Belgian chocolate ice cream, no added sugar', 'branded', 1, 'serving', [86, 7, 8.98, 2.75], { servingLabel: '180ml cup' }),
  f('breadfast-protein-icecream', 'Breadfast chocolate high-protein ice cream', 'branded', 1, 'serving', [453, 20.3, 63.3, 11], { servingLabel: '250ml cup' }),
  f('lamar-milk', 'Lamar 0% fat milk', 'branded', 100, 'ml', [32, 3, 5, 0]),
  f('lychee-oj', 'Lychee orange juice', 'branded', 100, 'ml', [40, 1, 8, 0]),
  f('isis-honey', 'ISIS honey', 'branded', 100, 'g', [304, 0, 82, 0]),
  f('sedr-honey', 'Sedr honey', 'branded', 15, 'g', [46, 0, 12.3, 0]),
  f('snickers-wafer', 'Snickers wafer', 'branded', 1, 'serving', [100, 2, 13, 5], { estimate: true }),
  f('mars-wafer-roll', 'Mars Wrigley crispy wafer roll', 'branded', 1, 'serving', [57, 0.8, 7, 3], { servingLabel: '11.25g bar' }),
  f('lychee-granola', 'Lychee chocolate granola', 'branded', 100, 'g', [652, 7, 63, 43]),
  f('edita-rolz', 'Edita Bake Rolz sweet chilli', 'branded', 100, 'g', [451, 12, 67, 15], { note: 'Bag is 50–54g' }),
  f('healthy-bbq', 'Healthy BBQ sauce, zero sugar', 'branded', 20, 'g', [5.3, 0.09, 1.2, 0.01]),
  f('healthy-mayo', 'Healthy Mayo, zero sugar', 'branded', 20, 'g', [68, 0.11, 0.67, 7.2]),
  f('healthy-ketchup', 'Healthy Ketchup, zero added sugar', 'branded', 20, 'g', [5.7, 0.12, 1.28, 0.016]),
  f('breadfast-pound-cake', 'Breadfast vanilla pound cake slice', 'branded', 1, 'serving', [140, 1.8, 17, 7], { servingLabel: '35g slice', estimate: true }),
  f('fava-can', 'Canned fava beans (foul)', 'branded', 1, 'serving', [110, 7, 20, 1], { servingLabel: '130g, ⅓ can', note: 'Full can = 3 servings' }),
  f('frozen-strips-blue', 'Frozen chicken strips, blue bag', 'branded', 100, 'g', [190, 15, 10, 10], { note: 'Frozen weight' }),
  f('crispy-strips-bluewhite', 'Crispy chicken strips, blue/white bag', 'branded', 100, 'g', [196, 17, 2.9, 13]),
  f('breaded-fillets-blue', 'Breaded chicken fillets, blue bag', 'branded', 100, 'g', [253, 12, 12, 12]),
  f('hot-crispy-sp-fries', 'Hot & Crispy sweet potato fries', 'branded', 100, 'g', [163, 2.43, 19.54, 8.45]),

  // Whole foods / home prep
  f('eggs-2-scrambled', '2 baladi eggs, scrambled', 'home', 1, 'serving', [140, 12, 1, 10]),
  f('eggs-3-boiled', '3 baladi eggs, boiled', 'home', 1, 'serving', [203, 17, 1, 14]),
  f('basmati-rice', 'Basmati rice, cooked', 'home', 150, 'g', [240, 4, 45, 5]),
  f('egyptian-rice', 'Egyptian rice, cooked', 'home', 160, 'g', [275, 4.5, 52, 5], { estimate: true }),
  f('vermicelli-rice', 'Vermicelli rice, cooked', 'home', 200, 'g', [340, 6, 62, 7], { estimate: true }),
  f('airfried-potatoes', 'Air-fried potatoes', 'home', 150, 'g', [136, 3, 27, 3]),
  f('potatoes-batch', 'Potatoes batch', 'home', 100, 'g', [237, 5, 43, 5]),
  f('olive-oil', 'Extra virgin olive oil', 'home', 2.5, 'ml', [22, 0, 0, 2.5]),
  f('olive-oil-spray', 'Olive oil spray', 'home', 1, 'spray', [2.2, 0, 0, 0.25], { note: '10 sprays = 2.5ml' }),
  f('ghee', 'Ghee', 'home', 10, 'g', [90, 0, 0, 10]),
  f('dates-3', 'Dates (3 pieces)', 'home', 1, 'serving', [60, 0.5, 18, 0]),
  f('mango', 'Mango', 'home', 1, 'serving', [110, 1.5, 27, 0.5], { servingLabel: '1 fruit, ~180g edible', estimate: true }),
  f('turkey-lobes', 'Turkey lobes', 'home', 50, 'g', [54, 11, 1, 1.5]),
  f('chicken-batch', 'Chicken batch', 'home', 130, 'g', [279, 38, 8, 10]),
  f('nf-nuggets', 'Not-fried chicken nuggets', 'home', 100, 'g', [162, 17, 18, 3]),
  f('nf-strips', 'Not-fried chicken strips', 'home', 100, 'g', [154, 18, 16, 2]),
  f('minced-beef', 'Lean minced beef, cooked', 'home', 100, 'g', [172, 26, 0, 6.7], { estimate: true }),
  f('beef-cubes', 'Lean beef cubes, cooked', 'home', 80, 'g', [150, 22, 0, 6.5], { estimate: true }),
  f('chicken-liver', 'Chicken liver', 'home', 15, 'g', [26, 3.7, 0.2, 1.1], { estimate: true }),
  f('molokheia', 'Molokheia, cooked', 'home', 250, 'g', [190, 9, 13, 11], { estimate: true }),
  f('fasolia', 'Fasolia khadra, cooked', 'home', 160, 'g', [110, 3, 12, 5.5], { estimate: true }),
  f('mahshi-filfil', 'Stuffed green peppers (mahshi)', 'home', 380, 'g', [550, 9.5, 84, 19], { estimate: true }),
  f('pre-workout', 'Pre-workout drink', 'home', 1, 'serving', [63, 0, 17, 0], { servingLabel: '250ml water, 20g honey, lemon, salt, 5g creatine' }),

  // Saved meal combos
  f('breakfast-work', 'Breakfast (work days)', 'combo', 1, 'serving', [415, 37, 52, 9]),
  f('breakfast-weekend', 'Breakfast (weekends)', 'combo', 1, 'serving', [373, 35, 33, 14]),
  f('turkey-omelette-sandwich', 'Turkey omelette sandwich', 'combo', 1, 'serving', [427, 27.8, 31, 22.1], { servingLabel: '2 D toasts, 2 eggs, 30g turkey, 10g light mayo, 6g ghee' }),
  f('turkey-breakfast-sandwich', 'Turkey breakfast sandwich', 'combo', 1, 'serving', [259, 22.4, 30.4, 6.4], { servingLabel: '2 D toasts, 60g turkey, 8g light mayo' }),
  f('cerelac-usual', 'Usual Cerelac portion', 'combo', 1, 'serving', [255, 6.6, 50, 4.7], { servingLabel: '30g Cerelac + 140g banana' }),

  // Restaurant / delivery
  f('bf-spicy-chicken', 'Breadfast spicy chicken sandwich', 'restaurant', 1, 'serving', [505, 37, 48, 18]),
  f('bf-honey-mustard', 'Breadfast honey mustard chicken', 'restaurant', 1, 'serving', [495, 37, 51, 14]),
  f('talabat-tuna', 'Talabat tuna sandwich', 'restaurant', 1, 'serving', [390, 21, 42, 16]),
  f('talabat-honey-mustard', 'Talabat chicken honey mustard sandwich', 'restaurant', 1, 'serving', [420, 28, 48, 12]),
  f('better-bbq-bowl', 'Better BBQ Chicken Taco Bowl', 'restaurant', 1, 'serving', [650, 47, 80, 15]),
  f('katsu-bowl', 'Katsu chicken bowl', 'restaurant', 1, 'serving', [750, 35, 82, 30], { estimate: true }),
  f('mcd-vanilla-shake', "McDonald's medium vanilla milkshake", 'restaurant', 1, 'serving', [422, 13.7, 70.7, 10.7]),
  f('country-hills-cajun', 'Country Hills cajun chicken plate', 'restaurant', 1, 'serving', [1380, 76, 166, 45], { estimate: true, servingLabel: 'Chicken, Texas rice, fries' }),
  f('chicken-tikka-plate', 'Chicken tikka plate', 'restaurant', 1, 'serving', [1360, 121, 94, 54], { estimate: true, servingLabel: 'Whole chicken, skin off, ~280g yellow rice, 25g tomeya' }),
  f('anas-order', 'Anas El Dimashki chicken + rice', 'restaurant', 1, 'serving', [1005, 92, 90, 30], { estimate: true, servingLabel: '300g basmati + half charcoal chicken, meat only' }),
]
