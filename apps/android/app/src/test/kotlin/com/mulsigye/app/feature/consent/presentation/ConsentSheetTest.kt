package com.mulsigye.app.feature.consent.presentation

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.mulsigye.app.app.PolicyKind
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.testing.RobolectricComposeTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * 동의 시트 내용(ConsentSheetContent) 렌더·상호작용 검증. 바텀시트 팝업을 피하려고
 * 순수 내용 컴포저블을 직접 렌더한다(다른 화면과 동일한 순수 컴포저블 테스트 방식).
 */
class ConsentSheetTest : RobolectricComposeTest() {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `필수 2건 전에는 시작 버튼이 비활성이다`() {
        composeTestRule.setContent {
            MulsigyeTheme {
                ConsentSheetContent(onAgree = {}, onOpenPolicy = {})
            }
        }
        composeTestRule.onNodeWithText("동의하고 시작하기").assertIsNotEnabled()
    }

    @Test
    fun `모두 동의를 켜면 시작 버튼이 활성된다`() {
        composeTestRule.setContent {
            MulsigyeTheme {
                ConsentSheetContent(onAgree = {}, onOpenPolicy = {})
            }
        }
        composeTestRule.onNodeWithText("모두 동의합니다").performClick()
        composeTestRule.onNodeWithText("동의하고 시작하기").assertIsEnabled()
    }

    @Test
    fun `필수 2건을 각각 켜야 활성된다`() {
        composeTestRule.setContent {
            MulsigyeTheme {
                ConsentSheetContent(onAgree = {}, onOpenPolicy = {})
            }
        }
        composeTestRule.onNodeWithText("위치기반 서비스 이용 동의").performClick()
        // 한 건만 켠 상태에서는 여전히 비활성.
        composeTestRule.onNodeWithText("동의하고 시작하기").assertIsNotEnabled()
        composeTestRule.onNodeWithText("서비스 이용약관 동의").performClick()
        composeTestRule.onNodeWithText("동의하고 시작하기").assertIsEnabled()
    }

    @Test
    fun `모두 동의 후 시작 버튼을 누르면 onAgree가 호출된다`() {
        var agreed = false
        composeTestRule.setContent {
            MulsigyeTheme {
                ConsentSheetContent(onAgree = { agreed = true }, onOpenPolicy = {})
            }
        }
        composeTestRule.onNodeWithText("모두 동의합니다").performClick()
        composeTestRule.onNodeWithText("동의하고 시작하기").performClick()
        composeTestRule.runOnIdle { assertTrue(agreed) }
    }

    @Test
    fun `저장하는 동의 버전은 consent-v1 이다`() {
        assertEquals("consent-v1", CONSENT_VERSION)
    }

    @Test
    fun `필수 항목의 폴리시 보기 링크가 해당 종류로 이동한다`() {
        var opened: PolicyKind? = null
        composeTestRule.setContent {
            MulsigyeTheme {
                ConsentSheetContent(onAgree = {}, onOpenPolicy = { opened = it })
            }
        }
        composeTestRule.onNodeWithContentDescription("위치기반 서비스 약관 보기").performClick()
        composeTestRule.runOnIdle { assertEquals(PolicyKind.LOCATION, opened) }
    }
}
