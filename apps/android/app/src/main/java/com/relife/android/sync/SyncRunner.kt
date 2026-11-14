package com.relife.android.sync

import com.relife.android.api.ApiException
import com.relife.android.api.HealthBatch
import com.relife.android.api.ReLifeApi
import com.relife.android.health.HealthReader
import com.relife.android.health.syncWindow
import com.relife.android.health.toHealthDay
import com.relife.android.store.SyncStore
import java.io.IOException
import java.time.Clock
import java.time.ZoneId
import kotlin.coroutines.cancellation.CancellationException

sealed interface SyncOutcome {
    data class Synced(val days: Int) : SyncOutcome
    data object NotPaired : SyncOutcome
    /** The app has to be opened (background permission missing, or the access was never granted). */
    data object NeedsApp : SyncOutcome
    /** The server no longer knows this device. The token has been forgotten. */
    data object SignedOut : SyncOutcome
    /** Worth another try later: no network, a server error or a rate limit. */
    data class Retry(val reason: String) : SyncOutcome
    /** The server said no to the data itself. Trying the same again would get the same answer. */
    data class Rejected(val reason: String) : SyncOutcome
}

/** One sync: read the window from Health Connect, send it, remember the result. No Android in here, so it is unit tested. */
class SyncRunner(
    private val store: SyncStore,
    private val reader: HealthReader,
    private val api: ReLifeApi,
    private val clock: Clock = Clock.systemUTC(),
) {
    /** `inBackground` is true for the hourly work: Health Connect refuses reads then unless the background permission is granted. */
    suspend fun run(inBackground: Boolean): SyncOutcome {
        val server = store.server
        val token = store.token
        if (server == null || token == null) return SyncOutcome.NotPaired
        val granted = reader.grantedReads()
        if (granted.isEmpty()) {
            store.recordNote("Allow access to your health data in the app to sync.")
            return SyncOutcome.NeedsApp
        }
        if (inBackground && !reader.canReadInBackground()) {
            store.recordNote("Open the app to sync.")
            return SyncOutcome.NeedsApp
        }
        return try {
            // Days are cut in the server's time zone, so a phone that doesn't know it yet asks before it reads anything.
            val tz = store.timezone ?: api.postHealth(server, token, HealthBatch(days = emptyList())).timezone.also { store.timezone = it }
            val zone = runCatching { ZoneId.of(tz) }.getOrDefault(ZoneId.systemDefault())
            val lastSync = if (store.backfilled) store.lastSyncAt else null
            val dates = syncWindow(clock.instant(), zone, lastSync)
            val days = reader.read(dates, zone, granted).filter { it.hasData }.map { it.toHealthDay() }
            val result = api.postHealth(server, token, HealthBatch(days = days))
            store.timezone = result.timezone
            store.recordSuccess(clock.instant(), days.size)
            // The server cut the days somewhere else than we did: what was sent may be a day off, so read the whole window again next time.
            if (result.timezone != tz) store.backfilled = false
            SyncOutcome.Synced(days.size)
        } catch (e: ApiException) {
            when {
                e.signedOut -> { store.signOut(); store.recordNote("This phone was disconnected. Scan a new code to pair again."); SyncOutcome.SignedOut }
                e.status == 429 || e.status >= 500 -> { store.recordNote("The server is busy. Trying again soon."); SyncOutcome.Retry(e.message.orEmpty()) }
                else -> { store.recordNote(e.message); SyncOutcome.Rejected(e.message.orEmpty()) }
            }
        } catch (e: IOException) {
            store.recordNote("Can't reach the server. Will try again.")
            SyncOutcome.Retry(e.message.orEmpty())
        } catch (e: SecurityException) {
            // Access is granted (checked above), so asking the person to "allow access" would be wrong. In the background
            // the missing piece is the background permission; with the app open, something was switched off just now.
            store.recordNote(if (inBackground) "Open the app to sync." else "Health Connect refused a read. Check what is allowed in the app.")
            SyncOutcome.NeedsApp
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Anything else (a Health Connect hiccup, an answer that isn't JSON) must not kill the worker with a crash.
            store.recordNote("Something went wrong while syncing. Will try again.")
            SyncOutcome.Retry(e.message.orEmpty())
        }
    }
}
