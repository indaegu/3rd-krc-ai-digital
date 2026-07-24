package com.mulsigye.app.core.designsystem.component

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.testing.RobolectricComposeTest
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class CtaButtonTest : RobolectricComposeTest() {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun invokesOnClickWhenIdle() {
        var clicks = 0
        composeTestRule.setContent {
            MulsigyeTheme {
                CtaButton(text = "등록하기", onClick = { clicks += 1 })
            }
        }

        composeTestRule.onNodeWithText("등록하기").performClick()

        composeTestRule.runOnIdle { assertEquals(1, clicks) }
    }

    @Test
    fun doesNotInvokeOnClickWhileBusy() {
        var clicks = 0
        composeTestRule.setContent {
            MulsigyeTheme {
                // busy = true → 버튼 내부 스피너 + 중복 입력 잠금(design-system 로딩 패턴).
                CtaButton(text = "등록하기", onClick = { clicks += 1 }, busy = true)
            }
        }

        composeTestRule.onNodeWithText("등록하기").performClick()

        composeTestRule.runOnIdle { assertEquals(0, clicks) }
    }
}
