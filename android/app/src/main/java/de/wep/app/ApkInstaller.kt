package de.wep.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Natives Update ohne Play Store: APK in den App-Cache laden, Prüfsumme prüfen, den
 * Android-Installer öffnen (FileProvider, Berechtigung „Apps installieren“).
 */
object ApkInstaller {
    /** Fehler mit Code für die Web-App (ERLAUBNIS, PRUEFSUMME, KEIN_NETZ). */
    class ApkFehler(val code: String, text: String) : Exception(text)

    private const val ORDNER = "apk-update"
    private const val DATEI = "wep.apk"

    private fun datei(ctx: Context) = File(File(ctx.cacheDir, ORDNER).also { it.mkdirs() }, DATEI)

    /** Feste Adresse des eigenen APK-Projekts (APK_PROJEKT in android-release.yml). */
    private const val APK_HOST = "wep-pankow-apk.pages.dev"

    /** Nur https auf das eigene APK-Projekt (auf *.pages.dev kann jeder Seiten anlegen). */
    fun urlErlaubt(url: String): Boolean {
        val u = try { URL(url) } catch (e: Exception) { return false }
        return u.protocol == "https" && u.host == APK_HOST
    }

    /** Lädt die APK; `fortschritt(geladen, gesamt)` mit gesamt = -1, wenn unbekannt. Gibt die Größe zurück. */
    fun lade(ctx: Context, url: String, sha256: String?, fortschritt: (Long, Long) -> Unit): Long {
        if (!urlErlaubt(url)) throw ApkFehler("URL", "URL nicht erlaubt")
        val ziel = datei(ctx)
        val tmp = File(ziel.parentFile, "$DATEI.teil")
        ziel.delete()
        tmp.delete()
        val v = URL(url).openConnection() as HttpURLConnection
        try {
            v.connectTimeout = 20_000
            v.readTimeout = 60_000
            v.instanceFollowRedirects = true
            val status = try { v.responseCode } catch (e: java.io.IOException) {
                throw ApkFehler("KEIN_NETZ", "Keine Verbindung: ${e.message}")
            }
            if (status != 200) throw ApkFehler("HTTP", "Server antwortet mit HTTP $status")
            val gesamt = v.contentLengthLong
            val md = MessageDigest.getInstance("SHA-256")
            var geladen = 0L
            var letzteMeldung = 0L
            try {
                v.inputStream.use { ein ->
                    tmp.outputStream().use { aus ->
                        val puffer = ByteArray(64 * 1024)
                        while (true) {
                            val n = ein.read(puffer)
                            if (n < 0) break
                            aus.write(puffer, 0, n)
                            md.update(puffer, 0, n)
                            geladen += n
                            if (geladen - letzteMeldung >= 128 * 1024) {
                                letzteMeldung = geladen
                                fortschritt(geladen, gesamt)
                            }
                        }
                    }
                }
            } catch (e: java.io.IOException) {
                throw ApkFehler("KEIN_NETZ", "Download abgebrochen: ${e.message}")
            }
            if (geladen == 0L || (gesamt > 0 && geladen != gesamt)) {
                throw ApkFehler("KEIN_NETZ", "Download unvollständig")
            }
            if (sha256 != null) {
                val ist = md.digest().joinToString("") { "%02x".format(it) }
                if (!ist.equals(sha256, ignoreCase = true)) throw ApkFehler("PRUEFSUMME", "Prüfsumme stimmt nicht")
            }
            fortschritt(geladen, geladen)
            if (!tmp.renameTo(ziel)) throw ApkFehler("DATEI", "Datei konnte nicht gespeichert werden")
            return geladen
        } finally {
            v.disconnect()
            tmp.delete()
        }
    }

    /**
     * Öffnet den Installer. Fehlt die Erlaubnis „Apps installieren“ (Android 8+), wird die
     * passende Einstellung geöffnet und ApkFehler("ERLAUBNIS") geworfen.
     */
    fun installiere(ctx: Context) {
        val apk = datei(ctx)
        if (!apk.exists()) throw ApkFehler("DATEI", "Keine geladene APK vorhanden")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ctx.packageManager.canRequestPackageInstalls()) {
            val einstellung = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(einstellung)
            throw ApkFehler("ERLAUBNIS", "Erlaubnis „Apps installieren“ fehlt")
        }
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", apk)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(intent)
    }
}
