package com.mulsigye.app.feature.coach.data.remote

import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

interface CoachApi {
    /**
     * facCode는 사용자가 고른 저수지다. status와 같은 시설을 봐야 만수위 행동이 어긋나지 않는다.
     * null이면 쿼리에서 빠지고 서버가 규칙대로 대표지를 고른다.
     */
    @GET("api/v1/coach")
    suspend fun getCoach(
        @Query("sigunCode") sigunCode: String,
        @Query("facCode") facCode: String? = null,
    ): Response<CoachResponseDto>
}
