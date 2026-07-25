package com.mulsigye.app.feature.forecast.presentation

import android.content.Context
import android.provider.Settings
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.test.core.app.ApplicationProvider
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.testing.ForecastFixtures
import com.mulsigye.app.core.testing.RobolectricComposeTest
import com.mulsigye.app.feature.forecast.domain.ForecastBandPoint
import com.mulsigye.app.feature.forecast.domain.ForecastPoint
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * 흐름 차트 좌표 계산(순수 함수)과 Canvas 접근성 렌더 검증.
 *
 * 웹 TrendChart.test.tsx가 밴드 y좌표를 low/high 스케일로 검증한 방식을 따른다: Canvas는
 * 직접 좌표를 읽기 어려우므로 좌표 계산을 [computeTrendGeometry] 순수 함수로 분리해 밴드
 * 폴리곤이 forecast.low/high에서만 유도됨을 직접 검증한다(임의 산식 부재).
 */
class TrendChartTest : RobolectricComposeTest() {
    @get:Rule
    val composeTestRule = createComposeRule()

    private val width = 640f
    private val height = 300f

    /** geometry가 노출한 스케일로 값 → y를 재계산한다(밴드 검증의 기대치). */
    private fun yFor(geo: TrendGeometry, value: Double): Float =
        (geo.plotTop + (geo.plotBottom - geo.plotTop) * (1.0 - (value - geo.yLo) / (geo.yHi - geo.yLo))).toFloat()

    @Test
    fun `isForecastFlat는 평평하면 true, 기울면 false`() {
        val flat = listOf(
            ForecastBandPoint("2026-07-21", 68.0, 66.0, 69.0),
            ForecastBandPoint("2026-07-22", 68.0, 66.0, 69.0),
        )
        val rising = listOf(
            ForecastBandPoint("2026-07-21", 68.0, 66.0, 69.0),
            ForecastBandPoint("2026-07-22", 72.0, 70.0, 74.0),
        )
        assertTrue(isForecastFlat(flat))
        assertFalse(isForecastFlat(rising))
        assertFalse(isForecastFlat(emptyList()))
    }

    @Test
    fun bandEdgesAreDerivedFromApiLowHighOnly() {
        // low/high가 avgRatio와 뚜렷이 다른 예측점: 밴드가 avgRatio가 아닌 low/high를 써야 한다.
        val history = listOf(
            ForecastPoint("2026-07-19", 70.0),
            ForecastPoint("2026-07-20", 68.0),
        )
        val forecast = listOf(
            ForecastBandPoint("2026-07-21", 68.0, low = 60.0, high = 76.0),
            ForecastBandPoint("2026-07-22", 68.0, low = 55.0, high = 80.0),
        )
        val geo = computeTrendGeometry(history, forecast, basisAvgRatio = 68.0, width = width, height = height)

        assertEquals(2, geo.bandTop.size)
        assertEquals(2, geo.bandBottom.size)
        forecast.forEachIndexed { i, point ->
            // 위 가장자리는 high에서, 아래 가장자리는 low에서만 유도된다.
            assertEquals(yFor(geo, point.high), geo.bandTop[i].y, 0.01f)
            assertEquals(yFor(geo, point.low), geo.bandBottom[i].y, 0.01f)
            // high는 low보다 위(작은 y). avgRatio를 그대로 썼다면 top==bottom이 됐을 것.
            assertTrue(geo.bandTop[i].y < geo.bandBottom[i].y)
            assertNotEquals(geo.bandTop[i].y, geo.bandBottom[i].y)
        }
    }

    @Test
    fun mapsHistory30AndForecast14FromFixture() {
        val data = ForecastFixtures.success("forecast.watch.json")
        val geo = computeTrendGeometry(data.history, data.forecast, data.basis.avgRatio, width, height)
        assertEquals(30, geo.history.size)
        assertEquals(14, geo.bandTop.size)
        assertEquals(14, geo.bandBottom.size)
    }

    @Test
    fun producesNoNaNCoordinates() {
        val data = ForecastFixtures.success("forecast.watch.json")
        val geo = computeTrendGeometry(data.history, data.forecast, data.basis.avgRatio, width, height)
        val all = geo.history + geo.forecast + geo.bandTop + geo.bandBottom + listOfNotNull(geo.marker)
        all.forEach { o ->
            assertTrue(o.x.isFinite())
            assertTrue(o.y.isFinite())
        }
        assertTrue(geo.yLo.isFinite())
        assertTrue(geo.yHi.isFinite())
        assertTrue(geo.yHi > geo.yLo)
    }

    @Test
    fun geometryIsDeterministic() {
        val data = ForecastFixtures.success("forecast.severe.json")
        val a = computeTrendGeometry(data.history, data.forecast, data.basis.avgRatio, width, height)
        val b = computeTrendGeometry(data.history, data.forecast, data.basis.avgRatio, width, height)
        assertEquals(a, b)
    }

    @Test
    fun emptyHistoryIsHandledWithoutCrashOrNaN() {
        val forecast = listOf(
            ForecastBandPoint("2026-07-21", 68.0, low = 60.0, high = 76.0),
        )
        val geo = computeTrendGeometry(emptyList(), forecast, basisAvgRatio = 68.0, width = width, height = height)
        assertTrue(geo.history.isEmpty())
        assertNull(geo.todayX)
        assertNull(geo.marker)
        (geo.bandTop + geo.bandBottom).forEach { o ->
            assertTrue(o.x.isFinite())
            assertTrue(o.y.isFinite())
        }
    }

    @Test
    fun canvasExposesFlowContentDescription() {
        val data = ForecastFixtures.success("forecast.watch.json")
        composeTestRule.setContent {
            MulsigyeTheme {
                TrendChart(forecast = data)
            }
        }
        composeTestRule
            .onNodeWithContentDescription("지역 평년 대비 저수율 흐름", substring = true)
            .assertIsDisplayed()
    }

    @Test
    fun formatMonthDayStripsLeadingZeros() {
        assertEquals("6/21", formatMonthDay("2026-06-21"))
        assertEquals("8/3", formatMonthDay("2026-08-03"))
        assertEquals("11/2", formatMonthDay("2025-11-02"))
    }

    /** OS "애니메이션 삭제"를 켜 그려-들어오기 애니메이션을 즉시 완료(reduced-motion 경로)로 만든다. */
    private fun forceReducedMotion() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        Settings.Global.putFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            0f,
        )
    }

    @Test
    fun detailChartAddsDateRangeAndRendersUnderReducedMotion() {
        // reduced-motion에서 progress가 즉시 1로 스냅돼 정적 렌더된다.
        forceReducedMotion()
        val data = ForecastFixtures.success("forecast.watch.json")
        composeTestRule.setContent {
            MulsigyeTheme {
                TrendChart(forecast = data, showDates = true)
            }
        }
        // 상세는 날짜 축을 접근성 설명에도 담는다(observedOn에서만).
        composeTestRule
            .onNodeWithContentDescription("기간은", substring = true)
            .assertIsDisplayed()
    }

    @Test
    fun miniChartOmitsDateRange() {
        val data = ForecastFixtures.success("forecast.watch.json")
        composeTestRule.setContent {
            MulsigyeTheme {
                TrendChart(forecast = data)
            }
        }
        // 미니는 날짜 축이 없다(설명에 기간 문구 없음).
        composeTestRule
            .onAllNodesWithContentDescription("기간은", substring = true)
            .assertCountEquals(0)
    }
}
