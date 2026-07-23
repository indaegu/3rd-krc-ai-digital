package com.mulsigye.app.feature.status.data

import com.mulsigye.app.core.testing.Fixtures
import com.mulsigye.app.feature.status.data.remote.StatusResponseDto
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class StatusResponseDtoTest {
    private val json = Json {
        ignoreUnknownKeys = false
        explicitNulls = false
    }

    @Test
    fun decodesOkFixtureWithoutChangingValues() {
        val d = json.decodeFromString<StatusResponseDto>(Fixtures.read("status.ok.json"))
        assertEquals("44230", d.sigunCode)
        assertEquals(87.5, d.reservoir.rate!!, 0.0)
        assertEquals(93.5, d.region.avgRatio, 0.0)
        assertEquals("ok", d.region.officialStage.code)
        assertEquals("정상", d.region.officialStage.label)
        assertEquals(false, d.highWaterNotice)
        assertEquals(false, d.stale)
    }

    @Test
    fun decodesStaleFixtureWithNullReservoirValues() {
        val d = json.decodeFromString<StatusResponseDto>(Fixtures.read("status.stale.json"))
        assertNull(d.reservoir.rate)
        assertNull(d.reservoir.waterLevel)
        assertNull(d.reservoir.observedOn)
        assertEquals(140.1, d.region.avgRatio, 0.0)
        assertTrue(d.stale)
    }

    @Test
    fun decodesFourDemoStatesWithExpectedRateAndAvgRatio() {
        val expected = mapOf(
            "status.normal.json" to Pair(84.0, 103.0),
            "status.watch.json" to Pair(57.0, 68.0),
            "status.severe.json" to Pair(33.0, 46.0),
            "status.flood.json" to Pair(96.0, 118.0),
        )
        expected.forEach { (fixture, values) ->
            val d = json.decodeFromString<StatusResponseDto>(Fixtures.read(fixture))
            assertEquals(fixture, values.first, d.reservoir.rate!!, 0.0)
            assertEquals(fixture, values.second, d.region.avgRatio, 0.0)
        }
    }

    @Test
    fun floodDemoCarriesServerHighWaterNotice() {
        val d = json.decodeFromString<StatusResponseDto>(Fixtures.read("status.flood.json"))
        assertTrue(d.highWaterNotice)
    }
}
