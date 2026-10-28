-- v2 Paket 1: Konten, Sitzungen, laufende Anmeldungen, Zugriffsprotokoll (docs/PLAN-V2.md).
-- Einspielen: npx wrangler d1 migrations apply wep-v2-vorschau --remote (docs/V2-EINRICHTUNG.md).

-- Ein Konto je Anmeldung bei einem Anbieter (Google: sub; Microsoft: tid:oid).
CREATE TABLE konten (
  id TEXT PRIMARY KEY,                       -- UUID
  anbieter TEXT NOT NULL CHECK (anbieter IN ('google', 'microsoft')),
  subjekt TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'wartet' CHECK (status IN ('wartet', 'freigegeben', 'gesperrt')),
  rollen TEXT NOT NULL DEFAULT '',           -- kommagetrennt: bau | gruen, dazu bv, admin
  mail_benachrichtigung INTEGER NOT NULL DEFAULT 1,
  erstellt_am TEXT NOT NULL,
  geaendert_am TEXT NOT NULL,
  geaendert_von TEXT,                        -- Konto-ID des Admins
  letzte_anmeldung TEXT,
  UNIQUE (anbieter, subjekt)
);

-- Sitzungen: nur der SHA-256-Hash des Tokens, nie das Token selbst.
CREATE TABLE sitzungen (
  token_hash TEXT PRIMARY KEY,
  konto_id TEXT NOT NULL REFERENCES konten (id) ON DELETE CASCADE,
  erstellt_am TEXT NOT NULL,
  laeuft_ab TEXT NOT NULL
);
CREATE INDEX sitzungen_konto ON sitzungen (konto_id);

-- Laufende Anmeldungen (state, nonce, PKCE-Prüfwert), höchstens 10 Minuten gültig.
CREATE TABLE anmeldungen (
  state TEXT PRIMARY KEY,
  anbieter TEXT NOT NULL,
  nonce TEXT NOT NULL,
  verifier TEXT NOT NULL,
  ziel TEXT NOT NULL,
  laeuft_ab TEXT NOT NULL
);

-- Zugriffsprotokoll (Datenschutz): wer hat wann was getan. Ohne WEP-Inhalte.
CREATE TABLE protokoll (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zeit TEXT NOT NULL,
  konto_id TEXT,
  aktion TEXT NOT NULL,
  ziel TEXT,
  details TEXT
);
CREATE INDEX protokoll_zeit ON protokoll (zeit);

-- Stand des Schemas: jede Migration trägt ihre Nummer ein; /api/v2/status zeigt den höchsten Stand.
CREATE TABLE schema_stand (
  nummer INTEGER PRIMARY KEY,
  eingespielt_am TEXT NOT NULL
);
INSERT INTO schema_stand (nummer, eingespielt_am) VALUES (1, datetime('now'));
