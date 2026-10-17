// KI-Testlauf für Assistent A (Aufnahmeliste → Katalogpositionen).
//
//   npm run ki-test                      alle Fälle × alle frei nutzbaren Modelle
//   npm run ki-test -- --nur-modelle     nur Modellvorschlag (models.list + Probe)
//   npm run ki-test -- --modelle a,b     feste Modellkette statt Probe
//   npm run ki-test -- --fall text-chaos nur einen Fall
//   npm run ki-test -- --max-modelle 3   nur die besten N Modelle vergleichen
//
// Ergebnis: Tabelle in der Konsole und tools/ki-test/ergebnis.md.
// Rohantworten (zum Nachsehen) in tools/ki-test/ausgaben/ – nicht im Repo.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Katalog, Position as KatalogPosition } from '@/katalog/types'
import { bewerte, type Bewertung, type Erwartet } from './auswertung'
import { docxZuText } from './docx'
import { GeminiClient, GeminiFehler, leseApiKey, type Teil } from './gemini'
import { ermittleKette, type Kandidat } from './modelle'
import { antwortSchema, baueSystemPrompt, type KiAntwort } from './prompt'

const HIER = dirname(fileURLToPath(import.meta.url))
const WURZEL = resolve(HIER, '../..')
const PAUSE_MS = 2000 // Abstand zwischen Anfragen (Minutenlimit im Gratis-Tarif)
const MAX_WARTEN_SEK = 60 // kürzere Sperren abwarten, längere → nächstes Modell

// ---------------------------------------------------------------- Argumente

const argv = process.argv.slice(2)
const arg = (name: string) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const nurModelle = argv.includes('--nur-modelle')
const festeModelle = arg('modelle')?.split(',').map((s) => s.trim()).filter(Boolean)
const nurFall = arg('fall')
const maxModelle = arg('max-modelle') ? Number(arg('max-modelle')) : Infinity

// ---------------------------------------------------------------- Fälle

interface Fall {
  name: string
  teile: Teil[]
  quelle: string
  erwartet: Erwartet
}

/** Grobe Sperre gegen Formalien/Personendaten in Text-Eingaben. */
const FORMALIEN = /(unterp[äa]chter|p[äa]chter|stra(ß|ss)e|str\.|telefon|tel\.|e-?mail|@|vorgangs|rechtsanwalt|geb\.)/i

async function ladeFaelle(): Promise<Fall[]> {
  const ordner = join(HIER, 'faelle')
  const faelle: Fall[] = []
  for (const name of readdirSync(ordner).sort()) {
    if (nurFall && name !== nurFall) continue
    const dir = join(ordner, name)
    if (!existsSync(join(dir, 'erwartet.json'))) continue
    const erwartet = JSON.parse(readFileSync(join(dir, 'erwartet.json'), 'utf8')) as Erwartet
    // Eingabe nur als Text oder Word-Datei (.docx, per mammoth) – kein Foto.
    let text: string
    let quelle: string
    if (existsSync(join(dir, 'eingabe.txt'))) {
      text = readFileSync(join(dir, 'eingabe.txt'), 'utf8')
      quelle = 'Text'
    } else if (existsSync(join(dir, 'eingabe.docx'))) {
      text = await docxZuText(readFileSync(join(dir, 'eingabe.docx')))
      quelle = 'Word'
    } else {
      console.warn(`⚠ Fall ${name}: keine eingabe.txt/.docx`)
      continue
    }
    const treffer = text.match(FORMALIEN)
    if (treffer) {
      console.warn(`⚠ Fall ${name} übersprungen: Eingabe enthält vermutlich Formalien („${treffer[0]}“).`)
      continue
    }
    const teile: Teil[] = [{ text: `Aufnahmeliste:\n\n${text}` }]
    faelle.push({ name, teile, quelle, erwartet })
  }
  return faelle
}

// ---------------------------------------------------------------- Lauf

interface Lauf {
  fall: string
  quelle: string
  modell: string // angefragtes Modell
  antwortVon?: string // tatsächlich antwortendes Modell
  sekunden: number
  vermerke: string[]
  fehler?: string
  bewertung?: Bewertung
  kurzbeschreibung?: string
}

