// Bildschirmfotos für die Anleitung v2 (docs/anleitung-v2/bilder/) – der Weg Bau → Grün → BV mit Konten und Rollen, in
// der Testumgebung von tools/v2/umgebung.ts (echte Functions, SQLite, nachgebaute Anmeldung). Beispiel-WEP aus
// tools/anleitung/beispiel.ts; alle Namen und Daten sind erfunden.
// Aufruf: npm run anleitung:v2 (danach baut tools/anleitung/pdf.mjs Seite und PDF).
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import type { Page } from 'playwright'
import type { Wep } from '../../src/model/types'
import { ladeKonto } from '../../functions/_lib/v2/konten'
import { speichereWep } from '../../functions/_lib/v2/weps'
import { starteV2Umgebung } from '../v2/umgebung'

const AUSGABE = 'dist-e2e-v2-anleitung'
const ZIEL = 'docs/anleitung-v2/bilder'
const BEISPIEL = `${AUSGABE}-beispiel.json`
mkdirSync(ZIEL, { recursive: true })

execFileSync('npx', ['vite-node', '--config', 'tools/ki-test/vite.config.ts', 'tools/anleitung/beispiel.ts', '--', BEISPIEL], { stdio: 'inherit' })
const beispiel = JSON.parse(readFileSync(BEISPIEL, 'utf-8')) as Wep
const leer = { aussenanlagen: [], aufwuchs: [], beseitigungAA: [], beschreibungAussen: '', beschreibungAufwuchs: '' }
// Bau legt an: Formalien und Bau-Teil; den Grün-Teil erfasst später Grün. Pächterin anders als die Wertermittlerin.
const bauStand: Wep = {
  ...beispiel,
  rolle: 'bau',
  gruen: leer,
  skizze: undefined,
  fotos: [],
  formalien: { ...beispiel.formalien, unterpaechter: 'Paula Pächterin', auftraggeber: 'Paula Pächterin', wertermittlerBaulichkeiten: '', wertermittlerAussenAufwuchs: '' },
}
// Grün hat (wie in v1) schon ein eigenes WEP mit dem Grün-Teil angelegt – ohne Bau-Teil
const { bau: _bau, grundriss: _grundriss, bauExcel: _bauExcel, ...ohneBau } = beispiel
const eigenesGruen: Wep = {
  ...ohneBau,
  id: 'eigen-gruen-1',
  rolle: 'gruen',
  fotos: [],
  formalien: { ...beispiel.formalien, unterpaechter: 'Paula Pächterin', auftraggeber: 'Paula Pächterin', wertermittlerBaulichkeiten: '', wertermittlerAussenAufwuchs: 'Erika Musterfrau' },
}

const u = await starteV2Umgebung({ port: 4199, ausgabe: AUSGABE })
const { URL, db, anmelden, freigeben } = u
const bild = (seite: Page, name: string, ganz = false) => seite.screenshot({ path: `${ZIEL}/${name}.png`, fullPage: ganz })
const kontoId = (email: string) => (db.roh.prepare('SELECT id FROM konten WHERE email = ?').get(email) as { id: string }).id
const zustand = () => (db.roh.prepare('SELECT zustand FROM weps WHERE id = ?').get(beispiel.id) as { zustand: string } | undefined)?.zustand

