package com.mulsigye.app.feature.region.presentation

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.testing.RobolectricComposeTest
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class RegionListScreenTest : RobolectricComposeTest() {
    @get:Rule
    val composeTestRule = createComposeRule()

    private fun ready(sigunCode: String, sigun: String, reservoir: String) =
        RegionListItem(sigunCode = sigunCode, name = RegionNameState.Ready(sigun, reservoir))

    private fun setContent(
        state: RegionListUiState,
        onSelectRegion: (Int) -> Unit = {},
        onRemoveRegion: (String) -> Unit = {},
        onMoveRegion: (Int, Int) -> Unit = { _, _ -> },
        onNavigateAdd: () -> Unit = {},
        onStart: () -> Unit = {},
    ) {
        composeTestRule.setContent {
            MulsigyeTheme {
                RegionListScreen(
                    state = state,
                    onSelectRegion = onSelectRegion,
                    onRemoveRegion = onRemoveRegion,
                    onMoveRegion = onMoveRegion,
                    onNavigateAdd = onNavigateAdd,
                    onStart = onStart,
                )
            }
        }
    }

    @Test
    fun showsEmptyStateCopy() {
        setContent(RegionListUiState(loading = false, items = emptyList(), currentIndex = 0))
        composeTestRule.onNodeWithText("아직 등록한 지역이 없어요.").assertIsDisplayed()
    }

    @Test
    fun rowShowsSigunPlusReservoirTitle() {
        setContent(
            RegionListUiState(
                loading = false,
                items = listOf(ready("46170", "경산시", "문천")),
                currentIndex = 0,
            ),
        )
        composeTestRule.onNodeWithText("경산시 문천 저수지").assertIsDisplayed()
    }

    @Test
    fun rowDoesNotDoubleReservoirSuffix() {
        setContent(
            RegionListUiState(
                loading = false,
                items = listOf(ready("44230", "논산시", "탑정저수지")),
                currentIndex = 0,
            ),
        )
        // 이미 "저수지"로 끝나므로 "논산시 탑정저수지" 그대로.
        composeTestRule.onNodeWithText("논산시 탑정저수지").assertIsDisplayed()
    }

    @Test
    fun deleteButtonUsesRegionTitleContentDescription() {
        var removed: String? = null
        setContent(
            RegionListUiState(
                loading = false,
                items = listOf(ready("46170", "나주시", "나주호")),
                currentIndex = 0,
            ),
            onRemoveRegion = { removed = it },
        )

        composeTestRule.onNodeWithContentDescription("나주시 나주호 저수지 삭제").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("나주시 나주호 저수지 삭제").performClick()
        composeTestRule.runOnIdle { assertEquals("46170", removed) }
    }

    @Test
    fun primaryBadgeShownOnFirstRowOnly() {
        setContent(
            RegionListUiState(
                loading = false,
                items = listOf(ready("46170", "나주시", "나주호"), ready("44230", "논산시", "탑정")),
                currentIndex = 0,
            ),
        )
        composeTestRule.onNodeWithText("대표").assertIsDisplayed()
    }

    @Test
    fun moveButtonsDisabledAtEnds() {
        setContent(
            RegionListUiState(
                loading = false,
                items = listOf(ready("46170", "나주시", "나주호"), ready("44230", "논산시", "탑정")),
                currentIndex = 0,
            ),
        )
        // 첫 행: 위로 비활성, 아래로 활성.
        composeTestRule.onNodeWithContentDescription("나주시 나주호 저수지 위로 이동").assertIsNotEnabled()
        composeTestRule.onNodeWithContentDescription("나주시 나주호 저수지 아래로 이동").assertIsEnabled()
        // 마지막 행: 위로 활성, 아래로 비활성.
        composeTestRule.onNodeWithContentDescription("논산시 탑정 저수지 위로 이동").assertIsEnabled()
        composeTestRule.onNodeWithContentDescription("논산시 탑정 저수지 아래로 이동").assertIsNotEnabled()
    }

    @Test
    fun moveDownInvokesCallbackWithIndices() {
        var from = -1
        var to = -1
        setContent(
            RegionListUiState(
                loading = false,
                items = listOf(ready("46170", "나주시", "나주호"), ready("44230", "논산시", "탑정")),
                currentIndex = 0,
            ),
            onMoveRegion = { f, t -> from = f; to = t },
        )
        composeTestRule.onNodeWithContentDescription("나주시 나주호 저수지 아래로 이동").performClick()
        composeTestRule.runOnIdle {
            assertEquals(0, from)
            assertEquals(1, to)
        }
    }

    @Test
    fun showsStartCtaWhenRegionsExist() {
        setContent(
            RegionListUiState(
                loading = false,
                items = listOf(ready("46170", "나주시", "나주호")),
                currentIndex = 0,
            ),
        )
        composeTestRule.onNodeWithText("수신호 시작하기").assertIsDisplayed()
    }
}