/** JSON.parse mit Toleranz für angehängten Text hinter dem Objekt (kam bei Gemma vor). */
function leseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (e) {
    const start = text.indexOf('{')
    let tiefe = 0
    let inString = false
    for (let i = start; start >= 0 && i < text.length; i++) {
      const c = text[i]
      if (inString) {
        if (c === '\\') i++
        else if (c === '"') inString = false
      } else if (c === '"') inString = true
      else if (c === '{') tiefe++
      else if (c === '}' && --tiefe === 0) return JSON.parse(text.slice(start, i + 1))
    }
    throw e
  }
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fuehreAus(
  client: GeminiClient,
  kette: string[],
  gesperrt: Set<string>,
  startModell: string,
  fall: Fall,
  system: string,
  schema: unknown,
  katalog: Map<string, KatalogPosition>,
): Promise<Lauf> {
  const lauf: Lauf = { fall: fall.name, quelle: fall.quelle, modell: startModell, sekunden: 0, vermerke: [] }
  const reihe = kette.slice(kette.indexOf(startModell))

  for (const modell of reihe) {
    if (gesperrt.has(modell)) {
      if (modell === startModell) lauf.vermerke.push(`${modell} gesperrt (429)`)
      continue
    }
    for (let versuch = 1; versuch <= 2; versuch++) {
      const t0 = performance.now()
      try {
        await pause(PAUSE_MS)
        const antwort = await client.generiereJson(modell, system, fall.teile, schema)
        lauf.sekunden = (performance.now() - t0) / 1000
        lauf.antwortVon = modell
        const json = leseJson(antwort.text) as KiAntwort
        speichereRoh(modell, fall.name, json)
        lauf.bewertung = bewerte(katalog, fall.erwartet, json)
        lauf.kurzbeschreibung = json.kurzbeschreibung
        if (antwort.tokensEin) lauf.vermerke.push(`${antwort.tokensEin}→${antwort.tokensAus ?? '?'} Tokens`)
        return lauf
      } catch (e) {
        lauf.sekunden = (performance.now() - t0) / 1000
        if (e instanceof GeminiFehler && e.status === 429) {
          if (versuch === 1 && !e.keinFreikontingent && (e.wartenSek ?? Infinity) <= MAX_WARTEN_SEK) {
            lauf.vermerke.push(`429 bei ${modell}, ${Math.ceil(e.wartenSek!)} s gewartet`)
            await pause(Math.ceil(e.wartenSek! * 1000) + 500)
            continue
          }
          gesperrt.add(modell)
          lauf.vermerke.push(`429 bei ${modell} → nächstes Modell`)
          break
        }
        if (e instanceof GeminiFehler && e.status >= 500 && versuch === 1) {
          lauf.vermerke.push(`HTTP ${e.status} bei ${modell}, neuer Versuch`)
          await pause(10_000)
          continue
        }
        lauf.antwortVon = modell
        lauf.fehler = e instanceof GeminiFehler ? `HTTP ${e.status}: ${e.message.slice(0, 160)}` : `Antwort unlesbar: ${(e as Error).message.slice(0, 160)}`
        return lauf
      }
    }
  }
  lauf.fehler = 'kein Modell verfügbar (alle 429)'
  return lauf
}

