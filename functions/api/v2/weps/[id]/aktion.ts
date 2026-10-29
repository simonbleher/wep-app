// POST /api/v2/weps/<id>/aktion { aktion, basisRev, … } – Schritt im Ablauf:
//   an_gruen { gruenKonto }  · an_bv  · rueckfrage { an: bau|gruen|beide, notiz }  · geprueft { notiz? }
//   wiederoeffnen { begruendung }
// Nur auf dem aktuellen Stand (basisRev); wer was darf, steht in src/server/rechte.ts. Danach gehen die Benachrichtigungen raus;
// nach „an den BV“ wird aufgeräumt (functions/_lib/v2/aufraeumen.ts).
import { jsonAntwort } from '../../../../_lib/serverModus'
import { datenbank, freigegebenesKonto, fremdeHerkunft, NICHT_EINGERICHTET, type V2Kontext } from '../../../../_lib/v2/kontext'
import { fuehreAktionAus } from '../../../../_lib/v2/weps'
import { benachrichtige } from '../../../../_lib/v2/benachrichtigungen'
import { raeumeNachAbgabeAuf } from '../../../../_lib/v2/aufraeumen'
import type { R2Ablage } from '../../../../_lib/v2/dateien'

export const onRequestPost = async ({ request, env, params, waitUntil }: V2Kontext<'id'>): Promise<Response> => {
  const db = datenbank(env)
  if (!db) return NICHT_EINGERICHTET()
  const fremd = fremdeHerkunft(request)
  if (fremd) return fremd
  const konto = await freigegebenesKonto(db, request)
  if (konto instanceof Response) return konto
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  // Benachrichtigungen (App und Mail): Mails nach der Antwort verschicken, damit die Abgabe nicht wartet
  const origin = new URL(request.url).origin
  const e = await fuehreAktionAus(db, konto, params.id, body, Date.now(), async (n) => {
    const arbeit = benachrichtige(db, env, { ...n, ausloeser: konto.id, origin }).catch((err) => console.error('Benachrichtigung:', err))
    if (waitUntil) waitUntil(arbeit)
    else await arbeit
  })
  if (e.ok && body.aktion === 'an_bv') {
    // Nach der Abgabe an den BV: doppelte Ablage (zusammengeführtes Grün-WEP) und verwaiste Dateien entfernen
    const aufraeumen = raeumeNachAbgabeAuf(db, env.WEP_DATEIEN as R2Ablage | undefined, konto.id, params.id).catch((err) => console.error('Aufräumen:', err))
    if (waitUntil) waitUntil(aufraeumen)
    else await aufraeumen
  }
  return e.ok ? jsonAntwort(200, { kopf: e.wert }) : jsonAntwort(e.status, { fehler: e.fehler, ...(e.stand ? { stand: e.stand } : {}) })
}
