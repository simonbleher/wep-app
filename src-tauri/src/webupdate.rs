//! Live-Update des Web-Teils ohne neue .exe.
//!
//! Die Oberfläche (src/windows/updateDienst.ts) entscheidet anhand der gehosteten `version.json`,
//! ob es ein neues Paket gibt, und ruft `web_paket_laden`. Hier wird es geladen, auf Prüfsumme
//! geprüft und nach `<Daten>/web/<commit>/` entpackt. Beim nächsten Start liefert die App den Web-Teil
//! von dort statt aus der .exe (`LiveAssets`) – unter demselben Ursprung, damit die Daten
//! (IndexedDB) erhalten bleiben.
//!
//! Rückfall: Das neue Paket gilt erst als gut, wenn die Oberfläche `web_start_gemeldet` ruft.
//! Kommt die Meldung nicht binnen `FRIST`, oder war schon der vorige Start ohne Meldung, wird das
//! Paket gesperrt und wieder der Web-Teil aus der .exe geliefert.

use std::borrow::Cow;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::utils::assets::{AssetKey, AssetsIter, CspHash};
use tauri::{App, AppHandle, Assets, Manager, Runtime, State};

/// Nur von hier werden Pakete geladen (gehostete Seite, siehe docs/HOSTING.md).
const PAKET_BASIS: &str = "https://wep-pankow.pages.dev/updates";
/// So lange darf der Start einer neuen Fassung dauern, bis die Oberfläche „bereit“ meldet.
const FRIST: Duration = Duration::from_secs(20);
/// Obergrenzen gegen kaputte oder böswillige Pakete.
const MAX_PAKET: usize = 150 * 1024 * 1024;
const MAX_ENTPACKT: u64 = 400 * 1024 * 1024;

/// Nummer der Windows-Hülle (src-tauri/huelle-version.txt, siehe docs/WINDOWS.md).
pub const HUELLE: u32 = {
    // build.rs schreibt die Zahl als Text in WEP_HUELLE
    match u32::from_str_radix(env!("WEP_HUELLE"), 10) {
        Ok(n) => n,
        Err(_) => 0,
    }
};

#[derive(Serialize, Deserialize, Default, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Zustand {
    /// Commit des Pakets, das gerade geliefert wird (`None` = Web-Teil aus der .exe).
    pub aktiv: Option<String>,
    /// Geladen, wird beim nächsten Start aktiv.
    pub naechste: Option<String>,
    /// Aktives Paket, dessen Start noch nicht gemeldet wurde.
    pub unbestaetigt: Option<String>,
    /// Pakete, die sich nicht starten ließen (werden nicht erneut geladen).
    pub fehlgeschlagen: Vec<String>,
}

/// Beim Start: ein nicht bestätigter Start zählt als Fehlstart; ein geladenes Paket wird aktiv.
pub fn beim_start(z: &mut Zustand) {
    if let Some(c) = z.unbestaetigt.take() {
        sperre(z, &c);
    }
    if let Some(n) = z.naechste.take() {
        if !z.fehlgeschlagen.contains(&n) {
            z.aktiv = Some(n.clone());
            z.unbestaetigt = Some(n);
        }
    }
}

fn sperre(z: &mut Zustand, commit: &str) {
    if !z.fehlgeschlagen.iter().any(|c| c == commit) {
        z.fehlgeschlagen.push(commit.to_string());
    }
    if z.aktiv.as_deref() == Some(commit) {
        z.aktiv = None;
    }
    if z.naechste.as_deref() == Some(commit) {
        z.naechste = None;
    }
}

