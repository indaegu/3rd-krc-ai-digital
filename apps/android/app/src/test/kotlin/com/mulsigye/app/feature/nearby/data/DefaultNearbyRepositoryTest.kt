package com.mulsigye.app.feature.nearby.data

import com.mulsigye.app.core.network.ApiClient
import com.mulsigye.app.core.testing.Fixtures
import com.mulsigye.app.feature.nearby.data.remote.NearbyApi
import com.mulsigye.app.feature.nearby.domain.NearbyResult
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class DefaultNearbyRepositoryTest {
    private lateinit var server: MockWebServer
    private lateinit var repository: DefaultNearbyRepository

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val json = Json {
            ignoreUnknownKeys = false
            explicitNulls = false
        }
        val api = ApiClient.create(server.url("/").toString(), json).create(NearbyApi::class.java)
        repository = DefaultNearbyRepository(api, json)
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
    fun mapsNearbyPreservingServerOrderAndCurrentFlag() = runTest {
        enqueue(200, Fixtures.read("nearby.json"))
        val r = repository.load("44230") as NearbyResult.Success
        assertEquals("충남", r.sidoName)
        assertEquals("2025-12-31", r.asOf)
        assertEquals(3, r.regions.size)
        // 서버 순서(가뭄 심한 순: 보령 → 당진 → 논산)를 재정렬 없이 그대로 옮긴다.
        assertEquals(listOf("보령시", "당진시", "논산시"), r.regions.map { it.sigunName })
        assertEquals("논산시", r.regions.first { it.current }.sigunName)
        assertTrue(r.stale)
    }

    @Test
    fun mapsNonRetryable404() = runTest {
        enqueue(404, """{"code":"REGION_NOT_PREPARED","message":"준비 중인 지역이에요.","retryable":false}""")
        val r = repository.load("00000") as NearbyResult.Failure
        assertEquals("REGION_NOT_PREPARED", r.code)
        assertFalse(r.retryable)
    }

    @Test
    fun mapsRetryable503() = runTest {
        enqueue(503, """{"code":"NEARBY_UNAVAILABLE","message":"잠시 후 다시 시도해요.","retryable":true}""")
        val r = repository.load("44230") as NearbyResult.Failure
        assertTrue(r.retryable)
    }

    @Test
    fun mapsMalformedJsonAsInvalidResponse() = runTest {
        enqueue(200, """{"schemaVersion":"1","sidoName":"충남"}""")
        val r = repository.load("44230") as NearbyResult.Failure
        assertEquals("INVALID_RESPONSE", r.code)
    }

    @Test
    fun mapsNetworkErrorWhenServerDown() = runTest {
        server.shutdown()
        val r = repository.load("44230") as NearbyResult.Failure
        assertEquals("NETWORK_UNAVAILABLE", r.code)
    }
}
