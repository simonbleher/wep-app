import { useState, useCallback, useRef } from 'react';
import type { Wep, SkizzeDaten } from '../model/types';
import { SkizzeEditor } from '../skizze/SkizzeEditor';
import { skizzeAlsPng } from '../skizze/png';

type TabId = 'formalien' | 'aussenanlagen' | 'aufwuchs' | 'beseitigung' | 'skizze' | 'export';

const TABS: { id: TabId; label: string }[] = [
  { id: 'formalien', label: 'Formalien' },
  { id: 'aussenanlagen', label: 'Außenanlagen' },
  { id: 'aufwuchs', label: 'Aufwuchs' },
  { id: 'beseitigung', label: 'Beseitigung' },
  { id: 'skizze', label: 'Skizze' },
  { id: 'export', label: 'Export' },
];

interface Props {
  wep: Wep;
  onSpeichern: (wep: Wep) => void;
}

export function WepDetail({ wep, onSpeichern }: Props) {
  const [aktiverTab, setAktiverTab] = useState<TabId>('formalien');
  const [aktuellesWep, setAktuellesWep] = useState<Wep>(wep);
  const entprellungRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const speichereWep = useCallback((neuesWep: Wep) => {
    setAktuellesWep(neuesWep);
    if (entprellungRef.current) clearTimeout(entprellungRef.current);
    entprellungRef.current = setTimeout(() => {
      onSpeichern(neuesWep);
    }, 300);
  }, [onSpeichern]);

  const skizzeAktualisieren = useCallback((skizze: SkizzeDaten) => {
    speichereWep({ ...aktuellesWep, skizze });
  }, [aktuellesWep, speichereWep]);

  const skizzeAlsPngHerunterladen = async () => {
    const blob = await skizzeAlsPng(
      aktuellesWep.skizze,
      aktuellesWep.skizze?.breite,
      aktuellesWep.skizze?.hoehe,
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skizze-${aktuellesWep.id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 16 }}>
      {/* Tab-Leiste */}
      <nav
        role="tablist"
        aria-label="WEP-Abschnitte"
        style={{ display: 'flex', gap: 4, borderBottom: '2px solid #2a6f2a', marginBottom: 20, flexWrap: 'wrap' }}
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={aktiverTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => setAktiverTab(tab.id)}
            style={{
              padding: '10px 18px',
              border: 'none',
              borderRadius: '4px 4px 0 0',
              background: aktiverTab === tab.id ? '#2a6f2a' : '#e8f5e9',
              color: aktiverTab === tab.id ? '#fff' : '#2a6f2a',
              fontWeight: aktiverTab === tab.id ? 'bold' : 'normal',
              cursor: 'pointer',
              fontSize: 15,
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab-Inhalte */}
      <div
        id={`panel-formalien`}
        role="tabpanel"
        aria-labelledby="tab-formalien"
        hidden={aktiverTab !== 'formalien'}
      >
        <h2>Formalien</h2>
        <p>Vorgangs-Nr.: <strong>{aktuellesWep.id}</strong></p>
        <p>Parzelle: <strong>{aktuellesWep.formalien.parzelle}</strong></p>
        {/* Formularfelder folgen in A2 */}
      </div>

      <div
        id="panel-aussenanlagen"
        role="tabpanel"
        aria-labelledby="tab-aussenanlagen"
        hidden={aktiverTab !== 'aussenanlagen'}
      >
        <h2>Außenanlagen</h2>
        <p>Positionen: {aktuellesWep.gruen.aussenanlagen.length}</p>
        {/* Positionsliste folgt in A2 */}
      </div>

      <div
        id="panel-aufwuchs"
        role="tabpanel"
        aria-labelledby="tab-aufwuchs"
        hidden={aktiverTab !== 'aufwuchs'}
      >
        <h2>Aufwuchs</h2>
        <p>Positionen: {aktuellesWep.gruen.aufwuchs.length}</p>
        {/* Positionsliste folgt in A2 */}
      </div>

      <div
        id="panel-beseitigung"
        role="tabpanel"
        aria-labelledby="tab-beseitigung"
        hidden={aktiverTab !== 'beseitigung'}
      >
        <h2>Beseitigungskosten</h2>
        <p>Positionen: {aktuellesWep.gruen.beseitigungAA.length}</p>
        {/* Positionsliste folgt in A2 */}
      </div>

      {/* Skizze-Tab (S2) */}
      <div
        id="panel-skizze"
        role="tabpanel"
        aria-labelledby="tab-skizze"
        hidden={aktiverTab !== 'skizze'}
        style={{ width: '100%' }}
      >
        <h2>Parzellenskizze</h2>
        <SkizzeEditor
          wert={aktuellesWep.skizze}
          onAenderung={skizzeAktualisieren}
        />
      </div>

      {/* Export-Tab */}
      <div
        id="panel-export"
        role="tabpanel"
        aria-labelledby="tab-export"
        hidden={aktiverTab !== 'export'}
      >
        <h2>Export</h2>
        <section style={{ marginBottom: 24 }}>
          <h3>Excel-Export</h3>
          <p>Excel-Export in Arbeit (Aufgabe E1).</p>
          <button
            style={{
              padding: '10px 20px',
              background: '#2a6f2a',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 15,
            }}
            disabled
          >
            WEP als Excel herunterladen
          </button>
        </section>

        <section>
          <h3>Skizze</h3>
          <button
            onClick={skizzeAlsPngHerunterladen}
            style={{
              padding: '10px 20px',
              background: '#2a6f2a',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 15,
            }}
          >
            Skizze als PNG herunterladen
          </button>
        </section>
      </div>
    </div>
  );
}
