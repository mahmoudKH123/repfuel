import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { deleteWeight, logWeight, saveSettings } from '../db/repo'
import { exportBackup, parseBackup, restoreBackup } from '../db/backup'
import type { DayType, Macros, Settings } from '../db/types'
import { formatDay } from '../logic/dates'
import { weeklyWeights } from '../logic/weight'
import { useSettings } from '../ui/hooks'
import { getPass, setPass } from '../logic/ai'

export function More({ today }: { today: string }) {
  return (
    <section>
      <h1>More</h1>
      <WeightLog today={today} />
      <Targets />
      <AiPanel />
      <BackupPanel />
    </section>
  )
}

function WeightLog({ today }: { today: string }) {
  const settings = useSettings()
  const logs = useLiveQuery(() => db.weights.orderBy('date').reverse().toArray(), []) ?? []
  const [date, setDate] = useState(today)
  const [kg, setKg] = useState('')
  const [error, setError] = useState('')
  const weeks = weeklyWeights(logs, settings.referenceWeightKg).slice(0, 8)

  const save = async () => {
    const v = Number(kg)
    if (!(v > 20 && v < 300)) return setError('Enter your weight in kg, like 74.6.')
    await logWeight(date, Math.round(v * 10) / 10)
    setKg('')
  }

  return (
    <>
      <h2>Weight</h2>
      <form className="row" onSubmit={(e) => { e.preventDefault(); save() }}>
        <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
        <input type="number" inputMode="decimal" step="0.1" placeholder="74.6" value={kg} onChange={(e) => { setKg(e.target.value); setError('') }} aria-label="Weight in kg" />
        <button type="submit" className="primary">Log weight</button>
      </form>
      {error && <p className="warn">{error}</p>}
      {weeks.length > 0 && (
        <ul className="list">
          {weeks.map((w) => (
            <li key={w.weekStart}>
              <span>Week of {formatDay(w.weekStart, { day: 'numeric', month: 'short' })}</span>
              <span className="muted">{w.avgKg} kg avg ({w.count}) · {w.vsReference >= 0 ? '+' : ''}{w.vsReference} vs {settings.referenceWeightKg}</span>
            </li>
          ))}
        </ul>
      )}
      {logs.length > 0 && (
        <details>
          <summary>All weigh-ins</summary>
          <ul className="list">
            {logs.map((l) => (
              <li key={l.date}><span>{formatDay(l.date)} · {l.kg} kg</span><button onClick={() => deleteWeight(l.date)}>Delete</button></li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

function Targets() {
  const settings = useSettings()
  const [saved, setSaved] = useState(false)
  return <TargetsForm key={JSON.stringify(settings)} settings={settings} saved={saved} setSaved={setSaved} />
}

function TargetsForm({ settings, saved, setSaved }: { settings: Settings; saved: boolean; setSaved: (v: boolean) => void }) {
  const [draft, setDraft] = useState<Settings>(settings)

  const setT = (type: DayType, k: keyof Macros, v: string) => {
    setDraft({ ...draft, targets: { ...draft.targets, [type]: { ...draft.targets[type], [k]: Number(v) } } })
    setSaved(false)
  }
  const valid = (['training', 'rest'] as const).every((t) => Object.values(draft.targets[t]).every((v) => v >= 0)) && draft.referenceWeightKg > 0

  return (
    <>
      <h2>Targets</h2>
      <form onSubmit={async (e) => { e.preventDefault(); if (valid) { await saveSettings(draft); setSaved(true) } }}>
        {(['training', 'rest'] as const).map((t) => (
          <fieldset key={t}>
            <legend>{t === 'training' ? 'Training day' : 'Rest day'}</legend>
            <div className="grid4">
              {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
                <label key={k}>{k === 'kcal' ? 'kcal' : k[0].toUpperCase() + k.slice(1)}
                  <input type="number" inputMode="decimal" min="0" value={draft.targets[t][k]} onChange={(e) => setT(t, k, e.target.value)} />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <label>Reference weight (kg)
          <input type="number" inputMode="decimal" step="0.1" value={draft.referenceWeightKg} onChange={(e) => { setDraft({ ...draft, referenceWeightKg: Number(e.target.value) }); setSaved(false) }} />
        </label>
        <p className="muted">Sunday and Friday are rest days by default. Switch any day on the Week tab.</p>
        {!valid && <p className="warn">Targets must be 0 or more.</p>}
        <button type="submit" className="primary">Save targets</button>
        {saved && <span className="muted" role="status"> Targets saved</span>}
      </form>
    </>
  )
}

function BackupPanel() {
  const [msg, setMsg] = useState('')
  const [persisted, setPersisted] = useState<boolean | null>(null)
  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null)) }, [])

  const doExport = async () => {
    const data = await exportBackup()
    const name = `repfuel-backup-${new Date().toISOString().slice(0, 10)}.json`
    const file = new File([JSON.stringify(data)], name, { type: 'application/json' })
    // On iPhone the share sheet lets you save straight to Files or iCloud Drive.
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'RepFuel backup' }); setMsg('Backup exported'); return } catch { /* cancelled */ return }
    }
    const url = URL.createObjectURL(file)
    const a = Object.assign(document.createElement('a'), { href: url, download: name })
    a.click()
    URL.revokeObjectURL(url)
    setMsg('Backup exported')
  }

  const doImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const backup = parseBackup(await file.text())
      if (!window.confirm(`Replace everything in RepFuel with the backup from ${backup.exportedAt.slice(0, 10)}? This can't be undone.`)) return
      await restoreBackup(backup)
      setMsg(`Backup imported: ${backup.entries.length} logged items, ${backup.foods.length} foods`)
    } catch (err) {
      setMsg((err as Error).message)
    }
  }

  return (
    <>
      <h2>Backup</h2>
      <p className="muted">Your data lives only on this phone. Export a backup to Files or iCloud Drive now and then.</p>
      <div className="row">
        <button onClick={doExport}>Export backup</button>
        <label className="button">Import backup<input type="file" accept="application/json,.json" hidden onChange={(e) => { doImport(e.target.files?.[0]); e.target.value = '' }} /></label>
      </div>
      {msg && <p role="status">{msg}</p>}
      {persisted === false && <p className="muted">Storage isn't locked yet. Add RepFuel to your Home Screen so iOS keeps your data.</p>}
    </>
  )
}

function AiPanel() {
  const [value, setValue] = useState(getPass)
  const [saved, setSaved] = useState(false)
  return (
    <>
      <h2>AI</h2>
      <p className="muted">Passcode for Ask AI and Scan label. Typed once, kept on this phone.</p>
      <form className="row" onSubmit={(e) => { e.preventDefault(); setPass(value.trim()); setSaved(true) }}>
        <input type="password" autoComplete="off" placeholder="AI passcode" value={value} onChange={(e) => { setValue(e.target.value); setSaved(false) }} aria-label="AI passcode" />
        <button type="submit" className="primary">{saved ? 'Saved ✓' : 'Save'}</button>
      </form>
    </>
  )
}
