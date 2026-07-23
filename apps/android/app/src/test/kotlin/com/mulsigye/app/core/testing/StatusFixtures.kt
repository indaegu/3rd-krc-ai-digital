package com.mulsigye.app.core.testing

import com.mulsigye.app.feature.status.data.remote.StatusResponseDto
import com.mulsigye.app.feature.status.domain.DroughtStage
import com.mulsigye.app.feature.status.domain.RegionStatus
import com.mulsigye.app.feature.status.domain.ReservoirStatus
import com.mulsigye.app.feature.status.domain.StatusResult
import java.time.Instant
import kotlinx.serialization.json.Json

/**
 * 계약 픽스처(`fixtures/status.*.json`)를 DTO로 디코드해 도메인 [StatusResult.Success]로
 * 매핑한다. 화면 렌더 테스트가 실제 계약값(rate·avgRatio·단계·highWaterNotice)을 그대로
 * 쓰도록 돕는다. 매핑은 DefaultStatusRepository의 필드 복사와 동일하다.
 */
object StatusFixtures {
    private val json = Json { ignoreUnknownKeys = true }

    fun success(name: String): StatusResult.Success {
        val dto = json.decodeFromString(StatusResponseDto.serializer(), Fixtures.read(name))
        return StatusResult.Success(
            sigunCode = dto.sigunCode,
            sigunName = dto.sigunName,
            reservoir = ReservoirStatus(
                facCode = dto.reservoir.facCode,
                name = dto.reservoir.name,
                rate = dto.reservoir.rate,
                waterLevel = dto.reservoir.waterLevel,
                observedOn = dto.reservoir.observedOn,
            ),
            region = RegionStatus(
                observedOn = dto.region.observedOn,
                regionalRate = dto.region.regionalRate,
                normalRate = dto.region.normalRate,
                avgRatio = dto.region.avgRatio,
                officialStage = DroughtStage(
                    code = dto.region.officialStage.code,
                    label = dto.region.officialStage.label,
                ),
            ),
            highWaterNotice = dto.highWaterNotice,
            asOf = Instant.parse(dto.asOf),
            sources = dto.sources,
            stale = dto.stale,
        )
    }
}
