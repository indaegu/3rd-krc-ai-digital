package com.mulsigye.app.feature.nearby.presentation

import com.mulsigye.app.feature.nearby.domain.NearbyRegion
import com.mulsigye.app.feature.nearby.domain.NearbyRepository
import com.mulsigye.app.feature.nearby.domain.NearbyResult
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

// viewModelScope는 Dispatchers.Main.immediate를 쓰므로 Main을 테스트 디스패처로 바꾼다.
@OptIn(ExperimentalCoroutinesApi::class)
class NearbyViewModelTest {
    private val mainDispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(mainDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun success() = NearbyResult.Success(
        sidoName = "충남",
        asOf = "2025-12-31",
        regions = listOf(
            NearbyRegion("44270", "당진시", 71.9, "ok", current = false),
            NearbyRegion("44230", "논산시", 112.7, "ok", current = true),
        ),
        stale = true,
        sources = listOf("커밋 스냅샷(기준 2025-12-31)"),
    )

    @Test
    fun movesFromLoadingToReady() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = QueueNearbyRepository(mutableListOf(success()))

        val vm = NearbyViewModel(repo, "44230", dispatcher)
        assertTrue(vm.uiState.value is NearbyUiState.Loading)

        advanceUntilIdle()

        val state = vm.uiState.value
        assertTrue(state is NearbyUiState.Ready)
        assertEquals("충남", (state as NearbyUiState.Ready).data.sidoName)
    }

    @Test
    fun surfacesFailureAsError() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = QueueNearbyRepository(
            mutableListOf(
                NearbyResult.Failure(
                    code = "NEARBY_UNAVAILABLE",
                    message = "잠시 후 다시 시도해요.",
                    retryable = true,
                ),
            ),
        )

        val vm = NearbyViewModel(repo, "44230", dispatcher)
        advanceUntilIdle()

        assertEquals(
            NearbyUiState.Error(message = "잠시 후 다시 시도해요.", retryable = true),
            vm.uiState.value,
        )
    }

    @Test
    fun refreshIsIgnoredWhileLoading() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val repo = QueueNearbyRepository(mutableListOf(success(), success(), success()))

        val vm = NearbyViewModel(repo, "44230", dispatcher)

        vm.refresh()
        advanceUntilIdle()
        assertEquals(1, repo.callCount)

        vm.refresh()
        vm.refresh()
        advanceUntilIdle()
        assertEquals(2, repo.callCount)
    }
}

private class QueueNearbyRepository(
    private val results: MutableList<NearbyResult>,
) : NearbyRepository {
    var callCount = 0
        private set

    override suspend fun load(sigunCode: String): NearbyResult {
        callCount += 1
        return results.removeAt(0)
    }
}
