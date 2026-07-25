package com.mulsigye.app.feature.forecast.data

import com.mulsigye.app.core.testing.Fixtures
import com.mulsigye.app.feature.forecast.data.remote.ForecastResponseDto
import com.mulsigye.app.feature.forecast.data.remote.ForecastStageGuideDto
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ForecastResponseDtoTest {
    private val json = Json {
        ignoreUnknownKeys = false
        explicitNulls = false
    }

    @Test
    fun decodesWatchFixtureWithReachAndOfficialOutlook() {
        val d = json.decodeFromString<ForecastResponseDto>(Fixtures.read("forecast.watch.json"))
        assertEquals("46170", d.sigunCode)
        assertEquals(68.0, d.basis.avgRatio, 0.0)
        assertEquals("watch", d.basis.officialStage.code)
        assertEquals(30, d.history.size)
        assertEquals(14, d.forecast.size)
        // 밴드 low/high는 서버 값 그대로.
        assertEquals(67.8, d.forecast[0].low, 0.0)
        assertEquals(68.0, d.forecast[0].high, 0.0)
        assertEquals("falling", d.trend.bucket)
        assertEquals(18, d.reach.days)
        assertEquals("care", d.reach.targetStage?.code)
        assertEquals("naive", d.model.name)
        assertEquals(1.9168, d.model.mae7, 0.0)
        assertEquals(2.8337, d.model.mae14, 0.0)
        assertEquals("watch", d.officialOutlook?.current?.code)
        assertEquals("care", d.officialOutlook?.outlook1m?.code)
    }

    @Test
    fun decodesStableFixtureWithNullReachAndOutlook() {
        val d = json.decodeFromString<ForecastResponseDto>(Fixtures.read("forecast.stable.json"))
        assertNull(d.reach.days)
        assertEquals("none", d.reach.bucket)
        assertNull(d.reach.targetStage)
        assertNull(d.officialOutlook)
        assertTrue(d.trend.dailyDelta > 0)
    }

    @Test
    fun stageGuideDefaultsToNullWhenAbsentFromPayload() {
        // 구 페이로드(stageGuide 없음)도 디코드되어야 한다(선택 필드).
        val d = json.decodeFromString<ForecastResponseDto>(Fixtures.read("forecast.watch.json"))
        assertNull(d.stageGuide)
    }

    @Test
    fun decodesStageGuideEntryShape() {
        val entry = json.decodeFromString<ForecastStageGuideDto>(
            """{"code":"ok","label":"정상","actions":["a1","a2","a3"],"current":true}""",
        )
        assertEquals("ok", entry.code)
        assertEquals("정상", entry.label)
        assertEquals(3, entry.actions.size)
        assertTrue(entry.current)
    }

    @Test
    fun decodesFourDemoStatesWithExpectedBasisAvgRatio() {
        val expected = mapOf(
            "forecast.normal.json" to 103.0,
            "forecast.watch.json" to 68.0,
            "forecast.severe.json" to 46.0,
            "forecast.flood.json" to 118.0,
        )
        expected.forEach { (fixture, avgRatio) ->
            val d = json.decodeFromString<ForecastResponseDto>(Fixtures.read(fixture))
            assertEquals(fixture, avgRatio, d.basis.avgRatio, 0.0)
            assertEquals(fixture, 14, d.forecast.size)
        }
    }
}
