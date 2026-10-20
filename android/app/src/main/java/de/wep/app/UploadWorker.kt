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
 * conflictBehavior=fail für Dateien, die es noch nicht gab. Bei 412/409/404 bleibt die
 * Datei liegen – die App klärt den Konflikt beim Öffnen.
 *
 * Fotos (FotoWarteschlange.kt) gehen nach daten/fotos/<WEP>/<Foto>.jpg; gesperrte WEPs (Papierkorb)
 * nie, und ein Foto, das während des Löschens hochgeladen wurde, wandert sofort in den Papierkorb-Ordner.
 *
 * Gelöschte WEPs (Löschsperre, siehe Warteschlange.kt) lädt der Worker nie hoch. Ist während
 * eines Uploads gelöscht worden, verschiebt er die eben geschriebene Datei sofort nach
 * daten/papierkorb/ (mit Löschzeitpunkt) und entfernt sie aus daten/.
 */
class UploadWorker(private val ctx: Context, params: WorkerParameters) : Worker(ctx, params) {

    override fun doWork(): Result {
        val offen = Warteschlange.liste(ctx).filter { !it.blockiert }
        val aufraeumen = Warteschlange.offeneLoeschungen(ctx)
        val fotos = FotoWarteschlange.liste(ctx)
        val (netz, unmetered) = Netz.info(ctx)
        if (offen.isEmpty() && aufraeumen.isEmpty() && fotos.isEmpty()) return Result.success()
        Protokoll.eintrag(ctx, "lauf", "Lauf gestartet (Netz: $netz${if (unmetered) ", unbegrenzt" else ", getaktet"}): ${offen.size} Datei(en), ${fotos.size} Foto(s), ${aufraeumen.size} Löschung(en) nachzuziehen")

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
        // Zuerst nachziehen, was während eines früheren Uploads gelöscht wurde
        for (g in aufraeumen) {
            try {
                if (!entsorge(g, token)) wiederholen = true
            } catch (e: AnmeldungAbgelaufen) {
                Protokoll.eintrag(ctx, "fehler", "Anmeldung abgelaufen – bitte in der App erneut anmelden")
                return Result.success()
            } catch (e: Exception) {
                wiederholen = true
                Protokoll.eintrag(ctx, "fehler", "${g.name}: Löschung nachziehen: ${e.javaClass.simpleName}: ${e.message}")
            }
        }
        for (eintrag in offen) {
            if (isStopped) {
                Protokoll.eintrag(ctx, "info", "Lauf unterbrochen")
                return Result.retry()
            }
            // Gelöschte WEPs nie hochladen (die App hat den Eintrag meist schon entfernt)
            if (Warteschlange.istGeloescht(ctx, eintrag.name)) {
                Warteschlange.entferne(ctx, eintrag.name)
                Protokoll.eintrag(ctx, "info", "${eintrag.name}: gelöscht – wird nicht hochgeladen")
                continue
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
                        if (Warteschlange.erfolgreich(ctx, eintrag, eTag)) {
                            ok++
                            Protokoll.eintrag(ctx, "upload", "${eintrag.name} hochgeladen (eTag $eTag)")
                        } else {
                            // Während des Uploads gelöscht: die Datei darf nicht in daten/ liegen bleiben
                            Protokoll.eintrag(ctx, "info", "${eintrag.name}: während des Uploads gelöscht – wird in den Papierkorb verschoben")
                            val g = Warteschlange.offeneLoeschungen(ctx).firstOrNull { it.name == eintrag.name }
                            if (g != null && !entsorge(g, token)) wiederholen = true
                        }
                    }
                    a.status == 412 || a.status == 409 || a.status == 404 -> {
                        // 404: die Datei ist in OneDrive nicht mehr in daten/ (z. B. auf einem anderen Gerät gelöscht)
                        Warteschlange.markiereBlockiert(ctx, eintrag.name)
                        Protokoll.eintrag(ctx, "fehler", "${eintrag.name}: in OneDrive geändert oder gelöscht (${a.status}) – bleibt liegen, die App klärt es beim Öffnen")
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
        // Fotos nach den WEP-Dateien: ein Foto ist groß, der Text soll zuerst ankommen
        var okFotos = 0
        for (foto in fotos) {
            if (isStopped) {
                Protokoll.eintrag(ctx, "info", "Lauf unterbrochen")
                return Result.retry()
            }
            if (FotoWarteschlange.istGesperrt(ctx, foto.wepId)) {
                foto.datei.delete()
                Protokoll.eintrag(ctx, "info", "Foto ${foto.wepId}/${foto.fotoId}: WEP gelöscht – wird nicht hochgeladen")
                continue
            }
            try {
                val bytes = foto.datei.readBytes()
                var a = ladeFoto(foto, bytes, token)
                if (a.status == 401) {
                    token = TokenStore.zugriffstoken(ctx, erzwingen = true)
                    a = ladeFoto(foto, bytes, token)
                }
                when {
                    a.status in 200..201 -> {
                        val eTag = JSONObject(a.text).optString("eTag")
                        if (FotoWarteschlange.erfolgreich(ctx, foto)) {
                            okFotos++
                            Protokoll.eintrag(ctx, "upload", "Foto ${foto.wepId}/${foto.fotoId} hochgeladen")
                        } else {
                            // Während des Uploads gelöscht: das Foto darf nicht in daten/fotos/ liegen bleiben
                            Protokoll.eintrag(ctx, "info", "Foto ${foto.wepId}/${foto.fotoId}: während des Uploads gelöscht – wird in den Papierkorb verschoben")
                            if (!entsorgeFoto(foto, bytes, eTag, token)) wiederholen = true
                        }
                    }
                    a.status == 429 || a.status >= 500 -> {
                        wiederholen = true
                        Protokoll.eintrag(ctx, "fehler", "Foto ${foto.wepId}/${foto.fotoId}: OneDrive-Fehler ${a.status}, später erneut")
                    }
                    else -> {
                        wiederholen = true
                        Protokoll.eintrag(ctx, "fehler", "Foto ${foto.wepId}/${foto.fotoId}: Fehler ${a.status} ${a.text.take(160)}")
                    }
                }
            } catch (e: AnmeldungAbgelaufen) {
                Protokoll.eintrag(ctx, "fehler", "Anmeldung abgelaufen – bitte in der App erneut anmelden")
                return Result.success()
            } catch (e: Exception) {
                wiederholen = true
                Protokoll.eintrag(ctx, "fehler", "Foto ${foto.wepId}/${foto.fotoId}: ${e.javaClass.simpleName}: ${e.message}")
            }
        }
        Protokoll.eintrag(ctx, "lauf", "Lauf beendet: $ok von ${offen.size} Datei(en), $okFotos von ${fotos.size} Foto(s) hochgeladen")
        return if (wiederholen) retry() else Result.success()
    }

    private fun graphPfad(pfad: String): String =
        "https://graph.microsoft.com/v1.0/me/drive/special/approot:/$pfad:"

    /**
     * Die Datei wurde während des Löschens hochgeladen und liegt zu Unrecht in daten/: Erst die
     * Fassung mit Löschzeitpunkt in daten/papierkorb/ ablegen (der Pfad-Upload legt fehlende
     * Ordner an), dann aus daten/ entfernen – nur wenn dort noch unsere Fassung liegt (If-Match).
     * Liefert true, wenn der Nachlauf erledigt ist.
     */
    private fun entsorge(g: Warteschlange.Geloescht, token: String): Boolean {
        val inhalt = g.inhalt ?: run {
            Warteschlange.nachlaufErledigt(ctx, g.name)
            return true
        }
        val kopf = mutableMapOf("Authorization" to "Bearer $token", "Content-Type" to "application/json")
        val datei = JSONObject(inhalt)
            .put("geloeschtAm", g.geloeschtAm)
            .put("geloeschtVon", "Android-Hintergrunddienst")
        val name = Uri.encode(g.name)
        val ablage = Http.put(graphPfad("daten/papierkorb/$name") + "/content", datei.toString().toByteArray(Charsets.UTF_8), kopf)
        if (ablage.status !in 200..201) {
            Protokoll.eintrag(ctx, "fehler", "${g.name}: Papierkorb-Ablage fehlgeschlagen (${ablage.status}), später erneut")
            return false
        }
        val weg = Http.delete(
            graphPfad("daten/$name"),
            mutableMapOf("Authorization" to "Bearer $token").also { if (g.eTag != null) it["If-Match"] = g.eTag },
        )
        return when {
            weg.status in 200..204 || weg.status == 404 -> {
                Warteschlange.nachlaufErledigt(ctx, g.name)
                Protokoll.eintrag(ctx, "info", "${g.name}: in den Papierkorb verschoben")
                true
            }
            weg.status == 412 -> {
                // In daten/ liegt inzwischen eine andere Fassung (anderes Gerät): die App klärt es beim Abgleich
                Warteschlange.nachlaufErledigt(ctx, g.name)
                Protokoll.eintrag(ctx, "fehler", "${g.name}: in daten/ inzwischen geändert (412) – die App klärt es beim Abgleich")
                true
            }
            else -> {
                Protokoll.eintrag(ctx, "fehler", "${g.name}: Entfernen aus daten/ fehlgeschlagen (${weg.status}), später erneut")
                false
            }
        }
    }

    /** Foto nach daten/fotos/<WEP>/<Foto>.jpg; gleiche Id = gleiches Bild, Ersetzen ist ungefährlich. */
    private fun ladeFoto(f: FotoWarteschlange.Eintrag, bytes: ByteArray, token: String): Http.Antwort {
        val pfad = "daten/fotos/" + Uri.encode(f.wepId) + "/" + Uri.encode(f.fotoId + ".jpg")
        val url = "https://graph.microsoft.com/v1.0/me/drive/special/approot:/$pfad:/content?@microsoft.graph.conflictBehavior=replace"
        return Http.put(url, bytes, mapOf("Authorization" to "Bearer $token", "Content-Type" to "image/jpeg"))
    }

    /**
     * Das WEP wurde gelöscht, während das Foto hochgeladen wurde: Erst im Papierkorb-Ordner ablegen
     * (daten/papierkorb/fotos/<WEP>/), dann aus daten/fotos/ entfernen (nur wenn dort noch unsere Datei liegt).
     * Liefert true, wenn es erledigt ist; sonst räumt der nächste Abgleich der App auf.
     */
    private fun entsorgeFoto(f: FotoWarteschlange.Eintrag, bytes: ByteArray, eTag: String, token: String): Boolean {
        val name = Uri.encode(f.wepId) + "/" + Uri.encode(f.fotoId + ".jpg")
        val ablage = Http.put(
            graphPfad("daten/papierkorb/fotos/$name") + "/content",
            bytes,
            mapOf("Authorization" to "Bearer $token", "Content-Type" to "image/jpeg"),
        )
        if (ablage.status !in 200..201) {
            Protokoll.eintrag(ctx, "fehler", "Foto ${f.wepId}/${f.fotoId}: Papierkorb-Ablage fehlgeschlagen (${ablage.status}), die App räumt beim Abgleich auf")
            return false
        }
        val weg = Http.delete(
            graphPfad("daten/fotos/$name"),
            mutableMapOf("Authorization" to "Bearer $token").also { if (eTag.isNotEmpty()) it["If-Match"] = eTag },
        )
        return weg.status in 200..204 || weg.status == 404 || weg.status == 412
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
