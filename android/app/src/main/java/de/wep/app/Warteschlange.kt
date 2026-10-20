package de.wep.app

import android.content.Context
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.Instant

/**
 * Upload-Warteschlange im App-Speicher: je WEP eine Datei `<Name>.json` (Inhalt = fertige
 * Sync-Datei) und `<Name>.meta` (letzter bekannter eTag u. a.). Das Ergebnis erfolgreicher
 * Uploads steht in `ergebnisse.json`; die App übernimmt es beim Start in syncMeta.
 */
object Warteschlange {
    class Eintrag(
        val name: String,
        val inhalt: String,
        val eTag: String?,
        val geaendertAm: String,
        val eingereihtAm: String,
        val blockiert: Boolean,
    )

    private fun ordner(c: Context): File = File(c.filesDir, "upload-queue").also { it.mkdirs() }

    private fun datei(c: Context, name: String) = File(ordner(c), Uri.encode(name) + ".json")
    private fun meta(c: Context, name: String) = File(ordner(c), Uri.encode(name) + ".meta")
    private fun ergebnisDatei(c: Context) = File(c.filesDir, "ergebnisse.json")

    private fun schreibeAtomar(ziel: File, text: String) {
        val tmp = File(ziel.parentFile, ziel.name + ".tmp")
        tmp.writeText(text)
        if (!tmp.renameTo(ziel)) {
            ziel.delete()
            tmp.renameTo(ziel)
        }
    }

    @Synchronized
    fun reiheEin(c: Context, name: String, inhalt: String, eTag: String?, geaendertAm: String) {
        schreibeAtomar(datei(c, name), inhalt)
        val m = JSONObject()
            .put("name", name)
            .put("eTag", eTag ?: JSONObject.NULL)
            .put("geaendertAm", geaendertAm)
            .put("eingereihtAm", Instant.now().toString())
            .put("blockiert", false)
        schreibeAtomar(meta(c, name), m.toString())
    }

    @Synchronized
    fun entferne(c: Context, name: String) {
        datei(c, name).delete()
        meta(c, name).delete()
    }

    @Synchronized
    fun liste(c: Context): List<Eintrag> {
        val dateien = ordner(c).listFiles { f -> f.name.endsWith(".meta") } ?: return emptyList()
        return dateien.sortedBy { it.name }.mapNotNull { mf ->
            runCatching {
                val m = JSONObject(mf.readText())
                val name = m.getString("name")
                val d = datei(c, name)
                if (!d.exists()) return@runCatching null
                Eintrag(
                    name = name,
                    inhalt = d.readText(),
                    eTag = if (m.isNull("eTag")) null else m.getString("eTag"),
                    geaendertAm = m.getString("geaendertAm"),
                    eingereihtAm = m.optString("eingereihtAm"),
                    blockiert = m.optBoolean("blockiert", false),
                )
            }.getOrNull()
        }
    }

    /** Hochladen scheiterte mit 412/409: Datei bleibt liegen, bis die App den Konflikt geklärt hat. */
    @Synchronized
    fun markiereBlockiert(c: Context, name: String) {
        val mf = meta(c, name)
        if (!mf.exists()) return
        schreibeAtomar(mf, JSONObject(mf.readText()).put("blockiert", true).toString())
    }

    /**
     * Upload von `hochgeladen` war erfolgreich (neuer eTag). Ist inzwischen eine neuere
     * Fassung eingereiht, bleibt sie liegen (mit dem neuen eTag); sonst wird der Eintrag
     * entfernt. In beiden Fällen kommt ein Ergebnis für die App dazu.
     */
    @Synchronized
    fun erfolgreich(c: Context, e: Eintrag, neuerETag: String) {
        val d = datei(c, e.name)
        val unveraendert = d.exists() && d.readText() == e.inhalt
        if (unveraendert) {
            entferne(c, e.name)
        } else if (meta(c, e.name).exists()) {
            val mf = meta(c, e.name)
            schreibeAtomar(mf, JSONObject(mf.readText()).put("eTag", neuerETag).put("blockiert", false).toString())
        }
        val datei = ergebnisDatei(c)
        val liste = if (datei.exists()) runCatching { JSONArray(datei.readText()) }.getOrDefault(JSONArray()) else JSONArray()
        liste.put(
            JSONObject()
                .put("name", e.name)
                .put("eTag", neuerETag)
                .put("geaendertAm", e.geaendertAm)
                .put("zeit", Instant.now().toString()),
        )
        schreibeAtomar(datei, liste.toString())
    }

    /** Liefert die Ergebnisse seit dem letzten Aufruf und leert die Datei. */
    @Synchronized
    fun holeErgebnisse(c: Context): JSONArray {
        val datei = ergebnisDatei(c)
        if (!datei.exists()) return JSONArray()
        val liste = runCatching { JSONArray(datei.readText()) }.getOrDefault(JSONArray())
        datei.delete()
        return liste
    }
}
