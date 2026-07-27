package com.mulsigye.app.feature.forecast.data

import com.mulsigye.app.core.network.ApiClient
import com.mulsigye.app.core.storage.LastGoodStore
import com.mulsigye.app.core.testing.FailingPreferencesDataStore
import com.mulsigye.app.core.testing.Fixtures
import com.mulsigye.app.core.testing.InMemoryPreferencesDataStore
import com.mulsigye.app.feature.forecast.data.remote.ForecastApi
import com.mulsigye.app.feature.forecast.domain.ForecastResult
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

/** 저장 시각 고정값. status 쪽 테스트와 같은 기준을 쓴다. */
private const val CACHED_AT_MILLIS = 1_753_056_000_000L

class DefaultForecastRepositoryTest {
    private lateinit var server: MockWebServer
    private lateinit var repository: DefaultForecastRepository

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val json = Json {
            ignoreUnknownKeys = false
            explicitNulls = false
        }
        val api = ApiClient.create(server.url("/").toString(), json).create(ForecastApi::class.java)
        repository = DefaultForecastRepository(
            api,
            json,
            LastGoodStore(InMemoryPreferencesDataStore(), clock = { CACHED_AT_MILLIS }),
        )
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
    fun mapsForecastPreservingBandsReachAndModel() = runTest {
        enqueue(200, Fixtures.read("forecast.watch.json"))
        val r = repository.load("46170") as ForecastResult.Success
        assertEquals(30, r.history.size)
        assertEquals(14, r.forecast.size)
        assertEquals(67.8, r.forecast[0].low, 0.0)
        assertEquals(68.0, r.forecast[0].high, 0.0)
        assertEquals(18, r.reach.days)
        assertEquals("care", r.reach.targetStage?.code)
        assertEquals(1.9168, r.model.mae7, 0.0)
        assertEquals(2.8337, r.model.mae14, 0.0)
        assertEquals("watch", r.officialOutlook?.current?.code)
        assertFalse(r.stale)
    }

    @Test
    fun mapsStableForecastWithNullReachAndOutlook() = runTest {
        enqueue(200, Fixtures.read("forecast.stable.json"))
        val r = repository.load("46170") as ForecastResult.Success
        assertNull(r.reach.days)
        assertNull(r.reach.targetStage)
        assertNull(r.officialOutlook)
    }

    @Test
    fun mapsNonRetryable400() = runTest {
        enqueue(400, """{"code":"BAD_REQUEST","message":"시군 코드를 확인해요.","retryable":false}""")
        val r = repository.load("x") as ForecastResult.Failure
        assertEquals("BAD_REQUEST", r.code)
        assertFalse(r.retryable)
    }

    @Test
    fun mapsNonRetryable404() = runTest {
        enqueue(404, """{"code":"NOT_FOUND","message":"준비 중인 지역이에요.","retryable":false}""")
        val r = repository.load("00000") as ForecastResult.Failure
        assertEquals("NOT_FOUND", r.code)
    }

    @Test
    fun mapsRetryable503() = runTest {
        enqueue(503, """{"code":"SERVICE_UNAVAILABLE","message":"잠시 후 다시 시도해요.","retryable":true}""")
        val r = repository.load("44230") as ForecastResult.Failure
        assertTrue(r.retryable)
    }

    @Test
    fun mapsMalformedJsonAsInvalidResponse() = runTest {
        enqueue(200, """{"schemaVersion":"1","sigunCode":"44230"}""")
        val r = repository.load("44230") as ForecastResult.Failure
        assertEquals("INVALID_RESPONSE", r.code)
    }

    @Test
    fun mapsNetworkErrorWhenServerDown() = runTest {
        server.shutdown()
        val r = repository.load("44230") as ForecastResult.Failure
        assertEquals("NETWORK_UNAVAILABLE", r.code)
    }

    // 통신이 끊기면 흐름 카드도 오류로 바뀌지 않고 직전 예측을 그대로 유지한다.
    @Test
    fun fallsBackToLastGoodWhenNetworkFails() = runTest {
        enqueue(200, Fixtures.read("forecast.ok.json"))
        val fresh = repository.load("44230") as ForecastResult.Success
        assertNull(fresh.cachedAt)

        server.shutdown()
        val cached = repository.load("44230") as ForecastResult.Success

        assertEquals(fresh.basis.avgRatio, cached.basis.avgRatio, 0.0)
        assertEquals(fresh.forecast.size, cached.forecast.size)
        assertEquals(CACHED_AT_MILLIS, cached.cachedAt?.toEpochMilli())
    }

    @Test
    fun noCacheYieldsOriginalFailure() = runTest {
        server.shutdown()
        val r = repository.load("44230") as ForecastResult.Failure
        assertEquals("NETWORK_UNAVAILABLE", r.code)
    }


    // 저장소 쓰기 실패가 정상 응답을 버리면 안 된다(status와 같은 규칙).
    @Test
    fun storageFailureDoesNotDiscardFreshResponse() = runTest {
        val json = Json {
            ignoreUnknownKeys = false
            explicitNulls = false
        }
        val api = ApiClient.create(server.url("/").toString(), json).create(ForecastApi::class.java)
        val failing = DefaultForecastRepository(api, json, LastGoodStore(FailingPreferencesDataStore()))

        enqueue(200, Fixtures.read("forecast.ok.json"))
        val r = failing.load("44230") as ForecastResult.Success

        assertNull(r.cachedAt)
    }

    @Test
    fun storageReadFailureFallsBackToOriginalFailure() = runTest {
        val json = Json {
            ignoreUnknownKeys = false
            explicitNulls = false
        }
        val api = ApiClient.create(server.url("/").toString(), json).create(ForecastApi::class.java)
        val failing = DefaultForecastRepository(api, json, LastGoodStore(FailingPreferencesDataStore()))

        server.shutdown()
        val r = failing.load("44230") as ForecastResult.Failure

        assertEquals("NETWORK_UNAVAILABLE", r.code)
    }

}
