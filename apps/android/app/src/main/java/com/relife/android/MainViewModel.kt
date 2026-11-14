package com.relife.android

import android.app.Application
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import com.relife.android.api.ApiException
import com.relife.android.api.HealthBatch
import com.relife.android.api.HttpApi
import com.relife.android.api.PairRedeem
import com.relife.android.api.PairRequestStart
import com.relife.android.api.ReLifeApi
import com.relife.android.health.HcStatus
import com.relife.android.health.HealthAccess
import com.relife.android.pair.PairLink
import com.relife.android.store.PendingPair
import com.relife.android.store.Prefs
import com.relife.android.sync.Sync
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import java.net.URI
import java.time.Instant

/** A server address that is plain `http://`, waiting for the person to say it is OK. */
sealed interface Confirm {
    val server: String
    data class Scan(val link: PairLink) : Confirm { override val server get() = link.server }
    data class Typed(override val server: String) : Confirm
}

data class UiState(
    val paired: Boolean = false,
    val serverHost: String? = null,
    val hc: HcStatus = HcStatus.Available,
    val granted: Set<String> = emptySet(),
    val backgroundAvailable: Boolean = false,
    val lastSync: Instant? = null,
    val lastDays: Int = 0,
    val note: String? = null,
    val pending: PendingPair? = null,
    val busy: Boolean = false,
    val error: String? = null,
    val confirm: Confirm? = null,
) {
    val missing: Set<String> get() = HealthAccess.permissions - granted
    val backgroundGranted: Boolean get() = HealthAccess.BACKGROUND in granted
}

class MainViewModel(app: Application) : AndroidViewModel(app) {
    private val prefs = Prefs(app)
    private val api: ReLifeApi = HttpApi(Sync.userAgent)
    private val _ui = MutableStateFlow(UiState())
    val ui: StateFlow<UiState> = _ui.asStateFlow()
    private var pollJob: Job? = null

    init {
        refresh()
        prefs.pending?.let(::poll)
        // A sync that finishes while the app is open should show up on the screen.
        viewModelScope.launch { WorkManager.getInstance(app).getWorkInfosForUniqueWorkFlow(Sync.NOW).collect { refresh() } }
    }

    fun refresh() {
        viewModelScope.launch {
            val hc = HealthAccess.status(getApplication())
            val access = if (hc == HcStatus.Available) runCatching { HealthAccess.access(getApplication()) }.getOrNull() else null
            _ui.update {
                it.copy(
                    paired = prefs.paired, serverHost = prefs.server?.let { s -> runCatching { URI(s).authority }.getOrNull() },
                    hc = hc, granted = access?.granted.orEmpty(), backgroundAvailable = access?.backgroundAvailable ?: false,
                    lastSync = prefs.lastSyncAt, lastDays = prefs.lastDays, note = prefs.note, pending = prefs.pending,
                )
            }
        }
    }

    fun scanFailed(message: String?) = fail(message ?: "The scanner didn't open.")
    fun dismissError() = _ui.update { it.copy(error = null) }
    fun dismissConfirm() = _ui.update { it.copy(confirm = null) }

    /** The scanner returned text. Anything that isn't a pairing link is told so, not silently dropped. */
    fun scanned(text: String) {
        val link = PairLink.parse(text) ?: return fail("That isn't a pairing code. Scan the one on the \"Use on your phone\" page.")
        if (link.encrypted) redeem(link) else _ui.update { it.copy(confirm = Confirm.Scan(link)) }
    }

    fun typed(address: String) {
        val server = PairLink.normalizeServer(address) ?: return fail("That doesn't look like an address. Try something like 192.168.1.20:3030.")
        if (server.startsWith("https://")) request(server) else _ui.update { it.copy(confirm = Confirm.Typed(server)) }
    }

    /** "Continue anyway" on the not-encrypted warning. */
    fun confirmed() {
        val c = _ui.value.confirm ?: return
        dismissConfirm()
        when (c) {
            is Confirm.Scan -> redeem(c.link)
            is Confirm.Typed -> request(c.server)
        }
    }

