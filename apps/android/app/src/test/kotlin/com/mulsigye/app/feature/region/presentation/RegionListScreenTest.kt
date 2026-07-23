package com.mulsigye.app.feature.region.presentation

import androidx.compose.ui.test.assertIsDisplayed
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

    @Test
    fun showsEmptyStateCopy() {
        composeTestRule.setContent {
            MulsigyeTheme {
                RegionListScreen(
                    state = RegionListUiState(loading = false, items = emptyList(), currentIndex = 0),
                    onSelectRegion = {},
                    onRemoveRegion = {},
                    onNavigateAdd = {},
                    onStart = {},
                )
            }
        }

        composeTestRule.onNodeWithText("아직 등록한 지역이 없어요.").assertIsDisplayed()
    }

    @Test
    fun deleteButtonUsesRegionNameContentDescription() {
        var removed: String? = null
        composeTestRule.setContent {
            MulsigyeTheme {
                RegionListScreen(
                    state = RegionListUiState(
                        loading = false,
                        items = listOf(
                            RegionListItem(
                                sigunCode = "46170",
                                name = RegionNameState.Ready(sigunName = "나주시", reservoirName = "나주호"),
                            ),
                        ),
                        currentIndex = 0,
                    ),
                    onSelectRegion = {},
                    onRemoveRegion = { removed = it },
                    onNavigateAdd = {},
                    onStart = {},
                )
            }
        }

        composeTestRule.onNodeWithContentDescription("나주시 삭제").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("나주시 삭제").performClick()
        composeTestRule.runOnIdle { assertEquals("46170", removed) }
    }

    @Test
    fun showsStartCtaWhenRegionsExist() {
        composeTestRule.setContent {
            MulsigyeTheme {
                RegionListScreen(
                    state = RegionListUiState(
                        loading = false,
                        items = listOf(
                            RegionListItem(
                                sigunCode = "46170",
                                name = RegionNameState.Ready(sigunName = "나주시", reservoirName = "나주호"),
                            ),
                        ),
                        currentIndex = 0,
                    ),
                    onSelectRegion = {},
                    onRemoveRegion = {},
                    onNavigateAdd = {},
                    onStart = {},
                )
            }
        }

        composeTestRule.onNodeWithText("물시계 시작하기").assertIsDisplayed()
    }
}
