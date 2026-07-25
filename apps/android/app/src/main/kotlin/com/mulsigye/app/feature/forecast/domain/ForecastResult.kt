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

/**
 * 단계별 행동 가이드 한 단계. 행동 제목은 서버 카탈로그가 유일 출처이며 재작성하지 않는다.
 * current는 우리 지역의 현재 공인 단계면 true(정확히 1개).
 */
data class StageGuideEntry(
    val code: String,
    val label: String,
    val actions: List<String>,
    val current: Boolean,
)

/**
 * '감소 주의' 조기경보 — 공식 단계와 별개인 앱 자체 참고 신호(공식 70/60/50/40 기준이 아님).
 * 서버가 정상·관심 단계 + 빠른 하락일 때만 확정한다. 없으면 null(표시 안 함).
 */
data class ForecastEarlyWarning(
    val level: String,
    val dailyDelta: Double,
    val message: String,
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
        val stageGuide: List<StageGuideEntry>? = null,
        val earlyWarning: ForecastEarlyWarning? = null,
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
