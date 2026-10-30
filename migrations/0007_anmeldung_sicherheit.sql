-- Sicherheitsprüfung v2, PR B (docs/SICHERHEITSPRUEFUNG-V2.md): bestätigte E-Mail je Konto (M3), Ende von Sitzungen nach
-- Untätigkeit (N6), Begrenzung von Anmeldeversuchen je IP (M5).

-- Hat der Anbieter die Adresse bestätigt? (Google: email_verified; Microsoft: Anmeldeadresse preferred_username)
-- Bestehende Konten gelten bis zur nächsten Anmeldung als unbestätigt.
ALTER TABLE konten ADD COLUMN email_bestaetigt INTEGER NOT NULL DEFAULT 0;

-- Zuletzt benutzt (höchstens einmal am Tag aufgefrischt); bestehende Sitzungen zählen ab jetzt.
ALTER TABLE sitzungen ADD COLUMN zuletzt_genutzt TEXT;
UPDATE sitzungen SET zuletzt_genutzt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

-- Zähler je Bereich und IP (nur der SHA-256-Hash, nie die Adresse) mit Ablauf des Zeitfensters.
CREATE TABLE begrenzung (
  schluessel TEXT PRIMARY KEY,
  anzahl INTEGER NOT NULL,
  bis TEXT NOT NULL
);

INSERT INTO schema_stand (nummer, eingespielt_am) VALUES (7, datetime('now'));