/// Commit-Kennung: nur Hex, 7 bis 64 Zeichen (wird Teil von Pfad und Adresse).
pub fn gueltiger_commit(c: &str) -> bool {
    (7..=64).contains(&c.len()) && c.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Entpackt ein Paket nach `ziel`. Einträge mit unsicheren Pfaden (`..`, absolut) brechen ab.
pub fn entpacke(zip_bytes: &[u8], ziel: &Path) -> Result<(), String> {
    let mut archiv = zip::ZipArchive::new(Cursor::new(zip_bytes)).map_err(|e| format!("Paket unlesbar: {e}"))?;
    let mut gesamt: u64 = 0;
    for i in 0..archiv.len() {
        let mut eintrag = archiv.by_index(i).map_err(|e| e.to_string())?;
        let rel = eintrag.enclosed_name().ok_or_else(|| {
            // zip 9: der Name kann selbst ungültig sein (kein UTF-8 o. Ä.)
            format!("Unsicherer Pfad im Paket: {}", eintrag.name().map(|n| n.into_owned()).unwrap_or_else(|_| "?".into()))
        })?;
        gesamt += eintrag.size();
        if gesamt > MAX_ENTPACKT {
            return Err("Paket zu groß".into());
        }
        let pfad = ziel.join(rel);
        if eintrag.is_dir() {
            fs::create_dir_all(&pfad).map_err(|e| e.to_string())?;
        } else {
            if let Some(eltern) = pfad.parent() {
                fs::create_dir_all(eltern).map_err(|e| e.to_string())?;
            }
            let mut aus = fs::File::create(&pfad).map_err(|e| e.to_string())?;
            std::io::copy(&mut eintrag, &mut aus).map_err(|e| e.to_string())?;
        }
    }
    if !ziel.join("index.html").is_file() {
        return Err("Paket enthält keine index.html".into());
    }
    Ok(())
}

/// Gemeinsamer Zustand: Speicherort, gemerkter Stand, derzeit gelieferter Ordner.
pub struct Live {
    wurzel: PathBuf,
    zustand: Mutex<Zustand>,
    aktiver_ordner: RwLock<Option<PathBuf>>,
}

impl Live {
    /// Liest den gemerkten Stand, wendet `beim_start` an und räumt alte Pakete auf.
    pub fn start(daten: &Path) -> Arc<Live> {
        let wurzel = daten.join("web");
        let mut z: Zustand = fs::read(wurzel.join("zustand.json"))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        beim_start(&mut z);
        // Ein aktives Paket, dessen Ordner fehlt oder kaputt ist, gilt als Fehlstart.
        if let Some(c) = z.aktiv.clone() {
            if !wurzel.join(&c).join("index.html").is_file() {
                sperre(&mut z, &c);
                z.unbestaetigt = None;
            }
        }
        let live = Arc::new(Live {
            aktiver_ordner: RwLock::new(z.aktiv.as_ref().map(|c| wurzel.join(c))),
            zustand: Mutex::new(z),
            wurzel,
        });
        live.speichere_und_raeume_auf();
        live
    }

    fn speichere_und_raeume_auf(&self) {
        let z = self.zustand.lock().unwrap().clone();
        if fs::create_dir_all(&self.wurzel).is_ok() {
            if let Ok(json) = serde_json::to_vec_pretty(&z) {
                let tmp = self.wurzel.join("zustand.json.tmp");
                if fs::write(&tmp, json).is_ok() {
                    let _ = fs::rename(&tmp, self.wurzel.join("zustand.json"));
                }
            }
        }
        // Alles löschen, was weder aktiv noch als Nächstes vorgemerkt ist.
        if let Ok(liste) = fs::read_dir(&self.wurzel) {
            for e in liste.flatten() {
                let name = e.file_name().to_string_lossy().into_owned();
                if e.path().is_dir() && z.aktiv.as_deref() != Some(&name) && z.naechste.as_deref() != Some(&name) {
                    let _ = fs::remove_dir_all(e.path());
                }
            }
        }
    }

    /// Ordner des aktiven Pakets, falls eines läuft.
    pub fn ordner(&self) -> Option<PathBuf> {
        self.aktiver_ordner.read().unwrap().clone()
    }

    pub fn zustand(&self) -> Zustand {
        self.zustand.lock().unwrap().clone()
    }

    /// Die Oberfläche steht: das aktive Paket gilt als gut.
    pub fn start_gemeldet(&self) {
        let mut z = self.zustand.lock().unwrap();
        if z.unbestaetigt.take().is_some() {
            drop(z);
            self.speichere_und_raeume_auf();
        }
    }

    /// Fristablauf ohne Meldung: Paket sperren und auf die .exe zurückfallen. `true`, wenn zurückgefallen wurde.
    pub fn rueckfall_wenn_unbestaetigt(&self) -> bool {
        let mut z = self.zustand.lock().unwrap();
        let Some(c) = z.unbestaetigt.take() else { return false };
        sperre(&mut z, &c);
        drop(z);
        *self.aktiver_ordner.write().unwrap() = None;
        self.speichere_und_raeume_auf();
        true
    }

    fn merke_naechste(&self, commit: &str) {
        self.zustand.lock().unwrap().naechste = Some(commit.to_string());
        self.speichere_und_raeume_auf();
    }
}

/// Liest eine Datei des aktiven Pakets. Tauri übergibt Schlüssel mit führendem „/“
/// (`/index.html`, `/assets/x.js`); der wird entfernt. Danach sind nur normale Pfadteile erlaubt
/// (kein „..“, kein Laufwerk).
pub fn paket_datei(ordner: &Path, schluessel: &str) -> Option<Cow<'static, [u8]>> {
    let rel = Path::new(schluessel.trim_start_matches(['/', '\\']));
    if rel.as_os_str().is_empty() || rel.components().any(|c| !matches!(c, std::path::Component::Normal(_))) {
        return None;
    }
    fs::read(ordner.join(rel)).ok().map(Cow::Owned)
}

