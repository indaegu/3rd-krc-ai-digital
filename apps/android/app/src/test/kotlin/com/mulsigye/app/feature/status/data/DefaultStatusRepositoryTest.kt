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
        // 프로덕션 AppContainer와 동일 설정: v1 additive 확장 견고성을 위해 unknown key 무시.
        val json = Json {
            ignoreUnknownKeys = true
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
    fun decodesUnknownAdditiveV1FieldsWithoutCrashing() = runTest {
        // 회귀 방지: v1은 호환 가능한 additive 확장(필드 추가)을 허용한다(예: highWaterNotice 추가 전례).
        // 설치형 앱이 즉시 재배포되지 않으므로, 서버가 계약에 없는 새 필드를 배포해도
        // 엄격 디코딩으로 크래시하지 않고 정상 성공 매핑되어야 한다.
        enqueue(
            200,
            """
            {
              "schemaVersion": "1",
              "sigunCode": "44230",
              "sigunName": "논산시",
              "futureTopLevelField": "x",
              "reservoir": {
                "facCode": "4423010045",
                "name": "탑정",
                "rate": 87.5,
                "waterLevel": 32.1,
                "observedOn": "2026-07-20",
                "futureReservoirField": 1
              },
              "region": {
                "observedOn": "2026-07-20",
                "regionalRate": 82.4,
                "normalRate": 88.1,
                "avgRatio": 93.5,
                "officialStage": { "code": "ok", "label": "정상" },
                "futureRegionField": true
              },
              "highWaterNotice": false,
              "asOf": "2026-07-21T00:00:00.000Z",
              "sources": ["논가뭄지도"],
              "stale": false
            }
            """.trimIndent(),
        )
        val r = repository.load("44230") as StatusResult.Success
        assertEquals(87.5, r.reservoir.rate!!, 0.0)
        assertEquals(93.5, r.region.avgRatio, 0.0)
        assertEquals("ok", r.region.officialStage.code)
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
