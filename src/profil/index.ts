// Profil des Wertermittlers (Name, Rolle, Standard-Kleingartenanlage) und
// Geräte-Einstellungen.
//
// - Profil: wird über OneDrive (daten/profil.json) zwischen den Geräten abgeglichen,
//   siehe src/sync/profil.ts. Lokal in localStorage.
// - Geräte-Einstellungen: bleiben nur auf diesem Gerät.
import { neuerWep, type Rolle, type Wep } from '@/model'

export type { Rolle }

export const ROLLEN: { wert: Rolle; text: string }[] = [
  { wert: 'gruen', text: 'Grün' },
  { wert: 'bau', text: 'Bau' },
  { wert: 'beides', text: 'Grün und Bau' },
]

export interface Profil {
  name: string
  /** Schaltet Reiter und Export frei (Grün / Bau / Beides); pro WEP umschaltbar (`Wep.rolle`). */
  rolle: Rolle
  standardAnlage: string
}

export const LEERES_PROFIL: Profil = { name: '', rolle: 'gruen', standardAnlage: '' }

/** Profil samt Abgleich-Stand, wie es lokal liegt. */
export interface ProfilStand {
  profil: Profil
  /** Zeitpunkt der letzten Änderung auf irgendeinem Gerät (ISO). Fehlt = nie bearbeitet. */
  geaendertAm?: string
  /** Letzter erfolgreicher Abgleich dieses Geräts (ISO). */
  letzterSyncAm?: string
  /** eTag von daten/profil.json beim letzten Abgleich. */
  remoteETag?: string
}

export interface ProfilSpeicher {
  lade(): ProfilStand
  speichere(stand: ProfilStand): void
}

const PROFIL_KEY = 'wep-profil'

/** Profil im localStorage dieses Geräts. */
export const lokalesProfil: ProfilSpeicher = {
  lade() {
    try {
      const roh = localStorage.getItem(PROFIL_KEY)
      if (roh) {
        const d = JSON.parse(roh) as Partial<ProfilStand>
        return { ...d, profil: { ...LEERES_PROFIL, ...d.profil } }
      }
    } catch {
      /* kaputter oder gesperrter Speicher → leeres Profil */
    }
    return { profil: { ...LEERES_PROFIL } }
  },
  speichere(stand) {
    try {
      localStorage.setItem(PROFIL_KEY, JSON.stringify(stand))
    } catch {
      /* ohne Speicher gibt es kein Profil, die App läuft trotzdem */
    }
  },
}

/** Ändert das Profil lokal und merkt die Änderung für den nächsten Abgleich vor. */
export function aendereProfil(
  aenderung: Partial<Profil>,
  speicher: ProfilSpeicher = lokalesProfil,
  jetzt: () => string = () => new Date().toISOString(),
): ProfilStand {
  const alt = speicher.lade()
  const neu: ProfilStand = {
    ...alt,
    profil: { ...alt.profil, ...aenderung },
    geaendertAm: jetzt(),
  }
  speicher.speichere(neu)
  return neu
}

/** Neues WEP mit Vorbelegung aus dem Profil (Wertermittler, Kleingartenanlage). */
export function neuerWepMitProfil(id: string, profil: Profil): Wep {
  const wep = neuerWep(id)
  // Der Name kommt in die Zelle des eigenen Teils: Grün E13, Bau E12 (Beides: beide)
  if (profil.rolle !== 'bau') wep.formalien.wertermittlerAussenAufwuchs = profil.name.trim()
  if (profil.rolle !== 'gruen') wep.formalien.wertermittlerBaulichkeiten = profil.name.trim()
  wep.formalien.kleingartenanlage = profil.standardAnlage.trim()
  wep.rolle = profil.rolle // fest am WEP: ein späterer Rollenwechsel im Profil ändert es nicht
  return wep
}

// --- Geräte-Einstellungen (nur lokal) -------------------------------------

export interface GeraeteEinstellungen {
  /** Upload nur über WLAN. Wirkt in der Android-App (WEP-Dateien und Fotos); im Browser nur für Fotos, soweit der Browser die Verbindungsart meldet. */
  nurWlan: boolean
  /** Sonnen-Kontrast: kräftigere Linien und Texte, größere Schrift (src/design/tokens.css). */
  sonnenKontrast: boolean
}

const STANDARD_GERAET: GeraeteEinstellungen = { nurWlan: true, sonnenKontrast: false }

const GERAET_KEY = 'wep-geraete-einstellungen'

export function ladeGeraeteEinstellungen(): GeraeteEinstellungen {
  try {
    const roh = localStorage.getItem(GERAET_KEY)
    if (roh) return { ...STANDARD_GERAET, ...(JSON.parse(roh) as Partial<GeraeteEinstellungen>) }
  } catch {
    /* Standard */
  }
  return { ...STANDARD_GERAET }
}

/** Speichert die genannten Einstellungen; die übrigen bleiben, wie sie sind. */
export function speichereGeraeteEinstellungen(teil: Partial<GeraeteEinstellungen>): void {
  try {
    localStorage.setItem(GERAET_KEY, JSON.stringify({ ...ladeGeraeteEinstellungen(), ...teil }))
  } catch {
    /* nur Komfort */
  }
}

/**
 * Schaltet den Sonnen-Kontrast am Dokument ein oder aus (Attribut `data-kontrast="sonne"`, das
 * src/design/tokens.css auswertet). Ohne Angabe gilt die gespeicherte Geräte-Einstellung.
 */
export function wendeKontrastAn(
  an: boolean = ladeGeraeteEinstellungen().sonnenKontrast,
  wurzel: { dataset: Record<string, string | undefined> } | undefined = typeof document === 'undefined' ? undefined : document.documentElement,
): void {
  if (!wurzel) return
  if (an) wurzel.dataset.kontrast = 'sonne'
  else delete wurzel.dataset.kontrast
}
