package com.mulsigye.app.feature.forecast.presentation

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.testing.ForecastFixtures
import com.mulsigye.app.core.testing.RobolectricComposeTest
import org.junit.Rule
import org.junit.Test

/**
 * 메인 미니 차트 카드 검증. #11 이후 미니 차트도 상세와 같은 showDates 경로를 써서
 * x축 날짜(첫 날짜·오늘·마지막 날짜)를 노출한다. Canvas 라벨은 직접 읽기 어려우므로
 * 같은 showDates 경로가 담는 접근성 날짜 요약("기간은 …")으로 노출을 검증한다.
 */
class TrendChartCardTest : RobolectricComposeTest() {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun miniCardExposesDateLabels() {
        val data = ForecastFixtures.success("forecast.watch.json")
        composeTestRule.setContent {
            MulsigyeTheme {
                TrendChartCard(forecast = data, onDetail = {})
            }
        }
        composeTestRule
            .onNodeWithContentDescription("기간은", substring = true)
            .assertIsDisplayed()
    }
}
