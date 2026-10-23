// Parzelle (Beta 6, Paket 1): Form des Grundstücks je WEP, gemeinsam für Bau- und Grün-Skizze.
export * from './types'
export * from './geometrie'
export * from './lage'
export * from './anwenden'
export { altAbbildung, istParzellenElement, legeSkizzeAufParzelle, liegtAufParzelle, parzellenElemente, transformiereElement } from './umlegen'
export { parzelleAusBauExcel, type ParzelleAusExcel } from './ausExcel'
