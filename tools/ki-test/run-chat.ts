// Replay-Test für den Skizzen-Chat (PR ki/skizze-chat).
//
//   npm run ki-test-chat                         alle Standardmodelle
//   npm run ki-test-chat -- --modelle gemini-3.8-flash
//   npm run ki-test-chat -- --fall fall1
//
// Spielt faelle-skizze/<fall>/chat.txt Satz für Satz ein (Ausgangslage: nur die Bau-Formen
// aus aussen-vorher.json, fest), ruft pro Satz denselben Server-Kern wie POST /api/ki/skizze-chat
// (inkl. Selbstprüfung) und zeigt Vorher/Nachher. Vergleichszahlen gegen claude-ergebnis.json
// gibt es noch nicht (Datei fehlt) – nur Bilder und Protokoll.
//
// Ergebnis: tools/ki-test/ergebnis-chat.html, Bilder in tools/ki-test/ergebnis-skizze/<fall>/chat-*.png,
// Rohprotokoll in tools/ki-test/ausgaben/chat/ (nicht im Repo).

import { createCanvas } from '@napi-rs/canvas'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exportWep } from '../../src/export'
import type { Kasten } from '../../src/export/skizzeFormen'
import { neuerWep } from '../../src/model'
import { ChatFehler, fuehreChatAus, type ChatErgebnis } from '../../src/skizze/chatAblauf'
import type { Szene, SzenenElement } from '../../src/skizze/szene'
import { bildGroesse, szeneAufContext } from '../../src/skizze/szenePng'
import { szeneZuFormen } from '../../src/skizze/szeneExport'
import { leereSperren } from '../../functions/_lib/kette'
import { skizzeChat } from '../../functions/_lib/skizzeChat'
import { leseApiKey } from './gemini'
import type { BauForm } from './skizze/ausrichtung'
import { svgZuPngNode, vorlageMitBauFormen } from './skizze/formen'
import { rendereSkizzenBlatt } from './skizze/render'

const HIER = dirname(fileURLToPath(import.meta.url))
const WURZEL = resolve(HIER, '../..')
const argv = process.argv.slice(2)
const arg = (name: string) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const fall = arg('fall') ?? 'fall1'
const MODELLE = arg('modelle')?.split(',').map((s) => s.trim()).filter(Boolean) ?? ['gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3-flash-preview']
const dir = join(HIER, 'faelle-skizze', fall)
const PT = 12700
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------- Ausgangsszene

interface Start {
  szene: Szene
  grundstueck: Kasten
  formen: BauForm[]
}

/** Bau-Formen → feste Szene; größtes Rechteck = Grundstück (Bezugsrahmen). */
function ladeStart(): Start {
  const formen = (JSON.parse(readFileSync(join(dir, 'aussen-vorher.json'), 'utf8')) as { formen: BauForm[] }).formen
  const gs = formen.filter((f) => f.typ === 'rect' && !f.textfeld).sort((a, b) => b.w * b.h - a.w * a.h)[0]
  const rel = (f: BauForm) => ({
    x: Math.round(((f.x - gs.x) / gs.w) * 10000) / 10,
    y: Math.round(((f.y - gs.y) / gs.h) * 10000) / 10,
    b: Math.round((f.w / gs.w) * 10000) / 10,
    h: Math.round((f.h / gs.h) * 10000) / 10,
  })
  const elemente: SzenenElement[] = []
  let n = 0
  for (const f of formen) {
    if (f === gs) continue
    if (f.textfeld && !f.text) continue
    const id = `b${++n}`
    const typ = f.typ === 'line' || f.typ === 'straightConnector1' ? 'bau-linie' : f.typ === 'ellipse' ? 'bau-ellipse' : f.textfeld ? 'bau-text' : 'bau'
    elemente.push({
      id, typ, ...rel(f), beschriftung: f.text ?? '', fest: true,
      ...(f.flipH ? { flipH: true } : {}), ...(f.flipV ? { flipV: true } : {}),
      ...(f.gestrichelt ? { gestrichelt: true } : {}), ...(f.pfeil ? { pfeil: true } : {}),
    })
  }
  return {
    szene: { masse: { b: gs.w / PT, h: gs.h / PT }, elemente },
    grundstueck: { x: gs.x, y: gs.y, w: gs.w, h: gs.h },
    formen,
  }
}

