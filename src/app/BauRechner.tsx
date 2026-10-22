// Reiter „Rechner“ (Beta 4, Paket 4): Flächen (auch unregelmäßig), Kubatur nach Dachform, Altersabzug/Restnutzung,
// Baupreisindex, 24-m²-Check. Gerechnet wird mit denselben Funktionen wie in der Bewertung (`src/bau/rechner.ts`); das Ergebnis
// lässt sich auf Wunsch ins Bauteil übernehmen. Nichts wird gesperrt, Auffälligkeiten sind Hinweise.
import { useRef, useState } from 'react'
import { Calculator, Plus, Trash2 } from 'lucide-react'
import type { Bauteil, Wep } from '@/model'
import type { WepAendern } from '@/fotos'
import {
  BAUPREISINDEX,
  MINDERUNG_PRO_JAHR,
  TEILFLAECHE_ARTEN,
  ZULAESSIGE_FLAECHE_M2,
  altersRechnung,
  indexFuer,
  indexUmrechnung,
  kubaturFlaeche,
  pruefeZulaessigeFlaeche,
  rechneFlaechen,
  rechneKubatur,
  setzeZulaessigeFlaeche,
  teilflaecheM2,
  uebernehmeAlter,
  uebernehmeMasse,
  wertjahrVon,
  type KubaturEingabe,
  type Teilflaeche,
  type TeilflaecheArt,
} from '@/bau'
import type { Dachform } from '@/skizze/grundriss'
import { DACHFORMEN } from '@/skizze/grundriss'
import { zahlDe } from '@/gruen/format'
import { AuswahlFeld, Schalter, TextFeld, ZahlFeld } from './BauKomponenten'
import { aendereBauTeil, artText, ersetzeBauteil } from './bauHelfer'
import { ICON, LeerZustand, Meldung, euroFormat } from './ui'

type Werkzeug = 'flaeche' | 'kubatur' | 'alter' | 'index' | 'check'

const WERKZEUGE: { id: Werkzeug; text: string }[] = [
  { id: 'flaeche', text: 'Fläche' },
  { id: 'kubatur', text: 'Kubatur' },
  { id: 'alter', text: 'Altersabzug' },
  { id: 'index', text: 'Baupreisindex' },
  { id: 'check', text: '24-m²-Check' },
]

interface Props {
  wep: Wep
  aendere: WepAendern
  profilIndex?: Record<string, number>
}

const m2 = (n: number) => `${zahlDe(n)} m²`
const bauteilText = (b: Bauteil) => `${b.kuerzel} · ${artText(b.art)}${b.bezeichnung ? ` (${b.bezeichnung})` : ''}`

