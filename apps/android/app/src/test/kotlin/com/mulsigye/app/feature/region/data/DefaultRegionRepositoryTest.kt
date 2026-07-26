package com.mulsigye.app.feature.region.data

import com.mulsigye.app.core.network.ApiClient
import com.mulsigye.app.core.testing.Fixtures
import com.mulsigye.app.feature.region.data.remote.RegionApi
import com.mulsigye.app.feature.region.domain.RegionResolveResult
import com.mulsigye.app.feature.region.domain.RegionSearchResult
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

class DefaultRegionRepositoryTest {
    private lateinit var server: MockWebServer
    private lateinit var repository: DefaultRegionRepository

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val json = Json {
            ignoreUnknownKeys = false
            explicitNulls = false
        }
        val api = ApiClient.create(server.url("/").toString(), json).create(RegionApi::class.java)
        repository = DefaultRegionRepository(api, json)
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
    fun searchMapsCandidates() = runTest {
        enqueue(200, Fixtures.read("regions-search.ok.json"))
        val result = repository.search("나주") as RegionSearchResult.Success
        assertEquals(1, result.candidates.size)
        assertEquals("1217010200", result.candidates[0].admCd)
        assertFalse(result.stale)
    }

    // 이 매핑이 빠지면 resolve가 시군 단위로만 좁혀 "제주시 어디든 상대 저수지" 문제로 돌아간다.
    @Test
    fun searchCarriesEmdAndLiForNarrowing() = runTest {
        enqueue(200, Fixtures.read("regions-search.ok.json"))
        val result = repository.search("나주") as RegionSearchResult.Success
        assertEquals("송월동", result.candidates[0].emdNm)
        assertEquals("", result.candidates[0].liNm)
    }

    @Test
    fun resolveSendsEmdLiAndFacCodeInBody() = runTest {
        enqueue(200, Fixtures.read("regions-resolve.ok.json"))
        repository.resolve(
            admCd = "5011025924",
            legalCode = "5011025924",
            emdNm = "조천읍",
            liNm = "함덕리",
            facCode = "5011010007",
        )
        val body = server.takeRequest().body.readUtf8()
        assertTrue(body.contains("조천읍"))
        assertTrue(body.contains("함덕리"))
        assertTrue(body.contains("5011010007"))
    }

    @Test
    fun resolveOmitsBlankLocalityFromBody() = runTest {
        enqueue(200, Fixtures.read("regions-resolve.ok.json"))
        // 빈 문자열은 보내지 않는다 — 서버가 "없음"과 구분할 필요가 없다.
        repository.resolve(admCd = "4617010200", legalCode = "4617010200", emdNm = "", liNm = "")
        val body = server.takeRequest().body.readUtf8()
        assertFalse(body.contains("emdNm"))
        assertFalse(body.contains("liNm"))
    }

    @Test
    fun searchMapsRetryable503() = runTest {
        enqueue(503, """{"code":"SERVICE_UNAVAILABLE","message":"주소 검색을 잠시 쉬어요.","retryable":true}""")
        val result = repository.search("나주") as RegionSearchResult.Failure
        assertEquals("SERVICE_UNAVAILABLE", result.code)
        assertTrue(result.retryable)
    }

    @Test
    fun searchMapsNonRetryable400() = runTest {
        enqueue(400, """{"code":"BAD_REQUEST","message":"검색어를 입력해요.","retryable":false}""")
        val result = repository.search("") as RegionSearchResult.Failure
        assertEquals("BAD_REQUEST", result.code)
        assertFalse(result.retryable)
    }

    @Test
    fun resolveMapsPreparedRegion() = runTest {
        enqueue(200, Fixtures.read("regions-resolve.ok.json"))
        val result = repository.resolve("1217010200", "4423010045") as RegionResolveResult.Success
        assertEquals("44230", result.sigunCode)
        assertTrue(result.prepared)
        assertEquals("탑정", result.reservoir?.name)
    }

    @Test
    fun resolveMapsNotReadyRegionAsSuccess() = runTest {
        enqueue(200, Fixtures.read("regions-resolve.not-ready.json"))
        val result = repository.resolve("1234500000", "1234500000") as RegionResolveResult.Success
        assertFalse(result.prepared)
        assertNull(result.sigunName)
        assertNull(result.reservoir)
    }

    @Test
    fun resolveMaps400() = runTest {
        enqueue(400, """{"code":"BAD_REQUEST","message":"주소 코드가 없어요.","retryable":false}""")
        val result = repository.resolve("x", "y") as RegionResolveResult.Failure
        assertEquals("BAD_REQUEST", result.code)
        assertFalse(result.retryable)
    }

    @Test
    fun resolveMapsMalformedJsonAsInvalidResponse() = runTest {
        enqueue(200, """{"schemaVersion":"1"}""")
        val result = repository.resolve("1217010200", "4423010045") as RegionResolveResult.Failure
        assertEquals("INVALID_RESPONSE", result.code)
    }

    @Test
    fun searchMapsNetworkErrorWhenServerDown() = runTest {
        server.shutdown()
        val result = repository.search("나주") as RegionSearchResult.Failure
        assertEquals("NETWORK_UNAVAILABLE", result.code)
        assertTrue(result.retryable)
    }
}