function rendereCanvas(szene: Szene): Buffer {
  const g = bildGroesse(szene, 800)
  const canvas = createCanvas(g.breite, g.hoehe)
  szeneAufContext(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, szene, g.breite, g.hoehe)
  return canvas.toBuffer('image/png')
}

// ---------------------------------------------------------------- Chat

/** Wie die App: derselbe Server-Kern, aber mit fester Ein-Modell-Kette; 503 → bis zu 2 × warten. */
async function rufe(modell: string, key: string, a: Parameters<typeof skizzeChat>[0]) {
  for (let versuch = 0; ; versuch++) {
    await pause(2000)
    const r = await skizzeChat(a, { apiKey: key, modelle: [modell] })
    if (r.status === 200) return r.body as Exclude<typeof r.body, { fehler: string }>
    const b = r.body as { fehler: string; erneutNachSek?: number }
    if (r.status === 503 && versuch < 2) {
      const sek = Math.min(70, b.erneutNachSek ?? 30)
      console.log(`    ${modell} ausgelastet, warte ${sek} s`)
      await pause(sek * 1000 + 500)
      leereSperren()
      continue
    }
    throw new ChatFehler(b.fehler, r.status, b.erneutNachSek)
  }
}

interface Lauf {
  modell: string
  saetze: { satz: string; ergebnis: ChatErgebnis }[]
  szene: Szene
  bild?: string
  szenenBild: string
  sekunden: number
}

async function spiele(modell: string, key: string, start: Szene, saetze: string[]): Promise<Lauf> {
  leereSperren()
  let szene = start
  const protokoll: Lauf['saetze'] = []
  const t0 = Date.now()
  for (const satz of saetze) {
    console.log(`  ${modell}: „${satz}“`)
    const ergebnis = await fuehreChatAus(szene, satz, {
      rufe: (a) => rufe(modell, key, a),
      rendere: async (s) => rendereCanvas(s).toString('base64'),
    })
    szene = ergebnis.szene
    for (const s of ergebnis.schritte) console.log(`    ${s.ok ? '✓' : '⚠'} ${s.pruefung ? '(Prüfung) ' : ''}${s.text}`)
    for (const h of ergebnis.hinweise) console.log(`    ? ${h}`)
    if (ergebnis.fehler) console.log(`    FEHLER: ${ergebnis.fehler}`)
    protokoll.push({ satz, ergebnis })
  }
  const szenenBild = `chat-${modell}-szene.png`
  return { modell, saetze: protokoll, szene, szenenBild, sekunden: (Date.now() - t0) / 1000 }
}

