package com.mulsigye.app.core.designsystem.component

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
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
                // busy = true → 라벨을 감추고 스피너만 + 중복 입력 잠금(design-system 로딩 패턴).
                // 라벨이 감춰지므로 접근성 이름("<라벨> 처리 중")으로 버튼을 찾는다.
                CtaButton(text = "등록하기", onClick = { clicks += 1 }, busy = true)
            }
        }

        composeTestRule.onNodeWithContentDescription("등록하기 처리 중").performClick()

        composeTestRule.runOnIdle { assertEquals(0, clicks) }
    }
}
