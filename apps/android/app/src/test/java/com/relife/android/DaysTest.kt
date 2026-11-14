package com.relife.android

import com.relife.android.api.ExerciseSession
import com.relife.android.health.DayReading
import com.relife.android.health.SleepDay
import com.relife.android.health.SleepSpan
import com.relife.android.health.SleepStage
import com.relife.android.health.assignSleep
import com.relife.android.health.dayBounds
import com.relife.android.health.mergeExercise
import com.relife.android.health.sleepMinutes
import com.relife.android.health.syncWindow
import com.relife.android.health.toHealthDay
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

class DaysTest {
    private val kolkata = ZoneId.of("Asia/Kolkata")
    private fun at(s: String) = Instant.parse(s)

    @Test fun windowEndsTodayInTheServersZone() {
        // 20:00 UTC on the 12th is already the 13th in Kolkata.
        val days = syncWindow(at("2026-11-12T20:00:00Z"), kolkata, lastSync = at("2026-11-12T19:00:00Z"))
        // The last sync was already on the 13th in Kolkata, so the window is the 12th and the 13th.
        assertEquals(listOf("2026-11-12", "2026-11-13").map(LocalDate::parse), days)
    }

    @Test fun laterSyncsStartTheDayBeforeTheLastOne() {
        val days = syncWindow(at("2026-11-13T05:00:00Z"), kolkata, lastSync = at("2026-11-06T05:00:00Z"))
        assertEquals(LocalDate.parse("2026-11-05"), days.first())
        assertEquals(LocalDate.parse("2026-11-13"), days.last())
        assertEquals(9, days.size)
    }

    @Test fun aLastSyncFromTheFutureStillReadsToday() {
        assertEquals(listOf(LocalDate.parse("2026-11-13")), syncWindow(at("2026-11-13T05:00:00Z"), kolkata, lastSync = at("2026-12-01T00:00:00Z")))
    }

    @Test fun neverReachesBackMoreThanThirtyDays() {
        assertEquals(30, syncWindow(at("2026-11-13T05:00:00Z"), kolkata, lastSync = at("2026-01-01T00:00:00Z")).size)
    }

    @Test fun firstSyncReadsThirtyDays() {
        val days = syncWindow(at("2026-11-13T05:00:00Z"), kolkata, lastSync = null)
        assertEquals(30, days.size)
        assertEquals(LocalDate.parse("2026-10-15"), days.first())
        assertEquals(LocalDate.parse("2026-11-13"), days.last())
    }

    @Test fun dayBoundsFollowTheZone() {
        val (start, end) = dayBounds(LocalDate.parse("2026-11-13"), kolkata)
        assertEquals(at("2026-11-12T18:30:00Z"), start)
        assertEquals(at("2026-11-13T18:30:00Z"), end)
    }

    @Test fun dayBoundsOnADstChangeAreNot24Hours() {
        val berlin = ZoneId.of("Europe/Berlin")
        val (s, e) = dayBounds(LocalDate.parse("2026-03-29"), berlin)
        assertEquals(23, Duration.between(s, e).toHours())
    }

    @Test fun awakeStagesAreNotSleep() {
        val span = SleepSpan(
            at("2026-11-12T17:00:00Z"), at("2026-11-13T01:00:00Z"),
            listOf(
                SleepStage(at("2026-11-12T17:00:00Z"), at("2026-11-12T17:30:00Z"), awake = true),
                SleepStage(at("2026-11-12T17:30:00Z"), at("2026-11-13T00:30:00Z"), awake = false),
                SleepStage(at("2026-11-13T00:30:00Z"), at("2026-11-13T01:00:00Z"), awake = true),
            ),
        )
        assertEquals(420.0, sleepMinutes(span), 0.0)
    }

    @Test fun stagesOutsideTheSessionAreClipped() {
        val span = SleepSpan(
            at("2026-11-12T22:00:00Z"), at("2026-11-13T00:00:00Z"),
            listOf(SleepStage(at("2026-11-12T21:00:00Z"), at("2026-11-12T22:30:00Z"), awake = true)),
        )
        assertEquals(90.0, sleepMinutes(span), 0.0)
    }

