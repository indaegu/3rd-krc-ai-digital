package com.mulsigye.app.feature.status.data

import com.mulsigye.app.core.network.ApiClient
import com.mulsigye.app.core.testing.Fixtures
import com.mulsigye.app.feature.status.data.remote.StatusApi
import com.mulsigye.app.feature.status.domain.StatusResult
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class DefaultStatusRepositoryTest {
    private lateinit var server: MockWebServer
    private lateinit var repository: DefaultStatusRepository

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val json = Json {
            ignoreUnknownKeys = false
            explicitNulls = false
        }
        val api = ApiClient.create(server.url("/").toString(), json).create(StatusApi::class.java)
        repository = DefaultStatusRepository(api, json)
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun enqueue(code: Int, body: String) {
        server.enqueue(
            MockResponse().setResponseCode(code)
                .setHeader("Content-Type", "application/json")
                .setBody(body),
        )
    }

    @Test
    fun mapsFreshSuccessWithoutChangingServerValues() = runTest {
        enqueue(200, Fixtures.read("status.ok.json"))
        val r = repository.load("44230") as StatusResult.Success
        assertEquals("44230", r.sigunCode)
        assertEquals("논산시", r.sigunName)
        assertEquals(87.5, r.reservoir.rate!!, 0.0)
        assertEquals(93.5, r.region.avgRatio, 0.0)
        assertEquals("ok", r.region.officialStage.code)
        assertFalse(r.highWaterNotice)
        assertEquals("2026-07-21T00:00:00Z", r.asOf.toString())
        assertFalse(r.stale)
    }

    @Test
    fun preservesStaleFlagAndNullReservoirValues() = runTest {
        enqueue(200, Fixtures.read("status.stale.json"))
        val r = repository.load("46170") as StatusResult.Success
        assertTrue(r.stale)
        assertNull(r.reservoir.rate)
        assertNull(r.reservoir.observedOn)
    }

    @Test
    fun preservesServerHighWaterNotice() = runTest {
        enqueue(200, Fixtures.read("status.flood.json"))
        val r = repository.load("26710") as StatusResult.Success
        assertTrue(r.highWaterNotice)
    }

    @Test
    fun mapsNonRetryable400() = runTest {
        enqueue(400, """{"code":"BAD_REQUEST","message":"시군 코드를 확인해요.","retryable":false}""")
        val r = repository.load("x") as StatusResult.Failure
        assertEquals("BAD_REQUEST", r.code)
        assertFalse(r.retryable)
    }

    @Test
    fun mapsNonRetryable404() = runTest {
        enqueue(404, """{"code":"NOT_FOUND","message":"준비 중인 지역이에요.","retryable":false}""")
        val r = repository.load("00000") as StatusResult.Failure
        assertEquals("NOT_FOUND", r.code)
        assertFalse(r.retryable)
    }

    @Test
    fun mapsRetryable503() = runTest {
        enqueue(503, """{"code":"SERVICE_UNAVAILABLE","message":"잠시 후 다시 시도해요.","retryable":true}""")
        val r = repository.load("44230") as StatusResult.Failure
        assertEquals("SERVICE_UNAVAILABLE", r.code)
        assertTrue(r.retryable)
    }

    @Test
    fun mapsMalformedJsonAsInvalidResponse() = runTest {
        enqueue(200, """{"schemaVersion":"1","sigunCode":"44230"}""")
        val r = repository.load("44230") as StatusResult.Failure
        assertEquals("INVALID_RESPONSE", r.code)
    }

    @Test
    fun mapsNetworkErrorWhenServerDown() = runTest {
        server.shutdown()
        val r = repository.load("44230") as StatusResult.Failure
        assertEquals("NETWORK_UNAVAILABLE", r.code)
        assertTrue(r.retryable)
    }
}
