package com.mulsigye.app.feature.coach.data.remote

import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

interface CoachApi {
    @GET("api/v1/coach")
    suspend fun getCoach(@Query("sigunCode") sigunCode: String): Response<CoachResponseDto>
}
