package com.mulsigye.app.feature.coach.data

import com.mulsigye.app.core.network.ApiClient
import com.mulsigye.app.core.testing.Fixtures
import com.mulsigye.app.feature.coach.data.remote.CoachApi
import com.mulsigye.app.feature.coach.domain.CoachResult
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

class DefaultCoachRepositoryTest {
    private lateinit var server: MockWebServer
    private lateinit var repository: DefaultCoachRepository

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val json = Json {
            ignoreUnknownKeys = false
            explicitNulls = false
        }
        val api = ApiClient.create(server.url("/").toString(), json).create(CoachApi::class.java)
        repository = DefaultCoachRepository(api, json)
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
    fun mapsStaticCoachPreservingActionsAndMode() = runTest {
        enqueue(200, Fixtures.read("coach.static.json"))
        val r = repository.load("44230") as CoachResult.Success
        assertEquals("static", r.mode)
        assertEquals("disabled", r.fallbackReason)
        assertEquals(3, r.coach.actions.size)
        assertEquals("care_save_paddy_water", r.coach.actions[0].id)
        assertFalse(r.dataStale)
        assertFalse(r.stale)
    }

    @Test
    fun preservesStaleFlags() = runTest {
        enqueue(200, Fixtures.read("coach.stale.json"))
        val r = repository.load("46170") as CoachResult.Success
        assertTrue(r.dataStale)
        assertTrue(r.stale)
    }

    @Test
    fun mapsNonRetryable404() = runTest {
        enqueue(404, """{"code":"NOT_FOUND","message":"준비 중인 지역이에요.","retryable":false}""")
        val r = repository.load("00000") as CoachResult.Failure
        assertEquals("NOT_FOUND", r.code)
        assertFalse(r.retryable)
    }

    @Test
    fun mapsRetryable503() = runTest {
        enqueue(503, """{"code":"SERVICE_UNAVAILABLE","message":"잠시 후 다시 시도해요.","retryable":true}""")
        val r = repository.load("44230") as CoachResult.Failure
        assertTrue(r.retryable)
    }

    @Test
    fun mapsMalformedJsonAsInvalidResponse() = runTest {
        enqueue(200, """{"schemaVersion":"1","mode":"static"}""")
        val r = repository.load("44230") as CoachResult.Failure
        assertEquals("INVALID_RESPONSE", r.code)
    }

    @Test
    fun mapsNetworkErrorWhenServerDown() = runTest {
        server.shutdown()
        val r = repository.load("44230") as CoachResult.Failure
        assertEquals("NETWORK_UNAVAILABLE", r.code)
    }
}
