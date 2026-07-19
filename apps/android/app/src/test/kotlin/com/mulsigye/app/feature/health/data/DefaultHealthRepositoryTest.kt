package com.mulsigye.app.feature.health.data

import com.mulsigye.app.core.network.ApiClient
import com.mulsigye.app.feature.health.data.remote.HealthApi
import com.mulsigye.app.feature.health.domain.HealthResult
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class DefaultHealthRepositoryTest {
    private lateinit var server: MockWebServer
    private lateinit var repository: DefaultHealthRepository

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val json = Json {
            ignoreUnknownKeys = false
            explicitNulls = false
        }
        val api = ApiClient.create(server.url("/").toString(), json)
            .create(HealthApi::class.java)
        repository = DefaultHealthRepository(api, json)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun mapsFreshSuccessWithoutChangingServerValues() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
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
        )

        val result = repository.load()

        assertTrue(result is HealthResult.Success)
        result as HealthResult.Success
        assertEquals("2026-07-19T00:00:00Z", result.asOf.toString())
        assertEquals(false, result.stale)
    }

    @Test
    fun preservesRetryableServerErrors() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(503)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    {
                      "code": "SERVICE_UNAVAILABLE",
                      "message": "잠시 후 다시 시도해 주세요.",
                      "retryable": true
                    }
                    """.trimIndent()
                )
        )

        val result = repository.load()

        assertEquals(
            HealthResult.Failure(
                code = "SERVICE_UNAVAILABLE",
                message = "잠시 후 다시 시도해 주세요.",
                retryable = true
            ),
            result
        )
    }

    @Test
    fun preservesTheServerStaleFlag() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    {
                      "schemaVersion": "1",
                      "service": "mulsigye-api",
                      "status": "ok",
                      "asOf": "2026-07-19T00:00:00.000Z",
                      "sources": ["cached-krc"],
                      "stale": true
                    }
                    """.trimIndent()
                )
        )

        val result = repository.load() as HealthResult.Success

        assertEquals(true, result.stale)
        assertEquals(listOf("cached-krc"), result.sources)
    }

    @Test
    fun rejectsMalformedSuccessJson() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"status":"ok"}""")
        )

        assertEquals(
            HealthResult.Failure(
                code = "INVALID_RESPONSE",
                message = "받은 정보를 확인하지 못했어요.",
                retryable = true
            ),
            repository.load()
        )
    }
}
