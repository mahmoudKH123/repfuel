# RepFuel

Personal macro tracker for iPhone. It runs as an offline web app on the Home Screen. Free, no App Store, no server, and your data never leaves the phone.

## Stack

- React 19 + TypeScript + Vite
- IndexedDB through Dexie, for on-device storage
- vite-plugin-pwa (Workbox) for offline caching and Home Screen install
- Vitest for the tracking logic and database tests
- GitHub Pages hosts the files for free. After the first load, the app works with no connection.

## Project layout

```
src/
  db/
    types.ts        data model (Food, Entry, DayOverride, WeightLog, Settings)
    db.ts           Dexie schema (v1) + first-run seeding
    seedFoods.ts    built-in food list (from the Nov 5, 2026 food database)
    defaults.ts     training / rest targets, rest days, reference weight
    repo.ts         every read/write the screens use
    backup.ts       export / import JSON backups
  logic/            pure functions, no UI or DB: dates, macros, weekly budget, weight
  ui/               hooks + formatting
  screens/          Today, AddFood, Week, Foods, More (functional placeholders, design comes later)
```

## Tracking rules built in

- Week runs Saturday → Friday, with one pooled budget for the week.
- Training day 2,400 / 150P / 315C / 60F. Rest day 2,050 / 150P / 195C / 75F.
- Sunday and Friday are rest days by default, which gives a weekly pool of 16,100 / 1,050P / 1,965C / 450F. Switching a day's type changes the pool.
- Per-day figure for the rest of the week = (pool − eaten before today) ÷ days left including today.
- Logged items store a macro snapshot, so editing a food later never changes past days.
- Deleting a food archives it. Past logs stay intact and the built-in list won't re-add it.
- Fat over target is flagged on the day and on the week.
- Weekly average weight is compared with the reference weight (74.5 kg).

## Data notes

- Reef protein bread is saved as 13 kcal, but its macros add up to about 71. It's marked as needing a check in the app.
- Breadfast pesto chicken: only 522 kcal / 38P were saved. Carbs and fat (50C / 19F) are estimates, and it's also marked for a check.
- These weren't added because no numbers were saved: Talabat BBQ chicken sandwich, Talabat salmon sandwich, and Anas El Damashky grilled boneless chicken + rice (the separate Anas El Dimashki order is included).

## Commands

```bash
npm install        # once
npm run dev        # local dev server
npm test           # unit tests
npm run build      # production build into dist/
```

## Changing the database later

- To change the schema, add `this.version(2).stores({...}).upgrade(...)` in `db.ts`. Never edit version 1.
- To add built-in foods, add them to `seedFoods.ts` and bump `SEED_VERSION`. Existing data is kept.

## Install on iPhone

1. Push to a GitHub repo named `repfuel` and set Settings → Pages → Source to GitHub Actions.
2. Wait for the Deploy workflow to finish, then open `https://<your-username>.github.io/repfuel/` in Safari.
3. Tap Share → Add to Home Screen.
4. Open RepFuel from the Home Screen icon. Always use the icon, because Safari tabs and the Home Screen app keep separate data.

Export a backup from More → Backup now and then and save it to Files or iCloud Drive.
