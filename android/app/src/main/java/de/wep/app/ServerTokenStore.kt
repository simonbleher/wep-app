package de.wep.app

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Sitzungs-Token des WEP-Servers (v2, Paket 8) verschlüsselt im App-Speicher (EncryptedSharedPreferences, Schlüssel im
 * Android Keystore). Eigene Datei, getrennt von der OneDrive-Anmeldung in [TokenStore]: Abmelden beim Server lässt die
 * OneDrive-Anmeldung von v1 unberührt und umgekehrt.
 */
object ServerTokenStore {
    private const val DATEI = "wep_server"
    private const val SCHLUESSEL = "token"

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
    fun lese(c: Context): String? = prefs(c).getString(SCHLUESSEL, null)?.ifEmpty { null }

    @Synchronized
    fun speichere(c: Context, token: String) {
        // commit statt apply: Die App benutzt das Token erst, wenn es sicher liegt
        prefs(c).edit().putString(SCHLUESSEL, token).commit()
    }

    @Synchronized
    fun loesche(c: Context) {
        prefs(c).edit().clear().commit()
    }
}
