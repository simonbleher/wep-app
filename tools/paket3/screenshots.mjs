// Screenshots der Änderungen aus Beta 3, Paket 3 (eigene Positionen) für docs/paket3/.
// Aufruf: npm run paket3:screenshots (baut wie npm run e2e nach dist-e2e/, startet vite preview).
// Die Testdaten sind erfunden und werden direkt in IndexedDB bzw. localStorage geschrieben.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 4184
const URL = `http://localhost:${PORT}/`
const ZIEL = 'docs/paket3'
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

const WEP = {
  id: '2026-007',
  formalien: {
    kleingartenanlage: 'KGA Testgarten', parzelle: 'Parzelle 42', weg: '', unterpaechter: 'Erika Musterfrau', auftraggeber: '',
    vertretenDurchRA: '', anwesendVerein: '', anwesendUnterpaechter: '', anwesendAuftraggeber: '', wertermittlerBaulichkeiten: '',
    wertermittlerAussenAufwuchs: 'Max Mustermann', wertermittlungAm: '2026-10-14', protokollerstellungAm: '', parzellenflaecheM2: 0,
    vorgangsNr: '2026-007',
  },
  gruen: { beschreibungAussen: '', beschreibungAufwuchs: '', aussenanlagen: [], aufwuchs: [], beseitigungAA: [] },
}

const T = '2026-10-19T09:00:00.000Z'
const EIGENE = {
  eintraege: [
    { id: 'e1', abschnitt: 'aufwuchs', bezeichnung: 'Rasen', einheit: 'm²', einzelpreis: 0.45, geaendertAm: T },
    { id: 'e2', abschnitt: 'aufwuchs', bezeichnung: 'Zaubernuss', einheit: 'Stück', einzelpreis: 40, geaendertAm: T },
    { id: 'e3', abschnitt: 'aufwuchs', bezeichnung: 'Kräuterspirale, bepflanzt', einheit: 'Pauschale', einzelpreis: 60, geaendertAm: T },
    { id: 'e4', abschnitt: 'aussenanlagen', bezeichnung: 'Hochbeet, Lärchenholz', einheit: 'Stück', einzelpreis: 85, geaendertAm: T },
    { id: 'e5', abschnitt: 'aussenanlagen', bezeichnung: 'Vogeltränke', einheit: 'Stück', geaendertAm: T },
    { id: 'e6', abschnitt: 'aufwuchs', bezeichnung: 'Früher gelöscht', einheit: 'Stück', geloescht: true, geaendertAm: T },
  ],
}

const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
let browser
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(URL)).ok) break
    } catch {
      /* Server startet noch */
    }
    if (i > 50) throw new Error('vite preview startet nicht')
    await new Promise((r) => setTimeout(r, 200))
  }
  mkdirSync(ZIEL, { recursive: true })
  browser = await chromium.launch({ executablePath: chromiumPfad() })

  for (const [groesse, viewport] of GROESSEN) {
    const kontext = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block', locale: 'de-DE' })
    const seite = await kontext.newPage()
    const bild = async (name) => {
      await seite.waitForTimeout(200)
      await seite.screenshot({ path: `${ZIEL}/${groesse}-${name}.png` })
      console.log(`${ZIEL}/${groesse}-${name}.png`)
    }
    const handy = groesse === 'handy'
    const zurSuche = async () => {
      if (handy) await seite.getByRole('button', { name: 'Suche', exact: true }).click()
    }

    await seite.goto(URL)
    await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await seite.evaluate(
      ([wep, eigene]) =>
        new Promise((ok, fehler) => {
          localStorage.setItem('wep-eigene-positionen', JSON.stringify(eigene))
          const anfrage = indexedDB.open('wep-db')
          anfrage.onerror = fehler
          anfrage.onsuccess = () => {
            const tx = anfrage.result.transaction('weps', 'readwrite')
            tx.objectStore('weps').put(wep)
            tx.oncomplete = ok
            tx.onerror = fehler
          }
        }),
      [WEP, EIGENE],
    )
    await seite.reload()
    await seite.getByRole('button', { name: /Parzelle 42/ }).click()
    const abschnitt = (name) =>
      handy
        ? seite.getByRole('navigation', { name: 'Abschnitte' }).getByRole('button', { name })
        : seite.getByLabel('Abschnitte').getByRole('button', { name: new RegExp(`^${name}`) })
    await abschnitt('Aufwuchs').click()
    await seite.getByRole('heading', { name: 'Aufwuchs' }).waitFor()
    await seite.getByRole('button', { name: 'Hinzufügen', exact: true }).click()

    // Ohne Suchbegriff: Zuletzt/häufig, eigene Positionen vor dem Rest
    await seite.getByLabel('Katalog durchsuchen').waitFor()
    await bild('1-suche-liste')

    // „Rasen“: die eigene Position steht vor dem gleich guten Katalogtreffer
    await seite.getByLabel('Katalog durchsuchen').fill('rasen')
    await seite.getByText('Eigene', { exact: true }).first().waitFor()
    await bild('2-suche-rasen-eigene-zuerst')

    // Gemerkte Position wählen: Bezeichnung, Einheit und Preis sind vorbelegt
    await seite.getByLabel('Katalog durchsuchen').fill('zaubernus')
    await seite.getByRole('button', { name: /Zaubernuss.*Eigene/ }).click()
    await seite.getByLabel(/^Bezeichnung/).waitFor()
    await bild('3-gemerkte-position-gewaehlt')

    // Neue Freitext-Position: „Als eigene Position merken“ ist an
    await zurSuche()
    await seite.getByLabel('Katalog durchsuchen').fill('')
    await seite.getByRole('button', { name: 'Eigene Position (Freitext)' }).click()
    await seite.getByLabel(/^Bezeichnung/).fill('Walnussbaum')
    await seite.getByLabel(/^Einzelpreis|Überschreiben/).first().waitFor().catch(() => undefined)
    await seite.getByRole('button', { name: 'Überschreiben' }).click()
    await seite.getByLabel('Einzelpreis').fill('120')
    await seite.getByRole('switch', { name: 'Als eigene Position merken' }).scrollIntoViewIfNeeded()
    await bild('4-freitext-merken')
    await seite.getByRole('button', { name: 'Abbrechen' }).filter({ visible: true }).first().click().catch(() => undefined)

    // Profil: Verwaltung
    await seite.goto(URL)
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await seite.getByRole('button', { name: 'Profil und Einstellungen' }).filter({ visible: true }).click()
    await seite.getByRole('heading', { name: 'Eigene Positionen' }).waitFor()
    await seite.getByRole('heading', { name: 'Eigene Positionen' }).evaluate((h) => {
      h.scrollIntoView()
      window.scrollBy(0, -72) // unter die Kopfzeile
    })
    await bild('5-profil-liste')

    await seite.getByRole('button', { name: 'Zaubernuss ändern' }).click()
    await seite.getByRole('dialog', { name: 'Eigene Position ändern' }).waitFor()
    await bild('6-profil-aendern')
    await seite.getByRole('dialog').getByRole('button', { name: 'Abbrechen' }).click()

    await seite.getByRole('button', { name: 'Vogeltränke löschen' }).click()
    await seite.getByRole('alertdialog').waitFor()
    await bild('7-profil-loeschen-rueckfrage')
    await kontext.close()
  }
} finally {
  await browser?.close()
  server.kill()
}
