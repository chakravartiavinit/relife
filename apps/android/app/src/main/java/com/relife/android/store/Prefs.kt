package com.relife.android.store

import android.content.Context
import android.content.SharedPreferences
import java.time.Instant

/** What the sync needs to remember between runs. The phone's [Prefs] is one implementation, a map in tests another. */
interface SyncStore {
    val server: String?
    val token: String?
    /** The server's IANA time zone, learned right after pairing. Null until then. */
    var timezone: String?
    val lastSyncAt: Instant?
    /** Sync has run once and succeeded, so later runs read 3 days, not 30. */
    var backfilled: Boolean
    fun recordSuccess(at: Instant, days: Int)
    /** A line for the screen ("Open the app to sync"). Null clears it. */
    fun recordNote(note: String?)
    /** The server refused the token: forget it, keep nothing that could act as a login. */
    fun signOut()
}

/** A code the person is entering in Settings > Devices on the server, while the app polls for the answer. */
data class PendingPair(val server: String, val id: String, val userCode: String, val pollSecret: String, val expiresAtMs: Long, val intervalS: Int)

/**
 * Private SharedPreferences. The token is the only secret; it is ingest-only and revocable, and the manifest keeps
 * this file out of backups and device transfers.
 */
class Prefs(context: Context) : SyncStore {
    private val sp: SharedPreferences = context.applicationContext.getSharedPreferences("relife", Context.MODE_PRIVATE)

    override val server: String? get() = sp.getString("server", null)
    override val token: String? get() = sp.getString("token", null)
    override var timezone: String?
        get() = sp.getString("timezone", null)
        set(v) = sp.edit().putString("timezone", v).apply()
    override val lastSyncAt: Instant? get() = sp.getLong("lastSyncAt", 0).takeIf { it > 0 }?.let(Instant::ofEpochMilli)
    override var backfilled: Boolean
        get() = sp.getBoolean("backfilled", false)
        set(v) = sp.edit().putBoolean("backfilled", v).apply()
    val lastDays: Int get() = sp.getInt("lastDays", 0)
    val note: String? get() = sp.getString("note", null)
    val paired: Boolean get() = server != null && token != null

    fun pair(server: String, token: String) {
        sp.edit().putString("server", server).putString("token", token).remove("note").remove("lastSyncAt").putBoolean("backfilled", false).apply()
    }

    override fun recordSuccess(at: Instant, days: Int) {
        sp.edit().putLong("lastSyncAt", at.toEpochMilli()).putInt("lastDays", days).putBoolean("backfilled", true).remove("note").apply()
    }

    override fun recordNote(note: String?) {
        sp.edit().apply { if (note == null) remove("note") else putString("note", note) }.apply()
    }

    override fun signOut() {
        sp.edit().remove("token").remove("timezone").remove("lastSyncAt").putBoolean("backfilled", false).apply()
    }

    var pending: PendingPair?
        get() {
            val server = sp.getString("p.server", null) ?: return null
            return PendingPair(
                server, sp.getString("p.id", null) ?: return null, sp.getString("p.code", null) ?: return null,
                sp.getString("p.secret", null) ?: return null, sp.getLong("p.expires", 0), sp.getInt("p.interval", 2),
            )
        }
        set(v) {
            sp.edit().apply {
                if (v == null) listOf("p.server", "p.id", "p.code", "p.secret", "p.expires", "p.interval").forEach(::remove)
                else putString("p.server", v.server).putString("p.id", v.id).putString("p.code", v.userCode)
                    .putString("p.secret", v.pollSecret).putLong("p.expires", v.expiresAtMs).putInt("p.interval", v.intervalS)
            }.apply()
        }

    fun forgetAll() = sp.edit().clear().apply()
}
