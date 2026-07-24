package com.mulsigye.app.feature.nearby.data

import com.mulsigye.app.core.testing.Fixtures
import com.mulsigye.app.feature.nearby.data.remote.NearbyResponseDto
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NearbyResponseDtoTest {
    private val json = Json {
        ignoreUnknownKeys = false
        explicitNulls = false
    }

    @Test
    fun decodesNearbyFixture() {
        val d = json.decodeFromString<NearbyResponseDto>(Fixtures.read("nearby.json"))
        assertEquals("1", d.schemaVersion)
        assertEquals("충남", d.sidoName)
        assertEquals("2025-12-31", d.asOf)
        assertEquals(3, d.regions.size)
        // 서버가 준 순서(가뭄 심한 순)를 그대로 보존한다.
        assertEquals("보령시", d.regions[0].sigunName)
        assertEquals("alert", d.regions[0].stageCode)
        assertEquals(112.7, d.regions[2].avgRatio, 0.0001)
        assertTrue(d.regions[2].current)
        assertTrue(d.stale)
    }

    @Test
    fun tolerantDecodeIgnoresUnknownKeys() {
        // 필드가 추가된 미래 v1 페이로드(additive)를 무시하고 디코딩된다.
        val tolerant = Json { ignoreUnknownKeys = true; explicitNulls = false }
        val body = """
            {"schemaVersion":"1","sidoName":"충남","asOf":"2025-12-31",
             "regions":[{"sigunCode":"44230","sigunName":"논산시","avgRatio":112.7,
             "stageCode":"ok","current":true,"futureField":"x"}],
             "stale":true,"sources":["커밋 스냅샷(기준 2025-12-31)"],"newTopLevel":1}
        """.trimIndent()
        val d = tolerant.decodeFromString<NearbyResponseDto>(body)
        assertEquals(1, d.regions.size)
        assertEquals("논산시", d.regions[0].sigunName)
    }
}
