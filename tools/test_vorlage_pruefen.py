"""Tests für tools/vorlage-pruefen.py.

Aufruf:  python -m pytest tools/test_vorlage_pruefen.py
Die Rechentests brauchen LibreOffice (sonst übersprungen), der Test des Korrekturvorschlags braucht `lxml`.
Es werden nur erfundene Eingaben benutzt; docs/WEP_Vorlage.xlsx wird nur gelesen.
"""
from __future__ import annotations

import hashlib
import importlib.util
import sys
import zipfile
from pathlib import Path

import pytest

HIER = Path(__file__).resolve().parent
VORLAGE = HIER.parent / "docs" / "WEP_Vorlage.xlsx"

spec = importlib.util.spec_from_file_location("vorlage_pruefen", HIER / "vorlage-pruefen.py")
vp = importlib.util.module_from_spec(spec)
sys.modules["vorlage_pruefen"] = vp
spec.loader.exec_module(vp)

LO = vp.finde_libreoffice()
braucht_lo = pytest.mark.skipif(LO is None, reason="LibreOffice nicht gefunden")


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def test_katalog_ist_stimmig():
    nrn = [f.nr for f in vp.FUNDE]
    assert len(nrn) == len(set(nrn))
    assert set(nrn) == set(vp.PRUEFUNGEN)
    for f in vp.FUNDE:
        assert f.auswirkung in vp.AUSWIRKUNGEN, f.nr
        assert f.gewissheit in vp.GEWISSHEITEN, f.nr
        assert f.titel and f.problem and f.vorschlag and f.beleg, f.nr
    assert sorted(f.top for f in vp.FUNDE if f.top) == [1, 2, 3, 4, 5]


def test_richtlinientabellen_stimmen_mit_vorlage():
    assert vp.pruefe_tabellen(vp.Mappe(VORLAGE)) == []


def test_formeln_deutsch():
    assert vp.de("=IF(A1>0,ROUND(B1*0.97,2),SUM(C1:C3))") == "=WENN(A1>0;RUNDEN(B1*0,97;2);SUMME(C1:C3))"
    assert vp.de('=IF(A1="a,b","x",1)') == '=WENN(A1="a,b";"x";1)'


def test_hand_rechnung_excel_rundung():
    assert vp.rd(45.225) == 45.23
    assert vp.rd(2.675) == 2.68
    assert vp.rd(-0.005) == -0.01


def test_statische_pruefung_findet_die_bekannten_fehler():
    m, ctx, befunde, _ = vp.pruefe_alles(VORLAGE, mit_rechnung=False)
    for nr in ("F01", "F02", "F03", "F04", "F05", "F06", "F07", "F10", "F11", "F12", "F13", "F17", "F32", "F33", "F34", "F44", "F45"):
        assert befunde[nr].vorhanden is True, nr
    assert sha(VORLAGE) == sha(m.pfad)


def test_keine_zirkelbezuege_in_der_vorlage():
    assert vp.zirkelbezuege(vp.Mappe(VORLAGE)) == []


@braucht_lo
def test_rechentests_gegen_handrechnung():
    m, ctx, befunde, _ = vp.pruefe_alles(VORLAGE, mit_rechnung=True)
    r, s = ctx.r, ctx.soll
    # leere Vorlage: Beispielwerte ergeben −400 €
    assert r("T0", vp.DB, "E28") == -400
    # Anbau A2 und Schuppen (F01, F02)
    assert r("T1", vp.BL, "E35") == pytest.approx(172.80)
    assert s["T1"]["teile"]["A2"]["betrag"] == pytest.approx(168.90)
    assert r("T1", vp.BL, "K81") == pytest.approx(12199.00)
    assert s["T1"]["K81"] == pytest.approx(11869.90)
    # Teile, die richtig rechnen, stimmen mit der Handrechnung überein
    for k, zelle in (("L", "E17"), ("A1", "E26"), ("S", "E52")):
        assert r("T1", vp.BL, zelle) == pytest.approx(s["T1"]["teile"][k]["betrag"]), k
    assert r("T1", vp.BL, "K44") == pytest.approx(s["T1"]["gwh"])
    # Außenanlagen und Aufwuchs mit allen Zeilen voll
    assert r("T2", vp.AA, "L46") == pytest.approx(s["T2"]["AA"])
    assert r("T2", vp.AW2, "L46") == pytest.approx(s["T2"]["AW2"])
    # Laubenvorplatz (F03, F05), Randfälle
    assert r("T3", vp.BL, "K71") == 0 and s["T3"]["K71"] > 0
    assert r("T4", vp.BL, "K71") == 0 and s["T4"]["K71"] > 0
    assert r("T5", vp.BL, "K75") < 0 and r("T5", vp.BL, "K79") < 0
    assert r("T5", vp.BL, "E24") == 0 and r("T5", vp.BL, "E33") == 0
    assert vp.ist_fehlerwert(r("T5", vp.BL, "K53"))
    assert not ctx.lauf.szenarien["T1"].fehlerzellen and not ctx.lauf.szenarien["T2"].fehlerzellen


