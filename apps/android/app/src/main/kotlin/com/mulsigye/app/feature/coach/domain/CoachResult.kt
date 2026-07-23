package com.mulsigye.app.feature.coach.domain

import java.time.Instant

/** 검토 완료 행동 카탈로그 항목. 서버 문구를 그대로 표시한다. */
data class CoachAction(
    val id: String,
    val title: String,
    val reason: String,
)

data class CoachContent(
    val headline: String,
    val summary: String,
    val actions: List<CoachAction>,
)

sealed interface CoachResult {
    data class Success(
        /** 코치 문구 출처: llm·cache·static. 화면 구조는 mode에 따라 바꾸지 않는다. */
        val mode: String,
        val dataStale: Boolean,
        val cacheHit: Boolean,
        val generatedAt: String,
        val promptVersion: String,
        val actionCatalogVersion: String,
        val coach: CoachContent,
        val fallbackReason: String?,
        val asOf: Instant,
        val sources: List<String>,
        val stale: Boolean,
    ) : CoachResult

    data class Failure(
        val code: String,
        val message: String,
        val retryable: Boolean,
    ) : CoachResult
}
