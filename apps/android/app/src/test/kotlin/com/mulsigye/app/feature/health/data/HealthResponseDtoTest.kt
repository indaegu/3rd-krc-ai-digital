package com.mulsigye.app.feature.health.data

import com.mulsigye.app.feature.health.data.remote.HealthResponseDto
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class HealthResponseDtoTest {
    private val json = Json {
        ignoreUnknownKeys = false
        explicitNulls = false
    }

    @Test
    fun decodesTheSharedOpenApiFixture() {
        val decoded = json.decodeFromString<HealthResponseDto>(
            """
            {
              "schemaVersion": "1",
              "service": "mulsigye-api",
              "status": "ok",
              "asOf": "2026-07-19T00:00:00.000Z",
              "sources": [],
              "stale": false
            }
            """.trimIndent()
        )

        assertEquals("1", decoded.schemaVersion)
        assertEquals("mulsigye-api", decoded.service)
        assertEquals(false, decoded.stale)
    }
}
