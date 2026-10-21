// Baut den Inhalt des Cloudflare-Pages-Projekts „wep-pankow-apk“ zusammen. Das Projekt liefert
//   /wep.apk, /apk.json                      (Android, Workflow „Android Release“)
//   /windows/wep-setup.exe, /windows/latest.json, /windows/windows.json   (Windows, Workflow „Windows Release“)
// Jeder Deploy ersetzt die ganze Seite. Damit ein Workflow die Dateien des anderen nicht löscht,
// holt er sie vor dem Deploy von der Live-Seite und legt sie mit in den Ordner:
//   node tools/apk-site.mjs uebernehmen <android|windows> <Ordner>
//       Holt die Dateien der genannten Plattform von der Live-Seite (Prüfsumme wird kontrolliert).
//       Gibt es sie dort noch nicht (404), ist das in Ordnung. Jeder andere Fehler bricht ab,
//       damit nichts versehentlich gelöscht wird.
//   node tools/apk-site.mjs windows-bereitstellen <Ordner> <setup.exe> <setup.exe.sig> <Version> <Notizen-Datei>
//       Legt Installer, latest.json (Tauri-Updater) und windows.json in <Ordner>/windows/ ab.
// Danach schreibt jeder Aufruf die `_headers`-Regeln der vorhandenen Plattformen (Android: Regeln
// unverändert wie im Workflow „Android Release“).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const BASIS_URL = 'https://wep-pankow-apk.pages.dev'
export const INSTALLER = 'windows/wep-setup.exe'

export const HEADERS_ANDROID = `/apk.json
  Cache-Control: no-cache
  Access-Control-Allow-Origin: *
/wep.apk
  Cache-Control: no-cache
  Content-Type: application/vnd.android.package-archive
`

export const HEADERS_WINDOWS = `/windows/latest.json
  Cache-Control: no-cache
  Access-Control-Allow-Origin: *
/windows/windows.json
  Cache-Control: no-cache
  Access-Control-Allow-Origin: *
/windows/wep-setup.exe
  Cache-Control: no-cache
  Content-Type: application/octet-stream
`

/** Inhalt der `_headers`-Datei für die Plattformen, deren Dateien im Ordner liegen. */
export function headersFuer({ android, windows }) {
  return [android ? HEADERS_ANDROID : '', windows ? HEADERS_WINDOWS : ''].filter(Boolean).join('')
}

const sha256 = (daten) => createHash('sha256').update(daten).digest('hex')

/** latest.json für den Tauri-Updater (Plattform windows-x86_64). */
export function baueLatestJson({ version, notizen, signatur, url, zeit }) {
  return {
    version,
    notes: notizen,
    pub_date: zeit,
    platforms: { 'windows-x86_64': { signature: signatur.trim(), url } },
  }
}

/** windows.json: eigene Angaben zum Installer (für die Prüfsumme beim Erhalten der Dateien). */
export function baueWindowsJson({ version, daten, zeit, commit }) {
  return {
    version,
    sha256: sha256(daten),
    installerUrl: `${BASIS_URL}/${INSTALLER}`,
    ...(commit ? { commit } : {}),
    gebautAm: zeit,
  }
}

async function hole(pfad, optional) {
  const antwort = await fetch(`${BASIS_URL}/${pfad}`, { cache: 'no-store' })
  if (antwort.status === 404 && optional) return null
  if (!antwort.ok) throw new Error(`${pfad}: HTTP ${antwort.status}`)
  return Buffer.from(await antwort.arrayBuffer())
}

function schreibe(ordner, pfad, daten) {
  const ziel = join(ordner, pfad)
  mkdirSync(join(ziel, '..'), { recursive: true })
  writeFileSync(ziel, daten)
}

function pruefeSumme(pfad, daten, erwartet) {
  if (erwartet && sha256(daten) !== erwartet) {
    throw new Error(`${pfad}: Prüfsumme stimmt nicht (Übertragung unvollständig?) – nichts wird überschrieben`)
  }
}

/** Holt die Dateien einer Plattform von der Live-Seite. Rückgabe: true, wenn es sie gab. */
export async function uebernehmen(plattform, ordner) {
  if (plattform === 'android') {
    const info = await hole('apk.json', true)
    if (!info) return false
    const apk = await hole('wep.apk', false)
    pruefeSumme('wep.apk', apk, JSON.parse(info.toString('utf-8')).sha256)
    schreibe(ordner, 'apk.json', info)
    schreibe(ordner, 'wep.apk', apk)
    return true
  }
  if (plattform === 'windows') {
    const info = await hole('windows/windows.json', true)
    const latest = await hole('windows/latest.json', true)
    if (!info || !latest) return false
    const setup = await hole(INSTALLER, false)
    pruefeSumme(INSTALLER, setup, JSON.parse(info.toString('utf-8')).sha256)
    schreibe(ordner, 'windows/windows.json', info)
    schreibe(ordner, 'windows/latest.json', latest)
    schreibe(ordner, INSTALLER, setup)
    return true
  }
  throw new Error(`Unbekannte Plattform: ${plattform}`)
}

function schreibeHeaders(ordner) {
  const text = headersFuer({
    android: existsSync(join(ordner, 'wep.apk')),
    windows: existsSync(join(ordner, INSTALLER)),
  })
  writeFileSync(join(ordner, '_headers'), text)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [befehl, ...a] = process.argv.slice(2)
  try {
    if (befehl === 'uebernehmen') {
      const [plattform, ordner] = a
      mkdirSync(ordner, { recursive: true })
      const da = await uebernehmen(plattform, ordner)
      console.log(da ? `${plattform}: Dateien von der Live-Seite übernommen.` : `${plattform}: noch nicht veröffentlicht – nichts zu übernehmen.`)
      schreibeHeaders(ordner)
    } else if (befehl === 'windows-bereitstellen') {
      const [ordner, setup, sig, version, notizenDatei] = a
      const daten = readFileSync(setup)
      const zeit = new Date().toISOString()
      schreibe(ordner, INSTALLER, daten)
      schreibe(
        ordner,
        'windows/latest.json',
        JSON.stringify(
          baueLatestJson({
            version,
            notizen: readFileSync(notizenDatei, 'utf-8').trim(),
            signatur: readFileSync(sig, 'utf-8'),
            url: `${BASIS_URL}/${INSTALLER}`,
            zeit,
          }),
          null,
          2,
        ) + '\n',
      )
      schreibe(
        ordner,
        'windows/windows.json',
        JSON.stringify(baueWindowsJson({ version, daten, zeit, commit: process.env.GITHUB_SHA }), null, 2) + '\n',
      )
      schreibeHeaders(ordner)
      console.log(`windows: Installer ${version} (${(daten.length / 1024 / 1024).toFixed(1)} MB) bereitgestellt.`)
    } else {
      console.error('Aufruf: node tools/apk-site.mjs uebernehmen <android|windows> <Ordner> | windows-bereitstellen …')
      process.exit(2)
    }
  } catch (e) {
    console.error(`::error title=Cloudflare-Seite::${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }
}
