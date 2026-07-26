package com.mulsigye.app.feature.region.presentation

import com.mulsigye.app.core.storage.RegionStore
import com.mulsigye.app.core.testing.InMemoryPreferencesDataStore
import com.mulsigye.app.feature.region.FakeRegionRepository
import com.mulsigye.app.feature.region.domain.RegionCandidate
import com.mulsigye.app.feature.region.domain.RegionResolveResult
import com.mulsigye.app.feature.region.domain.RegionSearchResult
import com.mulsigye.app.feature.region.domain.RepresentativeReservoir
import com.mulsigye.app.feature.region.domain.ReservoirHit
import com.mulsigye.app.feature.region.domain.ReservoirSearchResult
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
        vm.register(setAsPrimary = true) { done = true }
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
        vm.register(setAsPrimary = true) { done = true }
        advanceUntilIdle()

        assertTrue(done)
        val regions = storeInstance.regionStoreFlow.first().regions
        assertEquals(1, regions.size)
        assertEquals("46170", regions[0].sigunCode)
        assertEquals("4617010001", regions[0].facCode)
    }

    @Test
    fun uncheckedPrimaryKeepsPreviousDefaultRegion() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = FakeRegionRepository().apply {
            enqueueResolve(
                resolveSuccess(
                    prepared = true,
                    reservoir = RepresentativeReservoir(facCode = "4617010001", name = "나주호"),
                    sigunCode = "46170",
                    sigunName = "나주시",
                ),
                resolveSuccess(
                    prepared = true,
                    reservoir = RepresentativeReservoir(facCode = "1111010001", name = "다른저수지"),
                    sigunCode = "11110",
                    sigunName = "종로구",
                ),
            )
        }
        val storeInstance = store()
        val vm = RegionAddViewModel(repo, storeInstance, dispatcher, debounceMillis = 0)

        // 첫 등록 — 기본 주소지로 설정(대표가 된다).
        vm.onCandidateSelect(candidate)
        advanceUntilIdle()
        vm.register(setAsPrimary = true) {}
        advanceUntilIdle()

        // 둘째 등록에서 "기본 주소지로 설정"을 끄면 기본 주소지(맨 위)는 첫 지역(46170)에 남는다.
        vm.onCandidateSelect(candidate)
        advanceUntilIdle()
        vm.register(setAsPrimary = false) {}
        advanceUntilIdle()

        val state = storeInstance.regionStoreFlow.first()
        assertEquals(2, state.regions.size)
        // 기본 주소지는 목록 맨 위(index 0)다 — 체크를 끄면 순서를 건드리지 않는다.
        assertEquals("46170", state.regions[0].sigunCode)
    }

    @Test
    fun checkedPrimaryMovesNewRegionToTop() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = FakeRegionRepository().apply {
            enqueueResolve(
                resolveSuccess(
                    prepared = true,
                    reservoir = RepresentativeReservoir(facCode = "4617010001", name = "나주호"),
                    sigunCode = "46170",
                    sigunName = "나주시",
                ),
                resolveSuccess(
                    prepared = true,
                    reservoir = RepresentativeReservoir(facCode = "1111010001", name = "다른저수지"),
                    sigunCode = "11110",
                    sigunName = "종로구",
                ),
            )
        }
        val storeInstance = store()
        val vm = RegionAddViewModel(repo, storeInstance, dispatcher, debounceMillis = 0)

        vm.onCandidateSelect(candidate)
        advanceUntilIdle()
        vm.register(setAsPrimary = true) {}
        advanceUntilIdle()

        // 두 번째 지역을 "기본 주소지로 설정"으로 등록하면 맨 위로 올라와야 한다.
        vm.onCandidateSelect(candidate)
        advanceUntilIdle()
        vm.register(setAsPrimary = true) {}
        advanceUntilIdle()

        val state = storeInstance.regionStoreFlow.first()
        assertEquals(2, state.regions.size)
        assertEquals("11110", state.regions[0].sigunCode)
        assertEquals(0, state.currentIndex)
    }

    // 넓은 시군에서 늘 같은 저수지가 뽑히던 문제(제주시 → 상대 고정)를 막는 경로.
    @Test
    fun passesEmdAndLiToResolveSoRepresentativeIsNarrowed() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val jeju = RegionCandidate(
            label = "제주특별자치도 제주시 조천읍 일주동로 1282",
            admCd = "5011025924",
            legalCode = "5011025924",
            emdNm = "조천읍",
            liNm = "함덕리",
        )
        val repo = FakeRegionRepository().apply {
            searchDefault = searchSuccess(jeju)
            resolveDefault = resolveSuccess(
                prepared = true,
                reservoir = RepresentativeReservoir(facCode = "5011010007", name = "함덕"),
                sigunCode = "50110",
                sigunName = "제주시",
            )
        }
        val vm = RegionAddViewModel(repo, store(), dispatcher, debounceMillis = 0)

        vm.onQueryChange("일주동로 1282")
        advanceUntilIdle()
        vm.onCandidateSelect(jeju)
        advanceUntilIdle()

        assertEquals("조천읍", repo.lastResolveEmdNm)
        assertEquals("함덕리", repo.lastResolveLiNm)
    }

    @Test
    fun registersByReservoirNameWithoutResolve() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = FakeRegionRepository().apply {
            reservoirDefault = ReservoirSearchResult.Success(
                reservoirs = listOf(
                    ReservoirHit(
                        facCode = "5011010007",
                        name = "함덕",
                        address = "제주특별자치도 제주시 조천읍 함덕리",
                        sigunCode = "50110",
                        sigunName = "제주시",
                        prepared = true,
                    ),
                ),
            )
        }
        val storeInstance = store()
        val vm = RegionAddViewModel(repo, storeInstance, dispatcher, debounceMillis = 0)

        vm.onReservoirQueryChange("함덕")
        advanceUntilIdle()
        val phase = vm.uiState.value.reservoirSearch
        assertTrue(phase is ReservoirPhase.Ready)
        val hit = (phase as ReservoirPhase.Ready).hits.first()

        vm.onReservoirSelect(hit)
        assertEquals("함덕", vm.uiState.value.selectedReservoir?.name)

        var registered = false
        vm.registerReservoir(setAsPrimary = true) { registered = true }
        advanceUntilIdle()

        assertTrue(registered)
        // 주소 경로와 달리 resolve를 부르지 않는다 — 검색 결과에 코드가 이미 있다.
        assertEquals(0, repo.resolveCount)
        val regions = storeInstance.regionStoreFlow.first().regions
        assertEquals("50110", regions.first().sigunCode)
        assertEquals("5011010007", regions.first().facCode)
    }

    @Test
    fun unpreparedReservoirCannotBeSelected() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = FakeRegionRepository().apply {
            reservoirDefault = ReservoirSearchResult.Success(
                reservoirs = listOf(
                    ReservoirHit(
                        facCode = "4971010001",
                        name = "광령",
                        address = "제주특별자치도 제주시 애월읍 광령리",
                        sigunCode = "49710",
                        sigunName = null,
                        prepared = false,
                    ),
                ),
            )
        }
        val vm = RegionAddViewModel(repo, store(), dispatcher, debounceMillis = 0)

        vm.onReservoirQueryChange("광령")
        advanceUntilIdle()
        val hit = (vm.uiState.value.reservoirSearch as ReservoirPhase.Ready).hits.first()

        vm.onReservoirSelect(hit)
        // 선택이 무시돼 확인 시트가 열리지 않는다(목록에서 감추지는 않는다).
        assertEquals(null, vm.uiState.value.selectedReservoir)
    }
}
