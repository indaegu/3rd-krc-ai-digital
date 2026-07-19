package com.mulsigye.app.feature.health.data

import com.mulsigye.app.core.network.ApiErrorDto
import com.mulsigye.app.feature.health.data.remote.HealthApi
import com.mulsigye.app.feature.health.domain.HealthRepository
import com.mulsigye.app.feature.health.domain.HealthResult
import java.io.IOException
import java.time.Instant
import java.time.format.DateTimeParseException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

class DefaultHealthRepository(
    private val api: HealthApi,
    private val json: Json,
) : HealthRepository {
    override suspend fun load(): HealthResult =
        try {
            val response = api.getHealth()
            val body = response.body()

            if (response.isSuccessful && body != null) {
                if (
                    body.schemaVersion != "1" ||
                    body.service != "mulsigye-api" ||
                    body.status != "ok"
                ) {
                    invalidResponse()
                } else {
                    HealthResult.Success(
                        asOf = Instant.parse(body.asOf),
                        sources = body.sources,
                        stale = body.stale,
                    )
                }
            } else {
                val error = response.errorBody()?.string()?.let {
                    runCatching { json.decodeFromString<ApiErrorDto>(it) }.getOrNull()
                }
                HealthResult.Failure(
                    code = error?.code ?: "SERVICE_UNAVAILABLE",
                    message = error?.message ?: "잠시 후 다시 시도해 주세요.",
                    retryable = error?.retryable ?: true,
                )
            }
        } catch (_: IOException) {
            HealthResult.Failure(
                code = "NETWORK_UNAVAILABLE",
                message = "인터넷 연결을 확인해 주세요.",
                retryable = true,
            )
        } catch (_: SerializationException) {
            invalidResponse()
        } catch (_: DateTimeParseException) {
            invalidResponse()
        }

    private fun invalidResponse() =
        HealthResult.Failure(
            code = "INVALID_RESPONSE",
            message = "받은 정보를 확인하지 못했어요.",
            retryable = true,
        )
}
