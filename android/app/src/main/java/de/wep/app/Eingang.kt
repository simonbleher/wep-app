package de.wep.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File
import java.io.RandomAccessFile

/**
 * „Öffnen mit WEP“: Android startet die App mit einem VIEW-Intent für eine `.wep`-Datei (content://…).
 * Die Datei wird sofort in den App-Cache kopiert (die Berechtigung für die Adresse gilt nur kurz und nur für
 * diese Aktivität); die Web-App liest sie danach stückweise und verwirft sie. Es gibt immer höchstens eine
 * wartende Datei – eine neuere ersetzt die ältere.
 */
object Eingang {
    /** Größer als das nimmt die App nicht an (wie TEILEN_MAX_BYTES in src/teilen/types.ts). */
    private const val MAX_BYTES = 1024L * 1024 * 1024

    private fun ordner(ctx: Context) = File(ctx.cacheDir, "eingang").also { it.mkdirs() }
    private fun datei(ctx: Context) = File(ordner(ctx), "datei.wep")
    private fun nameDatei(ctx: Context) = File(ordner(ctx), "name.txt")

    class Info(val name: String, val groesse: Long)

    /** Nimmt die Datei eines VIEW-Intents an. `false`, wenn der Intent keine Datei für uns ist. */
    @Synchronized
    fun uebernehme(ctx: Context, intent: Intent?): Boolean {
        if (intent == null || intent.action != Intent.ACTION_VIEW) return false
        val uri: Uri = intent.data ?: return false
        // Nur Inhalte anderer Apps; die Anmelde-Rückkehr (de.wep.app://auth) und file:// gehören nicht hierher
        if (uri.scheme != "content") return false
        // Den Intent verbrauchen, damit ein Neuaufbau der Aktivität die Datei nicht erneut annimmt
        intent.data = null
        verwirf(ctx)
        val ziel = datei(ctx)
        try {
            val eingang = ctx.contentResolver.openInputStream(uri) ?: return false
            eingang.use { i ->
                ziel.outputStream().use { o ->
                    val puffer = ByteArray(64 * 1024)
                    var summe = 0L
                    while (true) {
                        val n = i.read(puffer)
                        if (n < 0) break
                        summe += n
                        if (summe > MAX_BYTES) throw IllegalStateException("Datei zu groß")
                        o.write(puffer, 0, n)
                    }
                }
            }
            nameDatei(ctx).writeText(anzeigeName(ctx, uri))
            return true
        } catch (e: Exception) {
            Protokoll.eintrag(ctx, "fehler", "Datei öffnen: ${e.message}")
            verwirf(ctx)
            return false
        }
    }

    private fun anzeigeName(ctx: Context, uri: Uri): String {
        var name: String? = null
        try {
            ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) name = c.getString(0)
            }
        } catch (_: Exception) {
        }
        val roh = name ?: uri.lastPathSegment ?: "WEP.wep"
        // nur der Name, keine Pfadanteile
        return roh.substringAfterLast('/').substringAfterLast('\\').ifBlank { "WEP.wep" }
    }

    @Synchronized
    fun info(ctx: Context): Info? {
        val d = datei(ctx)
        if (!d.exists()) return null
        val name = try { nameDatei(ctx).readText() } catch (_: Exception) { "WEP.wep" }
        return Info(name, d.length())
    }

    /** Ein Stück der wartenden Datei. */
    @Synchronized
    fun lies(ctx: Context, pos: Long, laenge: Int): ByteArray {
        val d = datei(ctx)
        if (!d.exists()) throw IllegalStateException("Keine Datei wartet")
        RandomAccessFile(d, "r").use { f ->
            val rest = (f.length() - pos).coerceAtLeast(0).coerceAtMost(laenge.toLong()).toInt()
            val bytes = ByteArray(rest)
            f.seek(pos)
            f.readFully(bytes)
            return bytes
        }
    }

    @Synchronized
    fun verwirf(ctx: Context) {
        datei(ctx).delete()
        nameDatei(ctx).delete()
    }
}
