package com.mulsigye.app.feature.policy.presentation

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import com.mulsigye.app.app.PolicyKind
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.testing.RobolectricComposeTest
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

/**
 * 폴리시 화면 3종 콘텐츠 가드. 웹 policy.test.tsx와 동일 원칙:
 * 로그인·알림 문구가 없고, 각 종류의 핵심 고지가 존재한다.
 */
class PolicyScreenTest : RobolectricComposeTest() {
    @get:Rule
    val composeTestRule = createComposeRule()

    private fun setPolicy(kind: PolicyKind) {
        composeTestRule.setContent {
            MulsigyeTheme {
                PolicyScreen(kind = kind, onBack = {})
            }
        }
    }

    @Test
    fun `위치 폴리시는 주소를 저장하지 않음을 밝히고 로그인_알림 문구가 없다`() {
        setPolicy(PolicyKind.LOCATION)
        composeTestRule.onNodeWithText("위치기반 서비스 이용약관").assertIsDisplayed()
        composeTestRule.onAllNodesWithText("저장하지 않아요", substring = true)
            .fetchSemanticsNodes().isNotEmpty().let { assertEquals(true, it) }
        assertNoText("로그인")
        assertNoText("알림")
    }

    // 회귀 방지: 메인 화면이 로드될 때마다 sigunCode를 /api/v1/*로 전송하므로,
    // 정책은 "코드를 서버로 보내지 않는다"고 잘못 고지하면 안 되고 조회 전송을 밝혀야 한다.
    @Test
    fun `위치 폴리시는 지역 코드를 조회에 전송함을 밝힌다`() {
        setPolicy(PolicyKind.LOCATION)
        composeTestRule.onAllNodesWithText("지역 코드를 우리 API 서버로 보내요", substring = true)
            .fetchSemanticsNodes().isNotEmpty().let { assertEquals(true, it) }
        assertNoText("이 코드는 회사 서버로 보내지 않아요")
    }

    @Test
    fun `이용약관은 예측 참고_공식 우선 면책을 밝힌다`() {
        setPolicy(PolicyKind.TERMS)
        composeTestRule.onNodeWithText("서비스 이용약관").assertIsDisplayed()
        composeTestRule.onAllNodesWithText("공식 가뭄 예·경보가 우선", substring = true)
            .fetchSemanticsNodes().isNotEmpty().let { assertEquals(true, it) }
        assertNoText("로그인")
        assertNoText("알림")
    }

    @Test
    fun `개인정보 처리방침은 비식별 전달을 밝힌다`() {
        setPolicy(PolicyKind.PRIVACY)
        composeTestRule.onNodeWithText("개인정보 처리방침").assertIsDisplayed()
        composeTestRule.onAllNodesWithText("비식별", substring = true)
            .fetchSemanticsNodes().isNotEmpty().let { assertEquals(true, it) }
        assertNoText("로그인")
        assertNoText("알림")
    }

    // 회귀 방지: 조회에 지역 코드가 전송됨을 밝히고, 잘못된 "보내지 않아요" 고지가 없어야 한다.
    @Test
    fun `개인정보 처리방침은 지역 코드 전송을 밝히고 미전송 오고지가 없다`() {
        setPolicy(PolicyKind.PRIVACY)
        composeTestRule.onAllNodesWithText("지역 코드를 우리 API 서버로 보내요", substring = true)
            .fetchSemanticsNodes().isNotEmpty().let { assertEquals(true, it) }
        assertNoText("이 정보는 회사 서버로 보내지 않아요")
    }

    private fun assertNoText(text: String) {
        composeTestRule.onAllNodesWithText(text, substring = true)
            .fetchSemanticsNodes().isEmpty().let { assertEquals(true, it) }
    }
}
