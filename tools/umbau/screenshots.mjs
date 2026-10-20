// Screenshots der umgebauten App (Beta 2, Schritt 4, Teil A) für docs/umbau/.
// Aufruf: npm run umbau:screenshots  (baut wie npm run e2e nach dist-e2e/, startet vite preview)
// Testdaten sind erfunden (Erika Musterfrau …). Die Android-Test-Seite wird im Browser mit
// einer nachgebauten Capacitor-Brücke gezeigt (nur für das Bild, nicht in der App).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 4181
const URL = `http://localhost:${PORT}/`
const ZIEL = 'docs/umbau'
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

const pos = (id, katalogId, bezeichnung, anzahl, einheit, zustand, hoechstwert, einzelpreis, preisManuell = false) => ({
  id,
  katalogId,
  bezeichnung,
  anzahl,
  einheit,
  zustand,
  hoechstwert,
  einzelpreis,
  preisManuell,
  hinweise: [],
})

function wep(id, anlage, parzelle, unterpaechter, datum, gruen = {}) {
  return {
    id,
    formalien: {
      kleingartenanlage: anlage,
      parzelle,
      weg: '',
      unterpaechter,
      auftraggeber: '',
      vertretenDurchRA: '',
      anwesendVerein: '',
      anwesendUnterpaechter: '',
      anwesendAuftraggeber: '',
      wertermittlerBaulichkeiten: '',
      wertermittlerAussenAufwuchs: 'Max Mustermann',
      wertermittlungAm: datum,
      protokollerstellungAm: '',
      parzellenflaecheM2: 0,
      vorgangsNr: id,
    },
    gruen: {
      beschreibungAussen: '',
      beschreibungAufwuchs: '',
      aussenanlagen: [],
      aufwuchs: [],
      beseitigungAA: [],
      ...gruen,
    },
  }
}

const WEPS = [
  wep('2026-007', 'KGA Testgarten', 'Parzelle 42', 'Erika Musterfrau', '2026-10-14', {
    beschreibungAufwuchs: 'Gepflegter Obst- und Ziergarten, Rasen mit Wildkräutern, Hecke zum Weg',
    aufwuchs: [
      pos('p1', 'aw-obstgehoelz', 'Apfel, Halbstamm, 5–30 J.', 2, 'Stück', 'gut', 85, 63.75),
      pos('p2', 'aw-obstgehoelz', 'Süßkirsche, Hochstamm, über 30 J.', 1, 'Stück', 'mittel', 170, 85),
      pos('p4', 'aw-hecke', 'Liguster-Hecke (Laub, einfache Art)', 12, 'm', 'sehr gut', 5, 5),
      pos('p5', 'aw-rasen', 'Rasen', 120, 'm²', 'gut', 0.5, 0.38),
      pos('p6', 'aw-rose', 'Rose, Beet-, Edel- und Strauchrose', 3, 'Stück', 'gut', 10, 7.5),
      pos('p7', undefined, 'Zaubernuss (Ziergehölz, wertvollere Art)', 1, 'Stück', 'gut', undefined, 40, true),
    ],
    aussenanlagen: [
      pos('a1', 'aa-wegebelag', 'Wege- und Platzbelag, Steinbelag (inkl. Kantensteine)', 18, 'm²', 'gut', 10, 7.5),
      pos('a2', 'aa-einfriedung', 'Einfriedung, Holzzaun', 22, 'lfdm', 'mittel', 35, 17.5),
      pos('a3', 'aa-hochbeet', 'Hochbeet (mind. 50 cm hoch, nicht gemauert)', 2, 'Stück', 'gut', 100, 75),
      pos('a4', 'aa-kompostanlage', 'Kompostanlage', 1, 'Stück', 'sehr gut', 40, 40),
    ],
    beseitigungAA: [
      { id: 'b1', gegenstand: 'Japanischer Knöterich entfernen', menge: 1, einheit: 'Pauschale', einzelpreis: 180, faktor: 1 },
    ],
  }),
  wep('2026-006', 'KGA Testgarten', 'Parzelle 17', 'Hans Beispiel', '2026-10-09'),
  wep('2026-005', 'KGA Musterau', 'Parzelle 3, Weg B', 'Paula Platzhalter', '2026-10-02'),
  wep('2026-004', 'KGA Testgarten', 'Parzelle 108', 'Otto Normal', '2026-09-25'),
  wep('2026-003', '', '', '', ''),
]

