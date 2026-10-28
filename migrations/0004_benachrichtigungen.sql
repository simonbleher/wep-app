-- v2 Paket 5: Benachrichtigungen („Neu für dich“ in der App, E-Mail über Resend).
CREATE TABLE benachrichtigungen (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  konto_id TEXT NOT NULL,
  wep_id TEXT NOT NULL,
  art TEXT NOT NULL,                 -- an_dich | beim_bv | rueckfrage | geprueft | wiederoeffnet
  zeit TEXT NOT NULL,
  vorgangs_nr TEXT NOT NULL DEFAULT '',
  anlage TEXT NOT NULL DEFAULT '',
  parzelle TEXT NOT NULL DEFAULT '',
  gelesen_am TEXT,
  mail TEXT NOT NULL DEFAULT 'offen', -- offen | gesendet | aus | fehler
  mail_fehler TEXT
);
CREATE INDEX benachrichtigungen_konto ON benachrichtigungen (konto_id, zeit);

INSERT INTO schema_stand (nummer, eingespielt_am) VALUES (4, datetime('now'));
