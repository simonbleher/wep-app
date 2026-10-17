---
name: parzellen-skizze
description: Zeichnet eine handschriftliche Parzellen-/Gartenskizze (Foto) als bearbeitbare Excel-Formen im einheitlichen Lageplan-Stil – entweder den Bau-Teil in „Skizze Bau“ oder (Modus Außenanlage/Aufwuchs) Kopie von „Skizze Bau“ plus alle übrigen Elemente in „Skizze Außenanlage-Aufwuchs“.
---

## Wann verwenden
Der Nutzer lädt ein Foto einer Handskizze einer Kleingartenparzelle hoch (Laube, Anbauten, Terrassen, Schuppen, Kompost, Bäume, Hecken, Wege, Mängelhinweise, Maße) und möchte sie in Excel „nachgezeichnet“, „schöner“ oder „im Stil“ haben. Auch bei /parzellen-skizze.

## Modus wählen
- **Modus Bau** (Zielblatt „Skizze Bau“): nur Grundstück, Zaunpfosten und Baulichkeiten (Laube, Anbauten, Terrassen, Schuppen, Keller/HW, Kleinteile an Gebäuden) zeichnen.
- **Modus Außenanlage/Aufwuchs** (Zielblatt „Skizze Außenanlage-Aufwuchs“, oder der Nutzer sagt „Außenanlage“, „Aufwuchs“, „alles außer Bau“): zuerst die fertige Bau-Skizze aus „Skizze Bau“ kopieren (Schritt 1b), dann **nur die restlichen Elemente** aus dem Foto ergänzen (Gras, Weg/Tor, Kompost, Hecken, Bäume, Sträucher, Schächte, Mängelhinweise, Maße). Gebäude NICHT neu zeichnen.
- Unklar → kurz nachfragen.

## Grundregeln
- Nur Excel-Formen und SVG-Bilder, keine Zellinhalte ändern (auch nicht die Blattüberschrift in A1; ggf. nur im Bericht darauf hinweisen).
- Nicht maßstabsgetreu, aber grob proportional; Maße aus der Skizze als rote Maßlinien beschriften. Keine Maße auf der Skizze → keine Maßlinien.
- Kürzel auflösen: L = Laube, A1/A2 = Anbau, S1/S2 = Schuppen, LVP = Laubenvorplatz, TS = Toilettenschuppen, ASG = Abstellgebäude, K1 HW = Keller/Hauswasser (gestrichelt), HW-Schacht = Hauswasserschacht. Im Zweifel das Kürzel so übernehmen, wie es auf der Skizze steht.
- Vorhandene fremde Formen (z. B. „TextBox 8“, „TextBox 1“) nie löschen und nicht mitkopieren. Nur eigene Formen ersetzen, und das nur, wenn der Nutzer eine neue Skizze will.
- Unleserliches nicht raten: kurz nachfragen oder im Bericht nennen (Beispiel: „Asbest Platte entfernen“ → als „Asbestplatte entfernen“ gelesen, im Bericht zur Prüfung nennen).

## Schritt 1: Blatt und Kasten vermessen
Mit execute_office_js: `shapes` laden (Name, Typ, Position) und `getRange("A1:H50").getImage()` per attachImage ansehen – im Modus Außenanlage/Aufwuchs für **beide** Blätter („Skizze Bau“ und Ziel). Skizzenkasten über die Rahmenzellen bestimmen (bei beiden Blättern B7:G49, ca. x 14–475 pt, y 93–724 pt; Grundstück ca. x 22–467, y 101–716).
Fertig, wenn: die Kastenkoordinaten bekannt sind (im Modus Außenanlage auch die Formliste von „Skizze Bau“).

