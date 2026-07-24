package com.mulsigye.app.feature.forecast.domain

import java.time.Instant

/** 공식 가뭄단계. 서버 code·label을 그대로 표시한다. */
data class ForecastStage(
    val code: String,
    val label: String,
)

data class ForecastBasis(
    val observedOn: String,
    val avgRatio: Double,
    val officialStage: ForecastStage,
)

/** 실측 avgRatio 시계열 점. */
data class ForecastPoint(
    val observedOn: String,
    val avgRatio: Double,
)

/** 예측 점과 밴드. low/high는 서버 산식 결과이며 재계산하지 않는다. */
data class ForecastBandPoint(
    val observedOn: String,
    val avgRatio: Double,
    val low: Double,
    val high: Double,
)

data class ForecastTrend(
    val dailyDelta: Double,
    val bucket: String,
)

/** 다음 공인 단계 도달 가능 시점. 참고 표현 전용. */
data class ForecastReach(
    val days: Int?,
    val bucket: String,
    val targetStage: ForecastStage?,
)

data class ForecastModel(
    val name: String,
    val version: String,
    val mae7: Double,
    val mae14: Double,
    val bandMethod: String,
)

data class OfficialOutlook(
    val publishedOn: String,
    val current: ForecastStage,
    val outlook1m: ForecastStage,
    val outlook2m: ForecastStage,
    val outlook3m: ForecastStage,
)

sealed interface ForecastResult {
    data class Success(
        val sigunCode: String,
        val sigunName: String,
        val basis: ForecastBasis,
        val history: List<ForecastPoint>,
        val forecast: List<ForecastBandPoint>,
        val trend: ForecastTrend,
        val reach: ForecastReach,
        val model: ForecastModel,
        val officialOutlook: OfficialOutlook?,
        val asOf: Instant,
        val sources: List<String>,
        val stale: Boolean,
    ) : ForecastResult

    data class Failure(
        val code: String,
        val message: String,
        val retryable: Boolean,
    ) : ForecastResult
}
