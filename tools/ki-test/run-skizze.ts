// KI-Testlauf für Assistent B (Skizzenfoto → Elemente → Ausrichtung an den Bau-Formen).
//
//   npm run ki-test-skizze                      alle Fälle × alle frei nutzbaren Modelle
//   npm run ki-test-skizze -- --modelle a,b     feste Modellkette statt Probe
//   npm run ki-test-skizze -- --fall fall1      nur einen Fall
//   npm run ki-test-skizze -- --max-modelle 3   nur die besten N Modelle
//   npm run ki-test-skizze -- --nur-soll        ohne KI: nur soll.json zeichnen
//   npm run ki-test-skizze -- --wiederverwenden ohne KI: gespeicherte Rohantworten neu auswerten
//
// Ergebnis: tools/ki-test/ergebnis-skizze.html + PNGs in tools/ki-test/ergebnis-skizze/.
// Rohantworten in tools/ki-test/ausgaben/skizze/ – nicht im Repo.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GeminiClient, leseApiKey, type Teil } from './gemini'
import { ohneGemma, rufeMitKette, type KettenErgebnis } from './kette'
import { ermittleKette, sortiereNachGuete } from './modelle'
import { richteAus, type Ausrichtung, type BauForm, type Zuordnung } from './skizze/ausrichtung'
import { bewerteSkizze, type SkizzenBewertung } from './skizze/auswertung'
import { baueSkizzenPrompt, bereinigeAntwort, skizzenSchema, type SkizzenAntwort, type SkizzenSoll } from './skizze/schema'
import { zeichneVergleich } from './skizze/zeichnen'

const HIER = dirname(fileURLToPath(import.meta.url))
const WURZEL = resolve(HIER, '../..')
const AUSGABE = join(HIER, 'ergebnis-skizze')

// ---------------------------------------------------------------- Argumente

const argv = process.argv.slice(2)
const arg = (name: string) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const festeModelle = arg('modelle')?.split(',').map((s) => s.trim()).filter(Boolean)
const nurFall = arg('fall')
const maxModelle = arg('max-modelle') ? Number(arg('max-modelle')) : Infinity
const nurSoll = argv.includes('--nur-soll')
const wiederverwenden = argv.includes('--wiederverwenden')
const ROH = join(HIER, 'ausgaben', 'skizze')

// ---------------------------------------------------------------- Fälle

interface Fall {
  name: string
  foto: string
  mimeType: string
  formen: BauForm[] | null
  formenQuelle: string
  soll: SkizzenSoll | null
}

function ladeFaelle(): Fall[] {
  const ordner = join(HIER, 'faelle-skizze')
  const faelle: Fall[] = []
  for (const name of readdirSync(ordner).sort()) {
    if (nurFall && name !== nurFall) continue
    const dir = join(ordner, name)
    const bild = ['eingabe.jpg', 'eingabe.jpeg', 'eingabe.png'].find((f) => existsSync(join(dir, f)))
    if (!bild) continue
    // Ausrichtung an den Formen aus „Skizze Bau“; ersatzweise das vorbereitete Außen-Blatt
    const formenDatei = ['bau-formen.json', 'aussen-vorher.json'].find((f) => existsSync(join(dir, f)))
    faelle.push({
      name,
      foto: join(dir, bild),
      mimeType: bild.endsWith('.png') ? 'image/png' : 'image/jpeg',
      formen: formenDatei ? (JSON.parse(readFileSync(join(dir, formenDatei), 'utf8')) as { formen: BauForm[] }).formen : null,
      formenQuelle: formenDatei ?? '–',
      soll: existsSync(join(dir, 'soll.json')) ? (JSON.parse(readFileSync(join(dir, 'soll.json'), 'utf8')) as SkizzenSoll) : null,
    })
  }
  return faelle
}

// ---------------------------------------------------------------- Lauf

interface Lauf {
  fall: Fall
  modell: string
  kette: KettenErgebnis<SkizzenAntwort>
  pruefFehler: string[]
  ausrichtung: Ausrichtung | null
  bewertung: SkizzenBewertung | null
  bild?: string // relativer Pfad zum PNG
}

