// App-Shell: einfacher Zustands-basierter Wechsel zwischen Startseite und
// WEP-Detailansicht. Ein Router ist für A1 noch nicht nötig.
import { useState } from 'react'
import { Startseite } from './Startseite'
import { WepDetail } from './WepDetail'

type Ansicht = { typ: 'start' } | { typ: 'detail'; wepId: string }

export default function App() {
  const [ansicht, setAnsicht] = useState<Ansicht>({ typ: 'start' })

  return (
    <div className="app">
      {ansicht.typ === 'start' ? (
        <Startseite onOeffnen={(wepId) => setAnsicht({ typ: 'detail', wepId })} />
      ) : (
        <WepDetail
          wepId={ansicht.wepId}
          onZurueck={() => setAnsicht({ typ: 'start' })}
        />
      )}
    </div>
  )
}
