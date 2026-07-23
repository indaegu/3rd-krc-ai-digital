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

sealed interface StatusResult {
    data class Success(
        val sigunCode: String,
        val sigunName: String,
        val reservoir: ReservoirStatus,
        val region: RegionStatus,
        /** 만수위 참고 안내 여부. 서버 확정값이며 클라이언트가 재판정하지 않는다. */
        val highWaterNotice: Boolean,
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