function ausrichten(fall: Fall, antwort: SkizzenAntwort, hinweise: string[]): Ausrichtung | null {
  if (!fall.formen) return null
  try {
    return richteAus(antwort.elemente, antwort.grundstueck, fall.formen)
  } catch (e) {
    hinweise.push(`Ausrichtung fehlgeschlagen: ${(e as Error).message}`)
    return null
  }
}

const prozent = (x: number) => `${Math.round(x * 100)} %`
const zahl = (x: number, n = 1) => x.toLocaleString('de-DE', { minimumFractionDigits: n, maximumFractionDigits: n })

function infoZeilen(a: Ausrichtung | null, zuordnungen: Zuordnung[], b: SkizzenBewertung | null, extra: string[]): string[] {
  const neu = zuordnungen.filter((z) => z.neu).length
  const unsicher = zuordnungen.filter((z) => z.element.unsicher).length
  const zeilen = [
    `${zuordnungen.length} Elemente · ${neu} neu · ${unsicher} unsicher` +
      (a
        ? ` · Ausrichtung: ${a.methode}${a.methode === 'bezug' ? ` (${a.bezuege.filter((x) => x.achsen !== '–').map((x) => x.fotoLabel).join(', ')})` : ''}` +
          (a.restfehlerProzent !== null ? ` · Skizze unproportional Ø ${zahl(a.restfehlerProzent)} %` : '')
        : ''),
  ]
  if (b) {
    zeilen.push(
      `Soll: gefunden ${b.treffer}/${b.soll} · zusätzlich ${b.zusaetzlich.length} · Typ gleich ${b.typGleich}/${b.treffer} · ` +
        `Ø Abstand ${zahl(b.mittelAbstand, 0)}/1000 · neu richtig ${b.neuRichtig}/${b.treffer}` +
        (b.mittelLagefehlerNeu !== null ? ` · Lagefehler neu Ø ${zahl(b.mittelLagefehlerNeu)} %` : ''),
    )
  } else if (extra.length) zeilen.push(extra.join(' · ').slice(0, 180))
  return zeilen
}

async function bildSpeichern(fall: Fall, datei: string, antwort: SkizzenAntwort, a: Ausrichtung | null, titel: string, zeilen: string[]) {
  const zuordnungen: Zuordnung[] = a?.zuordnungen ?? antwort.elemente.map((e) => ({ element: e, neu: true, emu: { x: 0, y: 0, w: 0, h: 0 } }))
  const png = await zeichneVergleich(fall.foto, a, zuordnungen, antwort.grundstueck, fall.formen ?? [], { titel, zeilen })
  mkdirSync(join(AUSGABE, fall.name), { recursive: true })
  writeFileSync(join(AUSGABE, fall.name, datei), png)
  return `ergebnis-skizze/${fall.name}/${datei}`
}

