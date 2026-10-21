//! „Speichern unter…“: Der Windows-Dialog fragt nach Ordner und Dateiname, danach wird die Datei
//! geschrieben. Die Oberfläche (src/app/dateiSpeichern.ts) schickt die Bytes roh (ohne Base64)
//! und den Namen im Kopf `x-dateiname` (URL-kodiert).

use std::path::Path;

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request};
use tauri::WebviewWindow;
use tauri_plugin_dialog::DialogExt;

/// Dateiname ohne Pfadanteile (der Nutzer wählt den Ordner im Dialog).
pub fn reiner_name(roh: &str) -> String {
    let name: String = roh
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("")
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
        .collect();
    let name = name.trim().trim_matches('.').to_string();
    if name.is_empty() { "WEP-Datei".to_string() } else { name }
}

fn erweiterung(name: &str) -> Option<String> {
    Path::new(name)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .filter(|e| !e.is_empty() && e.len() <= 8 && e.chars().all(|c| c.is_ascii_alphanumeric()))
}

/// Zeigt den Dialog und schreibt die Datei. `true` = gespeichert, `false` = abgebrochen.
#[tauri::command]
pub async fn datei_speichern(window: WebviewWindow, request: Request<'_>) -> Result<bool, String> {
    let InvokeBody::Raw(daten) = request.body() else {
        return Err("Die Datei wurde nicht als Bytes übergeben".into());
    };
    let roh = request
        .headers()
        .get("x-dateiname")
        .and_then(|v| v.to_str().ok())
        .map(|v| percent_decode_str(v).decode_utf8_lossy().into_owned())
        .unwrap_or_default();
    let name = reiner_name(&roh);

    let mut dialog = window.dialog().file().set_title("Speichern unter").set_file_name(&name).set_parent(&window);
    if let Some(e) = erweiterung(&name) {
        dialog = dialog.add_filter(format!("{} (*.{e})", e.to_uppercase()), &[e.as_str()]);
    }
    // blocking_* darf nicht im Hauptthread laufen; async-Befehle laufen im Hintergrund.
    let Some(ziel) = dialog.blocking_save_file() else { return Ok(false) };
    let pfad = ziel.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&pfad, daten).map_err(|e| format!("Die Datei konnte nicht geschrieben werden ({}): {e}", pfad.display()))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn name_ohne_pfad_und_sonderzeichen() {
        assert_eq!(reiner_name("../../WEP 2026-001.xlsx"), "WEP 2026-001.xlsx");
        assert_eq!(reiner_name("C:\\Users\\x\\a:b?.zip"), "ab.zip");
        assert_eq!(reiner_name(""), "WEP-Datei");
        assert_eq!(reiner_name("..."), "WEP-Datei");
    }

    #[test]
    fn erweiterung_fuer_filter() {
        assert_eq!(erweiterung("a.XLSX").as_deref(), Some("xlsx"));
        assert_eq!(erweiterung("ohne"), None);
        assert_eq!(erweiterung("a.mit leerzeichen"), None);
    }
}