    private fun redeem(link: PairLink) = busy {
        verify(link.server)
        val res = api.redeem(link.server, PairRedeem(secret = link.secret, kind = "phone", name = deviceName(), platform = Sync.userAgent, scopes = listOf("ingest")))
        finish(link.server, res.token ?: throw IOException("The server didn't hand out a token."))
    }

    private fun request(server: String) = busy {
        verify(server)
        val s = api.startRequest(server, PairRequestStart(kind = "phone", name = deviceName(), platform = Sync.userAgent, scopes = listOf("ingest")))
        val pending = PendingPair(server, s.id, s.userCode, s.pollSecret, Instant.parse(s.expiresAt).toEpochMilli(), s.interval)
        prefs.pending = pending
        refresh()
        poll(pending)
    }

    /** Makes sure the address really is one of our servers before anything is sent to it. */
    private suspend fun verify(server: String) {
        if (api.hello(server).app != "relife") throw IOException("That address isn't a ${appName()} server.")
    }

    private fun poll(p: PendingPair) {
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            while (true) {
                if (System.currentTimeMillis() > p.expiresAtMs) return@launch endPending("That code ran out. Ask for a new one.")
                delay(p.intervalS.coerceAtLeast(1) * 1000L)
                val res = try { api.poll(p.server, p.id, p.pollSecret) } catch (e: ApiException) {
                    return@launch endPending(e.message.orEmpty())
                } catch (_: IOException) { continue }
                when (res.status) {
                    "approved" -> {
                        try { finish(p.server, res.token ?: throw IOException("The server didn't hand out a token.")) } catch (e: Exception) { endPending(describe(e)) }
                        return@launch
                    }
                    "denied" -> return@launch endPending("The request was turned down in Settings.")
                    "expired" -> return@launch endPending("That code ran out. Ask for a new one.")
                }
            }
        }
    }

    private fun endPending(message: String) {
        prefs.pending = null
        fail(message)
        refresh()
    }

    fun cancelPending() {
        pollJob?.cancel()
        prefs.pending = null
        refresh()
    }

    private suspend fun finish(server: String, token: String) {
        prefs.pair(server, token)
        prefs.pending = null
        // An empty batch costs nothing and tells us which time zone the server cuts days in.
        runCatching { api.postHealth(server, token, HealthBatch(days = emptyList())) }.onSuccess { prefs.timezone = it.timezone }
        Sync.schedule(getApplication())
        Sync.now(getApplication())
        refresh()
    }

    fun syncNow() {
        prefs.recordNote(null)
        Sync.now(getApplication())
        refresh()
    }

    fun disconnect() {
        viewModelScope.launch {
            val server = prefs.server
            val token = prefs.token
            // Tell the server to forget this phone. If it can't be reached, the person can still revoke it under Settings > Devices.
            if (server != null && token != null) runCatching { api.revokeSelf(server, token) }
            Sync.cancel(getApplication())
            prefs.forgetAll()
            refresh()
        }
    }

    private fun busy(block: suspend () -> Unit) {
        viewModelScope.launch {
            _ui.update { it.copy(busy = true, error = null) }
            try { block() } catch (e: Exception) { fail(describe(e)) } finally { _ui.update { it.copy(busy = false) } }
        }
    }

    private fun describe(e: Throwable): String = when (e) {
        is ApiException -> e.message.orEmpty()
        is IOException -> e.message?.takeIf { it.startsWith("That") || it.startsWith("The server") } ?: "Can't reach the server. Is this phone on the same network (or Tailscale)?"
        else -> e.message ?: "Something went wrong."
    }

    private fun fail(message: String) = _ui.update { it.copy(error = message) }

    private fun appName(): String = getApplication<Application>().getString(R.string.app_name)

    private fun deviceName(): String = "${Build.MODEL.take(60)} · Health Connect"
}
