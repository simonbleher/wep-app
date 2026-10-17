import { useRef, useState, useEffect, useCallback } from 'react';
import type { SkizzeDaten, SkizzeObjekt, SkizzeObjektTyp } from '../model/types';
import { skizzeZeichnen } from './zeichnen';

const STANDARD_BREITE = 800;
const STANDARD_HOEHE = 600;

interface Props {
  wert?: SkizzeDaten;
  onAenderung: (daten: SkizzeDaten) => void;
}

type Werkzeug = SkizzeObjektTyp;

function leereSkizze(): SkizzeDaten {
  return { objekte: [], breite: STANDARD_BREITE, hoehe: STANDARD_HOEHE };
}

function neueId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function SkizzeEditor({ wert, onAenderung }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [daten, setDaten] = useState<SkizzeDaten>(wert ?? leereSkizze());
  const [werkzeug, setWerkzeug] = useState<Werkzeug>('rechteck');
  const [zeichnet, setZeichnet] = useState(false);
  const [startPunkt, setStartPunkt] = useState<{ x: number; y: number } | null>(null);
  const [vorschau, setVorschau] = useState<SkizzeObjekt | null>(null);
  const [textEingabe] = useState('');

  // Wenn sich wert von außen ändert, übernehmen
  useEffect(() => {
    if (wert) setDaten(wert);
  }, [wert]);

  const neuZeichnen = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Hintergrund
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Gespeicherte Objekte
    for (const obj of daten.objekte) skizzeZeichnen(ctx, obj);
    // Vorschau-Objekt
    if (vorschau) skizzeZeichnen(ctx, vorschau, true);
  }, [daten, vorschau]);

  useEffect(() => {
    neuZeichnen();
  }, [neuZeichnen]);

  const canvasKoordinaten = (e: React.PointerEvent | PointerEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const erstelleVorschau = (start: { x: number; y: number }, aktuel: { x: number; y: number }): SkizzeObjekt | null => {
    const id = 'vorschau';
    switch (werkzeug) {
      case 'rechteck':
        return {
          id, typ: 'rechteck',
          x: Math.min(start.x, aktuel.x), y: Math.min(start.y, aktuel.y),
          breite: Math.abs(aktuel.x - start.x), hoehe: Math.abs(aktuel.y - start.y),
        };
      case 'linie':
        return { id, typ: 'linie', x1: start.x, y1: start.y, x2: aktuel.x, y2: aktuel.y };
      case 'kreis': {
        const dx = aktuel.x - start.x;
        const dy = aktuel.y - start.y;
        return { id, typ: 'kreis', cx: start.x, cy: start.y, radius: Math.sqrt(dx * dx + dy * dy) };
      }
      case 'mass':
        return { id, typ: 'mass', x1: start.x, y1: start.y, x2: aktuel.x, y2: aktuel.y, beschriftung: '' };
      default:
        return null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (werkzeug === 'text') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pos = canvasKoordinaten(e);
    setZeichnet(true);
    setStartPunkt(pos);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!zeichnet || !startPunkt || werkzeug === 'text') return;
    const pos = canvasKoordinaten(e);
    setVorschau(erstelleVorschau(startPunkt, pos));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!zeichnet || !startPunkt || werkzeug === 'text') return;
    const pos = canvasKoordinaten(e);
    const neuesObjekt = erstelleVorschau(startPunkt, pos);
    setZeichnet(false);
    setStartPunkt(null);
    setVorschau(null);
    if (!neuesObjekt) return;
    const neuesDaten: SkizzeDaten = {
      ...daten,
      objekte: [...daten.objekte, { ...neuesObjekt, id: neueId() }],
    };
    setDaten(neuesDaten);
    onAenderung(neuesDaten);
  };

  const handleCanvasClick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (werkzeug !== 'text') return;
    const pos = canvasKoordinaten(e);
    const text = window.prompt('Text eingeben:', '');
    if (!text) return;
    const neuesObjekt: SkizzeObjekt = { id: neueId(), typ: 'text', x: pos.x, y: pos.y, inhalt: text };
    const neuesDaten: SkizzeDaten = { ...daten, objekte: [...daten.objekte, neuesObjekt] };
    setDaten(neuesDaten);
    onAenderung(neuesDaten);
  };

  const rückgängig = () => {
    const neuesDaten: SkizzeDaten = { ...daten, objekte: daten.objekte.slice(0, -1) };
    setDaten(neuesDaten);
    onAenderung(neuesDaten);
  };

  const allesLöschen = () => {
    if (!window.confirm('Alle Objekte löschen?')) return;
    const neuesDaten: SkizzeDaten = { ...daten, objekte: [] };
    setDaten(neuesDaten);
    onAenderung(neuesDaten);
  };

  const werkzeuge: { typ: Werkzeug; label: string }[] = [
    { typ: 'rechteck', label: 'Rechteck' },
    { typ: 'linie', label: 'Linie' },
    { typ: 'kreis', label: 'Kreis (Baum)' },
    { typ: 'text', label: 'Text' },
    { typ: 'mass', label: 'Maß' },
  ];

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Werkzeugleiste */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {werkzeuge.map(w => (
          <button
            key={w.typ}
            onClick={() => setWerkzeug(w.typ)}
            style={{
              padding: '8px 14px',
              fontWeight: werkzeug === w.typ ? 'bold' : 'normal',
              background: werkzeug === w.typ ? '#2a6f2a' : '#eee',
              color: werkzeug === w.typ ? '#fff' : '#333',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 15,
            }}
            aria-pressed={werkzeug === w.typ}
          >
            {w.label}
          </button>
        ))}
        <button
          onClick={rückgängig}
          disabled={daten.objekte.length === 0}
          style={{ padding: '8px 14px', borderRadius: 4, border: '1px solid #aaa', cursor: 'pointer', fontSize: 15 }}
        >
          Rückgängig
        </button>
        <button
          onClick={allesLöschen}
          disabled={daten.objekte.length === 0}
          style={{ padding: '8px 14px', borderRadius: 4, border: '1px solid #c00', color: '#c00', cursor: 'pointer', fontSize: 15 }}
        >
          Alles löschen
        </button>
        <span style={{ color: '#666', fontSize: 13 }}>
          {daten.objekte.length} Objekt{daten.objekte.length !== 1 ? 'e' : ''}
        </span>
      </div>

      {/* Zeichenfläche */}
      <canvas
        ref={canvasRef}
        width={daten.breite}
        height={daten.hoehe}
        onPointerDown={werkzeug !== 'text' ? handlePointerDown : undefined}
        onPointerMove={werkzeug !== 'text' ? handlePointerMove : undefined}
        onPointerUp={werkzeug !== 'text' ? handlePointerUp : undefined}
        onClick={werkzeug === 'text' ? (e) => handleCanvasClick(e as unknown as React.PointerEvent<HTMLCanvasElement>) : undefined}
        style={{
          width: '100%',
          border: '1px solid #ccc',
          borderRadius: 4,
          cursor: werkzeug === 'text' ? 'text' : 'crosshair',
          touchAction: 'none', // verhindert Seitenscroll beim Zeichnen auf Touch-Geräten
          background: '#fafafa',
        }}
        aria-label="Skizzen-Zeichenfläche"
      />
      {textEingabe && <span>{textEingabe}</span>}
    </div>
  );
}
