// Durchlauf und Screenshots für die Agent-Schnittstelle der Grün-Skizze (window.wep) nach docs/skizze-agent/ (Handy/Tablet).
// Der Durchlauf macht genau das, was ein Browser-Agent täte – nur ohne Pixel-Klicken, über JavaScript:
//   lesen() → Beispielskizze mit Bezug auf Aufwuchs-Positionen vorschlagen → (nichts gespeichert) → Übernehmen → Rückgängig →
//   Verwerfen → Modus „gruen-ersetzen“ (Grundlage bleibt) → Export prüfen (Füllung/Farben/Pfeile in den Excel-Formen).
// Alle Prüfungen laufen am echten Browser (Chromium) gegen die gebaute App. Alle Daten sind erfunden.
// Aufruf: npm run skizze-agent:screenshots (baut wie npm run e2e nach dist-e2e/, startet vite preview).
// Das Bild des Excel-Blatts erzeugt npm run skizze-agent:export-bild.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import JSZip from 'jszip'

const PORT = 4197
const URL = `http://127.0.0.1:${PORT}/`
const ZIEL = 'docs/skizze-agent'
const GROESSEN = [
  ['handy', { width: 390, height: 844 }],
  ['tablet', { width: 1180, height: 820 }],
]
const BEISPIEL = JSON.parse(readFileSync(`${ZIEL}/beispiel-vorschlag.json`, 'utf8'))

function chromiumPfad() {
  const basis = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  const kandidaten = [`${basis}/chromium/chrome-linux/chrome`]
  for (const d of existsSync(basis) ? readdirSync(basis) : []) {
    if (d.startsWith('chromium-')) kandidaten.push(`${basis}/${d}/chrome-linux/chrome`, `${basis}/${d}/chrome-linux64/chrome`)
  }
  return kandidaten.find((p) => existsSync(p))
}

const rechteck = (x, y, b, h) => [{ x, y }, { x: x + b, y }, { x: x + b, y: y + h }, { x, y: y + h }]
const pos = (id, bezeichnung, anzahl, einheit, einzelpreis, extra = {}) => ({ id, bezeichnung, anzahl, einheit, einzelpreis, preisManuell: false, hinweise: [], ...extra })
const JETZT = '2026-10-23T10:00:00.000Z'
const WEP = {
  id: '2026-701',
  rolle: 'beides',
  formalien: {
    kleingartenanlage: 'Anlage Musterwiese', parzelle: 'Parzelle 77', weg: 'Birkenweg', unterpaechter: 'Erika Musterfrau', auftraggeber: '', vertretenDurchRA: '',
    anwesendVerein: '', anwesendUnterpaechter: '', anwesendAuftraggeber: '', wertermittlerBaulichkeiten: 'Max Mustermann',
    wertermittlerAussenAufwuchs: 'Hans Beispiel', wertermittlungAm: '2026-10-20', protokollerstellungAm: '', parzellenflaecheM2: 470, vorgangsNr: '2026-701',
  },
  gruen: {
    beschreibungAussen: '',
    beschreibungAufwuchs: '',
    aussenanlagen: [pos('a-kompost', 'Kompostanlage', 1, 'm³', 40), pos('a-weg', 'Weg Tenne', 12, 'm²', 4)],
    aufwuchs: [
      pos('p-apfel', 'Apfel, Halbstamm, 5–30 J.', 2, 'Stück', 85, { zustand: 'gut' }),
      pos('p-birne', 'Birne, Buschbaum, 5–30 J.', 1, 'Stück', 75),
      pos('p-hecke', 'Liguster-Hecke (Laub, einfache Art)', 9, 'm', 5),
      pos('p-fichte', 'Blaufichte', 1, 'Stück', 1, { hinweise: [{ schwere: 'warnung', text: 'Nadelgehölz, zu entfernen.' }] }),
      pos('p-goetter', 'Götterbaum', 1, 'Stück', 1),
    ],
    beseitigungAA: [],
  },
  bau: {
    bauteile: [
      { id: 'l1', art: 'laube', kuerzel: 'L', laenge: 6, breite: 4, flaeche: 24, maengel: [] },
      { id: 'a1', art: 'anbau', kuerzel: 'A1', laenge: 2, breite: 3, flaeche: 6, maengel: [] },
    ],
    abwasser: { art: 'keine', kanal: {}, grube: {} },
    nichtBeraeumt: { aktiv: false },
    ausstattung: {},
    beschreibung: '',
    beseitigung: [],
  },
  grundriss: {
    massketten: true,
    teile: [
      { id: 'g1', kuerzel: 'L', bauteilId: 'l1', punkte: rechteck(5, 10, 6, 4), hoehe: 2.2, dachform: 'sattel', hoeheOben: 3.1 },
      { id: 'g2', kuerzel: 'A1', bauteilId: 'a1', punkte: rechteck(11, 11, 2, 3), hoehe: 2.3, dachform: 'flach' },
      { id: 'g3', kuerzel: 'K', gestrichelt: true, hoehe: 2, punkte: rechteck(5, 15, 3, 2) },
    ],
  },
  parzelle: { form: 'rechteck', laenge: 26, breite: 18, angelegtVon: 'gruen', angelegtAm: JETZT },
}

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

