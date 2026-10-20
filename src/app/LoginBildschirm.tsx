// Login-Bildschirm beim ersten Start und nach dem Abmelden.
import { Meldung } from './ui'

interface Props {
  onAnmelden: () => void
  onOhneKonto: () => void
  fehler?: string
}

export function LoginBildschirm({ onAnmelden, onOhneKonto, fehler }: Props) {
  return (
    <main className="login">
      <div className="login-mitte">
        <h1 className="h1">WEP-App</h1>
        <p className="login-text">
          Wertermittlungsprotokolle direkt auf der Parzelle erfassen – auch ohne Netz.
          Mit Konto werden deine Protokolle über OneDrive auf deine Geräte abgeglichen.
        </p>
        <button type="button" className="knopf knopf-primaer knopf-breit" onClick={onAnmelden}>
          Mit Microsoft anmelden
        </button>
        {fehler && (
          <Meldung alarm>
            <p>{fehler}</p>
          </Meldung>
        )}
      </div>
      <button type="button" className="textknopf login-ohne" onClick={onOhneKonto}>
        Ohne Konto fortfahren (nur auf diesem Gerät)
      </button>
    </main>
  )
}
