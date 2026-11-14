package com.relife.android.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Kotlin twins of the contract types in packages/contract/src. ContractTest decodes the shared fixtures with these, so a
 * drift in the contract fails here before it fails on a phone. Only what the app sends or reads is modelled.
 */
val ContractJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
}

@Serializable
data class Hello(val app: String, val apiVersion: Int, val version: String, val mode: String, val name: String? = null)

@Serializable
data class DeviceInfo(val id: String, val kind: String, val name: String, val scopes: List<String> = emptyList())

@Serializable
data class PairRedeem(
    val secret: String? = null,
    val code: String? = null,
    val kind: String? = null,
    val name: String? = null,
    val platform: String? = null,
    val scopes: List<String>? = null,
)

@Serializable
data class PairRedeemResult(val ok: Boolean, val device: DeviceInfo, val token: String? = null, val next: String? = null)

@Serializable
data class PairRequestStart(val kind: String, val name: String, val platform: String? = null, val scopes: List<String>? = null)

@Serializable
data class PairRequestStarted(
    val id: String,
    val userCode: String,
    val pollSecret: String,
    val approveUrl: String,
    val expiresAt: String,
    val interval: Int,
)

/** `status` is pending, denied, expired or approved; `token` and `device` come only with approved. */
@Serializable
data class PairPoll(val status: String, val token: String? = null, val device: DeviceInfo? = null)

@Serializable
data class PairPollBody(val pollSecret: String)

@Serializable
data class ApiErrorBody(val code: String, val message: String)

@Serializable
data class ApiError(val ok: Boolean = false, val error: ApiErrorBody)

@Serializable
data class ExerciseSession(val type: String, val minutes: Double)

@Serializable
data class HealthDay(
    val date: String,
    val steps: Long? = null,
    val activeKcal: Double? = null,
    val heartRateAvg: Double? = null,
    val heartRateMin: Double? = null,
    val heartRateMax: Double? = null,
    val restingHr: Double? = null,
    val weightKg: Double? = null,
    val sleepMinutes: Double? = null,
    val bedtime: String? = null,
    val wake: String? = null,
    val exercise: List<ExerciseSession> = emptyList(),
)

@Serializable
data class HealthBatch(
    @SerialName("source") val source: String = "health-connect",
    val days: List<HealthDay>,
)

@Serializable
data class HealthIngestResult(val ok: Boolean, val received: Int, val inserted: Int, val timezone: String)
