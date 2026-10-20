package de.wep.app

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject

/** Die Anmeldung ist abgelaufen oder widerrufen: Der Nutzer muss sich neu anmelden. */
class AnmeldungAbgelaufen(text: String) : Exception(text)

/**
 * Anmeldedaten (Refresh-/Zugriffstoken) verschlüsselt im App-Speicher
 * (EncryptedSharedPreferences). Die App (über das Plugin) und der Hintergrunddienst
 * greifen auf dieselbe Ablage zu; die Erneuerung ist synchronisiert.
 */
object TokenStore {
    private const val DATEI = "wep_anmeldung"
    private const val AUTHORITY = "https://login.microsoftonline.com/consumers"
    private const val SCOPE = "openid profile offline_access Files.ReadWrite.AppFolder"
    private const val PUFFER_MS = 2 * 60 * 1000L

    class Anmeldung(
        val clientId: String,
        val refreshToken: String,
        val accessToken: String,
        val ablauf: Long,
        val name: String,
        val benutzername: String,
    )

    @Volatile private var prefs: SharedPreferences? = null

    private fun prefs(c: Context): SharedPreferences {
        prefs?.let { return it }
        synchronized(this) {
            prefs?.let { return it }
            val ctx = c.applicationContext
            val schluessel = MasterKey.Builder(ctx).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
            val neu = EncryptedSharedPreferences.create(
                ctx,
                DATEI,
                schluessel,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
            prefs = neu
            return neu
        }
    }

    @Synchronized
    fun lese(c: Context): Anmeldung? {
        val p = prefs(c)
        val refresh = p.getString("refreshToken", null) ?: return null
        return Anmeldung(
            clientId = p.getString("clientId", "") ?: "",
            refreshToken = refresh,
            accessToken = p.getString("accessToken", "") ?: "",
            ablauf = p.getLong("ablauf", 0),
            name = p.getString("name", "") ?: "",
            benutzername = p.getString("benutzername", "") ?: "",
        )
    }

    @Synchronized
    fun speichere(c: Context, a: Anmeldung) {
        prefs(c).edit()
            .putString("clientId", a.clientId)
            .putString("refreshToken", a.refreshToken)
            .putString("accessToken", a.accessToken)
            .putLong("ablauf", a.ablauf)
            .putString("name", a.name)
            .putString("benutzername", a.benutzername)
            .apply()
    }

    @Synchronized
    fun loesche(c: Context) {
        prefs(c).edit().clear().apply()
    }

    /**
     * Gültiges Zugriffstoken: das gespeicherte, solange es noch mindestens 2 Minuten
     * hält (oder `erzwingen` nicht gesetzt ist), sonst per Refresh-Token erneuert.
     * Wirft [AnmeldungAbgelaufen], wenn Microsoft den Refresh-Token ablehnt.
     */
    @Synchronized
    fun zugriffstoken(c: Context, erzwingen: Boolean = false): String {
        val a = lese(c) ?: throw AnmeldungAbgelaufen("Nicht angemeldet")
        if (!erzwingen && a.accessToken.isNotEmpty() && a.ablauf - System.currentTimeMillis() > PUFFER_MS) {
            return a.accessToken
        }
        val antwort = Http.postFormular(
            "$AUTHORITY/oauth2/v2.0/token",
            mapOf(
                "client_id" to a.clientId,
                "grant_type" to "refresh_token",
                "refresh_token" to a.refreshToken,
                "scope" to SCOPE,
            ),
        )
        val json = runCatching { JSONObject(antwort.text) }.getOrNull()
        if (antwort.status != 200 || json == null || !json.has("access_token")) {
            val fehler = json?.optString("error").orEmpty()
            if (fehler == "invalid_grant") throw AnmeldungAbgelaufen("Refresh-Token abgelehnt (invalid_grant)")
            throw java.io.IOException("Token-Erneuerung fehlgeschlagen (${antwort.status}) $fehler")
        }
        val neu = Anmeldung(
            clientId = a.clientId,
            refreshToken = json.optString("refresh_token").ifEmpty { a.refreshToken },
            accessToken = json.getString("access_token"),
            ablauf = System.currentTimeMillis() + json.optLong("expires_in", 3600) * 1000,
            name = a.name,
            benutzername = a.benutzername,
        )
        speichere(c, neu)
        return neu.accessToken
    }
}
