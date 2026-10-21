//! Sicherer Speicher für die Anmeldedaten.
//!
//! Unter Windows liegen sie in der Anmeldeinformationsverwaltung (Credential Manager, mit dem
//! Windows-Konto verschlüsselt), nicht als Datei und nicht im Klartext. Ein Eintrag fasst nur
//! rund 2,5 KB; ein Microsoft-Refresh-Token kann länger sein. Darum wird der Inhalt in Stücke
//! geteilt (`teile`) und auf mehrere Einträge verteilt.
//!
//! Auf anderen Systemen (Entwicklung, Tests) gibt es nur einen Speicher im Arbeitsspeicher.

use std::collections::HashMap;
use std::sync::Mutex;

/// Größe eines Stücks in Bytes (Grenze von Windows: 2560).
const STUECK: usize = 1800;
#[cfg(windows)]
const DIENST: &str = "de.wep.app";
const ANZAHL: &str = "anmeldung-anzahl";

/// Ein Ablageort für kleine Byte-Blöcke unter einem Namen.
pub trait Ablage {
    fn lies(&self, name: &str) -> Result<Option<Vec<u8>>, String>;
    fn schreibe(&self, name: &str, wert: &[u8]) -> Result<(), String>;
    fn loesche(&self, name: &str) -> Result<(), String>;
}

impl<T: Ablage + ?Sized> Ablage for &T {
    fn lies(&self, name: &str) -> Result<Option<Vec<u8>>, String> {
        (**self).lies(name)
    }
    fn schreibe(&self, name: &str, wert: &[u8]) -> Result<(), String> {
        (**self).schreibe(name, wert)
    }
    fn loesche(&self, name: &str) -> Result<(), String> {
        (**self).loesche(name)
    }
}

/// Teilt Daten in Stücke von höchstens `groesse` Bytes (leere Daten ergeben kein Stück).
pub fn teile(daten: &[u8], groesse: usize) -> Vec<Vec<u8>> {
    daten.chunks(groesse.max(1)).map(|c| c.to_vec()).collect()
}

fn stueck_name(i: usize) -> String {
    format!("anmeldung-{i}")
}

/// Speichert `daten` verteilt auf mehrere Einträge; alte Reste werden entfernt.
pub fn speichere_gross(ablage: &dyn Ablage, daten: &[u8]) -> Result<(), String> {
    let alt = anzahl(ablage)?;
    let stuecke = teile(daten, STUECK);
    for (i, s) in stuecke.iter().enumerate() {
        ablage.schreibe(&stueck_name(i), s)?;
    }
    ablage.schreibe(ANZAHL, stuecke.len().to_string().as_bytes())?;
    for i in stuecke.len()..alt {
        ablage.loesche(&stueck_name(i))?;
    }
    Ok(())
}

fn anzahl(ablage: &dyn Ablage) -> Result<usize, String> {
    Ok(match ablage.lies(ANZAHL)? {
        Some(b) => String::from_utf8_lossy(&b).trim().parse().unwrap_or(0),
        None => 0,
    })
}

/// Liest, was `speichere_gross` abgelegt hat; `None`, wenn nichts (oder nicht alles) da ist.
pub fn lies_gross(ablage: &dyn Ablage) -> Result<Option<Vec<u8>>, String> {
    let n = anzahl(ablage)?;
    if n == 0 {
        return Ok(None);
    }
    let mut alles = Vec::new();
    for i in 0..n {
        match ablage.lies(&stueck_name(i))? {
            Some(s) => alles.extend(s),
            None => return Ok(None),
        }
    }
    Ok(Some(alles))
}

pub fn loesche_gross(ablage: &dyn Ablage) -> Result<(), String> {
    let n = anzahl(ablage)?;
    for i in 0..n {
        ablage.loesche(&stueck_name(i))?;
    }
    ablage.loesche(ANZAHL)
}

/// Speicher im Arbeitsspeicher (Tests, Entwicklung außerhalb von Windows).
#[derive(Default)]
#[cfg_attr(windows, allow(dead_code))]
pub struct Arbeitsspeicher(Mutex<HashMap<String, Vec<u8>>>);

impl Ablage for Arbeitsspeicher {
    fn lies(&self, name: &str) -> Result<Option<Vec<u8>>, String> {
        Ok(self.0.lock().map_err(|e| e.to_string())?.get(name).cloned())
    }
    fn schreibe(&self, name: &str, wert: &[u8]) -> Result<(), String> {
        self.0.lock().map_err(|e| e.to_string())?.insert(name.to_string(), wert.to_vec());
        Ok(())
    }
    fn loesche(&self, name: &str) -> Result<(), String> {
        self.0.lock().map_err(|e| e.to_string())?.remove(name);
        Ok(())
    }
}

/// Windows-Anmeldeinformationsverwaltung.
#[cfg(windows)]
pub struct Anmeldeinformationen;

#[cfg(windows)]
impl Anmeldeinformationen {
    fn eintrag(name: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(DIENST, name).map_err(|e| e.to_string())
    }
}

#[cfg(windows)]
impl Ablage for Anmeldeinformationen {
    fn lies(&self, name: &str) -> Result<Option<Vec<u8>>, String> {
        match Self::eintrag(name)?.get_secret() {
            Ok(b) => Ok(Some(b)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    fn schreibe(&self, name: &str, wert: &[u8]) -> Result<(), String> {
        Self::eintrag(name)?.set_secret(wert).map_err(|e| e.to_string())
    }
    fn loesche(&self, name: &str) -> Result<(), String> {
        match Self::eintrag(name)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

/// Die Ablage, die die App benutzt.
#[cfg(windows)]
pub fn standard() -> Anmeldeinformationen {
    Anmeldeinformationen
}

#[cfg(not(windows))]
pub fn standard() -> &'static Arbeitsspeicher {
    use std::sync::OnceLock;
    static A: OnceLock<Arbeitsspeicher> = OnceLock::new();
    A.get_or_init(Arbeitsspeicher::default)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn teilt_in_stuecke() {
        assert_eq!(teile(b"abcde", 2), vec![b"ab".to_vec(), b"cd".to_vec(), b"e".to_vec()]);
        assert!(teile(b"", 2).is_empty());
    }

    #[test]
    fn grosse_daten_ueber_mehrere_eintraege() {
        let a = Arbeitsspeicher::default();
        let daten: Vec<u8> = (0..5000u32).map(|i| (i % 251) as u8).collect();
        speichere_gross(&a, &daten).unwrap();
        assert_eq!(lies_gross(&a).unwrap().unwrap(), daten);
        // kürzere Daten räumen die übrigen Stücke ab
        speichere_gross(&a, b"kurz").unwrap();
        assert_eq!(lies_gross(&a).unwrap().unwrap(), b"kurz");
        assert!(a.lies("anmeldung-1").unwrap().is_none());
        loesche_gross(&a).unwrap();
        assert!(lies_gross(&a).unwrap().is_none());
    }

    #[test]
    fn fehlendes_stueck_ist_nicht_lesbar() {
        let a = Arbeitsspeicher::default();
        speichere_gross(&a, &vec![7u8; 4000]).unwrap();
        a.loesche("anmeldung-1").unwrap();
        assert!(lies_gross(&a).unwrap().is_none());
    }
}
