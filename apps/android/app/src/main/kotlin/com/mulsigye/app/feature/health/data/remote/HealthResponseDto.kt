package com.mulsigye.app.feature.health.data.remote

import kotlinx.serialization.Serializable

@Serializable
data class HealthResponseDto(
    val schemaVersion: String,
    val service: String,
    val status: String,
    val asOf: String,
    val sources: List<String>,
    val stale: Boolean,
)
