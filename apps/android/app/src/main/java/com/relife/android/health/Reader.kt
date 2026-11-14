package com.relife.android.health

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.relife.android.api.ExerciseSession
import java.time.Duration
import java.time.LocalDate
import java.time.ZoneId
import kotlin.reflect.KClass

/** Reads Health Connect for whole days. A fake in tests; [HealthConnectReader] on the phone. */
interface HealthReader {
    /** False when the read-in-background permission is needed and missing: the worker must wait for the app to open. */
    suspend fun canReadInBackground(): Boolean
    suspend fun hasAllPermissions(): Boolean
    suspend fun read(dates: List<LocalDate>, zone: ZoneId): List<DayReading>
}

/** What is allowed so far. */
data class Access(val granted: Set<String>, val backgroundAvailable: Boolean)

/** How usable Health Connect is on this phone. */
enum class HcStatus { Available, NotInstalled, UpdateRequired, Unavailable }

object HealthAccess {
    private val readTypes: List<KClass<out androidx.health.connect.client.records.Record>> = listOf(
        StepsRecord::class, ActiveCaloriesBurnedRecord::class, HeartRateRecord::class, RestingHeartRateRecord::class,
        WeightRecord::class, SleepSessionRecord::class, ExerciseSessionRecord::class,
    )

    /** The seven data types the app reads. Nothing is ever written. */
    val permissions: Set<String> = readTypes.map { HealthPermission.getReadPermission(it) }.toSet()

    const val BACKGROUND = HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND

    /** The name shown for each permission on the permission screen. */
    val labels: Map<String, String> = mapOf(
        HealthPermission.getReadPermission(StepsRecord::class) to "Steps",
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class) to "Active calories",
        HealthPermission.getReadPermission(HeartRateRecord::class) to "Heart rate",
        HealthPermission.getReadPermission(RestingHeartRateRecord::class) to "Resting heart rate",
        HealthPermission.getReadPermission(WeightRecord::class) to "Weight",
        HealthPermission.getReadPermission(SleepSessionRecord::class) to "Sleep",
        HealthPermission.getReadPermission(ExerciseSessionRecord::class) to "Exercise",
    )

    fun status(context: Context): HcStatus = when (HealthConnectClient.getSdkStatus(context)) {
        HealthConnectClient.SDK_AVAILABLE -> HcStatus.Available
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> HcStatus.UpdateRequired
        HealthConnectClient.SDK_UNAVAILABLE -> HcStatus.NotInstalled
        else -> HcStatus.Unavailable
    }

    fun requestContract() = PermissionController.createRequestPermissionResultContract()

    /** What the person has allowed so far, and whether this Health Connect version offers the background permission at all. */
    suspend fun access(context: Context): Access {
        val client = HealthConnectClient.getOrCreate(context)
        return Access(client.permissionController.getGrantedPermissions(), backgroundAvailable(client))
    }

    suspend fun backgroundAvailable(client: HealthConnectClient): Boolean =
        client.features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
}

class HealthConnectReader(context: Context) : HealthReader {
    private val client = HealthConnectClient.getOrCreate(context)

    private suspend fun granted(): Set<String> = client.permissionController.getGrantedPermissions()

    /** The background permission exists only on some Health Connect versions; where it doesn't, there is nothing to wait for. */
    override suspend fun canReadInBackground(): Boolean {
        return !HealthAccess.backgroundAvailable(client) || HealthAccess.BACKGROUND in granted()
    }

    override suspend fun hasAllPermissions(): Boolean = granted().containsAll(HealthAccess.permissions)

