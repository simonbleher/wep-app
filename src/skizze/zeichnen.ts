import type { SkizzeObjekt } from '../model/types';

/**
 * Zeichnet ein einzelnes Skizzen-Objekt auf einen 2D-Canvas-Kontext.
 * @param ctx   Canvas-2D-Kontext
 * @param obj   Das zu zeichnende Objekt
 * @param vorschau  Wenn true: gestrichelt / halbtransparent (Drag-Vorschau)
 */
export function skizzeZeichnen(
  ctx: CanvasRenderingContext2D,
  obj: SkizzeObjekt,
  vorschau = false,
): void {
  ctx.save();
  ctx.strokeStyle = obj.farbe ?? '#1a1a1a';
  ctx.lineWidth = obj.strichbreite ?? 2;
  if (vorschau) {
    ctx.globalAlpha = 0.6;
    ctx.setLineDash([6, 4]);
  }

  switch (obj.typ) {
    case 'rechteck':
      ctx.strokeRect(obj.x, obj.y, obj.breite, obj.hoehe);
      break;

    case 'linie':
      ctx.beginPath();
      ctx.moveTo(obj.x1, obj.y1);
      ctx.lineTo(obj.x2, obj.y2);
      ctx.stroke();
      break;

    case 'kreis':
      ctx.beginPath();
      ctx.arc(obj.cx, obj.cy, obj.radius, 0, Math.PI * 2);
      ctx.stroke();
      break;

    case 'text':
      ctx.font = `${obj.schriftgroesse ?? 16}px sans-serif`;
      ctx.fillStyle = obj.farbe ?? '#1a1a1a';
      ctx.fillText(obj.inhalt, obj.x, obj.y);
      break;

    case 'mass': {
      // Linie
      ctx.beginPath();
      ctx.moveTo(obj.x1, obj.y1);
      ctx.lineTo(obj.x2, obj.y2);
      ctx.stroke();
      // Pfeilspitzen
      const winkel = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
      const pfeilLaenge = 10;
      for (const [bx, by, richtung] of [
        [obj.x1, obj.y1, winkel + Math.PI] as const,
        [obj.x2, obj.y2, winkel] as const,
      ]) {
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(
          bx - pfeilLaenge * Math.cos(richtung - 0.4),
          by - pfeilLaenge * Math.sin(richtung - 0.4),
        );
        ctx.moveTo(bx, by);
        ctx.lineTo(
          bx - pfeilLaenge * Math.cos(richtung + 0.4),
          by - pfeilLaenge * Math.sin(richtung + 0.4),
        );
        ctx.stroke();
      }
      // Beschriftung
      if (obj.beschriftung) {
        const mx = (obj.x1 + obj.x2) / 2;
        const my = (obj.y1 + obj.y2) / 2;
        ctx.font = '13px sans-serif';
        ctx.fillStyle = obj.farbe ?? '#1a1a1a';
        ctx.fillText(obj.beschriftung, mx + 4, my - 4);
      }
      break;
    }
  }

  ctx.restore();
}