/** Nachgebaute Capacitor-Brücke: „Android“ mit Plugin WepNative (nur für das Bild). */
function androidBruecke() {
  const antworten = {
    liste: {
      eintraege: [
        { name: '2026-007.json', geaendertAm: '2026-10-20T14:31:00Z', eingereihtAm: '2026-10-20T14:31:00Z', blockiert: false, groesse: 5300 },
      ],
    },
    holeProtokoll: {
      eintraege: [
        { zeit: '2026-10-20T13:02:00Z', art: 'lauf', text: 'Worker gestartet (WLAN)' },
        { zeit: '2026-10-20T13:02:04Z', art: 'upload', text: '2026-006.json hochgeladen' },
        { zeit: '2026-10-20T14:31:05Z', art: 'info', text: 'Warten auf WLAN' },
      ],
    },
    netzTyp: { typ: 'Mobilfunk', unmetered: false },
  }
  const methoden = ['liste', 'holeProtokoll', 'netzTyp', 'jetztVersuchen', 'planeUpload', 'holeErgebnisse', 'leseAnmeldung']
  window.CapacitorCustomPlatform = { name: 'android', plugins: {} }
  window.Capacitor = {
    PluginHeaders: [{ name: 'WepNative', methods: methoden.map((name) => ({ name, rtype: 'promise' })) }],
    nativePromise: (_plugin, methode) => Promise.resolve(antworten[methode] ?? { eintraege: [] }),
    nativeCallback: () => 'x',
  }
}

