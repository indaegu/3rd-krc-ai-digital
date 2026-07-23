package com.mulsigye.app.feature.region.data

import com.mulsigye.app.core.testing.Fixtures
import com.mulsigye.app.feature.region.data.remote.RegionResolveResponseDto
import com.mulsigye.app.feature.region.data.remote.RegionSearchResponseDto
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RegionResponseDtoTest {
    private val json = Json {
        ignoreUnknownKeys = false
        explicitNulls = false
    }

    @Test
    fun decodesSearchFixture() {
        val decoded = json.decodeFromString<RegionSearchResponseDto>(
            Fixtures.read("regions-search.ok.json"),
        )
        assertEquals("1", decoded.schemaVersion)
        assertEquals(1, decoded.candidates.size)
        assertEquals("1217010200", decoded.candidates[0].admCd)
        assertEquals("4617010200", decoded.candidates[0].legalCode)
        assertEquals(false, decoded.stale)
    }

    @Test
    fun decodesResolvePreparedFixture() {
        val decoded = json.decodeFromString<RegionResolveResponseDto>(
            Fixtures.read("regions-resolve.ok.json"),
        )
        assertEquals("44230", decoded.sigunCode)
        assertEquals("논산시", decoded.sigunName)
        assertTrue(decoded.prepared)
        assertEquals("4423010045", decoded.reservoir?.facCode)
        assertEquals("탑정", decoded.reservoir?.name)
    }

    @Test
    fun decodesResolveNotReadyWithNullFields() {
        val decoded = json.decodeFromString<RegionResolveResponseDto>(
            Fixtures.read("regions-resolve.not-ready.json"),
        )
        assertEquals("27260", decoded.sigunCode)
        assertNull(decoded.sigunName)
        assertEquals(false, decoded.prepared)
        assertNull(decoded.reservoir)
    }
}
