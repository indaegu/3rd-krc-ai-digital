package com.mulsigye.app.feature.nearby.domain

/**
 * 같은 시·도 지역 한 곳. 서버가 확정한 avgRatio·stageCode를 그대로 표시한다(규칙 10).
 */
data class NearbyRegion(
    val sigunCode: String,
    val sigunName: String,
    val avgRatio: Double,
    val stageCode: String,
    val current: Boolean,
)

sealed interface NearbyResult {
    data class Success(
        val sidoName: String,
        val asOf: String,
        /** 서버가 확정한 가뭄 심한 순(avgRatio 오름차순) 그대로. Android는 재정렬하지 않는다. */
        val regions: List<NearbyRegion>,
        val stale: Boolean,
        val sources: List<String>,
    ) : NearbyResult

    data class Failure(
        val code: String,
        val message: String,
        val retryable: Boolean,
    ) : NearbyResult
}
