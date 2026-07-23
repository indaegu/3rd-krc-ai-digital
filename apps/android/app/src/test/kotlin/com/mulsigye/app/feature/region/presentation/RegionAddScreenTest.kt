package com.mulsigye.app.feature.region.presentation

import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import com.mulsigye.app.core.designsystem.theme.MulsigyeTheme
import com.mulsigye.app.core.storage.RegionStore
import com.mulsigye.app.core.testing.InMemoryPreferencesDataStore
import com.mulsigye.app.core.testing.RobolectricComposeTest
import com.mulsigye.app.feature.region.FakeRegionRepository
import com.mulsigye.app.feature.region.domain.RegionCandidate
import com.mulsigye.app.feature.region.domain.RegionResolveResult
import com.mulsigye.app.feature.region.domain.RegionSearchResult
import com.mulsigye.app.feature.region.domain.RepresentativeReservoir
import java.time.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class RegionAddScreenTest : RobolectricComposeTest() {
    @get:Rule
    val composeTestRule = createComposeRule()

    private val candidate = RegionCandidate(
        label = "전라남도 나주시 시청길 22",
        admCd = "4617010100",
        legalCode = "4617010100",
    )

    @Test
    fun searchThenConfirmThenRegisterStoresOnlyCodes() {
        val dataStore: DataStore<Preferences> = InMemoryPreferencesDataStore()
        val store = RegionStore(dataStore)
        val repo = FakeRegionRepository().apply {
            searchDefault = RegionSearchResult.Success(
                candidates = listOf(candidate),
                asOf = Instant.parse("2026-07-23T00:00:00Z"),
                sources = emptyList(),
                stale = false,
            )
            resolveDefault = RegionResolveResult.Success(
                sigunCode = "46170",
                sigunName = "나주시",
                prepared = true,
                reservoir = RepresentativeReservoir(facCode = "4617010001", name = "나주호"),
                asOf = Instant.parse("2026-07-23T00:00:00Z"),
                sources = emptyList(),
                stale = false,
            )
        }
        val vm = RegionAddViewModel(repo, store, Dispatchers.Unconfined, debounceMillis = 0)
        var done = false

        composeTestRule.setContent {
            MulsigyeTheme {
                val state by vm.uiState.collectAsState()
                RegionAddScreen(
                    state = state,
                    onQueryChange = vm::onQueryChange,
                    onCandidateSelect = vm::onCandidateSelect,
                    onRetrySearch = vm::retrySearch,
                    onRetryResolve = vm::retryResolve,
                    onRegister = { vm.register { done = true } },
                    onBack = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("addressQueryField").performTextInput("나주시")
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText(candidate.label).performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("이 주소로 등록할까요?").assertIsDisplayed()
        composeTestRule.onNodeWithText("우리 지역 대표 저수지 · 나주호").assertIsDisplayed()

        composeTestRule.onNodeWithText("등록하기").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.runOnIdle { assertTrue(done) }

        val regions = runBlocking { store.regionStoreFlow.first().regions }
        assertEquals(1, regions.size)
        assertEquals("46170", regions[0].sigunCode)
        assertEquals("4617010001", regions[0].facCode)

        // 주소 원문·후보 라벨은 어떤 저장소에도 남지 않는다.
        val raw = runBlocking { dataStore.data.first()[RegionStore.KEY] } ?: ""
        assertTrue(raw.contains("46170"))
        assertTrue(raw.contains("4617010001"))
        assertFalse(raw.contains("시청길"))
        assertFalse(raw.contains("나주호"))
    }

    @Test
    fun showsEmptyResultCopy() {
        composeTestRule.setContent {
            MulsigyeTheme {
                RegionAddScreen(
                    state = RegionAddUiState(
                        query = "없는주소",
                        search = SearchPhase.Ready(candidates = emptyList()),
                    ),
                    onQueryChange = {},
                    onCandidateSelect = {},
                    onRetrySearch = {},
                    onRetryResolve = {},
                    onRegister = {},
                    onBack = {},
                )
            }
        }

        composeTestRule
            .onNodeWithText("검색 결과가 없어요. 도로명주소를 다시 확인해 주세요.")
            .assertIsDisplayed()
    }
}
