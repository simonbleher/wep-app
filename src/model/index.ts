// Barrel-Re-Export der gemeinsamen Datentypen.
export type {
  Wep,
  Position,
  Hinweis,
  Formalien,
  BeseitigungsPosition,
  SkizzeDaten,
} from './types'
export { ZUSTANDSSTUFEN, neuerWep } from './types'

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
