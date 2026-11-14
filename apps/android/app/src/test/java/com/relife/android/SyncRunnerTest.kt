package com.relife.android

import com.relife.android.api.ApiException
import com.relife.android.api.HealthBatch
import com.relife.android.api.HealthIngestResult
import com.relife.android.api.Hello
import com.relife.android.api.PairPoll
import com.relife.android.api.PairRedeem
import com.relife.android.api.PairRedeemResult
import com.relife.android.api.PairRequestStart
import com.relife.android.api.PairRequestStarted
import com.relife.android.api.ReLifeApi
import com.relife.android.health.DayReading
import com.relife.android.health.HealthReader
import com.relife.android.store.SyncStore
import com.relife.android.sync.SyncOutcome
import com.relife.android.sync.SyncRunner
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset

class SyncRunnerTest {
    private class Store(override var server: String? = "https://relife.test", override var token: String? = "rlf_x") : SyncStore {
        override var timezone: String? = "Asia/Kolkata"
        override var lastSyncAt: Instant? = null
        override var backfilled = false
        var note: String? = null
        var lastDays = -1
        override fun recordSuccess(at: Instant, days: Int) { lastSyncAt = at; lastDays = days; backfilled = true; note = null }
        override fun recordNote(note: String?) { this.note = note }
        override fun signOut() { token = null; timezone = null; backfilled = false }
    }

    private val everything = setOf("steps", "sleep", "weight")

    private class Reader(
        var granted: Set<String> = setOf("steps", "sleep", "weight"), var background: Boolean = true,
        val data: Map<LocalDate, DayReading> = emptyMap(), val fail: Exception? = null,
    ) : HealthReader {
        var asked: List<LocalDate> = emptyList()
        var askedGranted: Set<String>? = null
        var askedZone: ZoneId? = null
        override suspend fun canReadInBackground() = background
        override suspend fun grantedReads() = granted
        override suspend fun read(dates: List<LocalDate>, zone: ZoneId, granted: Set<String>): List<DayReading> {
            fail?.let { throw it }
            asked = dates
            askedGranted = granted
            askedZone = zone
            return dates.map { data[it] ?: DayReading(it) }
        }
    }

    private class Api(var fail: Exception? = null, var timezone: String = "Asia/Kolkata") : ReLifeApi {
        val sent = mutableListOf<HealthBatch>()
        override suspend fun postHealth(server: String, token: String, batch: HealthBatch): HealthIngestResult {
            fail?.let { throw it }
            sent += batch
            return HealthIngestResult(true, batch.days.size, batch.days.size, timezone)
        }
        override suspend fun hello(server: String): Hello = error("unused")
        override suspend fun redeem(server: String, body: PairRedeem): PairRedeemResult = error("unused")
        override suspend fun startRequest(server: String, body: PairRequestStart): PairRequestStarted = error("unused")
        override suspend fun poll(server: String, id: String, pollSecret: String): PairPoll = error("unused")
        override suspend fun revokeSelf(server: String, token: String) = error("unused")
    }

    private var now = Instant.parse("2026-11-13T05:00:00Z")
    private val clock = object : Clock() {
        override fun getZone(): ZoneId = ZoneOffset.UTC
        override fun withZone(zone: ZoneId?): Clock = this
        override fun instant(): Instant = now
    }
    private fun runner(store: SyncStore, reader: HealthReader, api: ReLifeApi) = SyncRunner(store, reader, api, clock)
    private fun run(r: SyncRunner, background: Boolean = false) = runBlocking { r.run(background) }

    @Test fun firstSyncSendsOnlyDaysWithDataAndThenReadsThree() {
        val store = Store()
        val today = LocalDate.parse("2026-11-13")
        val reader = Reader(data = mapOf(today to DayReading(today, steps = 3150)))
        val api = Api()
        val r = runner(store, reader, api)

        assertEquals(SyncOutcome.Synced(1), run(r))
        assertEquals(30, reader.asked.size)
        assertEquals(listOf("2026-11-13"), api.sent.single().days.map { it.date })
        assertEquals(3150L, api.sent.single().days.single().steps)
        assertEquals(1, store.lastDays)
        assertTrue(store.backfilled)

        // The next run starts the day before the last sync: yesterday and today.
        run(r)
        assertEquals(listOf("2026-11-12", "2026-11-13").map(LocalDate::parse), reader.asked)
    }

    @Test fun aPhoneThatWasOffForAWeekCatchesUpOnTheWholeWeek() {
        val store = Store().also { it.backfilled = true; it.lastSyncAt = Instant.parse("2026-11-06T05:00:00Z") }
        val reader = Reader()
        run(runner(store, reader, Api()))
        // From the day before the last sync (the 5th) through today (the 13th): 9 dates.
        assertEquals(9, reader.asked.size)
        assertEquals(LocalDate.parse("2026-11-05"), reader.asked.first())
        assertEquals(LocalDate.parse("2026-11-13"), reader.asked.last())
    }

    @Test fun aLongGapNeverReachesBackMoreThanThirtyDays() {
        val store = Store().also { it.backfilled = true; it.lastSyncAt = Instant.parse("2026-08-01T05:00:00Z") }
        val reader = Reader()
        run(runner(store, reader, Api()))
        assertEquals(30, reader.asked.size)
    }

    @Test fun oneAllowedTypeIsEnoughAndOnlyThatTypeIsRead() {
        val store = Store()
        val reader = Reader(granted = setOf("steps"))
        assertEquals(SyncOutcome.Synced(0), run(runner(store, reader, Api())))
        assertEquals(setOf("steps"), reader.askedGranted)
        assertNull(store.note)
    }

