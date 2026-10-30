# Aufgaben

Status: ⬜ offen · 🔄 in Arbeit · 🟡 PR offen · ✅ gemergt (#Nr)

Stand 30.10.2026, Status per GitHub geprüft. Die App läuft in Produktion im Server-Modus (v2,
docs/PLAN-V2.md). Erledigte Einträge sind auf das Wichtigste gekürzt; Details stehen im jeweiligen PR
und in docs/ENTSCHEIDUNGEN.md. Die alten Agenten-Prompts stehen in der Git-Historie dieser Datei.

## Offen / als Nächstes

**Sicherheit** (Funde aus docs/SICHERHEITSPRUEFUNG-V2.md, PRs warten auf Simon):
- 🟡 PR A · Rechte/Eingaben (M2, N4, N7, N8, N12; M1 akzeptiert) – #126
- 🟡 PR B · Anmeldung/Sitzung (M3, M5, N1, N2, N3, N5, N6, N10, N15) – #127
- 🟡 PR C · Missbrauch/Datensparsamkeit (M6, M7, N9, N11, N13) – #128
- 🟡 PR D · Security-Header (M4, CSP zuerst Report-Only) – #129
- 🟡 PR E · Abhängigkeiten der Windows-App (M8; Windows 0.1.6, Hülle 5) – #130

**App:**
- ⬜ Anzeige „N Änderungen warten“, obwohl keine Daten mehr warten (Server-Modus).
- ⬜ V2-8b · Prüfen auf echten Geräten: NSIS-Hook vor „CheckIfAppIsRunning“, Android-Kaltstart nach der
  Anmeldung, Custom Tab schließt nach dem Rücksprung (Checkliste in #122).
- ⬜ Fachlich: Abdeckung der Richtlinie prüfen (docs/RICHTLINIE-ABDECKUNG.md), danach kleine Lücken schließen.
- ⬜ Bäume: Vorschlag direkt aus dem Durchmesser.

**Betrieb (Simon):**
- ⬜ Backups von D1 und R2 einrichten.
- ⬜ Zugriffsprotokoll automatisch löschen (Frist festlegen und mit der Datenschutzerklärung abgleichen).
- ⬜ Eigene Domain und Mail-Absender (statt `wep-pankow.pages.dev`).
- ⬜ Google-Branding-Prüfung des OAuth-Clients (Rechtsseiten liegen bereit, #115–#118).
- ⬜ Azure-Clientschlüssel (Cloudflare `MS_CLIENT_SECRET`) jährlich erneuern, Ablaufdatum notieren.
- ⬜ Vorlage-Fehlerbericht an den BV schicken (docs/VORLAGE-FEHLERBERICHT.md/.pdf, #124).

**Entfällt:** V2-7 / Paket 7 (Migration der v1-WEPs auf den Server) – v1 hat außer Simon niemand genutzt.

## Offene Fragen an Simon / den BV
- Zustandsstufen: feste Prozent-Staffel (src/model/types.ts, „vom BV zu bestätigen“) oder freie Schätzung?
- Blätter „Anl IV Schuppen“ / „Anl IV Dach“ der Vorlage (versteckt, viele #REF!): noch gebraucht?
- Offene Gerätetests aus Beta 3–5 (Skizzen-Gesten, PDF speichern/teilen auf Android/Windows) und
  Optikprüfung der PDFs auf Papier.

## Phase 1 – Grün-Teil
- K1 · Katalog aus der BewRL ✅ gemergt (#1). `data/katalog.json` (Außenanlagen + Aufwuchs, S. 12–18) und `data/invasive.json` (Unionsliste).
- K2 · Suche & Sortierung ✅ gemergt (#3, #5). Tippfehlertolerante Suche in `src/katalog/`, auch über Artnamen; #6 geschlossen (in #5 aufgegangen).
- K3 · Suche findet Ökologische Objekte ✅ gemergt (#9).
- A1 · PWA-Grundgerüst ✅ gemergt (#4). Vite + React + TS, offline, IndexedDB.
- A2 · Erfassung Formalien, Außenanlagen, Aufwuchs, Beseitigung ✅ gemergt (#10; #11 geschlossen).
- A3 · Verbesserungen Erfassung ✅ gemergt (#13). Kurze Bezeichnungen, Variante aus der Suche, deutsche Zahlen.
- E1 · Excel-Export: Bau-Excel + App → fertiges WEP ✅ gemergt (#7).
- E2 · Skizze als Bild in die Excel ✅ gemergt (#14).
- E3 · Grün-Skizze als native Excel-Formen ✅ gemergt (#22, #23, #25).
- S1 · Skizzen-Tool ✅ gemergt (#12).
- S2 · Skizze in der Erfassung ✅ gemergt (#16; #15 geschlossen).
- Y1 · Sync über Simons privates OneDrive ✅ gemergt (#8). Anleitung docs/SYNC.md.
- Hosting auf Cloudflare Pages ✅ gemergt (#17). Beta-Umfang ✅ gemergt (#2).

## KI-Assistent (abgeschaltet seit 20.10.2026, Schalter `KI_AKTIV`, docs/KI-ASSISTENT.md)
- Plan ✅ gemergt (#18). K-A0 · KI-Testlauf ✅ gemergt (#19, #24). K-B0 · Skizzen-Testlauf ✅ gemergt (#20, #21).
- K-B1 · Skizzen-Chat ✅ gemergt (#26). KI abschalten ✅ gemergt (#28).

## Beta 2 (docs/PLAN-BETA2.md) – Plan #27, Abschluss #37
- B2-2 · Konto, Login, Profil, OneDrive-Ordner ✅ gemergt (#29, Fix #30).
- B2-3 · Android-Test-APK (Capacitor) ✅ gemergt (#31).
- B2-4a/b/c · Design-Entwurf und Umbau der App ✅ gemergt (#32, #33, #34).
- B2-5 · Fertige APK mit Release-Workflow ✅ gemergt (#35, Fix #36). Anleitung docs/ANDROID.md.

## Beta 3 (docs/PLAN-BETA3.md) – Pläne #38, #45, Abschluss #52
- B3-0 · Selbst-Update der Android-App ✅ gemergt (#39, #41, #42).
- B3-1 · Icon, Status je WEP, Duplizieren ✅ gemergt (#40).
- B3-2 · Papierkorb, sichtbare Konflikte ✅ gemergt (#43).
- B3-3 · Eigene Positionen merken ✅ gemergt (#44).
- B3-4 · Fotos ✅ gemergt (#46, #48).
- B3-5 · Bau-Excel am WEP, Formalien vorbefüllen ✅ gemergt (#47).
- B3-6 · Suche, Problempflanzen, Sicherung als Datei ✅ gemergt (#49, #50).
- B3-7 · Skizze bedienen (Zoomen, Einrasten, Auswählen) ✅ gemergt (#51).

## Windows-Programm (docs/PLAN-EXE.md, docs/WINDOWS.md) – Plan #53
- W-1 · .exe mit Tauri 2 ✅ gemergt (#54, Fixes #55, #62). Anmeldung über Systembrowser, Live-Update, Programm-Updates.

## Beta 4 – Bau-Teil (docs/PLAN-BETA4.md) – Plan #56
- B4-1 · Rolle schaltet Reiter und Export frei ✅ gemergt (#57).
- B4-2 · Bau erfassen und bewerten ✅ gemergt (#58). Bauteile, Mängelabzug, Alterswertminderung, Baupreisindex; Test App = Excel.
- B4-3 · Zeichen-Tools Bau (Grundriss mit Maßen) ✅ gemergt (#59).
- B4-4 · Rechen-Tools (Fläche, Kubatur, Altersabzug, 24-m²-Check) ✅ gemergt (#60).
- B4-5 · 3D-Ansicht ✅ gemergt (#61).
- T-1 · Prüfwerkzeug für alte WEPs (`tools/pruef-weps/`) ✅ gemergt (#63).

## Beta 5 (docs/PLAN-BETA5.md) – Plan #64
- Updates nur nach Freigabe (Branch `release`) ✅ gemergt (#65). Deploy Hook ✅ gemergt (#73).
- B5-1 · Grün-Skizze auf Bau-Basis ✅ gemergt (#66).
- B5-2 · Teilen als .wep-Datei ✅ gemergt (#68).
- B5-3 · Unterschrift im Profil ✅ gemergt (#67).
- B5-4 · PDF direkt aus der App ✅ gemergt (#69).

## Beta 6 (docs/PLAN-BETA6.md) – Plan #70
- B6-1 · Parzellenform, gleicher Maßstab für Bau- und Grün-Skizze ✅ gemergt (#71).
- B6-2 · Weitere Dachformen (Walm, Zelt, Krüppelwalm, Mansard) ✅ gemergt (#72).
- B6-3 · KGA-Auswahl (56 Anlagen) ✅ gemergt (#86).

## Nachtrag
- PDF-2 · PDF übersichtlich, neuer Deckblatt-Text ✅ gemergt (#74).
- SKA-1/2/3 · Agent-Schnittstelle `window.wep` (Skizze, Positionen aus Text, Grundformen) ✅ gemergt (#75, #76, #77).
- BX-1/2 · Bau-Excel: Grün-Teil bzw. gesamten Inhalt ins WEP übernehmen ✅ gemergt (#78, #79).
- Versionsanzeige im Profil ✅ gemergt (#80).
- BX-3 · Bau-Excel-Import: Korrekturen nach Prüfung eines echten WEP ✅ gemergt (#81).
- SK-1 · Gedrehte Texte der Bau-Skizze bleiben gedreht ✅ gemergt (#82).
- BAU-1 · Schuppen/Unterstände neben einer Laube nicht bewerten ✅ gemergt (#83).
- EXP-1 · Bau-Teil auch bei einem Grün-WEP mit Bau-Daten ✅ gemergt (#84).
- Profil: eigene Positionen aufklappbar ✅ gemergt (#85).
- XL-1 · „Ohne Excel arbeiten“ (Standard: an) ✅ gemergt (#87). PDF-Export setzt Status ✅ gemergt (#88).
- VNR-1 · Vorgangs-Nr. immer eingeben, interne Kennung UUID ✅ gemergt (#89).
- BV-1 · „An den BV senden“ (Paket) ✅ gemergt (#90).
- DOKU-1 · Anleitung für Wertermittler ✅ gemergt (#91).
- BAU-FIX-1 · Keine Phantom-Bauteile aus gelöschten Skizze-Formen ✅ gemergt (#92).
- Deckblatt: doppelter Satz entfernt ✅ gemergt (#93).
- PDF-BB-1 · Baubeschreibung mit Zeilenumbrüchen ✅ gemergt (#94).
- BAU-GRUBE-1 · Abwassergrube/Kanal: Altersabzug 3 % vom Restwert ✅ gemergt (#95).
- TEILEN-FIX-1 · .wep-Datei mit UUID-Kennung ✅ gemergt (#96).
- UEB-1 · Reiter „Übersicht“ ✅ gemergt (#97).
- EINST-1 · Export-Reiter nur „An den BV senden“, Entwickleroptionen ✅ gemergt (#98).
- BV-2 · BV-Kontrollseite `/bv` ✅ gemergt (#99).
- UNTERSCHRIFT-1 · Unterschrift reist mit dem WEP ✅ gemergt (#100).
- KONTO-5 · Alle Microsoft-Konten ✅ gemergt (#101).
- BV-3 · Zugang zur BV-Kontrollseite mit Freigabe ✅ gemergt (#102).
- PROFIL-KGA-1 · Standard-Kleingartenanlage aus dem Profil entfernt ✅ gemergt (#103).
- VORLAGE-1 · Fehlerprüfung der BV-Vorlage (46 Funde, Korrekturvorschlag) ✅ gemergt (#124). Versand an den BV offen (oben).

## v2 – Server, Konten mit Rollen (docs/PLAN-V2.md, docs/V2-EINRICHTUNG.md)
- V2-0 bis V2-6 · Plan/Schalter, Server-Grundgerüst, WEPs auf dem Server, Fotos in R2, Ablauf Bau → Grün → BV,
  BV-Kontrollseite, Benachrichtigungen, Anleitung v2 ✅ gemergt (#104–#111, gesammelt über #113).
- V2-PROD · v2 direkt in Produktion ✅ gemergt (#114).
- V2-RECHT-1/2/3 · Datenschutzerklärung, Nutzungsbedingungen, Google-Nutzerdaten ✅ gemergt (#115, #116, #117, #118).
- V2-GRUEN · Grün legt eigene WEPs an und führt sie zusammen ✅ gemergt (#119).
- V2-GRUEN-2 · Parzelle beim Zusammenführen von Grün ✅ gemergt (#120).
- V2-AUFRAEUMEN · Doppelte Ablage aufräumen ✅ gemergt (#121).
- V2-8 · Server-Modus in Android- und Windows-App ✅ gemergt (#122). Gerätetest offen (V2-8b, oben).
- V2-8a · APK/EXE mit Server-Schalter bauen ✅ gemergt (#123).
- V2-SICHERHEIT · Sicherheitsprüfung des Server-Modus, Fix H1 ✅ gemergt (#125). Übrige Funde: PR A–E (oben).
- V2-7 · Migration der v1-WEPs – entfällt (oben).
