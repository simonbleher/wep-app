// Erfassungsmaske für ein einzelnes WEP.
// 5 Reiter: Formalien · Außenanlagen · Aufwuchs · Beseitigung · Export
//
// Mobile-optimiert: Touch-Targets ≥ 56px, Hochkontrast-Palette via CSS-Variablen.

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ChangeEvent,
} from 'react'
import type { Wep, Position, BeseitigungsPosition, Hinweis } from '@/model'
import { ZUSTANDSSTUFEN, neuerWep } from '@/model'
import { ladeWep, speichereWep } from './db'
import { sucheKatalog } from '@/katalog'
import type { Position as KatalogPosition, Treffer } from '@/katalog'
import { preisvorschlag } from '@/gruen/preisvorschlag'
import { regelhinweise } from '@/gruen/regelhinweise'
import { summeAbschnitt, summeBeseitigung } from '@/gruen/summen'
import { exportWep } from '@/export'
import type { FormalienKonflikt } from '@/export'
import type { InvasiveArt } from '@/model'

// ── Daten-Importe ──────────────────────────────────────────────────────────────
import katalogJson from '../../data/katalog.json'
import invasiveJson from '../../data/invasive.json'

const KATALOG_POSITIONEN = (
  katalogJson as unknown as { positionen: KatalogPosition[] }
).positionen

const INVASIVE_ARTEN = (
  invasiveJson as unknown as { arten: InvasiveArt[] }
).arten

// Template-URL (Vite-Asset-Import, kein Inhalt im JS-Bundle)
import templateUrl from '../../docs/WEP_Vorlage.xlsx?url'

// ── localStorage: zuletzt verwendet ──────────────────────────────────────────
const ZULETZT_KEY = 'wep_zuletzt'
const ZULETZT_MAX = 10

