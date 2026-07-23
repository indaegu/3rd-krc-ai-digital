package com.mulsigye.app.core.designsystem.component

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.testing.RobolectricComposeTest
import org.junit.Rule
import org.junit.Test

class StageChipTest : RobolectricComposeTest() {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun showsStageLabelAndSupportingLabel() {
        composeTestRule.setContent {
            MulsigyeTheme {
                StageChip(label = "관심", code = "watch")
            }
        }

        composeTestRule.onNodeWithText("관심").assertIsDisplayed()
        // 단계 칩은 항상 "지역 평년 대비 기준" 보조 라벨을 함께 쓴다(design-system).
        composeTestRule.onNodeWithText("지역 평년 대비 기준").assertIsDisplayed()
    }

    @Test
    fun exposesContentDescriptionCombiningLabelAndBasis() {
        composeTestRule.setContent {
            MulsigyeTheme {
                StageChip(label = "심각", code = "crit")
            }
        }

        // 색만으로 단계를 구분하지 않도록 접근성 이름에 단계명과 기준을 함께 담는다.
        composeTestRule
            .onNodeWithContentDescription("지역 평년 대비 기준, 현재 단계 심각")
            .assertIsDisplayed()
    }
}
