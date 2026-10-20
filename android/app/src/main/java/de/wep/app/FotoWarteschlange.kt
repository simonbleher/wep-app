package de.wep.app

import android.content.Context
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.Instant

/**
 * Upload-Warteschlange für Fotos (Beta 3, Paket 4): je Foto eine Datei `<WEP>/<Foto>` (URL-kodiert) im
 * App-Speicher; der Worker lädt sie nach OneDrive (`daten/fotos/<WEP>/<Foto>.jpg`). Das Ergebnis steht in
 * `foto-ergebnisse.json`; die App übernimmt es beim Start bzw. vor dem Abgleich.
 *
 * **Sperre je WEP** (`fotos-gesperrt.json`): Liegt ein WEP im Papierkorb, nimmt `reiheEin` seine Fotos nicht
 * an, der Worker lädt sie nie nach `daten/fotos/` hoch. Läuft gerade ein Upload, während gelöscht wird, merkt
 * `erfolgreich` das: Der Worker verschiebt die eben geschriebene Datei sofort nach
 * `daten/papierkorb/fotos/` (wie bei den WEP-Dateien in Warteschlange.kt). Die App hebt die Sperre auf, wenn
 * das WEP wieder lebt.
 */
object FotoWarteschlange {
    class Eintrag(val wepId: String, val fotoId: String, val datei: File, val eingereihtAm: String)

    /** Eine Sperre merkt sich höchstens so lange (Papierkorb-Frist plus Puffer). */
    private const val SPERRE_TAGE = 45L

    private fun ordner(c: Context): File = File(c.filesDir, "foto-queue").also { it.mkdirs() }
    private fun schluessel(wepId: String, fotoId: String) = Uri.encode("$wepId/$fotoId")
    private fun datei(c: Context, wepId: String, fotoId: String) = File(ordner(c), schluessel(wepId, fotoId) + ".jpg")
    private fun ergebnisDatei(c: Context) = File(c.filesDir, "foto-ergebnisse.json")
    private fun sperrDatei(c: Context) = File(c.filesDir, "fotos-gesperrt.json")

    private fun schreibeAtomar(ziel: File, text: String) {
        val tmp = File(ziel.parentFile, ziel.name + ".tmp")
        tmp.writeText(text)
        if (!tmp.renameTo(ziel)) {
            ziel.delete()
            tmp.renameTo(ziel)
        }
    }

    private fun leseSperre(c: Context): JSONObject {
        val d = sperrDatei(c)
        return if (d.exists()) runCatching { JSONObject(d.readText()) }.getOrDefault(JSONObject()) else JSONObject()
    }

    private fun schreibeSperre(c: Context, o: JSONObject) {
        if (o.length() == 0) sperrDatei(c).delete() else schreibeAtomar(sperrDatei(c), o.toString())
    }

    @Synchronized
    fun istGesperrt(c: Context, wepId: String): Boolean = leseSperre(c).has(wepId)

    /** Reiht ein Foto ein; false, wenn das WEP gesperrt ist (im Papierkorb). */
    @Synchronized
    fun reiheEin(c: Context, wepId: String, fotoId: String, bytes: ByteArray): Boolean {
        if (istGesperrt(c, wepId)) return false
        val ziel = datei(c, wepId, fotoId)
        val tmp = File(ziel.parentFile, ziel.name + ".tmp")
        tmp.writeBytes(bytes)
        if (!tmp.renameTo(ziel)) {
            ziel.delete()
            tmp.renameTo(ziel)
        }
        return true
    }

    @Synchronized
    fun entferne(c: Context, wepId: String, fotoId: String) {
        datei(c, wepId, fotoId).delete()
    }

    /**
     * Sperrt Foto-Uploads eines WEP (im Papierkorb): alle Einträge dieses WEP fliegen raus. Entsperrt
     * (`gesperrt = false`), wenn das WEP wieder lebt. Läuft ein Upload, merkt `erfolgreich` die Sperre.
     */
    @Synchronized
    fun sperre(c: Context, wepId: String, gesperrt: Boolean, geloeschtAm: String = Instant.now().toString()) {
        val o = leseSperre(c)
        if (gesperrt) {
            liste(c).filter { it.wepId == wepId }.forEach { it.datei.delete() }
            // Alte Sperren aufräumen
            val grenze = Instant.now().minusSeconds(SPERRE_TAGE * 24 * 3600)
            for (k in o.keys().asSequence().toList()) {
                val am = runCatching { Instant.parse(o.optString(k)) }.getOrNull()
                if (am != null && am.isBefore(grenze)) o.remove(k)
            }
            if (!o.has(wepId)) o.put(wepId, geloeschtAm)
        } else {
            o.remove(wepId)
        }
        schreibeSperre(c, o)
    }

    @Synchronized
    fun liste(c: Context): List<Eintrag> {
        val dateien = ordner(c).listFiles { f -> f.name.endsWith(".jpg") } ?: return emptyList()
        return dateien.sortedBy { it.name }.mapNotNull { f ->
            runCatching {
                val schluessel = Uri.decode(f.name.removeSuffix(".jpg"))
                val i = schluessel.indexOf('/')
                if (i <= 0) return@runCatching null
                Eintrag(
                    wepId = schluessel.substring(0, i),
                    fotoId = schluessel.substring(i + 1),
                    datei = f,
                    eingereihtAm = Instant.ofEpochMilli(f.lastModified()).toString(),
                )
            }.getOrNull()
        }
    }

    /**
     * Upload von `e` war erfolgreich. Ist das WEP inzwischen gesperrt (während des Uploads gelöscht),
     * wird nichts als Ergebnis gemeldet und false geliefert: Der Worker verschiebt die Datei in den
     * Papierkorb-Ordner. Sonst wird der Eintrag entfernt und das Ergebnis für die App vorgemerkt.
     */
    @Synchronized
    fun erfolgreich(c: Context, e: Eintrag): Boolean {
        if (istGesperrt(c, e.wepId)) {
            e.datei.delete()
            return false
        }
        e.datei.delete()
        val d = ergebnisDatei(c)
        val liste = if (d.exists()) runCatching { JSONArray(d.readText()) }.getOrDefault(JSONArray()) else JSONArray()
        liste.put(
            JSONObject()
                .put("wepId", e.wepId)
                .put("fotoId", e.fotoId)
                .put("zeit", Instant.now().toString()),
        )
        schreibeAtomar(d, liste.toString())
        return true
    }

    /** Liefert die Ergebnisse seit dem letzten Aufruf und leert die Datei. */
    @Synchronized
    fun holeErgebnisse(c: Context): JSONArray {
        val d = ergebnisDatei(c)
        if (!d.exists()) return JSONArray()
        val liste = runCatching { JSONArray(d.readText()) }.getOrDefault(JSONArray())
        d.delete()
        return liste
    }
}
