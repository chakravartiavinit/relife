package com.relife.android.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.CoroutineWorker
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.relife.android.BuildConfig
import com.relife.android.api.HttpApi
import com.relife.android.health.HealthAccess
import com.relife.android.health.HcStatus
import com.relife.android.health.HealthConnectReader
import com.relife.android.store.Prefs
import java.util.concurrent.TimeUnit

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val prefs = Prefs(applicationContext)
        if (!prefs.paired) return Result.success()
        if (HealthAccess.status(applicationContext) != HcStatus.Available) {
            prefs.recordNote("Health Connect is not available on this phone.")
            return Result.success()
        }
        val runner = SyncRunner(prefs, HealthConnectReader(applicationContext), HttpApi(Sync.userAgent))
        return when (runner.run(inBackground = !inputData.getBoolean(FOREGROUND, false))) {
            is SyncOutcome.Retry -> Result.retry()
            // The token is gone, so the hourly work has nothing left to do until the phone is paired again.
            is SyncOutcome.SignedOut -> { Sync.cancel(applicationContext); Result.success() }
            // Everything else is final for this run: the next hourly run (or opening the app) tries again.
            else -> Result.success()
        }
    }

    companion object {
        const val FOREGROUND = "foreground"
    }
}

object Sync {
    const val PERIODIC = "relife-health-sync"
    const val NOW = "relife-health-sync-now"

    val userAgent: String get() = "android-app/${BuildConfig.VERSION_NAME}"

    private val needsNetwork = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    /** Hourly, with up to 15 minutes of flex, backing off exponentially when the server can't be reached. */
    fun schedule(context: Context) {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(60, TimeUnit.MINUTES, 15, TimeUnit.MINUTES)
            .setConstraints(needsNetwork)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    /**
     * Runs once now: the app is open, so the background permission doesn't matter. Opening the app asks with
     * `replace = false`, so a run that is already going (or waiting for the network) is left alone and the screen
     * coming back to the front can't keep restarting it. Only the "Sync now" button replaces it.
     */
    fun now(context: Context, replace: Boolean = false) {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(needsNetwork)
            .setInputData(workDataOf(SyncWorker.FOREGROUND to true))
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(NOW, if (replace) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.KEEP, request)
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC)
        WorkManager.getInstance(context).cancelUniqueWork(NOW)
    }
}