function speichereRoh(modell: string, fall: string, json: unknown) {
  const dir = join(HIER, 'ausgaben', modell)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${fall}.json`), JSON.stringify(json, null, 2) + '\n')
}

// ---------------------------------------------------------------- Bericht

const prozent = (x: number) => `${Math.round(x * 100)} %`
const euro = (x: number) => x.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const quote = (n: number, von: number) => `${n}/${von}`

const KOPF = ['Fall', 'Modell', 'Antwort von', 'Zeit s', 'Ist/Soll', 'Recall', 'Precision', 'ID ok', 'Var. ok', 'Menge ok', 'Zustand ok', 'Σ Ist €', 'Σ Soll €', 'Δ €', 'Δ %', 'unsicher Ist/Soll (getr.)', 'KGN', 'Vermerk']

function zeile(l: Lauf): string[] {
  const b = l.bewertung
  const basis = [l.fall, l.modell, l.antwortVon === l.modell ? '=' : (l.antwortVon ?? '–'), l.sekunden.toFixed(1)]
  if (!b) return [...basis, ...Array(13).fill('–'), l.fehler ?? '']
  const delta = b.summeIst - b.summeSoll
  return [
    ...basis,
    `${b.ist}/${b.soll}`,
    prozent(b.recall),
    prozent(b.precision),
    quote(b.idOk, b.treffer),
    quote(b.varianteOk, b.treffer),
    quote(b.anzahlOk, b.treffer),
    quote(b.zustandOk, b.treffer),
    euro(b.summeIst),
    euro(b.summeSoll),
    (delta >= 0 ? '+' : '') + euro(delta),
    b.summeSoll ? `${delta >= 0 ? '+' : ''}${Math.round((delta / b.summeSoll) * 100)} %` : '–',
    `${b.unsicherIst}/${b.unsicherSoll} (${b.unsicherGetroffen})`,
    b.kgnGenannt ? 'ja' : 'nein',
    [...l.vermerke.filter((v) => v.startsWith('429') || v.startsWith('HTTP')), ...b.ungueltig].join('; '),
  ]
}

function konsolenTabelle(kopf: string[], zeilen: string[][]): string {
  const breite = kopf.map((k, i) => Math.max(k.length, ...zeilen.map((z) => (z[i] ?? '').length)))
  const fmt = (z: string[]) => z.map((c, i) => (c ?? '').padEnd(breite[i])).join(' │ ')
  return [fmt(kopf), breite.map((b) => '─'.repeat(b)).join('─┼─'), ...zeilen.map(fmt)].join('\n')
}

function mdTabelle(kopf: string[], zeilen: string[][]): string {
  const esc = (s: string) => s.replace(/\|/g, '\\|')
  return [`| ${kopf.join(' | ')} |`, `|${kopf.map(() => '---').join('|')}|`, ...zeilen.map((z) => `| ${z.map(esc).join(' | ')} |`)].join('\n')
}

function modellUebersicht(laeufe: Lauf[], kette: string[]): string[][] {
  return kette
    .map((m) => {
      const eigene = laeufe.filter((l) => l.modell === m && l.antwortVon === m && l.bewertung)
      if (!eigene.length) return [m, '0', '–', '–', '–', '–', '–', '–']
      const s = (f: (b: Bewertung) => number) => eigene.reduce((a, l) => a + f(l.bewertung!), 0)
      const soll = s((b) => b.soll)
      const treffer = s((b) => b.treffer)
      const ist = s((b) => b.ist)
      const absDelta = s((b) => Math.abs(b.summeIst - b.summeSoll))
      const zeit = eigene.reduce((a, l) => a + l.sekunden, 0) / eigene.length
      return [
        m,
        String(eigene.length),
        prozent(treffer / soll),
        prozent(ist ? treffer / ist : 1),
        prozent(s((b) => b.idOk) / treffer),
        prozent(s((b) => b.varianteOk) / treffer),
        euro(absDelta),
        zeit.toFixed(1),
      ]
    })
}

function details(l: Lauf): string {
  const b = l.bewertung
  if (!b) return `### ${l.fall} · ${l.modell}\n\nFehler: ${l.fehler}\n`
  const zeilen: string[] = [`### ${l.fall} · ${l.antwortVon}`, '']
  zeilen.push(`A8: „${l.kurzbeschreibung ?? ''}“`, '')
  const fz = (z: { katalogId: string | null; varianteIndex: number | null; anzahl: number; einheit: string; bezeichnung: string; zustand: string }) =>
    `${z.anzahl} ${z.einheit} ${z.bezeichnung} [${z.katalogId ?? 'null'}${z.varianteIndex !== null ? `#${z.varianteIndex}` : ''}, ${z.zustand}]`
  if (b.fehlend.length) zeilen.push('**Fehlt:**', ...b.fehlend.map((z) => `- ${fz(z)}`), '')
  if (b.zusaetzlich.length) zeilen.push('**Zusätzlich/nicht zugeordnet:**', ...b.zusaetzlich.map((z) => `- ${fz(z)} – ${z.grund}`), '')
  const abw = b.paare.filter((p) => !p.varianteOk || !p.anzahlOk || !p.zustandOk || p.soll.unsicher !== p.ist.unsicher)
  if (abw.length) {
    zeilen.push('**Abweichungen (Soll → Ist):**')
    for (const p of abw) {
      const teile: string[] = []
      if (!p.idOk) teile.push(`ID ${p.soll.katalogId} → ${p.ist.katalogId}`)
      else if (!p.varianteOk) teile.push(`Variante ${p.soll.varianteIndex} → ${p.ist.varianteIndex}`)
      if (!p.anzahlOk) teile.push(`Anzahl ${p.soll.anzahl} → ${p.ist.anzahl}`)
      if (!p.zustandOk) teile.push(`Zustand ${p.soll.zustand} → ${p.ist.zustand}`)
      if (p.soll.unsicher !== p.ist.unsicher) teile.push(`unsicher ${p.soll.unsicher} → ${p.ist.unsicher}`)
      zeilen.push(`- ${p.soll.bezeichnung}: ${teile.join(', ')}${p.ist.grund ? ` („${p.ist.grund}“)` : ''}`)
    }
    zeilen.push('')
  }
  if (b.ungueltig.length) zeilen.push('**Ungültig:** ' + b.ungueltig.join('; '), '')
  return zeilen.join('\n')
}

