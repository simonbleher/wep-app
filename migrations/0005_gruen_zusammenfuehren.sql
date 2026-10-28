-- v2: Grün legt eigene WEPs an und führt sie mit einem abgegebenen Bau-WEP zusammen (docs/PLAN-V2.md).
ALTER TABLE weps ADD COLUMN zusammengefuehrt_in TEXT;     -- am Grün-WEP: Kennung des Bau-WEP (aus allen Listen verschwunden)
ALTER TABLE weps ADD COLUMN zusammengefuehrt_aus TEXT;    -- am Bau-WEP: Kennung des eigenen Grün-WEP

-- Stand des Bau-WEP vor dem Zusammenführen, damit es rückgängig gemacht werden kann (eigene Tabelle wegen der Zeilengröße).
CREATE TABLE zusammenfuehrungen (
  bau_id TEXT PRIMARY KEY,
  gruen_id TEXT NOT NULL,
  konto_id TEXT NOT NULL,
  am TEXT NOT NULL,
  bau_vorher TEXT NOT NULL
);

INSERT INTO schema_stand (nummer, eingespielt_am) VALUES (5, datetime('now'));
