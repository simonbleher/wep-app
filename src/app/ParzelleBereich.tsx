// Parzelle eingeben und korrigieren (Beta 6, Paket 1) – derselbe Bereich in „Skizze Bau“ und „Skizze Grün“.
//
// Rechteckig: Länge × Breite. Andere Form: Ecken grob zeichnen (tippen, ziehen), dann jede Seite eintippen, bei einem Viereck
// zusätzlich eine Diagonale (oder einen Winkel), bei mehr Ecken die nötigen weiteren. Die App sagt, was noch fehlt, zeigt die
// berechnete Fläche und warnt (nur Hinweis) bei deutlicher Abweichung von der Vertragsfläche. Gearbeitet wird an einem Entwurf;
// „Parzelle übernehmen“ setzt ihn – mit Rückfrage, wenn schon Bauteile oder Grün-Elemente darauf liegen.
import { useId, useMemo, useRef, useState } from 'react'
import { Pentagon, Plus, Ruler, Square, Trash2, Undo2 } from 'lucide-react'
import type { Wep } from '@/model'
import {
  PARZELLE_TEIL_TEXT,
  eckenName,
  flaecheUndVergleich,
  liegtEtwasDarauf,
  lageVon,
  loese,
  massstabText,
  mitStempel,
  parzellenLage,
  teileAusserhalb,
  wasLiegtDarauf,
  type Fehlend,
  type Loesung,
  type Parzelle,
  type ParzelleTeil,
} from '@/parzelle'
import { ZahlFeld } from './BauKomponenten'
import { useOhneExcel } from './ohneExcel'
import { Dialog, ICON, Meldung, Rueckfrage, datumDe } from './ui'

const DE = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2, minimumFractionDigits: 0 })
const DE2 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
const MAX_ECKEN = 16

/** Ecken des Dreiecks, wenn jemand „Andere Form“ wählt, ohne vorher etwas gezeichnet zu haben: Platz zum Antippen. */
const grobLeer = (): Parzelle['ecken'] => []

function neuerEntwurf(wep: Wep, teil: ParzelleTeil, jetzt: string): Parzelle {
  if (wep.parzelle) return JSON.parse(JSON.stringify(wep.parzelle)) as Parzelle
  return { form: 'rechteck', angelegtVon: teil, angelegtAm: jetzt }
}

export interface ParzelleBereichProps {
  wep: Wep
  /** In welchem Reiter der Bereich steht (wer die Parzelle anlegt bzw. ändert). */
  teil: 'bau' | 'gruen'
  /** Setzt die Parzelle (oder entfernt sie mit `undefined`) und legt die Skizzen darauf; löst das Speichern aus. */
  onUebernehmen: (parzelle: Parzelle | undefined) => Promise<void>
  /** Hinweise zur Parzelle, die der Reiter kennt (z. B. Bauteile außerhalb). */
  extra?: React.ReactNode
}

