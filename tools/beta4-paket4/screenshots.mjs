// Screenshots für Beta 4, Paket 4 nach docs/beta4-paket4/ (Handy/Tablet): Reiter „Rechner“ – Flächenrechner (L-Form mit Abzug),
// Kubatur (Satteldach), Altersabzug/Restnutzung, Baupreisindex, 24-m²-Check, Ergebnis ins Bauteil übernehmen. Alles läuft über die
// Oberfläche und ist zugleich ein Durchlauf der Bedienung mit Prüfungen. Alle Daten sind erfunden.
// Aufruf: npm run beta4-paket4:screenshots (baut wie npm run e2e nach dist-e2e/, startet vite preview).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import JSZip from 'jszip'

const PORT = 4195
const URL = `http://127.0.0.1:${PORT}/`
const ZIEL = 'docs/beta4-paket4'
const GROESSEN = [
  ['handy', { width: 390, height: 844 }],
  ['tablet', { width: 1180, height: 820 }],
]

function chromiumPfad() {
  const basis = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  const kandidaten = [`${basis}/chromium/chrome-linux/chrome`]
  for (const d of existsSync(basis) ? readdirSync(basis) : []) {
    if (d.startsWith('chromium-')) kandidaten.push(`${basis}/${d}/chrome-linux/chrome`)
  }
  return kandidaten.find((p) => existsSync(p))
}

const bt = (o) => ({ maengel: [], ...o })
const wep = (id, parzelle, extra = {}) => ({
  id,
  rolle: 'bau',
  formalien: {
    kleingartenanlage: 'KGA Musterwiese', parzelle, weg: '', unterpaechter: 'Erika Musterfrau', auftraggeber: '', vertretenDurchRA: '',
    anwesendVerein: '', anwesendUnterpaechter: '', anwesendAuftraggeber: '', wertermittlerBaulichkeiten: 'Max Mustermann',
    wertermittlerAussenAufwuchs: '', wertermittlungAm: '2025-10-14', protokollerstellungAm: '', parzellenflaecheM2: 350, vorgangsNr: id,
  },
  gruen: { beschreibungAussen: '', beschreibungAufwuchs: '', aussenanlagen: [], aufwuchs: [], beseitigungAA: [] },
  ...extra,
})
const BAU = {
  bauteile: [
    bt({ id: 'l1', art: 'laube', kuerzel: 'L', laenge: 5, breite: 4, flaeche: 20, baujahr: 1998, baujahrQuelle: 'lt. Angabe', material: 'holz-doppelwandig', wanddickeCm: 12 }),
    bt({ id: 'a1', art: 'anbau', kuerzel: 'A1', laenge: 4, breite: 2, flaeche: 8, baujahr: 2004, baujahrQuelle: 'geschätzt', material: 'holz-doppelwandig', wanddickeCm: 6 }),
    bt({ id: 'u1', art: 'vorplatz', kuerzel: 'Ü1', flaeche: 6, baujahr: 2004, vorplatzLage: 'integriert', vorplatzGuete: 'ohne', minderungProJahr: 5 }),
    bt({ id: 's1', art: 'schuppen', kuerzel: 'S', laenge: 2, breite: 2.5, flaeche: 5, baujahr: 2010, material: 'holz-einwandig', wanddickeCm: 3 }),
  ],
  abwasser: { art: 'keine', kanal: {}, grube: {} },
  nichtBeraeumt: { aktiv: false },
  ausstattung: {},
  beschreibung: '',
  beseitigung: [],
}
const WEPS = [wep('2026-001', 'Parzelle 42', { bau: BAU })]

const speichern = (seite, weps) =>
  seite.evaluate(
    (weps) =>
      new Promise((ok, fehler) => {
        const a = indexedDB.open('wep-db')
        a.onerror = fehler
        a.onsuccess = () => {
          const tx = a.result.transaction(['weps', 'syncMeta'], 'readwrite')
          for (const w of weps) {
            tx.objectStore('weps').put(w)
            tx.objectStore('syncMeta').put({ id: w.id, lokalGeaendertAm: '2026-10-20T08:00:00.000Z' })
          }
          tx.oncomplete = ok
          tx.onerror = fehler
        }
      }),
    weps,
  )

const pruefe = (bedingung, text) => {
  if (!bedingung) throw new Error(`Prüfung fehlgeschlagen: ${text}`)
  console.log(`  ✓ ${text}`)
}