def test_korrekturvorschlag(tmp_path):
    pytest.importorskip("lxml")
    ziel = tmp_path / "kv.xlsx"
    vorher = sha(VORLAGE)
    protokoll = vp.schreibe_korrekturvorschlag(VORLAGE, ziel)
    assert sha(VORLAGE) == vorher, "Das Original darf nicht verändert werden"
    assert protokoll
    with zipfile.ZipFile(ziel) as z, zipfile.ZipFile(VORLAGE) as o:
        assert z.testzip() is None
        # Kontrollkästchen und Zeichnungen bleiben erhalten
        assert {n for n in o.namelist() if "ctrlProps" in n or "drawings/drawing" in n} <= set(z.namelist())
        assert "xl/calcChain.xml" not in z.namelist()
        from lxml import etree
        for n in z.namelist():
            if n.endswith((".xml", ".rels", ".vml")):
                etree.fromstring(z.read(n))
    import openpyxl
    wb = openpyxl.load_workbook(ziel)
    assert wb[vp.BL]["C33"].value == "=$H$32"
    assert wb[vp.BL]["K81"].value == "=K61+K71+K75+K77+K79"
    assert wb[vp.BL]["C64"].value == "=I63"
    assert wb[vp.BE]["K21"].value == "=ROUND(F21*H21*J21,2)"
    assert wb[vp.BL]["C33"].comment is not None and wb[vp.BL]["C33"].comment.text.startswith("F01")
    assert wb[vp.BL]["C33"].fill.fgColor.rgb == "FFFFFF00"
    # alles, was statisch prüfbar und umgesetzt ist, gilt als behoben
    _, _, befunde, _ = vp.pruefe_alles(ziel, mit_rechnung=False)
    for nr in ("F01", "F02", "F03", "F04", "F05", "F06", "F07", "F10", "F11", "F12", "F13", "F16", "F17", "F33", "F34", "F37", "F43", "F44", "F45"):
        assert befunde[nr].vorhanden is False, (nr, befunde[nr].beleg)


@braucht_lo
def test_korrekturvorschlag_rechnet_richtig(tmp_path):
    pytest.importorskip("lxml")
    ziel = tmp_path / "kv.xlsx"
    vp.schreibe_korrekturvorschlag(VORLAGE, ziel)
    _, ctx, befunde, _ = vp.pruefe_alles(ziel, mit_rechnung=True, lo_pfad=LO)
    assert ctx.r("T0", vp.DB, "E28") == 0
    assert ctx.r("T1", vp.BL, "E35") == pytest.approx(ctx.soll["T1"]["teile"]["A2"]["betrag"])
    assert ctx.r("T1", vp.BL, "K81") == pytest.approx(ctx.soll["T1"]["K81"])
    assert ctx.r("T3", vp.BL, "K71") == pytest.approx(ctx.soll["T3"]["K71"])
    assert ctx.r("T4", vp.BL, "K71") == pytest.approx(ctx.soll["T4"]["K71"])
    assert ctx.r("T2", vp.BE, "K24") == pytest.approx(ctx.soll["T2"]["BE1"])
    assert ctx.r("T8", vp.DB, "E23") == pytest.approx(ctx.r("T8", vp.AW2, "L46"))
    for nr in ("F01", "F02", "F03", "F04", "F05", "F06", "F07", "F08", "F09", "F10", "F11", "F12", "F35"):
        assert befunde[nr].vorhanden is False, (nr, befunde[nr].beleg)
