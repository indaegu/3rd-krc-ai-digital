package com.mulsigye.app.feature.status.data

import com.mulsigye.app.core.network.InvalidResponseFailure
import com.mulsigye.app.core.network.NetworkFailure
import com.mulsigye.app.core.network.toApiFailure
import com.mulsigye.app.core.storage.LastGoodStore
import com.mulsigye.app.feature.status.data.remote.StatusApi
import com.mulsigye.app.feature.status.data.remote.StatusResponseDto
import com.mulsigye.app.feature.status.domain.DroughtStage
import com.mulsigye.app.feature.status.domain.RegionEstimate
import com.mulsigye.app.feature.status.domain.RegionStatus
import com.mulsigye.app.feature.status.domain.ReservoirRatePoint
import com.mulsigye.app.feature.status.domain.ReservoirStatus
import com.mulsigye.app.feature.status.domain.StageBand
import com.mulsigye.app.feature.status.domain.StatusRepository
import com.mulsigye.app.feature.status.domain.StatusResult
import com.mulsigye.app.feature.status.domain.YearlyPosition
import java.io.IOException
import java.time.Instant
import java.time.format.DateTimeParseException
import kotlin.math.roundToInt
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

class DefaultStatusRepository(
    private val api: StatusApi,
    private val json: Json,
    /**
     * 마지막 정상 응답 저장소. 없으면(테스트 등) 저장·복구 없이 예전처럼 동작한다.
     */
    private val lastGood: LastGoodStore? = null,
) : StatusRepository {

    override suspend fun load(
        sigunCode: String,
        facCode: String?,
        allowCached: Boolean,
    ): StatusResult {
        val result = fetch(sigunCode, facCode)
        // 통신 두절·서버 일시 장애처럼 다시 시도할 만한 실패에서만 저장본으로 되돌린다.
        // 준비되지 않은 지역 같은 확정된 답(retryable=false)은 캐시로 덮지 않는다.
        if (allowCached && result is StatusResult.Failure && result.retryable) {
            cached(cacheKey(sigunCode, facCode))?.let { return it }
        }
        return result
    }

    private suspend fun fetch(sigunCode: String, facCode: String?): StatusResult =
        try {
            val response = api.getStatus(sigunCode, facCode?.takeIf { it.isNotBlank() })
            val body = response.body()
            if (response.isSuccessful && body != null) {
                if (body.schemaVersion != "1") {
                    invalid()
                } else {
                    // 매핑까지 성공한 응답만 남긴다 — 되살릴 수 없는 원문은 저장할 이유가 없다.
                    saveQuietly(cacheKey(sigunCode, facCode), body)
                    body.toDomain(cachedAt = null)
                }
            } else {
                response.toApiFailure(json).let {
                    StatusResult.Failure(it.code, it.message, it.retryable)
                }
            }
        } catch (_: IOException) {
            NetworkFailure.let { StatusResult.Failure(it.code, it.message, it.retryable) }
        } catch (_: SerializationException) {
            invalid()
        } catch (_: DateTimeParseException) {
            invalid()
        }

    /**
     * 저장에 실패해도 방금 받은 정상 응답을 버리지 않는다.
     *
     * DataStore 쓰기는 저장소가 가득 찼거나 파일이 잠겼을 때 IOException을 던진다. 이 예외가
     * 위쪽 try로 새면 성공한 HTTP 응답이 "인터넷 연결을 확인해 주세요"로 뒤바뀐다.
     */
    private suspend fun saveQuietly(key: String, body: StatusResponseDto) {
        try {
            lastGood?.save(
                kind = LastGoodStore.KIND_STATUS,
                key = key,
                payload = json.encodeToString(body),
            )
        } catch (_: IOException) {
            // 다음 성공 응답 때 다시 남긴다.
        } catch (_: SerializationException) {
            // 직렬화할 수 없는 응답은 되살릴 수도 없으므로 저장을 건너뛴다.
        }
    }

    /** 저장본 → 도메인. 저장 당시 형식이 지금과 달라 매핑이 깨지면 캐시 없음으로 본다. */
    private suspend fun cached(key: String): StatusResult.Success? {
        // 읽기 실패도 "캐시 없음"이다 — 저장소 오류로 화면이 죽으면 안 된다.
        val entry = try {
            lastGood?.load(LastGoodStore.KIND_STATUS, key)
        } catch (_: IOException) {
            null
        } ?: return null
        return runCatching {
            json.decodeFromString<StatusResponseDto>(entry.payload)
                .takeIf { it.schemaVersion == "1" }
                ?.toDomain(cachedAt = Instant.ofEpochMilli(entry.savedAt))
        }.getOrNull()
    }

    /** 시설을 직접 고른 사용자와 시군 기본 저수지를 보는 사용자의 저장본을 섞지 않는다. */
    private fun cacheKey(sigunCode: String, facCode: String?): String =
        if (facCode.isNullOrBlank()) sigunCode else "$sigunCode:$facCode"

    private fun StatusResponseDto.toDomain(cachedAt: Instant?) = StatusResult.Success(
        sigunCode = sigunCode,
        sigunName = sigunName,
        reservoir = ReservoirStatus(
            facCode = reservoir.facCode,
            name = reservoir.name,
            rate = reservoir.rate,
            waterLevel = reservoir.waterLevel,
            observedOn = reservoir.observedOn,
            rateHistory = reservoir.rateHistory.map {
                ReservoirRatePoint(observedOn = it.observedOn, rate = it.rate)
            },
        ),
        region = RegionStatus(
            observedOn = region.observedOn,
            regionalRate = region.regionalRate,
            normalRate = region.normalRate,
            avgRatio = region.avgRatio,
            officialStage = DroughtStage(
                code = region.officialStage.code,
                label = region.officialStage.label,
            ),
            // 서버가 확정한 출처 구분 — 클라이언트가 다시 판정하지 않는다.
            isEstimate = region.basis == "estimate",
            estimate = region.estimate?.let {
                RegionEstimate(
                    maePp = it.maePp,
                    reservoirCount = it.reservoirCount,
                    capacityRatio = it.capacityRatio,
                )
            },
        ),
        highWaterNotice = highWaterNotice,
        yearlyPosition = yearlyPosition?.let {
            YearlyPosition(
                year = it.year,
                percentile = it.percentile.roundToInt(),
                bucket = it.bucket,
                min = it.min,
                max = it.max,
            )
        },
        stageBands = stageBands?.map {
            StageBand(code = it.code, label = it.label, minRatio = it.minRatio)
        },
        asOf = Instant.parse(asOf),
        sources = sources,
        stale = stale,
        cachedAt = cachedAt,
    )

    private fun invalid() =
        StatusResult.Failure(
            code = InvalidResponseFailure.code,
            message = InvalidResponseFailure.message,
            retryable = InvalidResponseFailure.retryable,
        )
}
