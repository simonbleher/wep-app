package de.wep.app

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities

object Netz {
    /** Typ des aktiven Netzes und ob es „nicht getaktet“ ist (was WorkManager als UNMETERED prüft). */
    fun info(c: Context): Pair<String, Boolean> {
        val cm = c.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val netz = cm.activeNetwork ?: return Pair("keins", false)
        val cap = cm.getNetworkCapabilities(netz) ?: return Pair("keins", false)
        val typ = when {
            cap.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WLAN"
            cap.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Mobilfunk"
            cap.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
            else -> "Sonstiges"
        }
        return Pair(typ, cap.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED))
    }
}