function ladeZuletzt(): string[] {
  try {
    const raw = localStorage.getItem(ZULETZT_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function speichereZuletzt(katalogId: string): void {
  const liste = [katalogId, ...ladeZuletzt().filter((id) => id !== katalogId)].slice(
    0,
    ZULETZT_MAX,
  )
  localStorage.setItem(ZULETZT_KEY, JSON.stringify(liste))
}

// ── Typen ─────────────────────────────────────────────────────────────────────
type Tab = 'formalien' | 'aussenanlagen' | 'aufwuchs' | 'beseitigung' | 'export'

interface NeuePosition {
  katalogId?: string
  bezeichnung: string
  variante?: string // gewählte Variante als Beschreibungstext
  hoechstwert?: number
  anzahl: string
  einheit: string
  zustand: keyof typeof ZUSTANDSSTUFEN
  einzelpreisStr: string
  preisManuell: boolean
}

interface NeueBeseitigung {
  gegenstand: string
  menge: string
  einheit: string
  einzelpreisStr: string
  faktor: string
  begruendung: string
}

const ZUSTAND_KEYS = Object.keys(ZUSTANDSSTUFEN) as (keyof typeof ZUSTANDSSTUFEN)[]

// ── Hilfskomponenten ──────────────────────────────────────────────────────────

function HinweisListe({ hinweise }: { hinweise: Hinweis[] }) {
  if (hinweise.length === 0) return null
  return (
    <ul className="hinweis-liste" role="list">
      {hinweise.map((h, i) => (
        <li key={i} className={`hinweis hinweis-warnung`}>
          ⚠️ {h.text}
          {h.regel && <span className="hinweis-regel"> ({h.regel})</span>}
        </li>
      ))}
    </ul>
  )
}

function SummeAnzeige({ label, wert }: { label: string; wert: number }) {
  return (
    <div className="summe-zeile">
      <span className="summe-label">{label}</span>
      <span className="summe-wert">{wert.toFixed(2)} €</span>
    </div>
  )
}

// ── Positions-Abschnitt (Außenanlagen / Aufwuchs) ────────────────────────────

interface PositionsAbschnittProps {
  positionen: Position[]
  parzellenflaecheQm: number
  onChange: (neu: Position[]) => void
}

function PositionsAbschnitt({
  positionen,
  parzellenflaecheQm,
  onChange,
}: PositionsAbschnittProps) {
  const [suchbegriff, setSuchbegriff] = useState('')
  const [treffer, setTreffer] = useState<Treffer[]>([])
  const [auswahl, setAuswahl] = useState<Treffer | null>(null)
  const [freitext, setFreitext] = useState(false)
  const [neuePos, setNeuePos] = useState<NeuePosition | null>(null)
  const suchRef = useRef<HTMLInputElement>(null)

  // Suche aktualisieren
  useEffect(() => {
    const zuletzt = ladeZuletzt()
    const ergebnisse = sucheKatalog(KATALOG_POSITIONEN, suchbegriff, {
      zuletztVerwendet: zuletzt,
      limit: 10,
    })
    setTreffer(ergebnisse)
  }, [suchbegriff])

  function katalogEintragWaehlen(t: Treffer) {
    setAuswahl(t)
    setFreitext(false)
    const kp = t.position
    const erstVariante = kp.varianten?.[0]
    const hw = kp.hoechstwert ?? erstVariante?.hoechstwert ?? 0
    const varText = erstVariante
      ? [erstVariante.form, erstVariante.altersstufe, erstVariante.groesse, erstVariante.typ]
          .filter(Boolean)
          .join(', ')
      : ''
    setNeuePos({
      katalogId: kp.id,
      bezeichnung: kp.bezeichnung,
      variante: varText,
      hoechstwert: hw,
      anzahl: '1',
      einheit: kp.einheit,
      zustand: 'gut',
      einzelpreisStr: preisvorschlag(hw, ZUSTANDSSTUFEN.gut.faktor).toFixed(2),
      preisManuell: false,
    })
  }

  function freitextEintragOeffnen() {
    setAuswahl(null)
    setFreitext(true)
    setNeuePos({
      bezeichnung: '',
      anzahl: '1',
      einheit: 'Stück',
      zustand: 'gut',
      einzelpreisStr: '0.00',
      preisManuell: false,
    })
  }

  function varianteAktualisieren(varianteText: string, hw: number) {
    if (!neuePos) return
    const faktor = ZUSTANDSSTUFEN[neuePos.zustand].faktor
    const vorschlag = preisvorschlag(hw, faktor)
    setNeuePos({
      ...neuePos,
      variante: varianteText,
      hoechstwert: hw,
      einzelpreisStr: neuePos.preisManuell ? neuePos.einzelpreisStr : vorschlag.toFixed(2),
    })
  }

  function zustandAktualisieren(zustand: keyof typeof ZUSTANDSSTUFEN) {
    if (!neuePos) return
    const hw = neuePos.hoechstwert ?? 0
    const faktor = ZUSTANDSSTUFEN[zustand].faktor
    const vorschlag = preisvorschlag(hw, faktor)
    setNeuePos({
      ...neuePos,
      zustand,
      einzelpreisStr: neuePos.preisManuell ? neuePos.einzelpreisStr : vorschlag.toFixed(2),
    })
  }

  function hinzufuegen() {
    if (!neuePos) return
    const anzahl = parseFloat(neuePos.anzahl)
    const einzelpreis = parseFloat(neuePos.einzelpreisStr)
    if (!neuePos.bezeichnung.trim() || isNaN(anzahl) || isNaN(einzelpreis)) return

    const position: Position = {
      id: crypto.randomUUID(),
      katalogId: neuePos.katalogId,
      bezeichnung: neuePos.bezeichnung.trim(),
      anzahl,
      einheit: neuePos.einheit,
      zustand: neuePos.zustand,
      hoechstwert: neuePos.hoechstwert,
      einzelpreis,
      preisManuell: neuePos.preisManuell,
      hinweise: [],
    }

    if (neuePos.katalogId) {
      speichereZuletzt(neuePos.katalogId)
    }

    onChange([...positionen, position])
    setNeuePos(null)
    setAuswahl(null)
    setFreitext(false)
    setSuchbegriff('')
    suchRef.current?.focus()
  }

  function loeschen(id: string) {
    onChange(positionen.filter((p) => p.id !== id))
  }

  const hinweise = regelhinweise(positionen, parzellenflaecheQm, INVASIVE_ARTEN)

  // Variantenauswahl für aktuellen Treffer
  const variantenFuerAuswahl = auswahl?.position.varianten ?? null

  return (
    <div className="positions-abschnitt">
      {/* Schnellsuche */}
      {!neuePos && (
        <div className="such-container">
          <input
            ref={suchRef}
            type="search"
            className="such-feld"
            placeholder="Katalog durchsuchen …"
            value={suchbegriff}
            onChange={(e) => setSuchbegriff(e.target.value)}
            aria-label="Katalog durchsuchen"
          />
          {treffer.length > 0 && (
            <ul className="treffer-liste" role="listbox">
              {treffer.map((t) => (
                <li key={t.position.id} role="option">
                  <button
                    type="button"
                    className="treffer-btn"
                    onClick={() => katalogEintragWaehlen(t)}
                  >
                    <span className="treffer-bez">{t.position.bezeichnung}</span>
                    <span className="treffer-kat">{t.position.kategorie}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="btn btn-sekundaer"
            onClick={freitextEintragOeffnen}
          >
            + Eigene Position
          </button>
        </div>
      )}

      {/* Neue Position erfassen */}
      {neuePos && (
        <div className="neue-pos-formular">
          <h3 className="formular-titel">
            {freitext ? 'Eigene Position' : auswahl?.position.bezeichnung}
          </h3>

          {/* Variantenauswahl */}
          {variantenFuerAuswahl && variantenFuerAuswahl.length > 1 && (
            <label className="feld-gruppe">
              <span className="feld-label">Variante</span>
              <select
                className="feld-select"
                defaultValue={0}
                onChange={(e) => {
                  const idx = parseInt(e.target.value, 10)
                  const v = variantenFuerAuswahl[idx]
                  const varText = [v.form, v.altersstufe, v.groesse, v.typ]
                    .filter(Boolean)
                    .join(', ')
                  varianteAktualisieren(varText, v.hoechstwert)
                }}
              >
                {variantenFuerAuswahl.map((v, i) => (
                  <option key={i} value={i}>
                    {[v.form, v.altersstufe, v.groesse, v.typ].filter(Boolean).join(', ') ||
                      `Variante ${i + 1}`}
                    {' – bis '}
                    {v.hoechstwert} €
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Bezeichnung (bei Freitext) */}
          {freitext && (
            <label className="feld-gruppe">
              <span className="feld-label">Bezeichnung</span>
              <input
                type="text"
                className="feld-input"
                value={neuePos.bezeichnung}
                onChange={(e) => setNeuePos({ ...neuePos, bezeichnung: e.target.value })}
                placeholder="z. B. Obstgehölz, Birne, Halbstamm"
              />
            </label>
          )}

          {/* Anzahl */}
          <label className="feld-gruppe">
            <span className="feld-label">Anzahl</span>
            <input
              type="number"
              className="feld-input"
              min="0"
              step="0.01"
              value={neuePos.anzahl}
              onChange={(e) => setNeuePos({ ...neuePos, anzahl: e.target.value })}
            />
          </label>

          {/* Einheit */}
          <label className="feld-gruppe">
            <span className="feld-label">Einheit</span>
            <input
              type="text"
              className="feld-input"
              value={neuePos.einheit}
              onChange={(e) => setNeuePos({ ...neuePos, einheit: e.target.value })}
              list="einheit-optionen"
            />
            <datalist id="einheit-optionen">
              <option value="Stück" />
              <option value="m" />
              <option value="m²" />
              <option value="lfdm" />
              <option value="Pauschale" />
            </datalist>
          </label>

          {/* Zustand */}
          <label className="feld-gruppe">
            <span className="feld-label">Zustand</span>
            <select
              className="feld-select"
              value={neuePos.zustand}
              onChange={(e) => zustandAktualisieren(e.target.value as keyof typeof ZUSTANDSSTUFEN)}
            >
              {ZUSTAND_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          {/* Einzelpreis */}
          <label className="feld-gruppe">
            <span className="feld-label">
              Einzelpreis (€){!neuePos.preisManuell && neuePos.hoechstwert != null && (
                <span className="feld-hint"> Vorschlag</span>
              )}
            </span>
            <input
              type="number"
              className="feld-input"
              min="0"
              step="0.01"
              value={neuePos.einzelpreisStr}
              onChange={(e) =>
                setNeuePos({ ...neuePos, einzelpreisStr: e.target.value, preisManuell: true })
              }
            />
          </label>

          <div className="formular-aktionen">
            <button
              type="button"
              className="btn btn-primary"
              onClick={hinzufuegen}
            >
              Hinzufügen
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => { setNeuePos(null); setAuswahl(null); setFreitext(false) }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Hinweise (nie blockierend) */}
      <HinweisListe hinweise={hinweise} />

      {/* Positionsliste */}
      {positionen.length > 0 && (
        <>
          <ul className="pos-liste">
            {positionen.map((p) => (
              <li key={p.id} className="pos-zeile">
                <div className="pos-info">
                  <span className="pos-bez">{p.bezeichnung}</span>
                  <span className="pos-detail">
                    {p.anzahl} {p.einheit}
                    {p.zustand ? ` · ${p.zustand}` : ''}
                    {' · '}
                    {p.einzelpreis.toFixed(2)} €/Einheit
                  </span>
                </div>
                <div className="pos-betrag">{(p.anzahl * p.einzelpreis).toFixed(2)} €</div>
                <button
                  type="button"
                  className="btn btn-gefahr pos-loeschen"
                  aria-label={`Position „${p.bezeichnung}" löschen`}
                  onClick={() => loeschen(p.id)}
                >
                  🗑️
                </button>
              </li>
            ))}
          </ul>
          <SummeAnzeige label="Zwischensumme" wert={summeAbschnitt(positionen)} />
        </>
      )}
    </div>
  )
}

// ── Beseitigungs-Abschnitt ──────────────────────────────────────────────────

interface BeseitigungsAbschnittProps {
  positionen: BeseitigungsPosition[]
  onChange: (neu: BeseitigungsPosition[]) => void
}

function BeseitigungsAbschnitt({ positionen, onChange }: BeseitigungsAbschnittProps) {
  const [neuePos, setNeuePos] = useState<NeueBeseitigung | null>(null)

  function oeffnen() {
    setNeuePos({
      gegenstand: '',
      menge: '1',
      einheit: 'Stück',
      einzelpreisStr: '0.00',
      faktor: '1',
      begruendung: '',
    })
  }

  function hinzufuegen() {
    if (!neuePos) return
    const menge = parseFloat(neuePos.menge)
    const einzelpreis = parseFloat(neuePos.einzelpreisStr)
    const faktor = parseFloat(neuePos.faktor)
    if (!neuePos.gegenstand.trim() || isNaN(menge) || isNaN(einzelpreis) || isNaN(faktor)) return

    const pos: BeseitigungsPosition = {
      id: crypto.randomUUID(),
      gegenstand: neuePos.gegenstand.trim(),
      menge,
      einheit: neuePos.einheit,
      einzelpreis,
      faktor,
      begruendung: faktor > 1 ? neuePos.begruendung : undefined,
    }
    onChange([...positionen, pos])
    setNeuePos(null)
  }

  function loeschen(id: string) {
    onChange(positionen.filter((p) => p.id !== id))
  }

  function feldAendern(key: keyof NeueBeseitigung, value: string) {
    if (!neuePos) return
    setNeuePos({ ...neuePos, [key]: value })
  }

  return (
    <div className="positions-abschnitt">
      {!neuePos && (
        <button type="button" className="btn btn-sekundaer" onClick={oeffnen}>
          + Position hinzufügen
        </button>
      )}

      {neuePos && (
        <div className="neue-pos-formular">
          <h3 className="formular-titel">Beseitigungsposition</h3>

          <label className="feld-gruppe">
            <span className="feld-label">Gegenstand</span>
            <input
              type="text"
              className="feld-input"
              value={neuePos.gegenstand}
              onChange={(e) => feldAendern('gegenstand', e.target.value)}
              placeholder="z. B. Hecke auf zulässige Höhe schneiden"
            />
          </label>

          <label className="feld-gruppe">
            <span className="feld-label">Menge</span>
            <input
              type="number"
              className="feld-input"
              min="0"
              step="0.01"
              value={neuePos.menge}
              onChange={(e) => feldAendern('menge', e.target.value)}
            />
          </label>

          <label className="feld-gruppe">
            <span className="feld-label">Einheit (ME)</span>
            <input
              type="text"
              className="feld-input"
              value={neuePos.einheit}
              onChange={(e) => feldAendern('einheit', e.target.value)}
              list="be-einheit-optionen"
            />
            <datalist id="be-einheit-optionen">
              <option value="Stück" />
              <option value="m" />
              <option value="m²" />
              <option value="Pauschale" />
            </datalist>
          </label>

          <label className="feld-gruppe">
            <span className="feld-label">Einzelpreis (€)</span>
            <input
              type="number"
              className="feld-input"
              min="0"
              step="0.01"
              value={neuePos.einzelpreisStr}
              onChange={(e) => feldAendern('einzelpreisStr', e.target.value)}
            />
          </label>

          <label className="feld-gruppe">
            <span className="feld-label">Faktor (Standard 1)</span>
            <input
              type="number"
              className="feld-input"
              min="0"
              step="0.1"
              value={neuePos.faktor}
              onChange={(e) => feldAendern('faktor', e.target.value)}
            />
          </label>

          {parseFloat(neuePos.faktor) > 1 && (
            <label className="feld-gruppe">
              <span className="feld-label">Begründung (Faktor &gt; 1)</span>
              <textarea
                className="feld-input"
                rows={2}
                value={neuePos.begruendung}
                onChange={(e) => feldAendern('begruendung', e.target.value)}
              />
            </label>
          )}

          <div className="formular-aktionen">
            <button type="button" className="btn btn-primary" onClick={hinzufuegen}>
              Hinzufügen
            </button>
            <button type="button" className="btn" onClick={() => setNeuePos(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {positionen.length > 0 && (
        <>
          <ul className="pos-liste">
            {positionen.map((p) => (
              <li key={p.id} className="pos-zeile">
                <div className="pos-info">
                  <span className="pos-bez">{p.gegenstand}</span>
                  <span className="pos-detail">
                    {p.menge} {p.einheit} · {p.einzelpreis.toFixed(2)} €
                    {p.faktor !== 1 ? ` · Faktor ${p.faktor}` : ''}
                  </span>
                </div>
                <div className="pos-betrag">
                  {(p.menge * p.einzelpreis * p.faktor).toFixed(2)} €
                </div>
                <button
                  type="button"
                  className="btn btn-gefahr pos-loeschen"
                  aria-label={`Position „${p.gegenstand}" löschen`}
                  onClick={() => loeschen(p.id)}
                >
                  🗑️
                </button>
              </li>
            ))}
          </ul>
          <SummeAnzeige label="Zwischensumme" wert={summeBeseitigung(positionen)} />
        </>
      )}
    </div>
  )
}

// ── Export-Reiter ─────────────────────────────────────────────────────────────

interface ExportReiterProps {
  wep: Wep
}

function ExportReiter({ wep }: ExportReiterProps) {
  const [bauExcel, setBauExcel] = useState<File | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [konflikte, setKonflikte] = useState<FormalienKonflikt[]>([])
  const [ueberlauf, setUeberlauf] = useState(false)
  const [abgeschnitten, setAbgeschnitten] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  function bauExcelWaehlen(e: ChangeEvent<HTMLInputElement>) {
    setBauExcel(e.target.files?.[0] ?? null)
    setKonflikte([])
    setUeberlauf(false)
    setAbgeschnitten(false)
    setFehler(null)
  }

  async function exportieren() {
    setLaeuft(true)
    setFehler(null)
    try {
      let sourceBuffer: ArrayBuffer
      if (bauExcel) {
        sourceBuffer = await bauExcel.arrayBuffer()
      } else {
        const response = await fetch(templateUrl)
        sourceBuffer = await response.arrayBuffer()
      }

      const result = await exportWep(wep, sourceBuffer)

      setKonflikte(result.konflikte)
      setUeberlauf(result.aufwuchsUeberlauf)
      setAbgeschnitten(result.aufwuchsAbgeschnitten)

      // Datei herunterladen
      const url = URL.createObjectURL(result.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = result.filename
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err))
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <div className="export-bereich">
      <p className="hinweis">
        Ohne Bau-Excel wird die leere WEP-Vorlage befüllt. Mit Bau-Excel werden
        die Grün-Daten in die bereits ausgefüllte Excel-Datei des Bau-Wertermittlers
        geschrieben. Die Bau-Blätter werden dabei niemals verändert.
      </p>

      <label className="feld-gruppe">
        <span className="feld-label">Bau-Excel hochladen (optional)</span>
        <input
          type="file"
          accept=".xlsx"
          className="feld-input"
          onChange={bauExcelWaehlen}
        />
      </label>

      {bauExcel && (
        <p className="hinweis">Bau-Excel: {bauExcel.name}</p>
      )}

      <button
        type="button"
        className="btn btn-primary"
        onClick={() => void exportieren()}
        disabled={laeuft}
      >
        {laeuft ? 'Exportiere …' : 'Excel exportieren'}
      </button>

      {fehler && (
        <p className="hinweis hinweis-warnung">Fehler beim Export: {fehler}</p>
      )}

      {konflikte.length > 0 && (
        <div className="hinweis hinweis-warnung">
          <strong>Formalien-Konflikte:</strong> Folgende Felder waren in der
          Bau-Excel bereits gefüllt und wurden nicht überschrieben.
          <ul>
            {konflikte.map((k) => (
              <li key={k.feld}>
                {k.feld} (Zelle {k.zelle}): Bau-Excel = „{k.bauExcelWert}" / App = „{k.appWert}"
              </li>
            ))}
          </ul>
        </div>
      )}

      {ueberlauf && !abgeschnitten && (
        <p className="hinweis hinweis-warnung">
          Aufwuchs I ist voll – weitere Positionen wurden auf Aufwuchs II übertragen.
        </p>
      )}

      {abgeschnitten && (
        <p className="hinweis hinweis-warnung">
          Zu viele Aufwuchs-Positionen (max. 64). Überzählige Positionen wurden
          nicht exportiert – bitte Positionen zusammenfassen.
        </p>
      )}
    </div>
  )
}

// ── Formalien-Reiter ──────────────────────────────────────────────────────────

interface FormalienReiterProps {
  wep: Wep
  onChange: (wep: Wep) => void
}

function FormalienReiter({ wep, onChange }: FormalienReiterProps) {
  const f = wep.formalien

  function feld(
    label: string,
    key: keyof typeof f,
    typ: 'text' | 'date' | 'number' = 'text',
  ) {
    const value = f[key] as string | number
    return (
      <label key={key} className="feld-gruppe">
        <span className="feld-label">{label}</span>
        <input
          type={typ}
          className="feld-input"
          value={value}
          onChange={(e) => {
            const neuerWert = typ === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
            onChange({
              ...wep,
              formalien: { ...wep.formalien, [key]: neuerWert },
            })
          }}
        />
      </label>
    )
  }

  return (
    <div className="formalien-bereich">
      {feld('Kleingartenanlage', 'kleingartenanlage')}
      {feld('Parzelle', 'parzelle')}
      {feld('Weg (optional)', 'weg')}
      {feld('Parzellenfläche (m²)', 'parzellenflaecheM2', 'number')}
      {feld('Vorgangs-Nr.', 'vorgangsNr')}
      {feld('Unterpächter', 'unterpaechter')}
      {feld('Auftraggeber', 'auftraggeber')}
      {feld('Vertreten durch Rechtsanwalt', 'vertretenDurchRA')}
      {feld('Anwesend für den Verein', 'anwesendVerein')}
      {feld('Anwesend für den Unterpächter', 'anwesendUnterpaechter')}
      {feld('Anwesend für den Auftraggeber', 'anwesendAuftraggeber')}
      {feld('Wertermittler Baulichkeiten', 'wertermittlerBaulichkeiten')}
      {feld('Wertermittler Außenanlagen & Aufwuchs', 'wertermittlerAussenAufwuchs')}
      {feld('Wertermittlung am', 'wertermittlungAm', 'date')}
      {feld('Protokollerstellung am', 'protokollerstellungAm', 'date')}
    </div>
  )
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────

interface Props {
  wepId: string
  onZurueck: () => void
}

export function WepDetail({ wepId, onZurueck }: Props) {
  const [wep, setWep] = useState<Wep | null>(null)
  const [aktiveTab, setAktiveTab] = useState<Tab>('formalien')

  // WEP aus IndexedDB laden
  useEffect(() => {
    void ladeWep(wepId).then((geladen) => {
      setWep(geladen ?? neuerWep(wepId))
    })
  }, [wepId])

  // WEP speichern (optimistisch: State sofort setzen, dann DB)
  const aktualisieren = useCallback((neu: Wep) => {
    setWep(neu)
    void speichereWep(neu)
  }, [])

  if (!wep) {
    return (
      <main className="seite">
        <p className="hinweis">Lade …</p>
      </main>
    )
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'formalien', label: 'Formalien' },
    { key: 'aussenanlagen', label: 'Außenanlagen' },
    { key: 'aufwuchs', label: 'Aufwuchs' },
    { key: 'beseitigung', label: 'Beseitigung' },
    { key: 'export', label: 'Export' },
  ]

  return (
    <main className="seite">
      <header className="kopf">
        <button type="button" className="btn btn-gross" onClick={onZurueck}>
          ← zurück
        </button>
        <h1>WEP {wep.id}</h1>
      </header>

      {/* Tab-Navigation */}
      <nav className="tab-nav" role="tablist" aria-label="Abschnitte">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={aktiveTab === t.key}
            className={`tab-btn${aktiveTab === t.key ? ' tab-btn-aktiv' : ''}`}
            onClick={() => setAktiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Tab-Inhalte */}
      <div className="tab-inhalt" role="tabpanel">
        {aktiveTab === 'formalien' && (
          <FormalienReiter wep={wep} onChange={aktualisieren} />
        )}

        {aktiveTab === 'aussenanlagen' && (
          <>
            <label className="feld-gruppe">
              <span className="feld-label">Beschreibung Außenanlagen</span>
              <textarea
                className="feld-input"
                rows={3}
                value={wep.gruen.beschreibungAussen}
                onChange={(e) =>
                  aktualisieren({
                    ...wep,
                    gruen: { ...wep.gruen, beschreibungAussen: e.target.value },
                  })
                }
              />
            </label>
            <PositionsAbschnitt
              positionen={wep.gruen.aussenanlagen}
              parzellenflaecheQm={wep.formalien.parzellenflaecheM2}
              onChange={(neu) =>
                aktualisieren({
                  ...wep,
                  gruen: { ...wep.gruen, aussenanlagen: neu },
                })
              }
            />
          </>
        )}

        {aktiveTab === 'aufwuchs' && (
          <>
            <label className="feld-gruppe">
              <span className="feld-label">Beschreibung Aufwuchs</span>
              <textarea
                className="feld-input"
                rows={3}
                value={wep.gruen.beschreibungAufwuchs}
                onChange={(e) =>
                  aktualisieren({
                    ...wep,
                    gruen: { ...wep.gruen, beschreibungAufwuchs: e.target.value },
                  })
                }
              />
            </label>
            <PositionsAbschnitt
              positionen={wep.gruen.aufwuchs}
              parzellenflaecheQm={wep.formalien.parzellenflaecheM2}
              onChange={(neu) =>
                aktualisieren({ ...wep, gruen: { ...wep.gruen, aufwuchs: neu } })
              }
            />
          </>
        )}

        {aktiveTab === 'beseitigung' && (
          <BeseitigungsAbschnitt
            positionen={wep.gruen.beseitigungAA}
            onChange={(neu) =>
              aktualisieren({ ...wep, gruen: { ...wep.gruen, beseitigungAA: neu } })
            }
          />
        )}

        {aktiveTab === 'export' && <ExportReiter wep={wep} />}
      </div>
    </main>
  )
}
