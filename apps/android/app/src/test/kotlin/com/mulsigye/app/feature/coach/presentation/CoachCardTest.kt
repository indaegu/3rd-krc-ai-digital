package com.mulsigye.app.feature.coach.presentation

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.testing.CoachFixtures
import com.mulsigye.app.core.testing.RobolectricComposeTest
import com.mulsigye.app.feature.coach.domain.CoachAction
import com.mulsigye.app.feature.coach.domain.CoachResult
import org.junit.Rule
import org.junit.Test

/**
 * 물시계 코치 카드 렌더 검증.
 *
 * - 서버가 확정한 headline·summary·행동(최대 3개)을 그대로 표시한다(규칙 10).
 * - mode(llm/cache/static)·fallbackReason은 렌더 구조를 바꾸지 않는다(구조 불변 — 테스트로 강제).
 * - coach 오류 시 이 모듈만 오류 카드로 바뀌고, 자유 채팅·입력 UI는 절대 없다(spec 15절).
 */
class CoachCardTest : RobolectricComposeTest() {
    @get:Rule
    val composeTestRule = createComposeRule()

    private fun setCard(state: CoachUiState) {
        composeTestRule.setContent {
            MulsigyeTheme {
                CoachCard(state = state, onRetry = {})
            }
        }
    }

    private fun ready(fixture: String = "coach.static.json") =
        CoachUiState.Ready(CoachFixtures.success(fixture))

    @Test
    fun staticFixtureShowsHeaderHeadlineSummaryAndThreeActions() {
        setCard(ready())
        composeTestRule.onNodeWithText("물시계 코치").assertIsDisplayed()
        composeTestRule.onNodeWithText("지금 할 일을 하나씩 확인해요.", substring = true).assertIsDisplayed()
        composeTestRule
            .onNodeWithText("공식 가뭄 예·경보를 먼저 확인해요", substring = true)
            .assertIsDisplayed()
        // 행동 3개: 각 제목 + 보조 설명이 그대로 보인다.
        composeTestRule.onNodeWithText("물꼬를 조금만 열어 두어요").assertIsDisplayed()
        composeTestRule.onNodeWithText("논물을 아껴 쓰면 다음 단계까지 여유가 생겨요.", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText("공식 가뭄 안내를 확인해요").assertIsDisplayed()
        composeTestRule.onNodeWithText("물 대는 순서를 정해요").assertIsDisplayed()
    }

    @Test
    fun modeVariationsRenderIdenticalStructure() {
        // llm/cache/static 세 mode를 나란히 렌더해 동일 행동이 각각 그대로 나오는지 본다 — 구조 불변.
        val base = CoachFixtures.success("coach.static.json")
        val modes = listOf("llm", "cache", "static")
        composeTestRule.setContent {
            MulsigyeTheme {
                androidx.compose.foundation.layout.Column {
                    modes.forEach { mode ->
                        CoachCard(state = CoachUiState.Ready(base.copy(mode = mode)), onRetry = {})
                    }
                }
            }
        }
        // 세 mode 모두에서 동일 행동 제목·보조설명이 렌더되므로 각 텍스트가 정확히 3번 나온다.
        listOf(
            "물꼬를 조금만 열어 두어요",
            "공식 가뭄 안내를 확인해요",
            "물 대는 순서를 정해요",
        ).forEach { title ->
            composeTestRule.onAllNodesWithText(title).assertCountEquals(modes.size)
        }
        // mode 이름(llm/cache) 자체는 어느 카드에도 노출되지 않는다(mode/fallbackReason 표시 차이 없음).
        listOf("llm", "cache").forEach { mode ->
            composeTestRule.onAllNodesWithText(mode, substring = true).assertCountEquals(0)
        }
    }

    @Test
    fun cachesActionsAtThree() {
        // 행동이 4개여도 최대 3개만 렌더한다(product.md: 행동 추천 3개 이하).
        val base = CoachFixtures.success("coach.static.json")
        val fourActions = base.copy(
            coach = base.coach.copy(
                actions = base.coach.actions + CoachAction(
                    id = "care_extra",
                    title = "네 번째 행동은 보이지 않아요",
                    reason = "최대 세 개까지만 보여줘요.",
                ),
            ),
        )
        setCard(CoachUiState.Ready(fourActions))
        composeTestRule.onNodeWithText("물꼬를 조금만 열어 두어요").assertIsDisplayed()
        composeTestRule.onAllNodesWithText("네 번째 행동은 보이지 않아요").assertCountEquals(0)
    }

    @Test
    fun errorStateShowsErrorCardWithoutChatUi() {
        setCard(
            CoachUiState.Error(message = "코치 설명을 불러오지 못했어요.", retryable = true),
        )
        // 코치 모듈만 오류 카드로 대체하되 헤더는 유지한다.
        composeTestRule.onNodeWithText("물시계 코치").assertIsDisplayed()
        composeTestRule.onNodeWithText("코치 설명을 불러오지 못했어요.", substring = true).assertIsDisplayed()
        // 채팅·자유입력 암시 UI는 어떤 상태에서도 없다.
        listOf("물어보기", "질문", "채팅", "메시지", "입력", "보내기").forEach { word ->
            composeTestRule.onAllNodesWithText(word, substring = true).assertCountEquals(0)
        }
    }

    @Test
    fun readyStateHasNoChatUi() {
        setCard(ready())
        listOf("물어보기", "질문", "채팅", "메시지", "보내기").forEach { word ->
            composeTestRule.onAllNodesWithText(word, substring = true).assertCountEquals(0)
        }
    }

    @Test
    fun forbiddenAssertivePhrasesAreAbsent() {
        setCard(ready())
        listOf("내려가요", "됩니다", "위험합니다").forEach { word ->
            composeTestRule.onAllNodesWithText(word, substring = true).assertCountEquals(0)
        }
    }
}
