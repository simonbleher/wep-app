// Platzhalter-Detailansicht eines WEP.
// Die eigentliche Erfassung (Formalien, Außenanlagen, Aufwuchs) folgt in A2.
interface Props {
  wepId: string
  onZurueck: () => void
}

export function WepDetail({ wepId, onZurueck }: Props) {
  return (
    <main className="seite">
      <header className="kopf">
        <button type="button" className="btn btn-gross" onClick={onZurueck}>
          ← zurück
        </button>
        <h1>WEP {wepId}</h1>
      </header>

      <p className="hinweis">
        Die Erfassung von Außenanlagen und Aufwuchs wird in einem späteren
        Schritt (Aufgabe A2) ergänzt.
      </p>
    </main>
  )
}