const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true })
let browser
const fehler = []
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(URL)).ok) break
    } catch {
      /* Server startet noch */
    }
    if (i > 100) throw new Error('vite preview startet nicht')
    await new Promise((r) => setTimeout(r, 200))
  }
  mkdirSync(ZIEL, { recursive: true })
  browser = await chromium.launch({ executablePath: chromiumPfad() })

  for (const [groesse, viewport] of GROESSEN) {
    console.log(groesse)
    const kontext = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block', locale: 'de-DE' })
    const seite = await kontext.newPage()
    seite.on('pageerror', (e) => fehler.push(`${groesse}: ${e.message}`))
    const handy = groesse === 'handy'
    const bild = async (name) => {
      await seite.waitForTimeout(300)
      await seite.screenshot({ path: `${ZIEL}/${groesse}-${name}.png` })
      console.log(`  ${ZIEL}/${groesse}-${name}.png`)
    }
    const nav = handy ? seite.getByRole('navigation', { name: 'Abschnitte' }) : seite.getByLabel('Abschnitte')
    const reiter = (name) => nav.getByRole('button', { name }).first().click()
    const werkzeug = (name) => seite.getByRole('group', { name: 'Rechner wählen' }).getByRole('button', { name }).click()
    await seite.goto(URL)
    await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await seite.evaluate(() => localStorage.setItem('wep-profil', JSON.stringify({ profil: { name: 'Max Mustermann', rolle: 'bau', standardAnlage: 'KGA Musterwiese' } })))
    await speichern(seite, WEPS)
    await seite.reload()
    await seite.getByRole('button', { name: /Parzelle 42/ }).click()
    await reiter('Rechner')
    await seite.getByRole('heading', { name: 'Rechner' }).waitFor()

    // 1. Fläche: L-Form = Rechteck 4 × 3 minus Einschnitt 1 × 2
    await seite.getByRole('button', { name: 'Erstes Rechteck' }).click()
    await seite.getByLabel('Länge (m)').fill('4')
    await seite.getByLabel('Breite (m)').fill('3')
    await seite.getByLabel('Weiteres Teil').selectOption('rechteck')
    await seite.getByLabel('Länge (m)').nth(1).fill('1')
    await seite.getByLabel('Breite (m)').nth(1).fill('2')
    await seite.getByRole('switch', { name: /abgezogen/ }).nth(1).check()
    pruefe((await seite.getByLabel('Fläche gesamt').innerText()).includes('10 m²'), 'L-Form: 12 − 2 = 10 m²')
    await seite.getByLabel('Ergebnis übernehmen in').selectOption({ label: 'A1 · Anbau' })
    await bild('1-flaeche')
    await seite.getByRole('button', { name: /Als Fläche in A1 übernehmen/ }).click()
    pruefe(await seite.getByRole('status').filter({ hasText: 'in A1 übernommen' }).isVisible(), 'Fläche in A1 übernommen')

    // 2. Kubatur: Satteldach 5 × 4, Traufe 2,3, First 3,4 → 57 m³ (wie Skizze Bau)
    await werkzeug('Kubatur')
    await seite.getByLabel('Ergebnis übernehmen in').selectOption({ label: 'L · Laube' })
    await seite.getByLabel('Länge (m)').fill('5')
    await seite.getByLabel('Breite (m)').fill('4')
    await seite.getByRole('group', { name: 'Dachform' }).getByRole('button', { name: 'Satteldach' }).click()
    await seite.getByLabel('Traufhöhe (m)').fill('2,3')
    await seite.getByLabel('Firsthöhe (m)').fill('3,4')
    pruefe((await seite.getByLabel('Rechenweg Kubatur').innerText()).includes('57 m³'), 'Kubatur Satteldach 57 m³')
    await bild('2-kubatur')
    await seite.getByRole('button', { name: /in L übernehmen/ }).click()
    pruefe(await seite.getByRole('status').filter({ hasText: 'in L übernommen' }).isVisible(), 'Kubatur in L übernommen')

    // 3. Altersabzug / Restnutzung der Laube
    await werkzeug('Altersabzug')
    await seite.getByLabel('Ergebnis übernehmen in').selectOption({ label: 'L · Laube' })
    pruefe((await seite.getByLabel('Rechenweg Altersabzug').innerText()).includes('28 Jahre'), 'Alter 2025 − 1998 + 1 = 28 Jahre')
    const vorher = await seite.getByLabel('Rechenweg Altersabzug').innerText()
    await seite.getByLabel('Restnutzungsjahre').fill('12')
    pruefe((await seite.getByLabel('Rechenweg Altersabzug').innerText()) !== vorher, 'eigene Restnutzung ändert den Abzug')
    await seite.getByLabel('Begründung der Restnutzungsdauer').fill('Dach 2019 erneuert')
    await bild('3-altersabzug')
    await seite.getByRole('button', { name: /Angaben in L übernehmen/ }).click()

    // 4. Baupreisindex
    await werkzeug('Baupreisindex')
    await seite.getByLabel('Betrag (€)').fill('1000')
    await seite.getByLabel('aus dem Jahr').fill('2018')
    pruefe((await seite.getByLabel('Umrechnung').innerText()).includes('1.665,43'), '1.000 € von 2018 auf 2025 = 1.665,43 €')
    await bild('4-baupreisindex')

    // 5. 24-m²-Check
    await werkzeug('24-m²-Check')
    pruefe((await seite.getByLabel('Ergebnis 24-m²-Check').innerText()).includes('12 m²'), 'Nicht berechnet: 36 − 24 = 12 m²')
    await bild('5-24m2-check')
    await seite.getByLabel('Zulässige Fläche (m²)').fill('30')
    pruefe((await seite.getByLabel('Ergebnis 24-m²-Check').innerText()).includes('6 m²'), 'bei 30 m² bleiben 6 m² unberücksichtigt')
    await seite.getByRole('button', { name: /30 m² für dieses WEP übernehmen/ }).click()

    // 6. Die übernommenen Werte stehen im Bauteil
    await reiter('Baulichkeiten')
    await seite.getByRole('button', { name: /^A1/ }).click()
    pruefe((await seite.getByLabel('Fläche (m²)').inputValue()) === '10', 'A1 hat die Fläche 10 m²')
    await bild('6-bauteil-uebernommen')
    await seite.getByRole('button', { name: 'Abbrechen' }).first().click()
    await kontext.close()
  }
  if (fehler.length) throw new Error(`Seitenfehler:\n${fehler.join('\n')}`)
  console.log('Alle Prüfungen bestanden.')
} finally {
  await browser?.close()
  try {
    process.kill(-server.pid)
  } catch {
    /* beendet */
  }
}
