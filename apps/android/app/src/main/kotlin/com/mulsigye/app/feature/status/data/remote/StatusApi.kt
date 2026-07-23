package com.mulsigye.app.feature.status.data.remote

import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

interface StatusApi {
    @GET("api/v1/status")
    suspend fun getStatus(@Query("sigunCode") sigunCode: String): Response<StatusResponseDto>
}
