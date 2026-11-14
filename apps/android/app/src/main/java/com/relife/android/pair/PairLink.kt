package com.relife.android.pair

import java.net.URI

/** What a scanned code carries: the server to talk to and the one-time secret that proves the scan. */
data class PairLink(val server: String, val secret: String) {
    /**
     * Plain `http://` only ever gets here for a private-network host (see [origin]), and the person still has to
     * confirm it: the token would cross that network unencrypted.
     */
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
         * Private-network and `.local` hosts get `http` (they have no certificate); everything else gets `https`, and a
         * typed `http://` on a public host is refused (null) rather than quietly upgraded or trusted.
         */
        fun normalizeServer(typed: String): String? {
            var text = typed.trim().trimEnd('/')
            if (text.isEmpty() || text.any { it.isWhitespace() }) return null
            if (!text.contains("://")) {
                val host = if (text.startsWith("[")) text.substringBefore(']').removePrefix("[") else text.substringBefore('/').substringBefore(':')
                text = (if (isPrivateHost(host)) "http://" else "https://") + text
            }
            val uri = runCatching { URI(text) }.getOrNull() ?: return null
            if (uri.scheme !in listOf("http", "https")) return null
            return origin(uri)
        }

        /** True for `http://` on a host that is not private: the one thing that is never allowed. */
        fun isPlainPublicHttp(text: String): Boolean {
            val uri = runCatching { URI(text.trim()) }.getOrNull() ?: return false
            val host = uri.host ?: return false
            return uri.scheme.equals("http", ignoreCase = true) && !isPrivateHost(host)
        }

        /** The origin, or null when it has no host or is plain `http` to a host that isn't on a private network. */
        private fun origin(uri: URI): String? {
            // URI keeps the brackets of an IPv6 literal in `host`; they are put back below.
            val host = (uri.host ?: return null).removePrefix("[").removeSuffix("]")
            val scheme = uri.scheme.lowercase()
            if (scheme == "http" && !isPrivateHost(host)) return null
            val hostPart = if (host.contains(':')) "[$host]" else host
            val default = if (scheme == "https") 443 else 80
            return "$scheme://$hostPart" + if (uri.port != -1 && uri.port != default) ":${uri.port}" else ""
        }

        /**
         * Hosts where `http` is acceptable: loopback, `.local`, RFC 1918, link-local, Tailscale's 100.64.0.0/10 and, for
         * IPv6 literals, ::1, fe80::/10 and fd00::/8 (which holds Tailscale's fd7a:115c:a1e0::/48).
         */
        fun isPrivateHost(host: String): Boolean {
            val h = host.lowercase().removePrefix("[").removeSuffix("]")
            if (h == "localhost" || h.endsWith(".local")) return true
            if (h.contains(':')) return isPrivateV6(h)
            val parts = h.split('.').mapNotNull { it.toIntOrNull() }
            if (parts.size != 4 || h.split('.').size != 4 || parts.any { it !in 0..255 }) return false
            val (a, b) = parts
            return a == 10 || a == 127 || (a == 192 && b == 168) || (a == 172 && b in 16..31) || (a == 169 && b == 254) || (a == 100 && b in 64..127)
        }

        private val V6_LITERAL = Regex("[0-9a-f:.]+")

        private fun isPrivateV6(h: String): Boolean {
            if (!V6_LITERAL.matches(h)) return false
            // A literal only: InetAddress does no lookup for one, and anything it can't read as an address throws.
            val bytes = runCatching { java.net.InetAddress.getByName(h) }.getOrNull()?.address?.takeIf { it.size == 16 } ?: return false
            val first = bytes[0].toInt() and 0xFF
            val second = bytes[1].toInt() and 0xFF
            val loopback = bytes.take(15).all { it.toInt() == 0 } && bytes[15].toInt() == 1
            return loopback || (first == 0xFE && (second and 0xC0) == 0x80) || first == 0xFD
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
