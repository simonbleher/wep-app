package de.wep.app

import android.app.Activity
import android.content.Intent
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Brücke zwischen der Web-App und den nativen Teilen (Token-Anfragen ohne Origin,
 * verschlüsselte Anmeldedaten, Upload-Warteschlange, WorkManager). Gegenstück in
 * src/android/native.ts. Plugin-Methoden laufen auf einem Hintergrund-Thread.
 */
@CapacitorPlugin(name = "WepNative")
class WepNativePlugin : Plugin() {

    private val ctx get() = context.applicationContext

    private fun fehler(call: PluginCall, e: Exception) =
        call.reject(e.message ?: e.javaClass.simpleName, e)

    @PluginMethod
    fun tokenAnfrage(call: PluginCall) {
        try {
            val url = call.getString("url") ?: return call.reject("url fehlt")
            // Nur Microsoft-Anmeldeserver, damit das Plugin kein offener HTTP-Client ist.
            if (!url.startsWith("https://login.microsoftonline.com/")) return call.reject("URL nicht erlaubt")
            val formular = mutableMapOf<String, String>()
            val f = call.getObject("formular") ?: return call.reject("formular fehlt")
            f.keys().forEach { formular[it] = f.getString(it) ?: "" }
            val a = Http.postFormular(url, formular)
            call.resolve(JSObject().put("status", a.status).put("text", a.text))
        } catch (e: Exception) {
            fehler(call, e)
        }
    }

    @PluginMethod
    fun speichereAnmeldung(call: PluginCall) {
        try {
            TokenStore.speichere(
                ctx,
                TokenStore.Anmeldung(
                    clientId = call.getString("clientId") ?: "",
                    refreshToken = call.getString("refreshToken") ?: "",
                    accessToken = call.getString("accessToken") ?: "",
                    ablauf = call.getData().optLong("ablauf", 0),
                    name = call.getString("name") ?: "",
                    benutzername = call.getString("benutzername") ?: "",
                ),
            )
            // Nach der Anmeldung: eventuell schon Wartendes hochladen
            UploadWorker.plane(ctx, ersetzen = false)
            call.resolve()
        } catch (e: Exception) {
            fehler(call, e)
        }
    }

    @PluginMethod
    fun leseAnmeldung(call: PluginCall) {
        try {
            val a = TokenStore.lese(ctx)
            val r = JSObject()
            if (a != null) {
                r.put("clientId", a.clientId).put("refreshToken", a.refreshToken)
                    .put("accessToken", a.accessToken).put("ablauf", a.ablauf)
                    .put("name", a.name).put("benutzername", a.benutzername)
            }
            call.resolve(r)
        } catch (e: Exception) {
            fehler(call, e)
        }
    }

    @PluginMethod
    fun loescheAnmeldung(call: PluginCall) {
        try {
            TokenStore.loesche(ctx)
            call.resolve()
        } catch (e: Exception) {
            fehler(call, e)
        }
    }

    @PluginMethod
    fun reiheEin(call: PluginCall) {
        try {
            val name = call.getString("name") ?: return call.reject("name fehlt")
            val inhalt = call.getString("inhalt") ?: return call.reject("inhalt fehlt")
            val geaendertAm = call.getString("geaendertAm") ?: return call.reject("geaendertAm fehlt")
            val eTag = call.getString("eTag")?.ifEmpty { null }
            val aufheben = call.getBoolean("sperreAufheben", false) ?: false
            if (Warteschlange.reiheEin(ctx, name, inhalt, eTag, geaendertAm, aufheben)) {
                UploadWorker.plane(ctx, ersetzen = false)
            } else {
                Protokoll.eintrag(ctx, "info", "$name: gelöscht – nicht eingereiht")
            }
            call.resolve()
        } catch (e: Exception) {
            fehler(call, e)
        }
    }

    @PluginMethod
    fun entferne(call: PluginCall) {
        try {
            Warteschlange.entferne(ctx, call.getString("name") ?: return call.reject("name fehlt"))
            call.resolve()
        } catch (e: Exception) {
            fehler(call, e)
        }
    }

    /** Das WEP ist gelöscht: Eintrag entfernen und den Namen für Uploads sperren (Löschsperre). */
    @PluginMethod
    fun markiereGeloescht(call: PluginCall) {
        try {
            val name = call.getString("name") ?: return call.reject("name fehlt")
            val geloeschtAm = call.getString("geloeschtAm") ?: return call.reject("geloeschtAm fehlt")
            Warteschlange.markiereGeloescht(ctx, name, geloeschtAm)
            Protokoll.eintrag(ctx, "info", "$name: gelöscht – aus der Warteschlange genommen und für Uploads gesperrt")
            // Lief gerade ein Upload, verschiebt der Worker die Datei selbst in den Papierkorb;
            // war einer vorgemerkt, wird der Nachlauf mit eingeplant.
            if (Warteschlange.offeneLoeschungen(ctx).isNotEmpty()) UploadWorker.plane(ctx, ersetzen = false)
            call.resolve()
        } catch (e: Exception) {
            fehler(call, e)
        }
    }

