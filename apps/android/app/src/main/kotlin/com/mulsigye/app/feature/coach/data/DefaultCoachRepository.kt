package com.mulsigye.app.feature.coach.data

import com.mulsigye.app.core.network.InvalidResponseFailure
import com.mulsigye.app.core.network.NetworkFailure
import com.mulsigye.app.core.network.toApiFailure
import com.mulsigye.app.feature.coach.data.remote.CoachApi
import com.mulsigye.app.feature.coach.domain.CoachAction
import com.mulsigye.app.feature.coach.domain.CoachContent
import com.mulsigye.app.feature.coach.domain.CoachRepository
import com.mulsigye.app.feature.coach.domain.CoachResult
import java.io.IOException
import java.time.Instant
import java.time.format.DateTimeParseException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

class DefaultCoachRepository(
    private val api: CoachApi,
    private val json: Json,
) : CoachRepository {

    override suspend fun load(sigunCode: String): CoachResult =
        try {
            val response = api.getCoach(sigunCode)
            val body = response.body()
            if (response.isSuccessful && body != null) {
                if (body.schemaVersion != "1") {
                    invalid()
                } else {
                    CoachResult.Success(
                        mode = body.mode,
                        dataStale = body.dataStale,
                        cacheHit = body.cacheHit,
                        generatedAt = body.generatedAt,
                        promptVersion = body.promptVersion,
                        actionCatalogVersion = body.actionCatalogVersion,
                        coach = CoachContent(
                            headline = body.coach.headline,
                            summary = body.coach.summary,
                            actions = body.coach.actions.map {
                                CoachAction(id = it.id, title = it.title, reason = it.reason)
                            },
                        ),
                        fallbackReason = body.fallbackReason,
                        asOf = Instant.parse(body.asOf),
                        sources = body.sources,
                        stale = body.stale,
                    )
                }
            } else {
                response.toApiFailure(json).let {
                    CoachResult.Failure(it.code, it.message, it.retryable)
                }
            }
        } catch (_: IOException) {
            NetworkFailure.let { CoachResult.Failure(it.code, it.message, it.retryable) }
        } catch (_: SerializationException) {
            invalid()
        } catch (_: DateTimeParseException) {
            invalid()
        }

    private fun invalid() =
        CoachResult.Failure(
            code = InvalidResponseFailure.code,
            message = InvalidResponseFailure.message,
            retryable = InvalidResponseFailure.retryable,
        )
}
