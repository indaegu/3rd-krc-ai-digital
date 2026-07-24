package com.mulsigye.app.feature.forecast.domain

interface ForecastRepository {
    suspend fun load(sigunCode: String): ForecastResult
}
