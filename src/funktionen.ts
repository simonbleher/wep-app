// Zentrale Funktionsschalter der App (Build-Variablen, Standard: aus).
//
// KI_AKTIV: Skizzen-Chat und alle KI-Knöpfe/-Hinweise. Der Code bleibt im Repo;
// einschalten mit VITE_KI_AKTIV=true beim Build (siehe docs/KI-ASSISTENT.md).

export const KI_AKTIV: boolean =
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_KI_AKTIV === 'true'
