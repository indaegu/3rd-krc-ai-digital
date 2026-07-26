package com.mulsigye.app.feature.status.data.remote

import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

interface StatusApi {
    @GET("api/v1/status")
    /**
     * facCode는 사용자가 저수지 이름으로 직접 고른 경우에만 붙는다(null이면 쿼리에서 빠진다).
     * 서버는 같은 시군 후보일 때만 그 저수지를 쓰고, 아니면 규칙대로 대표지를 고른다.
     */
    suspend fun getStatus(
        @Query("sigunCode") sigunCode: String,
        @Query("facCode") facCode: String? = null,
    ): Response<StatusResponseDto>
}
