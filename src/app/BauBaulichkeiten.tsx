// Reiter „Baulichkeiten“ (Beta 4, Paket 2): Bauteile (Laube, Anbauten, Schuppen, Gewächshaus, Vorplatz, Keller) mit
// Maßen, Baujahr, Bauklasse-Assistent und Rechenweg, Baupreisindex, Baubeschreibung. Alles überschreibbar, nur Hinweise.
import { useId, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import type { BauDaten, Bauteil, BauteilArt, Wep } from '@/model'
import type { WepAendern } from '@/fotos'
import {
  MATERIALIEN,
  MINDERUNG_PRO_JAHR,
  NHK_TABELLE,
  assistentLuecke,
  alterInJahren,
  bauklasseAusAngaben,
  berechneBau,
  hinweiseBau,
  hinweiseBauteil,
  mangelProzent,
  nhkEintrag,
  rnEffektiv,
  schlageBaubeschreibungVor,
  schlageRestnutzungVor,
  tabellenEnde,
  typFuer,
  wertjahrVon,
  vorplatzNhk,
  type BauErgebnis,
} from '@/bau'
import { zahlDe } from '@/gruen/format'
import { AuswahlFeld, BauHinweise, Rechenweg, Schalter, TextFeld, ZahlFeld } from './BauKomponenten'
import { BAUTEIL_ARTEN, aendereBauTeil, artText, ersetzeBauteil, mitFlaeche } from './bauHelfer'
import { ICON, Kopf, LeerZustand, Rueckfrage, euroFormat } from './ui'
import { Building2 } from 'lucide-react'

interface Props {
  wep: Wep
  aendere: WepAendern
  profilIndex?: Record<string, number>
  /** Öffnet das Formular eines Bauteils (vorhanden: `id`) oder eines neuen (`neu` = Art); es füllt die Seite wie die anderen Formulare. */
  onOeffnen: (ziel: { id: string } | { neu: BauteilArt }) => void
}

const BAUJAHR_QUELLEN = ['lt. Bauschein', 'lt. Angabe', 'geschätzt']

export function ergebnisVon(erg: BauErgebnis, id: string) {
  const haupt = [erg.laube, ...erg.anbauten, erg.schuppen].find((x) => x?.bauteil.id === id)
  if (haupt) return { wert: haupt.wert, bauklasse: haupt.bauklasse, flaeche: haupt.flaeche, haupt }
  if (erg.gewaechshaus?.bauteil.id === id) return { wert: erg.gewaechshaus.wert, bauklasse: '', flaeche: erg.gewaechshaus.flaeche }
  if (erg.vorplatz?.bauteil.id === id) return { wert: erg.vorplatz.wert, bauklasse: '', flaeche: erg.vorplatz.flaeche }
  return { wert: 0, bauklasse: '', flaeche: 0 }
}

export function BaulichkeitenTab({ wep, aendere, profilIndex, onOeffnen }: Props) {
  const [neuWahl, setNeuWahl] = useState(false)
  const bau = wep.bau
  const erg = berechneBau(wep, { profilIndex })

  const bauteile = bau?.bauteile ?? []
  const hinweise = hinweiseBau(wep, { profilIndex }).filter((h) => h.bereich === 'index' || h.bereich === 'bauteile')
  const allgemein = hinweise.filter((h) => !h.bauteilId)

  return (
    <>
      <header className="seitenkopf">
        <div>
          <h1 className="h1">Baulichkeiten</h1>
          <p className="neben">{bauteile.length === 1 ? '1 Bauteil' : `${bauteile.length} Bauteile`}</p>
        </div>
        <button type="button" className="knopf knopf-primaer" onClick={() => setNeuWahl(true)}>
          <Plus {...ICON} />
          Bauteil
        </button>
      </header>
      <p className="neben block">
        Außenmaße, Baujahr, Bauklasse und Zustand der baulichen Anlagen. Die App schlägt vor, du kannst alles überschreiben.
      </p>

      <IndexKarte wep={wep} aendere={aendere} profilIndex={profilIndex} />
      <BauHinweise hinweise={allgemein} mitInfo={false} />

      {bauteile.length === 0 ? (
        <LeerZustand
          icon={Building2}
          titel="Noch keine Bauteile"
          text="Lege zuerst die Laube an, dann Anbauten, Schuppen, Gewächshaus und den überdachten Laubenvorplatz."
          aktion={
            <button type="button" className="knopf knopf-primaer" onClick={() => onOeffnen({ neu: 'laube' })}>
              <Plus {...ICON} />
              Laube anlegen
            </button>
          }
        />
      ) : (
        <>
          <ul className="liste" aria-label="Bauteile">
            {bauteile.map((b) => {
              const e = erg ? ergebnisVon(erg, b.id) : undefined
              const neben = [
                b.flaeche > 0 ? `${zahlDe(b.flaeche)} m²` : 'Fläche fehlt',
                e?.bauklasse ? `Bauklasse ${e.bauklasse}` : undefined,
                b.baujahr ? `Baujahr ${b.baujahr}` : 'Baujahr fehlt',
                b.nichtBewerten ? 'nicht bewertet' : undefined,
              ].filter(Boolean)
              const eigene = hinweise.filter((h) => h.bauteilId === b.id && h.schwere === 'warnung')
              return (
                <li key={b.id}>
                  <button type="button" className="zeile" onClick={() => onOeffnen({ id: b.id })}>
                    <span className="zeile-text">
                      <span className="zeile-titel">
                        {b.kuerzel} · {artText(b.art)}
                        {b.bezeichnung ? ` (${b.bezeichnung})` : ''}
                      </span>
                      <span className="neben">{neben.join(' · ')}</span>
                    </span>
                    <span className="zahl c-summe">{euroFormat(e?.wert ?? 0)}</span>
                    <ChevronRight {...ICON} className="chevron" />
                  </button>
                  <BauHinweise hinweise={eigene} mitInfo={false} />
                </li>
              )
            })}
          </ul>
          {erg && (
            <>
              <div className="summe">
                <span>Bauteile</span>
                <span className="zahl">{euroFormat(erg.summeBauteile + (erg.vorplatz?.wert ?? 0))}</span>
              </div>
              <div className="summe" aria-label="Baulichkeiten insgesamt">
                <span>Baulichkeiten insgesamt (mit Abwasser)</span>
                <span className="zahl">{euroFormat(erg.insgesamt)}</span>
              </div>
              {erg.nichtBerechneteFlaeche > 0 && (
                <p className="neben">Nicht berechnete Bauflächen: {zahlDe(erg.nichtBerechneteFlaeche)} m²</p>
              )}
            </>
          )}
        </>
      )}

      <Baubeschreibung wep={wep} aendere={aendere} profilIndex={profilIndex} />

      {neuWahl && (
        <ArtWahl
          onAbbrechen={() => setNeuWahl(false)}
          onWaehle={(a) => {
            setNeuWahl(false)
            onOeffnen({ neu: a })
          }}
        />
      )}
    </>
  )
}

function ArtWahl({ onAbbrechen, onWaehle }: { onAbbrechen: () => void; onWaehle: (a: BauteilArt) => void }) {
  return (
    <div className="dialog-hintergrund">
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Bauteil hinzufügen">
        <h2 className="h2">Bauteil hinzufügen</h2>
        <ul className="liste">
          {BAUTEIL_ARTEN.map((a) => (
            <li key={a.art}>
              <button type="button" className="zeile" onClick={() => onWaehle(a.art)}>
                <span className="zeile-text">
                  <span className="zeile-titel">{a.text}</span>
                  <span className="neben">Kürzel {a.kurz}</span>
                </span>
                <ChevronRight {...ICON} className="chevron" />
              </button>
            </li>
          ))}
        </ul>
        <div className="dialog-knoepfe">
          <button type="button" className="knopf" onClick={onAbbrechen}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  )
}

/** Baupreisindex: Wert, Jahr und Quelle; am WEP von Hand änderbar (Profil: Werte je Jahr). */
function IndexKarte({ wep, aendere, profilIndex }: { wep: Wep; aendere: WepAendern; profilIndex?: Record<string, number> }) {
  const [aendern, setAendern] = useState(false)
  const jahr = wertjahrVon(wep)
  const erg = berechneBau({ ...wep, bau: wep.bau ?? { bauteile: [], abwasser: { art: 'keine', grube: {}, kanal: {} }, nichtBeraeumt: { aktiv: false }, ausstattung: {}, beschreibung: '', beseitigung: [] } }, { profilIndex })
  const i = erg?.index
  return (
    <section className="abschnitt index-karte" aria-label="Baupreisindex">
      <div className="preis-zeile">
        <span>
          Baupreisindex {jahr} (2015 = 100): <strong className="zahl">{i ? zahlDe(i.wert, 1) : 'fehlt'}</strong>
        </span>
        <button type="button" className="textknopf" onClick={() => setAendern(!aendern)}>
          {aendern ? 'Fertig' : 'Ändern'}
        </button>
      </div>
      <p className="neben">
        {i ? i.quelle : 'Kein Wert bekannt – bitte eintragen.'}
        {i?.manuell ? ' (von Hand gesetzt)' : ''}
      </p>
      {aendern && (
        <>
          <ZahlFeld
            label="Index für dieses WEP"
            wert={i?.wert}
            onChange={(v) =>
              void aendere((w) =>
                aendereBauTeil(w, (b) => ({
                  ...b,
                  index: v ? { jahr, wert: v, quelle: 'Eingabe am WEP', manuell: true } : undefined,
                })),
              )
            }
            hilfe="Richtlinie S. 11: Index des IV. Quartals des Vorjahres (Amt für Statistik Berlin-Brandenburg). Werte je Jahr stehen auch im Profil."
          />
          {wep.bau?.index?.manuell && (
            <button type="button" className="textknopf" onClick={() => void aendere((w) => aendereBauTeil(w, (b) => ({ ...b, index: undefined })))}>
              Zurück auf den Wert der App
            </button>
          )}
        </>
      )}
    </section>
  )
}

function Baubeschreibung({ wep, aendere, profilIndex }: { wep: Wep; aendere: WepAendern; profilIndex?: Record<string, number> }) {
  const id = useId()
  const bau = wep.bau
  const vorschlag = schlageBaubeschreibungVor(wep, { profilIndex })
  const text = bau?.beschreibungManuell ? bau.beschreibung : vorschlag
  const setze = (fn: (b: BauDaten) => BauDaten) => void aendere((w) => aendereBauTeil(w, fn))
  const a = bau?.ausstattung ?? {}
  return (
    <section className="abschnitt" aria-labelledby={`${id}-bb`}>
      <h2 className="gruppenkopf" id={`${id}-bb`}>
        Baubeschreibung
      </h2>
      <div className="feld-reihe">
        <AuswahlFeld
          label="Wasseranschluss"
          wert={a.wasser ?? ''}
          optionen={[{ wert: 'vorhanden', text: 'vorhanden' }, { wert: 'fehlt', text: 'fehlt' }]}
          onChange={(v) => setze((b) => ({ ...b, ausstattung: { ...b.ausstattung, wasser: v } }))}
        />
        <AuswahlFeld
          label="Elektrizität"
          wert={a.strom ?? ''}
          optionen={[{ wert: 'vorhanden', text: 'vorhanden' }, { wert: 'fehlt', text: 'fehlt' }]}
          onChange={(v) => setze((b) => ({ ...b, ausstattung: { ...b.ausstattung, strom: v } }))}
        />
      </div>
      <AuswahlFeld
        label="WC / Toilette"
        wert={a.wc ?? ''}
        optionen={[{ wert: 'wc', text: 'WC' }, { wert: 'trockentoilette', text: 'Trockentoilette' }, { wert: 'fehlt', text: 'fehlt' }]}
        onChange={(v) => setze((b) => ({ ...b, ausstattung: { ...b.ausstattung, wc: v } }))}
      />
      <TextFeld
        label="Beschreibung (Freitext)"
        wert={text}
        mehrzeilig
        onChange={(v) => setze((b) => ({ ...b, beschreibung: v, beschreibungManuell: true }))}
        hilfe={
          bau?.beschreibungManuell
            ? 'Von Hand geändert. Der Vorschlag aus den Bauteilen überschreibt den Text nicht mehr.'
            : 'Vorschlag aus den Bauteilen; er passt sich an, bis du den Text änderst. Richtlinie S. 24: Wasser, WC und Elektrizität vermerken.'
        }
      />
      {bau?.beschreibungManuell && (
        <button type="button" className="textknopf" onClick={() => setze((b) => ({ ...b, beschreibung: vorschlag, beschreibungManuell: false }))}>
          Vorschlag aus den Bauteilen wieder verwenden
        </button>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Formular eines Bauteils
// ---------------------------------------------------------------------------

export function BauteilFormular({
  wep,
  start,
  neu,
  profilIndex,
  onAbbrechen,
  onFertig,
  onLoeschen,
  onMaengel,
}: {
  wep: Wep
  start: Bauteil
  neu: boolean
  profilIndex?: Record<string, number>
  onAbbrechen: () => void
  onFertig: (b: Bauteil) => void
  onLoeschen: () => void
  onMaengel: (b: Bauteil) => void
}) {
  const [b, setB] = useState<Bauteil>(start)
  const [frage, setFrage] = useState(false)
  const set = (p: Partial<Bauteil>) => setB((x) => mitFlaeche({ ...x, ...p }))

  // Live-Rechnung mit dem Entwurf
  const probe = aendereBauTeil(wep, (d) => ersetzeBauteil(d, b))
  const erg = berechneBau(probe, { profilIndex })!
  const e = ergebnisVon(erg, b.id)
  const hinweise = hinweiseBauteil(b, erg)
  const wj = erg.wertjahr
  const haupt = b.art === 'laube' || b.art === 'anbau' || b.art === 'schuppen' || b.art === 'keller'
  const typ = typFuer(b)
  const eintrag = nhkEintrag(typ)
  const vorschlag = bauklasseAusAngaben(b)
  const luecke = assistentLuecke(b)
  const alter = alterInJahren(b.baujahr, wj)
  const spalte = eintrag ? eintrag.spalte : 5
  const rnVorschlag = spalte !== 5 ? schlageRestnutzungVor(spalte as 2 | 3 | 4, b.baujahr, wj) : undefined
  const rn = haupt ? rnEffektiv(b, spalte, wj, erg.laube?.restnutzungsjahre) : undefined
  const titel = neu ? `${artText(b.art)} hinzufügen` : `${b.kuerzel} · ${artText(b.art)}`

  return (
    <div className="hinzufuegen bearbeiten" data-schritt="bauteil">
      <Kopf
        titel={titel}
        unter="Baulichkeiten"
        links={
          <button type="button" className="textknopf" onClick={onAbbrechen}>
            Abbrechen
          </button>
        }
      />
      <header className="seitenkopf nur-tablet">
        <div>
          <h1 className="h1">{titel}</h1>
          <p className="neben">Baulichkeiten</p>
        </div>
        <button type="button" className="knopf" onClick={onAbbrechen}>
          <ChevronLeft {...ICON} />
          Abbrechen
        </button>
      </header>

      <div className="formular formular-pos">
        <div className="feld-reihe">
          <TextFeld label="Kürzel (BT)" wert={b.kuerzel} onChange={(v) => set({ kuerzel: v })} />
          <TextFeld label="Bezeichnung" wert={b.bezeichnung ?? ''} onChange={(v) => set({ bezeichnung: v || undefined })} platzhalter="z. B. Anbau Süd" />
        </div>

        <fieldset className="fieldset abschnitt">
          <legend className="label">Maße (Außenmaße{b.art === 'keller' ? ', beim Keller Innenmaße' : ''})</legend>
          <div className="feld-reihe">
            <ZahlFeld label="Länge" einheit="m" wert={b.laenge} onChange={(v) => set({ laenge: v })} />
            <ZahlFeld label="Breite" einheit="m" wert={b.breite} onChange={(v) => set({ breite: v })} />
          </div>
          <div className="feld-reihe">
            <ZahlFeld
              label="Fläche"
              einheit="m²"
              wert={b.flaeche > 0 ? b.flaeche : undefined}
              onChange={(v) => setB((x) => ({ ...x, flaeche: v ?? 0, flaecheManuell: v !== undefined, ...(x.ausGrundriss ? { ausGrundriss: false } : {}) }))}
              hilfe={
                b.ausGrundriss
                  ? 'Aus dem Grundriss (Skizze Bau). Ändern Sie das Maß dort – oder überschreiben Sie die Fläche hier von Hand.'
                  : b.ausGrundriss === false
                    ? 'Von Hand gesetzt; der Grundriss überschreibt sie nicht.'
                    : b.flaecheManuell && b.laenge && b.breite
                      ? `Von Hand gesetzt (Länge × Breite wären ${zahlDe(b.laenge * b.breite)} m²).`
                      : 'Länge × Breite, überschreibbar.'
              }
            />
            <ZahlFeld label={b.art === 'gewaechshaus' ? 'Firsthöhe' : 'Höhe'} einheit="m" wert={b.hoehe} onChange={(v) => set({ hoehe: v })} />
          </div>
          {b.ausGrundriss === false && (
            <button type="button" className="textknopf" onClick={() => setB((x) => ({ ...x, ausGrundriss: undefined }))}>
              Fläche wieder aus dem Grundriss übernehmen
            </button>
          )}
          {b.flaecheManuell && !b.ausGrundriss && (
            <button type="button" className="textknopf" onClick={() => setB((x) => mitFlaeche({ ...x, flaecheManuell: false, ausGrundriss: undefined }))}>
              Fläche wieder aus den Maßen berechnen
            </button>
          )}
        </fieldset>

        <div className="feld-reihe">
          <ZahlFeld label="Baujahr" wert={b.baujahr} onChange={(v) => set({ baujahr: v })} hilfe={alter !== undefined ? `Alter ${alter} Jahre (das Baujahr zählt als volles Jahr, Richtlinie S. 8)` : 'Der Unterpächter weist es nach, sonst schätzt es der Wertermittler (S. 9).'} />
          <AuswahlFeld
            label="Quelle des Baujahrs"
            wert={b.baujahrQuelle ?? ''}
            optionen={BAUJAHR_QUELLEN.map((q) => ({ wert: q, text: q }))}
            onChange={(v) => set({ baujahrQuelle: v })}
          />
        </div>

        {haupt && (
          <fieldset className="fieldset abschnitt">
            <legend className="label">Bauklasse (Assistent, Richtlinie S. 4–5)</legend>
            <AuswahlFeld
              label="Material"
              wert={b.material ?? ''}
              optionen={MATERIALIEN.map((m) => ({ wert: m.id, text: m.text }))}
              onChange={(v) => set({ material: v })}
            />
            <p className="neben">{MATERIALIEN.find((m) => m.id === b.material)?.hilfe ?? 'Stein, Holz doppelwandig, Blockhaus oder Holz einwandig.'}</p>
            <ZahlFeld label="Wanddicke" einheit="cm" wert={b.wanddickeCm} onChange={(v) => set({ wanddickeCm: v })} />
            <Schalter
              label="Typenlaube GL 10 bis GL 19 oder einfache Holzlaube bis 4 cm"
              an={Boolean(b.typenlaube)}
              onChange={(v) => set({ typenlaube: v || undefined })}
              hilfe="Wird immer mit Bauklasse IV.1 bewertet (Richtlinie S. 5)."
            />
            <p className="ok" role="status">
              {vorschlag
                ? `Vorschlag: Bauklasse ${vorschlag.bauklasse}, NHK ${euroFormat(vorschlag.nhk)} je m². ${vorschlag.grund}`
                : (luecke ?? 'Kein Vorschlag.')}
              {vorschlag?.hinweis ? ` ${vorschlag.hinweis}` : ''}
            </p>
            <AuswahlFeld
              label="Bauklasse in der Vorlage (überschreibt den Vorschlag)"
              wert={typ}
              optionen={[
                ...[...NHK_TABELLE]
                  .sort((x, y) => x.bauklasse.localeCompare(y.bauklasse) || x.typ.localeCompare(y.typ))
                  .map((x) => ({ wert: x.typ, text: `${x.bauklasse} · ${x.typ.trim()} · ${x.nhk} €/m²` })),
                { wert: 'fehlt', text: 'fehlt (keine Bauklasse)' },
              ]}
              onChange={(v) => set({ typ: v, typManuell: v !== undefined })}
            />
            {b.typManuell && (
              <button type="button" className="textknopf" onClick={() => set({ typ: undefined, typManuell: false })}>
                Zurück auf den Vorschlag
              </button>
            )}
          </fieldset>
        )}

        {haupt && (
          <fieldset className="fieldset abschnitt">
            <legend className="label">Restnutzungsjahre (Richtlinie S. 8–10)</legend>
            <ZahlFeld
              label="Restnutzungsjahre"
              wert={rn}
              onChange={(v) => set({ restnutzungsjahre: v, rnManuell: v !== undefined })}
              hilfe={
                rnVorschlag !== undefined && spalte !== 5
                  ? `Vorschlag ${rnVorschlag} Jahre (Tabelle für Bauklasse ${eintrag?.bauklasse} bis ${tabellenEnde(spalte as 2 | 3 | 4)} Jahre minus Alter ${alter}). Bei mangelfreiem, wirtschaftlich abgeschriebenem Zustand bis 20 Jahre mit Begründung.`
                  : 'Ohne Baujahr und Bauklasse kein Vorschlag.'
              }
            />
            {b.rnManuell && (
              <>
                <TextFeld label="Begründung der Restnutzungsdauer" wert={b.rnBegruendung ?? ''} onChange={(v) => set({ rnBegruendung: v })} />
                <button type="button" className="textknopf" onClick={() => set({ rnManuell: false, restnutzungsjahre: undefined, rnBegruendung: undefined })}>
                  Vorschlag übernehmen
                </button>
              </>
            )}
          </fieldset>
        )}

        {b.art === 'schuppen' && (
          <p className="neben">
            Schuppen und Unterstände neben einer Laube werden nicht bewertet. Hängt der Schuppen direkt an einer Laube unter 24 m², als
            Anbau erfassen.
          </p>
        )}

        {b.art === 'gewaechshaus' && (
          <fieldset className="fieldset abschnitt">
            <legend className="label">Gewächshaus (Richtlinie S. 11 a)</legend>
            <ZahlFeld label="NHK" einheit="€ je m²" wert={b.nhk} onChange={(v) => set({ nhk: v })} hilfe="Bis 160 € je m², Grundfläche höchstens 12 m², Firsthöhe höchstens 2,20 m." />
            <MinderungFeld b={b} set={set} />
          </fieldset>
        )}

        {b.art === 'vorplatz' && (
          <fieldset className="fieldset abschnitt">
            <legend className="label">Überdachter Laubenvorplatz (Richtlinie S. 11)</legend>
            <AuswahlFeld
              label="Lage"
              wert={b.vorplatzLage ?? 'integriert'}
              optionen={[{ wert: 'integriert', text: 'integriert (verlängertes Dach der Laube)' }, { wert: 'angebaut', text: 'angebaut' }]}
              onChange={(v) => set({ vorplatzLage: v ?? 'integriert' })}
            />
            {b.vorplatzLage === 'angebaut' && (
              <>
                <AuswahlFeld
                  label="Güte"
                  wert={b.vorplatzGuete ?? 'ohne'}
                  optionen={[{ wert: 'hochwertig', text: 'hochwertig (bis 175 € je m²)' }, { wert: 'minderwertig', text: 'minderwertig (bis 80 € je m²)' }, { wert: 'ohne', text: 'ohne Wert' }]}
                  onChange={(v) => set({ vorplatzGuete: v ?? 'ohne' })}
                />
                <MinderungFeld b={b} set={set} />
              </>
            )}
            <ZahlFeld
              label="NHK"
              einheit="€ je m²"
              wert={b.nhk}
              onChange={(v) => set({ nhk: v })}
              hilfe={`Leer = Regelwert ${euroFormat(vorplatzNhk({ ...b, nhk: undefined }, erg.laube))} je m² (integriert: nach Bauklasse der Laube, Vorlage; höchstens 275 €).`}
            />
          </fieldset>
        )}

        {b.art === 'keller' && (
          <Schalter label="Zustimmung oder Genehmigung liegt vor" an={Boolean(b.genehmigt)} onChange={(v) => set({ genehmigt: v })} hilfe="Kellerräume sind nur dann zu bewerten (Richtlinie S. 3 Nr. 3)." />
        )}

        <Schalter
          label="Nicht bewerten"
          an={Boolean(b.nichtBewerten)}
          onChange={(v) => set({ nichtBewerten: v || undefined })}
          hilfe="Widerrechtlich errichtet oder bautechnisch nicht mehr nutzbar: wird nicht bewertet und ist zu entfernen (Richtlinie S. 3 Nr. 4)."
        />

        <div className="feld">
          <span className="label">Mängelabzug</span>
          <button type="button" className="zeile feldzeile" onClick={() => onMaengel(b)}>
            <span className="zeile-text">
              <span className="zeile-titel">{zahlDe(mangelProzent(b))} %</span>
              <span className="neben">{b.maengel.length ? `${b.maengel.length} Eintrag${b.maengel.length === 1 ? '' : 'e'}` : 'Noch keine Mängel erfasst'}</span>
            </span>
            <ChevronRight {...ICON} className="chevron" />
          </button>
          <p className="neben">Wird im Reiter „Mängel“ erfasst; das Bauteil wird dabei gespeichert.</p>
        </div>

        <TextFeld label="Notiz" wert={b.notiz ?? ''} onChange={(v) => set({ notiz: v || undefined })} mehrzeilig />

        {e.haupt ? <Rechenweg e={e.haupt} /> : <Ergebnis b={b} erg={erg} />}
        <BauHinweise hinweise={hinweise.map((h) => ({ ...h }))} />

        {!neu && (
          <button type="button" className="knopf knopf-loeschen knopf-breit" onClick={() => setFrage(true)}>
            <Trash2 {...ICON} />
            Löschen
          </button>
        )}

        <div className="formular-fuss">
          <div className="summe summe-klein">
            <span>Wert</span>
            <span className="zahl">{euroFormat(e.wert)}</span>
          </div>
          <button type="button" className="knopf knopf-primaer knopf-breit" onClick={() => onFertig(b)}>
            {neu ? 'Hinzufügen' : 'Speichern'}
          </button>
        </div>
      </div>

      {frage && (
        <Rueckfrage
          titel="Bauteil löschen?"
          text={`${b.kuerzel} wird aus der Liste entfernt. Das lässt sich nicht rückgängig machen.`}
          onAbbrechen={() => setFrage(false)}
          onBestaetigen={onLoeschen}
        />
      )}
    </div>
  )
}

function MinderungFeld({ b, set }: { b: Bauteil; set: (p: Partial<Bauteil>) => void }) {
  return (
    <AuswahlFeld
      label="Alterswertminderung je Jahr"
      wert={b.minderungProJahr ?? ''}
      optionen={MINDERUNG_PRO_JAHR.map((m) => ({ wert: m.prozent, text: `${m.prozent} % (Lebenserwartung ${m.jahre} Jahre)${m.prozent === 5 ? ', Regelwert' : ''}` }))}
      onChange={(v) => set({ minderungProJahr: v === undefined ? undefined : Number(v) })}
    />
  )
}

function Ergebnis({ b, erg }: { b: Bauteil; erg: BauErgebnis }) {
  const g = erg.gewaechshaus?.bauteil.id === b.id ? erg.gewaechshaus : undefined
  const v = erg.vorplatz?.bauteil.id === b.id ? erg.vorplatz : undefined
  if (g) {
    return (
      <dl className="werte rechenweg" aria-label="Rechenweg">
        <div><dt>NHK</dt><dd className="zahl">{euroFormat(g.nhk)} je m²</dd></div>
        <div><dt>abzüglich Mängel {zahlDe(g.maengelProzent)} %</dt><dd className="zahl">{euroFormat(g.nachMaengeln)} je m²</dd></div>
        <div><dt>abzüglich Altersabzug {zahlDe(g.altersabzugProzent)} % ({g.alter ?? 0} Jahre × {g.minderungProJahr} %){g.abgeschrieben ? ' – abgeschrieben' : ''}</dt><dd className="zahl">{euroFormat(g.nachAlter)} je m²</dd></div>
        <div><dt>mal Baupreisindex {zahlDe(erg.indexFaktor * 100, 1)} / 100</dt><dd className="zahl">{euroFormat(g.wertProM2)} je m²</dd></div>
        <div className="rechenweg-summe"><dt>mal {zahlDe(g.flaeche)} m²</dt><dd className="zahl">{euroFormat(g.wert)}</dd></div>
      </dl>
    )
  }
  if (v) {
    return (
      <dl className="werte rechenweg" aria-label="Rechenweg">
        <div><dt>{v.lage === 'integriert' ? 'integriert' : 'angebaut'}, NHK</dt><dd className="zahl">{euroFormat(v.nhk)} je m²</dd></div>
        <div><dt>Mängelabzug {zahlDe(v.maengelProzent)} %{v.lage === 'integriert' ? ' (wie Laube)' : ''}, Altersabzug {zahlDe(v.altersabzugProzent)} %{v.lage === 'integriert' ? ' (wie Laube)' : ''}</dt><dd className="zahl">{euroFormat(v.wertProM2)} je m²</dd></div>
        <div className="rechenweg-summe"><dt>mal {zahlDe(v.flaeche)} m² (nach Baupreisindex)</dt><dd className="zahl">{euroFormat(v.wert)}</dd></div>
      </dl>
    )
  }
  return null
}
