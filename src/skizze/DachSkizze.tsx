/**
 * Kleine Erklär-Skizze zur Dachform (Beta 6, Paket 2): links eine Ansicht mit den Höhenmaßen, rechts die Draufsicht
 * mit First, Graten und Knick. Die Buchstaben stehen in der Legende darunter (`DACH_LEGENDE`) – dieselbe Beschriftung
 * wie die Eingabefelder im Grundriss-Editor und im Rechner. Reine Zeichnung, keine Daten.
 */
import type { ReactNode } from 'react'
import { dachformText, type Dachform } from './grundriss'

/** Bedeutung der Buchstaben in der Skizze, je Dachform. */
export const DACH_LEGENDE: Record<Dachform, [buchstabe: string, text: string][]> = {
  flach: [['H', 'Höhe']],
  pult: [
    ['N', 'niedrige Wand'],
    ['H', 'hohe Wand'],
  ],
  sattel: [
    ['T', 'Traufhöhe'],
    ['F', 'Firsthöhe'],
  ],
  walm: [
    ['T', 'Traufhöhe'],
    ['F', 'Firsthöhe'],
    ['f', 'Firstlänge'],
  ],
  zelt: [
    ['T', 'Traufhöhe'],
    ['S', 'Höhe der Spitze'],
  ],
  krueppelwalm: [
    ['T', 'Traufhöhe'],
    ['F', 'Firsthöhe'],
    ['d', 'Walmhöhe'],
    ['t', 'Walmtiefe'],
  ],
  mansard: [
    ['T', 'Traufhöhe'],
    ['K', 'Knickhöhe'],
    ['F', 'Firsthöhe'],
    ['e', 'Knick-Einzug'],
  ],
}

const ANSICHT_TEXT: Record<Dachform, string> = {
  flach: 'Ansicht von der Seite',
  pult: 'Ansicht vom Giebel',
  sattel: 'Ansicht vom Giebel',
  walm: 'Ansicht von der Längsseite',
  zelt: 'Ansicht von der Seite',
  krueppelwalm: 'Ansicht von der Längsseite',
  mansard: 'Ansicht vom Giebel',
}

const BODEN = 80
const PLAN = { x1: 128, x2: 208, y1: 22, y2: 68, ym: 45 }

/** Senkrechtes Höhenmaß von `ya` (oben) bis `yb` (unten) bei `x`. */
function MassV({ x, ya, yb, buchstabe }: { x: number; ya: number; yb: number; buchstabe: string }) {
  return (
    <g className="dach-mass">
      <line x1={x} y1={ya} x2={x} y2={yb} />
      <line x1={x - 2.5} y1={ya} x2={x + 2.5} y2={ya} />
      <line x1={x - 2.5} y1={yb} x2={x + 2.5} y2={yb} />
      <text x={x} y={(ya + yb) / 2 + 3} textAnchor="middle" className="dach-buchstabe">
        {buchstabe}
      </text>
    </g>
  )
}

/** Waagerechtes Maß von `xa` bis `xb` bei `y`; der Buchstabe steht darüber oder darunter. */
function MassH({ y, xa, xb, buchstabe, unten = false }: { y: number; xa: number; xb: number; buchstabe: string; unten?: boolean }) {
  return (
    <g className="dach-mass">
      <line x1={xa} y1={y} x2={xb} y2={y} />
      <line x1={xa} y1={y - 2.5} x2={xa} y2={y + 2.5} />
      <line x1={xb} y1={y - 2.5} x2={xb} y2={y + 2.5} />
      <text x={(xa + xb) / 2} y={unten ? y + 10 : y - 3} textAnchor="middle" className="dach-buchstabe">
        {buchstabe}
      </text>
    </g>
  )
}

