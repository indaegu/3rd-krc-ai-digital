package com.mulsigye.app.feature.status.presentation

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.testing.RobolectricComposeTest
import org.junit.Rule
import org.junit.Test

/**
 * 근거·한계 고지 카드 렌더 검증.
 *
 * - 공인 기준 설명(문구만·임계 상수 복제 아님)과 공식 우선 문구를 보여준다.
 * - sources 칩은 status ∪ forecast 병합·중복 제거 결과를 그대로 렌더한다.
 * - stale이면 화면 구조는 그대로 두고 지연 안내만 덧붙인다(구조 불변).
 * - 입력은 status/forecast sources·stale뿐이며 coach와 독립이다.
 */
class SourcesCardTest : RobolectricComposeTest() {
    @get:Rule
    val composeTestRule = createComposeRule()

    private fun setCard(sources: List<String>, stale: Boolean) {
        composeTestRule.setContent {
            MulsigyeTheme {
                SourcesCard(sources = sources, stale = stale)
            }
        }
    }

    @Test
    fun showsBasisTitleAndOfficialPriorityCopy() {
        setCard(sources = listOf("논가뭄지도"), stale = false)
        composeTestRule.onNodeWithText("이 화면의 근거").assertIsDisplayed()
        composeTestRule.onNodeWithText("공인 기준", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText("공식 가뭄 예·경보가 항상 우선", substring = true).assertIsDisplayed()
    }

    @Test
    fun doesNotReplicateStageThresholdConstants() {
        // 근거 문구는 임계 상수(70/60/50/40)를 복제하지 않는다(규칙 10·문구만).
        setCard(sources = listOf("논가뭄지도"), stale = false)
        listOf("70", "60", "50", "40").forEach { n ->
            composeTestRule.onAllNodesWithText(n, substring = true).assertCountEquals(0)
        }
    }

    @Test
    fun rendersMergedDedupedSourceChips() {
        val merged = mergeSources(
            statusSources = listOf("논가뭄지도", "저수지 관측"),
            forecastSources = listOf("저수지 관측", "평년 통계"),
        )
        setCard(sources = merged, stale = false)
        composeTestRule.onNodeWithText("논가뭄지도").assertIsDisplayed()
        composeTestRule.onNodeWithText("평년 통계").assertIsDisplayed()
        // 중복된 "저수지 관측"은 칩으로 한 번만 렌더된다.
        composeTestRule.onAllNodesWithText("저수지 관측").assertCountEquals(1)
    }

    @Test
    fun showsDelayNoteOnlyWhenStale() {
        setCard(sources = listOf("논가뭄지도"), stale = true)
        composeTestRule.onNodeWithText("지연되어", substring = true).assertIsDisplayed()
    }

    @Test
    fun hidesDelayNoteWhenFresh() {
        setCard(sources = listOf("논가뭄지도"), stale = false)
        composeTestRule.onAllNodesWithText("지연되어", substring = true).assertCountEquals(0)
    }
}
