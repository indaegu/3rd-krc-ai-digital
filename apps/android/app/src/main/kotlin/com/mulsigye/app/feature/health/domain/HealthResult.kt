package com.mulsigye.app.feature.health.domain

import java.time.Instant

sealed interface HealthResult {
    data class Success(
        val asOf: Instant,
        val sources: List<String>,
        val stale: Boolean,
    ) : HealthResult

    data class Failure(
        val code: String,
        val message: String,
        val retryable: Boolean,
    ) : HealthResult
}