export function ParzelleBereich({ wep, teil, onUebernehmen, extra }: ParzelleBereichProps) {
  const id = useId()
  const jetzt = () => new Date().toISOString()
  const [offen, setOffen] = useState(false)
  const [entwurf, setEntwurf] = useState<Parzelle>(() => neuerEntwurf(wep, teil, new Date().toISOString()))
  const [zeichnen, setZeichnen] = useState(false)
  const [frage, setFrage] = useState<'uebernehmen' | 'entfernen' | null>(null)
  const [beschaeftigt, setBeschaeftigt] = useState(false)
  const [fehler, setFehler] = useState<string>()

  const vertrag = wep.formalien?.parzellenflaecheM2 || undefined
  const gespeichert = wep.parzelle
  const lageGespeichert = lageVon(wep)
  const gespFlaeche = useMemo(() => flaecheUndVergleich(gespeichert, vertrag), [gespeichert, vertrag])
  const loesung = useMemo(() => loese(entwurf), [entwurf])
  const entwurfVergleich = useMemo(() => flaecheUndVergleich(entwurf, vertrag).vergleich, [entwurf, vertrag])
  const darauf = wasLiegtDarauf(wep)

  function oeffne() {
    setEntwurf(neuerEntwurf(wep, teil, jetzt()))
    setZeichnen(!wep.parzelle?.ecken?.length)
    setFehler(undefined)
    setOffen(true)
  }

  const aendere = (teilAenderung: Partial<Parzelle>) => setEntwurf((e) => ({ ...e, ...teilAenderung }))
  const wechsleForm = (form: Parzelle['form']) => {
    setEntwurf((e) => ({ ...e, form }))
    if (form === 'frei') setZeichnen(!(entwurf.ecken?.length && entwurf.ecken.length >= 3))
  }

  async function uebernehmen() {
    setFrage(null)
    setBeschaeftigt(true)
    setFehler(undefined)
    try {
      const bereinigt: Parzelle =
        entwurf.form === 'rechteck'
          ? { form: 'rechteck', ...(entwurf.laenge ? { laenge: entwurf.laenge } : {}), ...(entwurf.breite ? { breite: entwurf.breite } : {}), massketten: entwurf.massketten, angelegtVon: entwurf.angelegtVon, angelegtAm: entwurf.angelegtAm }
          : {
              form: 'frei',
              ecken: entwurf.ecken,
              seiten: entwurf.seiten,
              diagonalen: (entwurf.diagonalen ?? []).filter((d) => d.laenge),
              winkel: (entwurf.winkel ?? []).filter((w) => w.grad),
              massketten: entwurf.massketten,
              angelegtVon: entwurf.angelegtVon,
              angelegtAm: entwurf.angelegtAm,
            }
      if (bereinigt.massketten === undefined) delete bereinigt.massketten
      await onUebernehmen(mitStempel(bereinigt, gespeichert, teil, jetzt()))
      setOffen(false)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Die Parzelle konnte nicht gespeichert werden.')
    } finally {
      setBeschaeftigt(false)
    }
  }

  async function entfernen() {
    setFrage(null)
    setBeschaeftigt(true)
    try {
      await onUebernehmen(undefined)
      setOffen(false)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Die Parzelle konnte nicht entfernt werden.')
    } finally {
      setBeschaeftigt(false)
    }
  }

  const kannUebernehmen = loesung.status === 'fertig' && !beschaeftigt
  const aendertSich = Boolean(gespeichert) || liegtEtwasDarauf(darauf)

  // ---------------------------------------------------------------------------
  // Zusammenfassung (Editor zu)
  // ---------------------------------------------------------------------------
  const zusammenfassung = (
    <section className="abschnitt parzelle" aria-labelledby={`${id}-titel`} data-testid="parzelle-bereich">
      <div className="parzelle-kopf">
        <Ruler {...ICON} />
        <h2 className="h2" id={`${id}-titel`}>
          Parzelle
        </h2>
      </div>
      {!gespeichert ? (
        <>
          <p>
            <strong>Noch keine Parzelle.</strong> Mit der Form der Parzelle haben „Skizze Bau“ und „Skizze Grün“ denselben Maßstab und dieselbe Lage; Bauteile und Grün liegen in echten Metern darauf.
          </p>
          {(darauf.bauteile > 0 || darauf.gruen > 0 || wep.skizze?.elemente.length) && (
            <p className="neben" data-testid="parzelle-migration">
              Dieses WEP ist von vor der Parzelle: Die vorhandenen Skizzen bleiben, wie sie sind, bis die Parzelle angelegt ist. Danach fragt die App noch einmal, bevor sie etwas darauf legt.
            </p>
          )}
        </>
      ) : lageGespeichert ? (
        <ParzelleKurz parzelle={gespeichert} loesung={gespFlaeche.loesung!} pxProM={lageGespeichert.abb.pxProM} />
      ) : (
        <Meldung>
          <p>
            Die Parzelle ist {gespeichert.angelegtVon === 'excel' ? 'aus der Bau-Excel übernommen' : 'angelegt'}, aber die Maße fehlen noch
            {gespFlaeche.loesung?.fehlt.length ? `: ${gespFlaeche.loesung.fehlt.map((f) => f.text).join(', ')}` : ''}. Bis dahin zeigen sich die Skizzen wie bisher.
          </p>
        </Meldung>
      )}
      {gespFlaeche.vergleich?.hinweis && lageGespeichert && (
        <Meldung>
          <p data-testid="parzelle-abweichung">{gespFlaeche.vergleich.hinweis}</p>
        </Meldung>
      )}
      {gespeichert && (
        <p className="neben" data-testid="parzelle-stempel">
          Angelegt am {datumDe(gespeichert.angelegtAm.slice(0, 10))} ({PARZELLE_TEIL_TEXT[gespeichert.angelegtVon]})
          {gespeichert.geaendertAm ? ` · zuletzt geändert am ${datumDe(gespeichert.geaendertAm.slice(0, 10))} (${PARZELLE_TEIL_TEXT[gespeichert.geaendertVon ?? gespeichert.angelegtVon]})` : ''}
          . Beide Teile können sie korrigieren.
        </p>
      )}
      {extra}
      <div className="grundlage-knoepfe">
        <button type="button" className={gespeichert && lageGespeichert ? 'knopf' : 'knopf knopf-primaer'} onClick={oeffne}>
          {!gespeichert ? 'Parzelle anlegen' : lageGespeichert ? 'Parzelle ändern' : 'Maße eintragen'}
        </button>
      </div>
    </section>
  )

  if (!offen) return zusammenfassung

  // ---------------------------------------------------------------------------
  // Editor
  // ---------------------------------------------------------------------------
  return (
    <section className="abschnitt parzelle parzelle-editor" aria-labelledby={`${id}-titel`} data-testid="parzelle-editor">
      <div className="parzelle-kopf">
        <Ruler {...ICON} />
        <h2 className="h2" id={`${id}-titel`}>
          {gespeichert ? 'Parzelle ändern' : 'Parzelle anlegen'}
        </h2>
      </div>

      <div className="segmente segmente-2" role="group" aria-label="Form der Parzelle">
        <button type="button" className="segment" aria-pressed={entwurf.form === 'rechteck'} onClick={() => wechsleForm('rechteck')}>
          <Square {...ICON} size={18} /> Rechteckig
        </button>
        <button type="button" className="segment" aria-pressed={entwurf.form === 'frei'} onClick={() => wechsleForm('frei')}>
          <Pentagon {...ICON} size={18} /> Andere Form
        </button>
      </div>

      {entwurf.form === 'rechteck' ? (
        <RechteckEingabe entwurf={entwurf} vertrag={vertrag} onAendern={aendere} />
      ) : (
        <FreiEingabe entwurf={entwurf} loesung={loesung} zeichnen={zeichnen} setZeichnen={setZeichnen} onAendern={aendere} />
      )}

      {loesung.status === 'fertig' ? (
        <div className="parzelle-ergebnis" aria-live="polite" data-testid="parzelle-ergebnis">
          <p className="parzelle-flaeche">
            Fläche <strong className="zahl">{DE2.format(loesung.flaeche ?? 0)} m²</strong> (berechnet)
            {vertrag ? <span className="neben"> · laut Vertrag {DE.format(vertrag)} m²</span> : <span className="neben"> · Vertragsfläche noch nicht in den Formalien</span>}
          </p>
          {entwurfVergleich?.hinweis && (
            <Meldung>
              <p data-testid="parzelle-entwurf-abweichung">{entwurfVergleich.hinweis}</p>
            </Meldung>
          )}
          {loesung.hinweise.map((h) => (
            <Meldung key={h}>
              <p>{h}</p>
            </Meldung>
          ))}
          <Vorschau loesung={loesung} />
        </div>
      ) : (
        <div className="parzelle-ergebnis" aria-live="polite" data-testid="parzelle-fehlt">
          {loesung.status === 'unmoeglich' ? (
            loesung.hinweise.map((h) => (
              <Meldung key={h} alarm>
                <p>{h}</p>
              </Meldung>
            ))
          ) : (
            <>
              <p className="parzelle-fehlt">
                <strong>Es fehlt noch:</strong> {loesung.fehlt.length ? loesung.fehlt.map((f) => f.text).join(' · ') : 'eine Angabe'}.
              </p>
              {entwurf.form === 'frei' && <Vorschlaege fehlt={loesung.fehlt} entwurf={entwurf} onAendern={aendere} />}
              {loesung.hinweise.map((h) => (
                <Meldung key={h}>
                  <p>{h}</p>
                </Meldung>
              ))}
            </>
          )}
        </div>
      )}

      <label className="schalter-zeile">
        <span>Seitenlängen als Maßlinien in beide Skizzen zeichnen</span>
        <input type="checkbox" className="schalter" role="switch" checked={entwurf.massketten === true} onChange={(e) => aendere({ massketten: e.target.checked })} />
      </label>

      {fehler && (
        <Meldung alarm>
          <p>{fehler}</p>
        </Meldung>
      )}

      <div className="grundlage-knoepfe">
        <button
          type="button"
          className="knopf knopf-primaer"
          disabled={!kannUebernehmen}
          onClick={() => (liegtEtwasDarauf(darauf) ? setFrage('uebernehmen') : void uebernehmen())}
        >
          {gespeichert ? 'Änderung übernehmen' : 'Parzelle übernehmen'}
        </button>
        <button type="button" className="knopf" onClick={() => setOffen(false)}>
          Abbrechen
        </button>
        {gespeichert && (
          <button type="button" className="knopf knopf-gefahr" onClick={() => setFrage('entfernen')}>
            <Trash2 {...ICON} size={18} /> Parzelle entfernen
          </button>
        )}
      </div>

      {frage === 'uebernehmen' && (
        <Dialog titel={aendertSich && gespeichert ? 'Parzelle ändern?' : 'Parzelle anlegen?'} rueckfrage onSchliessen={() => setFrage(null)}>
          <RueckfrageText darauf={darauf} neu={!gespeichert} hatSkizzeOhneMassstab={Boolean(wep.skizze && !wep.skizze.massstab)} />
          <div className="dialog-knoepfe">
            <button type="button" className="knopf" autoFocus onClick={() => setFrage(null)}>
              Abbrechen
            </button>
            <button type="button" className="knopf knopf-primaer" onClick={() => void uebernehmen()}>
              {gespeichert ? 'Parzelle ändern' : 'Parzelle anlegen'}
            </button>
          </div>
        </Dialog>
      )}
      {frage === 'entfernen' && (
        <Rueckfrage
          titel="Parzelle entfernen?"
          text="Die Skizzen behalten ihre Elemente, verlieren aber den gemeinsamen Maßstab (sie zeigen sich wieder wie bei WEPs von vor der Parzelle). Die Parzelle lässt sich jederzeit neu anlegen."
          bestaetigen="Parzelle entfernen"
          onAbbrechen={() => setFrage(null)}
          onBestaetigen={() => void entfernen()}
        />
      )}
    </section>
  )
}

