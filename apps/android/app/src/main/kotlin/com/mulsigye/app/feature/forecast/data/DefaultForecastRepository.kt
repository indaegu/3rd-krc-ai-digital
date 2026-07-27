package com.mulsigye.app.feature.forecast.data

import com.mulsigye.app.core.network.InvalidResponseFailure
import com.mulsigye.app.core.network.NetworkFailure
import com.mulsigye.app.core.network.toApiFailure
import com.mulsigye.app.core.storage.LastGoodStore
import com.mulsigye.app.feature.forecast.data.remote.ForecastApi
import com.mulsigye.app.feature.forecast.data.remote.ForecastResponseDto
import com.mulsigye.app.feature.forecast.data.remote.ForecastStageDto
import com.mulsigye.app.feature.forecast.domain.ForecastBandPoint
import com.mulsigye.app.feature.forecast.domain.ForecastBasis
import com.mulsigye.app.feature.forecast.domain.ForecastModel
import com.mulsigye.app.feature.forecast.domain.ForecastPoint
import com.mulsigye.app.feature.forecast.domain.ForecastReach
import com.mulsigye.app.feature.forecast.domain.ForecastRepository
import com.mulsigye.app.feature.forecast.domain.ForecastResult
import com.mulsigye.app.feature.forecast.domain.ForecastStage
import com.mulsigye.app.feature.forecast.domain.ForecastTrend
import com.mulsigye.app.feature.forecast.domain.OfficialOutlook
import com.mulsigye.app.feature.forecast.domain.StageGuideEntry
import java.io.IOException
import java.time.Instant
import java.time.format.DateTimeParseException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

class DefaultForecastRepository(
    private val api: ForecastApi,
    private val json: Json,
    /**
     * 마지막 정상 응답 저장소. 없으면(테스트 등) 저장·복구 없이 예전처럼 동작한다.
     */
    private val lastGood: LastGoodStore? = null,
) : ForecastRepository {

    override suspend fun load(sigunCode: String): ForecastResult {
        val result = fetch(sigunCode)
        // 다시 시도할 만한 실패에서만 저장본으로 되돌린다(status와 같은 규칙).
        if (result is ForecastResult.Failure && result.retryable) {
            cached(sigunCode)?.let { return it }
        }
        return result
    }

    private suspend fun fetch(sigunCode: String): ForecastResult =
        try {
            val response = api.getForecast(sigunCode)
            val body = response.body()
            if (response.isSuccessful && body != null) {
                if (body.schemaVersion != "1") {
                    invalid()
                } else {
                    saveQuietly(sigunCode, body)
                    body.toDomain(cachedAt = null)
                }
            } else {
                response.toApiFailure(json).let {
                    ForecastResult.Failure(it.code, it.message, it.retryable)
                }
            }
        } catch (_: IOException) {
            NetworkFailure.let { ForecastResult.Failure(it.code, it.message, it.retryable) }
        } catch (_: SerializationException) {
            invalid()
        } catch (_: DateTimeParseException) {
            invalid()
        }

    /** 저장 실패가 방금 받은 정상 응답을 버리게 두지 않는다(status와 같은 규칙). */
    private suspend fun saveQuietly(sigunCode: String, body: ForecastResponseDto) {
        try {
            lastGood?.save(
                kind = LastGoodStore.KIND_FORECAST,
                key = sigunCode,
                payload = json.encodeToString(body),
            )
        } catch (_: IOException) {
            // 다음 성공 응답 때 다시 남긴다.
        } catch (_: SerializationException) {
            // 직렬화할 수 없는 응답은 되살릴 수도 없으므로 저장을 건너뛴다.
        }
    }

    /** 저장본 → 도메인. 저장 당시 형식이 지금과 달라 매핑이 깨지면 캐시 없음으로 본다. */
    private suspend fun cached(sigunCode: String): ForecastResult.Success? {
        // 읽기 실패도 "캐시 없음"이다 — 저장소 오류로 화면이 죽으면 안 된다.
        val entry = try {
            lastGood?.load(LastGoodStore.KIND_FORECAST, sigunCode)
        } catch (_: IOException) {
            null
        } ?: return null
        return runCatching {
            json.decodeFromString<ForecastResponseDto>(entry.payload)
                .takeIf { it.schemaVersion == "1" }
                ?.toDomain(cachedAt = Instant.ofEpochMilli(entry.savedAt))
        }.getOrNull()
    }

    private fun ForecastResponseDto.toDomain(cachedAt: Instant?) = ForecastResult.Success(
        sigunCode = sigunCode,
        sigunName = sigunName,
        basis = ForecastBasis(
            observedOn = basis.observedOn,
            avgRatio = basis.avgRatio,
            officialStage = basis.officialStage.toDomain(),
            isEstimate = basis.basis == "estimate",
        ),
        history = history.map { ForecastPoint(it.observedOn, it.avgRatio) },
        forecast = forecast.map {
            ForecastBandPoint(it.observedOn, it.avgRatio, it.low, it.high)
        },
        trend = ForecastTrend(trend.dailyDelta, trend.bucket),
        reach = ForecastReach(
            days = reach.days,
            bucket = reach.bucket,
            targetStage = reach.targetStage?.toDomain(),
        ),
        model = ForecastModel(
            name = model.name,
            version = model.version,
            mae7 = model.mae7,
            mae14 = model.mae14,
            mae30 = model.mae30,
            bandMethod = model.bandMethod,
        ),
        officialOutlook = officialOutlook?.let {
            OfficialOutlook(
                publishedOn = it.publishedOn,
                current = it.current.toDomain(),
                outlook1m = it.outlook1m.toDomain(),
                outlook2m = it.outlook2m.toDomain(),
                outlook3m = it.outlook3m.toDomain(),
                targetMonths = it.targetMonths ?: emptyList(),
                monthsSincePublished = it.monthsSincePublished ?: 0,
            )
        },
        stageGuide = stageGuide?.map {
            StageGuideEntry(
                code = it.code,
                label = it.label,
                actions = it.actions,
                current = it.current,
            )
        },
        asOf = Instant.parse(asOf),
        sources = sources,
        stale = stale,
        cachedAt = cachedAt,
    )

    private fun ForecastStageDto.toDomain() = ForecastStage(code = code, label = label)

    private fun invalid() =
        ForecastResult.Failure(
            code = InvalidResponseFailure.code,
            message = InvalidResponseFailure.message,
            retryable = InvalidResponseFailure.retryable,
        )
}
