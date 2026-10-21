//! Anmeldung mit Microsoft über den System-Browser (Authorization Code + PKCE).
//!
//! Die Oberfläche (src/konto/windows.ts) steuert den Ablauf; hier liegt, was die WebView nicht
//! kann oder nicht soll:
//! - ein Mini-Server auf `127.0.0.1:<Port>`, der den Rücksprung (`http://localhost:<Port>/?code=…`)
//!   entgegennimmt (Loopback-Umleitung, RFC 8252),
//! - Token-Anfragen an Microsoft ohne Origin-Header (die WebView schickt einen, und Microsoft
//!   lehnt ihn für Registrierungen ohne SPA-Plattform ab),
//! - die Anmeldedaten in der Windows-Anmeldeinformationsverwaltung (tresor.rs).

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::tresor;

/// So lange wartet die App auf den Rücksprung aus dem Browser.
const WARTEZEIT: Duration = Duration::from_secs(5 * 60);
const LOGIN_PREFIX: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?";
const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";

/// Zustand des Mini-Servers (immer nur eine Anmeldung gleichzeitig).
#[derive(Default)]
pub struct Lauscher {
    server: Mutex<Option<TcpListener>>,
    /// Abbruch-Marke der gerade offenen Anmeldung; jede neue Anmeldung bekommt eine frische.
    abbruch: Mutex<Arc<AtomicBool>>,
}

/// Anmeldedaten, wie sie gespeichert werden (das Zugriffstoken bleibt im Arbeitsspeicher der App).
#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct Anmeldung {
    pub client_id: String,
    pub refresh_token: String,
    pub name: String,
    pub benutzername: String,
}

#[derive(Serialize)]
pub struct TokenAntwort {
    pub status: u16,
    pub text: String,
}

/// Aus der ersten Zeile einer HTTP-Anfrage das Ziel (`/?code=…`) lesen; nur GET.
pub fn ziel_aus_anfrage(anfrage: &str) -> Option<String> {
    let zeile = anfrage.lines().next()?;
    let mut teile = zeile.split_whitespace();
    if teile.next()? != "GET" {
        return None;
    }
    let ziel = teile.next()?;
    ziel.starts_with('/').then(|| ziel.to_string())
}

/// Gehört die Anfrage zum Rücksprung von Microsoft (Code oder Fehler)? Anderes (z. B.
/// /favicon.ico) wird ignoriert.
pub fn ist_rueckkehr(ziel: &str) -> bool {
    match ziel.split_once('?') {
        Some((_, q)) => q.split('&').any(|p| p.starts_with("code=") || p.starts_with("error=")),
        None => false,
    }
}

const SEITE: &str = "<!doctype html><html lang=\"de\"><meta charset=\"utf-8\"><title>WEP</title>\
<body style=\"font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#222\">\
<h1 style=\"color:#2e6640\">Anmeldung abgeschlossen</h1>\
<p>Sie können dieses Browserfenster schließen und zur WEP-App zurückkehren.</p></body></html>";

fn antworte(strom: &mut TcpStream, status: &str, body: &str) {
    let text = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\
         Cache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = strom.write_all(text.as_bytes());
    let _ = strom.flush();
}