    @Test fun anUnknownTimeZoneIsLearnedBeforeAnythingIsRead() {
        val store = Store().also { it.timezone = null }
        val reader = Reader()
        val api = Api(timezone = "Pacific/Auckland")
        run(runner(store, reader, api))
        // An empty batch first, then the real one, and the days were cut in the server's zone.
        assertEquals(listOf(0, 0), api.sent.map { it.days.size })
        assertEquals("Pacific/Auckland", store.timezone)
        assertEquals(ZoneId.of("Pacific/Auckland"), reader.askedZone)
        assertEquals(30, reader.asked.size)
    }

    @Test fun aZoneThatChangedUnderUsMeansReadingTheWholeWindowAgain() {
        val store = Store()
        run(runner(store, Reader(), Api(timezone = "Pacific/Auckland")))
        assertEquals("Pacific/Auckland", store.timezone)
        assertFalse(store.backfilled)
        val reader = Reader()
        run(runner(store, reader, Api(timezone = "Pacific/Auckland")))
        assertEquals(30, reader.asked.size)
    }

    @Test fun nothingToSendStillCountsAsASync() {
        val store = Store()
        assertEquals(SyncOutcome.Synced(0), run(runner(store, Reader(), Api())))
        assertTrue(store.backfilled)
        assertEquals(0, store.lastDays)
    }

    @Test fun notPairedDoesNothing() {
        val reader = Reader()
        assertEquals(SyncOutcome.NotPaired, run(runner(Store(token = null), reader, Api())))
        assertEquals(emptyList<LocalDate>(), reader.asked)
    }

    @Test fun missingPermissionsAskTheAppToOpen() {
        val store = Store()
        assertEquals(SyncOutcome.NeedsApp, run(runner(store, Reader(granted = emptySet()), Api())))
        assertTrue(store.note!!.contains("Allow access"))
    }

    @Test fun backgroundWithoutThePermissionWaitsForTheApp() {
        val store = Store()
        val reader = Reader(background = false)
        assertEquals(SyncOutcome.NeedsApp, run(runner(store, reader, Api()), background = true))
        assertEquals("Open the app to sync.", store.note)
        assertEquals(emptyList<LocalDate>(), reader.asked)
        // With the app open the same missing permission doesn't matter.
        assertEquals(SyncOutcome.Synced(0), run(runner(store, reader, Api()), background = false))
        assertNull(store.note)
    }

    @Test fun aRevokedDeviceForgetsItsToken() {
        val store = Store()
        val api = Api(ApiException(401, "revoked", "This device was signed out."))
        assertEquals(SyncOutcome.SignedOut, run(runner(store, Reader(), api)))
        assertNull(store.token)
        assertTrue(store.note!!.contains("disconnected"))
    }

    @Test fun aBare401KeepsTheToken() {
        // A proxy's own 401 isn't the server forgetting this phone.
        val store = Store()
        val out = run(runner(store, Reader(), Api(ApiException(401, "http_401", "The server answered 401."))))
        assertTrue(out is SyncOutcome.Rejected)
        assertEquals("rlf_x", store.token)
    }

    @Test fun everyContractReasonForSigningOutIsRecognised() {
        listOf("revoked", "expired", "unauthorized").forEach { assertTrue(it, ApiException(401, it, "").signedOut) }
        assertFalse(ApiException(403, "forbidden", "").signedOut)
        assertFalse(ApiException(401, "http_401", "").signedOut)
    }

    @Test fun anythingUnexpectedRetriesInsteadOfCrashing() {
        val store = Store()
        val out = run(runner(store, Reader(fail = IllegalStateException("boom")), Api()))
        assertTrue(out is SyncOutcome.Retry)
        assertEquals("Something went wrong while syncing. Will try again.", store.note)
    }

    @Test fun aRefusedReadDoesNotAskForAccessThatIsAlreadyGiven() {
        val store = Store()
        val reader = Reader(fail = SecurityException("no background"))
        assertEquals(SyncOutcome.NeedsApp, run(runner(store, reader, Api()), background = true))
        assertEquals("Open the app to sync.", store.note)
        assertEquals(SyncOutcome.NeedsApp, run(runner(store, reader, Api()), background = false))
        assertFalse(store.note!!.contains("Allow access"))
    }

    @Test fun serverTroubleAndNoNetworkRetry() {
        assertTrue(run(runner(Store(), Reader(), Api(ApiException(503, "http_503", "down")))) is SyncOutcome.Retry)
        assertTrue(run(runner(Store(), Reader(), Api(ApiException(429, "rate_limited", "slow down")))) is SyncOutcome.Retry)
        val store = Store()
        assertTrue(run(runner(store, Reader(), Api(IOException("offline")))) is SyncOutcome.Retry)
        assertFalse(store.backfilled)
        assertNull(store.lastSyncAt)
    }

    @Test fun aRefusedBatchIsNotRetried() {
        val store = Store()
        val out = run(runner(store, Reader(), Api(ApiException(400, "bad_request", "date is wrong"))))
        assertTrue(out is SyncOutcome.Rejected)
        assertEquals("date is wrong", store.note)
        assertEquals("https://relife.test", store.server)
        assertEquals("rlf_x", store.token)
    }

    @Test fun theServersTimeZoneDecidesWhichDayIsToday() {
        // 12:00 UTC on the 13th is already 01:00 on the 14th in Auckland, but still the 13th in Kolkata.
        now = Instant.parse("2026-11-13T12:00:00Z")
        val auckland = Reader()
        run(runner(Store().also { it.timezone = "Pacific/Auckland" }, auckland, Api(timezone = "Pacific/Auckland")))
        assertEquals(LocalDate.parse("2026-11-14"), auckland.asked.last())
        val kolkata = Reader()
        run(runner(Store(), kolkata, Api()))
        assertEquals(LocalDate.parse("2026-11-13"), kolkata.asked.last())
    }
}
