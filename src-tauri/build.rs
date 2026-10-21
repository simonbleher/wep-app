use std::fs;

fn main() {
    // Nummer der Windows-Hülle (siehe docs/WINDOWS.md): gehört zum Programm und wird eingebaut.
    println!("cargo:rerun-if-changed=huelle-version.txt");
    let huelle = fs::read_to_string("huelle-version.txt").expect("huelle-version.txt fehlt");
    let huelle: u32 = huelle.trim().parse().expect("huelle-version.txt muss eine ganze Zahl enthalten");
    assert!(huelle >= 1, "huelle-version.txt muss mindestens 1 sein");
    println!("cargo:rustc-env=WEP_HUELLE={huelle}");
    tauri_build::build()
}
