package com.mulsigye.app.feature.forecast.presentation

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.testing.RobolectricComposeTest
import com.mulsigye.app.feature.forecast.domain.StageGuideEntry
import org.junit.Rule
import org.junit.Test

/**
 * 단계별 행동 가이드 렌더 검증. 서버 stageGuide가 있으면 5단계 행동 제목을 보여주고
 * 우리 지역 현재 단계를 강조한다. 없으면 기존 단계 기준 표로 폴백한다.
 */
class StageGuideCardTest : RobolectricComposeTest() {
    @get:Rule
    val composeTestRule = createComposeRule()

    // 현재 단계 ok(정상)인 대표 가이드 — 행동 제목은 서버 카탈로그 값 그대로.
    private val okGuide = listOf(
        StageGuideEntry(
            "ok",
            "정상",
            listOf("지금처럼 물 관리를 이어가요", "논물 상태를 가끔 확인해요"),
            current = true,
        ),
        StageGuideEntry("watch", "관심", listOf("논물이 새는 곳을 살펴봐요"), current = false),
        StageGuideEntry("care", "주의", listOf("논물 상태를 확인해요"), current = false),
        StageGuideEntry("alert", "경계", listOf("물 댈 논의 순서를 정해요"), current = false),
        StageGuideEntry("crit", "심각", listOf("공식 안내를 먼저 확인해요"), current = false),
    )

    @Test
    fun serverGuideShowsHeadingActionsAndCurrentMarker() {
        composeTestRule.setContent {
            MulsigyeTheme { StageGuideCard(stageGuide = okGuide) }
        }
        composeTestRule.onNodeWithText("단계별 행동 가이드").assertIsDisplayed()
        composeTestRule.onNodeWithText("지금처럼 물 관리를 이어가요", substring = true).assertIsDisplayed()
        // 마지막 단계(심각) 행동은 화면 밖일 수 있어 존재만 확인한다.
        composeTestRule.onNodeWithText("공식 안내를 먼저 확인해요", substring = true).assertExists()
        // 현재 단계 강조는 정확히 1개.
        composeTestRule.onAllNodesWithText("지금 우리 지역").assertCountEquals(1)
        // 폴백 표 제목은 뜨지 않는다.
        composeTestRule.onAllNodesWithText("가뭄 단계 기준").assertCountEquals(0)
    }

    @Test
    fun nullGuideFallsBackToStageCriteriaTable() {
        composeTestRule.setContent {
            MulsigyeTheme { StageGuideCard(stageGuide = null) }
        }
        composeTestRule.onNodeWithText("가뭄 단계 기준").assertIsDisplayed()
        composeTestRule.onNodeWithText("평소처럼 관리하면 돼요", substring = true).assertIsDisplayed()
        composeTestRule.onAllNodesWithText("단계별 행동 가이드").assertCountEquals(0)
        composeTestRule.onAllNodesWithText("지금 우리 지역").assertCountEquals(0)
    }
}