    /** Reiht ein Foto (JPEG als Base64) für den Upload nach daten/fotos/ ein; gesperrte WEPs werden ignoriert. */
    @PluginMethod
    fun reiheFotoEin(call: PluginCall) {
        try {
            val wepId = call.getString("wepId") ?: return call.reject("wepId fehlt")
            val fotoId = call.getString("fotoId") ?: return call.reject("fotoId fehlt")
            val base64 = call.getString("base64") ?: return call.reject("base64 fehlt")
            val bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
            if (FotoWarteschlange.reiheEin(ctx, wepId, fotoId, bytes)) {
                UploadWorker.plane(ctx, ersetzen = false)
            } else {
                Protokoll.eintrag(ctx, "info", "Foto $wepId/$fotoId: WEP gelöscht – nicht eingereiht")
            }
            call.resolve()
        } catch (e: Exception) {
            fehler(call, e)
        }
    }

    @PluginMethod
    fun entferneFoto(call: PluginCall) {
        try {
            FotoWarteschlange.entferne(
                ctx,
                call.getString("wepId") ?: return call.reject("wepId fehlt"),
                call.getString("fotoId") ?: return call.reject("fotoId fehlt"),
            )
            call.resolve()
        } catch (e: Exception) {
            fehler(call, e)
        }
    }

    /** Foto-Uploads eines WEP sperren (Papierkorb) bzw. freigeben (das WEP lebt wieder). */
    @PluginMethod
    fun sperreFotos(call: PluginCall) {
        try {
            val wepId = call.getString("wepId") ?: return call.reject("wepId fehlt")
            val gesperrt = call.getBoolean("gesperrt", true) ?: true
            FotoWarteschlange.sperre(ctx, wepId, gesperrt)
            call.resolve()
        } catch (e: Exception) {
            fehler(call, e)
        }
    }

    @PluginMethod
    fun listeFotos(call: PluginCall) {
        try {
            val arr = JSArray()
            FotoWarteschlange.liste(ctx).forEach {
                arr.put(
                    JSObject().put("wepId", it.wepId).put("fotoId", it.fotoId)
                        .put("eingereihtAm", it.eingereihtAm).put("groesse", it.datei.length()),
                )
            }
            call.resolve(JSObject().put("eintraege", arr))
        } catch (e: Exception) {
            fehler(call, e)
        }
    }

    @PluginMethod
    fun holeFotoErgebnisse(call: PluginCall) {
        try {
            call.resolve(JSObject().put("ergebnisse", FotoWarteschlange.holeErgebnisse(ctx)))
        } catch (e: Exception) {
            fehler(call, e)
        }
    }

    @PluginMethod
    fun liste(call: PluginCall) {
        try {
            val arr = JSArray()
            Warteschlange.liste(ctx).forEach {
                arr.put(
                    JSObject().put("name", it.name).put("eTag", it.eTag).put("geaendertAm", it.geaendertAm)
                        .put("eingereihtAm", it.eingereihtAm).put("blockiert", it.blockiert)
                        .put("groesse", it.inhalt.toByteArray(Charsets.UTF_8).size),
                )
            }
            call.resolve(JSObject().put("eintraege", arr))
        } catch (e: Exception) {
            fehler(call, e)
        }
    }

    @PluginMethod
    fun holeErgebnisse(call: PluginCall) {
        try {
            call.resolve(JSObject().put("ergebnisse", Warteschlange.holeErgebnisse(ctx)))
        } catch (e: Exception) {
            fehler(call, e)
        }
    }

    @PluginMethod
    fun holeProtokoll(call: PluginCall) {
        try {
            val arr = JSArray()
            Protokoll.lese(ctx).forEach { arr.put(it) }
            call.resolve(JSObject().put("eintraege", arr))
        } catch (e: Exception) {
            fehler(call, e)
        }
    }

    @PluginMethod
    fun planeUpload(call: PluginCall) {
        try {
            val nurWlan = call.getBoolean("nurWlan", true) ?: true
            UploadWorker.setzeNurWlan(ctx, nurWlan)
            UploadWorker.planePeriodisch(ctx)
            UploadWorker.plane(ctx, ersetzen = true)
            Protokoll.eintrag(ctx, "info", "Upload geplant: ${if (nurWlan) "nur unbegrenztes Netz (WLAN)" else "jedes Netz"}")
            call.resolve()
        } catch (e: Exception) {
            fehler(call, e)
        }
    }

