package de.wep.app

import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Einfache HTTP-Aufrufe ohne WebView: Es wird kein Origin-Header gesendet (Microsoft lehnt
 * Token-Anfragen mit Origin für Registrierungen ohne SPA-Plattform ab).
 */
object Http {
    class Antwort(val status: Int, val text: String)

    private fun ausfuehren(verbindung: HttpURLConnection, body: ByteArray?): Antwort {
        try {
            verbindung.connectTimeout = 20_000
            verbindung.readTimeout = 60_000
            if (body != null) {
                verbindung.doOutput = true
                verbindung.outputStream.use { it.write(body) }
            }
            val status = verbindung.responseCode
            val strom = if (status in 200..399) verbindung.inputStream else verbindung.errorStream
            val text = strom?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            return Antwort(status, text)
        } finally {
            verbindung.disconnect()
        }
    }

    fun postFormular(url: String, formular: Map<String, String>): Antwort {
        val body = formular.entries.joinToString("&") {
            URLEncoder.encode(it.key, "UTF-8") + "=" + URLEncoder.encode(it.value, "UTF-8")
        }.toByteArray(Charsets.UTF_8)
        val v = URL(url).openConnection() as HttpURLConnection
        v.requestMethod = "POST"
        v.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
        v.setRequestProperty("Accept", "application/json")
        return ausfuehren(v, body)
    }

    fun put(url: String, body: ByteArray, kopfzeilen: Map<String, String>): Antwort {
        val v = URL(url).openConnection() as HttpURLConnection
        v.requestMethod = "PUT"
        v.setRequestProperty("Accept", "application/json")
        kopfzeilen.forEach { (k, w) -> v.setRequestProperty(k, w) }
        return ausfuehren(v, body)
    }
}
