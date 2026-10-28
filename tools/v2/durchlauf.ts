// Durchlauf v2 im echten Browser (Chromium) gegen den echten Server-Code (Umgebung: tools/v2/umgebung.ts) – der ganze
// Weg mit drei Testkonten Bau (Bert), Grün (Erika) und BV (Bea), dazu Admin (Ada) und ein gesperrtes Konto (Max):
// Anmeldung und Freigabe, WEPs auf zwei Geräten, ohne Netz, Fotos, Abgabe Bau → Grün → BV, Rückfrage an Grün und an
// beide, geprüft, wieder geöffnet, Benachrichtigungen in der App und per Mail. Alle Namen und Daten sind erfunden.
//
// Start: npm run v2:durchlauf
import { readFileSync } from 'node:fs'
import type { Page } from 'playwright'
import type { Wep } from '../../src/model/types'
// @ts-expect-error – JavaScript-Hilfe ohne Typen (gemaltes Testbild, kein echtes Foto)
import { testFoto } from '../fotos/testbild.mjs'
import { fuehreAdminAktionAus, ladeKonto } from '../../functions/_lib/v2/konten'
import { starteV2Umgebung } from './umgebung'

const AUSGABE = 'dist-e2e-v2'
const u = await starteV2Umgebung({ port: 4183, ausgabe: AUSGABE })
const { URL, db, r2, mails, anmelden } = u

let fehler = 0
function pruefe(ok: boolean, text: string) {
  console.log(`${ok ? 'ok ' : 'FEHLER'} ${text}`)
  if (!ok) fehler++
}

