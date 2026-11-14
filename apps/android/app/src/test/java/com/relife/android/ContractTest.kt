package com.relife.android

import com.relife.android.api.ApiError
import com.relife.android.api.ContractJson
import com.relife.android.api.HealthBatch
import com.relife.android.api.HealthIngestResult
import com.relife.android.api.Hello
import com.relife.android.api.PairPoll
import com.relife.android.api.PairRedeem
import com.relife.android.api.PairRedeemResult
import com.relife.android.api.PairRequestStart
import com.relife.android.api.PairRequestStarted
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Decodes the fixtures in packages/contract/fixtures, the same files the web contract tests validate with zod and the
 * Swift tests decode. If the contract changes, this is where the Android models notice.
 */
class ContractTest {
    private val dir = File(requireNotNull(System.getProperty("contractFixtures")) { "contractFixtures is set by app/build.gradle.kts" })

    private fun fixture(name: String): String = File(dir, "$name.json").also { assertTrue("missing fixture $name", it.isFile) }.readText()

    /** What we send must reach the server as the fixture says, key for key. */
    private fun assertSameJson(name: String, sent: String) =
        assertEquals(Json.parseToJsonElement(fixture(name)).jsonObject, Json.parseToJsonElement(sent).jsonObject)

    @Test fun hello() {
        val h = ContractJson.decodeFromString<Hello>(fixture("Hello.self-host"))
        assertEquals("relife", h.app)
        assertEquals(1, h.apiVersion)
        assertNull(h.name)
        assertEquals("cloud", ContractJson.decodeFromString<Hello>(fixture("Hello.cloud-signed-in")).mode)
    }

    @Test fun pairRedeemIsWhatWeSend() {
        val body = ContractJson.decodeFromString<PairRedeem>(fixture("PairRedeem.android"))
        assertEquals(listOf("ingest"), body.scopes)
        assertEquals("phone", body.kind)
        assertSameJson("PairRedeem.android", sendable(ContractJson.encodeToString(body)))
    }

    @Test fun pairRedeemResultCarriesAToken() {
        val r = ContractJson.decodeFromString<PairRedeemResult>(fixture("PairRedeemResult.native"))
        assertTrue(r.ok)
        assertTrue(r.token!!.startsWith("rlf_"))
        assertNull(ContractJson.decodeFromString<PairRedeemResult>(fixture("PairRedeemResult.cookie")).token)
    }

    @Test fun pairRequestRoundTrips() {
        val body = ContractJson.decodeFromString<PairRequestStart>(fixture("PairRequestStart.android"))
        assertSameJson("PairRequestStart.android", sendable(ContractJson.encodeToString(body)))
        val started = ContractJson.decodeFromString<PairRequestStarted>(fixture("PairRequestStarted.basic"))
        assertEquals("K7M2-9QXD", started.userCode)
        assertEquals(2, started.interval)
    }

    @Test fun pairPollStatuses() {
        val statuses = listOf("pending", "denied", "expired", "approved").associateWith {
            ContractJson.decodeFromString<PairPoll>(fixture("PairPoll.$it"))
        }
        statuses.forEach { (status, poll) -> assertEquals(status, poll.status) }
        assertTrue(statuses.getValue("approved").token!!.isNotEmpty())
        assertNull(statuses.getValue("pending").token)
        assertTrue(ContractJson.decodeFromString<PairPoll>(fixture("PairPoll.approved-cookie")).token == null)
    }

    @Test fun apiErrors() {
        for (name in listOf("unauthorized", "rate-limited", "slow-down")) {
            val e = ContractJson.decodeFromString<ApiError>(fixture("ApiError.$name"))
            assertTrue(name, e.error.code.isNotEmpty() && e.error.message.isNotEmpty())
        }
        assertEquals("unauthorized", ContractJson.decodeFromString<ApiError>(fixture("ApiError.unauthorized")).error.code)
    }

    @Test fun healthBatchFull() {
        val b = ContractJson.decodeFromString<HealthBatch>(fixture("HealthBatch.full"))
        assertEquals("health-connect", b.source)
        assertEquals(2, b.days.size)
        val d = b.days[0]
        assertEquals("2026-11-12", d.date)
        assertEquals(9120L, d.steps)
        assertEquals(412.5, d.activeKcal!!, 0.0)
        assertEquals(433.0, d.sleepMinutes!!, 0.0)
        assertEquals("2026-11-11T17:20:00.000Z", d.bedtime)
        assertEquals(listOf("running", "strength_training"), d.exercise.map { it.type })
        assertTrue(b.days[1].exercise.isEmpty())
    }

    @Test fun healthBatchMinimalAndEmpty() {
        val b = ContractJson.decodeFromString<HealthBatch>(fixture("HealthBatch.minimal"))
        assertTrue(b.days.all { it.date.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) })
        // The "learn the time zone" call: no days at all.
        assertEquals("""{"source":"health-connect","days":[]}""", ContractJson.encodeToString(HealthBatch(days = emptyList())))
    }

    @Test fun healthDaysWeSendOmitWhatWeDidNotRead() {
        val sent = ContractJson.encodeToString(HealthBatch(days = listOf(com.relife.android.api.HealthDay(date = "2026-11-13", steps = 10))))
        val day = (Json.parseToJsonElement(sent).jsonObject["days"] as kotlinx.serialization.json.JsonArray)[0].jsonObject
        // `explicitNulls = false`: a missing reading is a missing key, never `null`, which the contract would refuse.
        assertEquals(setOf("date", "steps", "exercise"), day.keys)
    }

    @Test fun healthIngestResult() {
        val r = ContractJson.decodeFromString<HealthIngestResult>(fixture("HealthIngestResult.basic"))
        assertEquals(2, r.received)
        assertEquals("Asia/Kolkata", r.timezone)
    }

    /** `encodeDefaults` writes `null` for unset options in some versions; the server wants keys that are absent. */
    private fun sendable(json: String): String = Json.encodeToString(JsonObject.serializer(), Json.parseToJsonElement(json).jsonObject)
}
