package com.mulsigye.app.feature.forecast.data.remote

import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

interface ForecastApi {
    @GET("api/v1/forecast")
    suspend fun getForecast(@Query("sigunCode") sigunCode: String): Response<ForecastResponseDto>
}
