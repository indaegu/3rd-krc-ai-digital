package com.mulsigye.app.feature.health.data.remote

import retrofit2.Response
import retrofit2.http.GET

interface HealthApi {
    @GET("api/v1/health")
    suspend fun getHealth(): Response<HealthResponseDto>
}
