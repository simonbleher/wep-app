//! Updates des Programms selbst (neue .exe) über den Tauri-Updater: Die App fragt
//! `latest.json` auf wep-pankow-apk.pages.dev/windows/ ab (Adresse und Schlüssel in
//! tauri.conf.json), prüft die Signatur und startet den Installer.

use std::sync::Mutex;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

/// Das zuletzt gefundene Update (wartet auf „Jetzt installieren“).
#[derive(Default)]
pub struct Gefunden(Mutex<Option<Update>>);

#[derive(Serialize)]
pub struct ProgrammUpdate {
    pub version: String,
    pub notizen: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct Fortschritt {
    pub geladen: u64,
    pub gesamt: u64,
}

/// Gibt es eine neuere Programmversion? `None` = aktuell.
#[tauri::command]
pub async fn programm_pruefen(app: AppHandle, gefunden: State<'_, Gefunden>) -> Result<Option<ProgrammUpdate>, String> {
    let updater = app.updater().map_err(|e| format!("Programm-Update nicht eingerichtet: {e}"))?;
    let update = updater.check().await.map_err(|e| format!("Prüfung auf Programm-Update fehlgeschlagen: {e}"))?;
    let ergebnis = update.as_ref().map(|u| ProgrammUpdate { version: u.version.clone(), notizen: u.body.clone() });
    *gefunden.0.lock().map_err(|e| e.to_string())? = update;
    Ok(ergebnis)
}

/// Lädt das gefundene Update, prüft die Signatur und startet den Installer (die App beendet sich dabei).
#[tauri::command]
pub async fn programm_installieren(gefunden: State<'_, Gefunden>, fortschritt: Channel<Fortschritt>) -> Result<(), String> {
    let update = gefunden.0.lock().map_err(|e| e.to_string())?.take();
    let Some(update) = update else { return Err("Kein Programm-Update gefunden – bitte erst nach Updates suchen".into()) };
    let mut geladen: u64 = 0;
    update
        .download_and_install(
            |stueck, gesamt| {
                geladen += stueck as u64;
                let _ = fortschritt.send(Fortschritt { geladen, gesamt: gesamt.unwrap_or(0) });
            },
            || {},
        )
        .await
        .map_err(|e| format!("Installation des Programm-Updates fehlgeschlagen: {e}"))
}
