package com.mulsigye.app.feature.status.domain

import java.time.Instant

/** 공식 가뭄단계. 서버가 준 code·label을 그대로 표시한다(임계값 계산 없음). */
data class DroughtStage(
    val code: String,
    val label: String,
)

/** 대표 저수지 최신 관측값. rate는 원저수율(%)이며 avgRatio와 섞지 않는다. */
data class ReservoirStatus(
    val facCode: String,
    val name: String,
    val rate: Double?,
    val waterLevel: Double?,
    val observedOn: String?,
)

/** 논가뭄지도 기준 지역 공식 값. */
data class RegionStatus(
    val observedOn: String,
    val regionalRate: Double?,
    val normalRate: Double?,
    val avgRatio: Double,
    val officialStage: DroughtStage,
)

/**
 * 올해(2025) 저수율 분포 속 현재 avgRatio의 위치. 서버 확정값이며 클라이언트가 재계산하지 않는다.
 * bucket은 low/mid/high, percentile은 0..100 백분위(참고 표시 전용).
 */
data class YearlyPosition(
    val year: Int,
    val percentile: Int,
    val bucket: String,
    val min: Double,
    val max: Double,
)

/**
 * 공인 가뭄단계 구간(정상→심각). minRatio는 각 단계의 평년 대비 하한(ok=70 … alert=40, crit=0).
 * 임계값의 단일 출처는 서버 drought-stage다 — Android는 이 값을 게이지 눈금에 표시만 하고
 * 숫자를 복제하지 않는다(규칙 10). 서버가 주지 않으면(구 페이로드) null이며 게이지는 눈금을 그리지 않는다.
 */
data class StageBand(
    val code: String,
    val label: String,
    val minRatio: Double,
)

sealed interface StatusResult {
    data class Success(
        val sigunCode: String,
        val sigunName: String,
        val reservoir: ReservoirStatus,
        val region: RegionStatus,
        /** 만수위 참고 안내 여부. 서버 확정값이며 클라이언트가 재판정하지 않는다. */
        val highWaterNotice: Boolean,
        /** 올해 흐름 속 현재 위치. 서버 확정값이며, 스냅샷에 없는 지역은 null이다. */
        val yearlyPosition: YearlyPosition? = null,
        /** 게이지 단계 눈금(정상→심각). 서버 확정값이며, 구 페이로드에는 없어 null일 수 있다. */
        val stageBands: List<StageBand>? = null,
        val asOf: Instant,
        val sources: List<String>,
        val stale: Boolean,
    ) : StatusResult

    data class Failure(
        val code: String,
        val message: String,
        val retryable: Boolean,
    ) : StatusResult
}
