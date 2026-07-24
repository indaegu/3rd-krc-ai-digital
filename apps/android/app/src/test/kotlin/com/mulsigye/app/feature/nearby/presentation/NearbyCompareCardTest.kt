package com.mulsigye.app.feature.nearby.presentation

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.testing.RobolectricComposeTest
import com.mulsigye.app.feature.nearby.domain.NearbyRegion
import com.mulsigye.app.feature.nearby.domain.NearbyResult
import org.junit.Rule
import org.junit.Test

/**
 * 주변 지역 비교 카드 렌더 검증.
 *
 * - 서버가 확정한 목록(가뭄 심한 순)·avgRatio·단계 코드를 그대로 표시한다(규칙 10).
 * - 우리 지역을 '우리 지역' 마커로 강조한다.
 * - 순위 요약은 '넉넉한 순'으로 계산한다(논산 112.7이 1번째).
 */
class NearbyCompareCardTest : RobolectricComposeTest() {
    @get:Rule
    val composeTestRule = createComposeRule()

    private val success = NearbyResult.Success(
        sidoName = "충남",
        asOf = "2025-12-31",
        regions = listOf(
            NearbyRegion("44180", "보령시", 48.2, "alert", current = false),
            NearbyRegion("44270", "당진시", 71.9, "ok", current = false),
            NearbyRegion("44230", "논산시", 112.7, "ok", current = true),
        ),
        stale = true,
        sources = listOf("커밋 스냅샷(기준 2025-12-31)"),
    )

    private fun setCard(data: NearbyResult.Success) {
        composeTestRule.setContent {
            MulsigyeTheme {
                NearbyCompareCard(data = data)
            }
        }
    }

    @Test
    fun showsSidoTitleAndAllRegionsWithRatios() {
        setCard(success)
        composeTestRule.onNodeWithText("충남 안에서 비교").assertIsDisplayed()
        composeTestRule.onNodeWithText("보령시").assertIsDisplayed()
        composeTestRule.onNodeWithText("당진시").assertIsDisplayed()
        composeTestRule.onNodeWithText("논산시").assertIsDisplayed()
        composeTestRule.onNodeWithText("평년 대비 48.2%").assertIsDisplayed()
        composeTestRule.onNodeWithText("평년 대비 71.9%").assertIsDisplayed()
        // 보령은 경계(alert) 단계 라벨.
        composeTestRule.onNodeWithText("경계").assertIsDisplayed()
    }

    @Test
    fun highlightsCurrentRegionWithMarker() {
        setCard(success)
        composeTestRule.onNodeWithText("우리 지역").assertIsDisplayed()
    }

    @Test
    fun showsRankSummaryByWetterOrder() {
        setCard(success)
        // 논산(112.7)이 가장 넉넉 → 1번째.
        composeTestRule
            .onNodeWithText("충남 3곳 중 물 사정이 1번째로 넉넉해요.", substring = true)
            .assertIsDisplayed()
    }

    @Test
    fun emptyRegionsRendersNothing() {
        setCard(success.copy(regions = emptyList()))
        composeTestRule.onAllNodesWithText("충남 안에서 비교").assertCountEquals(0)
    }
}
