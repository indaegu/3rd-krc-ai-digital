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
data class StatusReservoirDto(
    val facCode: String,
    val name: String,
    val rate: Double? = null,
    val waterLevel: Double? = null,
    val observedOn: String? = null,
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

/** openapi.yaml `StatusResponse`와 1:1. */
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
)
