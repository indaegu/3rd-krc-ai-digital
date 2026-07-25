package com.mulsigye.app.feature.notifications.presentation

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.testing.RobolectricComposeTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * 알림 설정 화면 렌더 검증: 토글·시각 표시·TalkBack 라벨. 옵트인 상태에 따라 세부 설정이
 * 나타나고/사라지는지, 접근성 이름이 붙는지 확인한다(실제 알림 발송은 검증하지 않는다).
 */
class NotificationSettingsScreenTest : RobolectricComposeTest() {
    @get:Rule
    val composeTestRule = createComposeRule()

    private fun setScreen(state: NotificationSettingsUiState) {
        composeTestRule.setContent {
            MulsigyeTheme {
                NotificationSettingsScreen(
                    state = state,
                    onBack = {},
                    onToggleEnabled = {},
                    onToggleDaily = {},
                    onAdjustDailyTime = {},
                    onToggleStageAlert = {},
                )
            }
        }
    }

    @Test
    fun `꺼진 상태면 마스터 토글만 보이고 세부 설정은 숨긴다`() {
        setScreen(NotificationSettingsUiState(enabled = false))
        composeTestRule.onNodeWithText("알림 설정").assertIsDisplayed()
        composeTestRule.onNodeWithText("알림 받기").assertIsDisplayed()
        // 마스터가 꺼져 있으면 세부 토글은 렌더되지 않는다.
        assertAbsent("매일 정해진 시간에 받기")
        assertAbsent("단계가 나빠지면 알려주기")
    }

    @Test
    fun `켜진 상태면 세부 토글이 나타난다`() {
        setScreen(
            NotificationSettingsUiState(
                enabled = true,
                dailyTimeMinutes = null,
                stageAlertEnabled = true,
            ),
        )
        // 세로 스크롤 화면이라 폴드 아래 카드는 뷰포트에 없을 수 있어 "존재"로 검증한다.
        assertPresent("매일 정해진 시간에 받기")
        assertPresent("단계가 나빠지면 알려주기")
        // 매일이 꺼져 있으면(시각 null) 시각 조절 UI는 없다.
        assertAbsent("알림 시각")
    }

    @Test
    fun `매일 시각이 있으면 오전_오후 시각을 표시한다`() {
        setScreen(
            NotificationSettingsUiState(
                enabled = true,
                dailyTimeMinutes = 8 * 60,
                stageAlertEnabled = true,
            ),
        )
        assertPresent("알림 시각")
        assertPresent("오전 8시 00분")
        // 시각 조절 버튼의 접근성 이름.
        assertCdPresent("시각 10분 뒤로")
        assertCdPresent("시각 10분 앞으로")
    }

    @Test
    fun `토글에 TalkBack 이름과 상태가 붙는다`() {
        setScreen(NotificationSettingsUiState(enabled = false))
        // 마스터 스위치는 contentDescription "알림 받기"로 접근된다.
        assertCdPresent("알림 받기")
        // 뒤로가기 접근성 이름.
        assertCdPresent("이전으로 돌아가기")
    }

    @Test
    fun `권한이 거부되면 힌트를 보여준다`() {
        setScreen(NotificationSettingsUiState(enabled = false, permissionDenied = true))
        assertPresent("알림 권한이 꺼져 있어요")
        assertPresent("설정", substring = true)
    }

    private fun assertPresent(text: String, substring: Boolean = false) {
        assertTrue(
            "렌더 트리에 없음: $text",
            composeTestRule.onAllNodesWithText(text, substring = substring).fetchSemanticsNodes().isNotEmpty(),
        )
    }

    private fun assertAbsent(text: String) {
        assertEquals(
            0,
            composeTestRule.onAllNodesWithText(text, substring = true).fetchSemanticsNodes().size,
        )
    }

    private fun assertCdPresent(cd: String) {
        assertTrue(
            "접근성 이름 없음: $cd",
            composeTestRule.onAllNodesWithContentDescription(cd, substring = true).fetchSemanticsNodes().isNotEmpty(),
        )
    }
}