    @PluginMethod
    fun jetztVersuchen(call: PluginCall) {
        try {
            Protokoll.eintrag(ctx, "info", "„Jetzt versuchen“ gedrückt")
            UploadWorker.plane(ctx, ersetzen = true)
            call.resolve()
        } catch (e: Exception) {
            fehler(call, e)
        }
    }

    @PluginMethod
    fun netzTyp(call: PluginCall) {
        val (typ, unmetered) = Netz.info(ctx)
        call.resolve(JSObject().put("typ", typ).put("unmetered", unmetered))
    }

    /** Nummer des nativen Teils (android/native-version.txt, per Gradle in BuildConfig) und versionCode. */
    @PluginMethod
    fun nativeVersion(call: PluginCall) {
        val code = try {
            @Suppress("DEPRECATION")
            ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionCode
        } catch (e: Exception) {
            0
        }
        call.resolve(JSObject().put("nativeVersion", BuildConfig.WEP_NATIVE_VERSION).put("versionCode", code))
    }

    /** APK laden (Ereignis `apkFortschritt` mit geladen/gesamt). */
    @PluginMethod
    fun ladeApk(call: PluginCall) {
        try {
            val url = call.getString("url") ?: return call.reject("url fehlt")
            val groesse = ApkInstaller.lade(ctx, url, call.getString("sha256")) { geladen, gesamt ->
                notifyListeners("apkFortschritt", JSObject().put("geladen", geladen).put("gesamt", gesamt))
            }
            Protokoll.eintrag(ctx, "info", "APK geladen ($groesse Bytes)")
            call.resolve(JSObject().put("groesse", groesse))
        } catch (e: ApkInstaller.ApkFehler) {
            Protokoll.eintrag(ctx, "fehler", "APK laden: ${e.message}")
            call.reject(e.message, e.code, e)
        } catch (e: Exception) {
            fehler(call, e)
        }
    }

    /** Android-Installer für die geladene APK öffnen (ERLAUBNIS, wenn „Apps installieren“ fehlt). */
    @PluginMethod
    fun installiereApk(call: PluginCall) {
        try {
            ApkInstaller.installiere(ctx)
            call.resolve()
        } catch (e: ApkInstaller.ApkFehler) {
            call.reject(e.message, e.code, e)
        } catch (e: Exception) {
            fehler(call, e)
        }
    }

    /** Datei für „Speichern unter…“ neu beginnen (verwirft einen abgebrochenen Rest). */
    @PluginMethod
    fun dateiBeginnen(call: PluginCall) {
        try {
            DateiSpeichern.beginne(ctx)
            call.resolve()
        } catch (e: Exception) {
            fehler(call, e)
        }
    }

    /** Ein Stück der Datei (Base64) anhängen. */
    @PluginMethod
    fun dateiAnhaengen(call: PluginCall) {
        try {
            DateiSpeichern.haengeAn(ctx, call.getString("daten") ?: return call.reject("daten fehlt"))
            call.resolve()
        } catch (e: Exception) {
            fehler(call, e)
        }
    }

    /** System-Dialog „Speichern unter…“ öffnen; Ergebnis { gespeichert: true/false }. */
    @PluginMethod
    fun dateiSpeichern(call: PluginCall) {
        val name = call.getString("name") ?: return call.reject("name fehlt")
        val typ = call.getString("typ") ?: "application/octet-stream"
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType(typ)
            .putExtra(Intent.EXTRA_TITLE, name)
        startActivityForResult(call, intent, "dateiGewaehlt")
    }

    @ActivityCallback
    private fun dateiGewaehlt(call: PluginCall?, ergebnis: ActivityResult) {
        if (call == null) return
        val ziel = ergebnis.data?.data
        if (ergebnis.resultCode != Activity.RESULT_OK || ziel == null) {
            DateiSpeichern.verwerfe(ctx)
            call.resolve(JSObject().put("gespeichert", false))
            return
        }
        // Kopieren nicht auf dem UI-Thread
        Thread {
            try {
                val groesse = DateiSpeichern.kopiereNach(ctx, ziel)
                Protokoll.eintrag(ctx, "info", "Datei gespeichert ($groesse Bytes)")
                call.resolve(JSObject().put("gespeichert", true))
            } catch (e: Exception) {
                Protokoll.eintrag(ctx, "fehler", "Datei speichern: ${e.message}")
                fehler(call, e)
            }
        }.start()
    }
}
