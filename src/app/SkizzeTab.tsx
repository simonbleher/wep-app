// Skizze-Tab: bindet den SkizzeEditor (src/skizze) in die Erfassung ein.
//
// Der Editor bekommt seinen Startwert nur einmal beim Öffnen des Tabs. Würden
// wir ihm nach jedem Speichern den neuen Wert geben, setzt er sich zurück
// (Auswahl weg). Gespeichert wird entprellt; beim Verlassen des Tabs sofort.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layers, Lock, LockOpen } from 'lucide-react'
import type { Wep, SkizzeDaten } from '@/model'
import { SkizzeEditor } from '@/skizze/SkizzeEditor'
import { SkizzeChat } from '@/skizze/SkizzeChat'
import { leereSkizze, istGrundlage } from '@/skizze/types'
import { grundrissHatTeile, hatGrundlage, setzeGrundlageGesperrt, uebernehmeGrundlage, type GrundlageQuelle } from '@/skizze/grundlage'
import { bauExcelFuerExport } from '@/bauexcel'
import { leseBauSkizze } from '@/export/bauSkizzeLesen'
import { ladeBauExcelAusOneDrive } from '@/sync'
import { KI_AKTIV } from '@/funktionen'
import { Dialog, ICON, Meldung, datumDe } from './ui'
import { entprelle } from './entprellen'

const SPEICHER_VERZOEGERUNG_MS = 400

type Herkunft = 'bau' | 'excel'