/// Liefert die Dateien des aktiven Pakets; ohne Paket (oder bei Rückfall) die der .exe.
pub struct LiveAssets<R: Runtime> {
    innen: Box<dyn Assets<R>>,
    live: Arc<Live>,
}

impl<R: Runtime> LiveAssets<R> {
    pub fn neu(innen: Box<dyn Assets<R>>, live: Arc<Live>) -> Self {
        Self { innen, live }
    }
}

impl<R: Runtime> Assets<R> for LiveAssets<R> {
    fn setup(&self, app: &App<R>) {
        self.innen.setup(app);
    }

    fn get(&self, key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        match self.live.ordner() {
            Some(ordner) => paket_datei(&ordner, key.as_ref()),
            None => self.innen.get(key),
        }
    }

    fn iter(&self) -> Box<AssetsIter<'_>> {
        self.innen.iter()
    }

    fn csp_hashes(&self, html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        self.innen.csp_hashes(html_path)
    }
}

/// Platzhalter, solange `set_assets` die echten Assets herausgibt.
pub struct Leer;

impl<R: Runtime> Assets<R> for Leer {
    fn get(&self, _key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        None
    }
    fn iter(&self) -> Box<AssetsIter<'_>> {
        Box::new(std::iter::empty())
    }
    fn csp_hashes(&self, _html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        Box::new(std::iter::empty())
    }
}

