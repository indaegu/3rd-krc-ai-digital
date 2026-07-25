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
    private lateinit var api: CoachApi
    private lateinit var json: Json
    private lateinit var repository: DefaultCoachRepository

    // 캐시 TTL 판정을 결정론적으로 검증하기 위한 주입형 시계.
    private var now = 0L

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        json = Json {
            ignoreUnknownKeys = false
            explicitNulls = false
        }
        api = ApiClient.create(server.url("/").toString(), json).create(CoachApi::class.java)
        repository = DefaultCoachRepository(api, json)
    }

    /** now 시계를 쓰는 캐시로 감싼 저장소(TTL 테스트용). */
    private fun cachingRepository() =
        DefaultCoachRepository(api, json, CoachCache(clock = { now }))

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

    @Test
    fun cacheHitWithinTtlReturnsCachedWithoutNetwork() = runTest {
        val repo = cachingRepository()
        enqueue(200, Fixtures.read("coach.static.json"))

        val first = repo.load("44230") as CoachResult.Success
        now += CoachCache.TTL_MILLIS - 1 // TTL 이내
        val second = repo.load("44230") as CoachResult.Success

        assertEquals("static", second.mode)
        assertEquals(first, second)
        // 두 번째는 캐시 히트라 네트워크를 다시 부르지 않는다(요청 1회).
        assertEquals(1, server.requestCount)
    }

    @Test
    fun cacheRefetchesPastTtl() = runTest {
        val repo = cachingRepository()
        enqueue(200, Fixtures.read("coach.static.json"))
        enqueue(200, Fixtures.read("coach.static.json"))

        repo.load("44230") as CoachResult.Success
        now += CoachCache.TTL_MILLIS // TTL 경과
        repo.load("44230") as CoachResult.Success

        assertEquals(2, server.requestCount)
    }

    @Test
    fun forceRefreshAlwaysRefetchesWithinTtl() = runTest {
        val repo = cachingRepository()
        enqueue(200, Fixtures.read("coach.static.json"))
        enqueue(200, Fixtures.read("coach.static.json"))

        repo.load("44230") as CoachResult.Success
        // TTL 이내여도 forceRefresh면 다시 페치한다.
        repo.load("44230", forceRefresh = true) as CoachResult.Success

        assertEquals(2, server.requestCount)
    }

    @Test
    fun errorsAreNotCached() = runTest {
        val repo = cachingRepository()
        enqueue(503, """{"code":"SERVICE_UNAVAILABLE","message":"잠시 후 다시 시도해요.","retryable":true}""")
        enqueue(200, Fixtures.read("coach.static.json"))

        repo.load("44230") as CoachResult.Failure
        // 실패는 캐시되지 않으므로 다음 로드는 다시 네트워크를 부른다.
        val second = repo.load("44230") as CoachResult.Success

        assertEquals("static", second.mode)
        assertEquals(2, server.requestCount)
    }
}
