-- v2 Paket 2: WEPs auf dem Server mit Revision (optimistisches Speichern) und Verlauf (docs/PLAN-V2.md).

-- Ein WEP: Inhalt als JSON (Format wie in v1), dazu Spalten für Rechte und Listen.
CREATE TABLE weps (
  id TEXT PRIMARY KEY,                        -- Kennung des WEP (UUID, alte WEPs „2026-007“)
  rev INTEGER NOT NULL,                       -- steigt bei jeder Änderung; Speichern nur mit passender Revision
  daten TEXT NOT NULL,                        -- JSON des WEP
  zustand TEXT NOT NULL DEFAULT 'bau_in_arbeit',
  bau_konto TEXT,                             -- Konto-ID des Bau-Wertermittlers (Besitzer)
  gruen_konto TEXT,                           -- Konto-ID des Grün-Wertermittlers (ab der Abgabe Bau → Grün)
  vorgangs_nr TEXT NOT NULL DEFAULT '',
  anlage TEXT NOT NULL DEFAULT '',
  parzelle TEXT NOT NULL DEFAULT '',
  erstellt_am TEXT NOT NULL,
  erstellt_von TEXT NOT NULL,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT NOT NULL,
  geloescht_am TEXT                           -- im Papierkorb (nur der Besitzer, nur in Bearbeitung)
);
CREATE INDEX weps_bau ON weps (bau_konto);
CREATE INDEX weps_gruen ON weps (gruen_konto);
CREATE INDEX weps_zustand ON weps (zustand);

-- Verlauf je WEP: Anlegen, Bearbeiten (höchstens ein Eintrag je Person und Stunde), Löschen, später Zustandswechsel.
CREATE TABLE verlauf (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wep_id TEXT NOT NULL,
  zeit TEXT NOT NULL,
  konto_id TEXT,
  aktion TEXT NOT NULL,
  notiz TEXT,
  zustand_vorher TEXT,
  zustand_nachher TEXT
);
CREATE INDEX verlauf_wep ON verlauf (wep_id, zeit);

INSERT INTO schema_stand (nummer, eingespielt_am) VALUES (2, datetime('now'));
