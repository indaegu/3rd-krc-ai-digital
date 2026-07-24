package com.mulsigye.app.feature.status.presentation

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.testing.RobolectricComposeTest
import com.mulsigye.app.core.testing.StatusFixtures
import org.junit.Rule
import org.junit.Test

/**
 * 만수위 '참고' 배너는 서버 확정 highWaterNotice==true(flood 96/118)일 때만 표시하고,
 * '경보/경고/위험'이라 부르지 않는다(product.md). 클라이언트는 95%를 재판정하지 않는다.
 */
class HighWaterBannerTest : RobolectricComposeTest() {
    @get:Rule
    val composeTestRule = createComposeRule()

    private fun setBanner(fixture: String) {
        composeTestRule.setContent {
            MulsigyeTheme {
                HighWaterBanner(notice = StatusFixtures.success(fixture).highWaterNotice)
            }
        }
    }

    @Test
    fun floodStateShowsReferenceBanner() {
        setBanner("status.flood.json")
        composeTestRule.onNodeWithText("참고", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText("공식 재난 문자", substring = true).assertIsDisplayed()
    }

    @Test
    fun normalStateHidesBanner() {
        setBanner("status.normal.json")
        composeTestRule.onAllNodesWithText("참고", substring = true).assertCountEquals(0)
    }

    @Test
    fun bannerAvoidsAlarmWording() {
        setBanner("status.flood.json")
        listOf("경보", "경고", "위험").forEach { word ->
            composeTestRule
                .onAllNodesWithText(word, substring = true)
                .assertCountEquals(0)
        }
    }
}
