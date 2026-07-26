package com.mulsigye.app.feature.region.domain

import java.time.Instant

/** 주소 검색 후보. 표시용이며 등록 후 저장하지 않는다. */
data class RegionCandidate(
    val label: String,
    val admCd: String,
    val legalCode: String,
    /** 읍·면·동 이름. resolve에 실어 시군 안에서 대표 저수지를 좁힌다(저장하지 않는다). */
    val emdNm: String? = null,
    /** 리 이름. 쓰임은 emdNm과 같다. */
    val liNm: String? = null,
)

/**
 * 저수지 이름 검색 결과 한 건. 넓은 시군에서 주소만으로는 원하는 저수지가 안 잡혀서 쓰는 길이다.
 * [prepared]가 false면 논가뭄지도에 없는 시군이라 등록할 수 없다 — 감추지 않고 이유를 보여준다.
 */
data class ReservoirHit(
    val facCode: String,
    val name: String,
    val address: String?,
    val sigunCode: String,
    val sigunName: String?,
    val prepared: Boolean,
)

sealed interface ReservoirSearchResult {
    data class Success(val reservoirs: List<ReservoirHit>) : ReservoirSearchResult

    data class Failure(
        val code: String,
        val message: String,
        val retryable: Boolean,
    ) : ReservoirSearchResult
}

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
