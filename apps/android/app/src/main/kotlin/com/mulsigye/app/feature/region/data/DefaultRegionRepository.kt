package com.mulsigye.app.feature.region.data

import com.mulsigye.app.core.network.InvalidResponseFailure
import com.mulsigye.app.core.network.NetworkFailure
import com.mulsigye.app.core.network.toApiFailure
import com.mulsigye.app.feature.region.data.remote.RegionApi
import com.mulsigye.app.feature.region.data.remote.RegionResolveRequestDto
import com.mulsigye.app.feature.region.domain.RegionCandidate
import com.mulsigye.app.feature.region.domain.RegionRepository
import com.mulsigye.app.feature.region.domain.RegionResolveResult
import com.mulsigye.app.feature.region.domain.RegionSearchResult
import com.mulsigye.app.feature.region.domain.RepresentativeReservoir
import com.mulsigye.app.feature.region.domain.ReservoirHit
import com.mulsigye.app.feature.region.domain.ReservoirSearchResult
import java.io.IOException
import java.time.Instant
import java.time.format.DateTimeParseException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

class DefaultRegionRepository(
    private val api: RegionApi,
    private val json: Json,
) : RegionRepository {

    override suspend fun search(query: String): RegionSearchResult =
        try {
            val response = api.searchRegions(query)
            val body = response.body()
            if (response.isSuccessful && body != null) {
                if (body.schemaVersion != "1") {
                    InvalidResponseFailure.toSearchFailure()
                } else {
                    RegionSearchResult.Success(
                        candidates = body.candidates.map {
                            RegionCandidate(label = it.label, admCd = it.admCd, legalCode = it.legalCode)
                        },
                        asOf = Instant.parse(body.asOf),
                        sources = body.sources,
                        stale = body.stale,
                    )
                }
            } else {
                response.toApiFailure(json).toSearchFailure()
            }
        } catch (_: IOException) {
            NetworkFailure.toSearchFailure()
        } catch (_: SerializationException) {
            InvalidResponseFailure.toSearchFailure()
        } catch (_: DateTimeParseException) {
            InvalidResponseFailure.toSearchFailure()
        }

    override suspend fun resolve(
        admCd: String,
        legalCode: String,
        emdNm: String?,
        liNm: String?,
        facCode: String?,
    ): RegionResolveResult =
        try {
            // 빈 문자열은 보내지 않는다 — 서버가 "없음"과 구분할 필요가 없게 null로 넘긴다.
            val response = api.resolveRegion(
                RegionResolveRequestDto(
                    admCd = admCd,
                    legalCode = legalCode,
                    emdNm = emdNm?.takeIf { it.isNotBlank() },
                    liNm = liNm?.takeIf { it.isNotBlank() },
                    facCode = facCode?.takeIf { it.isNotBlank() },
                ),
            )
            val body = response.body()
            if (response.isSuccessful && body != null) {
                if (body.schemaVersion != "1") {
                    InvalidResponseFailure.toResolveFailure()
                } else {
                    RegionResolveResult.Success(
                        sigunCode = body.sigunCode,
                        sigunName = body.sigunName,
                        prepared = body.prepared,
                        reservoir = body.reservoir?.let {
                            RepresentativeReservoir(facCode = it.facCode, name = it.name)
                        },
                        asOf = Instant.parse(body.asOf),
                        sources = body.sources,
                        stale = body.stale,
                    )
                }
            } else {
                response.toApiFailure(json).toResolveFailure()
            }
        } catch (_: IOException) {
            NetworkFailure.toResolveFailure()
        } catch (_: SerializationException) {
            InvalidResponseFailure.toResolveFailure()
        } catch (_: DateTimeParseException) {
            InvalidResponseFailure.toResolveFailure()
        }

    override suspend fun searchReservoirs(query: String): ReservoirSearchResult =
        try {
            val response = api.searchReservoirs(query)
            val body = response.body()
            if (response.isSuccessful && body != null) {
                if (body.schemaVersion != "1") {
                    InvalidResponseFailure.toReservoirFailure()
                } else {
                    ReservoirSearchResult.Success(
                        reservoirs = body.reservoirs.map {
                            ReservoirHit(
                                facCode = it.facCode,
                                name = it.name,
                                address = it.address,
                                sigunCode = it.sigunCode,
                                sigunName = it.sigunName,
                                prepared = it.prepared,
                            )
                        },
                    )
                }
            } else {
                response.toApiFailure(json).toReservoirFailure()
            }
        } catch (_: IOException) {
            NetworkFailure.toReservoirFailure()
        } catch (_: SerializationException) {
            InvalidResponseFailure.toReservoirFailure()
        }
}

private fun com.mulsigye.app.core.network.ApiFailure.toSearchFailure() =
    RegionSearchResult.Failure(code = code, message = message, retryable = retryable)

private fun com.mulsigye.app.core.network.ApiFailure.toResolveFailure() =
    RegionResolveResult.Failure(code = code, message = message, retryable = retryable)

private fun com.mulsigye.app.core.network.ApiFailure.toReservoirFailure() =
    ReservoirSearchResult.Failure(code = code, message = message, retryable = retryable)