function speichereRoh(modell: string, fall: string, json: unknown) {
  const dir = join(HIER, 'ausgaben', 'skizze', modell)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${fall}.json`), JSON.stringify(json, null, 2) + '\n')
}

// ---------------------------------------------------------------- HTML

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function htmlBericht(faelle: Fall[], sollBilder: Map<string, string>, laeufe: Lauf[], kette: string[], systemLaenge: number): string {
  const kopf = ['Fall', 'Modell', 'Antwort von', 'Zeit s', 'Elemente', 'gefunden', 'zusätzl.', 'Typ gleich', 'Beschr. ok', 'Ø Abstand', 'Ø IoU', 'unsicher Ist/Soll (getr.)', 'neu richtig', 'Lagefehler neu', 'Ausrichtung', 'Vermerk']
  const zeilen = laeufe.map((l) => {
    const b = l.bewertung
    const a = l.ausrichtung
    const basis = [l.fall.name, l.modell, l.kette.antwortVon === l.modell ? '=' : (l.kette.antwortVon ?? '–'), zahl(l.kette.sekunden)]
    const ausr = a ? `${a.methode}${a.restfehlerProzent !== null ? `, Ø ${zahl(a.restfehlerProzent)} %` : ''}` : '–'
    const vermerk = [...l.kette.vermerke.filter((v) => /^\d{3}|HTTP/.test(v)), ...l.pruefFehler, ...(l.kette.fehler ? [l.kette.fehler] : [])].join('; ')
    if (!l.kette.wert) return [...basis, ...Array(10).fill('–'), ausr, vermerk]
    if (!b) return [...basis, String(l.kette.wert.elemente.length), ...Array(9).fill('–'), ausr, vermerk]
    return [
      ...basis,
      String(b.ist),
      `${b.treffer}/${b.soll} (${prozent(b.recall)})`,
      String(b.zusaetzlich.length),
      `${b.typGleich}/${b.treffer}`,
      `${b.beschriftungOk}/${b.treffer}`,
      zahl(b.mittelAbstand, 0),
      zahl(b.mittelIou, 2),
      `${b.unsicherIst}/${b.unsicherSoll} (${b.unsicherGetroffen})`,
      `${b.neuRichtig}/${b.treffer}`,
      b.mittelLagefehlerNeu !== null ? `${zahl(b.mittelLagefehlerNeu)} %` : '–',
      ausr,
      vermerk,
    ]
  })
  const tabelle = `<table><thead><tr>${kopf.map((k) => `<th>${esc(k)}</th>`).join('')}</tr></thead><tbody>${zeilen
    .map((z) => `<tr>${z.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`

  const details = faelle
    .map((f) => {
      const eigene = laeufe.filter((l) => l.fall === f)
      const karten = eigene
        .map((l) => {
          const b = l.bewertung
          const liste: string[] = []
          if (b?.fehlend.length) liste.push(`<b>Fehlt:</b> ${b.fehlend.map((e) => esc(`${e.typ} „${e.beschriftung}“`)).join(', ')}`)
          if (b?.zusaetzlich.length) liste.push(`<b>Zusätzlich:</b> ${b.zusaetzlich.map((e) => esc(`${e.typ} „${e.beschriftung}“${e.unsicher ? ' (?)' : ''}`)).join(', ')}`)
          const typFalsch = b?.paare.filter((p) => !p.typGleich) ?? []
          if (typFalsch.length) liste.push(`<b>Typ:</b> ${typFalsch.map((p) => esc(`${p.soll.typ} → ${p.ist.typ}`)).join(', ')}`)
          const neuFalsch = b?.paare.filter((p) => p.soll.neu !== undefined && p.istNeu !== p.soll.neu) ?? []
          if (neuFalsch.length) liste.push(`<b>neu/vorhanden falsch:</b> ${neuFalsch.map((p) => esc(`${p.ist.typ} „${p.ist.beschriftung}“ → ${p.istNeu ? 'neu' : 'vorhanden'}`)).join(', ')}`)
          if (l.ausrichtung?.hinweise.length) liste.push(`<b>Ausrichtung:</b> ${l.ausrichtung.hinweise.map(esc).join('; ')}`)
          if (l.kette.fehler) liste.push(`<b>Fehler:</b> ${esc(l.kette.fehler)}`)
          return `<figure><figcaption><b>${esc(l.kette.antwortVon ?? l.modell)}</b>${l.kette.antwortVon && l.kette.antwortVon !== l.modell ? ` (angefragt: ${esc(l.modell)})` : ''}</figcaption>${
            l.bild ? `<a href="${l.bild}"><img src="${l.bild}" loading="lazy" alt="Vergleich ${esc(l.modell)}"></a>` : ''
          }${liste.length ? `<ul>${liste.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}</figure>`
        })
        .join('')
      const soll = sollBilder.get(f.name)
      return `<h2>${esc(f.name)}</h2><p>Formen: <code>${esc(f.formenQuelle)}</code></p>${
        soll ? `<figure><figcaption><b>Soll</b> (soll.json, Entwurf)</figcaption><a href="${soll}"><img src="${soll}" alt="Soll"></a></figure>` : ''
      }${karten}`
    })
    .join('')

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Skizzen-Testlauf</title>
<style>
:root{--bg:#fff;--fg:#1f2328;--muted:#59636e;--line:#d0d7de;--head:#f6f8fa}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#9198a1;--line:#30363d;--head:#161b22}}
body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;margin:0 auto;padding:16px;max-width:1700px}
h1{font-size:22px;margin:0 0 4px}h2{margin-top:32px;border-bottom:1px solid var(--line);padding-bottom:4px}
p.meta{color:var(--muted);margin:0 0 16px}
.tab{overflow-x:auto}table{border-collapse:collapse;font-size:13px;white-space:nowrap}
th,td{border:1px solid var(--line);padding:4px 8px;text-align:left}th{background:var(--head)}
figure{margin:16px 0 28px}figcaption{margin-bottom:6px}
img{max-width:100%;height:auto;border:1px solid var(--line);background:#fff}
ul{margin:6px 0 0;padding-left:20px;color:var(--fg)}li{margin:2px 0}
.legende span{display:inline-block;margin-right:14px}.legende i{display:inline-block;width:12px;height:12px;margin-right:4px;vertical-align:-1px}
</style></head><body>
<h1>Skizzen-Testlauf (Assistent B)</h1>
<p class="meta">Stand: ${esc(new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }))} · Modellkette: ${esc(kette.join(' → ') || '–')} · Prompt <code>skizze/prompt-skizze.md</code> (${systemLaenge} Zeichen) · erzeugt mit <code>npm run ki-test-skizze</code></p>
<p class="legende"><span><i style="background:#1f6feb"></i>Bezugsgebäude</span><span><i style="background:#6e7781"></i>schon in den Bau-Formen</span><span><i style="background:#1a7f37"></i>neu</span><span><i style="background:#bf8700"></i>unsicher (gestrichelt)</span><span><i style="background:#8250df"></i>Grundstücksrahmen</span></p>
<p class="meta">gefunden = Soll-Elemente mit passendem Ist-Kasten (Typ ähnlich, Mittelpunkt nah) · Ø Abstand = Mittelpunkte im Foto (0–1000) · neu richtig = neu/vorhanden wie im Soll · Lagefehler neu = Abstand der neuen Elemente im Excel-Blatt zur Lage aus dem Soll, in % der Grundstücksgröße · „Skizze unproportional“ = Abweichung der Bezugsgebäude von einer linearen Abbildung (die App nutzt stückweise lineare Abbildung).</p>
<div class="tab">${tabelle}</div>
${details}
</body></html>
`
}

// ---------------------------------------------------------------- Hauptprogramm

async function main() {
  const faelle = ladeFaelle()
  if (!faelle.length) throw new Error('Keine Fälle in tools/ki-test/faelle-skizze/')
  const system = baueSkizzenPrompt(join(HIER, 'skizze', 'prompt-skizze.md'))
  const schema = skizzenSchema()

  // Soll zeichnen (Referenz)
  const sollBilder = new Map<string, string>()
  const sollAusrichtung = new Map<string, Ausrichtung | null>()
  for (const f of faelle) {
    if (!f.soll) continue
    const hinweise: string[] = []
    const a = ausrichten(f, f.soll, hinweise)
    sollAusrichtung.set(f.name, a)
    const zuordnungen = a?.zuordnungen ?? []
    sollBilder.set(f.name, await bildSpeichern(f, '_soll.png', f.soll, a, `${f.name} · Soll (soll.json)`, infoZeilen(a, zuordnungen, null, hinweise)))
  }

  let kette: string[] = []
  const laeufe: Lauf[] = []
  if (!nurSoll) {
    const client = wiederverwenden ? null : new GeminiClient(leseApiKey(join(WURZEL, '.dev.vars')))
    if (wiederverwenden) {
      const vorhanden = existsSync(ROH) ? readdirSync(ROH) : []
      kette = sortiereNachGuete(festeModelle ? vorhanden.filter((m) => festeModelle.includes(m)) : vorhanden)
      console.log(`Rohantworten neu auswerten: ${kette.join(', ') || '(keine)'}`)
    } else if (festeModelle) {
      kette = ohneGemma(festeModelle)
      console.log(`Feste Modellkette: ${kette.join(' → ')}`)
    } else {
      console.log('Modelle über models.list holen und im kostenlosen Tarif proben …')
      const kandidaten = await ermittleKette(client!)
      kette = ohneGemma(kandidaten.filter((k) => k.status === 'frei' || k.status === 'limit-erreicht').map((k) => k.name))
      console.log(`\nModellkette (ohne Gemma): ${kette.join(' → ') || '(keins)'}\n`)
    }
    kette = kette.slice(0, maxModelle)
    if (!kette.length) throw new Error('Kein frei nutzbares Modell gefunden.')

    const gesperrt = new Set<string>()
    for (const modell of kette) {
      for (const fall of faelle) {
        process.stdout.write(`  ${modell} · ${fall.name} … `)
        const teile: Teil[] = [
          { text: 'Foto einer handgezeichneten Parzellenskizze. Erkenne alle Elemente und gib ihre Lage an.' },
          { inlineData: { mimeType: fall.mimeType, data: readFileSync(fall.foto).toString('base64') } },
        ]
        const pruefFehler: string[] = []
        const k = await rufeMitKette<SkizzenAntwort>(client ? kette : [modell], gesperrt, modell, async (m) => {
          let roh: unknown
          if (!client) {
            roh = JSON.parse(readFileSync(join(ROH, m, `${fall.name}.json`), 'utf8'))
          } else {
            roh = JSON.parse((await client.generiereJson(m, system, teile, schema)).text)
            speichereRoh(m, fall.name, roh)
          }
          const { antwort: sauber, fehler } = bereinigeAntwort(roh)
          pruefFehler.push(...fehler)
          return sauber
        }, client ? undefined : 0)
        // Antwortzeit merken, damit --wiederverwenden die echte Zeit zeigt
        const meta = join(ROH, k.antwortVon ?? modell, `${fall.name}.meta.json`)
        if (client && k.wert) writeFileSync(meta, JSON.stringify({ sekunden: k.sekunden }) + '\n')
        else if (!client && existsSync(meta)) k.sekunden = (JSON.parse(readFileSync(meta, 'utf8')) as { sekunden: number }).sekunden
        const lauf: Lauf = { fall, modell, kette: k, pruefFehler, ausrichtung: null, bewertung: null }
        if (k.wert) {
          const hinweise: string[] = []
          lauf.ausrichtung = ausrichten(fall, k.wert, hinweise)
          pruefFehler.push(...hinweise)
          if (fall.soll) lauf.bewertung = bewerteSkizze(fall.soll, k.wert.elemente, lauf.ausrichtung, sollAusrichtung.get(fall.name) ?? null)
          const zuordnungen = lauf.ausrichtung?.zuordnungen ?? []
          const titel = `${fall.name} · ${k.antwortVon}${k.antwortVon !== modell ? ` (angefragt: ${modell})` : ''} · ${zahl(k.sekunden)} s`
          lauf.bild = await bildSpeichern(fall, `${k.antwortVon}.png`, k.wert, lauf.ausrichtung, titel, infoZeilen(lauf.ausrichtung, zuordnungen, lauf.bewertung, pruefFehler))
        }
        laeufe.push(lauf)
        const b = lauf.bewertung
        console.log(
          k.fehler
            ? `Fehler: ${k.fehler}`
            : `${zahl(k.sekunden)} s${k.antwortVon !== modell ? ` (Antwort von ${k.antwortVon})` : ''}` +
                (b ? ` · gefunden ${b.treffer}/${b.soll}, zusätzlich ${b.zusaetzlich.length}, neu richtig ${b.neuRichtig}/${b.treffer}` : ''),
        )
      }
    }
  }

  writeFileSync(join(HIER, 'ergebnis-skizze.html'), htmlBericht(faelle, sollBilder, laeufe, kette, system.length))
  console.log(`\nBericht: tools/ki-test/ergebnis-skizze.html`)
}

main().catch((e) => {
  console.error(`Abbruch: ${(e as Error).message}`)
  process.exit(1)
})