    override suspend fun read(dates: List<LocalDate>, zone: ZoneId): List<DayReading> {
        if (dates.isEmpty()) return emptyList()
        val wideStart = dayBounds(dates.first().minusDays(1), zone).first
        val wideEnd = dayBounds(dates.last(), zone).second
        val wide = TimeRangeFilter.between(wideStart, wideEnd)

        // Sleep and exercise are sessions, so they are read once for the whole window and then sorted into days.
        val sleep = assignSleep(
            readAll(SleepSessionRecord::class, wide).map { r ->
                SleepSpan(r.startTime, r.endTime, r.stages.map { SleepStage(it.startTime, it.endTime, it.stage in AWAKE_STAGES) })
            },
            zone,
        )
        val exercise = readAll(ExerciseSessionRecord::class, wide)
            .groupBy { it.startTime.atZone(zone).toLocalDate() }
            .mapValues { (_, list) ->
                mergeExercise(list.map { (EXERCISE_NAMES[it.exerciseType] ?: "other") to Duration.between(it.startTime, it.endTime).toMillis() / 60_000.0 })
            }

        return dates.map { date ->
            val (start, end) = dayBounds(date, zone)
            val range = TimeRangeFilter.between(start, end)
            val totals = client.aggregate(
                AggregateRequest(
                    metrics = setOf(
                        StepsRecord.COUNT_TOTAL, ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL,
                        HeartRateRecord.BPM_AVG, HeartRateRecord.BPM_MIN, HeartRateRecord.BPM_MAX, RestingHeartRateRecord.BPM_AVG,
                    ),
                    timeRangeFilter = range,
                ),
            )
            val weight = readAll(WeightRecord::class, range).maxByOrNull { it.time }
            DayReading(
                date = date,
                steps = totals[StepsRecord.COUNT_TOTAL],
                activeKcal = totals[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories,
                heartRateAvg = totals[HeartRateRecord.BPM_AVG]?.toDouble(),
                heartRateMin = totals[HeartRateRecord.BPM_MIN]?.toDouble(),
                heartRateMax = totals[HeartRateRecord.BPM_MAX]?.toDouble(),
                restingHr = totals[RestingHeartRateRecord.BPM_AVG]?.toDouble(),
                weightKg = weight?.weight?.inKilograms,
                sleep = sleep[date],
                exercise = exercise[date].orEmpty(),
            )
        }
    }

    /** Pages through every record of a type in a range. */
    private suspend fun <T : androidx.health.connect.client.records.Record> readAll(type: KClass<T>, range: TimeRangeFilter): List<T> {
        val out = mutableListOf<T>()
        var token: String? = null
        do {
            val page = client.readRecords(ReadRecordsRequest(type, range, pageToken = token))
            out += page.records
            token = page.pageToken.takeIf { page.records.isNotEmpty() }
        } while (token != null)
        return out
    }

    private companion object {
        /** Names for the sessions people log most. The library's own map is not public API; anything else is "other". */
        val EXERCISE_NAMES: Map<Int, String> = with(ExerciseSessionRecord) {
            mapOf(
                EXERCISE_TYPE_RUNNING to "running", EXERCISE_TYPE_RUNNING_TREADMILL to "running_treadmill", EXERCISE_TYPE_WALKING to "walking",
                EXERCISE_TYPE_HIKING to "hiking", EXERCISE_TYPE_BIKING to "biking", EXERCISE_TYPE_BIKING_STATIONARY to "biking_stationary",
                EXERCISE_TYPE_SWIMMING_POOL to "swimming_pool", EXERCISE_TYPE_SWIMMING_OPEN_WATER to "swimming_open_water",
                EXERCISE_TYPE_STRENGTH_TRAINING to "strength_training", EXERCISE_TYPE_WEIGHTLIFTING to "weightlifting",
                EXERCISE_TYPE_CALISTHENICS to "calisthenics", EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING to "hiit",
                EXERCISE_TYPE_YOGA to "yoga", EXERCISE_TYPE_PILATES to "pilates", EXERCISE_TYPE_STRETCHING to "stretching",
                EXERCISE_TYPE_ELLIPTICAL to "elliptical", EXERCISE_TYPE_ROWING to "rowing", EXERCISE_TYPE_ROWING_MACHINE to "rowing_machine",
                EXERCISE_TYPE_STAIR_CLIMBING to "stair_climbing", EXERCISE_TYPE_DANCING to "dancing", EXERCISE_TYPE_MARTIAL_ARTS to "martial_arts",
                EXERCISE_TYPE_TENNIS to "tennis", EXERCISE_TYPE_BADMINTON to "badminton", EXERCISE_TYPE_SOCCER to "soccer",
                EXERCISE_TYPE_BASKETBALL to "basketball", EXERCISE_TYPE_CRICKET to "cricket",
            )
        }

        val AWAKE_STAGES = setOf(
            SleepSessionRecord.STAGE_TYPE_AWAKE, SleepSessionRecord.STAGE_TYPE_OUT_OF_BED, SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED,
        )
    }
}
