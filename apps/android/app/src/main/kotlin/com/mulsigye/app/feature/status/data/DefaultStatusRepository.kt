package com.mulsigye.app.feature.status.data

import com.mulsigye.app.core.network.InvalidResponseFailure
import com.mulsigye.app.core.network.NetworkFailure
import com.mulsigye.app.core.network.toApiFailure
import com.mulsigye.app.feature.status.data.remote.StatusApi
import com.mulsigye.app.feature.status.domain.DroughtStage
import com.mulsigye.app.feature.status.domain.RegionStatus
import com.mulsigye.app.feature.status.domain.ReservoirStatus
import com.mulsigye.app.feature.status.domain.StatusRepository
import com.mulsigye.app.feature.status.domain.StatusResult
import java.io.IOException
import java.time.Instant
import java.time.format.DateTimeParseException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

class DefaultStatusRepository(
    private val api: StatusApi,
    private val json: Json,
) : StatusRepository {

    override suspend fun load(sigunCode: String): StatusResult =
        try {
            val response = api.getStatus(sigunCode)
            val body = response.body()
            if (response.isSuccessful && body != null) {
                if (body.schemaVersion != "1") {
                    invalid()
                } else {
                    StatusResult.Success(
                        sigunCode = body.sigunCode,
                        sigunName = body.sigunName,
                        reservoir = ReservoirStatus(
                            facCode = body.reservoir.facCode,
                            name = body.reservoir.name,
                            rate = body.reservoir.rate,
                            waterLevel = body.reservoir.waterLevel,
                            observedOn = body.reservoir.observedOn,
                        ),
                        region = RegionStatus(
                            observedOn = body.region.observedOn,
                            regionalRate = body.region.regionalRate,
                            normalRate = body.region.normalRate,
                            avgRatio = body.region.avgRatio,
                            officialStage = DroughtStage(
                                code = body.region.officialStage.code,
                                label = body.region.officialStage.label,
                            ),
                        ),
                        highWaterNotice = body.highWaterNotice,
                        asOf = Instant.parse(body.asOf),
                        sources = body.sources,
                        stale = body.stale,
                    )
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

    private fun invalid() =
        StatusResult.Failure(
            code = InvalidResponseFailure.code,
            message = InvalidResponseFailure.message,
            retryable = InvalidResponseFailure.retryable,
        )
}
