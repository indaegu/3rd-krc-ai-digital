package com.mulsigye.app.feature.forecast.data.remote

import kotlinx.serialization.Serializable

/** openapi.yaml `DroughtStage`와 1:1. enum이 아닌 String으로 받아 표시 전용으로만 쓴다. */
@Serializable
data class ForecastStageDto(
    val code: String,
    val label: String,
)

/** openapi.yaml `ForecastResponse.basis`와 1:1. basis/estimate는 v1 additive다. */
@Serializable
data class ForecastBasisDto(
    val observedOn: String,
    val avgRatio: Double,
    val officialStage: ForecastStageDto,
    /** "official" | "estimate". 없으면 공표값으로 본다(status.region.basis와 같은 뜻). */
    val basis: String? = null,
    val estimate: ForecastEstimateDto? = null,
)

/** openapi.yaml `ForecastResponse.basis.estimate`와 1:1. 추정 근거(표시 전용). */
@Serializable
data class ForecastEstimateDto(
    val maePp: Double,
    val reservoirCount: Int,
    val capacityRatio: Double,
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
    /** v1 additive — 지평을 30일로 늘리며 추가. 구 서버 응답에는 없다. */
    val mae30: Double? = null,
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
    /** v1 additive — outlook1m/2m/3m이 가리키는 대상 월(YYYY-MM) 3개. */
    val targetMonths: List<String>? = null,
    /** v1 additive — 발행 후 지난 개월 수(서버 확정). */
    val monthsSincePublished: Int? = null,
)

/** openapi.yaml `ForecastResponse.stageGuide` 원소와 1:1. 행동 카피는 서버 카탈로그가 출처다. */
@Serializable
data class ForecastStageGuideDto(
    val code: String,
    val label: String,
    val actions: List<String>,
    val current: Boolean,
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
    val stageGuide: List<ForecastStageGuideDto>? = null,
    val asOf: String,
    val sources: List<String>,
    val stale: Boolean,
)
