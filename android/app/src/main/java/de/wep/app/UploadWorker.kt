package de.wep.app

import android.content.Context
import android.net.Uri
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Lädt die Warteschlange nach OneDrive (Apps/WEP-App/daten/<name>), auch bei
 * geschlossener App. Überschreibt nie eine neuere Fassung: mit If-Match (eTag) bzw.
 * conflictBehavior=fail für Dateien, die es noch nicht gab. Bei 412/409 bleibt die
 * Datei liegen – die App klärt den Konflikt beim Öffnen.
 */
class UploadWorker(private val ctx: Context, params: WorkerParameters) : Worker(ctx, params) {

    override fun doWork(): Result {
        val offen = Warteschlange.liste(ctx).filter { !it.blockiert }
        val (netz, unmetered) = Netz.info(ctx)
        if (offen.isEmpty()) return Result.success()
        Protokoll.eintrag(ctx, "lauf", "Lauf gestartet (Netz: $netz${if (unmetered) ", unbegrenzt" else ", getaktet"}): ${offen.size} Datei(en)")

        var token = try {
            TokenStore.zugriffstoken(ctx)
        } catch (e: AnmeldungAbgelaufen) {
            Protokoll.eintrag(ctx, "fehler", "Nicht angemeldet oder Anmeldung abgelaufen – nichts hochgeladen (${e.message})")
            return Result.success() // erst nach erneuter Anmeldung sinnvoll
        } catch (e: Exception) {
            Protokoll.eintrag(ctx, "fehler", "Token nicht erhältlich: ${e.message}")
            return retry()
        }

        var wiederholen = false
        var ok = 0
        for (eintrag in offen) {
            if (isStopped) {
                Protokoll.eintrag(ctx, "info", "Lauf unterbrochen")
                return Result.retry()
            }
            try {
                var a = lade(eintrag, token)
                if (a.status == 401) { // Token abgelehnt: einmal neu holen
                    token = TokenStore.zugriffstoken(ctx, erzwingen = true)
                    a = lade(eintrag, token)
                }
                when {
                    a.status in 200..201 -> {
                        val eTag = JSONObject(a.text).optString("eTag")
                        if (eTag.isEmpty()) throw IOException("Antwort ohne eTag")
                        Warteschlange.erfolgreich(ctx, eintrag, eTag)
                        ok++
                        Protokoll.eintrag(ctx, "upload", "${eintrag.name} hochgeladen (eTag $eTag)")
                    }
                    a.status == 412 || a.status == 409 -> {
                        Warteschlange.markiereBlockiert(ctx, eintrag.name)
                        Protokoll.eintrag(ctx, "fehler", "${eintrag.name}: in OneDrive geändert (${a.status}) – bleibt liegen, die App klärt es beim Öffnen")
                    }
                    a.status == 429 || a.status >= 500 -> {
                        wiederholen = true
                        Protokoll.eintrag(ctx, "fehler", "${eintrag.name}: OneDrive-Fehler ${a.status}, später erneut")
                    }
                    else -> {
                        wiederholen = true
                        Protokoll.eintrag(ctx, "fehler", "${eintrag.name}: Fehler ${a.status} ${a.text.take(160)}")
                    }
                }
            } catch (e: AnmeldungAbgelaufen) {
                Protokoll.eintrag(ctx, "fehler", "Anmeldung abgelaufen – bitte in der App erneut anmelden")
                return Result.success()
            } catch (e: Exception) {
                wiederholen = true
                Protokoll.eintrag(ctx, "fehler", "${eintrag.name}: ${e.javaClass.simpleName}: ${e.message}")
            }
        }
        Protokoll.eintrag(ctx, "lauf", "Lauf beendet: $ok von ${offen.size} hochgeladen")
        return if (wiederholen) retry() else Result.success()
    }

    /** Nach mehreren Fehlversuchen aufgeben – der periodische Lauf probiert es später erneut. */
    private fun retry(): Result = if (runAttemptCount >= 4) Result.success() else Result.retry()

    private fun lade(e: Warteschlange.Eintrag, token: String): Http.Antwort {
        val pfad = "daten/" + Uri.encode(e.name)
        var url = "https://graph.microsoft.com/v1.0/me/drive/special/approot:/$pfad:/content"
        val kopf = mutableMapOf("Authorization" to "Bearer $token", "Content-Type" to "application/json")
        if (e.eTag != null) kopf["If-Match"] = e.eTag
        else url += "?@microsoft.graph.conflictBehavior=fail" // neue Datei: nie etwas überschreiben
        return Http.put(url, e.inhalt.toByteArray(Charsets.UTF_8), kopf)
    }

    companion object {
        private const val EINMALIG = "wep-upload"
        private const val PERIODISCH = "wep-upload-periodisch"

        fun nurWlan(c: Context): Boolean =
            c.getSharedPreferences("einstellungen", Context.MODE_PRIVATE).getBoolean("nurWlan", true)

        fun setzeNurWlan(c: Context, wert: Boolean) {
            c.getSharedPreferences("einstellungen", Context.MODE_PRIVATE).edit().putBoolean("nurWlan", wert).apply()
        }

        private fun bedingungen(c: Context): Constraints = Constraints.Builder()
            .setRequiredNetworkType(if (nurWlan(c)) NetworkType.UNMETERED else NetworkType.CONNECTED)
            .build()

        /** Einen Lauf einplanen; WorkManager startet ihn, sobald die Netz-Bedingung erfüllt ist. */
        fun plane(c: Context, ersetzen: Boolean) {
            val anfrage = OneTimeWorkRequestBuilder<UploadWorker>()
                .setConstraints(bedingungen(c))
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(c).enqueueUniqueWork(
                EINMALIG,
                if (ersetzen) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.APPEND_OR_REPLACE,
                anfrage,
            )
        }

        /** Sicherheitsnetz: alle 15 Minuten (Minimum von WorkManager) mit derselben Bedingung. */
        fun planePeriodisch(c: Context) {
            val anfrage = PeriodicWorkRequestBuilder<UploadWorker>(15, TimeUnit.MINUTES)
                .setConstraints(bedingungen(c))
                .build()
            WorkManager.getInstance(c).enqueueUniquePeriodicWork(PERIODISCH, ExistingPeriodicWorkPolicy.UPDATE, anfrage)
        }
    }
}