    @Test fun sleepBelongsToTheWakeDate() {
        // 23:00 on the 12th to 06:30 on the 13th, Kolkata time.
        val night = SleepSpan(at("2026-11-12T17:30:00Z"), at("2026-11-13T01:00:00Z"))
        val byDay = assignSleep(listOf(night), kolkata)
        assertEquals(setOf(LocalDate.parse("2026-11-13")), byDay.keys)
        assertEquals(450.0, byDay.getValue(LocalDate.parse("2026-11-13")).minutes, 0.0)
    }

    @Test fun aNapOnTheSameDayAddsUp() {
        val night = SleepSpan(at("2026-11-12T17:30:00Z"), at("2026-11-13T01:00:00Z"))
        val nap = SleepSpan(at("2026-11-13T08:00:00Z"), at("2026-11-13T08:30:00Z"))
        val day = assignSleep(listOf(nap, night), kolkata).getValue(LocalDate.parse("2026-11-13"))
        assertEquals(480.0, day.minutes, 0.0)
        assertEquals(night.start, day.bedtime)
        assertEquals(nap.end, day.wake)
    }

    @Test fun emptySessionsAreDropped() {
        val s = SleepSpan(at("2026-11-13T01:00:00Z"), at("2026-11-13T01:00:00Z"))
        assertTrue(assignSleep(listOf(s), kolkata).isEmpty())
    }

    @Test fun exerciseSumsPerType() {
        val merged = mergeExercise(listOf("running" to 20.0, "walking" to 10.0, "running" to 12.0))
        assertEquals(listOf(ExerciseSession("running", 32.0), ExerciseSession("walking", 10.0)), merged)
    }

    @Test fun aDayWithNothingHasNoData() {
        assertFalse(DayReading(LocalDate.parse("2026-11-13")).hasData)
        assertTrue(DayReading(LocalDate.parse("2026-11-13"), steps = 0).hasData)
    }

    @Test fun healthDayRoundsAndKeepsWhatItRead() {
        val d = DayReading(
            LocalDate.parse("2026-11-12"), steps = 9120, activeKcal = 412.4567, heartRateAvg = 71.449, restingHr = 54.0, weightKg = 72.64,
            sleep = SleepDay(433.0, at("2026-11-11T17:20:00Z"), at("2026-11-12T01:05:00Z")),
            exercise = listOf(ExerciseSession("running", 32.04)),
        ).toHealthDay()
        assertEquals("2026-11-12", d.date)
        assertEquals(9120L, d.steps)
        assertEquals(412.5, d.activeKcal!!, 0.0)
        assertEquals(71.4, d.heartRateAvg!!, 0.0)
        assertEquals(72.6, d.weightKg!!, 0.0)
        assertEquals(433.0, d.sleepMinutes!!, 0.0)
        assertEquals("2026-11-11T17:20:00Z", d.bedtime)
        assertEquals(32.0, d.exercise.single().minutes, 0.0)
        assertNull(d.heartRateMin)
    }

    @Test fun outOfRangeNumbersAreDroppedNotSent() {
        // A glitchy sensor must lose one number, not make the server refuse the whole batch.
        val d = DayReading(
            LocalDate.parse("2026-11-12"), steps = 900_000, heartRateAvg = 5.0, heartRateMax = 400.0, weightKg = 3.0, activeKcal = 50.0,
            sleep = SleepDay(3000.0, at("2026-11-11T00:00:00Z"), at("2026-11-12T00:00:00Z")),
        ).toHealthDay()
        assertNull(d.steps)
        assertNull(d.heartRateAvg)
        assertNull(d.heartRateMax)
        assertNull(d.weightKg)
        assertNull(d.sleepMinutes)
        assertNull(d.bedtime)
        assertEquals(50.0, d.activeKcal!!, 0.0)
    }
}
