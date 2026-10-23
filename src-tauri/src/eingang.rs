//! Doppelklick auf eine `.wep`-Datei (Windows-Dateizuordnung, Beta 5 Paket 2): Windows startet das Programm
//! mit dem Dateipfad als Argument – beim ersten Start in `std::env::args()`, bei einem schon laufenden Programm
//! über die Einzelinstanz-Weiche. Der Pfad wird hier gemerkt; die Oberfläche fragt Name und Bytes ab und
//! verwirft sie danach. Die Oberfläche übergibt nie einen Pfad (kein beliebiges Lesen von Dateien).

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, State};

/// Größer als das nimmt die App nicht an (wie TEILEN_MAX_BYTES in src/teilen/types.ts).
const MAX_BYTES: u64 = 1024 * 1024 * 1024;

#[derive(Default)]
pub struct Eingang(Mutex<Option<PathBuf>>);

impl Eingang {
    pub fn aus_args(args: &[String]) -> Self {
        Eingang(Mutex::new(pfad_aus_args(args)))
    }
}

fn ist_wep(pfad: &Path) -> bool {
    pfad.extension().map(|e| e.eq_ignore_ascii_case("wep")).unwrap_or(false)
}

/// Die erste Angabe in den Programmargumenten, die eine vorhandene `.wep`-Datei ist (Argument 0 ist das Programm).
pub fn pfad_aus_args(args: &[String]) -> Option<PathBuf> {
    args.iter().skip(1).map(PathBuf::from).find(|p| ist_wep(p) && p.is_file())
}

fn name_von(pfad: &Path) -> String {
    pfad.file_name().map(|n| n.to_string_lossy().into_owned()).filter(|n| !n.is_empty()).unwrap_or_else(|| "WEP.wep".to_string())
}

/// Zweiter Programmstart mit einer Datei: merken und der Oberfläche melden.
pub fn nimm_an(app: &AppHandle, state: &Eingang, args: &[String]) {
    if let Some(pfad) = pfad_aus_args(args) {
        let name = name_von(&pfad);
        if let Ok(mut s) = state.0.lock() {
            *s = Some(pfad);
        }
        let _ = app.emit("wep-datei", name);
    }
}

/// Name der wartenden Datei (`null` = keine).
#[tauri::command]
pub fn eingang_pruefen(state: State<'_, Eingang>) -> Option<String> {
    let s = state.0.lock().ok()?;
    s.as_ref().filter(|p| p.is_file()).map(|p| name_von(p))
}

/// Die Bytes der wartenden Datei (roh, ohne Base64).
#[tauri::command]
pub fn eingang_lesen(state: State<'_, Eingang>) -> Result<tauri::ipc::Response, String> {
    let pfad = state.0.lock().map_err(|_| "Eingang gesperrt".to_string())?.clone().ok_or("Keine Datei wartet")?;
    let groesse = std::fs::metadata(&pfad).map_err(|e| format!("Die Datei lässt sich nicht lesen: {e}"))?.len();
    if groesse > MAX_BYTES {
        return Err("Die Datei ist zu groß für eine WEP-Datei.".into());
    }
    let bytes = std::fs::read(&pfad).map_err(|e| format!("Die Datei lässt sich nicht lesen ({}): {e}", pfad.display()))?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn eingang_verwerfen(state: State<'_, Eingang>) {
    if let Ok(mut s) = state.0.lock() {
        *s = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("wep-eingang-test-{}-{name}", std::process::id()));
        std::fs::write(&p, b"x").unwrap();
        p
    }

    #[test]
    fn findet_die_wep_datei_in_den_argumenten() {
        let wep = temp("a.wep");
        let gross = temp("B.WEP");
        let txt = temp("c.txt");
        let args = |a: &[&PathBuf]| std::iter::once("wep.exe".to_string()).chain(a.iter().map(|p| p.to_string_lossy().into_owned())).collect::<Vec<_>>();
        assert_eq!(pfad_aus_args(&args(&[&wep])), Some(wep.clone()));
        assert_eq!(pfad_aus_args(&args(&[&txt, &gross])), Some(gross.clone()));
        assert_eq!(pfad_aus_args(&args(&[&txt])), None);
        assert_eq!(pfad_aus_args(&["wep.exe".to_string()]), None);
        // Argument 0 (das Programm selbst) zählt nie
        assert_eq!(pfad_aus_args(&[wep.to_string_lossy().into_owned()]), None);
        // eine .wep, die es nicht gibt, ist keine Datei
        assert_eq!(pfad_aus_args(&["wep.exe".into(), "gibt-es-nicht.wep".into()]), None);
        for p in [wep, gross, txt] {
            let _ = std::fs::remove_file(p);
        }
    }

    #[test]
    fn name_ohne_ordner() {
        #[cfg(windows)]
        assert_eq!(name_von(Path::new("C:\\Users\\x\\2026-001_KGA.wep")), "2026-001_KGA.wep");
        assert_eq!(name_von(Path::new("/tmp/a/2026-001.wep")), "2026-001.wep");
    }
}
