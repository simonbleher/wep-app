import { useState } from 'react';
import type { Wep } from '../model/types';
import { WepDetail } from './WepDetail';

const BEISPIEL_WEP: Wep = {
  id: '2026-001',
  formalien: {
    kleingartenanlage: 'Anlage Musterweg',
    parzelle: '42',
    unterpächter: 'Erika Musterfrau',
    auftraggeber: 'BV Pankow',
    wertermittlerGruen: 'Max Mustermann',
    wertermittlungAm: '2026-10-17',
    protokollAm: '2026-10-17',
    parzellenfläche: 325,
    vorgangsNr: '2026-001',
  },
  gruen: {
    beschreibungAussen: '',
    beschreibungAufwuchs: '',
    aussenanlagen: [],
    aufwuchs: [],
    beseitigungAA: [],
  },
};

function App() {
  const [wep, setWep] = useState<Wep>(BEISPIEL_WEP);

  return (
    <div>
      <header style={{ background: '#2a6f2a', color: '#fff', padding: '12px 16px' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>WEP-App – BV Pankow</h1>
      </header>
      <main>
        <WepDetail wep={wep} onSpeichern={setWep} />
      </main>
    </div>
  );
}

export default App;
