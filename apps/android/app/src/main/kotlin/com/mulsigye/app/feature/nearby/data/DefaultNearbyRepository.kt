package com.mulsigye.app.feature.nearby.data

import com.mulsigye.app.core.network.InvalidResponseFailure
import com.mulsigye.app.core.network.NetworkFailure
import com.mulsigye.app.core.network.toApiFailure
import com.mulsigye.app.feature.nearby.data.remote.NearbyApi
import com.mulsigye.app.feature.nearby.domain.NearbyRegion
import com.mulsigye.app.feature.nearby.domain.NearbyRepository
import com.mulsigye.app.feature.nearby.domain.NearbyResult
import java.io.IOException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

class DefaultNearbyRepository(
    private val api: NearbyApi,
    private val json: Json,
) : NearbyRepository {

    override suspend fun load(sigunCode: String): NearbyResult =
        try {
            val response = api.getNearby(sigunCode)
            val body = response.body()
            if (response.isSuccessful && body != null) {
                if (body.schemaVersion != "1") {
                    invalid()
                } else {
                    NearbyResult.Success(
                        sidoName = body.sidoName,
                        asOf = body.asOf,
                        // 서버 순서(가뭄 심한 순)를 그대로 옮긴다 — Android는 재정렬하지 않는다.
                        regions = body.regions.map {
                            NearbyRegion(
                                sigunCode = it.sigunCode,
                                sigunName = it.sigunName,
                                avgRatio = it.avgRatio,
                                stageCode = it.stageCode,
                                current = it.current,
                            )
                        },
                        stale = body.stale,
                        sources = body.sources,
                    )
                }
            } else {
                response.toApiFailure(json).let {
                    NearbyResult.Failure(it.code, it.message, it.retryable)
                }
            }
        } catch (_: IOException) {
            NetworkFailure.let { NearbyResult.Failure(it.code, it.message, it.retryable) }
        } catch (_: SerializationException) {
            invalid()
        }

    private fun invalid() =
        NearbyResult.Failure(
            code = InvalidResponseFailure.code,
            message = InvalidResponseFailure.message,
            retryable = InvalidResponseFailure.retryable,
        )
}
