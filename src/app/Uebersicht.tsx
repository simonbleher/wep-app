// Reiter „Übersicht“ (Wertermittler) und Detailansicht der BV-Kontrollseite: Formalien, Bewertung wie das Deckblatt und
// alle Positionen je Teil, Bau mit Rechenweg. Die Zahlen sind die des übersichtlichen PDF (`erstelleProtokoll`) –
// Wertermittler und BV sehen also dasselbe. Nur lesend; geändert wird in den Reitern.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { Rolle, Wep } from '@/model'
import type { Protokoll } from '@/pdf'
import type { BauteilRechnung, Posten, Zeile } from '@/pdf/uebersicht/daten'
import { abzugEuro, euro, flaeche, prozent, zahl } from '@/pdf/uebersicht/format'
import { erstelleProtokoll, type ProtokollOptionen } from './uebersichtDaten'
import { Meldung } from './ui'

/** Nach einer Änderung kurz warten, bevor neu gerechnet wird (der Export dauert einen Moment). */
const WARTEN_MS = 400

type Zustand = { typ: 'laedt' } | { typ: 'fertig'; protokoll: Protokoll } | { typ: 'fehler'; meldung: string }

export function Uebersicht({
  wep,
  rolle,
  optionen,
  titel = 'Übersicht',
  hinweis = 'Alle Beträge wie im Protokoll für den BV. Ändern kannst du sie in den einzelnen Reitern.',
  nachBewertung,
  unten,
}: {
  wep: Wep
  rolle: Rolle
  optionen?: ProtokollOptionen
  titel?: string
  hinweis?: string
  /** Zusätzlicher Inhalt direkt nach der Bewertung (z. B. Knöpfe der BV-Seite). */
  nachBewertung?: ReactNode
  /** Zusätzlicher Inhalt am Ende (z. B. Skizzen und Fotos auf der BV-Seite). */
  unten?: ReactNode
}) {
  const [zustand, setZustand] = useState<Zustand>({ typ: 'laedt' })
  const [rechnet, setRechnet] = useState(false)
  const optionenRef = useRef(optionen)
  optionenRef.current = optionen

  useEffect(() => {
    let aktiv = true
    setRechnet(true)
    const t = setTimeout(() => {
      erstelleProtokoll(wep, rolle, optionenRef.current)
        .then((protokoll) => aktiv && setZustand({ typ: 'fertig', protokoll }))
        .catch((e: unknown) => aktiv && setZustand({ typ: 'fehler', meldung: e instanceof Error ? e.message : String(e) }))
        .finally(() => aktiv && setRechnet(false))
    }, WARTEN_MS)
    return () => {
      aktiv = false
      clearTimeout(t)
    }
  }, [wep, rolle])

  return (
    <section className="uebersicht" aria-busy={rechnet}>
      <header className="seitenkopf">
        <div>
          <h1 className="h1">{titel}</h1>
          {hinweis && <p className="neben">{hinweis}</p>}
        </div>
      </header>
      {zustand.typ === 'laedt' && <p className="neben">Rechne …</p>}
      {zustand.typ === 'fehler' && (
        <Meldung alarm>
          <p>Die Übersicht konnte nicht berechnet werden: {zustand.meldung}</p>
        </Meldung>
      )}
      {zustand.typ === 'fertig' && <ProtokollAnsicht p={zustand.protokoll} nachBewertung={nachBewertung} />}
      {unten}
    </section>
  )
}

/** Das Protokoll als Seite (ohne Rechnen) – auch für Tests. */
export function ProtokollAnsicht({ p, nachBewertung }: { p: Protokoll; nachBewertung?: ReactNode }) {
  return (
    <>
      <Formalien p={p} />
      <Bewertung zeilen={p.bewertung} />
      {nachBewertung}
      <Baulichkeiten p={p} />
      <Maengel p={p} />
      <Abwasser p={p} />
      <Positionen titel="Außenanlagen" beschreibung={p.aussenBeschreibung} posten={p.aussenanlagen} summeText="Außenanlagen insgesamt" summe={p.aussenSumme} />
      <Positionen titel="Aufwuchs" beschreibung={p.aufwuchsBeschreibung} posten={p.aufwuchs} summeText="Aufwuchs insgesamt" summe={p.aufwuchsSumme} />
      <Beseitigung p={p} />
    </>
  )
}

