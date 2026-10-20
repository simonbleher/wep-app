// Problempflanzen: Arten, die nach der Richtlinie zu entfernen sind oder in der Berliner Praxis
// Probleme machen (data/problempflanzen.json). Ergänzt die Unionsliste (istInvasiv).
// Die App warnt nur und schlägt eine Beseitigung vor – sie sperrt nie.
import { ganzerNameQualitaet } from './suche.js';
import { normalisiere } from './util.js';

export interface ProblempflanzeQuelle {
  /** richtlinie: steht in der BewRL · praxis: Einstufung außerhalb der Richtlinie. */
  art: 'richtlinie' | 'praxis';
  text: string;
  /** Gedruckte Seite der Richtlinie (nur bei art = richtlinie). */
  seite?: number;
  /** Von Simon bestätigt? Praxis-Einträge sind es zunächst nicht. */
  bestaetigt: boolean;
}

export interface Problempflanze {
  id: string;
  /** Deutsche Namen, mehrere gleichwertige durch „ / “ getrennt. */
  deutsch: string;
  wissenschaftlich?: string;
  synonyme?: string[];
  gruppe: string;
  /** nadel-gross: Richtlinie S. 17 · praxis-neophyt: Einstufung außerhalb der Richtlinie. */
  regel: 'nadel-gross' | 'praxis-neophyt';
  quelle: ProblempflanzeQuelle;
}

export interface ProblempflanzenListe {
  meta: Record<string, unknown>;
  eintraege: Problempflanze[];
}

/** Namen, unter denen die Bezeichnung gesucht wird: ganz und in ihren Teilen („Fichte (Nadelgehölz)“). */
function kandidaten(bezeichnung: string): string[] {
  const teile = bezeichnung.split(/[,()/;–]/);
  return [bezeichnung, ...teile].map(normalisiere).filter((t) => t.length > 0);
}

function namen(p: Problempflanze): string[] {
  return [...p.deutsch.split('/'), p.wissenschaftlich ?? '', ...(p.synonyme ?? [])]
    .map(normalisiere)
    .filter((n) => n.length > 0);
}

/**
 * Findet die Problempflanze zu einer Positionsbezeichnung. Wie bei der Invasiv-Prüfung wird nur
 * der GANZE Name verglichen (gleich, Anfang des Namens oder enger Tippfehler) – ein falscher
 * Hinweis ist schlimmer als keiner. Gibt den ersten Treffer oder null zurück.
 */
export function findeProblempflanze(liste: Problempflanze[], bezeichnung: string): Problempflanze | null {
  const suche = kandidaten(bezeichnung);
  if (suche.length === 0) return null;
  for (const p of liste) {
    for (const name of namen(p)) {
      for (const k of suche) {
        const q = ganzerNameQualitaet(k, name);
        // 0,85 = Suchbegriff länger als der Name („Tannenbaum“ → „Tanne“): kein Treffer
        if (q > 0 && q !== 0.85) return p;
      }
    }
  }
  return null;
}
