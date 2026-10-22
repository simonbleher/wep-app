// Barrel-Re-Export der gemeinsamen Datentypen.
export type {
  Wep,
  Position,
  Hinweis,
  Formalien,
  BeseitigungsPosition,
  SkizzeDaten,
  WepStatus,
  Rolle,
  Foto,
  BauExcel,
} from './types'
export { hatGruenTeil, hatBauTeil, wepRolle, rolleAusTeilen, ZUSTANDSSTUFEN, neuerWep, WEP_STATUS, wepStatus, dupliziereWep, naechsteVorgangsNr } from './types'

// Katalog- und Invasive-Typen (data/katalog.json, data/invasive.json).
export type {
  KatalogEinheit,
  KatalogRelevanz,
  KatalogVariante,
  KatalogPositionBasis,
  KatalogPositionEinzel,
  KatalogPositionVarianten,
  KatalogPosition,
  KatalogMeta,
  KatalogDatei,
  InvasiveArt,
  InvasiveMeta,
  InvasiveDatei,
} from './katalog'
