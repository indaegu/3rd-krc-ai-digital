package com.mulsigye.app.feature.health.domain

interface HealthRepository {
    suspend fun load(): HealthResult
}
