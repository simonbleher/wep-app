// Brücke Ausrichtung → Excel-Export: aus den Zuordnungen (Lage in EMU) die neuen
// Grün-Elemente als `FormElement` für src/export/skizzeFormen.ts bauen.
// Dazu Testhilfen: Bau-Formen (JSON) als Fremd-Formen in die Vorlage schreiben und
// SVG → PNG mit @napi-rs/canvas (im Browser übernimmt das svgZuPngBrowser).

import JSZip from 'jszip'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import {
  ankerAuf,
  leseBlattGeometrie,
  type FormElement,
  type Kasten,
  type SvgRaster,
} from '../../../src/export/skizzeFormen'
import { findeBlattPfad, SKIZZE_BLATTNAME } from '../../../src/export/skizzeBild'
import type { Ausrichtung, BauForm, Rechteck, Zuordnung } from './ausrichtung'

const PT = 12700

/** Namensbestandteil: Leerzeichen → „_“, nur Buchstaben, Ziffern, „_“ und „-“. */
export function ident(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
}

/** Pflanzen (Stern + X beim Entfernen); alles andere (Holzpferd, Schuppen, Platte …) nur Hinweis + Marker. */
const PFLANZE = /baum|bäume|strauch|sträucher|busch|hecke|konifere|nadelbaum|wacholder|thuja|zypresse|fichte|tanne|kiefer|flieder|jasmin|ahorn|buche|birke|eiche|linde|obst|apfel|birne|kirsche|pflaume|rose|hortensie|bambus|forsythie|liguster|hainbuche|lebensbaum/i
export const istPflanze = (...texte: string[]) => PFLANZE.test(texte.join(' '))

const kasten = (r: Rechteck): Kasten => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) })
const mitteVon = (r: Rechteck) => ({ x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) })

/**
 * Nur die neuen Elemente (nicht in den Bau-Formen) werden zu Excel-Formen; was die
 * Bau-Excel schon zeigt (Laube, Brunnen, Zugang …), kommt nicht noch einmal.
 */
