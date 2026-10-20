// Öffentliche API des Bereichs `katalog`.
export type {
  Einheit,
  Variante,
  Position,
  Katalog,
  InvasiveArt,
  InvasiveListe,
  TrefferGrund,
  Treffer,
  SucheOptions,
} from './types.js';
export { sucheKatalog, istInvasiv } from './suche.js';
export type { EigenePosition, EigenerAbschnitt } from './eigene.js';
export {
  EIGEN_PRAEFIX,
  aktive as aktiveEigene,
  alsKatalogPosition,
  merkePosition,
  aendereEintrag,
  loescheEintrag,
  fuehreZusammen,
  gleicheEintraege,
} from './eigene.js';
export {
  lokaleEigene,
  merkeEigenePosition,
  aendereEigenePosition,
  loescheEigenePosition,
  type EigeneSpeicher,
  type EigeneStand,
} from './eigeneSpeicher.js';