const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
})
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
    const kontext = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block' })
    const seite = await kontext.newPage()
    const bild = async (name) => {
      await seite.waitForTimeout(150)
      await seite.screenshot({ path: `${ZIEL}/${groesse}-${name}.png` })
      console.log(`${ZIEL}/${groesse}-${name}.png`)
    }

    // Login
    await seite.goto(URL)
    await seite.getByRole('button', { name: 'Mit Microsoft anmelden' }).waitFor()
    await bild('1-login')

    // Testdaten anlegen
    await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await seite.evaluate(
      (weps) =>
        new Promise((ok, fehler) => {
          const anfrage = indexedDB.open('wep-db')
          anfrage.onerror = fehler
          anfrage.onsuccess = () => {
            const tx = anfrage.result.transaction('weps', 'readwrite')
            for (const w of weps) tx.objectStore('weps').put(w)
            tx.oncomplete = ok
            tx.onerror = fehler
          }
        }),
      WEPS,
    )
    await seite.evaluate(() =>
      localStorage.setItem('wep-profil', JSON.stringify({ profil: { name: 'Max Mustermann', rolle: 'gruen', standardAnlage: 'KGA Testgarten' } })),
    )
    await seite.reload()
    await seite.getByRole('button', { name: /Parzelle 42/ }).waitFor()
    await bild('2-liste')

    // Erfassung Aufwuchs
    const abschnitt = (name) =>
      groesse === 'handy'
        ? seite.getByRole('navigation', { name: 'Abschnitte' }).getByRole('button', { name })
        : seite.getByLabel('Abschnitte').getByRole('button', { name: new RegExp(`^${name}`) })
    await seite.getByRole('button', { name: /Parzelle 42/ }).click()
    await abschnitt('Aufwuchs').click()
    await seite.getByRole('heading', { name: 'Aufwuchs' }).waitFor()
    await bild('3-aufwuchs')
    if (groesse === 'handy') {
      await seite.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await bild('3-aufwuchs-unten')
      await seite.evaluate(() => window.scrollTo(0, 0))
    }
    // Hinweise aufgeklappt, Position angetippt
    await seite.getByRole('row', { name: /Rose, Beet/ }).click()
    for (const s of await seite.locator('details.hinweise > summary').filter({ visible: true }).all()) await s.click()
    await seite.getByRole('row', { name: /Rose, Beet/ }).scrollIntoViewIfNeeded()
    await bild('3-aufwuchs-hinweise')

    // Außenanlagen
    await abschnitt(groesse === 'handy' ? 'Außenanlagen' : 'Außenanlagen').click()
    await seite.getByRole('heading', { name: 'Außenanlagen' }).waitFor()
    await bild('4-aussenanlagen')

    // Position hinzufügen
    await abschnitt('Aufwuchs').click()
    await seite.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
    await seite.getByLabel('Katalog durchsuchen').fill('apfel')
    if (groesse === 'handy') await bild('5a-suche')
    await seite.getByRole('button', { name: /Apfel, Halbstamm, 5–30 J\./ }).click()
    await seite.getByLabel('Anzahl').fill('2')
    await seite.getByLabel('Anzahl').blur()
    await bild(groesse === 'handy' ? '5b-formular' : '5-hinzufuegen')
    await seite.getByRole('button', { name: 'Überschreiben' }).click()
    await seite.getByLabel('Einzelpreis').fill('70')
    await bild('5c-ueberschreiben')
    if (groesse === 'handy') await seite.getByRole('button', { name: 'Suche' }).click()
    await seite.getByRole('button', { name: 'Eigene Position (Freitext)' }).click()
    await bild('5d-freitext')
    if (groesse === 'handy') await seite.getByRole('button', { name: 'Suche' }).click()
    await seite.getByRole('button', { name: 'Abbrechen' }).filter({ visible: true }).first().click()

    // Export (Aktion)
    if (groesse === 'handy') await seite.getByRole('button', { name: 'Export', exact: true }).click()
    else await seite.getByRole('button', { name: 'Export als Excel' }).click()
    await seite.getByRole('heading', { name: 'Export als Excel' }).waitFor()
    await bild('6-export')

    // Menü „⋯“ und Rückfrage
    await seite.getByRole('button', { name: 'Weitere Aktionen' }).filter({ visible: true }).click()
    await bild('7a-menue')
    await seite.getByRole('menuitem', { name: /WEP löschen/ }).click()
    await bild('7b-loeschen-rueckfrage')
    await seite.getByRole('button', { name: 'Abbrechen' }).click()

    // Profil
    await seite.getByRole('button', { name: 'Protokolle' }).filter({ visible: true }).first().click()
    await seite.getByRole('button', { name: 'Profil und Einstellungen' }).filter({ visible: true }).click()
    await seite.getByRole('heading', { name: 'Profil und Einstellungen' }).waitFor()
    await bild('8-profil')
    await kontext.close()

    // Android-Test-Seite im Profil (nachgebaute Brücke)
    const android = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block' })
    await android.addInitScript(() => localStorage.setItem('wep-start-wahl', 'ohne-konto'))
    await android.addInitScript(androidBruecke)
    const s2 = await android.newPage()
    await s2.goto(URL)
    await s2.getByRole('button', { name: 'Profil und Einstellungen' }).filter({ visible: true }).click()
    await s2.getByText('Test: Hintergrund-Upload').waitFor()
    await s2.getByText('Test: Hintergrund-Upload').scrollIntoViewIfNeeded()
    await s2.waitForTimeout(300)
    await s2.screenshot({ path: `${ZIEL}/${groesse}-9-android-test.png` })
    console.log(`${ZIEL}/${groesse}-9-android-test.png`)
    await android.close()
  }
} finally {
  await browser?.close()
  server.kill()
}
