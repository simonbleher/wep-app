// Interne Hilfsfunktionen für Normalisierung und Tippfehler-Toleranz.
// Bewusst klein und ohne Abhängigkeiten gehalten, damit die Suche offline läuft
// und leicht testbar ist.

/**
 * Normalisiert Text einheitlich für Suche und Vergleich:
 * Kleinschreibung, deutsche Umlaute/ß gefaltet (ä→ae, ö→oe, ü→ue, ß→ss),
 * Mehrfach-Leerzeichen zu einem, getrimmt. So matchen „Höhe“ und „Hoehe“.
 */
export function normalisiere(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Zerlegt normalisierten Text in einzelne Wörter (Satzzeichen trennen). */
export function woerter(normalisierterText: string): string[] {
  return normalisierterText.split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Levenshtein-Editierdistanz (Anzahl Einfügungen/Löschungen/Ersetzungen)
 * zwischen zwei Zeichenketten. Klassische DP-Implementierung.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let vorherige = Array.from({ length: b.length + 1 }, (_, i) => i);
  let aktuelle = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    aktuelle[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const kosten = a[i - 1] === b[j - 1] ? 0 : 1;
      aktuelle[j] = Math.min(
        aktuelle[j - 1] + 1, // Einfügung
        vorherige[j] + 1, // Löschung
        vorherige[j - 1] + kosten, // Ersetzung
      );
    }
    [vorherige, aktuelle] = [aktuelle, vorherige];
  }
  return vorherige[b.length];
}

/**
 * Längenabhängige Toleranzschwelle: kurze Wörter vertragen weniger Tippfehler.
 * ≤4 Zeichen → 1 Edit, sonst bis zu 2 Edits.
 */
export function schwelle(laenge: number): number {
  return laenge <= 4 ? 1 : 2;
}

/**
 * Trefferqualität eines Suchtokens gegen ein einzelnes Zielwort, Wert in [0, 1]:
 * Gleichheit > Präfix > Teilstring > Tippfehler (Levenshtein innerhalb Schwelle).
 * Beide Eingaben sind bereits normalisiert.
 */
function wortQualitaet(token: string, wort: string): number {
  if (!token || !wort) return 0;
  if (token === wort) return 1;
  if (wort.startsWith(token) && token.length >= 2) return 0.9;
  // Suchbegriff länger als das Zielwort, Zielwort ist Präfix (z. B. „apfelbaum“ → „apfel“).
  if (token.startsWith(wort) && wort.length >= 2) return 0.85;
  if (wort.includes(token) && token.length >= 3) return 0.75;
  const d = levenshtein(token, wort);
  if (d <= schwelle(token.length)) return Math.max(0.5, 0.72 - (d - 1) * 0.1);
  return 0;
}

/**
 * Beste Trefferqualität eines bereits normalisierten Suchtokens gegen einen
 * (rohen) Feldtext, Wert in [0, 1]. Prüft den ganzen Text (Gleichheit/Präfix/
 * Teilstring) und jedes einzelne Wort (zusätzlich tippfehlertolerant).
 */
export function feldQualitaet(token: string, feldtext: string): number {
  const ziel = normalisiere(feldtext);
  if (!token || !ziel) return 0;

  let best = 0;
  if (ziel === token) best = 1;
  else if (ziel.startsWith(token) && token.length >= 2) best = 0.9;
  else if (ziel.includes(token) && token.length >= 3) best = 0.75;

  for (const wort of woerter(ziel)) {
    if (best === 1) break;
    best = Math.max(best, wortQualitaet(token, wort));
  }
  return best;
}
