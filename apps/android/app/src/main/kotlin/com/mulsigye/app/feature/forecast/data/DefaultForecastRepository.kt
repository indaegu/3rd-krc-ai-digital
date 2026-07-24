package com.mulsigye.app.feature.forecast.data

import com.mulsigye.app.core.network.InvalidResponseFailure
import com.mulsigye.app.core.network.NetworkFailure
import com.mulsigye.app.core.network.toApiFailure
import com.mulsigye.app.feature.forecast.data.remote.ForecastApi
import com.mulsigye.app.feature.forecast.data.remote.ForecastStageDto
import com.mulsigye.app.feature.forecast.domain.ForecastBasis
import com.mulsigye.app.feature.forecast.domain.ForecastBandPoint
import com.mulsigye.app.feature.forecast.domain.ForecastModel
import com.mulsigye.app.feature.forecast.domain.ForecastPoint
import com.mulsigye.app.feature.forecast.domain.ForecastReach
import com.mulsigye.app.feature.forecast.domain.ForecastRepository
import com.mulsigye.app.feature.forecast.domain.ForecastResult
import com.mulsigye.app.feature.forecast.domain.ForecastStage
import com.mulsigye.app.feature.forecast.domain.ForecastTrend
import com.mulsigye.app.feature.forecast.domain.OfficialOutlook
import java.io.IOException
import java.time.Instant
import java.time.format.DateTimeParseException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

class DefaultForecastRepository(
    private val api: ForecastApi,
    private val json: Json,
) : ForecastRepository {

    override suspend fun load(sigunCode: String): ForecastResult =
        try {
            val response = api.getForecast(sigunCode)
            val body = response.body()
            if (response.isSuccessful && body != null) {
                if (body.schemaVersion != "1") {
                    invalid()
                } else {
                    ForecastResult.Success(
                        sigunCode = body.sigunCode,
                        sigunName = body.sigunName,
                        basis = ForecastBasis(
                            observedOn = body.basis.observedOn,
                            avgRatio = body.basis.avgRatio,
                            officialStage = body.basis.officialStage.toDomain(),
                        ),
                        history = body.history.map { ForecastPoint(it.observedOn, it.avgRatio) },
                        forecast = body.forecast.map {
                            ForecastBandPoint(it.observedOn, it.avgRatio, it.low, it.high)
                        },
                        trend = ForecastTrend(body.trend.dailyDelta, body.trend.bucket),
                        reach = ForecastReach(
                            days = body.reach.days,
                            bucket = body.reach.bucket,
                            targetStage = body.reach.targetStage?.toDomain(),
                        ),
                        model = ForecastModel(
                            name = body.model.name,
                            version = body.model.version,
                            mae7 = body.model.mae7,
                            mae14 = body.model.mae14,
                            bandMethod = body.model.bandMethod,
                        ),
                        officialOutlook = body.officialOutlook?.let {
                            OfficialOutlook(
                                publishedOn = it.publishedOn,
                                current = it.current.toDomain(),
                                outlook1m = it.outlook1m.toDomain(),
                                outlook2m = it.outlook2m.toDomain(),
                                outlook3m = it.outlook3m.toDomain(),
                            )
                        },
                        asOf = Instant.parse(body.asOf),
                        sources = body.sources,
                        stale = body.stale,
                    )
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

    private fun ForecastStageDto.toDomain() = ForecastStage(code = code, label = label)

    private fun invalid() =
        ForecastResult.Failure(
            code = InvalidResponseFailure.code,
            message = InvalidResponseFailure.message,
            retryable = InvalidResponseFailure.retryable,
        )
}
