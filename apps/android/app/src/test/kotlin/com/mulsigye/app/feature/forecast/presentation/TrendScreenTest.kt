package com.mulsigye.app.feature.forecast.presentation

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.testing.ForecastFixtures
import com.mulsigye.app.core.testing.RobolectricComposeTest
import com.mulsigye.app.core.testing.StatusFixtures
import com.mulsigye.app.feature.status.domain.ReservoirRatePoint
import com.mulsigye.app.feature.status.domain.StatusResult
import org.junit.Rule
import org.junit.Test

/**
 * 흐름 상세(자세히) 화면 검증 — **차트 지표 토글이 상세에도 있어야 한다**.
 *
 * 메인 카드에만 토글이 있어 "자세히"로 들어오면 실측 보기가 사라지던 문제(코드 리뷰 P1)를
 * 막는 회귀 테스트다. status가 없으면(로딩·실패) 토글은 조용히 감춘다.
 */
class TrendScreenTest : RobolectricComposeTest() {
    @get:Rule
    val composeTestRule = createComposeRule()

    /** 실측 시계열이 실린 status — 공유 픽스처에는 rateHistory가 없어 여기서 얹는다. */
    private fun withRates(): StatusResult.Success {
        val base = StatusFixtures.success("status.watch.json")
        return base.copy(
            reservoir = base.reservoir.copy(
                rateHistory = listOf(
                    ReservoirRatePoint("2026-07-18", 57.3),
                    ReservoirRatePoint("2026-07-19", 57.0),
                    ReservoirRatePoint("2026-07-20", 56.4),
                ),
            ),
        )
    }

    private fun setScreen(status: StatusResult.Success?) {
        composeTestRule.setContent {
            MulsigyeTheme {
                TrendScreen(
                    data = ForecastFixtures.success("forecast.watch.json"),
                    onBack = {},
                    status = status,
                )
            }
        }
    }

    @Test
    fun showsMetricToggleWhenReservoirHistoryExists() {
        setScreen(withRates())
        // 토글 버튼은 선택 상태를 contentDescription으로 알린다(MetricToggle).
        composeTestRule.onNodeWithContentDescription("지역 평년 대비 선택됨").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("저수지 실측").assertIsDisplayed()
    }

    @Test
    fun switchesToReservoirSeriesOnToggle() {
        setScreen(withRates())
        composeTestRule.onNodeWithContentDescription("저수지 실측").performClick()
        // 제목·부제가 실측 쪽으로 바뀐다("예측이에요" 부제는 사라진다).
        composeTestRule.onNodeWithText("실제 저수율", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText("최근 3일 실측이에요").assertIsDisplayed()
        composeTestRule.onAllNodesWithText("예측이에요", substring = true).assertCountEquals(0)
        composeTestRule.onNodeWithContentDescription("저수지 실측 선택됨").assertIsDisplayed()
    }

    @Test
    fun hidesToggleWithoutStatus() {
        setScreen(null)
        composeTestRule.onAllNodesWithContentDescription("저수지 실측").assertCountEquals(0)
        // 토글이 없어도 기본(지역 평년 대비) 차트와 제목은 그대로 보인다.
        composeTestRule.onNodeWithText("나주시 지역 평년 대비 저수율").assertIsDisplayed()
    }
}