export function zuordnungenZuFormen(a: Pick<Ausrichtung, 'zuordnungen'>): FormElement[] {
  const neu = a.zuordnungen.filter((z) => z.neu)
  const zaehler = new Map<string, number>()
  const nummer = (basis: string, immerNummer = true) => {
    const n = zaehler.get(basis) ?? 0
    zaehler.set(basis, n + 1)
    return immerNummer || n > 0 ? `${basis}_${n}` : basis
  }
  const out: FormElement[] = []
  const gruppen = new Map<string, { label: string; kasten: Rechteck[] }>()

  // Ziel eines Mängelhinweises: Element, dessen Beschriftung/Bezug passt
  const ziel = (z: Zuordnung): { x: number; y: number } | undefined => {
    const b = z.element.bezug.trim().toLowerCase()
    if (!b) return undefined
    const t = a.zuordnungen.find(
      (o) => o !== z && (o.element.beschriftung.toLowerCase().includes(b) || o.element.bezug.toLowerCase() === b),
    )
    return t ? mitteVon(t.emu) : undefined
  }

  for (const z of neu) {
    const e = z.element
    const k = kasten(z.emu)
    const text = e.beschriftung
    switch (e.typ) {
      case 'hochbeet':
      case 'beet': {
        const basis = e.typ === 'hochbeet' ? 'Hochbeet' : 'Beet'
        out.push({ typ: e.typ, name: nummer(basis), kasten: k, gruppe: basis })
        const g = gruppen.get(basis) ?? { label: e.bezug || text || basis, kasten: [] }
        g.kasten.push(z.emu)
        gruppen.set(basis, g)
        break
      }
      case 'entfernen': {
        const stamm = ident(e.bezug || text.split(/\s+/)[0] || 'Entfernen') || 'Entfernen'
        out.push({ typ: 'entfernen', name: nummer(stamm, false), kasten: k, text, pflanze: istPflanze(e.bezug, text) })
        break
      }
      case 'baum':
        out.push({ typ: 'baum', name: nummer(ident(text) || 'Baum', false), kasten: k, text, variante: /ahorn/i.test(text) ? 'bergahorn' : 'buche' })
        break
      case 'strauch':
        out.push({ typ: 'strauch', name: nummer(ident(text) || 'Strauch', false), kasten: k, text })
        break
      case 'hecke':
        out.push({ typ: 'hecke', name: nummer(ident(text) || 'Hecke', false), kasten: k, text, variante: /flieder/i.test(text) ? 'flieder' : 'gruen' })
        break
      case 'kompost':
        out.push({ typ: 'kompost', name: nummer('Kompost', false), kasten: k, text: text || 'Kompost' })
        break
      case 'schacht':
        out.push({ typ: 'schacht', name: nummer('Schacht', false), kasten: k, text })
        break
      case 'brunnen':
        out.push({ typ: 'brunnen', name: nummer('Brunnen', false), kasten: k, text })
        break
      case 'weg':
        out.push({ typ: 'weg', name: nummer('Weg', false), kasten: k, text: text || 'Weg' })
        break
      case 'tor':
        out.push({ typ: 'tor', name: nummer('Tor', false), kasten: k })
        break
      case 'mangelhinweis':
        out.push({ typ: 'mangelhinweis', name: nummer(`Hinweis`), kasten: k, text, nach: ziel(z) })
        break
      case 'massangabe': {
        const waagerecht = z.emu.w >= z.emu.h
        const m = mitteVon(z.emu)
        out.push({
          typ: 'massangabe',
          name: nummer(`Maß_${ident(e.bezug || text) || 'Strecke'}`, false),
          von: waagerecht ? { x: k.x, y: m.y } : { x: m.x, y: k.y },
          nach: waagerecht ? { x: k.x + k.w, y: m.y } : { x: m.x, y: k.y + k.h },
          text: e.wert || text,
        })
        break
      }
      case 'text':
        out.push({ typ: 'text', name: nummer('Text'), kasten: k, text })
        break
      default:
        // Gebäude u. Ä., die es in der Bau-Excel nicht gibt: schlichtes Rechteck mit Beschriftung
        out.push({ typ: 'rechteck', name: nummer(ident(text) || ident(e.typ)), kasten: k, text })
    }
  }

  // Sammelbeschriftung rechts neben einer Gruppe gleicher Beete („Hochbeete“)
  for (const [basis, g] of gruppen) {
    const x2 = Math.max(...g.kasten.map((r) => r.x + r.w))
    const y1 = Math.min(...g.kasten.map((r) => r.y))
    const y2 = Math.max(...g.kasten.map((r) => r.y + r.h))
    out.push({
      typ: 'text',
      name: `${ident(g.label)}_Text`,
      kasten: { x: Math.round(x2 + 3 * PT), y: Math.round((y1 + y2) / 2 - 7.5 * PT), w: Math.round((g.label.length * 5 + 8) * PT), h: 15 * PT },
      text: g.label,
      gruppe: basis, // wandert mit den Beeten
    })
  }
  return out
}

// ---------------------------------------------------------------- Testhilfen

/** SVG → PNG im Node-Test (Browser: svgZuPngBrowser). */
export const svgZuPngNode: SvgRaster = async (svg, breite, hoehe) => {
  const bild = await loadImage(Buffer.from(svg, 'utf8'))
  const canvas = createCanvas(breite, hoehe)
  canvas.getContext('2d').drawImage(bild, 0, 0, breite, hoehe)
  return new Uint8Array(canvas.toBuffer('image/png'))
}

const FARBE_GRUNDSTUECK = 'C5E0B4'

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Drawing-XML wie in einer Bau-Excel: die Bau-Formen (ohne `descr`, also „fremd“)
 * als Excel-Formen. Größtes Rechteck = Grundstück mit grüner Wiese (Skill 1b).
 */
