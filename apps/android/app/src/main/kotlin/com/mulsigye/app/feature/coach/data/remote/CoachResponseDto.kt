package com.mulsigye.app.feature.coach.data.remote

import kotlinx.serialization.Serializable

/** openapi.yaml `CoachResponse.coach.actions[]`와 1:1. */
@Serializable
data class CoachActionDto(
    val id: String,
    val title: String,
    val reason: String,
)

/** openapi.yaml `CoachResponse.coach`와 1:1. */
@Serializable
data class CoachContentDto(
    val headline: String,
    val summary: String,
    val actions: List<CoachActionDto>,
)

/**
 * openapi.yaml `CoachResponse`와 1:1. LLM 폴백도 HTTP 200이며 mode로 관측한다.
 * fallbackReason은 enum이 아닌 String?로 받아 표시 전용으로만 쓴다.
 */
@Serializable
data class CoachResponseDto(
    val schemaVersion: String,
    val mode: String,
    val dataStale: Boolean,
    val cacheHit: Boolean,
    val generatedAt: String,
    val promptVersion: String,
    val actionCatalogVersion: String,
    val coach: CoachContentDto,
    val fallbackReason: String? = null,
    val asOf: String,
    val sources: List<String>,
    val stale: Boolean,
)
