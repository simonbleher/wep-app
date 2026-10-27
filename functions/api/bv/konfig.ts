// GET /api/bv/konfig – Ist die Zugangskontrolle der BV-Kontrollseite eingeschaltet? (ohne Anmeldung abrufbar)
import { aktiv, antwort, type BvKontext } from '../../_lib/bvZugang'

export const onRequestGet = async ({ env }: BvKontext): Promise<Response> => antwort(200, { aktiv: aktiv(env) })
