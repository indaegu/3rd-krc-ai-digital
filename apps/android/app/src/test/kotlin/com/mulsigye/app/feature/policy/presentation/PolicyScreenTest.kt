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
 * 로그인 유도 문구가 없고, 각 종류의 핵심 고지가 존재한다.
 *
 * 알림: Android는 옵트인 로컬 알림을 제공하므로 약관/방침이 이제 알림을 **밝혀야** 한다.
 * 과거의 "알림 문구가 없다" 단언을 뒤집어, TERMS·PRIVACY는 옵트인 알림 고지를 검증하고
 * 로그인 유도 금지 가드는 그대로 유지한다(원치 않는 넛지 차단).
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
        // 옵트인 알림을 밝힌다(끄기 가능·선택).
        assertHasText("언제든 설정에서 끌 수 있어요")
    }

    @Test
    fun `개인정보 처리방침은 비식별 전달을 밝힌다`() {
        setPolicy(PolicyKind.PRIVACY)
        composeTestRule.onNodeWithText("개인정보 처리방침").assertIsDisplayed()
        composeTestRule.onAllNodesWithText("비식별", substring = true)
            .fetchSemanticsNodes().isNotEmpty().let { assertEquals(true, it) }
        assertNoText("로그인")
    }

    // 옵트인 로컬 알림 고지: 개인정보 처리방침은 알림이 기본 꺼짐·이 기기에서만·끄기 가능임을 밝힌다.
    @Test
    fun `개인정보 처리방침은 옵트인 로컬 알림을 밝힌다`() {
        setPolicy(PolicyKind.PRIVACY)
        assertHasText("알림은 기본적으로 꺼져 있어요")
        assertHasText("이 기기 안에서만 동작해요")
        assertHasText("언제든 설정에서 끌 수 있어요")
        // 계정·서버 푸시가 아님을 밝힌다.
        assertHasText("계정이나 서버 푸시 없이")
    }

    // 회귀 방지: 조회에 지역 코드가 전송됨을 밝히고, 잘못된 "보내지 않아요" 고지가 없어야 한다.
    @Test
    fun `개인정보 처리방침은 지역 코드 전송을 밝히고 미전송 오고지가 없다`() {
        setPolicy(PolicyKind.PRIVACY)
        composeTestRule.onAllNodesWithText("지역 코드를 우리 API 서버로 보내요", substring = true)
            .fetchSemanticsNodes().isNotEmpty().let { assertEquals(true, it) }
        assertNoText("이 정보는 회사 서버로 보내지 않아요")
    }

    // 검색어는 GET 질의문자열에 실려 호스팅(Vercel) 접속 기록에 남는다.
    // "어디에도 저장하지 않아요" 같은 절대 표현으로 되돌아가면 사실과 어긋난다.
    @Test
    fun `위치 폴리시는 호스팅 접속 기록 예외를 밝힌다`() {
        setPolicy(PolicyKind.LOCATION)
        assertHasText("접속 기록")
        assertHasText("IP 주소")
        assertNoText("어디에도 저장하지 않아요")
    }

    @Test
    fun `개인정보 처리방침은 호스팅 접속 기록 예외를 밝힌다`() {
        setPolicy(PolicyKind.PRIVACY)
        assertHasText("접속 기록")
        assertHasText("IP 주소")
        assertNoText("어디에도 저장하지 않아요")
    }

    // 오프라인 대비로 기기에 응답을 남기므로 방침이 그 사실을 밝혀야 한다.
    @Test
    fun `개인정보 처리방침은 오프라인 저장본을 밝힌다`() {
        setPolicy(PolicyKind.PRIVACY)
        assertHasText("이 기기에만 잠시 남겨요")
        assertHasText("주소·검색어는 담기지 않아요")
    }

    private fun assertNoText(text: String) {
        composeTestRule.onAllNodesWithText(text, substring = true)
            .fetchSemanticsNodes().isEmpty().let { assertEquals(true, it) }
    }

    private fun assertHasText(text: String) {
        composeTestRule.onAllNodesWithText(text, substring = true)
            .fetchSemanticsNodes().isNotEmpty().let { assertEquals(true, it) }
    }
}
