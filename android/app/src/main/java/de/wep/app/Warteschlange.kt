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
 *
 * **Löschsperre** (`geloescht.json`): Wird ein WEP gelöscht (in den Papierkorb gelegt), entfernt
 * die App den Eintrag und sperrt den Dateinamen. Gesperrte Namen nimmt `reiheEin` nicht an und
 * der Worker lädt sie nie hoch – auch nicht bei geschlossener App. Läuft gerade ein Upload,
 * während gelöscht wird, merkt `erfolgreich` das und der Worker verschiebt die eben
 * geschriebene Datei sofort aus `daten/` nach `daten/papierkorb/` (Nachlauf, wird wiederholt,
 * bis es klappt). Die App hebt die Sperre auf, wenn der Name wieder einem lebenden WEP gehört.
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
    private fun sperrDatei(c: Context) = File(c.filesDir, "geloescht.json")

    /** Einen gelöschten Namen merkt sich die Sperre höchstens so lange (Papierkorb-Frist plus Puffer). */
    private const val SPERRE_TAGE = 45L

    /** Ein gesperrter Name; `offen` = Nachlauf nötig, weil während des Löschens ein Upload durchging. */
    class Geloescht(
        val name: String,
        val geloeschtAm: String,
        val offen: Boolean,
        val eTag: String?,
        val inhalt: String?,
    )

    private fun leseSperre(c: Context): JSONObject {
        val d = sperrDatei(c)
        return if (d.exists()) runCatching { JSONObject(d.readText()) }.getOrDefault(JSONObject()) else JSONObject()
    }

    private fun schreibeSperre(c: Context, o: JSONObject) {
        if (o.length() == 0) sperrDatei(c).delete() else schreibeAtomar(sperrDatei(c), o.toString())
    }

    private fun schreibeAtomar(ziel: File, text: String) {
        val tmp = File(ziel.parentFile, ziel.name + ".tmp")
        tmp.writeText(text)
        if (!tmp.renameTo(ziel)) {
            ziel.delete()
            tmp.renameTo(ziel)
        }
    }

    /**
     * Reiht ein. Gesperrte (gelöschte) Namen werden abgelehnt (false), außer `sperreAufheben`:
     * dann lebt das WEP (wieder) und die Sperre fällt weg.
     */
    @Synchronized
    fun reiheEin(
        c: Context,
        name: String,
        inhalt: String,
        eTag: String?,
        geaendertAm: String,
        sperreAufheben: Boolean = false,
    ): Boolean {
        if (sperreAufheben) hebeLoeschungAuf(c, name) else if (istGeloescht(c, name)) return false
        schreibeAtomar(datei(c, name), inhalt)
        val m = JSONObject()
            .put("name", name)
            .put("eTag", eTag ?: JSONObject.NULL)
            .put("geaendertAm", geaendertAm)
            .put("eingereihtAm", Instant.now().toString())
            .put("blockiert", false)
        schreibeAtomar(meta(c, name), m.toString())
        return true
    }

    @Synchronized
    fun entferne(c: Context, name: String) {
        datei(c, name).delete()
        meta(c, name).delete()
    }

    /** Das WEP ist gelöscht: Eintrag entfernen und den Namen für Uploads sperren. */
    @Synchronized
    fun markiereGeloescht(c: Context, name: String, geloeschtAm: String) {
        entferne(c, name)
        val o = leseSperre(c)
        // Alte, erledigte Sperren aufräumen
        val grenze = Instant.now().minusSeconds(SPERRE_TAGE * 24 * 3600)
        val keys = o.keys().asSequence().toList()
        for (k in keys) {
            val g = o.optJSONObject(k) ?: continue
            val am = runCatching { Instant.parse(g.optString("geloeschtAm")) }.getOrNull()
            if (!g.optBoolean("offen") && am != null && am.isBefore(grenze)) o.remove(k)
        }
        val alt = o.optJSONObject(name)
        // Eine laufende Nachlauf-Aufgabe bleibt erhalten
        if (alt == null || !alt.optBoolean("offen")) {
            o.put(name, JSONObject().put("geloeschtAm", geloeschtAm).put("offen", false))
        }
        schreibeSperre(c, o)
    }

    @Synchronized
    fun istGeloescht(c: Context, name: String): Boolean = leseSperre(c).has(name)

    /** Der Name gehört wieder einem lebenden WEP (wiederhergestellt oder neu vergeben). */
    @Synchronized
    fun hebeLoeschungAuf(c: Context, name: String) {
        val o = leseSperre(c)
        if (o.has(name)) {
            o.remove(name)
            schreibeSperre(c, o)
        }
    }

    /** Gesperrte Namen, bei denen noch eine hochgeladene Datei aus `daten/` zu entfernen ist. */
    @Synchronized
    fun offeneLoeschungen(c: Context): List<Geloescht> {
        val o = leseSperre(c)
        return o.keys().asSequence().toList().mapNotNull { k ->
            val g = o.optJSONObject(k) ?: return@mapNotNull null
            if (!g.optBoolean("offen")) return@mapNotNull null
            Geloescht(
                name = k,
                geloeschtAm = g.optString("geloeschtAm"),
                offen = true,
                eTag = if (g.isNull("eTag")) null else g.optString("eTag"),
                inhalt = if (g.isNull("inhalt")) null else g.optString("inhalt"),
            )
        }
    }

    /** Die Datei aus `daten/` ist im Papierkorb gelandet (oder dort inzwischen anders): Nachlauf beendet. */
    @Synchronized
    fun nachlaufErledigt(c: Context, name: String) {
        val o = leseSperre(c)
        val g = o.optJSONObject(name) ?: return
        g.put("offen", false)
        g.remove("eTag")
        g.remove("inhalt")
        schreibeSperre(c, o)
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
     *
     * Wurde das WEP während des Uploads gelöscht (Löschsperre), liegt die Datei jetzt zu Unrecht in
     * `daten/`: Es wird ein Nachlauf vorgemerkt und false geliefert; der Worker verschiebt sie dann
     * in den Papierkorb (siehe `offeneLoeschungen`).
     */
    @Synchronized
    fun erfolgreich(c: Context, e: Eintrag, neuerETag: String): Boolean {
        val sperre = leseSperre(c)
        val gesperrt = sperre.optJSONObject(e.name)
        if (gesperrt != null) {
            gesperrt.put("offen", true).put("eTag", neuerETag).put("inhalt", e.inhalt)
            schreibeSperre(c, sperre)
            entferne(c, e.name)
            return false
        }
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
        return true
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
