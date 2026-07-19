package com.mulsigye.app.app

import com.mulsigye.app.core.network.ApiClient
import com.mulsigye.app.feature.health.data.DefaultHealthRepository
import com.mulsigye.app.feature.health.data.remote.HealthApi
import com.mulsigye.app.feature.health.domain.HealthRepository
import kotlinx.serialization.json.Json

class AppContainer(apiBaseUrl: String) {
    private val json = Json {
        ignoreUnknownKeys = false
        explicitNulls = false
    }
    private val retrofit = ApiClient.create(apiBaseUrl, json)

    val healthRepository: HealthRepository =
        DefaultHealthRepository(retrofit.create(HealthApi::class.java), json)
}
