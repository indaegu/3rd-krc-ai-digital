package com.mulsigye.app.core.testing

import com.mulsigye.app.feature.coach.data.remote.CoachResponseDto
import com.mulsigye.app.feature.coach.domain.CoachAction
import com.mulsigye.app.feature.coach.domain.CoachContent
import com.mulsigye.app.feature.coach.domain.CoachResult
import java.time.Instant
import kotlinx.serialization.json.Json

/**
 * 계약 픽스처(`fixtures/coach.*.json`)를 DTO로 디코드해 도메인 [CoachResult.Success]로
 * 매핑한다. 코치 카드 렌더 테스트가 실제 계약값(mode·coach headline/summary/actions·
 * fallbackReason·sources·stale)을 그대로 쓰도록 돕는다. 매핑은 DefaultCoachRepository와 동일하다.
 */
object CoachFixtures {
    private val json = Json { ignoreUnknownKeys = true }

    fun success(name: String): CoachResult.Success {
        val dto = json.decodeFromString(CoachResponseDto.serializer(), Fixtures.read(name))
        return CoachResult.Success(
            mode = dto.mode,
            dataStale = dto.dataStale,
            cacheHit = dto.cacheHit,
            generatedAt = dto.generatedAt,
            promptVersion = dto.promptVersion,
            actionCatalogVersion = dto.actionCatalogVersion,
            coach = CoachContent(
                headline = dto.coach.headline,
                summary = dto.coach.summary,
                actions = dto.coach.actions.map { CoachAction(it.id, it.title, it.reason) },
            ),
            fallbackReason = dto.fallbackReason,
            asOf = Instant.parse(dto.asOf),
            sources = dto.sources,
            stale = dto.stale,
        )
    }
}
