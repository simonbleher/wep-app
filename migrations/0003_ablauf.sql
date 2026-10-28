-- v2 Paket 3: Ablauf eines WEP – Rückfrage des BV (an wen, wer gerade dran ist, Notiz).
ALTER TABLE weps ADD COLUMN rueckfrage_an TEXT;      -- 'bau' | 'gruen' | 'beide'
ALTER TABLE weps ADD COLUMN rueckfrage_bei TEXT;     -- wer gerade bearbeitet: 'bau' | 'gruen'
ALTER TABLE weps ADD COLUMN rueckfrage_notiz TEXT;
ALTER TABLE weps ADD COLUMN rueckfrage_am TEXT;
ALTER TABLE weps ADD COLUMN rueckfrage_von TEXT;     -- Konto-ID (BV)

INSERT INTO schema_stand (nummer, eingespielt_am) VALUES (3, datetime('now'));