export function SkizzeTab({
  wep,
  onSpeichern,
}: {
  wep: Wep
  onSpeichern: (wep: Wep) => Promise<void>
}) {
  const [startwert] = useState<SkizzeDaten>(() => wep.skizze ?? leereSkizze())
  // Wert für den Editor: ändert sich nur durch den Chat (sonst setzt sich der Editor zurück)
  const [editorWert, setEditorWert] = useState<SkizzeDaten>(startwert)
  const aktuellRef = useRef<SkizzeDaten>(startwert)
  // Stand für die Anzeige der Grundlage-Leiste (Editor und Chat schreiben weiter über aktuellRef)
  const [stand, setStand] = useState<SkizzeDaten>(startwert)
  const [frage, setFrage] = useState(false)
  const [arbeitet, setArbeitet] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // Immer den aktuellen WEP verwenden, damit nichts Älteres zurückgeschrieben wird
  const wepRef = useRef(wep)
  wepRef.current = wep
  const speichernRef = useRef(onSpeichern)
  speichernRef.current = onSpeichern

  const speichereSkizze = useMemo(
    () =>
      entprelle((skizze: SkizzeDaten) => {
        void speichernRef.current({ ...wepRef.current, skizze })
      }, SPEICHER_VERZOEGERUNG_MS),
    [],
  )

  // Beim Verlassen des Tabs Ausstehendes sofort speichern
  useEffect(() => () => speichereSkizze.sofort(), [speichereSkizze])

  const beiEditorAenderung = useCallback(
    (skizze: SkizzeDaten) => {
      aktuellRef.current = skizze
      setStand(skizze)
      speichereSkizze(skizze)
    },
    [speichereSkizze],
  )
  const beiChatAenderung = useCallback(
    (skizze: SkizzeDaten) => {
      aktuellRef.current = skizze
      setStand(skizze)
      setEditorWert(skizze)
      speichereSkizze(skizze)
    },
    [speichereSkizze],
  )
  /** Neuer Gesamtstand von außerhalb des Editors (Grundlage übernehmen, sperren): Editor, Anzeige und Speicher. */
  const setzeStand = useCallback(
    (skizze: SkizzeDaten) => {
      aktuellRef.current = skizze
      setStand(skizze)
      setEditorWert(skizze)
      speichereSkizze(skizze)
    },
    [speichereSkizze],
  )
  const holeSkizze = useCallback(() => aktuellRef.current, [])

  const anzahl = stand.elemente.filter((e) => !istGrundlage(e)).length
  const bauVorhanden = grundrissHatTeile(wep.grundriss)
  const excelVorhanden = Boolean(wep.bauExcel)
  const grundlage = hatGrundlage(stand) ? stand.grundlage : undefined
  const grundlageAnzahl = stand.elemente.filter(istGrundlage).length

  /** Grundlage aus der gewählten Quelle holen und unter das Grün legen; die Grün-Elemente bleiben. */
  async function uebernehmen(herkunft: Herkunft) {
    setFrage(false)
    setFehler(null)
    setInfo(null)
    setArbeitet(true)
    try {
      let quelle: GrundlageQuelle
      if (herkunft === 'bau') {
        quelle = {
          art: 'bau',
          grundriss: wepRef.current.grundriss!,
          bauteile: wepRef.current.bau?.bauteile ?? [],
          flaecheM2: wepRef.current.formalien.parzellenflaecheM2 || undefined,
        }
      } else {
        const bytes = await bauExcelFuerExport({ wep: wepRef.current, quelle: { hole: ladeBauExcelAusOneDrive } })
        if (!bytes) throw new Error('Zu diesem WEP ist keine Bau-Excel hinterlegt.')
        const lesen = await leseBauSkizze(bytes)
        if (!lesen.blattVorhanden) throw new Error('In der Bau-Excel fehlt das Blatt „Skizze Bau“. Ist das die WEP-Vorlage?')
        quelle = { art: 'excel', lesen, excelName: wepRef.current.bauExcel?.name }
      }
      const erg = uebernehmeGrundlage(aktuellRef.current, quelle, new Date().toISOString())
      if (!erg) {
        setFehler(
          herkunft === 'bau'
            ? 'Im Grundriss des Bau-Teils gibt es noch keine Bauteile.'
            : 'Im Blatt „Skizze Bau“ der Bau-Excel sind keine Formen zum Übernehmen. Die Skizze bleibt, wie sie ist.',
        )
        return
      }
      setzeStand(erg.daten)
      speichereSkizze.sofort()
      setInfo(`Grundlage übernommen: ${erg.anzahl} ${erg.anzahl === 1 ? 'Form' : 'Formen'}, gesperrt gegen Verschieben.`)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Die Grundlage konnte nicht übernommen werden.')
    } finally {
      setArbeitet(false)
    }
  }

  function schalteSperre() {
    if (!grundlage) return
    setzeStand(setzeGrundlageGesperrt(aktuellRef.current, !grundlage.gesperrt))
    setInfo(null)
  }

  return (
    <section className="skizze-tab">
      <header className="seitenkopf">
        <div>
          <h1 className="h1">Skizze</h1>
          <p className="neben">Außenanlagen &amp; Aufwuchs</p>
        </div>
      </header>
      <p className="neben">
        Rechteck, Linie, Kreis, Text, Maßangabe und Symbole (Baum, Beet, Hecke …){KI_AKTIV && ' – oder per Beschreibung im Chat darunter'}. Grundlage und Grün werden beim
        Excel-Export ins Blatt „Skizze Außenanlage-Aufwuchs“ eingefügt; „Skizze Bau“ bleibt unverändert.
        {anzahl > 0 && ` · ${anzahl} ${anzahl === 1 ? 'Element' : 'Elemente'} gespeichert`}
      </p>
      <section className="grundlage" aria-label="Grundlage aus der Bau-Skizze">
        <div className="grundlage-kopf">
          <Layers {...ICON} />
          <h2 className="h2">Grundlage: Bau-Skizze</h2>
        </div>
        {grundlage ? (
          <>
            <p className="neben" data-testid="grundlage-stand">
              {grundlage.quelle === 'bau' ? 'Aus dem Bau-Teil (Grundriss)' : `Aus der Bau-Excel${grundlage.excelName ? ` „${grundlage.excelName}“` : ''}`} · {grundlageAnzahl}{' '}
              {grundlageAnzahl === 1 ? 'Form' : 'Formen'} · übernommen am {datumDe(grundlage.uebernommen.slice(0, 10))} ·{' '}
              {grundlage.gesperrt ? 'gesperrt (kein Verschieben aus Versehen)' : 'entsperrt – Formen einzeln antippen und korrigieren'}
            </p>
            <div className="grundlage-knoepfe">
              <button type="button" className="knopf" aria-pressed={!grundlage.gesperrt} onClick={schalteSperre}>
                {grundlage.gesperrt ? <Lock {...ICON} /> : <LockOpen {...ICON} />}
                {grundlage.gesperrt ? 'Entsperren' : 'Sperren'}
              </button>
              <button type="button" className="knopf" disabled={arbeitet || (!bauVorhanden && !excelVorhanden)} onClick={() => setFrage(true)}>
                Grundlage neu übernehmen
              </button>
            </div>
          </>
        ) : bauVorhanden || excelVorhanden ? (
          <>
            <p className="neben">Die Bau-Skizze (Grundstück, Gebäude, Terrassen, Keller, Pfosten) kommt als gesperrte Ebene unter dein Grün.</p>
            <div className="grundlage-knoepfe">
              {bauVorhanden && (
                <button type="button" className="knopf knopf-primaer" disabled={arbeitet} onClick={() => void uebernehmen('bau')}>
                  Aus Bau-Teil übernehmen
                </button>
              )}
              {excelVorhanden && (
                <button type="button" className={bauVorhanden ? 'knopf' : 'knopf knopf-primaer'} disabled={arbeitet} onClick={() => void uebernehmen('excel')}>
                  Aus Bau-Excel übernehmen
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p data-testid="grundlage-hinweis">
              <strong>Erst Bau-Skizze übernehmen</strong> (Bau-Teil oder Bau-Excel): Zeichne im Bau-Teil den Grundriss oder hinterlege unter „Formalien“ die Bau-Excel.
            </p>
            <p className="neben">Freies Zeichnen geht trotzdem; die Grundlage lässt sich später darunterlegen, dein Grün bleibt erhalten.</p>
          </>
        )}
        {arbeitet && (
          <p className="neben" role="status">
            Lese die Bau-Skizze …
          </p>
        )}
        {fehler && (
          <Meldung alarm>
            <p>{fehler}</p>
          </Meldung>
        )}
        {info && (
          <p className="neben" role="status">
            {info}
          </p>
        )}
        {grundlage?.hinweise?.length ? (
          <Meldung>
            {grundlage.hinweise.map((h) => (
              <p key={h}>{h}</p>
            ))}
          </Meldung>
        ) : null}
      </section>
      {frage && (
        <Dialog titel="Grundlage neu übernehmen?" rueckfrage onSchliessen={() => setFrage(false)}>
          <p>
            Die bisherige Grundlage wird durch die neue Bau-Skizze ersetzt – auch deine Korrekturen an den Bau-Formen. Dein Grün (Bäume, Hecken, Beete …) bleibt unverändert.
          </p>
          <div className="dialog-knoepfe">
            <button type="button" className="knopf" autoFocus onClick={() => setFrage(false)}>
              Abbrechen
            </button>
            {bauVorhanden && (
              <button type="button" className="knopf knopf-gefahr" onClick={() => void uebernehmen('bau')}>
                Aus Bau-Teil
              </button>
            )}
            {excelVorhanden && (
              <button type="button" className="knopf knopf-gefahr" onClick={() => void uebernehmen('excel')}>
                Aus Bau-Excel
              </button>
            )}
          </div>
        </Dialog>
      )}
      <SkizzeEditor wert={editorWert} onAenderung={beiEditorAenderung} />
      {KI_AKTIV && <SkizzeChat holeSkizze={holeSkizze} onSkizze={beiChatAenderung} />}
    </section>
  )
}
