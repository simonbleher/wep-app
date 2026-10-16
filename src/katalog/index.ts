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
