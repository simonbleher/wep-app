// Login-Bildschirm beim ersten Start und nach dem Abmelden.
interface Props {
  onAnmelden: () => void
  onOhneKonto: () => void
  fehler?: string
}

export function LoginBildschirm({ onAnmelden, onOhneKonto, fehler }: Props) {
  return (
    <main className="seite login">
      <div className="login-mitte">
        <h1>WEP-App</h1>
        <p>
          Wertermittlungsprotokolle direkt auf der Parzelle erfassen – auch ohne Netz.
          Mit Konto werden deine Protokolle über OneDrive auf deine Geräte abgeglichen.
        </p>
        <button type="button" className="btn btn-primary" onClick={onAnmelden}>
          Mit Microsoft anmelden
        </button>
        {fehler && <p className="hinweis hinweis-warnung">{fehler}</p>}
      </div>
      <button type="button" className="text-knopf login-ohne" onClick={onOhneKonto}>
        Ohne Konto fortfahren (nur auf diesem Gerät)
      </button>
    </main>
  )
}
