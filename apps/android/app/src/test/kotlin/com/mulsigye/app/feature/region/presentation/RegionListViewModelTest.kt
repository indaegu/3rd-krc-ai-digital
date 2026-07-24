package com.mulsigye.app.feature.region.presentation

import com.mulsigye.app.core.storage.RegionStore
import com.mulsigye.app.core.storage.StoredRegion
import com.mulsigye.app.core.testing.InMemoryPreferencesDataStore
import com.mulsigye.app.feature.region.FakeStatusRepository
import com.mulsigye.app.feature.status.domain.DroughtStage
import com.mulsigye.app.feature.status.domain.RegionStatus
import com.mulsigye.app.feature.status.domain.ReservoirStatus
import com.mulsigye.app.feature.status.domain.StatusResult
import java.time.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RegionListViewModelTest {
    private val mainDispatcher = StandardTestDispatcher()

    private val naju = StoredRegion(sigunCode = "46170", facCode = "4617010001")
    private val nonsan = StoredRegion(sigunCode = "44230", facCode = "4423010045")

    @Before
    fun setUp() {
        Dispatchers.setMain(mainDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun store() = RegionStore(InMemoryPreferencesDataStore())

    private fun statusSuccess(sigunCode: String, sigunName: String, reservoirName: String) =
        StatusResult.Success(
            sigunCode = sigunCode,
            sigunName = sigunName,
            reservoir = ReservoirStatus(
                facCode = "$sigunCode-fac",
                name = reservoirName,
                rate = 80.0,
                waterLevel = null,
                observedOn = null,
            ),
            region = RegionStatus(
                observedOn = "2026-07-23",
                regionalRate = null,
                normalRate = null,
                avgRatio = 100.0,
                officialStage = DroughtStage(code = "ok", label = "정상"),
            ),
            highWaterNotice = false,
            asOf = Instant.parse("2026-07-23T00:00:00Z"),
            sources = emptyList(),
            stale = false,
        )

    @Test
    fun emptyStoreYieldsEmptyList() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val statusRepo = FakeStatusRepository()
        val vm = RegionListViewModel(store(), statusRepo, dispatcher)

        advanceUntilIdle()

        assertTrue(vm.uiState.value.items.isEmpty())
        assertEquals(0, statusRepo.loadCount)
    }

    @Test
    fun loadsRegionNamesViaStatus() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val storeInstance = store()
        storeInstance.addRegion(naju)
        val statusRepo = FakeStatusRepository().apply {
            put("46170", statusSuccess("46170", "나주시", "나주호"))
        }
        val vm = RegionListViewModel(storeInstance, statusRepo, dispatcher)

        advanceUntilIdle()

        val item = vm.uiState.value.items.single()
        assertEquals("46170", item.sigunCode)
        val name = item.name
        assertTrue(name is RegionNameState.Ready)
        assertEquals("나주시", (name as RegionNameState.Ready).sigunName)
        assertEquals("나주호", name.reservoirName)
    }

    @Test
    fun selectSwitchesCurrentIndex() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val storeInstance = store()
        storeInstance.addRegion(nonsan)
        storeInstance.addRegion(naju) // 최신 선택 → index 1
        val statusRepo = FakeStatusRepository().apply { default = statusSuccess("x", "x", "x") }
        val vm = RegionListViewModel(storeInstance, statusRepo, dispatcher)
        advanceUntilIdle()
        assertEquals(1, vm.uiState.value.currentIndex)

        vm.select(0)
        advanceUntilIdle()

        assertEquals(0, vm.uiState.value.currentIndex)
    }

    @Test
    fun removeDropsRegion() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val storeInstance = store()
        storeInstance.addRegion(nonsan)
        storeInstance.addRegion(naju)
        val statusRepo = FakeStatusRepository().apply { default = statusSuccess("x", "x", "x") }
        val vm = RegionListViewModel(storeInstance, statusRepo, dispatcher)
        advanceUntilIdle()

        vm.remove("44230")
        advanceUntilIdle()

        assertEquals(listOf("46170"), vm.uiState.value.items.map { it.sigunCode })
    }

    @Test
    fun removingCurrentRegionClampsIndex() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val storeInstance = store()
        storeInstance.addRegion(nonsan)
        storeInstance.addRegion(naju) // current = 1
        val statusRepo = FakeStatusRepository().apply { default = statusSuccess("x", "x", "x") }
        val vm = RegionListViewModel(storeInstance, statusRepo, dispatcher)
        advanceUntilIdle()

        vm.remove("46170") // 현재 선택된 마지막 항목 삭제
        advanceUntilIdle()

        assertEquals(1, vm.uiState.value.items.size)
        assertEquals(0, vm.uiState.value.currentIndex)
    }
}
