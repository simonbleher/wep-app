// Prüft, dass android/native-version.txt erhöht wurde, wenn sich der native Teil der
// Android-App geändert hat (android/, capacitor.config.ts, @capacitor/*- oder @capgo/*-
// Abhängigkeiten in package.json). Aufruf: node tools/pruefe-native-version.mjs <Basis-Ref>
// (z. B. origin/main); Exit-Code 1 bei Verstoß. Logik in `pruefe`, getestet in
// pruefe-native-version.test.ts.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const VERSION_DATEI = 'android/native-version.txt'

/** Ist diese geänderte Datei Teil des nativen Teils? (Build-Ausgaben und die Versionsdatei selbst nicht.) */
export function istNativDatei(pfad) {
  if (pfad === VERSION_DATEI) return false
  if (pfad === 'capacitor.config.ts') return true
  if (!pfad.startsWith('android/')) return false
  return !/(^|\/)(build|\.gradle|\.idea)\//.test(pfad) && !pfad.endsWith('.md')
}

/** Native Abhängigkeiten (Capacitor und Plugins) eines package.json-Inhalts als „name@version“. */
export function nativeAbhaengigkeiten(packageJsonText) {
  if (!packageJsonText) return []
  const p = JSON.parse(packageJsonText)
  const alle = { ...p.dependencies, ...p.devDependencies }
  return Object.entries(alle)
    .filter(([name]) => name.startsWith('@capacitor/') || name.startsWith('@capgo/'))
    .map(([name, v]) => `${name}@${v}`)
    .sort()
}

function zahl(text) {
  const n = Number.parseInt((text ?? '').trim(), 10)
  return Number.isInteger(n) ? n : 0
}

/**
 * @param {{geaendert: string[], basisVersion: string|null, aktuelleVersion: string|null,
 *          basisPackage: string|null, aktuellesPackage: string|null}} e
 * @returns {{ok: boolean, meldung: string}}
 */
export function pruefe(e) {
  const gruende = e.geaendert.filter(istNativDatei)
  const alt = nativeAbhaengigkeiten(e.basisPackage).join('\n')
  const neu = nativeAbhaengigkeiten(e.aktuellesPackage).join('\n')
  if (alt !== neu) gruende.push('package.json (Capacitor-/Plugin-Abhängigkeiten)')
  const basis = zahl(e.basisVersion)
  const aktuell = zahl(e.aktuelleVersion)
  if (aktuell < 1) return { ok: false, meldung: `${VERSION_DATEI} fehlt oder enthält keine ganze Zahl ab 1.` }
  if (aktuell < basis) return { ok: false, meldung: `${VERSION_DATEI} darf nicht sinken (${basis} → ${aktuell}).` }
  if (gruende.length === 0) return { ok: true, meldung: 'Native Teile unverändert – native-version bleibt.' }
  if (aktuell > basis) return { ok: true, meldung: `Nativer Teil geändert, native-version erhöht (${basis} → ${aktuell}).` }
  return {
    ok: false,
    meldung:
      `Der native Teil hat sich geändert, aber ${VERSION_DATEI} steht noch auf ${aktuell}. ` +
      `Bitte erhöhen (die App meldet sonst keine neue App-Version).\nGeänderte Dateien:\n  ` +
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
    basisVersion: git('show', `${basis}:${VERSION_DATEI}`),
    aktuelleVersion: readFileSync(VERSION_DATEI, 'utf-8'),
    basisPackage: git('show', `${basis}:package.json`),
    aktuellesPackage: readFileSync('package.json', 'utf-8'),
  })
  console.log(ergebnis.meldung)
  process.exit(ergebnis.ok ? 0 : 1)
}
