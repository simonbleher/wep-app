// Profil des Wertermittlers (Name, Rolle, Standard-Kleingartenanlage) und
// Geräte-Einstellungen.
//
// - Profil: wird über OneDrive (daten/profil.json) zwischen den Geräten abgeglichen,
//   siehe src/sync/profil.ts. Lokal in localStorage.
// - Geräte-Einstellungen: bleiben nur auf diesem Gerät.
import { neuerWep, type Wep } from '@/model'

export type Rolle = 'gruen' | 'bau' | 'beides'

export const ROLLEN: { wert: Rolle; text: string }[] = [
  { wert: 'gruen', text: 'Grün' },
  { wert: 'bau', text: 'Bau' },
  { wert: 'beides', text: 'Grün und Bau' },
]

export interface Profil {
  name: string
  /** Wird vorerst nur gespeichert. */
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
  wep.formalien.wertermittlerAussenAufwuchs = profil.name.trim()
  wep.formalien.kleingartenanlage = profil.standardAnlage.trim()
  return wep
}

// --- Geräte-Einstellungen (nur lokal) -------------------------------------

export interface GeraeteEinstellungen {
  /** Upload nur über WLAN. Wirkt in der Android-App; im Browser nur gespeichert. */
  nurWlan: boolean
}

const GERAET_KEY = 'wep-geraete-einstellungen'

export function ladeGeraeteEinstellungen(): GeraeteEinstellungen {
  try {
    const roh = localStorage.getItem(GERAET_KEY)
    if (roh) return { nurWlan: true, ...(JSON.parse(roh) as Partial<GeraeteEinstellungen>) }
  } catch {
    /* Standard */
  }
  return { nurWlan: true }
}

export function speichereGeraeteEinstellungen(e: GeraeteEinstellungen): void {
  try {
    localStorage.setItem(GERAET_KEY, JSON.stringify(e))
  } catch {
    /* nur Komfort */
  }
}
