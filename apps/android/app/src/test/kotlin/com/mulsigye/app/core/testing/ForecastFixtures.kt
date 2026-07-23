package com.mulsigye.app.core.testing

import com.mulsigye.app.feature.forecast.data.remote.ForecastResponseDto
import com.mulsigye.app.feature.forecast.domain.ForecastBandPoint
import com.mulsigye.app.feature.forecast.domain.ForecastBasis
import com.mulsigye.app.feature.forecast.domain.ForecastModel
import com.mulsigye.app.feature.forecast.domain.ForecastPoint
import com.mulsigye.app.feature.forecast.domain.ForecastReach
import com.mulsigye.app.feature.forecast.domain.ForecastResult
import com.mulsigye.app.feature.forecast.domain.ForecastStage
import com.mulsigye.app.feature.forecast.domain.ForecastTrend
import com.mulsigye.app.feature.forecast.domain.OfficialOutlook
import java.time.Instant
import kotlinx.serialization.json.Json

/**
 * 계약 픽스처(`fixtures/forecast.*.json`)를 DTO로 디코드해 도메인 [ForecastResult.Success]로
 * 매핑한다. 흐름 차트·도달 예상 렌더 테스트가 실제 계약값(history·forecast low/high·reach·
 * model MAE·officialOutlook)을 그대로 쓰도록 돕는다. 매핑은 DefaultForecastRepository와 동일하다.
 */
object ForecastFixtures {
    private val json = Json { ignoreUnknownKeys = true }

    fun success(name: String): ForecastResult.Success {
        val dto = json.decodeFromString(ForecastResponseDto.serializer(), Fixtures.read(name))
        return ForecastResult.Success(
            sigunCode = dto.sigunCode,
            sigunName = dto.sigunName,
            basis = ForecastBasis(
                observedOn = dto.basis.observedOn,
                avgRatio = dto.basis.avgRatio,
                officialStage = ForecastStage(dto.basis.officialStage.code, dto.basis.officialStage.label),
            ),
            history = dto.history.map { ForecastPoint(it.observedOn, it.avgRatio) },
            forecast = dto.forecast.map { ForecastBandPoint(it.observedOn, it.avgRatio, it.low, it.high) },
            trend = ForecastTrend(dto.trend.dailyDelta, dto.trend.bucket),
            reach = ForecastReach(
                days = dto.reach.days,
                bucket = dto.reach.bucket,
                targetStage = dto.reach.targetStage?.let { ForecastStage(it.code, it.label) },
            ),
            model = ForecastModel(
                name = dto.model.name,
                version = dto.model.version,
                mae7 = dto.model.mae7,
                mae14 = dto.model.mae14,
                bandMethod = dto.model.bandMethod,
            ),
            officialOutlook = dto.officialOutlook?.let {
                OfficialOutlook(
                    publishedOn = it.publishedOn,
                    current = ForecastStage(it.current.code, it.current.label),
                    outlook1m = ForecastStage(it.outlook1m.code, it.outlook1m.label),
                    outlook2m = ForecastStage(it.outlook2m.code, it.outlook2m.label),
                    outlook3m = ForecastStage(it.outlook3m.code, it.outlook3m.label),
                )
            },
            asOf = Instant.parse(dto.asOf),
            sources = dto.sources,
            stale = dto.stale,
        )
    }
}
