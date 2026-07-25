package com.mulsigye.app.feature.forecast.presentation

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.testing.RobolectricComposeTest
import com.mulsigye.app.feature.forecast.domain.ForecastEarlyWarning
import org.junit.Rule
import org.junit.Test

/**
 * '감소 주의' 조기경보 배너 렌더 검증. 서버 message를 그대로 쓰고, 공식 단계 칩과 별개인
 * 참고 신호임을 '참고 조기경보' 라벨로 구분한다. earlyWarning이 없으면 아무것도 그리지 않는다.
 */
class EarlyWarningBannerTest : RobolectricComposeTest() {
    @get:Rule
    val composeTestRule = createComposeRule()

    private val message =
        "저수율이 빠르게 줄고 있어요. 지금은 괜찮아도 미리 대비하면 좋아요. 공식 단계와 별개인 참고 신호예요."

    @Test
    fun showsServerMessageWithReferenceLabelWhenSet() {
        composeTestRule.setContent {
            MulsigyeTheme {
                EarlyWarningBanner(
                    earlyWarning = ForecastEarlyWarning("watch", -0.82, message),
                )
            }
        }
        composeTestRule.onNodeWithText("참고 조기경보", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText(message, substring = true).assertIsDisplayed()
        // 공식 '단계'와 별개인 참고 신호임을 문구가 밝힌다(단계 칩으로 오인 방지).
        composeTestRule
            .onNodeWithText("공식 단계와 별개인 참고 신호", substring = true)
            .assertIsDisplayed()
    }

    @Test
    fun rendersNothingWhenAbsent() {
        composeTestRule.setContent {
            MulsigyeTheme {
                EarlyWarningBanner(earlyWarning = null)
            }
        }
        composeTestRule.onAllNodesWithText("참고 조기경보", substring = true).assertCountEquals(0)
    }
}
