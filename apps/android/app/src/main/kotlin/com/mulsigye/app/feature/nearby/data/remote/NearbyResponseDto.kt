package com.mulsigye.app.feature.nearby.data.remote

import kotlinx.serialization.Serializable

/** openapi.yaml `NearbyResponse.regions[]`와 1:1. */
@Serializable
data class NearbyRegionDto(
    val sigunCode: String,
    val sigunName: String,
    val avgRatio: Double,
    /** 서버가 확정한 공식 가뭄단계 코드. Android는 표시만 한다(재계산 금지). */
    val stageCode: String,
    val current: Boolean,
)

/**
 * openapi.yaml `NearbyResponse`와 1:1. 좌표가 없어 '주변'은 같은 시·도로 정의한다.
 * 커밋 스냅샷 기반이라 stale=true다.
 */
@Serializable
data class NearbyResponseDto(
    val schemaVersion: String,
    val sidoName: String,
    val asOf: String,
    val regions: List<NearbyRegionDto>,
    val stale: Boolean,
    val sources: List<String>,
)