/// Nach `FRIST` ohne Meldung der Oberfläche: zurückfallen und die Seite neu laden.
pub fn wache<R: Runtime>(app: AppHandle<R>, live: Arc<Live>) {
    if live.zustand().unbestaetigt.is_none() {
        return;
    }
    std::thread::spawn(move || {
        std::thread::sleep(FRIST);
        if live.rueckfall_wenn_unbestaetigt() {
            if let Some(fenster) = app.get_webview_window("main") {
                let _ = fenster.eval("window.location.reload()");
            }
        }
    });
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebInfo {
    pub zustand: Zustand,
    pub huelle: u32,
    pub programm: String,
}

#[tauri::command]
pub fn web_info(app: AppHandle, live: State<'_, Arc<Live>>) -> WebInfo {
    WebInfo { zustand: live.zustand(), huelle: HUELLE, programm: app.package_info().version.to_string() }
}

#[tauri::command]
pub fn web_start_gemeldet(live: State<'_, Arc<Live>>) {
    live.start_gemeldet();
}

/// Lädt ein Web-Paket, prüft die SHA-256 und legt es für den nächsten Start bereit.
#[tauri::command]
pub async fn web_paket_laden(commit: String, sha256: String, live: State<'_, Arc<Live>>) -> Result<(), String> {
    if !gueltiger_commit(&commit) {
        return Err("Ungültige Commit-Kennung".into());
    }
    if sha256.len() != 64 || !sha256.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Ungültige Prüfsumme".into());
    }
    let url = format!("{PAKET_BASIS}/{commit}.zip");
    let antwort = reqwest::Client::new()
        .get(&url)
        .timeout(Duration::from_secs(300))
        .send()
        .await
        .map_err(|e| format!("Download fehlgeschlagen: {e}"))?;
    if !antwort.status().is_success() {
        return Err(format!("Download fehlgeschlagen (HTTP {})", antwort.status().as_u16()));
    }
    let bytes = antwort.bytes().await.map_err(|e| format!("Download fehlgeschlagen: {e}"))?;
    if bytes.len() > MAX_PAKET {
        return Err("Paket zu groß".into());
    }
    if format!("{:x}", Sha256::digest(&bytes)) != sha256.to_lowercase() {
        return Err("Prüfsumme stimmt nicht – Paket verworfen".into());
    }
    let live = Arc::clone(live.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let ziel = live.wurzel.join(&commit);
        let tmp = live.wurzel.join(format!("{commit}.tmp"));
        let _ = fs::remove_dir_all(&tmp);
        let _ = fs::remove_dir_all(&ziel);
        fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
        if let Err(e) = entpacke(&bytes, &tmp) {
            let _ = fs::remove_dir_all(&tmp);
            return Err(e);
        }
        fs::rename(&tmp, &ziel).map_err(|e| e.to_string())?;
        live.merke_naechste(&commit);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn paket(dateien: &[(&str, &str)]) -> Vec<u8> {
        let mut z = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (name, inhalt) in dateien {
            z.start_file(*name, zip::write::SimpleFileOptions::default()).unwrap();
            z.write_all(inhalt.as_bytes()).unwrap();
        }
        z.finish().unwrap().into_inner()
    }

    fn tempdir(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("wep-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn neues_paket_wird_beim_start_aktiv_aber_unbestaetigt() {
        let mut z = Zustand { naechste: Some("abc1234".into()), ..Default::default() };
        beim_start(&mut z);
        assert_eq!(z.aktiv.as_deref(), Some("abc1234"));
        assert_eq!(z.unbestaetigt.as_deref(), Some("abc1234"));
        assert!(z.naechste.is_none());
    }

    #[test]
    fn fehlstart_sperrt_das_paket_und_faellt_zurueck() {
        let mut z = Zustand { aktiv: Some("abc1234".into()), unbestaetigt: Some("abc1234".into()), ..Default::default() };
        beim_start(&mut z);
        assert_eq!(z.aktiv, None);
        assert_eq!(z.unbestaetigt, None);
        assert_eq!(z.fehlgeschlagen, vec!["abc1234".to_string()]);
    }

    #[test]
    fn gesperrtes_paket_wird_nicht_wieder_aktiv() {
        let mut z = Zustand { naechste: Some("abc1234".into()), fehlgeschlagen: vec!["abc1234".into()], ..Default::default() };
        beim_start(&mut z);
        assert_eq!(z.aktiv, None);
    }

    #[test]
    fn bestaetigter_start_bleibt() {
        let mut z = Zustand { aktiv: Some("abc1234".into()), ..Default::default() };
        beim_start(&mut z);
        assert_eq!(z.aktiv.as_deref(), Some("abc1234"));
        assert!(z.fehlgeschlagen.is_empty());
    }

    #[test]
    fn commit_kennung() {
        assert!(gueltiger_commit("0f554bf"));
        assert!(gueltiger_commit(&"a".repeat(40)));
        assert!(!gueltiger_commit("abc"));
        assert!(!gueltiger_commit("../../etc"));
        assert!(!gueltiger_commit("ABCDEF1"));
    }

    #[test]
    fn entpackt_normales_paket() {
        let ziel = tempdir("entpacken");
        entpacke(&paket(&[("index.html", "<html>"), ("assets/a.js", "1")]), &ziel).unwrap();
        assert_eq!(fs::read_to_string(ziel.join("assets/a.js")).unwrap(), "1");
        let _ = fs::remove_dir_all(&ziel);
    }

    #[test]
    fn unsicherer_pfad_bricht_ab() {
        let ziel = tempdir("slip");
        let e = entpacke(&paket(&[("index.html", "x"), ("../boese.txt", "x")]), &ziel).unwrap_err();
        assert!(e.contains("Unsicher"));
        assert!(!ziel.parent().unwrap().join("boese.txt").exists());
        let _ = fs::remove_dir_all(&ziel);
    }

    #[test]
    fn paket_ohne_index_wird_abgelehnt() {
        let ziel = tempdir("ohneindex");
        assert!(entpacke(&paket(&[("a.js", "x")]), &ziel).is_err());
        let _ = fs::remove_dir_all(&ziel);
    }

    #[test]
    fn paket_datei_mit_fuehrendem_schraegstrich() {
        let ordner = tempdir("schluessel");
        fs::create_dir_all(ordner.join("assets")).unwrap();
        fs::write(ordner.join("index.html"), "neu").unwrap();
        fs::write(ordner.join("assets").join("a.js"), "js").unwrap();
        // So übergibt Tauri die Schlüssel (AssetKey mit führendem „/“)
        assert_eq!(paket_datei(&ordner, "/index.html").as_deref(), Some(&b"neu"[..]));
        assert_eq!(paket_datei(&ordner, "/assets/a.js").as_deref(), Some(&b"js"[..]));
        assert_eq!(paket_datei(&ordner, "index.html").as_deref(), Some(&b"neu"[..]));
        // Tauri-Schlüssel selbst
        let key = tauri::utils::assets::AssetKey::from("index.html");
        assert_eq!(paket_datei(&ordner, key.as_ref()).as_deref(), Some(&b"neu"[..]));
        assert!(paket_datei(&ordner, "/../geheim.txt").is_none());
        assert!(paket_datei(&ordner, "/").is_none());
        let _ = fs::remove_dir_all(&ordner);
    }

    #[test]
    fn live_start_ueber_dateien() {
        let daten = tempdir("live");
        let paketordner = daten.join("web").join("abc1234");
        fs::create_dir_all(&paketordner).unwrap();
        fs::write(paketordner.join("index.html"), "neu").unwrap();
        fs::write(
            daten.join("web").join("zustand.json"),
            r#"{"naechste":"abc1234","fehlgeschlagen":[]}"#,
        )
        .unwrap();
        // alter Rest wird aufgeräumt
        fs::create_dir_all(daten.join("web").join("alt0000")).unwrap();

        let live = Live::start(&daten);
        assert_eq!(live.ordner(), Some(paketordner.clone()));
        assert!(!daten.join("web").join("alt0000").exists());

        // Ohne Meldung fällt der nächste Start zurück …
        let live2 = Live::start(&daten);
        assert_eq!(live2.ordner(), None);
        assert_eq!(live2.zustand().fehlgeschlagen, vec!["abc1234".to_string()]);
        let _ = fs::remove_dir_all(&daten);
    }

    #[test]
    fn meldung_bestaetigt_das_paket() {
        let daten = tempdir("meldung");
        let p = daten.join("web").join("abc1234");
        fs::create_dir_all(&p).unwrap();
        fs::write(p.join("index.html"), "neu").unwrap();
        fs::write(daten.join("web").join("zustand.json"), r#"{"naechste":"abc1234"}"#).unwrap();
        let live = Live::start(&daten);
        live.start_gemeldet();
        assert!(!live.rueckfall_wenn_unbestaetigt());
        let spaeter = Live::start(&daten);
        assert_eq!(spaeter.ordner(), Some(p));
        let _ = fs::remove_dir_all(&daten);
    }

    #[test]
    fn fristablauf_faellt_zurueck() {
        let daten = tempdir("frist");
        let p = daten.join("web").join("abc1234");
        fs::create_dir_all(&p).unwrap();
        fs::write(p.join("index.html"), "neu").unwrap();
        fs::write(daten.join("web").join("zustand.json"), r#"{"naechste":"abc1234"}"#).unwrap();
        let live = Live::start(&daten);
        assert!(live.rueckfall_wenn_unbestaetigt());
        assert_eq!(live.ordner(), None);
        let _ = fs::remove_dir_all(&daten);
    }
}