## Schritt 1b (nur Modus Außenanlage/Aufwuchs): Bau-Skizze kopieren
- Hat das Zielblatt schon eigene Formen (außer fremden TextBoxen) → nachfragen, ob ersetzen.
- Formen mit `shape.copyTo(zielSheet)` kopieren (Position bleibt erhalten), fremde TextBoxen auslassen.
- Ebenen-Reihenfolge: zuerst nur „Grundstück“ kopieren, dann das **Gras-SVG** einfügen, danach alle übrigen Formen kopieren (Pfosten, Gebäude, Terrassen, K1_HW …).
- **Wiese grün**: Füllung von „Grundstück“ auf #C5E0B4 setzen (`fill.setSolidColor("#C5E0B4"); fill.transparency=0`) – in „Skizze Bau“ ist sie oft weiß.
```js
const src=context.workbook.worksheets.getItem("Skizze Bau");
src.shapes.load("items/name");await context.sync();
const items=src.shapes.items.filter(x=>!x.name.startsWith("TextBox"));
items.find(x=>x.name==="Grundstück").copyTo(s);await context.sync();
// ... Gras-SVG einfügen ...
for(const it of items) if(it.name!=="Grundstück") it.copyTo(s);
await context.sync();
```
Fertig, wenn: das Zielblatt die Bau-Skizze an gleicher Position zeigt, mit grüner Wiese und Gras darunter.

## Schritt 2: Layout planen
Skizzenelemente in Kastenkoordinaten übertragen (relative Lage beibehalten: oben/unten/links/rechts, was grenzt an was). Grundstücksfläche = Kasten minus 8 pt Rand.
Im Modus Außenanlage: Umrechnung Foto → Punkte über Bezugsgebäude bestimmen (linke/rechte Kante der Laube, Oberkante Laube bis Unterkante Terrasse), damit neue Elemente zu den kopierten Gebäuden passen. Dann so verschieben, dass Beschriftungen/Hinweise nicht mit Gebäuden kollidieren (z. B. Kompost oben rechts neben A1, Hinweis darunter mit Pfeil nach oben).
Fertig, wenn: jedes Element eine Position hat.

