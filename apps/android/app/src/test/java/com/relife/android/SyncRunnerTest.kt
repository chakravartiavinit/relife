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

    private class Reader(var all: Boolean = true, var background: Boolean = true, val data: Map<LocalDate, DayReading> = emptyMap()) : HealthReader {
        var asked: List<LocalDate> = emptyList()
        override suspend fun canReadInBackground() = background
        override suspend fun hasAllPermissions() = all
        override suspend fun read(dates: List<LocalDate>, zone: ZoneId): List<DayReading> {
            asked = dates
            return dates.map { data[it] ?: DayReading(it) }
        }
    }

    private class Api(var fail: Exception? = null) : ReLifeApi {
        val sent = mutableListOf<HealthBatch>()
        override suspend fun postHealth(server: String, token: String, batch: HealthBatch): HealthIngestResult {
            fail?.let { throw it }
            sent += batch
            return HealthIngestResult(true, batch.days.size, batch.days.size, "Asia/Kolkata")
        }
        override suspend fun hello(server: String): Hello = error("unused")
        override suspend fun redeem(server: String, body: PairRedeem): PairRedeemResult = error("unused")
        override suspend fun startRequest(server: String, body: PairRequestStart): PairRequestStarted = error("unused")
        override suspend fun poll(server: String, id: String, pollSecret: String): PairPoll = error("unused")
        override suspend fun revokeSelf(server: String, token: String) = error("unused")
    }

    private val clock = Clock.fixed(Instant.parse("2026-11-13T05:00:00Z"), ZoneOffset.UTC)
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

        run(r)
        assertEquals(3, reader.asked.size)
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
        assertEquals(SyncOutcome.NeedsApp, run(runner(store, Reader(all = false), Api())))
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

    @Test fun serverTroubleAndNoNetworkRetry() {
        assertTrue(run(runner(Store(), Reader(), Api(ApiException(503, "http_503", "down")))) is SyncOutcome.Retry)
        assertTrue(run(runner(Store(), Reader(), Api(ApiException(429, "rate-limited", "slow down")))) is SyncOutcome.Retry)
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
        val store = Store().also { it.timezone = "Pacific/Auckland" }
        val reader = Reader()
        run(runner(store, reader, Api()))
        // 05:00 UTC on the 13th is 18:00 on the 13th in Auckland: the same date, but the window is cut on Auckland's midnight.
        assertEquals(LocalDate.parse("2026-11-13"), reader.asked.last())
    }
}
