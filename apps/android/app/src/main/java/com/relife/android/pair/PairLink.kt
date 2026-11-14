package com.relife.android.pair

import java.net.URI

/** What a scanned code carries: the server to talk to and the one-time secret that proves the scan. */
data class PairLink(val server: String, val secret: String) {
    /** Plain `http://` has to be confirmed by the person: the token would cross the network unencrypted. */
    val encrypted: Boolean get() = server.startsWith("https://")

    companion object {
        /**
         * Reads `https://host/pair#s=<secret>` (what the web page's QR holds) or the Mac deep link
         * `relife://pair?server=<url>&s=<secret>`. Null for anything else, so a stray QR code is just ignored.
         */
        fun parse(text: String): PairLink? {
            val raw = text.trim()
            val uri = runCatching { URI(raw) }.getOrNull() ?: return null
            return when (uri.scheme?.lowercase()) {
                "http", "https" -> {
                    val secret = fragmentParam(uri.rawFragment, "s") ?: return null
                    val origin = origin(uri) ?: return null
                    if (uri.path != "/pair") return null
                    link(origin, secret)
                }
                "relife" -> {
                    val server = queryParam(uri.rawQuery, "server") ?: return null
                    val secret = queryParam(uri.rawQuery, "s") ?: return null
                    link(normalizeServer(server) ?: return null, secret)
                }
                else -> null
            }
        }

        private fun link(server: String, secret: String): PairLink? = if (secret.length >= 16 && secret.length <= 200) PairLink(server, secret) else null

        /**
         * A typed address becomes an origin: `192.168.1.5:3000` and `mymac.tail1234.ts.net` work without the scheme.
         * Private-network and `.local` hosts get `http` (they have no certificate); everything else gets `https`.
         */
        fun normalizeServer(typed: String): String? {
            var text = typed.trim().trimEnd('/')
            if (text.isEmpty() || text.any { it.isWhitespace() }) return null
            if (!text.contains("://")) {
                val host = text.substringBefore('/').substringBefore(':')
                text = (if (isPrivateHost(host)) "http://" else "https://") + text
            }
            val uri = runCatching { URI(text) }.getOrNull() ?: return null
            if (uri.scheme !in listOf("http", "https")) return null
            return origin(uri)
        }

        private fun origin(uri: URI): String? {
            val host = uri.host ?: return null
            val scheme = uri.scheme.lowercase()
            val hostPart = if (host.contains(':')) "[$host]" else host
            val default = if (scheme == "https") 443 else 80
            return "$scheme://$hostPart" + if (uri.port != -1 && uri.port != default) ":${uri.port}" else ""
        }

        /** Hosts where `http` is acceptable: loopback, `.local`, RFC 1918, link-local and Tailscale's 100.64.0.0/10. */
        fun isPrivateHost(host: String): Boolean {
            val h = host.lowercase()
            if (h == "localhost" || h.endsWith(".local")) return true
            val parts = h.split('.').mapNotNull { it.toIntOrNull() }
            if (parts.size != 4 || h.split('.').size != 4 || parts.any { it !in 0..255 }) return false
            val (a, b) = parts
            return a == 10 || a == 127 || (a == 192 && b == 168) || (a == 172 && b in 16..31) || (a == 169 && b == 254) || (a == 100 && b in 64..127)
        }

        private fun fragmentParam(fragment: String?, key: String): String? = param(fragment, key)
        private fun queryParam(query: String?, key: String): String? = param(query, key)

        private fun param(text: String?, key: String): String? =
            text?.split('&')?.mapNotNull { pair ->
                val i = pair.indexOf('=')
                if (i > 0 && pair.substring(0, i) == key) java.net.URLDecoder.decode(pair.substring(i + 1), "UTF-8") else null
            }?.firstOrNull()?.takeIf { it.isNotEmpty() }
    }
}
