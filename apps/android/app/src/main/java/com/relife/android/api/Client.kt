package com.relife.android.api

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** An answer the server gave with a non-2xx status. `code` is the contract's ApiError code (`revoked`, `expired`, ...). */
class ApiException(val status: Int, val code: String, message: String) : IOException(message) {
    /** The token is no good any more: the device was revoked, expired or never existed. */
    val signedOut: Boolean get() = status == 401
}

/** Everything the app asks of a ReLife server. A fake in tests; [HttpApi] on the phone. */
interface ReLifeApi {
    suspend fun hello(server: String): Hello
    suspend fun redeem(server: String, body: PairRedeem): PairRedeemResult
    suspend fun startRequest(server: String, body: PairRequestStart): PairRequestStarted
    suspend fun poll(server: String, id: String, pollSecret: String): PairPoll
    suspend fun postHealth(server: String, token: String, batch: HealthBatch): HealthIngestResult
    suspend fun revokeSelf(server: String, token: String)
}

/** `HttpURLConnection` on purpose: this app makes five kinds of call, which doesn't need an HTTP library. */
class HttpApi(private val userAgent: String) : ReLifeApi {
    override suspend fun hello(server: String): Hello = send("GET", server, "/api/v1/hello", null, null)

    override suspend fun redeem(server: String, body: PairRedeem): PairRedeemResult =
        send("POST", server, "/api/v1/pair/redeem", null, ContractJson.encodeToString(body))

    override suspend fun startRequest(server: String, body: PairRequestStart): PairRequestStarted =
        send("POST", server, "/api/v1/pair/requests", null, ContractJson.encodeToString(body))

    override suspend fun poll(server: String, id: String, pollSecret: String): PairPoll =
        send("POST", server, "/api/v1/pair/requests/$id/poll", null, ContractJson.encodeToString(PairPollBody(pollSecret)))

    override suspend fun postHealth(server: String, token: String, batch: HealthBatch): HealthIngestResult =
        send("POST", server, "/api/v1/health", token, ContractJson.encodeToString(batch))

    override suspend fun revokeSelf(server: String, token: String) {
        execute("POST", server, "/api/v1/devices/me/revoke", token, "{}")
    }

    private suspend inline fun <reified T> send(method: String, server: String, path: String, token: String?, body: String?): T =
        ContractJson.decodeFromString(execute(method, server, path, token, body))

    private suspend fun execute(method: String, server: String, path: String, token: String?, body: String?): String =
        withContext(Dispatchers.IO) {
            val conn = URL(server.trimEnd('/') + path).openConnection() as HttpURLConnection
            try {
                conn.requestMethod = method
                conn.connectTimeout = 15_000
                conn.readTimeout = 30_000
                conn.setRequestProperty("Accept", "application/json")
                conn.setRequestProperty("User-Agent", userAgent)
                if (token != null) conn.setRequestProperty("Authorization", "Bearer $token")
                if (body != null) {
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.outputStream.use { it.write(body.toByteArray()) }
                }
                val status = conn.responseCode
                val text = (if (status in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
                if (status !in 200..299) throw errorFor(status, text)
                text
            } finally {
                conn.disconnect()
            }
        }

    private fun errorFor(status: Int, text: String): ApiException {
        val parsed = runCatching { ContractJson.decodeFromString<ApiError>(text).error }.getOrNull()
        return ApiException(status, parsed?.code ?: "http_$status", parsed?.message ?: "The server answered $status.")
    }
}
