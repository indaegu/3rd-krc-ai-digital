package com.mulsigye.app.feature.nearby.data.remote

import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

interface NearbyApi {
    @GET("api/v1/regions/nearby")
    suspend fun getNearby(@Query("sigunCode") sigunCode: String): Response<NearbyResponseDto>
}
