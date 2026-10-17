import type { SkizzeDaten } from '../model/types';
import { skizzeZeichnen } from './zeichnen';

/**
 * Rendert die Skizze auf einen Off-Screen-Canvas und gibt einen PNG-Blob zurück.
 * @param daten  Die Skizzendaten (kann undefined sein → leeres PNG)
 * @param breite Breite des PNG in Pixeln (Standard aus daten.breite)
 * @param hoehe  Höhe des PNG in Pixeln (Standard aus daten.hoehe)
 */
export async function skizzeAlsPng(
  daten: SkizzeDaten | undefined,
  breite?: number,
  hoehe?: number,
): Promise<Blob> {
  const w = breite ?? daten?.breite ?? 800;
  const h = hoehe ?? daten?.hoehe ?? 600;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D-Kontext nicht verfügbar');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  if (daten) {
    for (const obj of daten.objekte) {
      skizzeZeichnen(ctx, obj);
    }
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('PNG-Erzeugung fehlgeschlagen'));
    }, 'image/png');
  });
}