function RueckfrageText({ darauf, neu, hatSkizzeOhneMassstab }: { darauf: ReturnType<typeof wasLiegtDarauf>; neu: boolean; hatSkizzeOhneMassstab: boolean }) {
  const teile: string[] = []
  if (darauf.bauteile) teile.push(`${darauf.bauteile} ${darauf.bauteile === 1 ? 'Bauteil' : 'Bauteile'} im Grundriss`)
  if (darauf.gruen) teile.push(`${darauf.gruen} Grün-${darauf.gruen === 1 ? 'Element' : 'Elemente'}`)
  if (!teile.length && darauf.grundlage) teile.push(`${darauf.grundlage} Bau-${darauf.grundlage === 1 ? 'Form' : 'Formen'} in der Grün-Skizze`)
  return (
    <>
      <p>Auf der Parzelle liegen schon {teile.join(' und ')}.</p>
      {neu || hatSkizzeOhneMassstab ? (
        <p>
          Der Grundriss im Bau-Teil liegt schon in Metern und bleibt, wo er ist. Die Grün-Skizze hatte bisher keinen Maßstab: Ihr Grundstück (sonst die ganze Zeichenfläche) wird so auf die Parzelle gelegt, dass es sie
          ausfüllt; alles Grüne bleibt dabei in seiner Lage zueinander. Bitte danach kurz prüfen.
        </p>
      ) : (
        <p>
          Bauteile und Grün behalten ihre Lage und Größe in Metern, auch wenn sich der Maßstab der Skizze ändert. Wird die Parzelle kleiner oder anders geformt, kann etwas außerhalb liegen – die App weist dann nur darauf hin.
        </p>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Zusammenfassung
// ---------------------------------------------------------------------------

function ParzelleKurz({ parzelle, loesung, pxProM }: { parzelle: Parzelle; loesung: Loesung; pxProM: number }) {
  const form =
    parzelle.form === 'rechteck'
      ? `Rechteckig ${DE.format(parzelle.laenge ?? 0)} × ${DE.format(parzelle.breite ?? 0)} m`
      : `${parzelle.ecken?.length ?? 0} Ecken, Seiten ${(loesung.seitenlaengen ?? []).map((s) => DE.format(s)).join(' · ')} m`
  return (
    <p data-testid="parzelle-kurz">
      {form} · Fläche <strong className="zahl">{DE2.format(loesung.flaeche ?? 0)} m²</strong> (berechnet) · {massstabText(pxProM)}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Rechteck
// ---------------------------------------------------------------------------

function RechteckEingabe({ entwurf, vertrag, onAendern }: { entwurf: Parzelle; vertrag: number | undefined; onAendern: (p: Partial<Parzelle>) => void }) {
  const ohneExcel = useOhneExcel()
  const vorschlag = (() => {
    // Ist eine Seite getippt und die Vertragsfläche bekannt, liegt die andere Seite nahe
    if (!vertrag) return undefined
    if (entwurf.laenge && !entwurf.breite) return { feld: 'breite' as const, wert: Math.round((vertrag / entwurf.laenge) * 100) / 100 }
    if (entwurf.breite && !entwurf.laenge) return { feld: 'laenge' as const, wert: Math.round((vertrag / entwurf.breite) * 100) / 100 }
    return undefined
  })()
  // Aus der Bau-Excel übernommen: Seitenverhältnis der gezeichneten Form + Vertragsfläche → Maße zum Überschreiben
  const ausExcel = (() => {
    const e = entwurf.ecken
    if (!vertrag || !e || e.length !== 4 || entwurf.laenge || entwurf.breite) return undefined
    const w = Math.max(...e.map((p) => p.x)) - Math.min(...e.map((p) => p.x))
    const h = Math.max(...e.map((p) => p.y)) - Math.min(...e.map((p) => p.y))
    if (!(w > 0 && h > 0)) return undefined
    const breite = Math.round(Math.sqrt((vertrag * w) / h) * 10) / 10
    return { breite, laenge: Math.round((vertrag / breite) * 10) / 10 }
  })()
  return (
    <div className="formular">
      <div className="feld-reihe">
        <ZahlFeld label="Länge" einheit="m" wert={entwurf.laenge} onChange={(v) => onAendern({ laenge: v })} hilfe="In der Skizze von oben nach unten (vom Weg nach hinten)." />
        <ZahlFeld label="Breite" einheit="m" wert={entwurf.breite} onChange={(v) => onAendern({ breite: v })} hilfe="In der Skizze von links nach rechts." />
      </div>
      <div className="grundlage-knoepfe">
        <button type="button" className="knopf" onClick={() => onAendern({ laenge: entwurf.breite, breite: entwurf.laenge })} disabled={!entwurf.laenge && !entwurf.breite}>
          Länge und Breite tauschen
        </button>
        {!ohneExcel && ausExcel && (
          <button type="button" className="knopf" data-testid="parzelle-vorschlag-excel" onClick={() => onAendern({ laenge: ausExcel.laenge, breite: ausExcel.breite })}>
            Vorschlag: {DE.format(ausExcel.laenge)} × {DE.format(ausExcel.breite)} m aus Vertragsfläche und Bau-Excel
          </button>
        )}
        {vorschlag && (
          <button type="button" className="knopf" onClick={() => onAendern({ [vorschlag.feld]: vorschlag.wert })}>
            {vorschlag.feld === 'breite' ? 'Breite' : 'Länge'} {DE.format(vorschlag.wert)} m aus der Vertragsfläche
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Andere Form: Ecken zeichnen, Seiten/Diagonalen/Winkel eintippen
// ---------------------------------------------------------------------------

function FreiEingabe({
  entwurf,
  loesung,
  zeichnen,
  setZeichnen,
  onAendern,
}: {
  entwurf: Parzelle
  loesung: Loesung
  zeichnen: boolean
  setZeichnen: (z: boolean) => void
  onAendern: (p: Partial<Parzelle>) => void
}) {
  const ecken = entwurf.ecken ?? grobLeer()!
  const n = ecken.length
  const setzeEcken = (neu: NonNullable<Parzelle['ecken']>, zaehlerGeaendert: boolean) =>
    // Ändert sich die Zahl der Ecken, passen die eingetippten Seiten nicht mehr zu den Kanten: neu eintippen
    onAendern(zaehlerGeaendert ? { ecken: neu, seiten: neu.map(() => null), diagonalen: [], winkel: [] } : { ecken: neu })
  const seiten = entwurf.seiten ?? []
  const diagonalen = entwurf.diagonalen ?? []
  const winkel = entwurf.winkel ?? []

  return (
    <div className="formular">
      <div className="feld">
        <span className="label" id="ecken-label">
          1. Ecken grob zeichnen
        </span>
        <p className="neben">
          Tippe die Ecken der Parzelle nacheinander an (rund um die Parzelle, in der Reihenfolge A, B, C …). Eine Ecke lässt sich ziehen. Die Lage muss nicht genau stimmen – sie sagt der App nur, wie die Parzelle liegt.
        </p>
        <EckenZeichnung ecken={ecken} zeichnen={zeichnen} onAendern={setzeEcken} />
        <div className="grundlage-knoepfe">
          {zeichnen ? (
            <button type="button" className="knopf knopf-primaer" disabled={n < 3} onClick={() => setZeichnen(false)}>
              Fertig – Maße eintippen
            </button>
          ) : (
            <button type="button" className="knopf" disabled={n >= MAX_ECKEN} onClick={() => setZeichnen(true)}>
              <Plus {...ICON} size={18} /> Weitere Ecke
            </button>
          )}
          <button type="button" className="knopf" disabled={n === 0} onClick={() => setzeEcken(ecken.slice(0, -1), true)}>
            <Undo2 {...ICON} size={18} /> Letzte Ecke zurück
          </button>
        </div>
      </div>

      {n >= 3 && (
        <>
          <fieldset className="fieldset">
            <legend className="label">2. Seitenlängen</legend>
            <div className="feld-reihe parzelle-seiten">
              {ecken.map((_e, i) => (
                <ZahlFeld
                  key={i}
                  label={`Seite ${eckenName(i)}–${eckenName((i + 1) % n)}`}
                  einheit="m"
                  wert={seiten[i] ?? undefined}
                  onChange={(v) => {
                    const neu = ecken.map((_x, k) => seiten[k] ?? null)
                    neu[i] = v ?? null
                    onAendern({ seiten: neu })
                  }}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="fieldset">
            <legend className="label">3. Diagonalen{n > 3 ? ` (ein ${n === 4 ? 'Viereck' : `${n}-Eck`} braucht ${n - 3} ${n === 4 ? 'Diagonale' : 'Diagonalen'} oder Winkel)` : ''}</legend>
            {n === 3 && <p className="neben">Ein Dreieck ist mit den drei Seiten eindeutig.</p>}
            {diagonalen.map((d, i) => (
              <div className="parzelle-zeile" key={i}>
                <EckenWahl label="von Ecke" wert={d.von} n={n} onChange={(v) => onAendern({ diagonalen: diagonalen.map((x, k) => (k === i ? { ...x, von: v } : x)) })} />
                <EckenWahl label="nach Ecke" wert={d.nach} n={n} onChange={(v) => onAendern({ diagonalen: diagonalen.map((x, k) => (k === i ? { ...x, nach: v } : x)) })} />
                <ZahlFeld
                  label={`Diagonale ${eckenName(d.von)}–${eckenName(d.nach)}`}
                  einheit="m"
                  wert={d.laenge}
                  onChange={(v) => onAendern({ diagonalen: diagonalen.map((x, k) => (k === i ? { ...x, laenge: v } : x)) })}
                />
                <button type="button" className="knopf" aria-label={`Diagonale ${eckenName(d.von)}–${eckenName(d.nach)} entfernen`} onClick={() => onAendern({ diagonalen: diagonalen.filter((_x, k) => k !== i) })}>
                  <Trash2 {...ICON} size={18} />
                </button>
              </div>
            ))}
            {winkel.map((w, i) => (
              <div className="parzelle-zeile" key={`w${i}`}>
                <EckenWahl label="Winkel an Ecke" wert={w.ecke} n={n} onChange={(v) => onAendern({ winkel: winkel.map((x, k) => (k === i ? { ...x, ecke: v } : x)) })} />
                <ZahlFeld
                  label={`Innenwinkel an ${eckenName(w.ecke)}`}
                  einheit="°"
                  wert={w.grad}
                  onChange={(v) => onAendern({ winkel: winkel.map((x, k) => (k === i ? { ...x, grad: v } : x)) })}
                />
                <button type="button" className="knopf" aria-label={`Winkel an ${eckenName(w.ecke)} entfernen`} onClick={() => onAendern({ winkel: winkel.filter((_x, k) => k !== i) })}>
                  <Trash2 {...ICON} size={18} />
                </button>
              </div>
            ))}
            <div className="grundlage-knoepfe">
              <button type="button" className="knopf" onClick={() => onAendern({ diagonalen: [...diagonalen, { von: 0, nach: Math.min(2, n - 1) }] })} disabled={n < 4}>
                <Plus {...ICON} size={18} /> Diagonale
              </button>
              <button type="button" className="knopf" onClick={() => onAendern({ winkel: [...winkel, { ecke: 1 % n }] })} disabled={n < 4}>
                <Plus {...ICON} size={18} /> Winkel
              </button>
            </div>
          </fieldset>
        </>
      )}
      {loesung.mehrdeutig && <span hidden data-testid="parzelle-mehrdeutig" />}
    </div>
  )
}

function EckenWahl({ label, wert, n, onChange }: { label: string; wert: number; n: number; onChange: (v: number) => void }) {
  const id = useId()
  return (
    <div className="feld">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="eingabe" value={wert} onChange={(e) => onChange(Number(e.target.value))}>
        {Array.from({ length: n }, (_x, i) => (
          <option key={i} value={i}>
            {eckenName(i)}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Die App sagt, was fehlt – ein Tipp trägt die Zeile schon ein. */
function Vorschlaege({ fehlt, entwurf, onAendern }: { fehlt: Fehlend[]; entwurf: Parzelle; onAendern: (p: Partial<Parzelle>) => void }) {
  const diag = fehlt.filter((f) => f.art === 'diagonale' && f.ecken)
  if (!diag.length) return null
  const diagonalen = entwurf.diagonalen ?? []
  const winkel = entwurf.winkel ?? []
  return (
    <div className="grundlage-knoepfe" data-testid="parzelle-vorschlaege">
      {diag.map((f) => (
        <span key={f.text} className="parzelle-vorschlag">
          <button
            type="button"
            className="knopf"
            onClick={() => onAendern({ diagonalen: [...diagonalen, { von: f.ecken![0], nach: f.ecken![1] }] })}
          >
            <Plus {...ICON} size={18} /> {f.text}
          </button>
          {f.alternativWinkel?.map((e) => (
            <button key={e} type="button" className="knopf" onClick={() => onAendern({ winkel: [...winkel, { ecke: e }] })}>
              oder Winkel an {eckenName(e)}
            </button>
          ))}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Zeichnungen
// ---------------------------------------------------------------------------

const ZEICHNUNG = 100
const GREIF = 9

/** Ecken grob zeichnen: Tippen setzt eine Ecke (im Zeichenmodus), Ziehen verschiebt eine vorhandene. */
function EckenZeichnung({
  ecken,
  zeichnen,
  onAendern,
}: {
  ecken: NonNullable<Parzelle['ecken']>
  zeichnen: boolean
  onAendern: (neu: NonNullable<Parzelle['ecken']>, zaehlerGeaendert: boolean) => void
}) {
  const svg = useRef<SVGSVGElement>(null)
  const zieht = useRef<number | null>(null)
  const bewegt = useRef(false)
  const zuSvg = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    return { x: Math.max(0, Math.min(ZEICHNUNG, ((e.clientX - r.left) / r.width) * ZEICHNUNG)), y: Math.max(0, Math.min(ZEICHNUNG, ((e.clientY - r.top) / r.height) * ZEICHNUNG)) }
  }
  const naechste = (p: { x: number; y: number }) => {
    let best = -1
    let d = GREIF
    ecken.forEach((q, i) => {
      const abstand = Math.hypot(q.x - p.x, q.y - p.y)
      if (abstand <= d) {
        d = abstand
        best = i
      }
    })
    return best
  }
  const r1 = (n: number) => Math.round(n * 10) / 10
  return (
    <svg
      ref={svg}
      className="parzelle-ecken"
      viewBox={`0 0 ${ZEICHNUNG} ${ZEICHNUNG}`}
      role="img"
      aria-label={`Grobe Zeichnung der Ecken, ${ecken.length} Ecken`}
      data-testid="parzelle-ecken"
      onPointerDown={(e) => {
        const p = zuSvg(e)
        const i = naechste(p)
        bewegt.current = false
        if (i >= 0) {
          zieht.current = i
          svg.current!.setPointerCapture(e.pointerId)
        } else if (zeichnen && ecken.length < MAX_ECKEN) {
          onAendern([...ecken, { x: r1(p.x), y: r1(p.y) }], true)
        }
      }}
      onPointerMove={(e) => {
        if (zieht.current === null) return
        bewegt.current = true
        const p = zuSvg(e)
        onAendern(ecken.map((q, i) => (i === zieht.current ? { x: r1(p.x), y: r1(p.y) } : q)), false)
      }}
      onPointerUp={() => (zieht.current = null)}
      onPointerCancel={() => (zieht.current = null)}
      style={{ touchAction: 'none' }}
    >
      <rect x="0" y="0" width={ZEICHNUNG} height={ZEICHNUNG} className="parzelle-ecken-grund" />
      {ecken.length >= 2 && (
        <polygon points={ecken.map((q) => `${q.x},${q.y}`).join(' ')} className="parzelle-ecken-form" fill={ecken.length >= 3 ? 'currentColor' : 'none'} fillOpacity={0.08} />
      )}
      {ecken.map((q, i) => (
        <g key={i}>
          <circle cx={q.x} cy={q.y} r={3.6} className="parzelle-ecke" />
          <text x={q.x} y={q.y - 5.5} textAnchor="middle" className="parzelle-ecke-text">
            {eckenName(i)}
          </text>
        </g>
      ))}
    </svg>
  )
}

/** Berechnete Form maßstäblich, mit Ecken und Seitenlängen. */
function Vorschau({ loesung }: { loesung: Loesung }) {
  const p = loesung.punkte
  const b = loesung.breite ?? 1
  const h = loesung.hoehe ?? 1
  const rand = Math.max(b, h) * 0.16
  const fs = Math.max(b, h) / 22
  const n = p.length
  // Fläche mit Vorzeichen: Welche Seite ist außen?
  let a2 = 0
  p.forEach((q, i) => {
    const r = p[(i + 1) % n]
    a2 += q.x * r.y - r.x * q.y
  })
  return (
    <svg className="parzelle-vorschau" viewBox={`${-rand} ${-rand} ${b + 2 * rand} ${h + 2 * rand}`} role="img" aria-label="Berechnete Form der Parzelle" data-testid="parzelle-vorschau">
      <polygon points={p.map((q) => `${q.x},${q.y}`).join(' ')} className="parzelle-vorschau-form" />
      {p.map((q, i) => {
        const r = p[(i + 1) % n]
        const l = Math.hypot(r.x - q.x, r.y - q.y) || 1
        // außen = links von der Laufrichtung bei positivem a2 (Uhrzeigersinn, y nach unten)
        const nx = ((r.y - q.y) / l) * (a2 > 0 ? 1 : -1)
        const ny = (-(r.x - q.x) / l) * (a2 > 0 ? 1 : -1)
        return (
          <text key={i} x={(q.x + r.x) / 2 + nx * fs * 0.9} y={(q.y + r.y) / 2 + ny * fs * 0.9 + fs * 0.35} fontSize={fs} textAnchor="middle" className="parzelle-vorschau-text">
            {DE.format(Math.round(l * 100) / 100)} m
          </text>
        )
      })}
      {p.map((q, i) => (
        <text key={`e${i}`} x={q.x} y={q.y - fs * 0.6} fontSize={fs * 0.9} fontWeight={700} textAnchor="middle" className="parzelle-vorschau-ecke">
          {eckenName(i)}
        </text>
      ))}
    </svg>
  )
}

/** Hinweis „Bauteile außerhalb der Parzelle“ für den Bau-Reiter. */
export function AusserhalbHinweis({ wep, onSchieben }: { wep: Wep; onSchieben: () => void }) {
  const lage = parzellenLage(wep.parzelle)
  const aus = teileAusserhalb(wep.grundriss, lage)
  if (!aus.length || !wep.grundriss) return null
  const namen = aus.map((i) => wep.grundriss!.teile[i].kuerzel || '?').join(', ')
  return (
    <Meldung>
      <p data-testid="parzelle-ausserhalb">
        {namen} {aus.length === 1 ? 'liegt' : 'liegen'} (teilweise) außerhalb der Parzelle. Das ist nur ein Hinweis – ihr könnt den Grundriss verschieben oder die Parzelle prüfen.
      </p>
      <button type="button" className="knopf" onClick={onSchieben}>
        Grundriss in die Parzelle schieben
      </button>
    </Meldung>
  )
}
