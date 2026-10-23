package de.wep.app

import android.content.Context
import android.net.Uri
import android.util.Base64
import androidx.core.content.FileProvider
import java.io.File

/**
 * „Speichern unter…“ für Dateien aus der Web-App (Sicherung, Excel, Foto-ZIP). Die WebView kann
 * Blob-Downloads nicht speichern; die Web-App schickt die Datei deshalb in Stücken hierher
 * (Base64, damit auch große Sicherungen mit Fotos nicht auf einmal über die Brücke müssen),
 * danach kopiert der Plugin-Rückruf sie an den Ort, den der Nutzer im System-Dialog wählt.
 */
object DateiSpeichern {
    private fun datei(ctx: Context) = File(File(ctx.cacheDir, "speichern").also { it.mkdirs() }, "datei.teil")

    fun beginne(ctx: Context) {
        datei(ctx).delete()
        datei(ctx).createNewFile()
    }

    fun haengeAn(ctx: Context, base64: String) {
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        java.io.FileOutputStream(datei(ctx), true).use { it.write(bytes) }
    }

    /** Kopiert die gesammelte Datei an `ziel` und räumt auf. Gibt die Größe zurück. */
    fun kopiereNach(ctx: Context, ziel: Uri): Long {
        val quelle = datei(ctx)
        try {
            val aus = ctx.contentResolver.openOutputStream(ziel, "wt")
                ?: throw IllegalStateException("Ziel lässt sich nicht öffnen")
            aus.use { o -> quelle.inputStream().use { i -> return i.copyTo(o) } }
        } finally {
            quelle.delete()
        }
    }

    fun verwerfe(ctx: Context) {
        datei(ctx).delete()
    }

    /**
     * Macht aus der gesammelten Datei eine Adresse für das Teilen-Menü (FileProvider, Cache-Ordner `teilen/`).
     * Es liegt immer nur die zuletzt geteilte Datei dort.
     */
    fun fuerTeilen(ctx: Context, name: String): Uri {
        val ordner = File(ctx.cacheDir, "teilen").also { it.mkdirs() }
        ordner.listFiles()?.forEach { it.delete() }
        val sauber = name.substringAfterLast('/').substringAfterLast('\\').ifBlank { "WEP.wep" }
        val ziel = File(ordner, sauber)
        val quelle = datei(ctx)
        if (!quelle.exists()) throw IllegalStateException("Keine Datei zum Teilen")
        if (!quelle.renameTo(ziel)) {
            quelle.copyTo(ziel, overwrite = true)
            quelle.delete()
        }
        return FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", ziel)
    }
}
