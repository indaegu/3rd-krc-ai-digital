package com.mulsigye.app.feature.region.domain

interface RegionRepository {
    suspend fun search(query: String): RegionSearchResult

    /**
     * 주소를 시군·대표 저수지로 확정한다.
     *
     * [emdNm]/[liNm]을 주면 시군 안에서 그 단위까지 좁혀 고른다(좌표·거리는 쓰지 않는다).
     * [facCode]를 주면 사용자가 직접 고른 그 저수지를 쓴다(같은 시군일 때만).
     */
    suspend fun resolve(
        admCd: String,
        legalCode: String,
        emdNm: String? = null,
        liNm: String? = null,
        facCode: String? = null,
    ): RegionResolveResult

    /** 저수지 이름으로 후보를 찾는다. */
    suspend fun searchReservoirs(query: String): ReservoirSearchResult
}