try {
  const handy = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }
  // 1. Anmelden, wartet auf Freigabe
  const k1 = await u.neuerKontext(handy)
  const s1 = await k1.newPage()
  await s1.goto(URL)
  await s1.getByRole('link', { name: 'Mit Google anmelden' }).waitFor()
  await bild(s1, '01-anmelden')
  await anmelden(s1, 'bert')
  await s1.getByRole('heading', { name: 'Wartet auf Freigabe' }).waitFor()
  await bild(s1, '02-wartet')

  // 2. Admin gibt frei und vergibt Rollen
  const ka = await u.neuerKontext(handy)
  const sa = await ka.newPage()
  await sa.goto(URL)
  await anmelden(sa, 'ada')
  await sa.getByRole('heading', { name: 'Protokolle' }).waitFor()
  for (const p of ['erika', 'bea'] as const) {
    const k = await u.neuerKontext(handy)
    const s = await k.newPage()
    await s.goto(URL)
    await anmelden(s, p)
    await s.getByRole('heading', { name: 'Wartet auf Freigabe' }).waitFor()
    await k.close()
  }
  await sa.getByRole('button', { name: 'Profil und Einstellungen' }).filter({ visible: true }).first().click()
  await sa.getByRole('button', { name: 'Konten verwalten' }).click()
  const zeileBert = sa.locator('.konto-zeile', { hasText: 'Bert Bauer' })
  await zeileBert.getByRole('button', { name: 'Freigeben' }).click()
  await zeileBert.getByText('freigegeben', { exact: true }).waitFor()
  await zeileBert.getByLabel('Wertermittler').selectOption('bau')
  await sa.waitForTimeout(400)
  await zeileBert.scrollIntoViewIfNeeded()
  await bild(sa, '03-konten')
  await freigeben('erika@example.org', ['gruen'])
  await freigeben('bea@bv.example', ['bv'])

  // 3. Bau: WEP liegt auf dem Server (hier direkt angelegt), Liste mit Zustand, Abgabe an Grün; Grün hat ein eigenes WEP
  const erika = (await ladeKonto(db, kontoId('erika@example.org')))!
  await speichereWep(db, erika, eigenesGruen.id, { wep: eigenesGruen, basisRev: 0 })
  const bert = (await ladeKonto(db, kontoId('bert@example.org')))!
  await speichereWep(db, bert, beispiel.id, { wep: bauStand, basisRev: 0 })
  await s1.getByRole('button', { name: 'Erneut prüfen' }).click()
  await s1.getByRole('heading', { name: 'Protokolle' }).waitFor()
  await s1.getByText(/2026-152/).filter({ visible: true }).first().waitFor()
  await s1.getByText(/Abgeglichen um/).filter({ visible: true }).first().waitFor()
  await bild(s1, '04-liste-bau')
  await s1.getByRole('button', { name: /2026-152/ }).first().click()
  await s1.getByRole('button', { name: 'Abgabe' }).filter({ visible: true }).first().click()
  await s1.getByLabel('Grün-Wertermittler').selectOption({ label: 'Erika Musterfrau' })
  await bild(s1, '05-abgabe-an-gruen', true)
  await s1.getByRole('button', { name: 'An Grün abgeben' }).click()
  await s1.getByRole('alertdialog').getByRole('button', { name: 'Abgeben' }).click()
  await s1.getByText('An Erika Musterfrau abgegeben.').waitFor()
  if (zustand() !== 'gruen_in_arbeit') throw new Error('Abgabe an Grün fehlgeschlagen')

  // 4. Grün: Neu für dich, mit dem eigenen WEP zusammenführen (Grün-Teil kommt daraus), an den BV abgeben
  const kg = await u.neuerKontext(handy)
  const sg = await kg.newPage()
  await sg.goto(URL)
  await anmelden(sg, 'erika')
  await sg.getByRole('heading', { name: /Neu für dich/ }).waitFor()
  await bild(sg, '06-neu-fuer-dich')
  await sg.getByRole('button', { name: /2026-152 – Bau-WEP an dich abgegeben/ }).click()
  await sg.getByRole('button', { name: 'Abgabe' }).filter({ visible: true }).first().waitFor()
  const annahme = sg.getByRole('note').filter({ hasText: 'Bau-WEP für dich' })
  await annahme.waitFor()
  await bild(sg, '13-annahme')
  await annahme.getByRole('button', { name: 'Mit meinem WEP zusammenführen …' }).click()
  const dlg = sg.getByRole('dialog', { name: 'Mit eigenem WEP zusammenführen' })
  await dlg.getByText(/Was wird übernommen/).waitFor()
  await bild(sg, '14-zusammenfuehren', true)
  await dlg.getByRole('button', { name: 'Zusammenführen' }).click()
  await dlg.waitFor({ state: 'detached' })
  for (let i = 0; i < 100 && !(db.roh.prepare('SELECT zusammengefuehrt_in FROM weps WHERE id = ?').get(eigenesGruen.id) as { zusammengefuehrt_in: string | null }).zusammengefuehrt_in; i++) await sg.waitForTimeout(100)
  if (!JSON.parse((db.roh.prepare('SELECT daten FROM weps WHERE id = ?').get(beispiel.id) as { daten: string }).daten).gruen.aufwuchs.length) throw new Error('Zusammenführen fehlgeschlagen')
  await sg.getByRole('navigation', { name: 'Abschnitte' }).getByRole('button', { name: 'Aufwuchs' }).click()
  await sg.getByRole('heading', { name: 'Aufwuchs' }).first().waitFor()
  await bild(sg, '07-gruen-teil')
  await sg.getByRole('button', { name: 'Abgabe' }).filter({ visible: true }).first().click()
  await bild(sg, '08-an-den-bv', true)
  await sg.getByRole('button', { name: 'An den BV abgeben' }).click()
  await sg.getByRole('alertdialog').getByRole('button', { name: 'Abgeben' }).click()
  await sg.getByText('An den BV abgegeben.').waitFor()

  // 5. BV: Kontrollseite mit Liste und Detail, Rückfrage an Grün
  const kv = await u.neuerKontext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 })
  const sv = await kv.newPage()
  await sv.goto(`${URL}bv`)
  await anmelden(sv, 'bea')
  const zeile = sv.locator('.bv-zeile', { hasText: '2026-152' })
  await zeile.getByText(/\d,\d{2}\s€/).waitFor({ timeout: 60_000 })
  await bild(sv, '09-bv-liste')
  await zeile.getByRole('button', { name: '2026-152' }).click()
  await sv.getByRole('group', { name: 'Rückfrage an' }).getByRole('button', { name: 'Grün', exact: true }).click()
  await sv.getByLabel(/Notiz \(was soll geklärt werden/).fill('Bitte die Hecke an der Straße ergänzen.')
  await bild(sv, '10-bv-detail')
  await sv.getByRole('button', { name: 'Rückfrage senden' }).click()
  await sv.getByRole('alertdialog').getByRole('button', { name: 'Senden' }).click()
  await sv.getByText('Rückfrage gesendet.').waitFor()

  // 6. Grün sieht die Rückfrage
  await sg.reload()
  await sg.getByRole('heading', { name: 'Protokolle' }).waitFor()
  await sg.getByRole('button', { name: 'Abgleichen' }).filter({ visible: true }).first().click()
  await sg.locator('ul[aria-label="Protokolle"] .zeile', { hasText: '2026-152' }).getByText('Rückfrage').waitFor()
  await sg.getByRole('button', { name: /2026-152/ }).first().click()
  await sg.getByRole('button', { name: 'Abgabe' }).filter({ visible: true }).first().click()
  await sg.getByText(/Hecke an der Straße/).first().waitFor()
  await bild(sg, '11-rueckfrage', true)

  // 7. Profil mit Konto, Rolle und Mail-Benachrichtigung
  await sg.getByRole('button', { name: 'Protokolle' }).first().click()
  await sg.getByRole('button', { name: 'Profil und Einstellungen' }).filter({ visible: true }).first().click()
  await sg.getByText('Benachrichtigungen per E-Mail').scrollIntoViewIfNeeded()
  await bild(sg, '12-profil-konto')
  console.log(`Bilder fertig: ${ZIEL}`)
} finally {
  await u.schliessen()
}