export function RechnerTab({ wep, aendere, profilIndex }: Props) {
  const [werkzeug, setWerkzeug] = useState<Werkzeug>('flaeche')
  const [zielId, setZielId] = useState<string>('')
  const [meldung, setMeldung] = useState<string>()
  const bauteile = wep.bau?.bauteile ?? []
  const ziel = bauteile.find((b) => b.id === zielId)

  // Eingaben bleiben beim Wechsel zwischen den Werkzeugen erhalten (der Reiter verliert sie erst beim Verlassen)
  const [teile, setTeile] = useState<Teilflaeche[]>([])
  const [kubatur, setKubatur] = useState<KubaturEingabe>({ dachform: 'flach' })

  const uebernehme = (fn: (b: Bauteil) => Bauteil, text: string) => {
    if (!ziel) return
    void aendere((w) => aendereBauTeil(w, (d) => ersetzeBauteil(d, fn(d.bauteile.find((x) => x.id === ziel.id) ?? ziel))))
    setMeldung(`${text} in ${ziel.kuerzel} übernommen.`)
  }

  return (
    <>
      <header className="seitenkopf">
        <div>
          <h1 className="h1">Rechner</h1>
          <p className="neben">Rechnet wie die Bewertung – das Ergebnis lässt sich ins Bauteil übernehmen.</p>
        </div>
      </header>

      <div className="segmente segmente-rechner" role="group" aria-label="Rechner wählen">
        {WERKZEUGE.map((w) => (
          <button key={w.id} type="button" className="segment" aria-pressed={werkzeug === w.id} onClick={() => { setWerkzeug(w.id); setMeldung(undefined) }}>
            {w.text}
          </button>
        ))}
      </div>

      {(werkzeug === 'flaeche' || werkzeug === 'kubatur' || werkzeug === 'alter') && (
        <div className="feld">
          <label className="label" htmlFor="rechner-ziel">Ergebnis übernehmen in</label>
          <select id="rechner-ziel" className="eingabe" value={zielId} onChange={(e) => { setZielId(e.target.value); setMeldung(undefined) }}>
            <option value="">– nur rechnen, nichts übernehmen –</option>
            {bauteile.map((b) => (
              <option key={b.id} value={b.id}>{bauteilText(b)}</option>
            ))}
          </select>
          {bauteile.length === 0 && <p className="neben">Noch kein Bauteil – lege es im Reiter „Baulichkeiten“ an, dann lässt sich das Ergebnis übernehmen.</p>}
        </div>
      )}

      {meldung && <p className="ok" role="status">{meldung}</p>}

      {werkzeug === 'flaeche' && (
        <FlaechenRechner
          teile={teile}
          setTeile={setTeile}
          ziel={ziel}
          onUebernehmen={(f) => uebernehme((b) => uebernehmeMasse(b, { flaeche: f }), `Fläche ${m2(f)}`)}
          onFuerKubatur={(f) => { setKubatur((k) => ({ ...k, flaeche: f, laenge: undefined, breite: undefined })); setWerkzeug('kubatur'); setMeldung(undefined) }}
        />
      )}
      {werkzeug === 'kubatur' && (
        <KubaturRechner
          e={kubatur}
          setE={setKubatur}
          ziel={ziel}
          onUebernehmen={(w, text) => uebernehme((b) => uebernehmeMasse(b, w), text)}
        />
      )}
      {werkzeug === 'alter' && <AlterRechner key={ziel?.id ?? 'frei'} wep={wep} ziel={ziel} profilIndex={profilIndex} onUebernehmen={(w) => uebernehme((b) => uebernehmeAlter(b, w), 'Altersangaben')} />}
      {werkzeug === 'index' && <IndexRechner wep={wep} aendere={aendere} profilIndex={profilIndex} />}
      {werkzeug === 'check' && <FlaechenCheckAnsicht wep={wep} aendere={aendere} profilIndex={profilIndex} />}
    </>
  )
}

// ---------------------------------------------------------------------------
// Fläche
// ---------------------------------------------------------------------------

