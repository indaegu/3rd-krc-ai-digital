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
    /** 서버가 실측으로 계산한 기준점인지. 서버가 주지 않으면 false(공표값). */
    val isEstimate: Boolean = false,
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
    /** 30일 지평 오차. 구 서버 응답에는 없어 null일 수 있다. */
    val mae30: Double? = null,
    val bandMethod: String,
)

data class OfficialOutlook(
    val publishedOn: String,
    val current: ForecastStage,
    val outlook1m: ForecastStage,
    val outlook2m: ForecastStage,
    val outlook3m: ForecastStage,
    /**
     * outlook1m/2m/3m이 가리키는 대상 월(YYYY-MM) 3개. 서버 확정값이며 이미 지난 달일 수
     * 있다 — 그래서 화면은 "1개월 뒤" 대신 이 월을 쓴다. 구 페이로드에서는 빈 목록.
     */
    val targetMonths: List<String> = emptyList(),
    /** 발행 후 지난 개월 수(서버 확정). 크면 "지난 전망" 고지를 붙인다. */
    val monthsSincePublished: Int = 0,
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
        val asOf: Instant,
        val sources: List<String>,
        val stale: Boolean,
        /**
         * 통신이 끊겨 기기에 저장해 둔 마지막 정상 응답을 되돌려준 경우, 그 응답을 받은 시각.
         * 방금 서버에서 받은 값이면 null이다. 화면은 이 값이 있을 때만 오프라인 안내를 띄운다.
         */
        val cachedAt: Instant? = null,
    ) : ForecastResult

    data class Failure(
        val code: String,
        val message: String,
        val retryable: Boolean,
    ) : ForecastResult
}