function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  const id = useId()
  return (
    <section className="ueb-abschnitt" aria-labelledby={id}>
      <h2 className="ueb-h2" id={id}>
        {titel}
      </h2>
      {children}
    </section>
  )
}

function Formalien({ p }: { p: Protokoll }) {
  if (!p.formalien.length) return null
  return (
    <Abschnitt titel="Formalien">
      <dl className="ueb-formalien">
        {p.formalien.map((f) => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd>{f.wert}</dd>
          </div>
        ))}
      </dl>
    </Abschnitt>
  )
}

const zeilenKlasse = (art: Zeile['art']) => (art === 'gesamt' ? 'ueb-gesamt' : art === 'summe' ? 'ueb-summe' : undefined)

function Bewertung({ zeilen }: { zeilen: Zeile[] }) {
  return (
    <Abschnitt titel="Bewertung">
      <table className="ueb-tabelle ueb-bewertung">
        <tbody>
          {zeilen.map((z) => (
            <tr key={z.text} className={zeilenKlasse(z.art)}>
              <th scope="row">{z.art === 'minus' ? `abzüglich ${z.text}` : z.text}</th>
              <td className="zahl">{z.art === 'minus' ? abzugEuro(z.betrag) : euro(z.betrag)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Abschnitt>
  )
}

function Bauteil({ b }: { b: BauteilRechnung }) {
  return (
    <div className="ueb-bauteil">
      <h3 className="ueb-h3">{b.titel}</h3>
      {b.kopf && <p className="neben">{b.kopf}</p>}
      <table className="ueb-tabelle">
        <thead>
          <tr>
            <th scope="col">Rechenschritt</th>
            <th scope="col" className="zahl">
              Ergebnis
            </th>
          </tr>
        </thead>
        <tbody>
          {b.schritte
            .filter((s) => s.wert !== undefined)
            .map((s) => (
              <tr key={s.text}>
                <td>
                  {s.text}
                  {s.angabe && <span className="c-neben ueb-block">{s.angabe}</span>}
                </td>
                <td className="zahl">{euro(s.wert!)}/m²</td>
              </tr>
            ))}
          <tr className="ueb-summe">
            <td>
              Wert des Bauteils
              <span className="c-neben ueb-block">
                {flaeche(b.flaeche)} × {b.wertProM2 === undefined ? '' : euro(b.wertProM2)}
              </span>
            </td>
            <td className="zahl">{euro(b.wert)}</td>
          </tr>
        </tbody>
      </table>
      {b.nichtBerechnet ? <p className="neben">Nicht berechnete Baufläche: {flaeche(b.nichtBerechnet)}</p> : null}
    </div>
  )
}

function Baulichkeiten({ p }: { p: Protokoll }) {
  if (!p.bauteile.length && !p.abwasser.grube && !p.abwasser.kanal) return null
  return (
    <Abschnitt titel="Baulichkeiten">
      <p className="neben">
        {p.index ? `Baupreisindex ${zahl(p.index.wert, 1)} %${p.index.text ? ` ${p.index.text}` : ''}. ` : ''}Rechenweg je Bauteil: Normalherstellungskosten (NHK) je m², abzüglich Mängel- und
        Altersabzug, mal Baupreisindex, mal Fläche.
      </p>
      {p.bauteile.map((b) => (
        <Bauteil key={`${b.kuerzel}-${b.titel}`} b={b} />
      ))}
      <h3 className="ueb-h3">Zusammenstellung Baulichkeiten</h3>
      <table className="ueb-tabelle">
        <tbody>
          {p.bauZusammenstellung.map((z) => (
            <tr key={z.text} className={zeilenKlasse(z.art)}>
              <th scope="row">{z.text}</th>
              <td className="zahl">{euro(z.betrag)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {p.bebauteFlaeche ? <p className="neben">Bewertete bebaute Fläche: {flaeche(p.bebauteFlaeche)}</p> : null}
      {p.bauBeschreibung.length > 0 && (
        <>
          <h3 className="ueb-h3">Baubeschreibung</h3>
          {p.bauBeschreibung.map((a, i) => (
            <p key={i} className="ueb-text">
              {a}
            </p>
          ))}
        </>
      )}
    </Abschnitt>
  )
}

function Maengel({ p }: { p: Protokoll }) {
  if (!p.maengel.length) return null
  return (
    <Abschnitt titel="Mängel">
      {p.maengel.map((b) => (
        <div key={b.titel} className="ueb-bauteil">
          <h3 className="ueb-h3">{b.titel}</h3>
          <div className="ueb-scroll">
            <table className="ueb-tabelle">
              <thead>
                <tr>
                  <th scope="col">Bereich</th>
                  <th scope="col">Festgestellte Mängel</th>
                  <th scope="col" className="zahl">
                    Abzug
                  </th>
                </tr>
              </thead>
              <tbody>
                {b.zeilen.map((z) => (
                  <tr key={z.gruppe}>
                    <td>
                      {z.gruppe}
                      {z.hoechstens ? <span className="c-neben"> (höchstens {zahl(z.hoechstens)} %)</span> : null}
                      {z.begruendung ? <span className="c-neben ueb-block">Begründung: {z.begruendung}</span> : null}
                    </td>
                    <td>{z.maengel.length ? z.maengel.join('; ') : '–'}</td>
                    <td className="zahl">{prozent(z.abzug)}</td>
                  </tr>
                ))}
                <tr className="ueb-summe">
                  <td colSpan={2}>Mängelabzug insgesamt</td>
                  <td className="zahl">{prozent(b.gesamt)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </Abschnitt>
  )
}

function WerteTabelle({ zeilen, summe }: { zeilen: [string, string | undefined][]; summe: [string, string] }) {
  return (
    <table className="ueb-tabelle">
      <tbody>
        {zeilen
          .filter((z): z is [string, string] => Boolean(z[1]))
          .map(([label, wert]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td className="zahl">{wert}</td>
            </tr>
          ))}
        <tr className="ueb-summe">
          <th scope="row">{summe[0]}</th>
          <td className="zahl">{summe[1]}</td>
        </tr>
      </tbody>
    </table>
  )
}

function Abwasser({ p }: { p: Protokoll }) {
  const { grube, kanal } = p.abwasser
  if (!grube && !kanal) return null
  return (
    <Abschnitt titel="Abwasser">
      {grube && (
        <>
          <h3 className="ueb-h3">Abwassersammelgrube</h3>
          <WerteTabelle
            zeilen={[
              ['Genehmigung vom', grube.genehmigtAm],
              ['Genehmigungsnummer', grube.nr],
              ['Alter', grube.alter === undefined ? undefined : `${zahl(grube.alter)} Jahre`],
              ['Grundwert', grube.grundwert === undefined ? undefined : `${euro(grube.grundwert)}/m³`],
              ['Altersabzug (3 % je Jahr vom Restwert)', grube.abzugProzent === undefined ? undefined : prozent(grube.abzugProzent)],
              ['Wert nach Altersabzug', grube.wertProM3 === undefined ? undefined : `${euro(grube.wertProM3)}/m³`],
              ['Inhalt', grube.menge === undefined ? undefined : `${zahl(grube.menge)} m³`],
              ['Dichtheitsgutachten vom', grube.dichtheitAm ?? (grube.nachweisFehlt ? 'fehlt' : undefined)],
              ['Abzug wegen nicht geleerter Grube', grube.nichtGeleertAbzug ? euro(grube.nichtGeleertAbzug) : undefined],
            ]}
            summe={['Wert der Grube', euro(grube.wert)]}
          />
        </>
      )}
      {kanal && (
        <>
          <h3 className="ueb-h3">Abwasserkanal</h3>
          <WerteTabelle
            zeilen={[
              ['Erstellt', kanal.baujahr],
              ['Alter', kanal.alter === undefined ? undefined : `${zahl(kanal.alter)} Jahre`],
              ['Kosten', kanal.kosten === undefined ? undefined : euro(kanal.kosten)],
              ['höchstens', kanal.hoechstens === undefined ? undefined : euro(kanal.hoechstens)],
              ['Altersabzug (3 % je Jahr vom Restwert)', kanal.abzug === undefined ? undefined : prozent(kanal.abzug * 100)],
            ]}
            summe={['Wert des Kanals', euro(kanal.wert)]}
          />
        </>
      )}
    </Abschnitt>
  )
}

function PostenTabelle({ posten, summeText, summe, mitFaktor = false }: { posten: Posten[]; summeText: string; summe: number; mitFaktor?: boolean }) {
  return (
    <div className="ueb-scroll">
      <table className="ueb-tabelle ueb-posten">
        <thead>
          <tr>
            <th scope="col">Nr.</th>
            <th scope="col">Bezeichnung</th>
            <th scope="col" className="zahl">
              Menge
            </th>
            <th scope="col" className="zahl">
              Einzelpreis
            </th>
            {mitFaktor && (
              <th scope="col" className="zahl">
                Faktor
              </th>
            )}
            <th scope="col" className="zahl">
              Summe
            </th>
          </tr>
        </thead>
        <tbody>
          {posten.map((x) => (
            <tr key={x.nr}>
              <td>{x.nr}</td>
              <td>{x.text}</td>
              <td className="zahl">{[x.anzahl === undefined ? '' : zahl(x.anzahl, 3), x.einheit ?? ''].filter(Boolean).join(' ')}</td>
              <td className="zahl">{x.einzelpreis === undefined ? '' : euro(x.einzelpreis)}</td>
              {mitFaktor && <td className="zahl">{x.faktor === undefined ? '' : prozent(x.faktor * 100)}</td>}
              <td className="zahl">{euro(x.summe)}</td>
            </tr>
          ))}
          <tr className="ueb-summe">
            <td colSpan={mitFaktor ? 5 : 4}>{summeText}</td>
            <td className="zahl">{euro(summe)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Positionen({ titel, beschreibung, posten, summeText, summe }: { titel: string; beschreibung?: string; posten: Posten[]; summeText: string; summe: number }) {
  if (!posten.length) return null
  return (
    <Abschnitt titel={titel}>
      {beschreibung && <p className="ueb-text">{beschreibung}</p>}
      <PostenTabelle posten={posten} summeText={summeText} summe={summe} />
    </Abschnitt>
  )
}

function Beseitigung({ p }: { p: Protokoll }) {
  if (!p.beseitigung.length && !p.bauAbzuege.length) return null
  return (
    <Abschnitt titel="Beseitigungskosten und Abzüge">
      {p.beseitigung.map((b) => (
        <div key={b.abschnitt} className="ueb-bauteil">
          <h3 className="ueb-h3">{b.abschnitt === 'bau' ? 'Zu entfernende Aufbauten (Bau)' : 'Zu entfernende Außenanlagen und Aufwuchs'}</h3>
          <PostenTabelle posten={b.posten} summeText="Summe" summe={b.summe} mitFaktor />
          {b.hinweis && <p className="neben">{b.hinweis}</p>}
          {b.begruendung && <p className="neben">Begründung bei Faktor über 100 %: {b.begruendung}</p>}
        </div>
      ))}
      {p.bauAbzuege.length > 0 && (
        <>
          <h3 className="ueb-h3">Weitere Abzüge Bau</h3>
          <table className="ueb-tabelle">
            <tbody>
              {p.bauAbzuege.map((x) => (
                <tr key={x.text}>
                  <th scope="row">{x.text}</th>
                  <td>{x.rechnung ?? ''}</td>
                  <td className="zahl">{euro(x.betrag)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Abschnitt>
  )
}