export function bauFormenDrawing(formen: BauForm[], blattXml: string): string {
  const geo = leseBlattGeometrie(blattXml)
  const gs = formen.filter((f) => f.typ === 'rect' && !f.textfeld).sort((a, b) => b.w * b.h - a.w * a.h)[0]
  let id = 1
  let xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
  const reihenfolge = [...formen].sort((a, b) => Number(b === gs) - Number(a === gs))
  for (const f of reihenfolge) {
    id++
    const x = Math.max(0, f.x)
    const y = Math.max(0, f.y)
    const ln = (farbe: string) =>
      `<a:ln w="9525"><a:solidFill><a:srgbClr val="${farbe}"/></a:solidFill>${f.gestrichelt ? '<a:prstDash val="dash"/>' : ''}${f.pfeil ? '<a:tailEnd type="triangle"/>' : ''}</a:ln>`
    if (f.typ === 'line' || f.typ === 'straightConnector1') {
      const flip = (f.flipH ? ' flipH="1"' : '') + (f.flipV ? ' flipV="1"' : '')
      xml += ankerAuf(
        geo,
        { x, y, w: f.w, h: f.h },
        `<xdr:cxnSp macro=""><xdr:nvCxnSpPr><xdr:cNvPr id="${id}" name="${esc(f.name)}"/><xdr:cNvCxnSpPr/></xdr:nvCxnSpPr>` +
          `<xdr:spPr><a:xfrm${flip}><a:off x="${x}" y="${y}"/><a:ext cx="${f.w}" cy="${f.h}"/></a:xfrm><a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom>${ln('262626')}</xdr:spPr></xdr:cxnSp>`,
      )
    } else if (f.textfeld) {
      const text = f.text
        ? `<xdr:txBody><a:bodyPr wrap="none" rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="de-DE" sz="1100"/><a:t>${esc(f.text)}</a:t></a:r></a:p></xdr:txBody>`
        : '<xdr:txBody><a:bodyPr wrap="none" rtlCol="0" anchor="t"/><a:lstStyle/><a:p><a:endParaRPr lang="de-DE" sz="1100"/></a:p></xdr:txBody>'
      xml += ankerAuf(
        geo,
        { x, y, w: f.w, h: f.h },
        `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name="${esc(f.name)}"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr>` +
          `<xdr:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${f.w}" cy="${f.h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></xdr:spPr>${text}</xdr:sp>`,
      )
    } else {
      const fuellung = f === gs ? FARBE_GRUNDSTUECK : 'E7E6E6'
      xml += ankerAuf(
        geo,
        { x, y, w: f.w, h: f.h },
        `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name="${esc(f.name)}"/><xdr:cNvSpPr/></xdr:nvSpPr>` +
          `<xdr:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${f.w}" cy="${f.h}"/></a:xfrm><a:prstGeom prst="${f.typ === 'ellipse' ? 'ellipse' : 'rect'}"><a:avLst/></a:prstGeom>` +
          `<a:solidFill><a:srgbClr val="${fuellung}"/></a:solidFill>${ln(f === gs ? '595959' : '262626')}</xdr:spPr></xdr:sp>`,
      )
    }
  }
  return xml + '</xdr:wsDr>'
}

/** Vorlage mit den Bau-Formen als Drawing im Skizzen-Blatt (für Tests und Vergleichsbild). */
export async function vorlageMitBauFormen(vorlage: ArrayBuffer | Uint8Array, formen: BauForm[]): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(vorlage)
  const blattPfad = await findeBlattPfad(zip, SKIZZE_BLATTNAME)
  if (!blattPfad) throw new Error('Skizzen-Blatt fehlt')
  const blattXml = await zip.file(blattPfad)!.async('string')
  zip.file('xl/drawings/drawing9.xml', bauFormenDrawing(formen, blattXml))
  return zip.generateAsync({ type: 'arraybuffer' })
}
