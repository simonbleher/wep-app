/**
 * Tests für die Ausrichtung Foto → Excel-EMU (Skizzen-Testlauf).
 * Grundlage: anonymisierter Fall 1 (nur Geometrie, keine Personendaten).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { erkenneBauObjekte, klasseVonElement, klasseVonText, richteAus, type BauForm } from '../ausrichtung'
import type { SkizzenSoll } from '../schema'

const FALL = join(dirname(fileURLToPath(import.meta.url)), '../../faelle-skizze/fall1')
const formen = (JSON.parse(readFileSync(join(FALL, 'bau-formen.json'), 'utf8')) as { formen: BauForm[] }).formen
const soll = JSON.parse(readFileSync(join(FALL, 'soll.json'), 'utf8')) as SkizzenSoll

describe('Bau-Formen', () => {
  it('erkennt Kürzel und Wörter', () => {
    expect(klasseVonText('L')).toBe('laube')
    expect(klasseVonText('A1')).toBe('anbau')
    expect(klasseVonText('Terrasse')).toBe('lvp')
    expect(klasseVonText('ASG')).toBe('asg')
    expect(klasseVonText('HW')).toBe('hw')
    expect(klasseVonText('Zugang Parz. X')).toBe('zugang')
    expect(klasseVonText('3,15')).toBeNull()
    expect(klasseVonText('Pavillon LVP')).toBe('lvp')
    expect(klasseVonText('Gehwegplatten/Beton')).toBeNull()
  })

  it('ordnet Beschriftungen ihrer Form zu und ignoriert Formen außerhalb des Grundstücks', () => {
    const { grundstueck, objekte } = erkenneBauObjekte(formen)
    expect(grundstueck).toEqual({ x: 556260, y: 2011680, w: 5257800, h: 5654040 })
    const name = (label: string) => objekte.filter((o) => o.label === label).map((o) => o.formName)
    expect(name('L')).toEqual(['Rechteck 9'])
    expect(name('Terrasse')).toEqual(['Rechteck 2'])
    expect(name('Pavillon')).toEqual(['Rechteck 45'])
    expect(name('ASG')).toEqual(['Ellipse 29']) // das zweite ASG (rechts außerhalb) fehlt
    expect(name('A1')).toEqual(['Rechteck 10'])
    expect(name('Brunnen')).toEqual(['Ellipse 43']) // Text über dem Kreis
  })
})

describe('Klasse eines Foto-Elements', () => {
  it('Beschriftung schlägt Typ bei Gebäuden, sonst nicht', () => {
    expect(klasseVonElement({ typ: 'pavillon', beschriftung: 'Pavillon LVP' })).toBe('lvp')
    expect(klasseVonElement({ typ: 'pavillon', beschriftung: 'Pavillon' })).toBe('pavillon')
    expect(klasseVonElement({ typ: 'laube', beschriftung: 'L' })).toBe('laube')
    expect(klasseVonElement({ typ: 'hochbeet', beschriftung: 'Laube' })).toBeNull()
    expect(klasseVonElement({ typ: 'tor', beschriftung: '' })).toBe('zugang')
  })
})

describe('Ausrichtung mit dem Soll von Fall 1', () => {
  const a = richteAus(soll.elemente, soll.grundstueck, formen)

  it('nutzt die Bezugsgebäude, nicht den Rahmen', () => {
    expect(a.methode).toBe('bezug')
    expect(a.bezuege.map((b) => b.klasse).sort()).toEqual(['asg', 'laube', 'lvp']) // „Pavillon LVP“ ist ein Kasten = LVP
    expect(a.restfehlerProzent).not.toBeNull()
    expect(a.restfehlerProzent!).toBeLessThan(15)
  })

  it('setzt nur Hochbeete und „Holzpferd entfernen“ als neu (wie im Soll)', () => {
    for (const z of a.zuordnungen) {
      const s = soll.elemente.find((e) => e === z.element)!
      expect(z.neu, `${s.typ} ${s.beschriftung}`).toBe(s.neu)
    }
  })

  it('neue Hochbeete liegen zwischen Laube und Grundstücksgrenze', () => {
    const laubeUnten = 5341620 + 1158240
    const gsUnten = 2011680 + 5654040
    for (const z of a.zuordnungen.filter((z) => z.element.typ === 'hochbeet')) {
      expect(z.emu.y).toBeGreaterThan(laubeUnten - 200_000)
      expect(z.emu.y + z.emu.h).toBeLessThan(gsUnten)
    }
  })

  it('fällt mit weniger als 2 Bezugsgebäuden auf den Grundstücksrahmen zurück', () => {
    const nurLaube = soll.elemente.filter((e) => !['lvp', 'pavillon', 'asg'].includes(e.typ))
    const r = richteAus(nurLaube, soll.grundstueck, formen)
    expect(r.methode).toBe('rahmen')
    expect(r.hinweise.join(' ')).toMatch(/Grundstücksrahmen/)
  })
})