// ---------------------------------------------------------------- Bericht

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function htmlBericht(laeufe: Lauf[], saetze: string[], ziel: string): string {
  const bild = (datei?: string, titel = '') =>
    datei ? `<figure><img src="ergebnis-skizze/${fall}/${datei}" alt="${esc(titel)}"><figcaption>${esc(titel)}</figcaption></figure>` : '<p><em>kein Bild</em></p>'
  const abschnitte = laeufe
    .map((l) => {
      const zeilen = l.saetze
        .map(({ satz, ergebnis: e }) => {
          const schritte = e.schritte.map((s) => `<li class="${s.ok ? 'ok' : 'warn'}">${s.ok ? '✓' : '⚠'} ${s.pruefung ? '<em>(Prüfung)</em> ' : ''}${esc(s.text)}</li>`).join('')
          const hinweise = e.hinweise.map((h) => `<li>? ${esc(h)}</li>`).join('')
          return `<tr><td>${esc(satz)}</td><td><ul>${schritte}${hinweise}${e.fehler ? `<li class="warn">${esc(e.fehler)}</li>` : ''}</ul></td><td>${esc(e.modelle.join(' → '))}<br>${esc(e.pruefung ?? '')}</td><td>${e.sekunden.toFixed(1)} s</td></tr>`
        })
        .join('')
      return `<section><h2>${esc(l.modell)} <small>${l.sekunden.toFixed(0)} s, ${l.szene.elemente.filter((e) => !e.fest).length} neue Elemente</small></h2>
<div class="bilder">${bild('chat-vorher.png', 'Vorher (Bau-Formen)')}${bild(l.bild, `Nachher (Excel-Export, ${l.modell})`)}${bild(l.szenenBild, 'Nachher (Modell-Sicht, Canvas)')}</div>
<table><thead><tr><th>Satz</th><th>Was geändert wurde</th><th>Modell / Prüfung</th><th>Zeit</th></tr></thead><tbody>${zeilen}</tbody></table></section>`
    })
    .join('\n')
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Skizzen-Chat Replay – ${esc(fall)}</title>
<style>body{font:14px/1.4 system-ui,sans-serif;margin:16px;max-width:1500px}h2 small{font-weight:normal;color:#666}
.bilder{display:flex;gap:12px;flex-wrap:wrap}figure{margin:0;flex:1 1 380px}img{width:100%;border:1px solid #bbb}
figcaption{color:#555;font-size:12px}table{border-collapse:collapse;width:100%;margin:12px 0 32px}td,th{border:1px solid #ccc;padding:4px 8px;vertical-align:top;text-align:left}
ul{margin:0;padding-left:0;list-style:none}.ok{color:#1b5e20}.warn{color:#c62828}</style></head><body>
<h1>Skizzen-Chat – Replay ${esc(fall)}</h1>
<p>Sätze aus <code>chat.txt</code> (${saetze.length}), Ausgangslage: nur feste Bau-Formen. Noch keine Vergleichszahlen
(<code>claude-ergebnis.json</code> fehlt) – nur Bilder und Protokoll. ${esc(ziel)}</p>
${abschnitte}</body></html>`
}

// ---------------------------------------------------------------- main

async function main() {
  const saetze = readFileSync(join(dir, 'chat.txt'), 'utf8')
    .split(/\r?\n/)
    .map((z) => z.trim())
    .filter((z) => z && !z.startsWith('#'))
  const key = leseApiKey(join(WURZEL, '.dev.vars'))
  const { szene: start, grundstueck, formen } = ladeStart()
  console.log(`${saetze.length} Sätze, ${start.elemente.length} feste Bau-Elemente, Modelle: ${MODELLE.join(', ')}`)

  const ziel = join(HIER, 'ergebnis-skizze', fall)
  mkdirSync(ziel, { recursive: true })
  mkdirSync(join(HIER, 'ausgaben', 'chat'), { recursive: true })

  const vorlageDatei = readFileSync(join(WURZEL, 'docs', 'WEP_Vorlage.xlsx'))
  const vorlage = vorlageDatei.buffer.slice(vorlageDatei.byteOffset, vorlageDatei.byteOffset + vorlageDatei.byteLength)
  const basis = await vorlageMitBauFormen(vorlage, formen)
  const vorher = await rendereSkizzenBlatt(basis)
  if (vorher.png) writeFileSync(join(ziel, 'chat-vorher.png'), vorher.png)

  const wep = neuerWep(`ki-test-chat-${fall}`)
  wep.formalien.unterpaechter = 'Erika Musterfrau'
  wep.formalien.vorgangsNr = `TEST-${fall}`

  const laeufe: Lauf[] = []
  for (const modell of MODELLE) {
    const lauf = await spiele(modell, key, start, saetze)
    writeFileSync(join(ziel, lauf.szenenBild), rendereCanvas(lauf.szene))
    writeFileSync(join(HIER, 'ausgaben', 'chat', `${fall}-${modell}.json`), JSON.stringify(lauf, null, 1))
    try {
      const elemente = szeneZuFormen(lauf.szene, grundstueck)
      const r = await exportWep(wep, basis, { skizzeFormen: { elemente, rasterisiere: svgZuPngNode } })
      const bild = await rendereSkizzenBlatt(await r.blob.arrayBuffer())
      if (bild.png) {
        lauf.bild = `chat-${modell}.png`
        writeFileSync(join(ziel, lauf.bild), bild.png)
      }
      if (r.skizzeFormen?.ueberdeckt.length) console.log(`  Überdeckt: ${r.skizzeFormen.ueberdeckt.join('; ')}`)
    } catch (e) {
      console.log(`  Excel-Export/Render fehlgeschlagen: ${(e as Error).message}`)
    }
    laeufe.push(lauf)
    writeFileSync(join(HIER, 'ergebnis-chat.html'), htmlBericht(laeufe, saetze, ''))
  }
  console.log('\nBericht: tools/ki-test/ergebnis-chat.html')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