function FlaechenRechner({
  teile,
  setTeile,
  ziel,
  onUebernehmen,
  onFuerKubatur,
}: {
  teile: Teilflaeche[]
  setTeile: (f: (t: Teilflaeche[]) => Teilflaeche[]) => void
  ziel: Bauteil | undefined
  onUebernehmen: (f: number) => void
  onFuerKubatur: (f: number) => void
}) {
  const zaehler = useRef(teile.length)
  const erg = rechneFlaechen(teile)
  const neu = (art: TeilflaecheArt) => setTeile((t) => [...t, { id: `tf-${++zaehler.current}`, art }])
  const aendere = (id: string, p: Partial<Teilflaeche>) => setTeile((t) => t.map((x) => (x.id === id ? { ...x, ...p } : x)))

  return (
    <section className="abschnitt" aria-label="Flächenrechner">
      <p className="neben">
        Für Grundrisse, die kein Rechteck sind: in einfache Teile zerlegen (Rechtecke, Dreiecke, Trapeze), Einschnitte als Abzug. Außenmaße messen (Richtlinie S. 3 Nr. 2).
      </p>
      {teile.length === 0 && (
        <button type="button" className="knopf" onClick={() => neu('rechteck')}>
          <Plus {...ICON} />
          Erstes Rechteck
        </button>
      )}
      {teile.map((t, i) => {
        const art = TEILFLAECHE_ARTEN.find((a) => a.art === t.art)!
        const f = teilflaecheM2(t)
        return (
          <fieldset key={t.id} className="fieldset abschnitt">
            <legend className="label">Teil {i + 1}: {art.text}{t.abzug ? ' (Abzug)' : ''}</legend>
            <div className="feld-reihe">
              {art.felder.map((feld) => (
                <ZahlFeld key={feld.key} label={feld.label} einheit="m" wert={t[feld.key]} onChange={(v) => aendere(t.id, { [feld.key]: v })} />
              ))}
            </div>
            <Schalter label="Wird abgezogen (Einschnitt, Aussparung)" an={Boolean(t.abzug)} onChange={(v) => aendere(t.id, { abzug: v || undefined })} />
            <div className="summe summe-klein">
              <span>{art.hilfe}</span>
              <span className="zahl">{f === undefined ? '–' : `${t.abzug ? '− ' : ''}${m2(Math.round(f * 100) / 100)}`}</span>
            </div>
            <button type="button" className="textknopf" onClick={() => setTeile((x) => x.filter((y) => y.id !== t.id))}>
              <Trash2 {...ICON} size={18} /> Teil entfernen
            </button>
          </fieldset>
        )
      })}
      {teile.length > 0 && (
        <div className="feld">
          <label className="label" htmlFor="teil-neu">Weiteres Teil</label>
          <select id="teil-neu" className="eingabe" value="" onChange={(e) => e.target.value && neu(e.target.value as TeilflaecheArt)}>
            <option value="">– Form wählen –</option>
            {TEILFLAECHE_ARTEN.map((a) => (
              <option key={a.art} value={a.art}>{a.text}</option>
            ))}
          </select>
        </div>
      )}
      {erg.hinweise.map((h, i) => <Meldung key={i}>{h}</Meldung>)}
      {teile.length > 0 && (
        <>
          <div className="summe" aria-label="Fläche gesamt">
            <span>Fläche gesamt</span>
            <span className="zahl">{m2(erg.summe)}</span>
          </div>
          <div className="knopf-reihe">
            <button type="button" className="knopf knopf-primaer" disabled={!ziel || !(erg.summe > 0)} onClick={() => onUebernehmen(erg.summe)}>
              {ziel ? `Als Fläche in ${ziel.kuerzel} übernehmen` : 'Zum Übernehmen Bauteil wählen'}
            </button>
            <button type="button" className="knopf" disabled={!(erg.summe > 0)} onClick={() => onFuerKubatur(erg.summe)}>
              Für die Kubatur verwenden
            </button>
          </div>
        </>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Kubatur
// ---------------------------------------------------------------------------

function KubaturRechner({
  e,
  setE,
  ziel,
  onUebernehmen,
}: {
  e: KubaturEingabe
  setE: (f: (k: KubaturEingabe) => KubaturEingabe) => void
  ziel: Bauteil | undefined
  onUebernehmen: (w: { flaeche?: number; laenge?: number; breite?: number; hoehe?: number; kubaturM3?: number }, text: string) => void
}) {
  const set = (p: Partial<KubaturEingabe>) => setE((k) => ({ ...k, ...p }))
  const m = rechneKubatur(e)
  const flaeche = kubaturFlaeche(e)
  const dach = DACHFORMEN.find((d) => d.id === e.dachform)!
  const untenText = e.dachform === 'flach' ? 'Höhe' : e.dachform === 'pult' ? 'Niedrige Wand' : 'Traufhöhe'
  const obenText = e.dachform === 'pult' ? 'Hohe Wand' : 'Firsthöhe'
  const gwh = ziel?.art === 'gewaechshaus'

  return (
    <section className="abschnitt" aria-label="Kubatur">
      <p className="neben">Umbauter Raum (Richtlinie S. 4 Nr. 9) – dieselbe Rechnung wie die Massenberechnung in der Skizze Bau.</p>
      {ziel && (
        <button
          type="button"
          className="textknopf"
          onClick={() => setE((k) => ({ ...k, flaeche: ziel.flaeche > 0 ? ziel.flaeche : undefined, laenge: ziel.laenge, breite: ziel.breite, hoehe: ziel.hoehe, hoeheOben: undefined }))}
        >
          Maße von {ziel.kuerzel} laden
        </button>
      )}
      <div className="feld-reihe">
        <ZahlFeld label="Länge" einheit="m" wert={e.laenge} onChange={(v) => set({ laenge: v, flaeche: undefined })} />
        <ZahlFeld label="Breite" einheit="m" wert={e.breite} onChange={(v) => set({ breite: v, flaeche: undefined })} />
      </div>
      <ZahlFeld
        label="oder Fläche"
        einheit="m²"
        wert={e.flaeche}
        onChange={(v) => set({ flaeche: v })}
        hilfe="Für unregelmäßige Grundrisse (z. B. aus dem Flächenrechner). Leer = Länge × Breite."
      />
      <div className="segmente segmente-3" role="group" aria-label="Dachform">
        {DACHFORMEN.map((d) => (
          <button key={d.id} type="button" className="segment" aria-pressed={e.dachform === d.id} onClick={() => set({ dachform: d.id as Dachform })}>
            {d.text}
          </button>
        ))}
      </div>
      <p className="neben">{dach.hilfe}</p>
      <div className="feld-reihe">
        <ZahlFeld label={untenText} einheit="m" wert={e.hoehe} onChange={(v) => set({ hoehe: v })} />
        {e.dachform !== 'flach' && <ZahlFeld label={obenText} einheit="m" wert={e.hoeheOben} onChange={(v) => set({ hoeheOben: v })} />}
      </div>

      {m?.hinweise.map((h, i) => <Meldung key={i}>{h}</Meldung>)}
      {m && m.kubaturM3 !== undefined && (
        <dl className="werte rechenweg" aria-label="Rechenweg Kubatur">
          <div><dt>Grundfläche</dt><dd className="zahl">{m2(m.flaeche)}</dd></div>
          <div><dt>Raum bis zur {e.dachform === 'pult' ? 'niedrigen Wand' : e.dachform === 'sattel' ? 'Traufe' : 'Oberkante'} (Fläche × {zahlDe(m.hoehe ?? 0)} m)</dt><dd className="zahl">{zahlDe(m.raumM3 ?? 0)} m³</dd></div>
          {e.dachform !== 'flach' && <div><dt>Dachraum (Fläche × Höhenunterschied ÷ 2)</dt><dd className="zahl">{zahlDe(m.dachraumM3 ?? 0)} m³</dd></div>}
          <div><dt>Mittlere Höhe</dt><dd className="zahl">{zahlDe(m.mittlereHoehe ?? 0)} m</dd></div>
          <div className="rechenweg-summe"><dt>Kubatur</dt><dd className="zahl">{zahlDe(m.kubaturM3)} m³</dd></div>
        </dl>
      )}
      <button
        type="button"
        className="knopf knopf-primaer"
        disabled={!ziel || !m || m.kubaturM3 === undefined}
        onClick={() =>
          m &&
          onUebernehmen(
            {
              flaeche: flaeche,
              ...(!e.flaeche && e.laenge && e.breite ? { laenge: e.laenge, breite: e.breite } : {}),
              hoehe: gwh ? m.hoeheOben : m.mittlereHoehe,
              kubaturM3: m.kubaturM3,
            },
            `Fläche, Höhe und Kubatur ${zahlDe(m.kubaturM3 ?? 0)} m³`,
          )
        }
      >
        {ziel ? `Fläche, Höhe und Kubatur in ${ziel.kuerzel} übernehmen` : 'Zum Übernehmen Bauteil wählen'}
      </button>
      {ziel?.ausGrundriss && <p className="neben">{ziel.kuerzel} bekommt seine Maße aus der Skizze Bau; mit dem Übernehmen gelten die Rechner-Werte (wie beim Überschreiben der Fläche), der Grundriss lässt sie dann in Ruhe.</p>}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Altersabzug / Restnutzung
// ---------------------------------------------------------------------------

function AlterRechner({
  wep,
  ziel,
  profilIndex,
  onUebernehmen,
}: {
  wep: Wep
  ziel: Bauteil | undefined
  profilIndex?: Record<string, number>
  onUebernehmen: (w: { baujahr?: number; restnutzungsjahre?: number; rnBegruendung?: string; minderungProJahr?: number }) => void
}) {
  const [baujahr, setBaujahr] = useState<number | undefined>(ziel?.baujahr)
  const [rn, setRn] = useState<number | undefined>(ziel?.rnManuell ? ziel.restnutzungsjahre : undefined)
  const [begruendung, setBegruendung] = useState(ziel?.rnBegruendung ?? '')
  const [minderung, setMinderung] = useState<number | undefined>(ziel?.minderungProJahr)

  if (!ziel) {
    return (
      <section className="abschnitt" aria-label="Altersabzug">
        <LeerZustand icon={Calculator} titel="Bauteil wählen" text="Wähle oben das Bauteil, dessen Altersabzug berechnet werden soll. Der Rechner nutzt seine Bauklasse, Mängel und den Baupreisindex aus dem WEP." />
      </section>
    )
  }
  const e = altersRechnung(ziel, wep, { baujahr, restnutzungsjahre: rn, minderungProJahr: minderung }, { profilIndex })
  const wj = wertjahrVon(wep)
  const tabelle = e?.verfahren === 'restnutzung'
  const vorschlag = e?.rnVorschlag

  return (
    <section className="abschnitt" aria-label="Altersabzug">
      <p className="neben">
        Das Baujahr zählt als volles Jahr (Richtlinie S. 8). Bei Laube, Anbau, Schuppen und Keller bestimmt die Restnutzung den Abzug (Tabelle S. 10), bei Gewächshaus und angebautem Vorplatz Jahre × Prozent je Jahr.
      </p>
      <div className="feld-reihe">
        <ZahlFeld label="Baujahr" wert={baujahr} onChange={setBaujahr} hilfe={e?.alter !== undefined ? `Alter ${e.alter} Jahre im Jahr ${wj}` : 'Fehlt – ohne Baujahr kein Alter.'} />
        {tabelle ? (
          <ZahlFeld label="Restnutzungsjahre" wert={rn} onChange={setRn} hilfe={vorschlag !== undefined ? `Leer = Vorschlag ${vorschlag} Jahre (Tabellenende minus Alter)` : 'Leer = Vorschlag aus dem Baujahr'} />
        ) : (
          <AuswahlFeld
            label="Minderung je Jahr"
            wert={minderung ?? ''}
            optionen={MINDERUNG_PRO_JAHR.map((m) => ({ wert: m.prozent, text: `${m.prozent} % (Lebenserwartung ${m.jahre} Jahre)` }))}
            onChange={(v) => setMinderung(v === undefined ? undefined : Number(v))}
          />
        )}
      </div>
      {tabelle && rn !== undefined && (
        <TextFeld label="Begründung der Restnutzungsdauer" wert={begruendung} onChange={setBegruendung} hilfe="Abweichungen vom Vorschlag sind im Einzelnen zu begründen (Richtlinie S. 9)." />
      )}
      {e ? (
        <>
          <dl className="werte rechenweg" aria-label="Rechenweg Altersabzug">
            {e.bauklasse && <div><dt>Bauklasse</dt><dd className="zahl">{e.bauklasse}</dd></div>}
            <div><dt>Alter</dt><dd className="zahl">{e.alter === undefined ? '–' : `${e.alter} Jahre`}</dd></div>
            {tabelle ? (
              <div><dt>Restnutzung</dt><dd className="zahl">{e.restnutzungsjahre === undefined ? 'fehlt' : `${zahlDe(e.restnutzungsjahre)} Jahre`}</dd></div>
            ) : e.verfahren === 'linear' ? (
              <div><dt>{e.alter ?? 0} Jahre × {zahlDe(e.minderungProJahr ?? 0)} %</dt><dd className="zahl">{zahlDe(e.altersabzugProzent)} %</dd></div>
            ) : (
              <div><dt>Altersabzug wie die Laube</dt><dd className="zahl">{zahlDe(e.altersabzugProzent)} %</dd></div>
            )}
            {tabelle && <div><dt>Altersabzug (Tabelle S. 10)</dt><dd className="zahl">{zahlDe(e.altersabzugProzent)} %</dd></div>}
            <div><dt>je m² nach Mängeln</dt><dd className="zahl">{euroFormat(e.nachMaengeln)}</dd></div>
            <div><dt>je m² nach Altersabzug</dt><dd className="zahl">{euroFormat(e.nachAlter)}</dd></div>
            <div><dt>je m² mit Baupreisindex {e.indexWert === undefined ? '(fehlt)' : zahlDe(e.indexWert, 1)}</dt><dd className="zahl">{euroFormat(e.wertProM2)}</dd></div>
            <div className="rechenweg-summe"><dt>mal {m2(e.flaeche)}</dt><dd className="zahl">{euroFormat(e.wert)}</dd></div>
          </dl>
          {e.abgeschrieben && <Meldung>Wirtschaftlich abgeschrieben: Der Abzug beträgt 100 % (Wert 0 €).</Meldung>}
          {tabelle && e.restnutzungsjahre === undefined && <Meldung>Restnutzungsjahre fehlen – die Vorlage rechnet dann mit 0 Jahren, also 100 % Abzug.</Meldung>}
          {e.altersabzugProzent === 0 && tabelle && e.bauklasse === '' && <Meldung>Keine Bauklasse – ohne sie gibt es keinen Altersabzug und keine NHK. Bauklasse im Bauteil festlegen.</Meldung>}
        </>
      ) : (
        <p className="neben">Dieses Bauteil wird nicht bewertet oder hat keinen Platz in der Vorlage.</p>
      )}
      <button
        type="button"
        className="knopf knopf-primaer"
        onClick={() => onUebernehmen({ baujahr, restnutzungsjahre: tabelle ? rn : undefined, rnBegruendung: begruendung, minderungProJahr: tabelle ? undefined : minderung })}
      >
        Angaben in {ziel.kuerzel} übernehmen
      </button>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Baupreisindex
// ---------------------------------------------------------------------------

function IndexRechner({ wep, aendere, profilIndex }: { wep: Wep; aendere: WepAendern; profilIndex?: Record<string, number> }) {
  const wj = wertjahrVon(wep)
  const bau = wep.bau
  const aktuell = indexFuer({ ...(bau ?? { bauteile: [], abwasser: { art: 'keine', grube: {}, kanal: {} }, nichtBeraeumt: { aktiv: false }, ausstattung: {}, beschreibung: '', beseitigung: [] }) }, wj, profilIndex)
  const [betrag, setBetrag] = useState<number | undefined>()
  const [vonJahr, setVonJahr] = useState<number | undefined>()
  const u = betrag !== undefined && vonJahr ? indexUmrechnung(betrag, vonJahr, wj, profilIndex) : undefined
  const setzeIndex = (jahr: number, wert: number) =>
    void aendere((w) => aendereBauTeil(w, (b) => ({ ...b, index: { jahr: wj, wert, quelle: `Index für ${jahr} (im Rechner gewählt)`, manuell: true } })))

  return (
    <section className="abschnitt" aria-label="Baupreisindex">
      <p className="neben">Richtlinie S. 11: Es gilt der Index des IV. Quartals des Vorjahres für das ganze Wertjahr (2015 = 100).</p>
      <div className="summe" aria-label="Index im WEP">
        <span>Index im WEP ({wj})</span>
        <span className="zahl">{aktuell ? zahlDe(aktuell.wert, 1) : 'fehlt'}</span>
      </div>
      <p className="neben">
        {aktuell ? aktuell.quelle : 'Kein Wert bekannt – im Reiter „Baulichkeiten“ oder im Profil eintragen.'}
        {aktuell?.manuell ? ' (von Hand gesetzt)' : ''}
      </p>
      {aktuell?.ersatz && <Meldung>Für {wj} liegt kein Index vor, es wird der Wert von {aktuell.ersatzJahr} verwendet. Bitte den aktuellen Wert eintragen.</Meldung>}

      <h2 className="gruppenkopf">Betrag umrechnen</h2>
      <p className="neben">Z. B. Kosten eines früheren Jahres auf den Stand des Wertjahres {wj}.</p>
      <div className="feld-reihe">
        <ZahlFeld label="Betrag" einheit="€" wert={betrag} onChange={setBetrag} />
        <ZahlFeld label="aus dem Jahr" wert={vonJahr} onChange={setVonJahr} />
      </div>
      {u && (
        <>
          <dl className="werte rechenweg" aria-label="Umrechnung">
            <div><dt>Index {u.vonJahr}</dt><dd className="zahl">{zahlDe(u.von, 1)}</dd></div>
            <div><dt>Index {u.nachJahr}</dt><dd className="zahl">{zahlDe(u.nach, 1)}</dd></div>
            <div className="rechenweg-summe"><dt>{euroFormat(betrag!)} × {zahlDe(u.nach, 1)} ÷ {zahlDe(u.von, 1)}</dt><dd className="zahl">{euroFormat(u.betrag)}</dd></div>
          </dl>
          {u.hinweise.map((h, i) => <Meldung key={i}>{h}</Meldung>)}
        </>
      )}

      <h2 className="gruppenkopf">Werte je Jahr</h2>
      <ul className="liste" aria-label="Baupreisindex je Jahr">
        {[...BAUPREISINDEX].sort((a, b) => b.jahr - a.jahr).map((i) => (
          <li key={i.jahr}>
            <div className="zeile">
              <span className="zeile-text">
                <span className="zeile-titel">{i.jahr}</span>
                <span className="neben">{i.quelle}</span>
              </span>
              <span className="zahl c-summe">{zahlDe(i.wert, 1)}</span>
            </div>
            <button type="button" className="textknopf" disabled={aktuell?.wert === i.wert && Boolean(bau?.index?.manuell)} onClick={() => setzeIndex(i.jahr, i.wert)}>
              Diesen Wert für dieses WEP verwenden
            </button>
          </li>
        ))}
      </ul>
      {bau?.index?.manuell && (
        <button type="button" className="textknopf" onClick={() => void aendere((w) => aendereBauTeil(w, (b) => ({ ...b, index: undefined })))}>
          Zurück auf den Wert der App
        </button>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// 24-m²-Check
// ---------------------------------------------------------------------------

function FlaechenCheckAnsicht({ wep, aendere, profilIndex }: { wep: Wep; aendere: WepAendern; profilIndex?: Record<string, number> }) {
  const gespeichert = wep.bau?.zulaessigeFlaeche ?? ZULAESSIGE_FLAECHE_M2
  const [zulaessig, setZulaessig] = useState<number | undefined>(gespeichert)
  const c = pruefeZulaessigeFlaeche(wep, { profilIndex }, zulaessig && zulaessig > 0 ? zulaessig : undefined)
  const abweichend = c.zulaessig !== gespeichert

  return (
    <section className="abschnitt" aria-label="24-m²-Check">
      <p className="neben">
        Laube, Anbauten und überdachter Vorplatz zählen zusammen (in dieser Reihenfolge) bis zur zulässigen Fläche; was darüber liegt, wird nicht berechnet. Schuppen, Gewächshaus und Keller zählen nicht mit.
      </p>
      <ZahlFeld
        label="Zulässige Fläche"
        einheit="m²"
        wert={zulaessig}
        onChange={setZulaessig}
        hilfe={`Regel ${ZULAESSIGE_FLAECHE_M2} m²; nach Vertragslage höher möglich. Hier ausprobieren, mit „Übernehmen“ gilt der Wert im WEP.`}
      />
      {abweichend && (
        <button type="button" className="knopf" onClick={() => void aendere((w) => setzeZulaessigeFlaeche(w, c.zulaessig))}>
          {zahlDe(c.zulaessig)} m² für dieses WEP übernehmen
        </button>
      )}
      {c.zeilen.length === 0 ? (
        <p className="neben">Noch keine Laube, kein Anbau und kein Vorplatz erfasst.</p>
      ) : (
        <ul className="liste" aria-label="Anrechnung der Fläche">
          {c.zeilen.map((z) => (
            <li key={z.bauteil.id}>
              <div className="zeile">
                <span className="zeile-text">
                  <span className="zeile-titel">{bauteilText(z.bauteil)}</span>
                  <span className="neben">
                    {m2(z.flaeche)} erfasst · {m2(z.bewertet)} berechnet{z.nichtBerechnet > 0 ? ` · ${m2(z.nichtBerechnet)} nicht berechnet` : ''}
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <dl className="werte rechenweg" aria-label="Ergebnis 24-m²-Check">
        <div><dt>Erfasste Fläche (L, A, Ü)</dt><dd className="zahl">{m2(c.summe)}</dd></div>
        <div><dt>Berechnet (höchstens {m2(c.zulaessig)})</dt><dd className="zahl">{m2(c.bewertet)}</dd></div>
        <div><dt>Noch frei</dt><dd className="zahl">{m2(c.frei)}</dd></div>
        <div className="rechenweg-summe"><dt>Nicht berechnete Baufläche</dt><dd className="zahl">{m2(c.nichtBerechnet)}</dd></div>
        {c.nichtBerechnet > 0 && <div><dt>Dadurch nicht bewertet (ca.)</dt><dd className="zahl">{euroFormat(c.wertverlust)}</dd></div>}
      </dl>
      {c.hinweise.map((h, i) => <Meldung key={i}>{h}</Meldung>)}
      {c.ausgenommen.length > 0 && (
        <>
          <h2 className="gruppenkopf">Nicht auf die zulässige Fläche angerechnet</h2>
          <ul className="liste" aria-label="Nicht angerechnet">
            {c.ausgenommen.map((a) => (
              <li key={a.bauteil.id}>
                <div className="zeile">
                  <span className="zeile-text">
                    <span className="zeile-titel">{bauteilText(a.bauteil)} · {m2(a.bauteil.flaeche)}</span>
                    <span className="neben">{a.grund}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
