package com.mulsigye.app.feature.region.data.remote

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

interface RegionApi {
    @GET("api/v1/regions/search")
    suspend fun searchRegions(@Query("q") query: String): Response<RegionSearchResponseDto>

    @POST("api/v1/regions/resolve")
    suspend fun resolveRegion(@Body body: RegionResolveRequestDto): Response<RegionResolveResponseDto>

    /** 저수지 이름 검색 — 주소를 몰라도 아는 이름으로 지역을 등록하는 길. */
    @GET("api/v1/reservoirs/search")
    suspend fun searchReservoirs(@Query("q") query: String): Response<ReservoirSearchResponseDto>
}
