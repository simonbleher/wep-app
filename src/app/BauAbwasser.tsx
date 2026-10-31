// Reiter „Abwasser“ (Beta 4, Paket 2): Sammelgrube oder Kanalanschluss (Richtlinie S. 13–14), nicht geleerte Grube,
// Laube nicht beräumt (S. 8, S. 20).
import { useId } from 'react'
import type { Abwasser, BauDaten, Wep } from '@/model'
import type { WepAendern } from '@/fotos'
import {
  BESEITIGUNG_INVENTAR_JE_M3,
  GRUBEN_TYPEN,
  GRUBE_NICHT_GELEERT_ABZUG,
  KANAL_HOECHSTWERT,
  alterInJahren,
  berechneBau,
  grubeMaxAlter,
  grubenGrundwert,
  hinweiseBau,
  wertjahrVon,
} from '@/bau'
import { zahlDe } from '@/gruen/format'
import { AuswahlFeld, BauHinweise, Schalter, ZahlFeld } from './BauKomponenten'
import { aendereBauTeil, mangelDerGruppe, setzeMangel } from './bauHelfer'
import { euroFormat } from './ui'

interface Props {
  wep: Wep
  aendere: WepAendern
  profilIndex?: Record<string, number>
}

function DatumFeld({ label, wert, onChange }: { label: string; wert?: string; onChange: (v: string | undefined) => void }) {
  const id = useId()
  return (
    <div className="feld">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input id={id} type="date" className="eingabe" value={wert ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />
    </div>
  )
}

export function AbwasserTab({ wep, aendere, profilIndex }: Props) {
  const bau = wep.bau
  const abw: Abwasser = bau?.abwasser ?? { art: 'keine', grube: {}, kanal: {} }
  const nb = bau?.nichtBeraeumt ?? { aktiv: false }
  const erg = berechneBau(wep, { profilIndex })
  const wj = wertjahrVon(wep)
  const setze = (fn: (b: BauDaten) => BauDaten) => void aendere((w) => aendereBauTeil(w, fn))
  const grube = (p: Partial<Abwasser['grube']>) => setze((b) => ({ ...b, abwasser: { ...b.abwasser, grube: { ...b.abwasser.grube, ...p } } }))
  const kanal = (p: Partial<Abwasser['kanal']>) => setze((b) => ({ ...b, abwasser: { ...b.abwasser, kanal: { ...b.abwasser.kanal, ...p } } }))
  const hinweise = hinweiseBau(wep, { profilIndex }).filter((h) => h.bereich === 'abwasser')
  const g = abw.grube
  const alterGrube = alterInJahren(g.baujahr, wj)
  const alterKanal = alterInJahren(abw.kanal.baujahr, wj)

  return (
    <>
      <header className="seitenkopf">
        <div>
          <h1 className="h1">Abwasser</h1>
          <p className="neben">Richtlinie S. 13–14</p>
        </div>
      </header>

      <AuswahlFeld
        label="Abwasseranlage"
        wert={abw.art === 'keine' ? '' : abw.art}
        optionen={[{ wert: 'grube', text: 'Abwassersammelgrube' }, { wert: 'kanal', text: 'Kanalisationsanschluss' }]}
        onChange={(v) => setze((b) => ({ ...b, abwasser: { ...b.abwasser, art: v ?? 'keine' } }))}
      />
      <BauHinweise hinweise={hinweise} />

      {abw.art === 'grube' && (
        <section className="abschnitt" aria-label="Abwassersammelgrube">
          <h2 className="gruppenkopf">Abwassersammelgrube</h2>
          <p className="neben">Nur genehmigte Anlagen mit gültigem Dichtheitsnachweis werden bewertet, mit 3 % Alterswertminderung je Jahr von den Höchstwerten ausgehend (16 Jahre = 48 %).</p>
          <AuswahlFeld label="Art der Grube" wert={g.typ ?? ''} optionen={GRUBEN_TYPEN.map((t) => ({ wert: t.id, text: `${t.text} (bis ${t.grundwert} € je m³)` }))} onChange={(v) => grube({ typ: v, grundwert: undefined })} />
          <div className="feld-reihe">
            <ZahlFeld label="Inhalt" einheit="m³" wert={g.inhaltM3} onChange={(v) => grube({ inhaltM3: v })} />
            <ZahlFeld label="Grundwert" einheit="€ je m³" wert={g.grundwert ?? grubenGrundwert(g.typ)} onChange={(v) => grube({ grundwert: v })} />
          </div>
          <ZahlFeld
            label="Baujahr bzw. Sanierungsjahr"
            wert={g.baujahr}
            onChange={(v) => grube({ baujahr: v })}
            hilfe={alterGrube !== undefined ? `Alter ${alterGrube} Jahre${alterGrube > grubeMaxAlter(g.typ) ? `, gerechnet wird mit höchstens ${grubeMaxAlter(g.typ)}` : ''}` : undefined}
          />
          <div className="feld-reihe">
            <DatumFeld label="Genehmigung vom" wert={g.genehmigtAm} onChange={(v) => grube({ genehmigtAm: v })} />
            <div className="feld">
              <label className="label" htmlFor="grube-nr">
                Genehmigung Nr.
              </label>
              <input id="grube-nr" className="eingabe" value={g.genehmigungNr ?? ''} onChange={(e) => grube({ genehmigungNr: e.target.value || undefined })} />
            </div>
          </div>
          <DatumFeld label="Dichtheitsnachweis vom" wert={g.dichtheitAm} onChange={(v) => grube({ dichtheitAm: v, dichtheitFehlt: v ? false : g.dichtheitFehlt })} />
          <Schalter label="Dichtheitsnachweis fehlt" an={Boolean(g.dichtheitFehlt)} onChange={(v) => grube({ dichtheitFehlt: v })} hilfe="Ohne gültigen Nachweis wird die Grube nicht bewertet (0 €); die Vorlage vermerkt das." />
          <Schalter label="Grube nicht geleert" an={Boolean(g.nichtGeleert)} onChange={(v) => grube({ nichtGeleert: v })} hilfe={`Bewertung wird um ${GRUBE_NICHT_GELEERT_ABZUG} € gesenkt, die erfolgte Abfuhr ist nachzuweisen.`} />
          {g.nichtGeleert && <DatumFeld label="Letzte Abfuhrbescheinigung vom" wert={g.abfuhrBescheinigungAm} onChange={(v) => grube({ abfuhrBescheinigungAm: v })} />}
          <Schalter label="Nicht betriebsfähig oder nicht zugelassen" an={Boolean(g.zuBeseitigen)} onChange={(v) => grube({ zuBeseitigen: v || undefined })} hilfe="Wird nicht bewertet und mit Beseitigung beauflagt (Reiter Beseitigung Bau: Vorschlag übernehmen)." />
          {erg?.grube && (
            <dl className="werte rechenweg" aria-label="Rechenweg Grube">
              <div><dt>Grundwert</dt><dd className="zahl">{euroFormat(erg.grube.grundwert)} je m³</dd></div>
              <div><dt>abzüglich Altersabzug {zahlDe(erg.grube.altersabzugProzent)} % ({erg.grube.wirksamesAlter} Jahre × 3 %)</dt><dd className="zahl">{euroFormat(erg.grube.wertProM3)} je m³</dd></div>
              <div><dt>mal {zahlDe(erg.grube.inhaltM3)} m³{erg.grube.nachweisFehlt ? ' (ohne Nachweis: 0 €)' : ''}</dt><dd className="zahl">{euroFormat(erg.grube.wert)}</dd></div>
              {erg.grube.nichtGeleertAbzug !== 0 && <div><dt>nicht geleert</dt><dd className="zahl">{euroFormat(erg.grube.nichtGeleertAbzug)}</dd></div>}
            </dl>
          )}
        </section>
      )}

      {abw.art === 'kanal' && (
        <section className="abschnitt" aria-label="Kanalisationsanschluss">
          <h2 className="gruppenkopf">Kanalisationsanschluss</h2>
          <p className="neben">Bewertet wird der Erstellungspreis, höchstens {KANAL_HOECHSTWERT.toLocaleString('de-DE')} €, mit 3 % Alterswertminderung je Jahr vom Erstellungspreis.</p>
          <div className="feld-reihe">
            <ZahlFeld label="Erstellt im Jahr" wert={abw.kanal.baujahr} onChange={(v) => kanal({ baujahr: v })} hilfe={alterKanal !== undefined ? `Alter ${alterKanal} Jahre` : undefined} />
            <ZahlFeld label="Erstellungspreis" einheit="€" wert={abw.kanal.kosten} onChange={(v) => kanal({ kosten: v })} />
          </div>
          {erg?.kanal && (
            <dl className="werte rechenweg" aria-label="Rechenweg Kanal">
              <div><dt>höchstens</dt><dd className="zahl">{euroFormat(erg.kanal.hoechstens)}</dd></div>
              <div><dt>abzüglich {zahlDe(erg.kanal.abzug * 100)} % Altersabzug</dt><dd className="zahl">{euroFormat(erg.kanal.wert)}</dd></div>
            </dl>
          )}
        </section>
      )}

      <section className="abschnitt" aria-label="Laube nicht beräumt">
        <h2 className="gruppenkopf">Laube nicht beräumt</h2>
        <Schalter
          label="Laube ist nicht beräumt"
          an={nb.aktiv}
          onChange={(v) =>
            setze((b) => {
              const laube = b.bauteile.find((x) => x.art === 'laube')
              // Mängeltabelle S. 8: „Laube nicht beräumt“ bis 10 % – als Vorschlag mit eintragen (änderbar im Reiter Mängel)
              const bauteile =
                v && laube && !mangelDerGruppe(laube, 'beraeumt')
                  ? b.bauteile.map((x) => (x.id === laube.id ? setzeMangel(x, 'beraeumt', { abzug: 10, begruendung: 'Laube nicht beräumt, Bausubstanz nicht prüfbar' }) : x))
                  : b.bauteile
              return { ...b, bauteile, nichtBeraeumt: { ...b.nichtBeraeumt, aktiv: v, preis: b.nichtBeraeumt.preis ?? BESEITIGUNG_INVENTAR_JE_M3 } }
            })
          }
          hilfe="Entsorgung des Inventars (Richtlinie S. 20) und zusätzlicher Mängelabzug bis 10 % (S. 8, wird vorgeschlagen)."
        />
        {nb.aktiv && (
          <div className="feld-reihe">
            <ZahlFeld label="Menge" einheit="m³" wert={nb.m3} onChange={(v) => setze((b) => ({ ...b, nichtBeraeumt: { ...b.nichtBeraeumt, m3: v } }))} />
            <ZahlFeld label="Preis" einheit="€ je m³, bis 100" wert={nb.preis} onChange={(v) => setze((b) => ({ ...b, nichtBeraeumt: { ...b.nichtBeraeumt, preis: v } }))} />
          </div>
        )}
        {nb.aktiv && erg && (
          <div className="summe summe-klein">
            <span>Kosten nicht beräumter Baulichkeiten</span>
            <span className="zahl">{euroFormat(erg.nichtBeraeumtKosten)}</span>
          </div>
        )}
      </section>
    </>
  )
}

