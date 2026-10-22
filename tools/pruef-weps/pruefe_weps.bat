@echo off
setlocal EnableExtensions
rem Pruefung von WEP-Dateien auf die Fehler der WEP-Vorlage. Die Dateien werden nur gelesen.
rem Internet wird nur einmalig gebraucht, wenn openpyxl auf Rueckfrage installiert wird.
rem Hinweis: Diese Datei enthaelt bewusst keine Umlaute (Windows-Eingabeaufforderung).
rem Keine Klammer-Bloecke mit Variablen: Ordnernamen mit Klammern oder & wuerden sonst stoeren.
chcp 65001 >nul
title WEP-Pruefung

echo.
echo ============================================================
echo   WEP-Pruefung: Fehler der WEP-Vorlage in fertigen WEPs finden
echo ============================================================
echo.

rem --- Python suchen (erst "py", dann "python") ---
set "PY=py -3"
%PY% -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if not errorlevel 1 goto python_da
set "PY=python"
%PY% -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if not errorlevel 1 goto python_da

echo Python 3.10 oder neuer wurde nicht gefunden.
echo Bitte von https://www.python.org/downloads/ installieren und dabei
echo "Add python.exe to PATH" ankreuzen. Danach diese Datei noch einmal starten.
echo Genaue Schritte stehen in der README.md.
goto ende_fehler

:python_da
rem --- openpyxl pruefen ---
%PY% -c "import openpyxl" >nul 2>&1
if not errorlevel 1 goto openpyxl_da

echo Das Zusatzpaket "openpyxl" (liest Excel-Dateien) ist noch nicht installiert.
set "ANTWORT="
set /p "ANTWORT=Jetzt installieren? Das braucht einmalig Internet. (J/N): "
if /i not "%ANTWORT%"=="J" goto ohne_openpyxl
%PY% -m pip install --user -r "%~dp0requirements.txt"
if errorlevel 1 goto pip_fehler
goto openpyxl_da

:ohne_openpyxl
echo Ohne openpyxl kann nicht geprueft werden. Abbruch.
goto ende_fehler

:pip_fehler
echo Die Installation ist fehlgeschlagen. Bitte die Internetverbindung pruefen.
goto ende_fehler

:openpyxl_da
rem --- Ordner erfragen (auch per Drag-and-drop auf diese Datei) ---
set "ORDNER=%~1"
if defined ORDNER goto ordner_da
echo Ordner mit den WEP-Dateien (.xlsx / .xlsm); Unterordner werden mitgeprueft.
echo Tipp: Den Ordner aus dem Explorer hierher ins Fenster ziehen.
set /p "ORDNER=Ordner: "

:ordner_da
rem Anfuehrungszeichen und abschliessenden Backslash entfernen
set "ORDNER=%ORDNER:"=%"
if not defined ORDNER goto kein_ordner
if "%ORDNER:~-1%"=="\" set "ORDNER=%ORDNER:~0,-1%"
if not exist "%ORDNER%\" goto kein_ordner

echo.
echo Pruefe "%ORDNER%" ...
echo.
%PY% "%~dp0pruefe_weps.py" "%ORDNER%"
if errorlevel 1 goto lauf_fehler

echo.
echo Der Bericht enthaelt Personendaten - nicht weitergeben.
set "OEFFNEN="
set /p "OEFFNEN=Bericht jetzt im Browser oeffnen? (J/N): "
if /i "%OEFFNEN%"=="J" start "" "%ORDNER%\pruefbericht.html"
goto ende

:kein_ordner
echo Der Ordner wurde nicht angegeben oder nicht gefunden.
goto ende_fehler

:lauf_fehler
echo.
echo Die Pruefung ist mit einem Fehler beendet worden.
goto ende_fehler

:ende_fehler
echo.
pause
exit /b 1

:ende
echo.
pause
endlocal