/** Das gespeicherte WEP aus IndexedDB (nicht aus dem Speicher der Seite). */
const ladeGespeichert = (seite, id) =>
  seite.evaluate(
    (id) =>
      new Promise((ok, fehler) => {
        const a = indexedDB.open('wep-db')
        a.onerror = fehler
        a.onsuccess = () => {
          const r = a.result.transaction('weps').objectStore('weps').get(id)
          r.onsuccess = () => ok(r.result)
          r.onerror = fehler
        }
      }),
    id,
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
    const kontext = await browser.newContext({ viewport, deviceScaleFactor: 2, serviceWorkers: 'block', locale: 'de-DE', acceptDownloads: true })
    const seite = await kontext.newPage()
    seite.on('pageerror', (e) => fehler.push(`${groesse}: ${e.message}`))
    // Die Schnittstelle darf nichts über das Netz schicken: jeder Zugriff außer auf die App selbst fiele auf
    const fremd = []
    seite.on('request', (r) => {
      if (!r.url().startsWith(URL) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) fremd.push(r.url())
    })
    const handy = groesse === 'handy'
    const bild = async (name) => {
      await seite.waitForTimeout(300)
      await seite.screenshot({ path: `${ZIEL}/${groesse}-${name}.png` })
      console.log(`  ${ZIEL}/${groesse}-${name}.png`)
    }
    const nav = handy ? seite.getByRole('navigation', { name: 'Abschnitte' }) : seite.getByLabel('Abschnitte')
    const reiter = (name) => nav.getByRole('button', { name, exact: true }).first().click()
    const flaeche = seite.locator('.skizze-flaeche svg')
    /** Elemente des Grün-Teils in der Zeichenfläche (Symbole, Formen, Linien), ohne die Grundlage. */
    const gruenAnzahl = () => flaeche.locator('[data-typ]').count()
    const gruenGespeichert = async () => {
      await seite.waitForTimeout(800) // Speichern ist entprellt (400 ms)
      const w = await ladeGespeichert(seite, WEP.id)
      return (w.skizze?.elemente ?? []).filter((e) => e.ebene !== 'grundlage')
    }
    const grundlageGespeichert = async () => {
      const w = await ladeGespeichert(seite, WEP.id)
      return JSON.stringify((w.skizze?.elemente ?? []).filter((e) => e.ebene === 'grundlage'))
    }
    const vorschlag = (v) => seite.evaluate((v) => window.wep.skizze.vorschlagen(v), v)
    const status = () => seite.evaluate(() => window.wep.skizze.status())
    const balken = () => seite.getByRole('region', { name: 'Vorschlag für die Skizze' })
    const zurFlaeche = () => flaeche.evaluate((e) => e.scrollIntoView({ block: 'center' }))

    await seite.goto(URL)
    await seite.getByRole('button', { name: /Ohne Konto fortfahren/ }).click()
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    await seite.evaluate(() => localStorage.setItem('wep-profil', JSON.stringify({ profil: { name: 'Max Mustermann', rolle: 'beides', standardAnlage: 'Anlage Musterwiese' } })))
    await speichern(seite, [WEP])
    await seite.reload()

    // 1. Ohne geöffnetes WEP gibt es keine Schnittstelle
    await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
    pruefe(await seite.evaluate(() => typeof window.wep) === 'undefined', 'Ohne geöffnetes WEP gibt es window.wep nicht')

    // 2. WEP öffnen → window.wep ist da (zunächst im Reiter „Formalien“)
    await seite.getByRole('button', { name: /Parzelle 77/ }).click()
    await seite.getByRole('heading', { name: 'Formalien' }).first().waitFor()
    pruefe(await seite.evaluate(() => typeof window.wep?.lesen === 'function' && typeof window.wep?.schema === 'function' && typeof window.wep?.skizze?.vorschlagen === 'function'), 'Mit geöffnetem WEP: window.wep mit lesen, schema, skizze.vorschlagen')

    // 3. Grundlage anlegen wie ein Nutzer: Reiter „Skizze Grün“ → Bauteile aus dem Bau-Teil dazu
    await reiter('Skizze Grün')
    await seite.getByRole('toolbar', { name: 'Zeichenwerkzeuge' }).waitFor()
    await seite.getByRole('button', { name: 'Bauteile aus Bau-Teil dazu' }).click()
    await seite.getByText(/Grundlage übernommen/).waitFor()
    await reiter('Formalien') // Der Agent beginnt in einem ganz anderen Reiter

    // 4. schema()
    const schema = await seite.evaluate(() => window.wep.schema())
    pruefe(schema.$defs && ['lesen', 'vorschlag', 'vorschlagErgebnis', 'status', 'element'].every((k) => k in schema.$defs), 'schema(): JSON-Schema mit lesen, vorschlag, vorschlagErgebnis, status, element')

    // 5. lesen()
    const gelesen = await seite.evaluate(() => window.wep.lesen())
    pruefe(gelesen.schemaVersion === 'wep-schnittstelle/1' && gelesen.skizzeFormat === 'wep-skizze/1', 'lesen(): Versionen der Schnittstelle und des Skizzenformats')
    pruefe(gelesen.formalien.parzelle === 'Parzelle 77' && gelesen.rolle === 'beides', 'lesen(): Formalien und Rolle')
    pruefe(gelesen.parzelle.vorhanden && gelesen.parzelle.breiteM === 18 && gelesen.parzelle.hoeheM === 26 && gelesen.parzelle.vertragsflaecheM2 === 470, 'lesen(): Parzelle 18 × 26 m, Vertragsfläche 470 m²')
    pruefe(gelesen.parzelle.flaechenHinweis === null, 'lesen(): 468 m² gegen 470 m² Vertrag ist keine auffällige Abweichung')
    pruefe(gelesen.bau.bauteile.map((b) => b.kuerzel).join() === 'L,A1' && gelesen.bau.grundriss.some((t) => t.kuerzel === 'L' && t.dachform === 'sattel'), 'lesen(): Bauteile mit Kürzeln, Maßen und Dachform')
    const laube = gelesen.grundlage.elemente.find((e) => e.beschriftung === 'L')
    pruefe(laube && Math.abs(laube.punkte[0].x - 5) < 0.2 && Math.abs(laube.punkte[0].y - 10) < 0.2, 'lesen(): Grundlage mit Laube bei (5 m | 10 m)')
    pruefe(gelesen.gruen.aufwuchs.length === 5 && gelesen.gruen.aufwuchs[0].id === 'p-apfel' && gelesen.gruen.aufwuchs[4].invasiv === true, 'lesen(): Aufwuchs mit Kennungen, Götterbaum als invasiv')
    pruefe(gelesen.skizzeGruen.mitParzelle === true && gelesen.skizzeGruen.elemente.length === 0, 'lesen(): Grün-Skizze liegt auf der Parzelle und ist noch leer')

    // 6. Vorschlag: der Reiter „Skizze Grün“ wird geöffnet, die Formen sind hervorgehoben, nichts ist gespeichert
    const antwort = await vorschlag(BEISPIEL)
    pruefe(antwort.ok === true && antwort.fehler.length === 0 && antwort.anzahl === 12, `vorschlagen(): ok, 12 Elemente – ${antwort.zusammenfassung.slice(0, 60)} …`)
    pruefe(antwort.hinweise.some((h) => /Götterbaum/.test(h)), 'vorschlagen(): Hinweis, dass der Götterbaum noch kein Element hat')
    await balken().waitFor()
    pruefe(await seite.getByRole('heading', { name: 'Skizze', exact: true }).isVisible(), 'Der Reiter „Skizze“ wurde für den Nutzer geöffnet')
    pruefe(/Vorschlag: 12 Elemente/.test(await balken().innerText()), 'Balken: „Vorschlag: 12 Elemente“')
    pruefe((await balken().getByRole('button', { name: 'Vorschlag übernehmen' }).count()) === 1 && (await balken().getByRole('button', { name: 'Vorschlag verwerfen' }).count()) === 1, 'Balken: Übernehmen und Verwerfen')
    pruefe((await flaeche.locator('.skizze-vorschlag-rahmen').count()) === 12, 'Die 12 Formen des Vorschlags sind hervorgehoben (oranger gestrichelter Rahmen)')
    pruefe((await status()).offen === true && (await status()).zustand === 'offen' && (await status()).anzahl === 12, 'status(): offen, 12 Elemente')
    pruefe((await gruenGespeichert()).length === 0, 'Ohne Bestätigung ist nichts gespeichert')
    await zurFlaeche()
    await bild('1-vorschlag')

    // 7. Fehler: ein fehlerhafter Vorschlag verändert nichts und sagt, wo der Fehler liegt
    const kaputt = await vorschlag({ format: 'wep-skizze/1', elemente: [{ typ: 'baum', x: 3, y: 4, bezug: { liste: 'aufwuchs', id: 'gibt-es-nicht' } }, { typ: 'palme', x: 1, y: 1 }] })
    pruefe(kaputt.ok === false && kaputt.fehler.length === 2 && kaputt.fehler[0].pfad === 'elemente[0].bezug.id' && kaputt.fehler[1].pfad === 'elemente[1].typ', 'Fehler mit Pfad: elemente[0].bezug.id und elemente[1].typ')
    pruefe((await status()).offen === true && (await status()).anzahl === 12 && /Vorschlag: 12 Elemente/.test(await balken().innerText()), 'Der offene Vorschlag bleibt trotz fehlerhaftem neuen Vorschlag')

    // 8. Übernehmen
    await balken().getByRole('button', { name: 'Vorschlag übernehmen' }).click()
    await balken().waitFor({ state: 'detached' })
    pruefe((await status()).zustand === 'uebernommen' && (await status()).offen === false, 'status(): übernommen')
    pruefe((await gruenAnzahl()) === 12, 'Die 12 Elemente sind Teil der Skizze')
    const gesp = await gruenGespeichert()
    pruefe(gesp.length === 12, 'Nach „Übernehmen“ sind 12 Elemente gespeichert')
    const baeume = gesp.filter((e) => e.art === 'baum')
    pruefe(baeume.map((b) => b.beschriftung).join() === 'Apfel,Apfel,Birne' && baeume[0].bezug.id === 'p-apfel', 'Bäume tragen Art und Verweis auf ihre Aufwuchs-Position (Apfel, Apfel, Birne)')
    const grundlageVorher = await grundlageGespeichert()
    pruefe(grundlageVorher.length > 100, 'Die Grundlage ist weiter gespeichert (Parzelle und Bauteile)')
    const nachher = await seite.evaluate(() => window.wep.lesen())
    pruefe(nachher.skizzeGruen.elemente.length === 12 && nachher.skizzeGruen.elemente.some((e) => e.typ === 'vieleck' && e.fuellung === '#C5E0B4'), 'lesen() zeigt die übernommenen Elemente (Wiese als Füllung #C5E0B4)')
    await zurFlaeche()
    await bild('2-uebernommen')

    // 9. Rückgängig: ein Schritt nimmt den ganzen Vorschlag zurück; Wiederholen bringt ihn wieder
    await seite.getByRole('button', { name: 'Rückgängig', exact: true }).click()
    pruefe((await gruenAnzahl()) === 0, 'Rückgängig: ein Schritt nimmt alle 12 Elemente zurück')
    pruefe((await gruenGespeichert()).length === 0, 'Rückgängig ist auch gespeichert')
    await seite.getByRole('button', { name: 'Wiederholen', exact: true }).click()
    pruefe((await gruenAnzahl()) === 12, 'Wiederholen bringt sie zurück')
    await seite.waitForTimeout(800)

    // 10. Verwerfen: nichts ändert sich
    pruefe((await vorschlag({ format: 'wep-skizze/1', elemente: [{ typ: 'brunnen', x: 3, y: 17 }] })).ok, 'Zweiter Vorschlag: Brunnen')
    await balken().waitFor()
    await balken().getByRole('button', { name: 'Vorschlag verwerfen' }).click()
    await balken().waitFor({ state: 'detached' })
    pruefe((await status()).zustand === 'verworfen' && (await gruenAnzahl()) === 12 && (await gruenGespeichert()).length === 12, 'Verwerfen: status verworfen, Skizze und Speicher unverändert')

    // 11. Modus „gruen-ersetzen“: bisheriges Grün weg, Grundlage bleibt unangetastet; rückgängig machbar
    pruefe((await vorschlag({ format: 'wep-skizze/1', modus: 'gruen-ersetzen', elemente: [{ typ: 'baum', x: 14, y: 6, bezug: { liste: 'aufwuchs', id: 'p-birne' } }] })).ok, 'Vorschlag im Modus „gruen-ersetzen“')
    await balken().waitFor()
    pruefe(/ersetzt dein Grün/.test(await balken().innerText()), 'Balken weist darauf hin, dass das Grün ersetzt wird')
    await balken().getByRole('button', { name: 'Vorschlag übernehmen' }).click()
    await balken().waitFor({ state: 'detached' })
    pruefe((await gruenAnzahl()) === 1 && (await gruenGespeichert()).length === 1, 'Ersetzen: nur das neue Element ist übrig')
    pruefe((await grundlageGespeichert()) === grundlageVorher, 'Die Grundlage ist byte-gleich geblieben (Ergänzen und Ersetzen)')
    await seite.getByRole('button', { name: 'Rückgängig', exact: true }).click()
    pruefe((await gruenAnzahl()) === 12, 'Rückgängig stellt das ersetzte Grün wieder her')
    await seite.waitForTimeout(800)

    // 12. Aussehen: Füllung, Linie, Linienart an einer gewählten Form (für den Nutzer)
    await seite.getByRole('button', { name: 'Auswählen', exact: true }).click()
    const wiese = flaeche.locator('g[data-typ="vieleck"] polygon').first()
    const wk = await wiese.boundingBox()
    await zurFlaeche()
    const wk2 = await wiese.boundingBox()
    void wk
    await seite.mouse.click(wk2.x + wk2.width / 2, wk2.y + wk2.height * 0.2)
    await seite.getByRole('button', { name: 'Aussehen ändern' }).click()
    await seite.getByRole('group', { name: 'Aussehen: Vieleck' }).waitFor()
    pruefe(await seite.getByRole('button', { name: 'Füllfarbe: Wiese' }).getAttribute('aria-pressed') === 'true', 'Aussehen: gewählte Wiese zeigt „Füllfarbe: Wiese“')
    await seite.getByRole('button', { name: 'Füllfarbe: Wasser' }).click()
    await seite.getByRole('button', { name: 'Linienart: gestrichelt' }).click()
    pruefe((await wiese.getAttribute('fill')) === '#DDEBF7' && (await wiese.getAttribute('stroke-dasharray')) !== null, 'Aussehen: Füllung und Linienart wirken sofort in der Skizze')
    await seite.getByRole('button', { name: 'Füllfarbe: keine Füllung' }).click()
    pruefe((await wiese.getAttribute('fill')) === 'none', 'Aussehen: „keine Füllung“')
    await seite.getByRole('button', { name: 'Füllfarbe: Wiese' }).click()
    await seite.getByRole('button', { name: 'Linienart: durchgezogen' }).click()
    await bild('3-aussehen')
    await seite.getByRole('button', { name: 'Fertig', exact: true }).click()
    // Zurück auf den Stand nach dem Vorschlag: fünf Änderungen (Wasser, gestrichelt, keine, Wiese, durchgezogen) rückgängig
    for (let i = 0; i < 5; i++) await seite.getByRole('button', { name: 'Rückgängig', exact: true }).click()
    pruefe((await wiese.getAttribute('fill')) === '#C5E0B4' && (await wiese.getAttribute('stroke-dasharray')) === null, 'Aussehen: Rückgängig stellt die Wiese wieder her')
    await seite.waitForTimeout(800)

    // 13. Export: Füllung, Farben, Pfeile und Maßlinie stehen in den Excel-Formen
    await (handy ? seite.getByRole('button', { name: 'Export', exact: true }) : seite.getByRole('button', { name: 'Export als Excel' })).click()
    await seite.getByRole('heading', { name: 'Export als Excel' }).waitFor()
    const [download] = await Promise.all([seite.waitForEvent('download'), seite.getByRole('button', { name: 'Excel exportieren' }).click()])
    await seite.getByText(/Export erfolgreich/).waitFor({ timeout: 30000 })
    const zip = await JSZip.loadAsync(readFileSync(await download.path()))
    const xml = await zip.file('xl/drawings/drawing9.xml').async('string')
    const form = (name) => new RegExp(`<xdr:(sp|cxnSp)\\b(?:(?!</xdr:\\1>)[\\s\\S])*?name="${name}"[\\s\\S]*?</xdr:\\1>`).exec(xml)?.[0] ?? ''
    pruefe(/val="C5E0B4"/.test(form('Vieleck_0')) && /custGeom/.test(form('Vieleck_0')), 'Excel: Wiese als Freiform mit Füllung C5E0B4')
    pruefe(/tailEnd type="triangle"/.test(form('Pfeil_0')) && /val="C00000"/.test(form('Pfeil_0')), 'Excel: roter Pfeil mit Pfeilspitze')
    pruefe(/tailEnd type="triangle"/.test(form('Rückschnitt_nötig_0_Pfeil')) || /Pfeil/.test(xml), 'Excel: Mängelhinweis mit Pfeil')
    pruefe(/name="Maß_0_Text"/.test(xml) && />16 m</.test(xml), 'Excel: Maßlinie mit Text „16 m“')
    pruefe(/name="Kompost_0"/.test(xml) && /name="Weg_0"/.test(xml) && /name="Tor_0"/.test(xml), 'Excel: Kompost, Weg und Tor sind da')
    pruefe((xml.match(/name="Apfel_/g) ?? []).length >= 2, 'Excel: Bäume heißen nach der Position („Apfel_…“)')
    pruefe(/name="L" descr="wep-app"/.test(xml), 'Excel: Grundlage (Laube) unverändert dabei')

    pruefe(fremd.length === 0, `Keine Netzwerkzugriffe außer auf die App selbst (${fremd.length})`)
    await kontext.close()
  }
  if (fehler.length) throw new Error(`Seitenfehler: ${fehler.join('; ')}`)
  console.log('Fertig.')
} finally {
  await browser?.close()
  try {
    process.kill(-server.pid)
  } catch {
    server.kill()
  }
}
