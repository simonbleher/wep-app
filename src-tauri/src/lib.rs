//! WEP als Windows-Programm (Tauri 2): Hülle um die unveränderte Web-App.
//! Was die WebView nicht kann, steht in den Modulen: Anmeldung (Loopback + PKCE),
//! sicherer Speicher, „Speichern unter…“, Live-Update des Web-Teils und Programm-Updates.

mod anmeldung;
mod eingang;
mod programm;
mod server;
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
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Zweiter Start (z. B. Doppelklick auf eine .wep-Datei): die Datei melden, das offene Fenster nach
            // vorn (zwei Fenster würden dieselben Daten beschreiben)
            eingang::nimm_an(app, &app.state::<eingang::Eingang>(), &args);
            if let Some(fenster) = app.get_webview_window("main") {
                let _ = fenster.unminimize();
                let _ = fenster.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Marke `__WEP_HUELLE__` vor dem Laden jeder Seite: Diese Hülle kann die Server-Anmeldung (Paket 8)
        .plugin(tauri::plugin::Builder::<tauri::Wry>::new("wep-huelle").js_init_script(server::HUELLE_SKRIPT.to_string()).build())
        .manage(eingang::Eingang::aus_args(&std::env::args().collect::<Vec<_>>()))
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
            server::server_token_lesen,
            server::server_token_speichern,
            server::server_token_loeschen,
            speichern::datei_speichern,
            eingang::eingang_pruefen,
            eingang::eingang_lesen,
            eingang::eingang_verwerfen,
            webupdate::web_info,
            webupdate::web_start_gemeldet,
            webupdate::web_paket_laden,
            programm::programm_pruefen,
            programm::programm_installieren,
        ])
        .run(context)
        .expect("Fehler beim Starten von WEP");
}
