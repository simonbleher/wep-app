// Texte der Benachrichtigungen (App und Mail; gemeinsam mit functions/_lib/v2/benachrichtigungen.ts, ohne „@/“-Importe).
export type BenachrichtigungsArt = 'an_dich' | 'beim_bv' | 'rueckfrage' | 'geprueft' | 'wiederoeffnet'

export const ART_TEXT: Record<BenachrichtigungsArt, string> = {
  an_dich: 'an dich abgegeben',
  beim_bv: 'an den BV abgegeben',
  rueckfrage: 'Rückfrage vom BV',
  geprueft: 'vom BV geprüft',
  wiederoeffnet: 'vom BV wieder geöffnet',
}
