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
        if (!reader.hasAllPermissions()) {
            store.recordNote("Allow access to your health data in the app to sync.")
            return SyncOutcome.NeedsApp
        }
        if (inBackground && !reader.canReadInBackground()) {
            store.recordNote("Open the app to sync.")
            return SyncOutcome.NeedsApp
        }
        return try {
            val zone = runCatching { ZoneId.of(store.timezone) }.getOrDefault(ZoneId.systemDefault())
            val dates = syncWindow(clock.instant(), zone, first = !store.backfilled)
            val days = reader.read(dates, zone).filter { it.hasData }.map { it.toHealthDay() }
            val result = api.postHealth(server, token, HealthBatch(days = days))
            store.timezone = result.timezone
            store.recordSuccess(clock.instant(), days.size)
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
            store.recordNote("Open the app to allow access to your health data.")
            SyncOutcome.NeedsApp
        }
    }
}