const Rumpf = ({ punkte }: { punkte: string }) => <polygon points={punkte} className="dach-flaeche" />
const Strich = ({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) => <line x1={x1} y1={y1} x2={x2} y2={y2} className="dach-linie" />

function Ansicht({ form }: { form: Dachform }): ReactNode {
  switch (form) {
    case 'flach':
      return (
        <>
          <Rumpf punkte={`22,${BODEN} 22,38 98,38 98,${BODEN}`} />
          <MassV x={12} ya={38} yb={BODEN} buchstabe="H" />
        </>
      )
    case 'pult':
      return (
        <>
          <Rumpf punkte={`22,${BODEN} 22,26 98,52 98,${BODEN}`} />
          <MassV x={12} ya={26} yb={BODEN} buchstabe="H" />
          <MassV x={108} ya={52} yb={BODEN} buchstabe="N" />
        </>
      )
    case 'sattel':
      return (
        <>
          <Rumpf punkte={`22,${BODEN} 22,52 60,20 98,52 98,${BODEN}`} />
          <Strich x1={22} y1={52} x2={98} y2={52} />
          <MassV x={12} ya={52} yb={BODEN} buchstabe="T" />
          <MassV x={108} ya={20} yb={BODEN} buchstabe="F" />
        </>
      )
    case 'walm':
      return (
        <>
          <Rumpf punkte={`22,${BODEN} 22,52 44,20 76,20 98,52 98,${BODEN}`} />
          <Strich x1={22} y1={52} x2={98} y2={52} />
          <MassV x={12} ya={52} yb={BODEN} buchstabe="T" />
          <MassV x={108} ya={20} yb={BODEN} buchstabe="F" />
          <MassH y={13} xa={44} xb={76} buchstabe="f" />
        </>
      )
    case 'zelt':
      return (
        <>
          <Rumpf punkte={`22,${BODEN} 22,52 60,18 98,52 98,${BODEN}`} />
          <Strich x1={22} y1={52} x2={98} y2={52} />
          <MassV x={12} ya={52} yb={BODEN} buchstabe="T" />
          <MassV x={108} ya={18} yb={BODEN} buchstabe="S" />
        </>
      )
    case 'krueppelwalm':
      return (
        <>
          <Rumpf punkte={`22,${BODEN} 22,34 34,20 86,20 98,34 98,${BODEN}`} />
          <Strich x1={22} y1={52} x2={98} y2={52} />
          <MassV x={14} ya={52} yb={BODEN} buchstabe="T" />
          <MassV x={5} ya={20} yb={BODEN} buchstabe="F" />
          <MassV x={108} ya={20} yb={34} buchstabe="d" />
          <MassH y={13} xa={86} xb={98} buchstabe="t" />
        </>
      )
    case 'mansard':
      return (
        <>
          <Rumpf punkte={`22,${BODEN} 22,56 36,32 60,18 84,32 98,56 98,${BODEN}`} />
          <Strich x1={22} y1={56} x2={98} y2={56} />
          <Strich x1={36} y1={32} x2={84} y2={32} />
          <MassV x={14} ya={56} yb={BODEN} buchstabe="T" />
          <MassV x={5} ya={32} yb={BODEN} buchstabe="K" />
          <MassV x={108} ya={18} yb={BODEN} buchstabe="F" />
          <MassH y={26} xa={22} xb={36} buchstabe="e" />
        </>
      )
  }
}

function Draufsicht({ form }: { form: Dachform }): ReactNode {
  const { x1, x2, y1, y2, ym } = PLAN
  const rahmen = <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} className="dach-flaeche" />
  switch (form) {
    case 'flach':
      return rahmen
    case 'pult':
      return (
        <>
          {rahmen}
          <line x1={150} y1={ym} x2={186} y2={ym} className="dach-pfeil" markerEnd="url(#dach-pfeilspitze)" />
        </>
      )
    case 'sattel':
      return (
        <>
          {rahmen}
          <Strich x1={x1} y1={ym} x2={x2} y2={ym} />
        </>
      )
    case 'walm':
      return (
        <>
          {rahmen}
          <Strich x1={156} y1={ym} x2={180} y2={ym} />
          <Strich x1={x1} y1={y1} x2={156} y2={ym} />
          <Strich x1={x1} y1={y2} x2={156} y2={ym} />
          <Strich x1={x2} y1={y1} x2={180} y2={ym} />
          <Strich x1={x2} y1={y2} x2={180} y2={ym} />
          <MassH y={78} xa={156} xb={180} buchstabe="f" />
        </>
      )
    case 'zelt':
      return (
        <>
          {rahmen}
          <Strich x1={x1} y1={y1} x2={168} y2={ym} />
          <Strich x1={x1} y1={y2} x2={168} y2={ym} />
          <Strich x1={x2} y1={y1} x2={168} y2={ym} />
          <Strich x1={x2} y1={y2} x2={168} y2={ym} />
        </>
      )
    case 'krueppelwalm':
      return (
        <>
          {rahmen}
          <Strich x1={140} y1={ym} x2={196} y2={ym} />
          <Strich x1={140} y1={ym} x2={x1} y2={36} />
          <Strich x1={140} y1={ym} x2={x1} y2={54} />
          <Strich x1={196} y1={ym} x2={x2} y2={36} />
          <Strich x1={196} y1={ym} x2={x2} y2={54} />
          <MassH y={78} xa={x1} xb={140} buchstabe="t" />
        </>
      )
    case 'mansard':
      return (
        <>
          {rahmen}
          <Strich x1={x1} y1={ym} x2={x2} y2={ym} />
          <Strich x1={x1} y1={32} x2={x2} y2={32} />
          <Strich x1={x1} y1={58} x2={x2} y2={58} />
          <MassV x={x2 + 8} ya={y1} yb={32} buchstabe="e" />
        </>
      )
  }
}

export function DachSkizze({ form }: { form: Dachform }) {
  const legende = DACH_LEGENDE[form].map(([b, t]) => `${b} = ${t}`).join(', ')
  return (
    <figure className="dach-skizze" data-dachform={form}>
      <svg viewBox="0 0 220 92" role="img" aria-label={`${dachformText(form)}: Ansicht und Draufsicht. ${legende}`}>
        <defs>
          <marker id="dach-pfeilspitze" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L6,3 L0,6 z" className="dach-pfeilkopf" />
          </marker>
        </defs>
        <text x={4} y={90} className="dach-titel">
          {ANSICHT_TEXT[form]}
        </text>
        <text x={124} y={90} className="dach-titel">
          Draufsicht
        </text>
        <g>{Ansicht({ form })}</g>
        <g>{Draufsicht({ form })}</g>
      </svg>
      <figcaption className="neben">{legende}</figcaption>
    </figure>
  )
}
