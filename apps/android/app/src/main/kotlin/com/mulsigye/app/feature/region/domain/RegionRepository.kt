package com.mulsigye.app.feature.region.domain

interface RegionRepository {
    suspend fun search(query: String): RegionSearchResult

    suspend fun resolve(admCd: String, legalCode: String): RegionResolveResult
}
