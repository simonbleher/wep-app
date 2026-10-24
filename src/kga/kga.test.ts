import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { KgaAuswahl } from '../app/KgaAuswahl'
import { KGA_LISTE, findeKga } from '.'

describe('KGA-Liste', () => {
  it('enthält die 56 Anlagen des Bezirksverbands, ohne Doppelte', () => {
    expect(KGA_LISTE).toHaveLength(56)
    expect(new Set(KGA_LISTE).size).toBe(KGA_LISTE.length)
    expect(KGA_LISTE[0]).toBe('Alt-Rosenthal')
    expect(KGA_LISTE.at(-1)).toBe('Zur Neuen Baumschule')
    expect(KGA_LISTE).toContain('In Pankow am Schloßpark')
  })

  it('findeKga erkennt andere Schreibweisen (Bindestrich, Leerzeichen, Groß-/Kleinschreibung, ß)', () => {
    expect(findeKga('Rosenthal Süd')).toBe('Rosenthal-Süd')
    expect(findeKga('  rosenthal-nord ')).toBe('Rosenthal-Nord')
    expect(findeKga('In Pankow am Schlosspark')).toBe('In Pankow am Schloßpark')
    expect(findeKga('Str vor Schönholz')).toBe('Str. vor Schönholz')
    expect(findeKga('KGA Musterwiese')).toBeUndefined()
    expect(findeKga('')).toBeUndefined()
  })
})

const render = (wert: string) => renderToStaticMarkup(createElement(KgaAuswahl, { label: 'Kleingartenanlage', wert, onChange: () => {} }))

describe('KgaAuswahl', () => {
  it('Auswahlliste mit allen Anlagen, „bitte wählen“ und „Andere …“', () => {
    const h = render('')
    expect(h).toContain('<select')
    expect(h).toContain('– bitte wählen –')
    expect(h).toContain('Wasserwerk Rosenthal')
    expect(h).toContain('Andere …')
    expect(h).not.toContain('Name der Kleingartenanlage') // kein freies Feld, solange nichts Eigenes gewählt ist
  })

  it('ein Eintrag der Liste ist ausgewählt, auch bei anderer Schreibweise aus der Bau-Excel', () => {
    expect(render('Pankegrund')).toMatch(/<option value="Pankegrund" selected/)
    expect(render('Rosenthal Süd')).toMatch(/<option value="Rosenthal-Süd" selected/)
  })

  it('eigene Anlage: „Andere …“ gewählt, freies Feld mit dem Namen (nichts gesperrt)', () => {
    const h = render('KGA Musterwiese')
    expect(h).toMatch(/<option value="__andere__" selected/)
    expect(h).toContain('aria-label="Name der Kleingartenanlage"')
    expect(h).toContain('value="KGA Musterwiese"')
  })
})
