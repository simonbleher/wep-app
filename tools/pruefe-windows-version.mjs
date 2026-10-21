// Prüft die Versionsnummern des Windows-Programms (Tauri, src-tauri/):
// - Hat ein Pull Request etwas unter src-tauri/ geändert, muss `version` in src-tauri/tauri.conf.json
//   steigen – der Tauri-Updater meldet installierten Programmen sonst keine neue Version, und der
//   Workflow „Windows Release“ fände den Release-Tag der alten Version schon vor.
// - `version` in Cargo.toml muss zu tauri.conf.json passen.
// - src-tauri/huelle-version.txt (Nummer der Hülle für Live-Updates) ist eine ganze Zahl ab 1 und sinkt nie.
// Aufruf: node tools/pruefe-windows-version.mjs <Basis-Ref> (z. B. origin/main); Exit-Code 1 bei Verstoß.
// Logik in `pruefe`, getestet in pruefe-windows-version.test.ts.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const KONFIG = 'src-tauri/tauri.conf.json'
export const CARGO = 'src-tauri/Cargo.toml'
export const HUELLE = 'src-tauri/huelle-version.txt'

/** Gehört die geänderte Datei zum Programm? (Build-Ausgaben und Doku nicht.) */
export function istProgrammDatei(pfad) {
  if (!pfad.startsWith('src-tauri/')) return false
  return !/^src-tauri\/(target|gen)\//.test(pfad) && !pfad.endsWith('.md')
}

/** „1.2.3“ → [1,2,3]; null, wenn es keine einfache Version ist. */
export function parseVersion(text) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec((text ?? '').trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** >0, wenn a neuer ist als b. */
export function vergleiche(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

export function versionAusKonfig(text) {
  try {
    return JSON.parse(text).version ?? null
  } catch {
    return null
  }
}

/** `version = "x"` im Abschnitt [package] der Cargo.toml. */
export function versionAusCargo(text) {
  const paket = /\[package\]([\s\S]*?)(\n\[|$)/.exec(text ?? '')
  const m = paket && /^version\s*=\s*"([^"]+)"/m.exec(paket[1])
  return m ? m[1] : null
}

function zahl(text) {
  const n = Number.parseInt((text ?? '').trim(), 10)
  return Number.isInteger(n) ? n : 0
}

/**
 * @param {{geaendert: string[], basisKonfig: string|null, aktuelleKonfig: string, aktuellesCargo: string,
 *          basisHuelle: string|null, aktuelleHuelle: string}} e
 * @returns {{ok: boolean, meldung: string}}
 */
export function pruefe(e) {
  const aktuell = parseVersion(versionAusKonfig(e.aktuelleKonfig))
  if (!aktuell) return { ok: false, meldung: `${KONFIG}: „version“ fehlt oder ist keine Version der Form x.y.z.` }
  const cargo = versionAusCargo(e.aktuellesCargo)
  if (cargo !== aktuell.join('.')) {
    return { ok: false, meldung: `${CARGO} (version ${cargo ?? '–'}) muss zu ${KONFIG} (${aktuell.join('.')}) passen.` }
  }
  const huelle = zahl(e.aktuelleHuelle)
  if (huelle < 1) return { ok: false, meldung: `${HUELLE} fehlt oder enthält keine ganze Zahl ab 1.` }
  if (huelle < zahl(e.basisHuelle)) {
    return { ok: false, meldung: `${HUELLE} darf nicht sinken (${zahl(e.basisHuelle)} → ${huelle}).` }
  }
  const gruende = e.geaendert.filter(istProgrammDatei)
  if (gruende.length === 0) return { ok: true, meldung: 'Windows-Programm unverändert – Version bleibt.' }
  const basis = parseVersion(versionAusKonfig(e.basisKonfig ?? ''))
  if (!basis) return { ok: true, meldung: `Windows-Programm neu (Version ${aktuell.join('.')}).` }
  if (vergleiche(aktuell, basis) > 0) {
    return { ok: true, meldung: `Windows-Programm geändert, Version erhöht (${basis.join('.')} → ${aktuell.join('.')}).` }
  }
  return {
    ok: false,
    meldung:
      `Das Windows-Programm hat sich geändert, aber die Version in ${KONFIG} steht noch auf ${aktuell.join('.')}. ` +
      `Bitte erhöhen (und in ${CARGO} gleich setzen) – sonst bekommen installierte Programme kein Update.\nGeänderte Dateien:\n  ` +
      gruende.slice(0, 15).join('\n  '),
  }
}

function git(...args) {
  try {
    return execFileSync('git', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const basis = process.argv[2] ?? 'origin/main'
  const geaendert = (git('diff', '--name-only', `${basis}...HEAD`) ?? '').split('\n').filter(Boolean)
  const ergebnis = pruefe({
    geaendert,
    basisKonfig: git('show', `${basis}:${KONFIG}`),
    aktuelleKonfig: readFileSync(KONFIG, 'utf-8'),
    aktuellesCargo: readFileSync(CARGO, 'utf-8'),
    basisHuelle: git('show', `${basis}:${HUELLE}`),
    aktuelleHuelle: readFileSync(HUELLE, 'utf-8'),
  })
  console.log(ergebnis.meldung)
  process.exit(ergebnis.ok ? 0 : 1)
}
