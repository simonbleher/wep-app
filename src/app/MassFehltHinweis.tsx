// Warnung vor der Abgabe: Bäume, bei denen das Pflichtmaß fehlt (Alter bei Obstgehölzen, Stammumfang bei
// „Baum fällen“). Nur ein Hinweis – abgeben geht trotzdem (nichts sperren, nur warnen).
import type { Wep } from '@/model'
import { fehlendeMasse } from '@/gruen/baumMass'
import { Meldung } from './ui'

export function MassFehltHinweis({ wep }: { wep: Pick<Wep, 'gruen'> }) {
  const fehlen = fehlendeMasse(wep)
  if (!fehlen.length) return null
  return (
    <Meldung>
      <p>
        <b>Maß fehlt</b> bei {fehlen.length === 1 ? 'einer Position' : `${fehlen.length} Positionen`} – dort gibt es keinen Preisvorschlag. Bitte
        vor der Abgabe nachtragen oder den Preis bewusst selbst eintragen:
      </p>
      <ul>
        {fehlen.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </Meldung>
  )
}
