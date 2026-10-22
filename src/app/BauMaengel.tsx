// Reiter „Mängel“ (Beta 4, Paket 2): Checkliste der Mängeltabelle (Richtlinie S. 6–8) je Gruppe mit Höchstabzug.
// Der Wertermittler setzt den konkreten Abzug und begründet ihn; eigene Mängel sind erlaubt.
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Bauteil, Wep } from '@/model'
import type { WepAendern } from '@/fotos'
import { MAENGEL_GRUPPEN, MANGEL_EIGEN, berechneBau, hinweiseBau, mangelProzent } from '@/bau'
import { zahlDe } from '@/gruen/format'
import { BauHinweise, TextFeld, ZahlFeld } from './BauKomponenten'
import { aendereBauTeil, artText, ersetzeBauteil, mangelDerGruppe, setzeMangel } from './bauHelfer'
import { ICON, LeerZustand } from './ui'
import { TriangleAlert } from 'lucide-react'

interface Props {
  wep: Wep
  aendere: WepAendern
  profilIndex?: Record<string, number>
  /** Bauteil, das beim Öffnen gewählt ist. */
  start?: string
}

export function MaengelTab({ wep, aendere, profilIndex, start }: Props) {
  const kandidaten = (wep.bau?.bauteile ?? []).filter((b) => !(b.art === 'vorplatz' && (b.vorplatzLage ?? 'integriert') === 'integriert'))
  const [wahl, setWahl] = useState<string | undefined>(start)
  const aktuell = kandidaten.find((b) => b.id === wahl) ?? kandidaten.find((b) => b.art === 'laube') ?? kandidaten[0]

  if (!aktuell) {
    return (
      <>
        <header className="seitenkopf">
          <h1 className="h1">Mängel</h1>
        </header>
        <LeerZustand icon={TriangleAlert} titel="Noch kein Bauteil" text="Lege zuerst im Reiter „Baulichkeiten“ die Laube an. Die Mängel gehören zu einem Bauteil." />
      </>
    )
  }

  const speichere = (b: Bauteil) => void aendere((w) => aendereBauTeil(w, (d) => ersetzeBauteil(d, b)))
  const hinweise = hinweiseBau(wep, { profilIndex }).filter((h) => h.bereich === 'maengel' && (!h.bauteilId || h.bauteilId === aktuell.id))
  const gesamt = mangelProzent(aktuell)
  const eigene = aktuell.maengel.filter((m) => m.gruppe === MANGEL_EIGEN)
  const erg = berechneBau(wep, { profilIndex })

  return (
    <>
      <header className="seitenkopf">
        <div>
          <h1 className="h1">Mängel</h1>
          <p className="neben">Abzug von den Normalherstellungskosten (Richtlinie S. 6–8)</p>
        </div>
      </header>

      {kandidaten.length > 1 && (
        <div className="feld">
          <label className="label" htmlFor="maengel-bauteil">
            Bauteil
          </label>
          <select id="maengel-bauteil" className="eingabe" value={aktuell.id} onChange={(e) => setWahl(e.target.value)}>
            {kandidaten.map((b) => (
              <option key={b.id} value={b.id}>
                {b.kuerzel} · {artText(b.art)}
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="neben block">
        Kreuze die festgestellten Mängel an und setze je Gruppe den Abzug (höchstens der Wert in Klammern). Der Abzug wird von den NHK
        abgezogen und im Protokoll begründet. {aktuell.art === 'laube' ? 'Die Vorlage hat dafür das Blatt „Mängelliste“ (Abzug konkret).' : 'Die Vorlage hat nur für die Laube eine Mängelliste; hier zählt die Summe.'}
      </p>

      <div className="summe" aria-label="Gesamtabzug">
        <span>Gesamtabzug {aktuell.kuerzel}</span>
        <span className="zahl">{zahlDe(gesamt)} %</span>
      </div>
      <BauHinweise hinweise={hinweise} />

      <div className="maengel-gruppen">
        {MAENGEL_GRUPPEN.map((g) => {
          const m = mangelDerGruppe(aktuell, g.id)
          const ueber = m && g.id !== 'unfertig' && m.abzug > g.max
          return (
            <section key={g.id} className="maengel-gruppe" aria-label={g.name}>
              <div className="preis-zeile">
                <h2 className="gruppenkopf">
                  {g.name} {g.id === 'unfertig' ? '(je nach Zustand)' : `(bis ${g.max} %)`}
                </h2>
                <span className="neben">{g.seite}</span>
              </div>
              {g.maengel.length > 0 && (
                <details className="details" open={Boolean(m?.maengel.length)}>
                  <summary>
                    Mängel wählen{m?.maengel.length ? ` (${m.maengel.length})` : ''}
                  </summary>
                  <div className="ankreuz-liste">
                    {g.maengel.map((text) => (
                      <label key={text} className="ankreuzen">
                        <input
                          type="checkbox"
                          checked={Boolean(m?.maengel.includes(text))}
                          onChange={(e) =>
                            speichere(
                              setzeMangel(aktuell, g.id, {
                                maengel: e.target.checked ? [...(m?.maengel ?? []), text] : (m?.maengel ?? []).filter((x) => x !== text),
                              }),
                            )
                          }
                        />
                        <span>{text}</span>
                      </label>
                    ))}
                  </div>
                </details>
              )}
              <div className="feld-reihe">
                <ZahlFeld label="Abzug" einheit="%" wert={m?.abzug ? m.abzug : undefined} onChange={(v) => speichere(setzeMangel(aktuell, g.id, { abzug: v ?? 0 }))} platzhalter="0" />
                {g.id !== 'unfertig' && (
                  <div className="feld">
                    <span className="label">Höchstwert</span>
                    <button type="button" className="knopf" onClick={() => speichere(setzeMangel(aktuell, g.id, { abzug: g.max }))}>
                      {g.max} % setzen
                    </button>
                  </div>
                )}
              </div>
              {(m?.abzug || m?.maengel.length) && (
                <TextFeld label="Begründung" wert={m?.begruendung ?? ''} onChange={(v) => speichere(setzeMangel(aktuell, g.id, { begruendung: v }))} platzhalter="Befund beschreiben, Abzug erläutern" />
              )}
              {ueber && <p className="neben fehlertext">Über dem Höchstwert von {g.max} % – nur mit Begründung.</p>}
            </section>
          )
        })}

        <section className="maengel-gruppe" aria-label="Eigene Mängel">
          <h2 className="gruppenkopf">Eigene Mängel</h2>
          <p className="neben">
            Nicht ausgewiesene Mängel sind als Einzelfallentscheidung innerhalb der Prozentangabe des betroffenen Bauteils einzubeziehen
            (Richtlinie S. 8). Sie zählen zum Gesamtabzug, haben aber keine Zeile in der Mängelliste der Vorlage.
          </p>
          {eigene.map((m, i) => (
            <div key={i} className="maengel-eigen">
              <TextFeld
                label={`Mangel ${i + 1}`}
                wert={m.maengel[0] ?? ''}
                onChange={(v) => speichere({ ...aktuell, maengel: aktuell.maengel.map((x) => (x === m ? { ...m, maengel: [v] } : x)) })}
              />
              <div className="feld-reihe">
                <ZahlFeld label="Abzug" einheit="%" wert={m.abzug || undefined} onChange={(v) => speichere({ ...aktuell, maengel: aktuell.maengel.map((x) => (x === m ? { ...m, abzug: v ?? 0 } : x)) })} />
                <TextFeld label="Begründung" wert={m.begruendung} onChange={(v) => speichere({ ...aktuell, maengel: aktuell.maengel.map((x) => (x === m ? { ...m, begruendung: v } : x)) })} />
              </div>
              <button type="button" className="textknopf" onClick={() => speichere({ ...aktuell, maengel: aktuell.maengel.filter((x) => x !== m) })}>
                <Trash2 {...ICON} size={18} />
                Entfernen
              </button>
            </div>
          ))}
          <button
            type="button"
            className="zeile zeile-akzent"
            onClick={() => speichere({ ...aktuell, maengel: [...aktuell.maengel, { gruppe: MANGEL_EIGEN, maengel: [''], abzug: 0, begruendung: '' }] })}
          >
            <Plus {...ICON} />
            <span className="zeile-titel">Eigenen Mangel hinzufügen</span>
          </button>
        </section>
      </div>

      {erg && aktuell.art === 'laube' && erg.laube && (
        <p className="neben">
          Wirkung: {zahlDe(erg.laube.nhk)} € NHK − {zahlDe(erg.laube.maengelProzent)} % = {zahlDe(erg.laube.nachMaengeln)} € je m².
        </p>
      )}
    </>
  )
}
