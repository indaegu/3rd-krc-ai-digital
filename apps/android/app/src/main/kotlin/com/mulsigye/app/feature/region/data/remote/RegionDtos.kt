package com.mulsigye.app.feature.region.data.remote

import kotlinx.serialization.Serializable

/** openapi.yaml `RegionCandidate`와 1:1. */
@Serializable
data class RegionCandidateDto(
    val label: String,
    val admCd: String,
    val legalCode: String,
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

/** openapi.yaml `RegionResolveRequest`와 1:1. */
@Serializable
data class RegionResolveRequestDto(
    val admCd: String,
    val legalCode: String,
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
