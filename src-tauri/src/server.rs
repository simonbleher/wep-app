//! Server-Modus (v2, Paket 8): Sitzungs-Token des WEP-Servers in der Windows-Anmeldeinformationsverwaltung.
//!
//! Getrennt von der OneDrive-Anmeldung (`anmeldung-*` in tresor.rs): eigener Eintrag `server-token`. Das Token ist
//! kurz (43 Zeichen), ein Eintrag reicht. Die Oberfläche hält es danach nur im Arbeitsspeicher.

use crate::tresor::{self, Ablage};

const EINTRAG: &str = "server-token";

/// Marke für die Oberfläche (src/server/modus.ts): Diese Hülle kann die Server-Anmeldung. Wird vor jedem Laden der
/// Seite gesetzt – auch vor einem Live-Update-Paket, das erst prüft, ob die Hülle passt.
pub const HUELLE_SKRIPT: &str = "Object.defineProperty(window, '__WEP_HUELLE__', { value: Object.freeze({ serverAnmeldung: 1 }) });";

/// Nur Tokens im Format des Servers (Base64url), damit der Befehl kein beliebiger Schreibzugriff ist.
pub fn ist_token(t: &str) -> bool {
    (20..=200).contains(&t.len()) && t.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

pub fn lies(ablage: &dyn Ablage) -> Result<Option<String>, String> {
    Ok(ablage.lies(EINTRAG)?.map(|b| String::from_utf8_lossy(&b).into_owned()).filter(|t| ist_token(t)))
}

pub fn speichere(ablage: &dyn Ablage, token: &str) -> Result<(), String> {
    if !ist_token(token) {
        return Err("Token ungültig".into());
    }
    ablage.schreibe(EINTRAG, token.as_bytes())
}

#[tauri::command]
pub fn server_token_lesen() -> Result<Option<String>, String> {
    lies(&tresor::standard())
}

#[tauri::command]
pub fn server_token_speichern(token: String) -> Result<(), String> {
    speichere(&tresor::standard(), &token)
}

#[tauri::command]
pub fn server_token_loeschen() -> Result<(), String> {
    tresor::standard().loesche(EINTRAG)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tresor::Arbeitsspeicher;

    #[test]
    fn token_speichern_lesen_loeschen() {
        let a = Arbeitsspeicher::default();
        assert_eq!(lies(&a).unwrap(), None);
        let t = "AbC-def_0123456789abcdefghijklmnopqrstuvwxy";
        speichere(&a, t).unwrap();
        assert_eq!(lies(&a).unwrap().as_deref(), Some(t));
        // die OneDrive-Anmeldung bleibt unberührt
        tresor::speichere_gross(&a, b"onedrive").unwrap();
        a.loesche(EINTRAG).unwrap();
        assert_eq!(lies(&a).unwrap(), None);
        assert_eq!(tresor::lies_gross(&a).unwrap().unwrap(), b"onedrive");
    }

    #[test]
    fn nur_tokens_im_format_des_servers() {
        let a = Arbeitsspeicher::default();
        assert!(speichere(&a, "kurz").is_err());
        assert!(speichere(&a, "mit leer zeichen und noch mehr text").is_err());
        assert!(speichere(&a, &"x".repeat(201)).is_err());
        assert!(ist_token(&"x".repeat(43)));
    }
}
