//! WEP als Windows-Programm (Tauri 2): Hülle um die unveränderte Web-App.
//! Was die WebView nicht kann, steht in den Modulen: Anmeldung (Loopback + PKCE),
//! sicherer Speicher, „Speichern unter…“, Live-Update des Web-Teils und Programm-Updates.

mod anmeldung;
mod programm;
mod speichern;
mod tresor;
mod webupdate;

use std::path::PathBuf;

use tauri::Manager;

/// Datenordner des Programms (wie `app_local_data_dir`, aber schon vor dem Start der App bekannt –
/// der Web-Teil wird von dort geliefert, bevor das erste Fenster entsteht).
fn daten_ordner(kennung: &str) -> PathBuf {
    #[cfg(windows)]
    let basis = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    #[cfg(not(windows))]
    let basis = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")));
    basis.unwrap_or_else(std::env::temp_dir).join(kennung)
}

pub fn run() {
    let mut context = tauri::generate_context!();
    let live = webupdate::Live::start(&daten_ordner(&context.config().identifier));
    let ab_werk = context.set_assets(Box::new(webupdate::Leer));
    context.set_assets(Box::new(webupdate::LiveAssets::neu(ab_werk, live.clone())));

    let live_fuer_start = live.clone();
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Zweiter Start: das offene Fenster nach vorn (zwei Fenster würden dieselben Daten beschreiben)
            if let Some(fenster) = app.get_webview_window("main") {
                let _ = fenster.unminimize();
                let _ = fenster.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(anmeldung::Lauscher::default())
        .manage(programm::Gefunden::default())
        .manage(live)
        .setup(move |app| {
            webupdate::wache(app.handle().clone(), live_fuer_start.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            anmeldung::anmeldung_lauschen,
            anmeldung::anmeldung_warten,
            anmeldung::anmeldung_abbrechen,
            anmeldung::anmeldung_browser,
            anmeldung::token_anfrage,
            anmeldung::anmeldung_lesen,
            anmeldung::anmeldung_speichern,
            anmeldung::anmeldung_loeschen,
            speichern::datei_speichern,
            webupdate::web_info,
            webupdate::web_start_gemeldet,
            webupdate::web_paket_laden,
            programm::programm_pruefen,
            programm::programm_installieren,
        ])
        .run(context)
        .expect("Fehler beim Starten von WEP");
}
