package com.relife.android.health

import com.relife.android.api.ExerciseSession
import com.relife.android.api.HealthDay
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.roundToLong

/** Pure day maths for the sync, kept free of Android types so plain JVM tests cover it. */

/** The first sync reaches back as far as Health Connect's default history allows (30 days, today included). */
const val FIRST_SYNC_DAYS = 30

/**
 * Dates to read, oldest first, ending today in the server's time zone.
 *
 * With no earlier sync that is the last 30 days. After one, it starts the day before the last sync (late-arriving
 * records from the watch land on that day) and never goes back further than 30 days, so a phone that was off for a
 * week catches up on the whole week rather than only the last three days.
 */
fun syncWindow(now: Instant, zone: ZoneId, lastSync: Instant?): List<LocalDate> {
    val today = now.atZone(zone).toLocalDate()
    val earliest = today.minusDays(FIRST_SYNC_DAYS - 1L)
    val start = if (lastSync == null) earliest
    else maxOf(earliest, minOf(lastSync.atZone(zone).toLocalDate().minusDays(1), today))
    return generateSequence(start) { it.plusDays(1) }.takeWhile { !it.isAfter(today) }.toList()
}

/** A local day as a half-open instant range. DST days come out 23 or 25 hours long, which is what we want. */
fun dayBounds(date: LocalDate, zone: ZoneId): Pair<Instant, Instant> =
    date.atStartOfDay(zone).toInstant() to date.plusDays(1).atStartOfDay(zone).toInstant()

/** One slice of a sleep session. `awake` stages (awake, out of bed, awake in bed) do not count as sleep. */
data class SleepStage(val start: Instant, val end: Instant, val awake: Boolean)
data class SleepSpan(val start: Instant, val end: Instant, val stages: List<SleepStage> = emptyList())

/** Sleep as the server wants it: minutes slept, and when it began and ended. */
data class SleepDay(val minutes: Double, val bedtime: Instant, val wake: Instant)

/** Minutes asleep in one session: its length minus the awake stages (clipped to the session). */
fun sleepMinutes(span: SleepSpan): Double {
    val total = Duration.between(span.start, span.end).toMillis()
    val awake = span.stages.filter { it.awake }.sumOf {
        val from = maxOf(it.start, span.start)
        val to = minOf(it.end, span.end)
        if (to > from) Duration.between(from, to).toMillis() else 0L
    }
    return maxOf(0L, total - awake) / 60_000.0
}

/**
 * Sleep belongs to the day you woke up. Two sessions that end on the same date (a night and a nap) add up, with
 * the earliest start as bedtime and the latest end as wake.
 */
fun assignSleep(spans: List<SleepSpan>, zone: ZoneId): Map<LocalDate, SleepDay> =
    spans.filter { it.end > it.start }
        .groupBy { it.end.atZone(zone).toLocalDate() }
        .mapValues { (_, day) ->
            SleepDay(day.sumOf { sleepMinutes(it) }, day.minOf { it.start }, day.maxOf { it.end })
        }

/** Exercise sessions of one day, summed per type, in the order the types first appear. */
fun mergeExercise(sessions: List<Pair<String, Double>>): List<ExerciseSession> =
    sessions.groupBy({ it.first }, { it.second }).map { (type, minutes) -> ExerciseSession(type, minutes.sum()) }

/** Everything read for one local day. A null is "Health Connect had nothing", which is not the same as zero. */
data class DayReading(
    val date: LocalDate,
    val steps: Long? = null,
    val activeKcal: Double? = null,
    val heartRateAvg: Double? = null,
    val heartRateMin: Double? = null,
    val heartRateMax: Double? = null,
    val restingHr: Double? = null,
    val weightKg: Double? = null,
    val sleep: SleepDay? = null,
    val exercise: List<ExerciseSession> = emptyList(),
) {
    val hasData: Boolean
        get() = steps != null || activeKcal != null || heartRateAvg != null || restingHr != null || weightKg != null || sleep != null || exercise.isNotEmpty()
}

private fun round1(v: Double) = (v * 10).roundToLong() / 10.0

/**
 * The contract rejects a whole batch when one number is out of range, so each value is rounded and clamped out
 * (dropped, not clipped) here: a sensor glitch should lose one number, not a day or a sync.
 */
fun DayReading.toHealthDay(): HealthDay {
    fun inRange(v: Double?, lo: Double, hi: Double) = v?.takeIf { it in lo..hi }?.let(::round1)
    return HealthDay(
        date = date.toString(),
        steps = steps?.takeIf { it in 0..200_000 },
        activeKcal = inRange(activeKcal, 0.0, 20_000.0),
        heartRateAvg = inRange(heartRateAvg, 20.0, 250.0),
        heartRateMin = inRange(heartRateMin, 20.0, 250.0),
        heartRateMax = inRange(heartRateMax, 20.0, 250.0),
        restingHr = inRange(restingHr, 20.0, 200.0),
        weightKg = inRange(weightKg, 20.0, 400.0),
        sleepMinutes = sleep?.minutes?.let { inRange(it, 0.0, 1440.0) },
        bedtime = sleep?.takeIf { it.minutes in 0.0..1440.0 }?.bedtime?.toString(),
        wake = sleep?.takeIf { it.minutes in 0.0..1440.0 }?.wake?.toString(),
        exercise = exercise.map { ExerciseSession(it.type.take(40), round1(it.minutes.coerceIn(0.0, 1440.0))) }.take(30),
    )
}