/// Liest den Kopf einer Anfrage (bis zur Leerzeile, höchstens 8 KB).
fn lies_kopf(strom: &mut TcpStream) -> String {
    let _ = strom.set_read_timeout(Some(Duration::from_secs(5)));
    let mut puffer = [0u8; 8192];
    let mut n = 0;
    while n < puffer.len() {
        match strom.read(&mut puffer[n..]) {
            Ok(0) | Err(_) => break,
            Ok(k) => {
                n += k;
                if puffer[..n].windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
        }
    }
    String::from_utf8_lossy(&puffer[..n]).into_owned()
}

/// Wartet, bis der Browser den Rücksprung liefert. Gibt das Ziel (`/?code=…&state=…`) zurück.
fn warte_auf_rueckkehr(server: &TcpListener, abbruch: &AtomicBool, frist: Duration) -> Result<String, String> {
    server.set_nonblocking(true).map_err(|e| e.to_string())?;
    let ende = Instant::now() + frist;
    loop {
        if abbruch.load(Ordering::SeqCst) {
            return Err("Anmeldung abgebrochen".into());
        }
        if Instant::now() > ende {
            return Err("Zeitüberschreitung: Der Browser hat nicht geantwortet.".into());
        }
        match server.accept() {
            Ok((mut strom, _)) => {
                let _ = strom.set_nonblocking(false);
                let kopf = lies_kopf(&mut strom);
                match ziel_aus_anfrage(&kopf) {
                    Some(ziel) if ist_rueckkehr(&ziel) => {
                        antworte(&mut strom, "200 OK", SEITE);
                        return Ok(ziel);
                    }
                    _ => antworte(&mut strom, "404 Not Found", "Nicht gefunden"),
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(50)),
            Err(e) => return Err(e.to_string()),
        }
    }
}

/// Öffnet den Mini-Server auf einem freien Port und gibt ihn zurück.
#[tauri::command]
pub fn anmeldung_lauschen(lauscher: State<'_, Lauscher>) -> Result<u16, String> {
    let server = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| format!("Kein freier Port: {e}"))?;
    let port = server.local_addr().map_err(|e| e.to_string())?.port();
    {
        // Eine noch wartende frühere Anmeldung wird beendet; die neue bekommt eine frische Marke.
        let mut marke = lauscher.abbruch.lock().map_err(|e| e.to_string())?;
        marke.store(true, Ordering::SeqCst);
        *marke = Arc::new(AtomicBool::new(false));
    }
    *lauscher.server.lock().map_err(|e| e.to_string())? = Some(server);
    Ok(port)
}

/// Wartet auf den Rücksprung und gibt dessen Ziel zurück. Danach ist der Server zu.
#[tauri::command]
pub async fn anmeldung_warten(app: tauri::AppHandle, lauscher: State<'_, Lauscher>) -> Result<String, String> {
    let server = lauscher
        .server
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or("Keine Anmeldung offen")?;
    let abbruch = Arc::clone(&*lauscher.abbruch.lock().map_err(|e| e.to_string())?);
    let ziel = tauri::async_runtime::spawn_blocking(move || warte_auf_rueckkehr(&server, &abbruch, WARTEZEIT))
        .await
        .map_err(|e| format!("Interner Fehler beim Warten: {e}"))?;
    // Zurück in den Vordergrund: der Browser war zuletzt vorn
    if let Some(fenster) = app.get_webview_window("main") {
        let _ = fenster.unminimize();
        let _ = fenster.set_focus();
    }
    ziel
}

#[tauri::command]
pub fn anmeldung_abbrechen(lauscher: State<'_, Lauscher>) {
    if let Ok(marke) = lauscher.abbruch.lock() {
        marke.store(true, Ordering::SeqCst);
    }
    if let Ok(mut s) = lauscher.server.lock() {
        *s = None;
    }
}

/// Öffnet die Microsoft-Anmeldeseite im Standardbrowser (nur diese Adresse ist erlaubt).
#[tauri::command]
pub fn anmeldung_browser(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with(LOGIN_PREFIX) {
        return Err("Nur die Microsoft-Anmeldung darf geöffnet werden".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| format!("Browser lässt sich nicht öffnen: {e}"))
}

/// Token-Anfrage an Microsoft (Code-Tausch oder Erneuerung), ohne Origin-Header.
#[tauri::command]
pub async fn token_anfrage(url: String, formular: HashMap<String, String>) -> Result<TokenAntwort, String> {
    if url != TOKEN_URL {
        return Err("Nur der Microsoft-Token-Endpunkt ist erlaubt".into());
    }
    let antwort = reqwest::Client::new()
        .post(&url)
        .form(&formular)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Keine Verbindung zu Microsoft: {e}"))?;
    let status = antwort.status().as_u16();
    let text = antwort.text().await.map_err(|e| e.to_string())?;
    Ok(TokenAntwort { status, text })
}

#[tauri::command]
pub fn anmeldung_lesen() -> Result<Anmeldung, String> {
    let ablage = tresor::standard();
    Ok(match tresor::lies_gross(&ablage)? {
        Some(b) => serde_json::from_slice(&b).unwrap_or_default(),
        None => Anmeldung::default(),
    })
}

#[tauri::command]
pub fn anmeldung_speichern(daten: Anmeldung) -> Result<(), String> {
    let json = serde_json::to_vec(&daten).map_err(|e| e.to_string())?;
    tresor::speichere_gross(&tresor::standard(), &json)
}

#[tauri::command]
pub fn anmeldung_loeschen() -> Result<(), String> {
    tresor::loesche_gross(&tresor::standard())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn liest_ziel_aus_get() {
        assert_eq!(
            ziel_aus_anfrage("GET /?code=abc&state=x HTTP/1.1\r\nHost: localhost\r\n\r\n").as_deref(),
            Some("/?code=abc&state=x")
        );
        assert_eq!(ziel_aus_anfrage("POST / HTTP/1.1\r\n\r\n"), None);
        assert_eq!(ziel_aus_anfrage("GET http://x/ HTTP/1.1\r\n\r\n"), None);
        assert_eq!(ziel_aus_anfrage(""), None);
    }

    #[test]
    fn erkennt_rueckkehr() {
        assert!(ist_rueckkehr("/?code=abc&state=x"));
        assert!(ist_rueckkehr("/?state=x&error=access_denied"));
        assert!(!ist_rueckkehr("/favicon.ico"));
        assert!(!ist_rueckkehr("/?foo=bar"));
    }

    fn anfrage(port: u16, pfad: &str) -> String {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        write!(s, "GET {pfad} HTTP/1.1\r\nHost: localhost:{port}\r\n\r\n").unwrap();
        let mut antwort = String::new();
        s.read_to_string(&mut antwort).unwrap();
        antwort
    }

    #[test]
    fn server_nimmt_rueckkehr_an_und_ignoriert_anderes() {
        let server = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = server.local_addr().unwrap().port();
        let abbruch = AtomicBool::new(false);
        std::thread::scope(|s| {
            let warten = s.spawn(|| warte_auf_rueckkehr(&server, &abbruch, Duration::from_secs(10)));
            assert!(anfrage(port, "/favicon.ico").starts_with("HTTP/1.1 404"));
            let ok = anfrage(port, "/?code=C0DE&state=S");
            assert!(ok.starts_with("HTTP/1.1 200") && ok.contains("Anmeldung abgeschlossen"));
            assert_eq!(warten.join().unwrap().unwrap(), "/?code=C0DE&state=S");
        });
    }

    #[test]
    fn abbruch_beendet_das_warten() {
        let server = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let abbruch = AtomicBool::new(true);
        let e = warte_auf_rueckkehr(&server, &abbruch, Duration::from_secs(10)).unwrap_err();
        assert!(e.contains("abgebrochen"));
    }

    #[test]
    fn zeitueberschreitung() {
        let server = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let abbruch = AtomicBool::new(false);
        let e = warte_auf_rueckkehr(&server, &abbruch, Duration::from_millis(100)).unwrap_err();
        assert!(e.contains("Zeitüberschreitung"));
    }
}
