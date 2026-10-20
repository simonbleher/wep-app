package de.wep.app

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
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
            Warteschlange.reiheEin(ctx, name, inhalt, eTag, geaendertAm)
            UploadWorker.plane(ctx, ersetzen = false)
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
}
