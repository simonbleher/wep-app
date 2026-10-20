package de.wep.app

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.time.Instant

/** Protokoll für den Test: eine JSON-Zeile je Ereignis, höchstens ~200 Zeilen. */
object Protokoll {
    private const val DATEI = "protokoll.jsonl"
    private const val MAX = 200

    @Synchronized
    fun eintrag(c: Context, art: String, text: String) {
        val datei = File(c.filesDir, DATEI)
        val zeile = JSONObject().put("zeit", Instant.now().toString()).put("art", art).put("text", text)
        datei.appendText(zeile.toString() + "\n")
        val zeilen = datei.readLines()
        if (zeilen.size > MAX + 50) datei.writeText(zeilen.takeLast(MAX).joinToString("\n") + "\n")
    }

    @Synchronized
    fun lese(c: Context): List<JSONObject> {
        val datei = File(c.filesDir, DATEI)
        if (!datei.exists()) return emptyList()
        return datei.readLines().mapNotNull { runCatching { JSONObject(it) }.getOrNull() }.takeLast(MAX)
    }
}