async function neuesWep(seite: Page, nr: string) {
  await seite.getByRole('button', { name: 'Neues WEP', exact: true }).first().click()
  const dlg = seite.getByRole('dialog', { name: 'Neues WEP' })
  await dlg.getByLabel(/Vorgangs-Nr/).fill(nr)
  await dlg.getByRole('button', { name: 'Anlegen' }).click()
  await seite.getByLabel(/Kleingartenanlage/).first().waitFor()
}
const skriptFehler: string[] = []
try {
  const kontext = await u.neuerKontext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  const seite = await kontext.newPage()
  seite.on('pageerror', (e) => skriptFehler.push(String(e)))

  // 1. Anmelde-Bildschirm
  await seite.goto(URL)
  await seite.getByRole('heading', { name: 'WEP-App' }).waitFor()
  pruefe(await seite.getByRole('link', { name: 'Datenschutzerklärung' }).isVisible(), 'Anmeldeseite verlinkt die Datenschutzerklärung')
  for (const pfad of ['datenschutz', 'nutzungsbedingungen']) {
    const antwort = await seite.request.get(`${URL}${pfad}.html`)
    pruefe(antwort.ok() && (await antwort.text()).includes('Entwurf – rechtlich noch nicht geprüft'), `/${pfad} ohne Anmeldung erreichbar, als Entwurf markiert`)
    pruefe(readFileSync(`${AUSGABE}/sw.js`, 'utf-8').includes(`${pfad}.html`), `/${pfad} im Service Worker (Precache) enthalten`)
  }
  pruefe((await seite.getByRole('note').count()) === 0, 'im Browser kein Hinweis-Band (kein Vorschau-Band mehr)')
  pruefe(await seite.getByRole('link', { name: 'Mit Google anmelden' }).isVisible(), 'Anmeldung mit Google angeboten')
  pruefe(await seite.getByRole('link', { name: 'Mit Microsoft anmelden' }).isVisible(), 'Anmeldung mit Microsoft angeboten')
  pruefe((await seite.getByText('Ohne Konto fortfahren').count()) === 0, 'kein „Ohne Konto fortfahren“ im Server-Modus')
  await seite.screenshot({ path: `${AUSGABE}/01-anmeldung.png` })

  // 1b. Windows-App (Tauri, hier nachgestellt) mit demselben Web-Paket: v1 ohne Server, Hinweis „im Browser nutzen“
  {
    const kw = await u.neuerKontext({ viewport: { width: 1024, height: 768 }, serviceWorkers: 'block' })
    await kw.addInitScript(() => Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {} }))
    const sw = await kw.newPage()
    const v2Aufrufe: string[] = []
    sw.on('request', (r) => r.url().includes('/api/v2/') && v2Aufrufe.push(r.url()))
    await sw.goto(URL)
    const band = sw.getByRole('note').filter({ hasText: 'bitte im Browser nutzen' })
    await band.waitFor()
    pruefe(await band.getByRole('link', { name: 'wep-pankow.pages.dev' }).isVisible(), 'Windows-App: Hinweis „bitte im Browser nutzen“ mit Link')
    pruefe((await sw.getByRole('link', { name: 'Mit Google anmelden' }).count()) === 0, 'Windows-App: keine Server-Anmeldung, die App bleibt v1')
    await sw.waitForTimeout(500)
    pruefe(v2Aufrufe.length === 0, 'Windows-App: keine Anfragen an /api/v2')
    await sw.screenshot({ path: `${AUSGABE}/01b-windows-app.png` })
    await kw.close()
  }

  // 2. Neues Konto (Microsoft) wartet auf Freigabe
  await anmelden(seite, 'max')
  await seite.getByRole('heading', { name: 'Wartet auf Freigabe' }).waitFor()
  pruefe(await seite.getByText(/max@bv\.example/).isVisible(), 'Max: Konto angelegt, wartet auf Freigabe')
  await seite.screenshot({ path: `${AUSGABE}/02-wartet.png` })
  await seite.getByRole('button', { name: 'Abmelden' }).click()
  await seite.getByRole('link', { name: 'Mit Google anmelden' }).waitFor()

  // 3. Erster Admin (V2_ADMINS) kommt direkt in die App, ohne OneDrive
  await anmelden(seite, 'ada')
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  pruefe(true, 'Ada (erster Admin) landet direkt auf der Startseite')
  await seite.getByRole('button', { name: 'Profil und Einstellungen' }).filter({ visible: true }).first().click()
  await seite.getByRole('heading', { name: 'Profil und Einstellungen' }).waitFor()
  pruefe(await seite.getByText('Angemeldet als Ada Admin (ada@example.org) über Google').isVisible(), 'Profil: angemeldet über Google')
  pruefe(await seite.getByText('Rollen: Admin').isVisible(), 'Profil: Rolle Admin')
  pruefe((await seite.getByRole('button', { name: 'Mit Microsoft anmelden' }).count()) === 0, 'Profil: keine OneDrive-Anmeldung im Server-Modus')
  // Anleitung v2 (eigene Seite public/anleitung-v2/), „Zurück zur App“ führt zurück
  await seite.getByRole('link', { name: 'Anleitung' }).click()
  await seite.getByRole('heading', { name: 'Überblick: wer macht was' }).waitFor()
  pruefe((await seite.locator('img').evaluateAll((bilder) => bilder.filter((b) => !(b as HTMLImageElement).complete || (b as HTMLImageElement).naturalWidth === 0).length)) === 0, 'Anleitung v2: öffnet sich aus dem Profil, alle Bilder geladen')
  await seite.getByRole('link', { name: /Zurück zur App/ }).click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  await seite.getByRole('button', { name: 'Profil und Einstellungen' }).filter({ visible: true }).first().click()
  await seite.getByRole('heading', { name: 'Profil und Einstellungen' }).waitFor()

  // 4. Mail-Benachrichtigung abschalten (bleibt auf dem Server)
  const mail = seite.getByLabel('Benachrichtigungen per E-Mail')
  pruefe(await mail.isChecked(), 'Mail-Benachrichtigung ist standardmäßig an')
  await mail.click()
  await seite.waitForTimeout(300)
  pruefe((db.roh.prepare("SELECT mail_benachrichtigung AS m FROM konten WHERE email = 'ada@example.org'").get() as { m: number }).m === 0, 'Mail-Benachrichtigung auf dem Server abgeschaltet')

  // 5. Konten verwalten: Max freigeben, Grün + BV
  await seite.getByRole('button', { name: 'Konten verwalten' }).click()
  await seite.getByRole('heading', { name: 'Konten verwalten' }).waitFor()
  const maxZeile = seite.locator('.konto-zeile', { hasText: 'Max Mustermann' })
  await maxZeile.waitFor()
  pruefe(await maxZeile.getByText('wartet auf Freigabe').isVisible(), 'Konten: Max wartet auf Freigabe')
  pruefe((await seite.locator('.konto-zeile').first().textContent())?.includes('Max Mustermann') ?? false, 'Konten: wartende stehen oben')
  await maxZeile.getByRole('button', { name: 'Freigeben' }).click()
  await maxZeile.getByText('freigegeben', { exact: true }).waitFor()
  pruefe(await maxZeile.getByText(/Noch ohne Rolle/).isVisible(), 'Konten: Hinweis „noch ohne Rolle“')
  await maxZeile.getByLabel('Wertermittler').selectOption('gruen')
  await seite.waitForTimeout(300)
  // Die Haken folgen der Antwort des Servers
  await maxZeile.getByLabel('BV').click()
  await maxZeile.locator('input[type=checkbox]:checked').waitFor()
  pruefe((db.roh.prepare("SELECT rollen FROM konten WHERE email = 'max@bv.example'").get() as { rollen: string }).rollen === 'gruen,bv', 'Konten: Max ist Grün und BV (auf dem Server)')
  const adaZeile = seite.locator('.konto-zeile', { hasText: 'Ada Admin' })
  pruefe(await adaZeile.getByLabel('Admin').isDisabled(), 'Konten: eigene Admin-Rolle nicht abwählbar')
  pruefe((await adaZeile.getByRole('button', { name: 'Sperren' }).count()) === 0, 'Konten: eigenes Konto nicht sperrbar')
  await seite.screenshot({ path: `${AUSGABE}/03-konten.png`, fullPage: true })

  // 6. Abmelden, Max meldet sich an und kommt in die App
  await seite.getByRole('button', { name: 'Profil', exact: true }).first().click()
  await seite.getByRole('heading', { name: 'Profil und Einstellungen' }).waitFor()
  await seite.getByRole('button', { name: 'Abmelden' }).click()
  await anmelden(seite, 'max')
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  await seite.getByRole('button', { name: 'Profil und Einstellungen' }).filter({ visible: true }).first().click()
  pruefe(await seite.getByText('Rollen: Grün, BV').isVisible(), 'Max: freigegeben mit Rollen Grün, BV')
  pruefe((await seite.getByRole('button', { name: 'Konten verwalten' }).count()) === 0, 'Max: keine Konten-Verwaltung (kein Admin)')

  // 7. Ohne Verbindung zum Server: Start mit dem zuletzt bestätigten Konto
  u.setzeServerWeg(true)
  await seite.reload()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  await seite.getByRole('button', { name: 'Profil und Einstellungen' }).filter({ visible: true }).first().click()
  pruefe(await seite.getByText(/Ohne Verbindung zum Server/).isVisible(), 'ohne Netz: App startet mit gemerktem Konto')
  u.setzeServerWeg(false)

  // 8. Gesperrt: Sitzung endet, neue Anmeldung wird abgewiesen
  const adaId = (db.roh.prepare("SELECT id FROM konten WHERE email = 'ada@example.org'").get() as { id: string }).id
  const maxId = (db.roh.prepare("SELECT id FROM konten WHERE email = 'max@bv.example'").get() as { id: string }).id
  await fuehreAdminAktionAus(db, (await ladeKonto(db, adaId))!, (await ladeKonto(db, maxId))!, { aktion: 'sperren' })
  await seite.reload()
  await seite.getByRole('link', { name: 'Mit Microsoft anmelden' }).waitFor()
  pruefe(true, 'gesperrt: Sitzung beendet, zurück zur Anmeldung')
  await anmelden(seite, 'max')
  await seite.getByText(/Das Konto ist gesperrt/).waitFor()
  pruefe(true, 'gesperrt: Anmeldung zeigt „Das Konto ist gesperrt“')
  pruefe(!seite.url().includes('anmeldefehler'), 'Meldung aus der Adresse entfernt')

  // 9. WEPs auf dem Server: Bert (Bau) legt an, sein zweites Gerät bekommt es; ohne Server wartet die Änderung
  await anmelden(seite, 'bert')
  await seite.getByRole('heading', { name: 'Wartet auf Freigabe' }).waitFor()
  const bertId = (db.roh.prepare("SELECT id FROM konten WHERE email = 'bert@example.org'").get() as { id: string }).id
  const ada = (await ladeKonto(db, adaId))!
  await fuehreAdminAktionAus(db, ada, (await ladeKonto(db, bertId))!, { aktion: 'freigeben' })
  await fuehreAdminAktionAus(db, ada, (await ladeKonto(db, bertId))!, { aktion: 'rollen', rollen: ['bau'] })
  await seite.getByRole('button', { name: 'Erneut prüfen' }).click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  await neuesWep(seite, '2026-0815')
  await seite.getByRole('button', { name: 'Protokolle' }).first().click()
  await seite.getByRole('heading', { name: 'Protokolle' }).waitFor()
  const aufServer = async (n: number) => {
    for (let i = 0; i < 50; i++) {
      if ((db.roh.prepare('SELECT count(*) AS n FROM weps').get() as { n: number }).n === n) return true
      await seite.waitForTimeout(100)
    }
    return false
  }
  pruefe(await aufServer(1), 'WEP nach dem Anlegen auf dem Server')
  pruefe((db.roh.prepare('SELECT vorgangs_nr, bau_konto, zustand FROM weps').get() as { vorgangs_nr: string; bau_konto: string; zustand: string }).bau_konto === bertId, 'Server: Bert ist Besitzer, Zustand „bau_in_arbeit“')
  await seite.getByText(/Abgeglichen um/).filter({ visible: true }).first().waitFor()
  pruefe(true, 'Statuszeile: mit dem Server abgeglichen')
  pruefe(await seite.locator('.zeile', { hasText: '2026-0815' }).getByText('Bau', { exact: true }).isVisible(), 'neues WEP ist ein Bau-WEP (Rolle vom Server)')

  const geraetB = await u.neuerKontext({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'block' })
  const seiteB = await geraetB.newPage()
  seiteB.on('pageerror', (e) => skriptFehler.push(String(e)))
  await seiteB.goto(URL)
  await anmelden(seiteB, 'bert')
  await seiteB.getByRole('heading', { name: 'Protokolle' }).first().waitFor()
  await seiteB.getByText(/2026-0815/).filter({ visible: true }).first().waitFor()
  pruefe(true, 'zweites Gerät (Tablet): WEP vom Server ist da')
  await seiteB.screenshot({ path: `${AUSGABE}/04-zweites-geraet.png` })

  u.setzeServerWeg(true)
  await neuesWep(seite, '2026-0816')
  await seite.getByRole('button', { name: 'Protokolle' }).first().click()
  await seite.getByText(/1 Änderung wartet auf den Server/).filter({ visible: true }).first().waitFor()
  pruefe(true, 'ohne Server: neues WEP wartet („1 Änderung wartet auf den Server“)')
  u.setzeServerWeg(false)
  await seite.getByRole('button', { name: 'Abgleichen' }).filter({ visible: true }).first().click()
  pruefe(await aufServer(2), 'Server wieder da: wartende Änderung hochgeladen')
  await seiteB.getByRole('button', { name: 'Abgleichen' }).filter({ visible: true }).first().click()
  await seiteB.getByText(/2026-0816/).filter({ visible: true }).first().waitFor()
  pruefe(true, 'zweites Gerät bekommt auch das zweite WEP')

  // 10. Foto: auf Gerät A aufgenommen, liegt danach auf dem Server und erscheint auf Gerät B
  await seite.getByRole('button', { name: /2026-0815/ }).first().click()
  await seite.getByRole('navigation', { name: 'Abschnitte' }).getByRole('button', { name: 'Fotos' }).click()
  await seite.locator('input[type=file][aria-label="Fotos aus der Galerie wählen: Gesamtansicht"]').setInputFiles({ name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: testFoto({ breite: 1600, hoehe: 1200, variante: 0 }) })
  await seite.locator('.foto-kachel').first().waitFor({ timeout: 30000 })
  await seite.getByRole('button', { name: 'Protokolle' }).first().click()
  await seite.getByRole('button', { name: 'Abgleichen' }).filter({ visible: true }).first().click()
  let fotoAufServer = false
  for (let i = 0; i < 50 && !fotoAufServer; i++) {
    fotoAufServer = [...r2.daten.keys()].some((k) => /^weps\/[^/]+\/fotos\/.+\.jpg$/.test(k))
    if (!fotoAufServer) await seite.waitForTimeout(100)
  }
  pruefe(fotoAufServer, 'Foto nach dem Abgleich auf dem Server (R2)')
  await seiteB.getByRole('button', { name: 'Abgleichen' }).filter({ visible: true }).first().click()
  await seiteB.waitForTimeout(500)
  await seiteB.getByRole('button', { name: /2026-0815/ }).first().click()
  await seiteB.getByRole('button', { name: 'Fotos', exact: true }).filter({ visible: true }).first().click()
  await seiteB.locator('.foto-kachel img').first().waitFor({ timeout: 15000 })
  pruefe(true, 'zweites Gerät lädt das Foto vom Server')
  await seiteB.screenshot({ path: `${AUSGABE}/05-foto-vom-server.png` })

  // 11. Ablauf: Bert gibt an Erika (Grün) ab, Erika bearbeitet nur den Grün-Teil und gibt an den BV ab
  // Erikas eigenes WEP trägt dieselbe Vorgangs-Nr.: gemeint ist das Bau-WEP (mitBau), sonst irgendeines mit der Nummer
  const zustandVon = (nr: string, mitBau = true) =>
    (db.roh.prepare(`SELECT zustand FROM weps WHERE vorgangs_nr = ? ${mitBau ? 'AND bau_konto IS NOT NULL' : ''}`).get(nr) as { zustand: string }).zustand
  const bauDaten = () => JSON.parse((db.roh.prepare("SELECT daten FROM weps WHERE vorgangs_nr = '2026-0815' AND bau_konto IS NOT NULL").get() as { daten: string }).daten) as Wep
  const eigenesErika = () => db.roh.prepare("SELECT id, zusammengefuehrt_in FROM weps WHERE vorgangs_nr = '2026-0815' AND bau_konto IS NULL").get() as { id: string; zusammengefuehrt_in: string | null } | undefined
  const warteAuf = async (bedingung: () => boolean) => {
    for (let i = 0; i < 100; i++) {
      if (bedingung()) return true
      await seiteE.waitForTimeout(100)
    }
    return false
  }
  const erikaKontext = await u.neuerKontext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  const seiteE = await erikaKontext.newPage()
  seiteE.on('pageerror', (e) => skriptFehler.push(String(e)))
  await seiteE.goto(URL)
  await anmelden(seiteE, 'erika')
  await seiteE.getByRole('heading', { name: 'Wartet auf Freigabe' }).waitFor()
  const erikaId = (db.roh.prepare("SELECT id FROM konten WHERE email = 'erika@example.org'").get() as { id: string }).id
  await fuehreAdminAktionAus(db, ada, (await ladeKonto(db, erikaId))!, { aktion: 'freigeben' })
  await fuehreAdminAktionAus(db, ada, (await ladeKonto(db, erikaId))!, { aktion: 'rollen', rollen: ['gruen'] })
  await seiteE.getByRole('button', { name: 'Erneut prüfen' }).click()
  await seiteE.getByRole('heading', { name: 'Protokolle' }).waitFor()
  pruefe((await seiteE.getByText(/2026-0815/).count()) === 0, 'Grün sieht Berts Entwurf nicht')

  // 11a. Erika legt (wie in v1) ein eigenes WEP an und erfasst den Grün-Teil schon vor der Abgabe von Bert
  await neuesWep(seiteE, '2026-0815')
  const navEigen = await seiteE.getByRole('navigation', { name: 'Abschnitte' }).getByRole('button').allTextContents()
  pruefe(navEigen.some((t) => /Formalien/.test(t)) && navEigen.some((t) => /Aufwuchs/.test(t)) && !navEigen.some((t) => /Bauten|Mängel/.test(t)), `Grün: eigenes WEP mit Formalien und Grün-Teil, ohne Bau-Teil (${navEigen.join(', ')})`)
  await seiteE.getByLabel(/^Unterpächter/).first().fill('Paula Pächterin')
  await seiteE.getByRole('navigation', { name: 'Abschnitte' }).getByRole('button', { name: 'Aufwuchs' }).click()
  await seiteE.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await seiteE.getByRole('button', { name: 'Eigene Position (Freitext)' }).click()
  await seiteE.getByLabel(/^Bezeichnung/).fill('Liguster-Hecke')
  await seiteE.getByRole('button', { name: 'Überschreiben' }).click()
  await seiteE.getByLabel('Einzelpreis').fill('30')
  await seiteE.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await seiteE.getByText('1 Position').first().waitFor()
  await seiteE.getByRole('button', { name: 'Protokolle' }).first().click()
  pruefe(await warteAuf(() => JSON.parse((db.roh.prepare("SELECT daten FROM weps WHERE vorgangs_nr = '2026-0815' AND bau_konto IS NULL").get() as { daten: string } | undefined)?.daten ?? '{}').gruen?.aufwuchs?.length === 1), 'Server: Erikas eigenes WEP (ohne Bau-Konto) mit dem Grün-Teil')
  pruefe((db.roh.prepare("SELECT zustand, gruen_konto FROM weps WHERE bau_konto IS NULL").get() as { zustand: string; gruen_konto: string }).gruen_konto === erikaId, 'Server: Erika ist Besitzerin, Zustand „gruen_in_arbeit“')
  await seite.getByRole('button', { name: 'Abgleichen' }).filter({ visible: true }).first().click()
  await seite.getByText(/Abgeglichen um/).filter({ visible: true }).first().waitFor()
  pruefe((await seite.locator('ul[aria-label="Protokolle"] .zeile', { hasText: '2026-0815' }).count()) === 1, 'Bau sieht Erikas eigenes WEP nicht')

  await seite.getByRole('button', { name: /2026-0815/ }).first().click()
  await seite.getByRole('button', { name: 'Abgabe' }).filter({ visible: true }).first().click()
  await seite.getByRole('heading', { name: 'Abgabe' }).waitFor()
  await seite.getByLabel('Grün-Wertermittler').selectOption({ label: 'Erika Musterfrau' })
  await seite.screenshot({ path: `${AUSGABE}/06-abgabe-an-gruen.png`, fullPage: true })
  await seite.getByRole('button', { name: 'An Grün abgeben' }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'Abgeben' }).click()
  await seite.getByText('An Erika Musterfrau abgegeben.').waitFor()
  pruefe(zustandVon('2026-0815') === 'gruen_in_arbeit', 'Server: nach der Abgabe „gruen_in_arbeit“')
  const formalienServer = bauDaten().formalien
  pruefe(formalienServer.wertermittlerBaulichkeiten === 'Bert Bauer' && formalienServer.wertermittlerAussenAufwuchs === 'Erika Musterfrau', `Formalien: Wertermittler Bau/Grün sind Bert und Erika (${formalienServer.wertermittlerBaulichkeiten} / ${formalienServer.wertermittlerAussenAufwuchs}) – auch wenn vorher eine andere Person auf dem Gerät angemeldet war`)
  pruefe(await seite.getByText(/Das WEP ist abgegeben\. Du kannst es nur noch lesen/).isVisible(), 'Bau: nach der Abgabe nur noch lesen')
  const navBau = seite.getByRole('navigation', { name: 'Abschnitte' })
  pruefe((await navBau.getByRole('button').allTextContents()).join('|') === 'Übersicht', 'Bau: nach der Abgabe nur die Übersicht')

  // Benachrichtigung: Mail an Erika (nur Vorgangs-Nr., Anlage, Parzelle, Link) und „Neu für dich“ in der App
  const mailErika = mails.find((m) => m.to.includes('erika@example.org'))
  pruefe(Boolean(mailErika?.subject.includes('2026-0815 – Bau-WEP an dich abgegeben')) && /\?wep=/.test(mailErika?.text ?? '') && !/Bert|€/.test(mailErika?.text ?? ''), 'Mail an Grün: Vorgangs-Nr., Link, keine Namen oder Beträge')
  await seiteE.reload()
  await seiteE.getByRole('heading', { name: /Neu für dich \(1\)/ }).waitFor()
  await seiteE.screenshot({ path: `${AUSGABE}/06b-neu-fuer-dich.png` })
  await seiteE.getByRole('button', { name: /2026-0815 – Bau-WEP an dich abgegeben/ }).click()
  await seiteE.getByRole('button', { name: 'Abgabe' }).filter({ visible: true }).first().waitFor()
  pruefe(true, 'Grün: „Neu für dich“ öffnet das WEP (vorher abgeglichen)')

  // 11b. Erika nimmt das Bau-WEP an und führt es mit ihrem eigenen WEP zusammen (Vorschau, Stammdaten je Feld)
  const annahme = seiteE.getByRole('note').filter({ hasText: 'Bau-WEP für dich – mit deinem eigenen WEP zusammenführen?' })
  await annahme.waitFor()
  pruefe(await annahme.getByText(/gleiche Vorgangs-Nr\./).isVisible(), 'Annahme: eigenes WEP mit gleicher Vorgangs-Nr. wird vorgeschlagen')
  await seiteE.screenshot({ path: `${AUSGABE}/06c-annahme.png`, fullPage: true })
  await annahme.getByRole('button', { name: 'Mit meinem WEP zusammenführen …' }).click()
  const dlgZ = seiteE.getByRole('dialog', { name: 'Mit eigenem WEP zusammenführen' })
  pruefe(await dlgZ.getByText(/Aus deinem WEP: 0 Außenanlagen, 1 Aufwuchs/).isVisible(), 'Vorschau: was übernommen wird')
  pruefe(await dlgZ.getByRole('checkbox', { name: /Unterpächter/ }).isChecked(), 'Vorschau: im Bau-WEP leeres Stammdaten-Feld ist zum Übernehmen vorgewählt')
  await seiteE.screenshot({ path: `${AUSGABE}/06d-zusammenfuehren.png`, fullPage: true })
  await dlgZ.getByRole('button', { name: 'Zusammenführen' }).click()
  await dlgZ.waitFor({ state: 'detached' })
  pruefe(await warteAuf(() => eigenesErika()?.zusammengefuehrt_in != null), 'Server: Erikas eigenes WEP ist als „zusammengeführt“ markiert (nicht gelöscht)')
  const nachher = bauDaten()
  pruefe(nachher.gruen.aufwuchs.length === 1 && nachher.formalien.unterpaechter === 'Paula Pächterin', 'Server: Bau-WEP hat jetzt Erikas Grün-Teil und den übernommenen Unterpächter')
  pruefe((await annahme.count()) === 0, 'Annahme-Hinweis verschwindet nach dem Zusammenführen')
  await seiteE.getByRole('button', { name: 'Protokolle' }).first().click()
  await seiteE.locator('ul[aria-label="Protokolle"] .zeile', { hasText: '2026-0815' }).getByText('Grün in Arbeit').waitFor()
  pruefe(true, 'Grün: WEP ist da, Zustand „Grün in Arbeit“')
  pruefe((await seiteE.getByRole('heading', { name: /Neu für dich/ }).count()) === 0, 'Grün: Benachrichtigung ist gelesen')
  // Link aus der Mail öffnet das WEP direkt
  await seiteE.goto(new globalThis.URL(/Öffnen: (\S+)/.exec(mailErika!.text)![1].replace(/^https?:\/\/[^/]+/, URL.replace(/\/$/, ''))).toString())
  await seiteE.getByRole('button', { name: 'Abgabe' }).filter({ visible: true }).first().waitFor()
  pruefe(!seiteE.url().includes('wep='), 'Link aus der Mail öffnet das WEP (Adresse bereinigt)')
  const navGruen = await seiteE.getByRole('navigation', { name: 'Abschnitte' }).getByRole('button').allTextContents()
  pruefe(!navGruen.some((t) => /Formalien|Bauten|Mängel/.test(t)) && navGruen.some((t) => /Aufwuchs/.test(t)) && navGruen.some((t) => /Übersicht/.test(t)), `Grün: nur Grün-Teil und Übersicht (${navGruen.join(', ')})`)
  await seiteE.getByRole('button', { name: 'Abgabe' }).filter({ visible: true }).first().click()
  // Rückgängig (solange nicht an den BV abgegeben) und noch einmal zusammenführen – diesmal aus dem Reiter „Abgabe“
  await seiteE.getByText(/Mit deinem WEP 2026-0815 zusammengeführt am/).waitFor()
  await seiteE.getByRole('button', { name: 'Zusammenführen rückgängig machen' }).click()
  await seiteE.getByRole('alertdialog').getByRole('button', { name: 'Rückgängig machen' }).click()
  await seiteE.getByRole('status').filter({ hasText: 'Zusammenführen rückgängig gemacht' }).waitFor()
  pruefe(eigenesErika()?.zusammengefuehrt_in == null && bauDaten().gruen.aufwuchs.length === 0, 'Rückgängig: Bau-WEP wie vorher, Erikas eigenes WEP wieder da')
  await seiteE.getByRole('button', { name: 'Mit eigenem WEP zusammenführen …' }).click()
  await seiteE.getByRole('dialog', { name: 'Mit eigenem WEP zusammenführen' }).getByRole('button', { name: 'Zusammenführen' }).click()
  await seiteE.getByRole('status').filter({ hasText: 'Zusammengeführt.' }).waitFor()
  pruefe(await warteAuf(() => eigenesErika()?.zusammengefuehrt_in != null && bauDaten().gruen.aufwuchs.length === 1), 'noch einmal zusammengeführt')
  await seiteE.getByRole('button', { name: 'Protokolle' }).first().click()
  const zeilen0815 = seiteE.locator('ul[aria-label="Protokolle"] .zeile', { hasText: '2026-0815' })
  for (let i = 0; i < 50 && (await zeilen0815.count()) !== 1; i++) await seiteE.waitForTimeout(100)
  pruefe((await zeilen0815.count()) === 1, 'Grün: nur noch ein WEP 2026-0815 in der Liste')
  await seiteE.getByRole('button', { name: /2026-0815/ }).first().click()
  await seiteE.getByRole('button', { name: 'Abgabe' }).filter({ visible: true }).first().click()
  await seiteE.getByRole('button', { name: 'An den BV abgeben' }).click()
  await seiteE.getByRole('alertdialog').getByRole('button', { name: 'Abgeben' }).click()
  await seiteE.getByText('An den BV abgegeben.').waitFor()
  pruefe(zustandVon('2026-0815') === 'beim_bv', 'Server: nach Grüns Abgabe „beim_bv“')
  pruefe((await seiteE.getByRole('button', { name: 'Zusammenführen rückgängig machen' }).count()) === 0, 'nach der Abgabe an den BV kein „Rückgängig“ mehr')
  await seiteE.screenshot({ path: `${AUSGABE}/07-an-bv-abgegeben.png`, fullPage: true })
  const verlaufAblauf = (db.roh.prepare("SELECT v.aktion, v.zustand_nachher AS nachher FROM verlauf v JOIN weps w ON w.id = v.wep_id WHERE w.vorgangs_nr = '2026-0815' AND w.bau_konto IS NOT NULL ORDER BY v.id").all() as { aktion: string; nachher: string | null }[])
    .filter((v) => v.nachher)
    .map((v) => `${v.aktion}→${v.nachher}`)
  pruefe(verlaufAblauf.join(' ') === 'angelegt→bau_in_arbeit an_gruen→gruen_in_arbeit an_bv→beim_bv', `Verlauf mit Zuständen: ${verlaufAblauf.join(' ')}`)
  await seite.getByRole('button', { name: 'Protokolle' }).first().click()
  await seite.getByRole('button', { name: 'Abgleichen' }).filter({ visible: true }).first().click()
  await seite.locator('ul[aria-label="Protokolle"] .zeile', { hasText: '2026-0815' }).getByText('beim BV').waitFor()
  pruefe(true, 'Bau: Liste zeigt „beim BV“')

  // 12. BV-Kontrollseite mit Server-Daten: Rückfrage an Grün, Grün gibt wieder ab, geprüft, wieder öffnen
  const beaKontext = await u.neuerKontext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: true })
  const seiteV = await beaKontext.newPage()
  seiteV.on('pageerror', (e) => skriptFehler.push(String(e)))
  await seiteV.goto(`${URL}bv`)
  await anmelden(seiteV, 'bea')
  pruefe(!mails.some((m) => m.to.includes('bea@bv.example')), 'BV-Mail erst, wenn das Konto die Rolle BV hat')
  await seiteV.getByRole('heading', { name: 'Wartet auf Freigabe' }).waitFor()
  pruefe(seiteV.url().endsWith('/bv'), 'BV: nach der Anmeldung zurück auf /bv')
  const beaId = (db.roh.prepare("SELECT id FROM konten WHERE email = 'bea@bv.example'").get() as { id: string }).id
  await fuehreAdminAktionAus(db, ada, (await ladeKonto(db, beaId))!, { aktion: 'freigeben' })
  await fuehreAdminAktionAus(db, ada, (await ladeKonto(db, beaId))!, { aktion: 'rollen', rollen: ['bv'] })
  await seiteV.getByRole('button', { name: 'Erneut prüfen' }).click()
  await seiteV.getByRole('heading', { name: 'Kontrollseite BV' }).waitFor()
  const zeileBv = seiteV.locator('.bv-zeile', { hasText: '2026-0815' })
  await zeileBv.waitFor()
  pruefe(await zeileBv.getByText('beim BV').isVisible(), 'BV: Tabelle zeigt das abgegebene WEP „beim BV“')
  pruefe((await seiteV.locator('.bv-zeile', { hasText: '2026-0816' }).count()) === 0, 'BV: Entwürfe (nicht abgegeben) erscheinen nicht')
  pruefe(await zeileBv.getByText('Bert Bauer / Erika Musterfrau').isVisible(), 'BV: Wertermittler Bau / Grün in der Tabelle')
  await seiteV.screenshot({ path: `${AUSGABE}/08-bv-liste.png` })
  await zeileBv.getByRole('button', { name: '2026-0815' }).click()
  await seiteV.getByRole('heading', { name: /2026-0815/ }).waitFor()
  const download = seiteV.waitForEvent('download')
  await seiteV.getByRole('button', { name: 'PDF übersichtlich' }).click()
  pruefe((await download).suggestedFilename().endsWith('.pdf'), 'BV: „PDF übersichtlich“ erzeugt das PDF (Daten vom Server)')
  await seiteV.getByRole('group', { name: 'Rückfrage an' }).getByRole('button', { name: 'Grün', exact: true }).click()
  await seiteV.getByLabel(/Notiz \(was soll geklärt werden/).fill('Hecke an der Straße fehlt')
  await seiteV.getByRole('button', { name: 'Rückfrage senden' }).click()
  await seiteV.getByRole('alertdialog').getByRole('button', { name: 'Senden' }).click()
  await seiteV.getByText('Rückfrage gesendet.').waitFor()
  pruefe(zustandVon('2026-0815') === 'rueckfrage', 'Server: Rückfrage an Grün')
  await seiteV.screenshot({ path: `${AUSGABE}/09-bv-rueckfrage.png`, fullPage: true })

  await seiteE.getByRole('button', { name: 'Protokolle' }).first().click()
  await seiteE.getByRole('button', { name: 'Abgleichen' }).filter({ visible: true }).first().click()
  await seiteE.locator('ul[aria-label="Protokolle"] .zeile', { hasText: '2026-0815' }).getByText('Rückfrage').waitFor()
  await seiteE.getByRole('button', { name: /2026-0815/ }).first().click()
  await seiteE.getByRole('button', { name: 'Abgabe' }).filter({ visible: true }).first().click()
  pruefe(await seiteE.locator('p').filter({ hasText: 'Rückfrage vom BV' }).filter({ hasText: 'Hecke an der Straße fehlt' }).isVisible(), 'Grün: sieht die Rückfrage mit Notiz')
  await seiteE.getByRole('button', { name: 'An den BV abgeben' }).click()
  await seiteE.getByRole('alertdialog').getByRole('button', { name: 'Abgeben' }).click()
  await seiteE.getByText('An den BV abgegeben.').waitFor()
  pruefe(zustandVon('2026-0815') === 'beim_bv', 'Grün gibt nach der Rückfrage wieder an den BV ab')
  pruefe(mails.some((m) => m.to.includes('erika@example.org') && m.subject.includes('Rückfrage vom BV')), 'Mail an Grün zur Rückfrage')
  pruefe(mails.some((m) => m.to.includes('bea@bv.example') && m.subject.includes('an den BV abgegeben') && m.text.includes('/bv?wep=')), 'Mail an den BV mit Link zur Kontrollseite')

  await seiteV.getByRole('button', { name: 'Alle WEPs' }).click()
  await seiteV.getByRole('button', { name: 'Neu laden' }).click()
  await zeileBv.getByText('beim BV').waitFor()
  await zeileBv.getByRole('button', { name: '2026-0815' }).click()
  await seiteV.getByRole('button', { name: 'Geprüft', exact: true }).click()
  await seiteV.getByRole('alertdialog').getByRole('button', { name: 'Geprüft' }).click()
  await seiteV.getByText('Als geprüft markiert.').waitFor()
  pruefe(zustandVon('2026-0815') === 'geprueft', 'BV: als geprüft markiert')
  await seiteV.getByLabel('Begründung zum Wieder öffnen').fill('Betrag Laube korrigieren')
  await seiteV.getByRole('button', { name: 'Wieder öffnen' }).click()
  await seiteV.getByRole('alertdialog').getByRole('button', { name: 'Wieder öffnen' }).click()
  await seiteV.getByText('Wieder geöffnet.').waitFor()
  pruefe(zustandVon('2026-0815') === 'beim_bv', 'BV: mit Begründung wieder geöffnet')
  const notizen = (db.roh.prepare("SELECT v.aktion, v.notiz FROM verlauf v JOIN weps w ON w.id = v.wep_id WHERE w.vorgangs_nr = '2026-0815' AND w.bau_konto IS NOT NULL AND v.aktion IN ('rueckfrage', 'wiederoeffnen') ORDER BY v.id").all() as { aktion: string; notiz: string }[]).map((v) => `${v.aktion}: ${v.notiz}`)
  pruefe(notizen.join(' | ') === 'rueckfrage: Hecke an der Straße fehlt | wiederoeffnen: Betrag Laube korrigieren', `Verlauf mit Notizen: ${notizen.join(' | ')}`)

  // 13. Rückfrage an beide: erst Bau (weitergeben an Grün), dann Grün (an den BV)
  await seiteV.getByRole('group', { name: 'Rückfrage an' }).getByRole('button', { name: 'Bau und Grün' }).click()
  await seiteV.getByLabel(/Notiz \(was soll geklärt werden/).fill('Baujahr der Laube und Hecke prüfen')
  await seiteV.getByRole('button', { name: 'Rückfrage senden' }).click()
  await seiteV.getByRole('alertdialog').getByRole('button', { name: 'Senden' }).click()
  await seiteV.getByText('Rückfrage gesendet.').waitFor()
  await seite.getByRole('button', { name: 'Abgleichen' }).filter({ visible: true }).first().click()
  await seite.locator('ul[aria-label="Protokolle"] .zeile', { hasText: '2026-0815' }).getByText('Rückfrage').waitFor()
  await seite.getByRole('button', { name: /2026-0815/ }).first().click()
  await seite.getByRole('navigation', { name: 'Abschnitte' }).getByRole('button', { name: 'Baulichkeiten' }).waitFor()
  const navBauRueckfrage = await seite.getByRole('navigation', { name: 'Abschnitte' }).getByRole('button').allTextContents()
  pruefe(navBauRueckfrage.some((t) => /Bauten/.test(t)) && !navBauRueckfrage.some((t) => /Aufwuchs/.test(t)), `Bau bei der Rückfrage: wieder sein Teil, nicht der Grün-Teil (${navBauRueckfrage.join(', ')})`)
  await seite.getByRole('button', { name: 'Abgabe' }).filter({ visible: true }).first().click()
  pruefe(await seite.getByText(/Rückfrage vom BV.*Baujahr der Laube und Hecke prüfen/).first().isVisible(), 'Bau sieht die Rückfrage mit Notiz')
  await seite.getByRole('button', { name: 'An Erika Musterfrau weitergeben' }).click()
  await seite.getByRole('alertdialog').getByRole('button', { name: 'Abgeben' }).click()
  await seite.getByText('An Erika Musterfrau abgegeben.').waitFor()
  pruefe(zustandVon('2026-0815') === 'rueckfrage', 'Rückfrage „beide“: nach Bau weiter bei Grün (Zustand bleibt Rückfrage)')
  await seiteE.getByRole('button', { name: 'Protokolle' }).first().click()
  await seiteE.getByRole('button', { name: 'Abgleichen' }).filter({ visible: true }).first().click()
  await seiteE.getByRole('button', { name: /2026-0815/ }).first().click()
  await seiteE.getByRole('button', { name: 'Abgabe' }).filter({ visible: true }).first().click()
  await seiteE.getByRole('button', { name: 'An den BV abgeben' }).click()
  await seiteE.getByRole('alertdialog').getByRole('button', { name: 'Abgeben' }).click()
  await seiteE.getByText('An den BV abgegeben.').waitFor()
  pruefe(zustandVon('2026-0815') === 'beim_bv', 'Rückfrage „beide“: Grün gibt an den BV ab')

  // 14. Eigenes Grün-WEP ohne Bau (reine Grün-Wertermittlung): Grün gibt direkt an den BV ab – mit Rückfrage, nur Warnung
  await seiteE.getByRole('button', { name: 'Protokolle' }).first().click()
  await neuesWep(seiteE, '2026-0900')
  await seiteE.getByRole('button', { name: 'Abgabe' }).filter({ visible: true }).first().click()
  pruefe(await seiteE.getByText('kein Bau-Teil (eigenes Grün-WEP)').isVisible(), 'Abgabe: „kein Bau-Teil“')
  await seiteE.getByRole('button', { name: 'An den BV abgeben' }).click()
  const ohneBau = seiteE.getByRole('alertdialog', { name: 'Kein Bau-Teil – bewusst ohne Bau abgeben?' })
  await ohneBau.waitFor()
  await seiteE.screenshot({ path: `${AUSGABE}/12-ohne-bau.png` })
  await ohneBau.getByRole('button', { name: 'Ohne Bau abgeben' }).click()
  await seiteE.getByText('An den BV abgegeben.').waitFor()
  pruefe(zustandVon('2026-0900', false) === 'beim_bv', 'Grün-WEP ohne Bau ist beim BV')
  await seiteV.getByRole('button', { name: 'Alle WEPs' }).click()
  await seiteV.getByRole('button', { name: 'Neu laden' }).click()
  await seiteV.locator('.bv-zeile', { hasText: '2026-0900' }).getByText('Erika Musterfrau (ohne Bau-Teil)').waitFor()
  pruefe(true, 'BV: Grün-WEP ohne Bau in der Tabelle („ohne Bau-Teil“)')
  await beaKontext.close()
  await erikaKontext.close()
  const verlauf = (db.roh.prepare('SELECT aktion FROM verlauf ORDER BY id').all() as { aktion: string }[]).map((v) => v.aktion)
  pruefe(verlauf.filter((a) => a === 'angelegt').length === 4, 'Verlauf: „angelegt“ je WEP (2 von Bert, 2 von Erika)')
  pruefe(['zusammengefuehrt', 'zusammengefuehrt_in', 'zusammenfuehrung_zurueck'].every((a) => verlauf.includes(a)), 'Verlauf: Zusammenführen und Rückgängig in beiden WEPs')
  await geraetB.close()

  const protokoll = (db.roh.prepare('SELECT aktion FROM protokoll').all() as { aktion: string }[]).map((p) => p.aktion)
  pruefe(['konto_angelegt', 'anmeldung', 'abmeldung', 'admin_freigeben', 'admin_rollen', 'admin_sperren'].every((a) => protokoll.includes(a)), 'Zugriffsprotokoll enthält Anmeldungen und Admin-Aktionen')
  pruefe(skriptFehler.length === 0, `keine Skriptfehler im Browser ${skriptFehler.join(' | ')}`)
} finally {
  await u.schliessen()
}
if (fehler) {
  console.error(`${fehler} Prüfung(en) fehlgeschlagen`)
  process.exit(1)
}
console.log('Durchlauf v2 erfolgreich')