// ---------------------------------------------------------------- Hauptprogramm

async function main() {
  const client = new GeminiClient(leseApiKey(join(WURZEL, '.dev.vars')))

  let kandidaten: Kandidat[] = []
  let kette: string[]
  if (festeModelle) {
    kette = festeModelle
    console.log(`Feste Modellkette: ${kette.join(' → ')}`)
  } else {
    console.log('Modelle über models.list holen und im kostenlosen Tarif proben …')
    kandidaten = await ermittleKette(client)
    kette = kandidaten.filter((k) => k.status === 'frei' || k.status === 'limit-erreicht').map((k) => k.name)
    console.log(`\nVorschlag Modellkette (vom besten abwärts): ${kette.join(' → ') || '(keins)'}\n`)
  }
  if (nurModelle) return
  kette = kette.slice(0, maxModelle)
  if (!kette.length) throw new Error('Kein frei nutzbares Modell gefunden.')

  const katalogDatei = JSON.parse(readFileSync(join(WURZEL, 'data/katalog.json'), 'utf8')) as Katalog
  const katalog = new Map(katalogDatei.positionen.map((p) => [p.id, p]))
  const system = baueSystemPrompt(join(HIER, 'prompt-aufnahme.md'), katalogDatei.positionen)
  const schema = antwortSchema(katalogDatei.positionen.map((p) => p.id))
  const faelle = await ladeFaelle()
  console.log(`${faelle.length} Fälle × ${kette.length} Modelle, Prompt ${system.length} Zeichen\n`)

  const gesperrt = new Set<string>()
  const laeufe: Lauf[] = []
  for (const modell of kette) {
    for (const fall of faelle) {
      process.stdout.write(`  ${modell} · ${fall.name} … `)
      const l = await fuehreAus(client, kette, gesperrt, modell, fall, system, schema, katalog)
      laeufe.push(l)
      console.log(l.fehler ? `Fehler: ${l.fehler}` : `${l.sekunden.toFixed(1)} s${l.antwortVon !== modell ? ` (Antwort von ${l.antwortVon})` : ''}`)
    }
  }

  const zeilen = laeufe.map(zeile)
  const uebersichtKopf = ['Modell', 'Fälle', 'Recall', 'Precision', 'ID ok', 'Variante ok', 'Σ |Δ €|', 'Ø Zeit s']
  const uebersicht = modellUebersicht(laeufe, kette)
  console.log('\n' + konsolenTabelle(KOPF, zeilen))
  console.log('\nJe Modell (nur selbst beantwortete Fälle):\n' + konsolenTabelle(uebersichtKopf, uebersicht))

  const md = [
    '# KI-Testlauf Assistent A – Ergebnis',
    '',
    `Stand: ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} · ${faelle.length} Fälle · Prompt: \`prompt-aufnahme.md\` (${system.length} Zeichen) · Erzeugt mit \`npm run ki-test\`.`,
    '',
    'Preise rechnet `berechnePreisvorschlag` (Höchstwert × Zustandsstufe), Zeilensumme = ROUND(Anzahl × Einzelpreis; 2).',
    'ID/Variante/Menge/Zustand ok = Anteil der gefundenen Positionen. „unsicher Ist/Soll (getr.)“ = von der KI markiert / im Soll markiert (davon beide).',
    '',
    ...(kandidaten.length
      ? ['## Modellvorschlag (models.list + Probe)', '', mdTabelle(['Rang', 'Modell', 'Name', 'Status', 'Meldung'], kandidaten.map((k, i) => [String(i + 1), k.name, k.anzeigename, k.status, k.meldung ?? ''])), '']
      : []),
    '## Je Modell',
    '',
    mdTabelle(uebersichtKopf, uebersicht),
    '',
    '## Je Modell und Fall',
    '',
    mdTabelle(KOPF, zeilen),
    '',
    '## Details',
    '',
    ...laeufe.map(details),
  ].join('\n')
  writeFileSync(join(HIER, 'ergebnis.md'), md + '\n')
  console.log(`\nBericht: tools/ki-test/ergebnis.md`)
}

main().catch((e) => {
  console.error(`Abbruch: ${(e as Error).message}`)
  process.exit(1)
})
