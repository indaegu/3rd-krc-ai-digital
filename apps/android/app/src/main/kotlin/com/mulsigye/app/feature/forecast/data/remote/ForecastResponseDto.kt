package com.mulsigye.app.feature.forecast.data.remote

import kotlinx.serialization.Serializable

/** openapi.yaml `DroughtStage`와 1:1. enum이 아닌 String으로 받아 표시 전용으로만 쓴다. */
@Serializable
data class ForecastStageDto(
    val code: String,
    val label: String,
)

/** openapi.yaml `ForecastResponse.basis`와 1:1. */
@Serializable
data class ForecastBasisDto(
    val observedOn: String,
    val avgRatio: Double,
    val officialStage: ForecastStageDto,
)

/** openapi.yaml `ForecastPoint`와 1:1. 실측 avgRatio 시계열 점. */
@Serializable
data class ForecastPointDto(
    val observedOn: String,
    val avgRatio: Double,
)

/** openapi.yaml `ForecastBandPoint`와 1:1. 예측 점과 밴드(low/high). */
@Serializable
data class ForecastBandPointDto(
    val observedOn: String,
    val avgRatio: Double,
    val low: Double,
    val high: Double,
)

/** openapi.yaml `ForecastResponse.trend`와 1:1. */
@Serializable
data class ForecastTrendDto(
    val dailyDelta: Double,
    val bucket: String,
)

/** openapi.yaml `ForecastResponse.reach`와 1:1. 참고 표현 전용. */
@Serializable
data class ForecastReachDto(
    val days: Int? = null,
    val bucket: String,
    val targetStage: ForecastStageDto? = null,
)

/** openapi.yaml `ForecastResponse.model`와 1:1. 채택 모델 메타데이터. */
@Serializable
data class ForecastModelDto(
    val name: String,
    val version: String,
    val mae7: Double,
    val mae14: Double,
    val bandMethod: String,
)

/** openapi.yaml `ForecastResponse.officialOutlook`(non-null 형태)와 1:1. */
@Serializable
data class OfficialOutlookDto(
    val publishedOn: String,
    val current: ForecastStageDto,
    val outlook1m: ForecastStageDto,
    val outlook2m: ForecastStageDto,
    val outlook3m: ForecastStageDto,
)

/** openapi.yaml `ForecastResponse`와 1:1. */
@Serializable
data class ForecastResponseDto(
    val schemaVersion: String,
    val sigunCode: String,
    val sigunName: String,
    val basis: ForecastBasisDto,
    val history: List<ForecastPointDto>,
    val forecast: List<ForecastBandPointDto>,
    val trend: ForecastTrendDto,
    val reach: ForecastReachDto,
    val model: ForecastModelDto,
    val officialOutlook: OfficialOutlookDto? = null,
    val asOf: String,
    val sources: List<String>,
    val stale: Boolean,
)
