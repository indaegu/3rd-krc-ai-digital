package com.mulsigye.app.feature.region.domain

import java.time.Instant

/** 주소 검색 후보. 표시용이며 등록 후 저장하지 않는다. */
data class RegionCandidate(
    val label: String,
    val admCd: String,
    val legalCode: String,
)

/** 우리 지역 대표 저수지. */
data class RepresentativeReservoir(
    val facCode: String,
    val name: String,
)

sealed interface RegionSearchResult {
    data class Success(
        val candidates: List<RegionCandidate>,
        val asOf: Instant,
        val sources: List<String>,
        val stale: Boolean,
    ) : RegionSearchResult

    data class Failure(
        val code: String,
        val message: String,
        val retryable: Boolean,
    ) : RegionSearchResult
}

sealed interface RegionResolveResult {
    data class Success(
        val sigunCode: String?,
        val sigunName: String?,
        val prepared: Boolean,
        val reservoir: RepresentativeReservoir?,
        val asOf: Instant,
        val sources: List<String>,
        val stale: Boolean,
    ) : RegionResolveResult

    data class Failure(
        val code: String,
        val message: String,
        val retryable: Boolean,
    ) : RegionResolveResult
}
