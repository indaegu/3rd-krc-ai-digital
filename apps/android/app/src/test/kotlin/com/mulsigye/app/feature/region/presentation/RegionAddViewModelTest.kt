package com.mulsigye.app.feature.region.presentation

import com.mulsigye.app.core.storage.RegionStore
import com.mulsigye.app.core.testing.InMemoryPreferencesDataStore
import com.mulsigye.app.feature.region.FakeRegionRepository
import com.mulsigye.app.feature.region.domain.RegionCandidate
import com.mulsigye.app.feature.region.domain.RegionResolveResult
import com.mulsigye.app.feature.region.domain.RegionSearchResult
import com.mulsigye.app.feature.region.domain.RepresentativeReservoir
import java.time.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RegionAddViewModelTest {
    private val mainDispatcher = StandardTestDispatcher()

    private val candidate = RegionCandidate(
        label = "전라남도 나주시 시청길 22",
        admCd = "4617010100",
        legalCode = "4617010100",
    )

    @Before
    fun setUp() {
        Dispatchers.setMain(mainDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun store() = RegionStore(InMemoryPreferencesDataStore())

    private fun searchSuccess(vararg candidates: RegionCandidate) = RegionSearchResult.Success(
        candidates = candidates.toList(),
        asOf = Instant.parse("2026-07-23T00:00:00Z"),
        sources = emptyList(),
        stale = false,
    )

    private fun resolveSuccess(
        prepared: Boolean,
        reservoir: RepresentativeReservoir? = null,
        sigunCode: String? = null,
        sigunName: String? = null,
    ) = RegionResolveResult.Success(
        sigunCode = sigunCode,
        sigunName = sigunName,
        prepared = prepared,
        reservoir = reservoir,
        asOf = Instant.parse("2026-07-23T00:00:00Z"),
        sources = emptyList(),
        stale = false,
    )

    @Test
    fun debounceCollapsesRapidInputToSingleSearch() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = FakeRegionRepository().apply { searchDefault = searchSuccess(candidate) }
        val vm = RegionAddViewModel(repo, store(), dispatcher, debounceMillis = 300)

        vm.onQueryChange("나주")
        advanceTimeBy(100)
        runCurrent()
        assertEquals(0, repo.searchCount)

        vm.onQueryChange("나주시") // 디바운스 타이머 재시작
        advanceTimeBy(100)
        runCurrent()
        assertEquals(0, repo.searchCount)

        advanceTimeBy(300)
        advanceUntilIdle()
        assertEquals(1, repo.searchCount)
        assertEquals("나주시", repo.lastSearchQuery)
    }

    @Test
    fun searchRegionsPopulatesCandidates() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = FakeRegionRepository().apply { searchDefault = searchSuccess(candidate) }
        val vm = RegionAddViewModel(repo, store(), dispatcher, debounceMillis = 0)

        vm.onQueryChange("나주시")
        advanceUntilIdle()

        val phase = vm.uiState.value.search
        assertTrue(phase is SearchPhase.Ready)
        assertEquals(listOf(candidate), (phase as SearchPhase.Ready).candidates)
    }

    @Test
    fun tooShortQueryDoesNotSearch() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = FakeRegionRepository().apply { searchDefault = searchSuccess(candidate) }
        val vm = RegionAddViewModel(repo, store(), dispatcher, debounceMillis = 0)

        vm.onQueryChange("나")
        advanceUntilIdle()

        assertEquals(0, repo.searchCount)
        assertTrue(vm.uiState.value.search is SearchPhase.Idle)
    }

    @Test
    fun resolveRegionShowsConfirmation() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = FakeRegionRepository().apply {
            resolveDefault = resolveSuccess(
                prepared = true,
                reservoir = RepresentativeReservoir(facCode = "4617010001", name = "나주호"),
                sigunCode = "46170",
                sigunName = "나주시",
            )
        }
        val vm = RegionAddViewModel(repo, store(), dispatcher, debounceMillis = 0)

        vm.onCandidateSelect(candidate)
        advanceUntilIdle()

        val phase = vm.uiState.value.resolve
        assertTrue(phase is ResolvePhase.Ready)
        val data = (phase as ResolvePhase.Ready).data
        assertTrue(data.prepared)
        assertEquals("나주호", data.reservoir?.name)
        assertEquals(candidate, vm.uiState.value.selected)
    }

    @Test
    fun notReadyRegionBlocksRegistration() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = FakeRegionRepository().apply {
            resolveDefault = resolveSuccess(prepared = false)
        }
        val storeInstance = store()
        val vm = RegionAddViewModel(repo, storeInstance, dispatcher, debounceMillis = 0)

        vm.onCandidateSelect(candidate)
        advanceUntilIdle()

        val phase = vm.uiState.value.resolve
        assertTrue(phase is ResolvePhase.Ready)
        assertFalse((phase as ResolvePhase.Ready).data.prepared)

        var done = false
        vm.register { done = true }
        advanceUntilIdle()

        assertFalse(done)
        assertTrue(storeInstance.regionStoreFlow.first().regions.isEmpty())
    }

    @Test
    fun retryAfter503RecoversResolution() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = FakeRegionRepository().apply {
            enqueueResolve(
                RegionResolveResult.Failure(
                    code = "SERVICE_UNAVAILABLE",
                    message = "잠시 후 다시 시도해 주세요.",
                    retryable = true,
                ),
                resolveSuccess(
                    prepared = true,
                    reservoir = RepresentativeReservoir(facCode = "4617010001", name = "나주호"),
                    sigunCode = "46170",
                    sigunName = "나주시",
                ),
            )
        }
        val vm = RegionAddViewModel(repo, store(), dispatcher, debounceMillis = 0)

        vm.onCandidateSelect(candidate)
        advanceUntilIdle()
        assertTrue(vm.uiState.value.resolve is ResolvePhase.Error)

        vm.retryResolve()
        advanceUntilIdle()
        assertTrue(vm.uiState.value.resolve is ResolvePhase.Ready)
        assertEquals(2, repo.resolveCount)
    }

    @Test
    fun registerStoresOnlyCodesAndInvokesCallback() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = FakeRegionRepository().apply {
            resolveDefault = resolveSuccess(
                prepared = true,
                reservoir = RepresentativeReservoir(facCode = "4617010001", name = "나주호"),
                sigunCode = "46170",
                sigunName = "나주시",
            )
        }
        val storeInstance = store()
        val vm = RegionAddViewModel(repo, storeInstance, dispatcher, debounceMillis = 0)

        vm.onCandidateSelect(candidate)
        advanceUntilIdle()

        var done = false
        vm.register { done = true }
        advanceUntilIdle()

        assertTrue(done)
        val regions = storeInstance.regionStoreFlow.first().regions
        assertEquals(1, regions.size)
        assertEquals("46170", regions[0].sigunCode)
        assertEquals("4617010001", regions[0].facCode)
    }
}