## Schritt 3: Zeichnen (Stil-Spezifikation), Ebenen in dieser Reihenfolge
1. **Grundstück**: Rechteck, Füllung #E2F0D9 (Modus Bau) bzw. #C5E0B4 (Modus Außenanlage, grüne Wiese), Linie #595959.
2. **Gras**: ein SVG-Bild über die ganze Fläche mit ca. 20–25 kleinen „v“-Häkchen (#70AD47, stroke-width 1.5), nur in freien Bereichen.
3. **Zaunpfosten**: 5×5-pt-Quadrate, weiß mit Linie #595959, gleichmäßig am Rand.
4. **Weg**: Rechteck #EDE4D3, Linie #A6A6A6, direkt ab Terrasse bis knapp über die unteren Pfosten; Beschriftung „Weg“; **Tor** als SVG (senkrechte Linie + Viertelbogen) am unteren Ende.
5. **Gebäude/Terrassen** (nur Modus Bau): Rechteck #E7E6E6, Linie #262626, Text schwarz, 11–13 pt, zentriert. Keller/HW gestrichelt (`lineFormat.dashStyle="Dash"`, ohne Füllung).
6. **Grün**: Bäume als SVG-Piktogramm (Krone aus Kreisen, Stamm #7F5A2E; Bergahorn #70AD47, Buche/Laubbaum #548235), Strauch als SVG (Jasmin mit weißen Blüten), Hecke als Reihe überlappender, versetzter Ellipsen (ca. 30×30 pt; Flieder #B4A7D6 / Linie #7030A0). Zu entfernende Pflanzen: Form `star16` #70AD47 (Linie #548235) mit rotem X (2 Linien, #C00000, Stärke 2).
7. **Kleinteile**: Kompost (Rahmen #D9C3A5 / Linie #8B5A2B, 3 Latten #8B5A2B), Schacht/Schornstein (Quadrat #BFBFBF, ca. 18×18 pt) mit schwarzem Pfeil von der Beschriftung.
8. **Beschriftungen**: transparente Textfelder, 9–10 pt, schwarz; Pflanzennamen darunter, „Kompost“ darüber.
9. **Mängelhinweise**: abgerundetes Rechteck, weiß, Rand und Text #C00000, 9 pt, mit rotem Pfeil zum Objekt (z. B. „Rückschnitt“ → Hecke, „Wacholder entfernen“ über dem Stern, „Asbestplatte entfernen“ → Kompost).
10. **Maßlinien**: rote Linien #C00000 mit Endstrichen und Text „4 m“, „1,5 m“ (deutsches Komma).

Sprechende Formnamen vergeben (z. B. „A1“, „Weg“, „Tor“, „Gras“, „Kompost“, „Kompost_Latte_0“, „Flieder_0“, „Fliederhecke_Text“, „Wacholder“, „Wacholder_X1“, „Wacholder_Hinweis“, „HW_Schacht_alt“, „Asbestplatte_Pfeil“, „Maß_Laube_Breite“).

### Technische Hinweise (Office.js)
- `lineFormat.weight` nur ganze Zahlen (1, 2); 1.5 kann fehlschlagen.
- `textFrame.verticalAlignment="Middle"` (nicht „Center“). Textränder klein (left/right 1, top/bottom 0), damit Hinweise nicht umbrechen.
- `shapes.addSvg` gibt es nicht; SVG stattdessen so einfügen: `shapes.addImage(btoa(unescape(encodeURIComponent(svg))))`, danach left/top/width/height setzen.
- Pfeile: `line = shapes.addLine(x1,y1,x2,y2,"Straight"); line.line.endArrowheadStyle="Triangle"`.
- Zuerst hinzugefügte Formen liegen unten; deshalb die Ebenen-Reihenfolge einhalten.
- `shape.copyTo(sheet)` kopiert mit gleicher Position; Kopien landen oben auf dem Stapel.

Hilfsfunktionen (Muster):
```js
const G=Excel.GeometricShapeType;
function rect(n,l,t,w,h,fill,line,type){const b=s.shapes.addGeometricShape(type||G.rectangle);b.name=n;b.left=l;b.top=t;b.width=w;b.height=h;
 fill?b.fill.setSolidColor(fill):b.fill.clear(); if(line){b.lineFormat.color=line;b.lineFormat.weight=1}else b.lineFormat.visible=false; return b;}
function txt(b,t,size,color){b.textFrame.textRange.text=t;const f=b.textFrame.textRange.font;f.size=size;f.color=color||"#000000";
 b.textFrame.horizontalAlignment="Center";b.textFrame.verticalAlignment="Middle";
 b.textFrame.leftMargin=1;b.textFrame.rightMargin=1;b.textFrame.topMargin=0;b.textFrame.bottomMargin=0;return b;}
function label(n,l,t,w,h,t2,size){return txt(rect(n,l,t,w,h,null,null),t2,size||9);}
function hint(n,l,t,w,h,t2){return txt(rect(n,l,t,w,h,"#FFFFFF","#C00000",G.roundRectangle),t2,9,"#C00000");}
function arrow(n,x1,y1,x2,y2){const a=s.shapes.addLine(x1,y1,x2,y2,"Straight");a.name=n;a.lineFormat.color="#C00000";a.lineFormat.weight=1;a.line.endArrowheadStyle="Triangle";return a;}
function svgImg(n,svg,l,t,w,h){const i=s.shapes.addImage(btoa(unescape(encodeURIComponent(svg))));i.name=n;i.left=l;i.top=t;i.width=w;i.height=h;return i;}
```
Tor-SVG (Muster, 60×40): `<path d="M57 2 L57 39" stroke="#262626" stroke-width="2"/><path d="M3 39 A54 37 0 0 1 57 2" stroke="#262626" fill="none"/>`

## Schritt 4: Prüfen
`getRange("A1:H50").getImage()` rendern und ansehen: Überlappungen von Text und Pfeilen, Elemente außerhalb des Kastens, abgeschnittene Beschriftungen, Wiese grün (Modus Außenanlage). Korrigieren und erneut rendern.
Fertig, wenn: das gerenderte Bild sauber aussieht.

## Schritt 5: Bericht (kurz, auf Deutsch)
Liste der gezeichneten Elemente (im Modus Außenanlage getrennt: „aus Skizze Bau kopiert“ / „neu ergänzt“); Hinweis, dass SVG-Bilder nur skalierbar und nicht umfärbbar sind; nicht übernommene oder unklare Teile nennen (z. B. unleserliche Hinweise, nicht deutbare Striche, fehlende Maße, Blattüberschrift in A1 unverändert); Ergänzungen anbieten (z. B. Nordpfeil, Legende, Maßstab).