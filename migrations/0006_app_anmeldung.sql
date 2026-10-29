-- v2 Paket 8: Anmeldung der Android- und Windows-App über den Systembrowser (docs/PLAN-V2.md).
-- Laufende Anmeldung aus einer App: PKCE-Prüfwert und state der App, Rücksprung in die App, Gerät (JSON).
ALTER TABLE anmeldungen ADD COLUMN app TEXT;

-- Einmal-Codes für die App: höchstens 60 Sekunden gültig, nur einmal einlösbar, nur mit dem passenden PKCE-Verifier.
CREATE TABLE app_codes (
  code_hash TEXT PRIMARY KEY,
  konto_id TEXT NOT NULL,
  challenge TEXT NOT NULL,
  geraet TEXT NOT NULL,
  laeuft_ab TEXT NOT NULL
);

-- Woher eine Sitzung kommt: browser | android | windows (alte Sitzungen: Browser).
ALTER TABLE sitzungen ADD COLUMN geraet TEXT NOT NULL DEFAULT 'browser';

INSERT INTO schema_stand (nummer, eingespielt_am) VALUES (6, datetime('now'));
