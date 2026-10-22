// Screenshots für Beta 4, Paket 2 nach docs/beta4-paket2/ (Handy/Tablet): Baulichkeiten mit Bauteilen und Index, Bauteil mit
// Bauklasse-Assistent und Rechenweg, Mängel, Abwasser, Beseitigung Bau, Export, Profil (Baupreisindex). Das leere WEP wird
// dabei über die Oberfläche befüllt (Laube anlegen) – das ist zugleich ein Durchlauf der Bedienung.
// Aufruf: npm run beta4-paket2:screenshots (baut wie npm run e2e nach dist-e2e/, startet vite preview). Alle Daten sind erfunden.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 4193
const URL = `http://127.0.0.1:${PORT}/`
const ZIEL = 'docs/beta4-paket2'
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
    bt({ id: 'l1', art: 'laube', kuerzel: 'L', laenge: 4.5, breite: 4.5, flaeche: 20.25, baujahr: 1998, baujahrQuelle: 'lt. Angabe', material: 'holz-doppelwandig', wanddickeCm: 12,
      maengel: [
        { gruppe: 'dach', maengel: ['Dachoberfläche beschädigt', 'Regenrinne oder Fallrohr nicht fachgerecht'], abzug: 12, begruendung: 'Pappe gerissen, Rinne lose' },
        { gruppe: 'waende', maengel: ['Risse'], abzug: 5, begruendung: 'Risse an der Nordwand' },
      ] }),
    bt({ id: 'a1', art: 'anbau', kuerzel: 'A1', laenge: 1.5, breite: 2.5, flaeche: 3.75, baujahr: 2004, baujahrQuelle: 'geschätzt', material: 'holz-doppelwandig', wanddickeCm: 6, rnManuell: true, restnutzungsjahre: 12, rnBegruendung: 'Dach erneuert' }),
    bt({ id: 'g1', art: 'gewaechshaus', kuerzel: 'GWH', flaeche: 8, hoehe: 2, baujahr: 2018, nhk: 160, minderungProJahr: 5 }),
    bt({ id: 'u1', art: 'vorplatz', kuerzel: 'Ü1', flaeche: 4, baujahr: 2008, vorplatzLage: 'integriert' }),
  ],
  abwasser: { art: 'grube', kanal: {}, grube: { typ: 'kunststoff', inhaltM3: 5, baujahr: 2008, genehmigtAm: '2008-05-02', genehmigungNr: 'G-17', dichtheitAm: '2025-03-12', nichtGeleert: true } },
  nichtBeraeumt: { aktiv: true, m3: 3, preis: 100 },
  ausstattung: { wasser: 'vorhanden', wc: 'trockentoilette', strom: 'fehlt' },
  beschreibung: '',
  beseitigung: [
    { id: 'b1', gegenstand: 'Rückbau Anbau1 s. - Skizze Bau', menge: 9.4, einheit: 'm³', einzelpreis: 150, faktor: 1.5, begruendung: 'lange Wegstrecke' },
    { id: 'b2', gegenstand: 'Schornsteinmauerwerk fachgerecht entsorgen.', menge: 1, einheit: 'Stück', einzelpreis: 250, faktor: 1 },
  ],
}
const WEPS = [wep('2026-001', 'Parzelle 42', { bau: BAU }), wep('2026-002', 'Parzelle 17')]

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
    const kontext = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block', locale: 'de-DE' })
    const seite = await kontext.newPage()
    seite.on('pageerror', (e) => fehler.push(`${groesse}: ${e.message}`))
    const handy = groesse === 'handy'
    const bild = async (name) => {
      await seite.waitForTimeout(300)
      await seite.screenshot({ path: `${ZIEL}/${groesse}-${name}.png` })
      console.log(`${ZIEL}/${groesse}-${name}.png`)
    }
    const nav = handy ? seite.getByRole('navigation', { name: 'Abschnitte' }) : seite.getByLabel('Abschnitte')
    const reiter = (name) => nav.getByRole('button', { name }).first().click()
    const zurListe = () => seite.getByRole('button', { name: 'Protokolle' }).first().click()
    await seite.goto(URL)
    await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await seite.evaluate(() => localStorage.setItem('wep-profil', JSON.stringify({ profil: { name: 'Max Mustermann', rolle: 'bau', standardAnlage: 'KGA Musterwiese', baupreisindex: { 2026: 184.3 } } })))
    await speichern(seite, WEPS)
    await seite.reload()
    await seite.getByRole('button', { name: /Parzelle 17/ }).waitFor()

    // Leeres WEP: Laube über die Oberfläche anlegen
    await seite.getByRole('button', { name: /Parzelle 17/ }).click()
    await reiter('Baulichkeiten')
    await seite.getByText('Noch keine Bauteile').waitFor()
    await bild('0-leer')
    await seite.getByRole('button', { name: 'Laube anlegen' }).click()
    await seite.getByLabel('Länge (m)').fill('4,5')
    await seite.getByLabel('Breite (m)').fill('5')
    await seite.getByLabel('Baujahr', { exact: true }).fill('1998')
    await seite.getByLabel('Material').selectOption('holz-doppelwandig')
    await seite.getByLabel('Wanddicke (cm)').fill('12')
    await seite.getByText('Vorschlag: Bauklasse III.1').waitFor()
    await seite.getByRole('button', { name: 'Hinzufügen' }).click()
    await seite.getByText('L · Laube').waitFor()
    await seite.getByText('22,5 m² · Bauklasse III.1').waitFor()
    await bild('1-laube-angelegt')
    await zurListe()

    // Gefülltes WEP
    await seite.getByRole('button', { name: /Parzelle 42/ }).click()
    await reiter('Baulichkeiten')
    await seite.getByText('Baulichkeiten insgesamt').waitFor()
    await bild('2-baulichkeiten')
    await seite.getByText('Baubeschreibung').first().scrollIntoViewIfNeeded()
    await bild('3-baubeschreibung')
    await seite.getByRole('button', { name: /L · Laube/ }).click()
    await seite.getByText('Vorschlag: Bauklasse III.1').scrollIntoViewIfNeeded()
    await bild('4-bauteil-assistent')
    await seite.getByRole('heading', { name: 'Rechenweg' }).or(seite.getByLabel('Rechenweg')).first().scrollIntoViewIfNeeded()
    await bild('5-bauteil-rechenweg')
    await seite.getByRole('button', { name: 'Abbrechen' }).first().click({ force: true }).catch(() => {})
    await seite.getByText('Baulichkeiten insgesamt').waitFor()
    await reiter('Mängel')
    await seite.getByText('Gesamtabzug L').waitFor()
    await bild('6-maengel')
    await seite.getByText('Fundament (bis 20 %)').scrollIntoViewIfNeeded()
    await bild('7-maengel-gruppen')
    await reiter('Abwasser')
    await seite.getByRole('heading', { name: 'Abwassersammelgrube' }).waitFor()
    await bild('8-abwasser')
    await reiter('Beseitigung')
    await seite.getByText('Summe Beseitigung Bau').waitFor()
    await bild('9-beseitigung-bau')
    await (handy ? seite.getByRole('button', { name: 'Export', exact: true }) : seite.getByRole('button', { name: 'Export als Excel' })).click()
    await seite.getByRole('heading', { name: 'Export als Excel' }).waitFor()
    await seite.getByRole('button', { name: 'Excel exportieren' }).click()
    await seite.getByText(/Export erfolgreich/).waitFor({ timeout: 30000 })
    await bild('10-export')
    await zurListe()
    await seite.getByRole('button', { name: /Profil/ }).first().click()
    await seite.getByRole('heading', { name: 'Baupreisindex (Bau)' }).waitFor()
    await seite.getByRole('heading', { name: 'Baupreisindex (Bau)' }).scrollIntoViewIfNeeded()
    await bild('11-profil-index')
    await kontext.close()
  }
  if (fehler.length) throw new Error(`Skriptfehler im Browser:\n${fehler.join('\n')}`)
} finally {
  await browser?.close()
  try {
    process.kill(-server.pid) // ganze Prozessgruppe: npx und der von ihm gestartete Vorschau-Server
  } catch {
    server.kill()
  }
}
