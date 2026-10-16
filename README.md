# WEP-App

Digitale Erfassung von Kleingarten-Wertermittlungsprotokollen (BV Pankow) direkt auf
der Parzelle – mit automatischem Export in die offizielle WEP-Excel-Vorlage.

- Projektregeln: [CLAUDE.md](CLAUDE.md)
- Architektur & Zellen-Mapping: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md)
- Aufgaben: [TASKS.md](TASKS.md)
- Grundlage: [Wertermittlungsrichtlinie LV Berlin](docs/Richtlinie.pdf) · [WEP-Vorlage](docs/WEP_Vorlage.xlsx)

## Lokale Entwicklung

Die App ist eine installierbare PWA (offline-fähig) auf Basis von Vite, React und
TypeScript.

```bash
npm install        # Abhängigkeiten installieren
npm run dev        # Entwicklungsserver starten
npm run build      # Produktions-Build (dist/) erstellen
npm run preview    # Produktions-Build lokal testen
npm run typecheck  # TypeScript ohne Ausgabe prüfen
```
