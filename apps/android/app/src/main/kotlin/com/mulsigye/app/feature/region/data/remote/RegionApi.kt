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
}
