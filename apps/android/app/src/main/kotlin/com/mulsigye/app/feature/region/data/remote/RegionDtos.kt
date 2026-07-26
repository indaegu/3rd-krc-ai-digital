package com.mulsigye.app.feature.region.data.remote

import kotlinx.serialization.Serializable

/** openapi.yaml `RegionCandidate`와 1:1. emdNm/liNm은 v1 additive다. */
@Serializable
data class RegionCandidateDto(
    val label: String,
    val admCd: String,
    val legalCode: String,
    /** 읍·면·동 이름. resolve에 그대로 실어 시군 안에서 대표 저수지를 좁힌다(저장 안 함). */
    val emdNm: String? = null,
    /** 리 이름. 쓰임은 emdNm과 같다. */
    val liNm: String? = null,
)

/** openapi.yaml `RegionSearchResponse`와 1:1. */
@Serializable
data class RegionSearchResponseDto(
    val schemaVersion: String,
    val candidates: List<RegionCandidateDto>,
    val asOf: String,
    val sources: List<String>,
    val stale: Boolean,
)

/**
 * openapi.yaml `RegionResolveRequest`와 1:1.
 *
 * emdNm/liNm을 함께 보내면 시군 안에서 읍·면·동/리까지 좁혀 대표 저수지를 고른다 —
 * 넓은 시군에서 늘 같은 저수지가 뽑히던 문제를 막는다(실측: 제주시 → 상대 고정).
 * facCode는 사용자가 저수지 이름으로 직접 고른 경우에만 붙는다.
 * null인 필드는 직렬화에서 빠지므로 서버 기본 동작(시군 단위)이 그대로 유지된다.
 */
@Serializable
data class RegionResolveRequestDto(
    val admCd: String,
    val legalCode: String,
    val emdNm: String? = null,
    val liNm: String? = null,
    val facCode: String? = null,
)

/** openapi.yaml `ReservoirSearchResponse.reservoirs[]`와 1:1. */
@Serializable
data class ReservoirHitDto(
    val facCode: String,
    val name: String,
    val address: String? = null,
    val sigunCode: String,
    val sigunName: String? = null,
    val prepared: Boolean,
)

/** openapi.yaml `ReservoirSearchResponse`와 1:1. 커밋 스냅샷 조회라 stale은 항상 false다. */
@Serializable
data class ReservoirSearchResponseDto(
    val schemaVersion: String,
    val reservoirs: List<ReservoirHitDto>,
    val asOf: String,
    val sources: List<String>,
    val stale: Boolean,
)

/** openapi.yaml `RepresentativeReservoir`와 1:1. */
@Serializable
data class RepresentativeReservoirDto(
    val facCode: String,
    val name: String,
)

/** openapi.yaml `RegionResolveResponse`와 1:1. 판정 불가 지역은 prepared=false로 200을 유지한다. */
@Serializable
data class RegionResolveResponseDto(
    val schemaVersion: String,
    val sigunCode: String? = null,
    val sigunName: String? = null,
    val prepared: Boolean,
    val reservoir: RepresentativeReservoirDto? = null,
    val asOf: String,
    val sources: List<String>,
    val stale: Boolean,
)
