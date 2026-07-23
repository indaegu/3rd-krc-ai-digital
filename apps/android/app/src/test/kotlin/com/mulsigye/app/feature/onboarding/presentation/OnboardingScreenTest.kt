package com.mulsigye.app.feature.onboarding.presentation

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.testing.RobolectricComposeTest
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** 온보딩 3장 캐러셀 + CTA 검증. */
class OnboardingScreenTest : RobolectricComposeTest() {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `첫 장과 가입 없음 안내가 보인다`() {
        composeTestRule.setContent {
            MulsigyeTheme {
                OnboardingScreen(onDone = {})
            }
        }
        composeTestRule.onNodeWithText("우리 동네 물 사정을 며칠 앞서 알려드려요").assertIsDisplayed()
        composeTestRule.onNodeWithText("가입 없이 바로 시작해요").assertIsDisplayed()
    }

    @Test
    fun `CTA를 누르면 onDone이 호출된다`() {
        var done = false
        composeTestRule.setContent {
            MulsigyeTheme {
                OnboardingScreen(onDone = { done = true })
            }
        }
        composeTestRule.onNodeWithText("내 지역 설정하기").performClick()
        composeTestRule.runOnIdle { assertTrue(done) }
    }
}
