package com.mulsigye.app.feature.region.presentation

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.testing.RobolectricComposeTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
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
        onToggleManageMode: () -> Unit = {},
        onToggleSelection: (String) -> Unit = {},
        onDeleteSelected: () -> Unit = {},
        onNavigateAdd: () -> Unit = {},
        onNavigateNotifications: () -> Unit = {},
        onStart: () -> Unit = {},
    ) {
        composeTestRule.setContent {
            MulsigyeTheme {
                RegionListScreen(
                    state = state,
                    onSelectRegion = onSelectRegion,
                    onRemoveRegion = onRemoveRegion,
                    onMoveRegion = onMoveRegion,
                    onToggleManageMode = onToggleManageMode,
                    onToggleSelection = onToggleSelection,
                    onDeleteSelected = onDeleteSelected,
                    onNavigateAdd = onNavigateAdd,
                    onNavigateNotifications = onNavigateNotifications,
                    onStart = onStart,
                )
            }
        }
    }

    private fun twoRegions(manageMode: Boolean = false, selected: Set<String> = emptySet()) =
        RegionListUiState(
            loading = false,
            items = listOf(ready("46170", "나주시", "나주호"), ready("44230", "논산시", "탑정")),
            currentIndex = 0,
            manageMode = manageMode,
            selected = selected,
        )

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
        setContent(twoRegions())
        composeTestRule.onNodeWithText("기본 주소지").assertIsDisplayed()
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
        composeTestRule.onNodeWithText("시작하기").assertIsDisplayed()
    }

    // ── 관리 모드 ────────────────────────────────────────────────────────────────

    @Test
    fun manageToggleEntersManageMode() {
        var toggled = false
        setContent(twoRegions(), onToggleManageMode = { toggled = true })
        // 일반 모드에서는 "지역 관리" 시작 버튼이 보인다(길게 누르기의 접근성 대체 수단).
        composeTestRule.onNodeWithContentDescription("지역 관리 시작").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("지역 관리 시작").performClick()
        composeTestRule.runOnIdle { assertTrue(toggled) }
    }

    @Test
    fun normalModeHasNoArrowMoveButtons() {
        // 옛 ▲/▼ 이동 버튼은 사라졌다 — 순서 변경은 관리 모드 드래그로만 한다.
        setContent(twoRegions())
        composeTestRule.onAllNodesWithContentDescription("나주시 나주호 저수지 위로 이동").assertCountEquals(0)
        composeTestRule.onAllNodesWithContentDescription("나주시 나주호 저수지 아래로 이동").assertCountEquals(0)
    }

    @Test
    fun manageModeShowsDoneAndDragHandlesAndHidesCta() {
        setContent(twoRegions(manageMode = true))
        // 헤더가 "지역 관리"로 바뀌고 "완료"로 나갈 수 있다.
        composeTestRule.onNodeWithText("지역 관리").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("지역 관리 완료").assertIsDisplayed()
        // 각 줄에 드래그 손잡이가 보인다.
        composeTestRule.onNodeWithContentDescription("나주시 나주호 저수지 순서 이동 손잡이").assertIsDisplayed()
        // 관리 모드에서는 시작 CTA를 감춘다(정리에 집중).
        composeTestRule.onAllNodesWithText("시작하기").assertCountEquals(0)
    }

    @Test
    fun tappingRowInManageModeTogglesSelection() {
        var toggled: String? = null
        setContent(twoRegions(manageMode = true), onToggleSelection = { toggled = it })
        composeTestRule.onNodeWithContentDescription("나주시 나주호 저수지").performClick()
        composeTestRule.runOnIdle { assertEquals("46170", toggled) }
    }

    @Test
    fun deleteSelectedConfirmThenInvokesCallback() {
        var deleted = false
        setContent(
            twoRegions(manageMode = true, selected = setOf("46170")),
            onDeleteSelected = { deleted = true },
        )
        // 선택 개수가 삭제 버튼에 표기된다.
        composeTestRule.onNodeWithText("선택 삭제 (1)").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("선택한 지역 삭제").performClick()
        // 확인 다이얼로그 → 삭제.
        composeTestRule.onNodeWithText("1곳을 지울까요?").assertIsDisplayed()
        composeTestRule.onNodeWithText("삭제").performClick()
        composeTestRule.runOnIdle { assertTrue(deleted) }
    }
}
