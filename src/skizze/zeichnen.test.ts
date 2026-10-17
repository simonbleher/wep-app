import { describe, it, expect, vi } from 'vitest';
import { skizzeZeichnen } from './zeichnen';
import type { SkizzeObjekt } from '../model/types';

function mockCtx(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    setLineDash: vi.fn(),
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    fillStyle: '',
    font: '',
  } as unknown as CanvasRenderingContext2D;
}

describe('skizzeZeichnen', () => {
  it('zeichnet ein Rechteck', () => {
    const ctx = mockCtx();
    const obj: SkizzeObjekt = { id: '1', typ: 'rechteck', x: 10, y: 20, breite: 100, hoehe: 50 };
    skizzeZeichnen(ctx, obj);
    expect(ctx.strokeRect).toHaveBeenCalledWith(10, 20, 100, 50);
  });

  it('zeichnet eine Linie', () => {
    const ctx = mockCtx();
    const obj: SkizzeObjekt = { id: '2', typ: 'linie', x1: 0, y1: 0, x2: 50, y2: 50 };
    skizzeZeichnen(ctx, obj);
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(50, 50);
  });

  it('zeichnet einen Kreis', () => {
    const ctx = mockCtx();
    const obj: SkizzeObjekt = { id: '3', typ: 'kreis', cx: 100, cy: 100, radius: 30 };
    skizzeZeichnen(ctx, obj);
    expect(ctx.arc).toHaveBeenCalledWith(100, 100, 30, 0, Math.PI * 2);
  });

  it('zeichnet Text', () => {
    const ctx = mockCtx();
    const obj: SkizzeObjekt = { id: '4', typ: 'text', x: 50, y: 50, inhalt: 'Apfel' };
    skizzeZeichnen(ctx, obj);
    expect(ctx.fillText).toHaveBeenCalledWith('Apfel', 50, 50);
  });

  it('zeichnet eine Maßlinie', () => {
    const ctx = mockCtx();
    const obj: SkizzeObjekt = { id: '5', typ: 'mass', x1: 0, y1: 0, x2: 100, y2: 0, beschriftung: '10m' };
    skizzeZeichnen(ctx, obj);
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(ctx.fillText).toHaveBeenCalledWith('10m', expect.any(Number), expect.any(Number));
  });

  it('setzt globale Transparenz bei Vorschau', () => {
    const ctx = mockCtx();
    const obj: SkizzeObjekt = { id: '6', typ: 'linie', x1: 0, y1: 0, x2: 10, y2: 10 };
    skizzeZeichnen(ctx, obj, true);
    expect(ctx.setLineDash).toHaveBeenCalledWith([6, 4]);
  });
});
