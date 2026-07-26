package com.mulsigye.app.feature.status.data.remote

import kotlinx.serialization.Serializable

/**
 * openapi.yaml `DroughtStage`와 1:1. code는 UI 토큰, label은 한국어 공식 명칭.
 * enum이 아니라 String으로 받아 표시 전용으로만 쓴다(strict 디코드 실패 방지).
 */
@Serializable
data class DroughtStageDto(
    val code: String,
    val label: String,
)

/** openapi.yaml `StatusResponse.reservoir`와 1:1. 원저수율은 avgRatio와 섞지 않는다. */
@Serializable
data class ReservoirRatePointDto(
    val observedOn: String,
    val rate: Double,
)

@Serializable
data class StatusReservoirDto(
    val facCode: String,
    val name: String,
    val rate: Double? = null,
    val waterLevel: Double? = null,
    val observedOn: String? = null,
    /** v1 additive — 대표 저수지 최근 실측(오래된 날짜부터). 차트 토글에서 쓴다. */
    val rateHistory: List<ReservoirRatePointDto> = emptyList(),
)

/** openapi.yaml `StatusResponse.region`와 1:1. 논가뭄지도 기준 지역 공식 값. */
@Serializable
data class StatusRegionDto(
    val observedOn: String,
    val regionalRate: Double? = null,
    val normalRate: Double? = null,
    val avgRatio: Double,
    val officialStage: DroughtStageDto,
)

/**
 * openapi.yaml `StatusResponse.yearlyPosition`와 1:1. 올해(2025) 저수율 분포 속 현재 위치.
 * 서버 확정값이며 클라이언트는 재계산하지 않는다(표시 전용). 스냅샷에 없는 지역은 null.
 */
@Serializable
data class YearlyPositionDto(
    val year: Int,
    val percentile: Double,
    val bucket: String,
    val min: Double,
    val max: Double,
)

/**
 * openapi.yaml `StatusResponse.stageBands[]`와 1:1. 공인 가뭄단계 구간(정상→심각).
 * 임계값의 단일 출처는 서버 drought-stage이며 Android는 표시 전용으로만 쓴다.
 */
@Serializable
data class StageBandDto(
    val code: String,
    val label: String,
    val minRatio: Double,
)

/** openapi.yaml `StatusResponse`와 1:1. yearlyPosition은 v1 additive 옵션 필드다. */
@Serializable
data class StatusResponseDto(
    val schemaVersion: String,
    val sigunCode: String,
    val sigunName: String,
    val reservoir: StatusReservoirDto,
    val region: StatusRegionDto,
    val highWaterNotice: Boolean,
    val asOf: String,
    val sources: List<String>,
    val stale: Boolean,
    val yearlyPosition: YearlyPositionDto? = null,
    val stageBands: List<StageBandDto>? = null,
)
